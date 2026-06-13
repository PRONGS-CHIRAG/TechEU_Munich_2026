"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { Warning, CheckCircle, XCircle } from "@phosphor-icons/react";
import type { EscalationResult } from "@/lib/types";

interface Props {
  data: EscalationResult;
  onDecide: (d: "approved" | "rejected") => void;
}

export function EscalationModal({ data, onDecide }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Entry: backdrop fades, card slides up
  useEffect(() => {
    const backdrop = backdropRef.current;
    const card = cardRef.current;
    if (!backdrop || !card) return;

    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" });
    gsap.fromTo(
      card,
      { opacity: 0, y: 8, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: "power3.out" },
    );
  }, []);

  const handleDecide = (d: "approved" | "rejected") => {
    const backdrop = backdropRef.current;
    const card = cardRef.current;
    if (!backdrop || !card) { onDecide(d); return; }

    // Exit: card shrinks out, backdrop fades — then fire callback
    gsap.to(card, { opacity: 0, scale: 0.97, y: -4, duration: 0.16, ease: "power2.in" });
    gsap.to(backdrop, {
      opacity: 0,
      duration: 0.2,
      ease: "power2.in",
      onComplete: () => onDecide(d),
    });
  };

  return (
    <div
      ref={backdropRef}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]"
    >
      <div
        ref={cardRef}
        className="mx-4 w-full max-w-[480px] overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow-md)]"
      >
        {/* Amber accent bar */}
        <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />

        {/* Header */}
        <div className="flex items-start gap-4 px-6 pb-4 pt-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-warning">
            <Warning weight="fill" className="h-5 w-5" />
          </span>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
              Human Escalation Required
            </div>
            <h3 className="text-[16px] font-semibold leading-snug text-text-1">
              {data.reason}
            </h3>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-5">
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">
              Question
            </div>
            <p className="text-[13.5px] leading-relaxed text-text-2">
              {data.question_for_human}
            </p>
          </div>
          {data.trigger && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-warning">
              Trigger · {data.trigger}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-border px-6 py-4">
          <button
            onClick={() => handleDecide("rejected")}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-[13px] font-semibold text-danger transition-all hover:bg-danger-soft active:scale-[0.97]"
          >
            <XCircle weight="bold" className="h-4 w-4" />
            Reject
          </button>
          <button
            onClick={() => handleDecide("approved")}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-95 active:scale-[0.97]"
          >
            <CheckCircle weight="bold" className="h-4 w-4" />
            Approve Deal
          </button>
        </div>
      </div>
    </div>
  );
}
