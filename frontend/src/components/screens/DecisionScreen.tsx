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
import { NegotiationChats } from "@/components/sections/NegotiationChats";
import { getDealCardUrl } from "@/lib/api";
import type { ConversationLog, DemoResult } from "@/lib/types";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

interface Props {
  result: DemoResult;
  decision: "approved" | "rejected" | null;
  onDecide: (d: "approved" | "rejected") => void;
  activeSeller: string;
  onSelectSeller: (id: string) => void;
}

export function DecisionScreen({ result, decision, onDecide, activeSeller, onSelectSeller }: Props) {
  const chatsBySeller = groupBySeller(result.conversation_logs);
  const sellerNames = Object.fromEntries(
    result.matched_suppliers.map((s) => [s.seller_id, s.seller_name]),
  );

  // Resolve the winning seller so the report only shows the approved negotiation.
  const winnerId = resolveWinningSellerId(result);
  const winnerChats =
    winnerId && chatsBySeller[winnerId]
      ? { [winnerId]: chatsBySeller[winnerId] }
      : chatsBySeller;

  return (
    <div className="flex flex-col gap-4">
      <RecommendationCard
        result={result}
        decision={decision}
        onDecide={onDecide}
      />

      <AccordionSection title="Audit Summary" dotColor="bg-accent" defaultOpen>
        <div className="pt-4">
          <AuditSummary
            summary={result.audit_summary}
            results={result.validation_results}
            demoResult={result}
          />
        </div>
      </AccordionSection>

      <AccordionSection title="Winning Negotiation" dotColor="bg-purple-500" defaultOpen>
        <div className="pt-4">
          <NegotiationChats
            chatsBySeller={winnerChats}
            sellerNames={sellerNames}
            activeSeller={activeSeller}
            onSelectSeller={onSelectSeller}
          />
        </div>
      </AccordionSection>

      {/* Detailed breakdowns collapsed by default — the report leads with summaries. */}
      <AccordionSection title="Supplier Comparison" dotColor="bg-success">
        <div className="pt-4">
          <SupplierGrid
            suppliers={result.matched_suppliers}
            validationResults={result.validation_results}
          />
        </div>
      </AccordionSection>

      <AccordionSection title="Validation Results" dotColor="bg-warning">
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

/** Best-effort winning seller_id: negotiation outcome first, else match by recommended name. */
function resolveWinningSellerId(result: DemoResult): string | null {
  const fromOutcome = result.negotiation_outcome?.winning_seller_id;
  if (fromOutcome) return fromOutcome;
  const recName = result.final_recommendation?.recommended_seller;
  if (recName) {
    const match = result.matched_suppliers.find((s) => s.seller_name === recName);
    if (match) return match.seller_id;
  }
  return null;
}

function groupBySeller(logs: ConversationLog[]): Record<string, ConversationLog[]> {
  const groups: Record<string, ConversationLog[]> = {};
  for (const log of logs) {
    if (!log.seller_id) continue;
    (groups[log.seller_id] ??= []).push(log);
  }
  return groups;
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

        {/* Two-column: info left, deal card right */}
        <div className="flex gap-6">
          {/* Left: all deal info + actions */}
          <div className="flex flex-1 flex-col">
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
                label={<span className={riskColor}>{rec.risk_level} risk</span>}
              />
            </div>

            {/* Reason */}
            <p className="mt-4 text-[13px] leading-relaxed text-text-2">
              {rec.reason}
            </p>

            {/* Action area */}
            <div className="relative mt-6">
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

          {/* Right: fal deal card image (always visible once decided) */}
          {decided && (
            <div className="hidden shrink-0 lg:flex lg:items-center w-48 xl:w-56">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getDealCardUrl(result.session_id ?? undefined)}
                alt="Procurement deal card generated by fal"
                className="w-full rounded-lg object-contain border border-border"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none";
                }}
              />
            </div>
          )}
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
  dotColor,
  children,
  defaultOpen = false,
}: {
  title: string;
  dotColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow-sm)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-[14px] transition-colors hover:bg-surface active:bg-surface-2"
      >
        <div className="flex items-center gap-2.5">
          {dotColor && (
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
          )}
          <span className="text-[13px] font-semibold text-text-1">{title}</span>
        </div>
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
