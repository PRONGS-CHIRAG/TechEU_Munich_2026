"use client";

import { SectionHeader } from "@/components/primitives/SectionHeader";
import type { JudgedCandidate } from "@/lib/types";

interface Props {
  candidates: JudgedCandidate[];
}

const VERDICT_STYLES: Record<JudgedCandidate["verdict"], string> = {
  good: "bg-success-soft text-success border-emerald-200",
  borderline: "bg-warning-soft text-warning border-amber-200",
  bad: "bg-danger-soft text-danger border-red-200",
};

export function JudgedCandidatesSection({ candidates }: Props) {
  if (candidates.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <SectionHeader
        letter="C"
        title="Candidate judging"
        subtitle="clusters scored by the Judge subagent before negotiation"
      />
      <ol className="flex flex-col gap-2">
        {candidates.map((c, i) => (
          <li
            key={`${c.cluster_id}-${c.seller_id}-${i}`}
            className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2"
          >
            <span
              className={`mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide ${VERDICT_STYLES[c.verdict]}`}
            >
              {c.verdict}
            </span>
            <div className="min-w-0 flex-1 leading-snug">
              <div className="text-[12.5px] font-medium text-text-1">
                {c.seller_id} · {c.product}
              </div>
              <div className="text-[11.5px] text-text-2">{c.reason}</div>
            </div>
            <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-text-2">
              {c.score}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
