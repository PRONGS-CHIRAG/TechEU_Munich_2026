"use client";

import { useEffect, useRef } from "react";
import { displayName } from "@/lib/api";
import type { ConversationLog } from "@/lib/types";

const PIONEER_COLORS: Record<string, string> = {
  price_concession: "text-blue-500",
  warranty_risk: "text-amber-500",
  risk_signal: "text-red-500",
};

interface Props {
  /** Conversation logs grouped by seller_id. Only groups with at least one entry are rendered. */
  chatsBySeller: Record<string, ConversationLog[]>;
  /** Lookup for display names when a group's logs don't carry seller_name. */
  sellerNames?: Record<string, string>;
  activeSeller?: string;
  onSelectSeller?: (sellerId: string) => void;
}

export function NegotiationChats({ chatsBySeller, sellerNames = {}, activeSeller, onSelectSeller }: Props) {
  const entries = Object.entries(chatsBySeller).filter(([, logs]) => logs.length > 0);

  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([sellerId, logs]) => {
        const name = logs.find((l) => l.seller_name)?.seller_name ?? sellerNames[sellerId] ?? sellerId;
        return (
          <ChatCard
            key={sellerId}
            sellerId={sellerId}
            sellerName={displayName(name)}
            logs={logs}
            active={sellerId === activeSeller}
            onSelect={onSelectSeller ? () => onSelectSeller(sellerId) : undefined}
          />
        );
      })}
    </div>
  );
}

function ChatCard({
  sellerId,
  sellerName,
  logs,
  active,
  onSelect,
}: {
  sellerId: string;
  sellerName: string;
  logs: ConversationLog[];
  active: boolean;
  onSelect?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <div
      onClick={onSelect}
      className={`flex flex-col overflow-hidden rounded-xl border bg-white transition-colors ${
        active ? "border-accent ring-1 ring-accent" : "border-border"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="truncate text-[12px] font-semibold text-text-1">{sellerName}</span>
        <span className="text-[10px] font-mono text-text-3">{sellerId}</span>
      </div>
      <div ref={scrollRef} className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto p-2.5">
        {logs.map((log, i) => (
          <div
            key={i}
            className={`flex flex-col ${log.speaker === "buyer" ? "items-start" : log.speaker === "seller" ? "items-end" : "items-center"}`}
          >
            {log.speaker === "system" ? (
              <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] text-text-3">
                {log.message}
              </span>
            ) : (
              <>
                <span
                  className={`max-w-[95%] rounded-2xl px-2.5 py-1.5 text-[11px] leading-snug ${
                    log.speaker === "buyer" ? "bg-accent text-white" : "bg-surface text-text-1"
                  }`}
                >
                  {log.message}
                </span>
                {log.speaker === "seller" && log.pioneer_labels?.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {log.pioneer_labels.slice(0, 2).map((l) => (
                      <span key={l} className={`font-mono text-[8px] ${PIONEER_COLORS[l] ?? "text-text-3"}`}>
                        [{l}]
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
