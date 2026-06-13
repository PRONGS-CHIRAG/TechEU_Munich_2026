"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { StatusBadge, RiskPill } from "@/components/primitives/Badges";
import { DealCard } from "./DealCard";
import type { FinalRecommendation } from "@/lib/types";

interface Props {
  rec: FinalRecommendation;
  requestId: string;
  approved: boolean;
  onApprove: () => void;
}

export function FinalRecommendationSection({
  rec,
  requestId,
  approved,
  onApprove,
}: Props) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <SectionHeader
        letter="H"
        title="Final Recommendation"
        subtitle="audited & ready for approval"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Details (7 cols) */}
        <div className="lg:col-span-7">
          <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-gradient-to-b from-surface to-surface-2/40 p-5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft font-mono text-[13px] font-semibold text-accent">
                α
              </span>
              <div className="leading-tight">
                <div className="text-[11px] uppercase tracking-wide text-text-3">
                  Recommended
                </div>
                <div className="text-[18px] font-semibold text-text-1">
                  {rec.recommended_seller}
                </div>
              </div>
            </div>

            <div className="text-[14px] text-text-1">
              {rec.recommended_product}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Price" value={`€${rec.price_eur}`} />
              <Stat label="Delivery" value={`${rec.delivery_days}d`} />
              <Stat label="Warranty" value={`${rec.warranty_years}yr`} />
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status={rec.technical_status} />
              <RiskPill level={rec.risk_level} />
            </div>

            <div className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-text-2">
              <span className="font-medium text-text-1">Reason:</span>{" "}
              {rec.reason}
            </div>

            <button
              onClick={onApprove}
              disabled={approved}
              className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-90 active:translate-y-px disabled:cursor-not-allowed disabled:bg-success disabled:opacity-100"
            >
              {approved ? (
                <>
                  <CheckCircle weight="fill" className="h-4 w-4" />
                  Deal Approved
                </>
              ) : (
                "Approve Deal"
              )}
            </button>
          </div>
        </div>

        {/* Deal Card (5 cols) */}
        <div className="lg:col-span-5">
          <DealCard rec={rec} requestId={requestId} approved={approved} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-3">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-text-1">
        {value}
      </div>
    </div>
  );
}
