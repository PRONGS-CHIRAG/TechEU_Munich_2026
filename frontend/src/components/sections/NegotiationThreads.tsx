"use client";

import { useMemo } from "react";
import { ChatCircle } from "@phosphor-icons/react";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { PioneerBadge, RiskPill } from "@/components/primitives/Badges";
import type { ConversationLog, MatchedSupplier } from "@/lib/types";

interface Props {
  logs: ConversationLog[];
  suppliers: MatchedSupplier[];
  activeSeller: string;
  onSelectSeller: (sellerId: string) => void;
}

export function NegotiationThreads({
  logs,
  suppliers,
  activeSeller,
  onSelectSeller,
}: Props) {
  const orderedSellers = useMemo(
    () => [...suppliers].sort((a, b) => b.match_score - a.match_score),
    [suppliers],
  );

  const activeLogs = logs.filter((l) => l.seller_id === activeSeller);
  const rounds = Math.max(...activeLogs.map((l) => l.round), 0);
  const maxRounds = Math.max(...logs.map((l) => l.round), 0);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <SectionHeader
        letter="E"
        title="Negotiation Threads"
        subtitle="Buyer Agent · Seller Agents"
        right={
          rounds > 0 && (
            <span className="font-mono text-[11px] text-text-3">
              Round {rounds} of {maxRounds}
            </span>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {orderedSellers.map((s) => {
          const isActive = s.seller_id === activeSeller;
          const hasLogs = logs.some((l) => l.seller_id === s.seller_id);
          return (
            <button
              key={s.seller_id}
              onClick={() => onSelectSeller(s.seller_id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                isActive
                  ? "border-accent bg-accent text-white shadow-sm"
                  : "border-border bg-surface text-text-2 hover:bg-surface-2"
              } ${!hasLogs ? "opacity-50" : ""}`}
            >
              <span className="font-mono text-[10px]">α</span>
              {s.seller_name}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        {activeLogs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-2 px-4 py-8 text-center">
            <ChatCircle className="h-7 w-7 text-text-3" weight="thin" />
            <p className="text-[12px] text-text-3">No messages exchanged yet</p>
            <p className="text-[11px] text-text-3">Negotiations appear here as they run.</p>
          </div>
        ) : (
          activeLogs.map((log, i) => <Bubble key={i} log={log} />)
        )}
      </div>
    </div>
  );
}

function Bubble({ log }: { log: ConversationLog }) {
  const isBuyer = log.speaker === "buyer";
  return (
    <div className={`flex ${isBuyer ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[78%] flex-col gap-1.5 ${isBuyer ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 text-[10.5px] text-text-3">
          <span className="font-medium uppercase tracking-wide">
            {isBuyer ? "Buyer Agent" : log.seller_name ?? "Seller"}
          </span>
          <span>· round {log.round}</span>
        </div>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
            isBuyer
              ? "bg-accent text-white"
              : "border border-border bg-surface text-text-1"
          }`}
        >
          {log.message}
        </div>
        {!isBuyer && (log.pioneer_labels.length > 0 || log.risk_level) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {log.pioneer_labels.map((l) => (
              <PioneerBadge key={l} label={l} />
            ))}
            <RiskPill level={log.risk_level} />
          </div>
        )}
        {!isBuyer && log.extracted_fields && (
          <ExtractedFields fields={log.extracted_fields} />
        )}
      </div>
    </div>
  );
}

function ExtractedFields({
  fields,
}: {
  fields: Record<string, string | number>;
}) {
  return (
    <div className="mt-0.5 rounded-lg border border-dashed border-orange-200 bg-pioneer-soft/50 px-2.5 py-1.5">
      <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-pioneer">
        Pioneer extracted
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-text-2">
        {Object.entries(fields).map(([k, v]) => (
          <span key={k}>
            <span className="text-text-3">{k}</span>{" "}
            <span className="font-semibold text-text-1">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
