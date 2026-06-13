"use client";

import { motion } from "motion/react";
import { Warning } from "@phosphor-icons/react";
import type { EscalationResult } from "@/lib/types";

interface Props {
  data: EscalationResult;
  decided: "approved" | "rejected" | null;
  onDecide: (d: "approved" | "rejected") => void;
}

export function EscalationBanner({ data, decided, onDecide }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-surface to-surface shadow-sm"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-warning">
            <Warning weight="fill" className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-warning">
                Human approval required
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2 py-0.5 font-mono text-[10px] text-warning">
                trigger · {data.trigger}
              </span>
            </div>
            <p className="text-[13.5px] leading-relaxed text-text-1">
              {data.reason}
            </p>
            <p className="mt-2 text-[12.5px] font-medium text-text-2">
              {data.question_for_human}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {decided === "approved" ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-success-soft px-4 text-[13px] font-semibold text-success ring-1 ring-emerald-200">
              ✓ Approved
            </span>
          ) : decided === "rejected" ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-danger-soft px-4 text-[13px] font-semibold text-danger ring-1 ring-red-200">
              ✕ Rejected
            </span>
          ) : (
            <>
              <button
                onClick={() => onDecide("rejected")}
                className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-[13px] font-medium text-text-1 transition-colors hover:bg-surface-2 active:translate-y-px"
              >
                Reject
              </button>
              <button
                onClick={() => onDecide("approved")}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-success px-4 text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-90 active:translate-y-px"
              >
                Approve Deal
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
