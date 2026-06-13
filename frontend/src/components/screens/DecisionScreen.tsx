"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckCircle,
  XCircle,
  Plus,
  Truck,
  ShieldCheck,
  Gauge,
  SealCheck,
  Warning,
} from "@phosphor-icons/react";
import { ValidationTable } from "@/components/sections/ValidationTable";
import { SupplierGrid } from "@/components/sections/SupplierGrid";
import { AuditSummary } from "@/components/sections/AuditSummary";
import type { DemoResult } from "@/lib/types";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

interface Props {
  result: DemoResult;
  decision: "approved" | "rejected" | null;
  onDecide: (d: "approved" | "rejected") => void;
  activeSeller: string;
  onSelectSeller: (id: string) => void;
}

export function DecisionScreen({ result, decision, onDecide }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <RecommendationCard
        result={result}
        decision={decision}
        onDecide={onDecide}
      />

      <AccordionSection title="Audit Summary" defaultOpen>
        <div className="pt-4">
          <AuditSummary summary={result.audit_summary} />
        </div>
      </AccordionSection>

      <AccordionSection title="Supplier Comparison">
        <div className="pt-4">
          <SupplierGrid suppliers={result.matched_suppliers} />
        </div>
      </AccordionSection>

      <AccordionSection title="Validation Results">
        <div className="pt-4">
          <ValidationTable
            results={result.validation_results}
            requirements={result.structured_requirements}
          />
        </div>
      </AccordionSection>
    </div>
  );
}

// ─── Recommendation Hero Card ───────────────────────────────────────────────

function RecommendationCard({
  result,
  decision,
  onDecide,
}: {
  result: DemoResult;
  decision: "approved" | "rejected" | null;
  onDecide: (d: "approved" | "rejected") => void;
}) {
  const rec = result.final_recommendation;
  const decided = decision !== null;

  const buttonsRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  const handleDecide = (d: "approved" | "rejected") => {
    if (decided) return;
    const btns = buttonsRef.current;
    const confirm = confirmRef.current;
    if (!btns || !confirm) { onDecide(d); return; }

    // Phase 1: fade + shrink buttons out
    gsap.to(btns, {
      opacity: 0,
      scale: 0.97,
      duration: 0.15,
      ease: "power2.in",
      onComplete: () => {
        onDecide(d);
        // Phase 2: banner scales in
        gsap.fromTo(
          confirm,
          { opacity: 0, scale: 0.97, y: 4 },
          { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: "power3.out" },
        );
      },
    });
  };

  const riskColor =
    rec.risk_level === "low"
      ? "text-success"
      : rec.risk_level === "medium"
        ? "text-warning"
        : "text-danger";

  const statusOk = rec.technical_status === "passed";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow-sm)]">
      {/* Left accent stripe */}
      <span
        aria-hidden
        className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full bg-accent"
      />

      <div className="px-8 py-6">
        {/* Top meta row */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-3">
            Recommended Deal
          </span>
          <span className="h-px flex-1 bg-border" />
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              statusOk
                ? "bg-success-soft text-success"
                : "bg-warning-soft text-warning"
            }`}
          >
            {statusOk ? (
              <SealCheck weight="fill" className="h-3 w-3" />
            ) : (
              <Warning weight="fill" className="h-3 w-3" />
            )}
            {statusOk ? "All constraints passed" : "Borderline"}
          </span>
        </div>

        {/* Headline */}
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-[28px] font-bold tracking-tight text-text-1 leading-tight">
            {rec.recommended_seller}
          </h2>
          <span className="rounded-full bg-accent px-3 py-1 text-[13px] font-semibold text-white">
            €{rec.price_eur}
          </span>
        </div>
        <p className="mt-1 text-[15px] font-medium text-text-2">
          {rec.recommended_product}
        </p>

        {/* Chips row */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip icon={<Truck className="h-3.5 w-3.5" />} label={`${rec.delivery_days}d delivery`} />
          <Chip
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label={`${rec.warranty_years}yr warranty`}
          />
          <Chip
            icon={<Gauge className="h-3.5 w-3.5" />}
            label={
              <span className={riskColor}>
                {rec.risk_level} risk
              </span>
            }
          />
        </div>

        {/* Reason */}
        <p className="mt-4 max-w-[68ch] text-[13px] leading-relaxed text-text-2">
          {rec.reason}
        </p>

        {/* Action area */}
        <div className="relative mt-6">
          {/* Confirmation banner — rendered under buttons, revealed by GSAP */}
          <div
            ref={confirmRef}
            className={`absolute inset-0 flex items-center justify-center gap-3 rounded-xl px-5 py-3.5 opacity-0 ${
              decision === "approved"
                ? "bg-success-soft"
                : decision === "rejected"
                  ? "bg-danger-soft"
                  : "bg-success-soft"
            }`}
          >
            {decision === "approved" ? (
              <>
                <CheckCircle weight="fill" className="h-5 w-5 text-success" />
                <span className="text-[14px] font-semibold text-success">
                  Deal approved — order confirmed
                </span>
              </>
            ) : (
              <>
                <XCircle weight="fill" className="h-5 w-5 text-danger" />
                <span className="text-[14px] font-semibold text-danger">
                  Deal rejected
                </span>
              </>
            )}
          </div>

          {/* Buttons */}
          <div
            ref={buttonsRef}
            className={`flex gap-3 ${decided ? "pointer-events-none invisible" : ""}`}
          >
            <button
              onClick={() => handleDecide("approved")}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-95 active:scale-[0.97]"
            >
              <CheckCircle weight="bold" className="h-4 w-4" />
              Approve Deal
            </button>
            <button
              onClick={() => handleDecide("rejected")}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-[14px] font-semibold text-danger transition-all hover:bg-danger-soft active:scale-[0.97]"
            >
              <XCircle weight="bold" className="h-4 w-4" />
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-medium text-text-2">
      <span className="text-text-3">{icon}</span>
      {label}
    </span>
  );
}

// ─── Accordion Section ──────────────────────────────────────────────────────

function AccordionSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow-sm)]">
      {/* Header row — pill style */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-surface active:bg-surface-2"
      >
        <span className="text-[13px] font-semibold text-text-1">{title}</span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="grid h-6 w-6 place-items-center rounded-full border border-border text-text-2"
        >
          <Plus className="h-3.5 w-3.5" weight="bold" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-6 pb-6">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
