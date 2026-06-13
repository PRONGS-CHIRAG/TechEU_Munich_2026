"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/shell/TopBar";
import { StageStrip } from "@/components/shell/StageStrip";
import { AgentNetwork } from "@/components/hero/AgentNetwork";
import { RequestForm } from "@/components/input/RequestForm";
import { ActivityFeed, type FeedItem } from "@/components/feed/ActivityFeed";
import { StructuredRequirementsSection } from "@/components/sections/StructuredRequirements";
import { SupplierGrid } from "@/components/sections/SupplierGrid";
import { TavilyCard } from "@/components/sections/TavilyCard";
import { JudgedCandidatesSection } from "@/components/sections/JudgedCandidates";
import { NegotiationThreads } from "@/components/sections/NegotiationThreads";
import { ValidationTable } from "@/components/sections/ValidationTable";
import { EscalationBanner } from "@/components/sections/EscalationBanner";
import { FinalRecommendationSection } from "@/components/sections/FinalRecommendation";
import { AuditSummary } from "@/components/sections/AuditSummary";
import { SellerInventorySection } from "@/components/sections/SellerInventory";
import { Reveal } from "@/components/primitives/Reveal";
import {
  initialStatus,
  STAGES,
  type DemoStatus,
  type SectionId,
} from "@/lib/demoMachine";
import { streamDemo, sendHumanResponse } from "@/lib/stream";
import { getScenarios, type BuyerScenario } from "@/lib/api";
import type {
  ConversationLog,
  DemoResult,
  HumanAlertData,
  HumanResponse,
  JudgedCandidate,
  MatchedSupplier,
  StreamEvent,
  ValidationResult,
} from "@/lib/types";

type ViewId = "orchestration" | "buyer" | "inventory";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "orchestration", label: "Orchestration" },
  { id: "buyer", label: "Buyer" },
  { id: "inventory", label: "Seller Inventory" },
];

function emptyResult(req: {
  raw_request: string;
  region: string;
  priority: string;
  request_id?: string;
}): DemoResult {
  return {
    request: {
      request_id: req.request_id ?? "",
      raw_request: req.raw_request,
      region: req.region,
      priority: req.priority,
    },
    structured_requirements: {
      product_type: "",
      use_case: "",
      max_length_mm: 0,
      max_power_watts: 0,
      budget_eur: 0,
      max_delivery_days: 0,
      warranty_required: false,
      minimum_warranty_years: 0,
    },
    clusters: [],
    judged_candidates: [],
    matched_suppliers: [],
    conversation_logs: [],
    validation_results: [],
    tavily_enrichment: { triggered: false, reason: "", results: [] },
    escalation_result: { escalate: false, trigger: "", reason: "", question_for_human: "" },
    audit_summary: "",
    final_recommendation: {
      recommended_seller: "",
      recommended_product: "",
      price_eur: 0,
      delivery_days: 0,
      warranty_years: 0,
      technical_status: "rejected",
      risk_level: "unknown",
      reason: "",
      human_approval_required: false,
      human_decision: null,
    },
    deal_card_path: "",
    demo_mode: false,
  };
}

function stageIndexFor(type: StreamEvent["type"]): number {
  switch (type) {
    case "requirements":
      return 0;
    case "cluster":
    case "match":
      return 1;
    case "negotiation_turn":
      return 2;
    case "validation":
      return 3;
    case "human_alert":
    case "escalation":
      return 4;
    case "recommendation":
    case "audit":
      return 5;
    case "done":
      return STAGES.length;
    default:
      return -1;
  }
}

function upsertBy<T>(arr: T[], item: T, key: (x: T) => string): T[] {
  const k = key(item);
  const idx = arr.findIndex((x) => key(x) === k);
  if (idx === -1) return [...arr, item];
  const copy = [...arr];
  copy[idx] = item;
  return copy;
}

function decisionFromRecommendation(
  rec: DemoResult["final_recommendation"],
): "approved" | "rejected" | null {
  if (rec.human_decision === "approve" || rec.human_decision === "adjust") return "approved";
  if (rec.human_decision === "reject") return "rejected";
  return null;
}

