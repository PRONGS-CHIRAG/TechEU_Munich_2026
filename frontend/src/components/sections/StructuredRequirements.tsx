"use client";

import { SectionHeader } from "@/components/primitives/SectionHeader";
import type { StructuredRequirements } from "@/lib/types";

interface Props {
  data: StructuredRequirements;
}

export function StructuredRequirementsSection({ data }: Props) {
  const entries: { key: string; value: string }[] = [
    { key: "product_type", value: data.product_type },
    { key: "use_case", value: data.use_case },
    { key: "max_length_mm", value: `${data.max_length_mm}` },
    { key: "max_power_watts", value: `${data.max_power_watts}` },
    { key: "budget_eur", value: `€${data.budget_eur}` },
    { key: "max_delivery_days", value: `${data.max_delivery_days}d` },
    { key: "warranty_required", value: data.warranty_required ? "true" : "false" },
    {
      key: "minimum_warranty_years",
      value: `${data.minimum_warranty_years}y`,
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <SectionHeader
        letter="C"
        title="Structured Requirements"
        subtitle="extracted from buyer request"
      />
      <div className="flex flex-wrap gap-2">
        {entries.map((e) => (
          <span
            key={e.key}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12px]"
          >
            <span className="font-mono text-text-3">{e.key}</span>
            <span className="font-mono font-semibold text-text-1">
              {e.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
