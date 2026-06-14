/**
 * EventSource-based streaming client for /api/run-demo/stream.
 *
 * Returns a stop() function to close the stream early.
 * The `completed` flag prevents spurious onerror toasts on normal stream end
 * and blocks EventSource auto-reconnect from re-triggering the demo.
 */

export interface StreamEvent {
  type: string;
  stage: string;
  data: Record<string, unknown>;
  session_id?: string;
  ts: number;
}

export interface StreamCallbacks {
  onEvent: (event: StreamEvent) => void;
  onDone: (result: Record<string, unknown>) => void;
  onError: (message: string) => void;
}

export function startStream(
  req: { raw_request: string; region: string; priority: string; request_id?: string },
  callbacks: StreamCallbacks,
): () => void {
  const params = new URLSearchParams({
    raw_request: req.raw_request,
    region: req.region,
    priority: req.priority,
  });
  if (req.request_id) params.set("request_id", req.request_id);

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const url = `${apiBase}/api/run-demo/stream?${params.toString()}`;

  let completed = false;
  const es = new EventSource(url);

  es.onmessage = (e: MessageEvent) => {
    let event: StreamEvent;
    try {
      event = JSON.parse(e.data as string) as StreamEvent;
    } catch {
      return;
    }

    if (event.type === "done") {
      completed = true;
      es.close();
      callbacks.onDone(event.data);
      return;
    }

    if (event.type === "error") {
      completed = true;
      es.close();
      const msg =
        (event.data as { message?: string }).message ?? "Stream error";
      callbacks.onError(msg);
      return;
    }

    callbacks.onEvent(event);
  };

  es.onerror = () => {
    if (completed) return; // normal close — ignore
    es.close();
    callbacks.onError("Stream connection lost. Is the backend running?");
  };

  return () => {
    completed = true;
    es.close();
  };
}
