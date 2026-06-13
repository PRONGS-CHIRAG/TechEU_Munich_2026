import type { BuyerRequest, HumanResponseDecision, StreamEvent } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Opens an SSE connection to `/api/run-demo/stream` and calls `onEvent` for
 * every event envelope. Returns a cleanup function that closes the stream.
 */
export function streamDemo(
  request: Omit<BuyerRequest, "request_id"> & { request_id?: string },
  onEvent: (event: StreamEvent) => void,
  onError?: (error: Event) => void,
): () => void {
  const params = new URLSearchParams({
    raw_request: request.raw_request,
    region: request.region,
    priority: request.priority,
  });
  if (request.request_id) {
    params.set("request_id", request.request_id);
  }

  const source = new EventSource(`${API_BASE}/api/run-demo/stream?${params.toString()}`);

  source.onmessage = (raw) => {
    if (!raw.data) return;
    try {
      const event = JSON.parse(raw.data) as StreamEvent;
      onEvent(event);
      if (event.type === "done" || event.type === "error") {
        source.close();
      }
    } catch {
      // ignore malformed event payloads
    }
  };

  source.onerror = (err) => {
    onError?.(err);
    source.close();
  };

  return () => source.close();
}

export async function sendHumanResponse(
  sessionId: string,
  decision: HumanResponseDecision,
  adjustedBudgetEur?: number,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/human-response`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      decision,
      adjusted_budget_eur: adjustedBudgetEur ?? null,
    }),
  });
  if (!res.ok) {
    throw new Error(`human-response failed: ${res.status} ${res.statusText}`);
  }
}
