"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { HumanAction } from "@/lib/types";

export type FeedItem = {
  id: string;
  agent:
    | "orchestrator"
    | "buyer"
    | "seller"
    | "pioneer"
    | "tavily"
    | "validation"
    | "escalation"
    | "system"
    | "gemini"
    | "clustering"
    | "judging";
  title: string;
  detail?: string;
  vendor?: string;
  actionRequired?: boolean;
  sessionId?: string;
  resolvedAction?: string;
};

interface Props {
  items: FeedItem[];
  onHumanResponse?: (input: {
    sessionId: string;
    action: Exclude<HumanAction, "auto_continue">;
    note?: string;
  }) => void;
  respondingSessionId?: string | null;
}

export function ActivityFeed({ items, onHumanResponse, respondingSessionId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items.length]);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-text-3">
            Live Activity
          </div>
          <div className="mt-0.5 text-[14px] font-medium text-text-1">
            Agent feed
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 text-[11px] text-text-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              items.length > 0 ? "animate-pulse bg-emerald-500" : "bg-text-3"
            }`}
          />
          {items.length} events
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-3"
        style={{ maxHeight: 360 }}
      >
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <ol className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.32,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <FeedRow
                    item={item}
                    onHumanResponse={onHumanResponse}
                    responding={respondingSessionId === item.sessionId}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </section>
  );
}

function FeedRow({
  item,
  onHumanResponse,
  responding,
}: {
  item: FeedItem;
  onHumanResponse?: Props["onHumanResponse"];
  responding?: boolean;
}) {
  const meta = agentMeta[item.agent];
  const [note, setNote] = useState("");
  const canRespond = item.actionRequired && item.sessionId && onHumanResponse;

  const submit = (action: Exclude<HumanAction, "auto_continue">) => {
    if (!item.sessionId || !onHumanResponse) return;
    onHumanResponse({ sessionId: item.sessionId, action, note });
  };

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-2 py-1.5 transition-colors hover:border-border hover:bg-surface-2 ${
        canRespond ? "border-amber-200 bg-amber-50/60" : "border-transparent"
      }`}
    >
      <span
        className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[10px] font-semibold ${meta.bg} ${meta.fg}`}
      >
        {meta.glyph}
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[11px] font-semibold ${meta.fg}`}>
            {meta.label}
          </span>
          {item.vendor && (
            <span className="text-[10px] font-medium text-text-3">
              · {item.vendor}
            </span>
          )}
        </div>
        <div className="text-[12.5px] text-text-1">{item.title}</div>
        {item.detail && (
          <div className="mt-0.5 font-mono text-[11px] text-text-2">
            {item.detail}
          </div>
        )}
        {item.resolvedAction && (
          <div className="mt-1 inline-flex rounded-md bg-success-soft px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-success">
            {item.resolvedAction}
          </div>
        )}
        {canRespond && (
          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-amber-200 bg-white p-2">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={responding}
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-[11.5px] text-text-1 outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-surface-2"
              placeholder="Optional note or adjustment"
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={responding}
                onClick={() => submit("approve")}
                className="h-7 rounded-md bg-success px-2.5 text-[11px] font-semibold text-white disabled:bg-text-3"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={responding}
                onClick={() => submit("adjust")}
                className="h-7 rounded-md border border-amber-200 bg-warning-soft px-2.5 text-[11px] font-semibold text-warning disabled:text-text-3"
              >
                Adjust
              </button>
              <button
                type="button"
                disabled={responding}
                onClick={() => submit("reject")}
                className="h-7 rounded-md border border-border bg-surface px-2.5 text-[11px] font-medium text-text-1 disabled:text-text-3"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-1.5 text-center">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2">
        <span className="h-2 w-2 rounded-full bg-text-3" />
      </span>
      <div className="text-[12px] font-medium text-text-2">No activity yet</div>
      <div className="max-w-[220px] text-[11px] text-text-3">
        Submit a procurement request to watch the agents coordinate in real
        time.
      </div>
    </div>
  );
}

const agentMeta: Record<
  FeedItem["agent"],
  { label: string; glyph: string; bg: string; fg: string }
> = {
  orchestrator: {
    label: "Orchestrator",
    glyph: "◆",
    bg: "bg-accent-soft",
    fg: "text-accent",
  },
  buyer: {
    label: "Buyer Agent",
    glyph: "◇",
    bg: "bg-accent-soft",
    fg: "text-accent",
  },
  seller: {
    label: "Seller Agent",
    glyph: "α",
    bg: "bg-surface-2",
    fg: "text-text-2",
  },
  pioneer: {
    label: "Pioneer",
    glyph: "π",
    bg: "bg-pioneer-soft",
    fg: "text-pioneer",
  },
  tavily: {
    label: "Tavily",
    glyph: "T",
    bg: "bg-sky-50",
    fg: "text-info",
  },
  validation: {
    label: "Validator",
    glyph: "✓",
    bg: "bg-emerald-50",
    fg: "text-success",
  },
  escalation: {
    label: "Escalation",
    glyph: "!",
    bg: "bg-amber-50",
    fg: "text-warning",
  },
  system: {
    label: "System",
    glyph: "·",
    bg: "bg-surface-2",
    fg: "text-text-2",
  },
  gemini: {
    label: "Gemini",
    glyph: "G",
    bg: "bg-violet-50",
    fg: "text-violet-600",
  },
  clustering: {
    label: "Clustering",
    glyph: "⬡",
    bg: "bg-teal-50",
    fg: "text-teal-600",
  },
  judging: {
    label: "Judge",
    glyph: "⚖",
    bg: "bg-orange-50",
    fg: "text-orange-600",
  },
};
