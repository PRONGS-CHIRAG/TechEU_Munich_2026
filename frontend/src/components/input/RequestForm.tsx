"use client";

import { CaretDown, PaperPlaneTilt } from "@phosphor-icons/react";
import { useState } from "react";
import { BUYER_COMPANY, defaultRequest } from "@/lib/mockData";

interface Props {
  onStart: (req: {
    raw_request: string;
    region: string;
    priority: string;
  }) => void;
  disabled: boolean;
}

const REGIONS = ["Germany", "Austria", "Switzerland"];
const PRIORITIES = [
  { id: "technical_fit", label: "Technical fit" },
  { id: "budget", label: "Budget" },
  { id: "delivery", label: "Delivery" },
  { id: "performance", label: "Performance" },
];

export function RequestForm({ onStart, disabled }: Props) {
  const [raw, setRaw] = useState(defaultRequest.raw_request);
  const [region, setRegion] = useState(defaultRequest.region);
  const [priority, setPriority] = useState(defaultRequest.priority);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-text-3">
            Procurement Request
          </div>
          <div className="mt-0.5 text-[14px] font-medium text-text-1">
            What do you need to buy?
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {BUYER_COMPANY.name}
        </span>
      </div>

      <form
        className="flex flex-1 flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled) return;
          onStart({ raw_request: raw, region, priority });
        }}
      >
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          disabled={disabled}
          rows={5}
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-text-1 outline-none transition-colors placeholder:text-text-3 focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-surface-2 disabled:text-text-2"
          placeholder="Describe what you need to buy…"
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Region"
            value={region}
            options={REGIONS.map((r) => ({ id: r, label: r }))}
            onChange={setRegion}
            disabled={disabled}
          />
          <Select
            label="Priority"
            value={priority}
            options={PRIORITIES}
            onChange={setPriority}
            disabled={disabled}
          />
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-indigo-600 active:translate-y-px disabled:cursor-not-allowed disabled:bg-text-3"
        >
          <PaperPlaneTilt className="h-4 w-4" weight="fill" />
          Start Procurement
        </button>
      </form>
    </section>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-text-2">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-9 w-full appearance-none rounded-lg border border-border bg-surface pl-3 pr-8 text-[13px] text-text-1 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-surface-2"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <CaretDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3"
          weight="bold"
        />
      </div>
    </label>
  );
}
