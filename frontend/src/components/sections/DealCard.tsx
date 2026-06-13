"use client";

import { motion } from "motion/react";
import { Sparkle } from "@phosphor-icons/react";
import { BUYER_COMPANY } from "@/lib/mockData";
import type { FinalRecommendation } from "@/lib/types";

interface Props {
  rec: FinalRecommendation;
  requestId: string;
  approved: boolean;
}

export function DealCard({ rec, requestId, approved }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {/* Header band */}
      <div className="flex items-center justify-between bg-gradient-to-br from-blue-600 to-blue-700 px-5 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
            <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <rect x="8" y="8" width="9" height="9" fill="currentColor" />
          </svg>
          <div className="leading-tight">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] opacity-90">
              Pactum Deal
            </div>
            <div className="font-mono text-[11px] opacity-80">{requestId}</div>
          </div>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[10.5px] uppercase tracking-wider opacity-80">
            Buyer
          </div>
          <div className="text-[12px] font-semibold">{BUYER_COMPANY.name}</div>
        </div>
      </div>

      <div className="relative p-5">
        {/* Vendor */}
        <div className="mb-3">
          <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-3">
            Recommended Vendor
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-surface-2 font-mono text-[12px] font-semibold text-text-2">
              α
            </span>
            <span className="text-[16px] font-semibold text-text-1">
              {rec.recommended_seller}
            </span>
          </div>
          <div className="mt-1 text-[13px] text-text-2">
            {rec.recommended_product}
          </div>
        </div>

        {/* Price hero */}
        <div className="mb-4 rounded-xl border border-border bg-gradient-to-b from-accent-soft/40 to-surface px-4 py-4">
          <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-3">
            Price
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-mono text-[38px] font-semibold tracking-tight text-text-1">
              €{rec.price_eur}
            </span>
            <span className="font-mono text-[12px] text-text-3">incl. delivery</span>
          </div>
        </div>

        {/* Spec grid */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <SpecCell label="Delivery" value={`${rec.delivery_days} days`} />
          <SpecCell label="Warranty" value={`${rec.warranty_years} years`} />
          <SpecCell
            label="Compatibility"
            value={rec.technical_status === "passed" ? "PASSED" : rec.technical_status}
            tone="success"
          />
          <SpecCell
            label="Risk level"
            value={rec.risk_level}
            tone={rec.risk_level === "low" ? "success" : "warning"}
          />
        </div>

        {/* Approval area */}
        <div className="relative flex items-center justify-between border-t border-dashed border-border pt-4">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-wide text-text-3">
              Approval Status
            </div>
            <div
              className={`mt-0.5 text-[12.5px] font-semibold ${
                approved ? "text-success" : "text-warning"
              }`}
            >
              {approved ? "Approved by human" : "Awaiting human approval"}
            </div>
          </div>
          <div className="font-mono text-[10px] text-text-3">
            powered by Pactum
          </div>

          {approved && <ApprovedStamp />}
        </div>
      </div>

      {/* Decorative receipt notches */}
      <div className="absolute -left-2 top-[58px] h-4 w-4 rounded-full bg-bg" />
      <div className="absolute -right-2 top-[58px] h-4 w-4 rounded-full bg-bg" />
    </div>
  );
}

function SpecCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-text-1";
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-3">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-[13px] font-semibold uppercase ${cls}`}>
        {value}
      </div>
    </div>
  );
}

function ApprovedStamp() {
  return (
    <motion.div
      initial={{ scale: 0, rotate: 8, opacity: 0 }}
      animate={{ scale: 1, rotate: -8, opacity: 1 }}
      transition={{
        type: "spring",
        stiffness: 180,
        damping: 14,
        mass: 0.6,
      }}
      className="pointer-events-none absolute -right-2 -top-1 grid h-20 w-20 place-items-center"
    >
      <div className="grid h-20 w-20 place-items-center rounded-full border-[3px] border-success bg-white/80 backdrop-blur-sm">
        <div className="flex flex-col items-center leading-none text-success">
          <Sparkle weight="fill" className="h-3 w-3" />
          <span className="mt-0.5 font-mono text-[12px] font-bold tracking-wider">
            APPROVED
          </span>
          <span className="mt-0.5 font-mono text-[7px] tracking-widest opacity-70">
            BY HUMAN
          </span>
        </div>
      </div>
    </motion.div>
  );
}
