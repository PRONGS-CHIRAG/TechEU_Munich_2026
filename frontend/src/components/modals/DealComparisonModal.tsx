"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { DealComparisonRow } from "@/lib/types";

interface Props {
  rows: DealComparisonRow[];
  onApprove: (sellerId: string) => void;
  onRejectAll: () => void;
  onCounter: (message: string) => void;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  passed:              { label: "Passed",      cls: "bg-emerald-100 text-emerald-700" },
  negotiable:          { label: "Negotiable",  cls: "bg-blue-100 text-blue-700" },
  rejected:            { label: "Failed",      cls: "bg-orange-100 text-orange-700" },
  missing_information: { label: "Incomplete",  cls: "bg-yellow-100 text-yellow-700" },
  no_offer:            { label: "Declined",    cls: "bg-neutral-100 text-neutral-500" },
};

export function DealComparisonModal({ rows, onApprove, onRejectAll, onCounter }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [counterText, setCounterText] = useState("");

  useEffect(() => {
    const backdrop = backdropRef.current;
    const card = cardRef.current;
    if (!backdrop || !card) return;
    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" });
    gsap.fromTo(
      card,
      { opacity: 0, y: 14, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "power3.out" },
    );
  }, []);

  const exit = (cb: () => void) => {
    const backdrop = backdropRef.current;
    const card = cardRef.current;
    if (!backdrop || !card) { cb(); return; }
    gsap.to(card, { opacity: 0, scale: 0.97, y: -4, duration: 0.16, ease: "power2.in" });
    gsap.to(backdrop, { opacity: 0, duration: 0.2, ease: "power2.in", onComplete: cb });
  };

  const handleApprove = () => {
    if (!selected) return;
    exit(() => onApprove(selected));
  };

  const handleRejectAll = () => {
    exit(() => onRejectAll());
  };

  const handleCounter = () => {
    const message = counterText.trim();
    if (!message) return;
    exit(() => onCounter(message));
  };

  const selectableCount = rows.filter((r) => !r.is_rejected).length;

  return (
    <div
      ref={backdropRef}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]"
    >
      <div
        ref={cardRef}
        className="mx-4 w-full max-w-[680px] overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow-md)]"
      >
        {/* Accent bar */}
        <div className="h-1 bg-gradient-to-r from-accent/60 via-accent to-accent/60" />

        {/* Header */}
        <div className="px-6 pb-2 pt-5">
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Deal Comparison
          </div>
          <h3 className="text-[16px] font-semibold leading-snug text-text-1">
            Choose a deal or continue negotiation
          </h3>
          <p className="mt-1 text-[12.5px] text-text-3">
            {selectableCount} offer{selectableCount !== 1 ? "s" : ""} available.
            Send a counter-message to all active sellers.
          </p>
        </div>

        {/* Table */}
        <div className="px-6 py-3">
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 text-left font-semibold text-text-2">Vendor</th>
                  <th className="px-3 py-2 text-left font-semibold text-text-2">Product</th>
                  <th className="px-3 py-2 text-right font-semibold text-text-2">Price</th>
                  <th className="px-3 py-2 text-right font-semibold text-text-2">Delivery</th>
                  <th className="px-3 py-2 text-right font-semibold text-text-2">Warranty</th>
                  <th className="px-3 py-2 text-center font-semibold text-text-2">Status</th>
                  <th className="px-3 py-2 text-right font-semibold text-text-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isSelectable = !row.is_rejected;
                  const isSelected = selected === row.seller_id;
                  const badge = STATUS_BADGE[row.validation_status] ?? STATUS_BADGE.no_offer;
                  return (
                    <tr
                      key={row.seller_id}
                      onClick={() => isSelectable && setSelected(row.seller_id)}
                      className={[
                        "border-b border-border last:border-0 transition-colors",
                        isSelectable ? "cursor-pointer" : "cursor-not-allowed opacity-45",
                        isSelected ? "bg-accent/6" : isSelectable ? "hover:bg-surface" : "bg-neutral-50",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2.5 text-center">
                        {isSelectable && (
                          <span
                            className={[
                              "inline-flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors",
                              isSelected
                                ? "border-accent bg-accent"
                                : "border-border bg-white",
                            ].join(" ")}
                          >
                            {isSelected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-text-1">
                        {row.seller_name}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-text-2">
                        {row.product || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-text-1">
                        {row.price_eur > 0 ? `€${row.price_eur.toFixed(0)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-text-2">
                        {row.delivery_days > 0 ? `${row.delivery_days}d` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-text-2">
                        {row.warranty_years > 0 ? `${row.warranty_years}yr` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-2">
                        {row.score > 0 ? row.score : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Counter message */}
        <div className="px-6 pb-3">
          <textarea
            value={counterText}
            onChange={(event) => setCounterText(event.target.value)}
            rows={2}
            placeholder="Ask for a better term, faster delivery, extra warranty..."
            className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-[12px] leading-relaxed text-text-1 outline-none transition-colors placeholder:text-text-3 focus:border-accent"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <p className="text-[11px] text-text-3">
            Your selection resumes the agent feed.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCounter}
              disabled={!counterText.trim()}
              className="rounded-full border border-accent/30 bg-accent-soft px-4 py-1.5 text-[12px] font-semibold text-accent transition-all hover:border-accent hover:bg-accent/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send Counter
            </button>
            <button
              type="button"
              onClick={handleRejectAll}
              className="rounded-full border border-border bg-white px-4 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:border-danger hover:text-danger active:scale-[0.97]"
            >
              Reject All
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={!selected}
              className="rounded-full bg-accent px-5 py-1.5 text-[12px] font-semibold text-white transition-all hover:bg-accent/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Approve Selected Deal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
