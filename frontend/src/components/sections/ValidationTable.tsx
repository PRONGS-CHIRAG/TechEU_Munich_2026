"use client";

import { CaretDown, Warning } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { StatusBadge } from "@/components/primitives/Badges";
import type { ExtraConstraint, StructuredRequirements, ValidationResult } from "@/lib/types";

interface Props {
  results: ValidationResult[];
  requirements: StructuredRequirements;
}

export function ValidationTable({ results, requirements }: Props) {
  const [openRow, setOpenRow] = useState<string | null>(null);

  const showLength = requirements.max_length_mm != null;
  const showPower = requirements.max_power_watts != null;
  const extraConstraints = requirements.extra_constraints ?? [];

  // Dynamic column list based on what the requirements actually contain
  const columns: { key: string; label: string }[] = [
    { key: "seller", label: "Seller" },
    { key: "product", label: "Product" },
    ...(showLength ? [{ key: "length", label: "Length" }] : []),
    ...(showPower ? [{ key: "power", label: "Power" }] : []),
    { key: "price", label: "Price" },
    { key: "delivery", label: "Delivery" },
    { key: "warranty", label: "Warranty" },
    ...extraConstraints.map((c) => ({ key: c.field, label: c.label })),
    { key: "status", label: "Status" },
  ];

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
              {columns.map((c) => (
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
                  showLength={showLength}
                  showPower={showPower}
                  extraConstraints={extraConstraints}
                  colCount={columns.length}
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
  showLength,
  showPower,
  extraConstraints,
  colCount,
  open,
  canExpand,
  onToggle,
}: {
  id: string;
  r: ValidationResult;
  requirements: StructuredRequirements;
  showLength: boolean;
  showPower: boolean;
  extraConstraints: ExtraConstraint[];
  colCount: number;
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
        <td className="py-3 pr-4 font-medium text-text-1">{r.seller_name}</td>
        <td className="py-3 pr-4 text-text-2">{r.product}</td>

        {showLength && (
          <Spec
            value={`${r.length_mm}mm`}
            fail={r.length_mm > (requirements.max_length_mm ?? Infinity)}
          />
        )}
        {showPower && (
          <Spec
            value={`${r.power_watts}W`}
            fail={r.power_watts > (requirements.max_power_watts ?? Infinity)}
          />
        )}

        <Spec value={`€${r.price_eur}`} fail={r.price_eur > requirements.budget_eur} />
        <Spec value={`${r.delivery_days}d`} fail={r.delivery_days > requirements.max_delivery_days} />
        <Spec
          value={`${r.warranty_years}yr`}
          fail={r.warranty_years < requirements.minimum_warranty_years}
        />

        {extraConstraints.map((c) => {
          const actual = r.extra_fields?.[c.field];
          const fail =
            actual == null ||
            (c.operator === "<=" ? actual > c.limit : actual < c.limit);
          return (
            <Spec
              key={c.field}
              value={actual != null ? `${actual}${c.unit}` : "—"}
              fail={fail}
            />
          );
        })}

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
            <td colSpan={colCount + 1} className="bg-surface-2/60 p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <FailedDrawer
                  r={r}
                  requirements={requirements}
                  showLength={showLength}
                  showPower={showPower}
                  extraConstraints={extraConstraints}
                />
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
  showLength,
  showPower,
  extraConstraints,
}: {
  r: ValidationResult;
  requirements: StructuredRequirements;
  showLength: boolean;
  showPower: boolean;
  extraConstraints: ExtraConstraint[];
}) {
  const checks: { label: string; actual: string; limit: string; fail: boolean }[] = [];

  if (showLength) {
    checks.push({
      label: "Length",
      actual: `${r.length_mm}mm`,
      limit: `≤ ${requirements.max_length_mm}mm`,
      fail: r.length_mm > (requirements.max_length_mm ?? Infinity),
    });
  }
  if (showPower) {
    checks.push({
      label: "Power draw",
      actual: `${r.power_watts}W`,
      limit: `≤ ${requirements.max_power_watts}W`,
      fail: r.power_watts > (requirements.max_power_watts ?? Infinity),
    });
  }

  checks.push(
    {
      label: "Price",
      actual: `€${r.price_eur}`,
      limit: `≤ €${requirements.budget_eur}`,
      fail: r.price_eur > requirements.budget_eur,
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
  );

  for (const c of extraConstraints) {
    const actual = r.extra_fields?.[c.field];
    const fail =
      actual == null ||
      (c.operator === "<=" ? actual > c.limit : actual < c.limit);
    checks.push({
      label: c.label,
      actual: actual != null ? `${actual}${c.unit}` : "missing",
      limit: `${c.operator} ${c.limit}${c.unit}`,
      fail,
    });
  }

  return (
    <div className="px-6 py-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-danger">
        <Warning weight="fill" className="h-3.5 w-3.5" />
        Why this offer {r.status === "rejected" ? "was rejected" : "is borderline"}
      </div>
      <div className="flex flex-wrap gap-2">
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