export default function Page() {
  const [view, setView] = useState<ViewId>("orchestration");
  const [scenarios, setScenarios] = useState<BuyerScenario[]>([]);
  const [status, setStatus] = useState<DemoStatus>(() => ({
    ...initialStatus,
    revealedSections: new Set(),
  }));
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [activeSeller, setActiveSeller] = useState<string>("");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [pendingAlert, setPendingAlert] = useState<HumanAlertData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const negotiationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getScenarios()
      .then(setScenarios)
      .catch(() => setScenarios([]));
  }, []);

  useEffect(() => () => streamCleanupRef.current?.(), []);

  const reveal = useCallback((sections: SectionId[]) => {
    setStatus((prev) => {
      const next = new Set(prev.revealedSections);
      sections.forEach((s) => next.add(s));
      return { ...prev, revealedSections: next };
    });
  }, []);

  const bumpStage = useCallback((type: StreamEvent["type"]) => {
    const idx = stageIndexFor(type);
    if (idx < 0) return;
    setStatus((s) => ({ ...s, stageIndex: Math.max(s.stageIndex, idx) }));
  }, []);

  const pushFeed = useCallback((item: FeedItem) => {
    setFeed((f) => [...f, item]);
  }, []);

  const handleStreamEvent = useCallback(
    (evt: StreamEvent) => {
      bumpStage(evt.type);

      switch (evt.type) {
        case "requirements": {
          const data = evt.data as DemoResult["structured_requirements"];
          setResult((r) => (r ? { ...r, structured_requirements: data } : r));
          reveal(["requirements"]);
          pushFeed({
            id: `requirements-${evt.ts}`,
            agent: "orchestrator",
            title: "Extracted structured requirements",
            detail: `budget €${data.budget_eur} · max ${data.max_length_mm}mm · ${data.max_delivery_days}d delivery`,
          });
          break;
        }

        case "cluster": {
          const data = evt.data as { judged_candidate: JudgedCandidate };
          const candidate = data.judged_candidate;
          setResult((r) =>
            r ? { ...r, judged_candidates: [...r.judged_candidates, candidate] } : r,
          );
          pushFeed({
            id: `cluster-${evt.ts}-${candidate.seller_id}-${candidate.product}`,
            agent: "judge",
            vendor: candidate.seller_id,
            title: `${candidate.product} — ${candidate.verdict} (${candidate.score})`,
            detail: candidate.reason,
          });
          break;
        }

        case "match": {
          const data = evt.data as MatchedSupplier;
          setResult((r) =>
            r ? { ...r, matched_suppliers: [...r.matched_suppliers, data] } : r,
          );
          setActiveSeller((prev) => prev || data.seller_id);
          reveal(["suppliers"]);
          pushFeed({
            id: `match-${evt.ts}-${data.seller_id}`,
            agent: "orchestrator",
            vendor: data.seller_name,
            title: `Matched supplier — score ${data.match_score.toFixed(2)}`,
            detail: data.reason,
          });
          break;
        }

        case "negotiation_turn": {
          const log = evt.data as ConversationLog;
          setResult((r) =>
            r ? { ...r, conversation_logs: [...r.conversation_logs, log] } : r,
          );
          reveal(["negotiation"]);
          const vendor = log.seller_name ?? log.seller_id;
          pushFeed({
            id: `negotiation-${evt.ts}-${log.seller_id}-${log.round}-${log.speaker}`,
            agent: log.speaker === "buyer" ? "buyer" : "seller",
            vendor,
            title: `"${log.message}"`,
          });
          if (log.speaker === "seller" && log.pioneer_labels.length > 0) {
            const fields = Object.entries(log.extracted_fields ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ");
            pushFeed({
              id: `negotiation-${evt.ts}-${log.seller_id}-${log.round}-pioneer`,
              agent: "pioneer",
              vendor,
              title: `Labeled: ${log.pioneer_labels.join(", ")}`,
              detail: fields || undefined,
            });
          }
          break;
        }

        case "validation": {
          const data = evt.data as ValidationResult;
          setResult((r) =>
            r
              ? {
                  ...r,
                  validation_results: upsertBy(
                    r.validation_results,
                    data,
                    (x) => x.seller_id,
                  ),
                }
              : r,
          );
          reveal(["validation"]);
          pushFeed({
            id: `validation-${evt.ts}-${data.seller_id}`,
            agent: "validation",
            vendor: data.seller_name,
            title: data.status.toUpperCase(),
            detail:
              data.failed_constraints.length > 0
                ? data.failed_constraints.join(" · ")
                : "all constraints satisfied",
          });
          break;
        }

        case "human_alert": {
          const data = evt.data as HumanAlertData;
          setPendingAlert(data);
          setStatus((s) => ({ ...s, phase: "awaiting_approval" }));
          pushFeed({
            id: `human-alert-${evt.ts}`,
            agent: "human",
            title: "Human review requested",
            detail: data.question,
          });
          break;
        }

        case "escalation": {
          const data = evt.data as DemoResult["escalation_result"];
          setResult((r) => (r ? { ...r, escalation_result: data } : r));
          reveal(["escalation"]);
          pushFeed({
            id: `escalation-${evt.ts}`,
            agent: "escalation",
            title: data.escalate ? `Trigger: ${data.trigger}` : "No escalation required",
            detail: data.reason,
          });
          break;
        }

        case "recommendation": {
          const data = evt.data as DemoResult["final_recommendation"];
          setResult((r) => (r ? { ...r, final_recommendation: data } : r));
          reveal(["recommendation"]);
          setPendingAlert(null);
          const d = decisionFromRecommendation(data);
          if (d) setDecision(d);
          pushFeed({
            id: `recommendation-${evt.ts}`,
            agent: "orchestrator",
            title: "Recommendation ready",
            detail: `${data.recommended_seller} · ${data.recommended_product} · €${data.price_eur}`,
          });
          break;
        }

        case "audit": {
          const data = evt.data as string;
          setResult((r) => (r ? { ...r, audit_summary: data } : r));
          reveal(["audit"]);
          pushFeed({
            id: `audit-${evt.ts}`,
            agent: "orchestrator",
            title: "Audit summary generated",
          });
          break;
        }

        case "done": {
          const data = evt.data as DemoResult;
          setResult((r) => ({
            ...data,
            request: { ...data.request, request_id: data.request.request_id || r?.request.request_id || "" },
          }));
          if (data.tavily_enrichment.triggered) reveal(["tavily"]);
          setPendingAlert(null);

          const rec = data.final_recommendation;
          const d = decisionFromRecommendation(rec);
          if (d) {
            setDecision(d);
            setStatus((s) => ({ ...s, phase: d }));
          } else if (rec.human_approval_required) {
            setStatus((s) => ({ ...s, phase: "awaiting_approval" }));
          } else {
            setStatus((s) => ({ ...s, phase: "approved" }));
          }

          pushFeed({ id: `done-${evt.ts}`, agent: "system", title: "Pipeline complete" });
          break;
        }

        case "error": {
          const data = evt.data as { message: string };
          setError(data.message);
          setStatus((s) => ({ ...s, phase: "idle" }));
          pushFeed({ id: `error-${evt.ts}`, agent: "system", title: "Error", detail: data.message });
          break;
        }
      }
    },
    [bumpStage, pushFeed, reveal],
  );

  const start = useCallback(
    (req: { raw_request: string; region: string; priority: string; request_id?: string }) => {
      streamCleanupRef.current?.();
      setFeed([]);
      setError(null);
      setPendingAlert(null);
      setDecision(null);
      setActiveSeller("");
      setResult(emptyResult(req));
      setStatus({ phase: "running", stageIndex: 0, revealedSections: new Set() });

      streamCleanupRef.current = streamDemo(req, handleStreamEvent, () => {
        setError("Stream connection lost");
        setStatus((s) => (s.phase === "running" ? { ...s, phase: "idle" } : s));
      });
    },
    [handleStreamEvent],
  );

  const handleHumanResponse = useCallback(
    (response: HumanResponse) => {
      const alert = pendingAlert;
      if (!alert) return;
      setPendingAlert(null);
      setStatus((s) => ({ ...s, phase: "running" }));
      pushFeed({
        id: `human-response-${Date.now()}`,
        agent: "human",
        title: `Reviewer responded: ${response.decision}`,
        detail:
          response.decision === "adjust" && response.adjustedBudgetEur
            ? `adjusted budget → €${response.adjustedBudgetEur}`
            : undefined,
      });
      sendHumanResponse(alert.session_id, response.decision, response.adjustedBudgetEur).catch(
        () => setError("Failed to submit human response"),
      );
    },
    [pendingAlert, pushFeed],
  );

  const handleDecide = useCallback((d: "approved" | "rejected") => {
    setDecision(d);
    setStatus((s) => ({ ...s, phase: d }));
  }, []);

  const handleSelectSeller = useCallback((sellerId: string) => {
    setActiveSeller(sellerId);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        negotiationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const isRunning = status.phase === "running";
  const showSection = (id: SectionId) => status.revealedSections.has(id);
  const approved = decision === "approved";
  const heroPhase = useMemo(() => status.phase, [status.phase]);

  return (
    <div className="min-h-screen">
      <TopBar />
      <StageStrip stageIndex={status.stageIndex} />

      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-2.5">
          <nav className="flex gap-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  view === v.id
                    ? "bg-accent-soft text-accent"
                    : "text-text-2 hover:bg-surface-2"
                }`}
              >
                {v.label}
              </button>
            ))}
          </nav>

          {result && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${
                result.demo_mode
                  ? "border-border bg-surface-2 text-text-2"
                  : "border-emerald-200 bg-success-soft text-success"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  result.demo_mode ? "bg-text-3" : "animate-pulse bg-emerald-500"
                }`}
              />
              {result.demo_mode ? "Replay" : "Live"}
            </span>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-danger-soft p-4 text-[13px] text-danger">
            {error}
          </div>
        )}

        {view === "orchestration" && (
          <>
            <div className="mb-6">
              <AgentNetwork
                stageIndex={status.stageIndex}
                phase={heroPhase}
                activeSeller={activeSeller}
                onSelectSeller={handleSelectSeller}
                canInteract={showSection("negotiation")}
                suppliers={result?.matched_suppliers ?? []}
                conversationLogs={result?.conversation_logs ?? []}
              />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <RequestForm onStart={start} disabled={isRunning} scenarios={scenarios} />
              </div>
              <div className="lg:col-span-7">
                <ActivityFeed items={feed} pendingAlert={pendingAlert} onHumanResponse={handleHumanResponse} />
              </div>
            </div>

            {result && (
              <div className="flex flex-col gap-6">
                <Reveal show={showSection("requirements")}>
                  <StructuredRequirementsSection data={result.structured_requirements} />
                </Reveal>

                <Reveal show={result.judged_candidates.length > 0}>
                  <JudgedCandidatesSection candidates={result.judged_candidates} />
                </Reveal>

                <Reveal show={showSection("suppliers")}>
                  <div className="flex flex-col gap-3">
                    <SupplierGrid suppliers={result.matched_suppliers} />
                    {showSection("tavily") && <TavilyCard data={result.tavily_enrichment} />}
                  </div>
                </Reveal>

                <Reveal show={showSection("negotiation")}>
                  <div ref={negotiationRef} className="scroll-mt-32">
                    <NegotiationThreads
                      logs={result.conversation_logs}
                      suppliers={result.matched_suppliers}
                      activeSeller={activeSeller}
                      onSelectSeller={setActiveSeller}
                    />
                  </div>
                </Reveal>

                <Reveal show={showSection("validation")}>
                  <ValidationTable
                    results={result.validation_results}
                    requirements={result.structured_requirements}
                  />
                </Reveal>

                <Reveal show={showSection("escalation")}>
                  <EscalationBanner
                    data={result.escalation_result}
                    decided={decision}
                    onDecide={handleDecide}
                  />
                </Reveal>

                <Reveal show={showSection("recommendation")}>
                  <FinalRecommendationSection
                    rec={result.final_recommendation}
                    requestId={result.request.request_id}
                    approved={approved}
                    onApprove={() => handleDecide("approved")}
                  />
                </Reveal>

                <Reveal show={showSection("audit")}>
                  <AuditSummary summary={result.audit_summary} />
                </Reveal>
              </div>
            )}
          </>
        )}

        {view === "buyer" && (
          <div className="flex flex-col gap-6">
            <RequestForm onStart={start} disabled={isRunning} scenarios={scenarios} />

            {result && (
              <div className="flex flex-col gap-6">
                <Reveal show={showSection("requirements")}>
                  <StructuredRequirementsSection data={result.structured_requirements} />
                </Reveal>

                <Reveal show={showSection("escalation") && result.escalation_result.escalate}>
                  <EscalationBanner
                    data={result.escalation_result}
                    decided={decision}
                    onDecide={handleDecide}
                  />
                </Reveal>

                <Reveal show={showSection("recommendation")}>
                  <FinalRecommendationSection
                    rec={result.final_recommendation}
                    requestId={result.request.request_id}
                    approved={approved}
                    onApprove={() => handleDecide("approved")}
                  />
                </Reveal>

                <Reveal show={showSection("audit")}>
                  <AuditSummary summary={result.audit_summary} />
                </Reveal>
              </div>
            )}
          </div>
        )}

        {view === "inventory" && <SellerInventorySection />}

        <footer className="mt-12 border-t border-border pt-4 pb-8 text-center font-mono text-[10.5px] text-text-3">
          Pactum · multi-agent B2B procurement
        </footer>
      </main>
    </div>
  );
}
