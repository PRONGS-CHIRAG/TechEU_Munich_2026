"use client";

import { CaretDown, Warning } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { StatusBadge } from "@/components/primitives/Badges";
import type { StructuredRequirements, ValidationResult } from "@/lib/types";
import { displayName } from "@/lib/api";

interface Props {
  results: ValidationResult[];
  requirements: StructuredRequirements;
}

const COLUMNS = [
  { key: "seller", label: "Seller" },
  { key: "product", label: "Product" },
  { key: "length", label: "Length" },
  { key: "power", label: "Power" },
  { key: "price", label: "Price" },
  { key: "delivery", label: "Delivery" },
  { key: "warranty", label: "Warranty" },
  { key: "status", label: "Status" },
];

export function ValidationTable({ results, requirements }: Props) {
  const [openRow, setOpenRow] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <SectionHeader
        letter="F"
        title="Technical Validation"
        subtitle="deterministic rules · agents advise, rules decide"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="py-2 pr-4 text-[10.5px] font-medium uppercase tracking-wide text-text-3"
                >
                  {c.label}
                </th>
              ))}
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const id = `${r.seller_id}-${r.product}`;
              const isOpen = openRow === id;
              const canExpand = r.failed_constraints.length > 0;
              return (
                <Row
                  key={id}
                  id={id}
                  r={r}
                  requirements={requirements}
                  open={isOpen}
                  canExpand={canExpand}
                  onToggle={() => setOpenRow(isOpen ? null : id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  id,
  r,
  requirements,
  open,
  canExpand,
  onToggle,
}: {
  id: string;
  r: ValidationResult;
  requirements: StructuredRequirements;
  open: boolean;
  canExpand: boolean;
  onToggle: () => void;
}) {
  const rowTint =
    r.status === "rejected"
      ? "bg-danger-soft/40"
      : r.status === "negotiable"
        ? "bg-warning-soft/40"
        : "";

  return (
    <>
      <tr
        className={`border-b border-border transition-colors hover:bg-surface-2 ${rowTint} ${
          canExpand ? "cursor-pointer" : ""
        }`}
        onClick={canExpand ? onToggle : undefined}
      >
        <td className="py-3 pr-4 font-medium text-text-1">{displayName(r.seller_name)}</td>
        <td className="py-3 pr-4 text-text-2">{r.product}</td>
        <Spec value={`${r.length_mm}mm`} fail={r.length_mm > requirements.max_length_mm} />
        <Spec value={`${r.power_watts}W`} fail={r.power_watts > requirements.max_power_watts} />
        <Spec
          value={`€${r.price_eur}`}
          fail={requirements.budget_eur != null && r.price_eur > requirements.budget_eur}
        />
        <Spec value={`${r.delivery_days}d`} fail={r.delivery_days > requirements.max_delivery_days} />
        <Spec
          value={`${r.warranty_years}yr`}
          fail={r.warranty_years < requirements.minimum_warranty_years}
        />
        <td className="py-3 pr-4">
          <StatusBadge status={r.status} />
        </td>
        <td className="py-3 pr-2 text-right">
          {canExpand && (
            <CaretDown
              className={`inline h-3.5 w-3.5 text-text-3 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          )}
        </td>
      </tr>
      <AnimatePresence initial={false}>
        {open && (
          <tr>
            <td colSpan={COLUMNS.length + 1} className="bg-surface-2/60 p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <FailedDrawer r={r} requirements={requirements} />
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

function Spec({ value, fail }: { value: string; fail: boolean }) {
  return (
    <td
      className={`py-3 pr-4 font-mono text-[12px] ${
        fail ? "text-danger" : "text-text-1"
      }`}
    >
      {value}
    </td>
  );
}

function FailedDrawer({
  r,
  requirements,
}: {
  r: ValidationResult;
  requirements: StructuredRequirements;
}) {
  const checks = [
    {
      label: "Length",
      actual: `${r.length_mm}mm`,
      limit: `≤ ${requirements.max_length_mm}mm`,
      fail: r.length_mm > requirements.max_length_mm,
    },
    {
      label: "Power draw",
      actual: `${r.power_watts}W`,
      limit: `≤ ${requirements.max_power_watts}W`,
      fail: r.power_watts > requirements.max_power_watts,
    },
    {
      label: "Price",
      actual: `€${r.price_eur}`,
      limit: requirements.budget_eur == null ? "unlimited" : `≤ €${requirements.budget_eur}`,
      fail: requirements.budget_eur != null && r.price_eur > requirements.budget_eur,
    },
    {
      label: "Delivery",
      actual: `${r.delivery_days}d`,
      limit: `≤ ${requirements.max_delivery_days}d`,
      fail: r.delivery_days > requirements.max_delivery_days,
    },
    {
      label: "Warranty",
      actual: `${r.warranty_years}yr`,
      limit: `≥ ${requirements.minimum_warranty_years}yr`,
      fail: r.warranty_years < requirements.minimum_warranty_years,
    },
  ];

  return (
    <div className="px-6 py-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-danger">
        <Warning weight="fill" className="h-3.5 w-3.5" />
        Why this offer {r.status === "rejected" ? "was rejected" : "is borderline"}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {checks.map((c) => (
          <div
            key={c.label}
            className={`rounded-lg border px-3 py-2 ${
              c.fail
                ? "border-red-200 bg-danger-soft"
                : "border-border bg-surface"
            }`}
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-3">
              {c.label}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 font-mono text-[12px]">
              <span
                className={`font-semibold ${
                  c.fail ? "text-danger" : "text-text-1"
                }`}
              >
                {c.actual}
              </span>
              <span className="text-text-3">vs {c.limit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
