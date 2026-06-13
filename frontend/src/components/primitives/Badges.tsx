import type { PioneerLabel, RiskLevel, ValidationStatus } from "@/lib/types";

export function PioneerBadge({ label }: { label: PioneerLabel }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-orange-200 bg-pioneer-soft px-2 font-mono text-[10px] font-medium text-pioneer">
      <span className="h-1 w-1 rounded-full bg-pioneer" />
      {label.replace(/_/g, " ")}
    </span>
  );
}

export function RiskPill({ level }: { level: RiskLevel }) {
  const map: Record<RiskLevel, string> = {
    low: "bg-surface-2 text-text-2 border-border",
    medium: "bg-amber-50 text-warning border-amber-200",
    high: "bg-danger-soft text-danger border-red-200",
    unknown: "bg-surface-2 text-text-3 border-border",
  };
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium uppercase tracking-wide ${map[level]}`}
    >
      {level}
    </span>
  );
}

export function StatusBadge({ status }: { status: ValidationStatus }) {
  const map: Record<
    ValidationStatus,
    { label: string; cls: string }
  > = {
    passed: {
      label: "Passed",
      cls: "bg-success-soft text-success border-emerald-200",
    },
    rejected: {
      label: "Rejected",
      cls: "bg-danger-soft text-danger border-red-200",
    },
    negotiable: {
      label: "Negotiable",
      cls: "bg-warning-soft text-warning border-amber-200",
    },
    missing_information: {
      label: "Missing info",
      cls: "bg-surface-2 text-text-2 border-border",
    },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 text-[10.5px] font-semibold uppercase tracking-wide ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
