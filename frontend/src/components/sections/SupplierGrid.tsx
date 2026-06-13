"use client";

import { MapPin, ChartBar, Handshake } from "@phosphor-icons/react";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import type { MatchedSupplier } from "@/lib/types";

interface Props {
  suppliers: MatchedSupplier[];
}

export function SupplierGrid({ suppliers }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-tinted)]">
      <SectionHeader
        letter="D"
        title="Matched suppliers"
        subtitle="ranked by Supplier Matching Agent"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {suppliers.map((s, i) => (
          <SupplierCard key={s.seller_id} supplier={s} best={i === 0} />
        ))}
      </div>
    </div>
  );
}

function SupplierCard({
  supplier,
  best,
}: {
  supplier: MatchedSupplier;
  best: boolean;
}) {
  return (
    <article
      className={`relative flex flex-col rounded-xl p-4 transition-all duration-200 ${
        best
          ? "bg-gradient-to-b from-accent-soft/70 to-white ring-1 ring-accent-border shadow-[0_1px_2px_rgb(79_70_229_/_0.08),0_12px_28px_-12px_rgb(79_70_229_/_0.25)]"
          : "bg-surface ring-1 ring-border hover:ring-border-strong"
      }`}
    >
      {best && (
        <span className="absolute -top-2 left-3 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_2px_8px_rgb(79_70_229_/_0.35)]">
          Best match
        </span>
      )}

      {/* Title row — fixed height so all 5 cards align */}
      <div className="flex h-7 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-surface-2 font-mono text-[10.5px] font-semibold text-text-2">
            α
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-text-1">
            {supplier.seller_name}
          </span>
        </div>
        <span className="font-mono text-[15px] font-semibold tabular-nums text-accent">
          {supplier.match_score.toFixed(2)}
        </span>
      </div>

      {/* Specialization — fixed height for alignment */}
      <div className="mt-3 h-9 text-[11.5px] leading-snug text-text-2 [text-wrap:balance]">
        {supplier.specialization}
      </div>

      {/* Meta rows */}
      <div className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-text-2">
        <Row icon={<MapPin className="h-3 w-3" />} value={supplier.region} />
        <Row
          icon={<ChartBar className="h-3 w-3" />}
          value={`reliability ${supplier.reliability_score.toFixed(2)}`}
        />
        <Row
          icon={<Handshake className="h-3 w-3" />}
          value={supplier.negotiation_style}
        />
      </div>

      {/* Reason — bottom-pinned */}
      <div className="mt-auto pt-3 text-[11px] leading-snug text-text-3 [text-wrap:pretty]">
        {supplier.reason}
      </div>
    </article>
  );
}

function Row({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-1.5 tabular-nums">
      <span className="text-text-3">{icon}</span>
      <span>{value}</span>
    </div>
  );
}
