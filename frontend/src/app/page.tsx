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
import { NegotiationThreads } from "@/components/sections/NegotiationThreads";
import { ValidationTable } from "@/components/sections/ValidationTable";
import { EscalationBanner } from "@/components/sections/EscalationBanner";
import { FinalRecommendationSection } from "@/components/sections/FinalRecommendation";
import { AuditSummary } from "@/components/sections/AuditSummary";
import { Reveal } from "@/components/primitives/Reveal";
import {
  initialStatus,
  STAGES,
  type DemoStatus,
  type SectionId,
} from "@/lib/demoMachine";
import { startStream, type StreamEvent } from "@/lib/stream";
import type { DemoResult } from "@/lib/types";

// Maps SSE event stage string → StageStrip index
const EVENT_STAGE_MAP: Record<string, number> = {
  intel: 0,
  match: 1,
  negotiate: 2,
  validate: 3,
  escalate: 4,
  recommend: 5,
  audit: 5,
  done: 5,
};

// Maps SSE event type → sections to reveal
const EVENT_REVEAL_MAP: Record<string, SectionId[]> = {
  requirements: ["requirements"],
  cluster: [],
  match: ["suppliers"],
  negotiation_turn: ["negotiation"],
  validation: ["validation"],
  human_alert: ["escalation"],
  escalation: ["escalation"],
  recommendation: ["recommendation"],
  audit: ["audit"],
};

export default function Page() {
  const [status, setStatus] = useState<DemoStatus>(() => ({
    ...initialStatus,
    revealedSections: new Set(),
  }));
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [activeSeller, setActiveSeller] = useState<string>("");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamStopRef = useRef<(() => void) | null>(null);
  const negotiationRef = useRef<HTMLDivElement>(null);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      streamStopRef.current?.();
    };
  }, []);

  const reveal = useCallback((sections: SectionId[]) => {
    setStatus((prev) => {
      const next = new Set(prev.revealedSections);
      sections.forEach((s) => next.add(s));
      return { ...prev, revealedSections: next };
    });
  }, []);

  const pushFeed = useCallback((item: FeedItem) => {
    setFeed((f) => [...f, item]);
  }, []);

  const start = useCallback(
    async (req: { raw_request: string; region: string; priority: string }) => {
      // Stop any running stream
      streamStopRef.current?.();

      setFeed([]);
      setDecision(null);
      setError(null);
      setResult(null);
      setStatus({ phase: "running", stageIndex: 0, revealedSections: new Set() });

      streamStopRef.current = startStream(req, {
        onEvent(event: StreamEvent) {
          const idx = EVENT_STAGE_MAP[event.stage] ?? 0;
          setStatus((s) => ({
            ...s,
            stageIndex: Math.max(s.stageIndex, idx),
          }));

          const sections = EVENT_REVEAL_MAP[event.type];
          if (sections?.length) reveal(sections);

          // eventToFeedItems returns 1-2 items (e.g. cluster + judging verdict)
          eventToFeedItems(event).forEach(pushFeed);
        },

        onDone(data) {
          const demo = data as unknown as DemoResult;
          setResult(demo);
          setActiveSeller(
            [...(demo.matched_suppliers ?? [])]
              .sort((a, b) => b.match_score - a.match_score)[0]
              ?.seller_id ?? "",
          );
          reveal(["recommendation", "audit"]);
          setStatus((s) => ({
            ...s,
            phase: "awaiting_approval",
            stageIndex: STAGES.length,
          }));
        },

        onError(message: string) {
          setError(message);
          setStatus({ ...initialStatus, revealedSections: new Set() });
        },
      });
    },
    [pushFeed, reveal],
  );

  const handleDecide = useCallback((d: "approved" | "rejected") => {
    setDecision(d);
    setStatus((s) => ({
      ...s,
      phase: d === "approved" ? "approved" : "rejected",
    }));
  }, []);

  const handleSelectSeller = useCallback((sellerId: string) => {
    setActiveSeller(sellerId);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        negotiationRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, []);

  const isIdle = status.phase === "idle";
  const isRunning = status.phase === "running";
  const showSection = (id: SectionId) => status.revealedSections.has(id);
  const approved = decision === "approved";

  const heroPhase = useMemo(() => status.phase, [status.phase]);

  return (
    <div className="min-h-screen">
      <TopBar />
      <StageStrip stageIndex={status.stageIndex} />

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="mb-6">
          <AgentNetwork
            stageIndex={status.stageIndex}
            phase={heroPhase}
            activeSeller={activeSeller}
            onSelectSeller={handleSelectSeller}
            canInteract={showSection("negotiation")}
            suppliers={result?.matched_suppliers ?? []}
          />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <RequestForm onStart={start} disabled={isRunning || !isIdle} />
          </div>
          <div className="lg:col-span-7">
            <ActivityFeed items={feed} />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-danger-soft p-4 text-[13px] text-danger">
            {error}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-6">
            <Reveal show={showSection("requirements")}>
              <StructuredRequirementsSection
                data={result.structured_requirements}
              />
            </Reveal>

            <Reveal show={showSection("suppliers")}>
              <div className="flex flex-col gap-3">
                <SupplierGrid suppliers={result.matched_suppliers} />
                {showSection("tavily") && (
                  <TavilyCard data={result.tavily_enrichment} />
                )}
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

        <footer className="mt-12 border-t border-border pt-4 pb-8 text-center font-mono text-[10.5px] text-text-3">
          Pactum · multi-agent B2B procurement
        </footer>
      </main>
    </div>
  );
}

function eventToFeedItems(event: StreamEvent): FeedItem[] {
  const id = `${event.type}-${event.ts}`;
  const d = event.data;
  const item = _eventToFeedItem(id, event.type, d);
  if (!item) return [];

  // For cluster events that carry a judged_candidate, emit a second judging item
  if (event.type === "cluster") {
    const jc = (d as Record<string, unknown>).judged_candidate as
      | { verdict?: string; reason?: string; product?: string; seller_id?: string }
      | undefined;
    if (jc?.verdict) {
      const verdictColor =
        jc.verdict === "good" ? "✓ GOOD" : jc.verdict === "bad" ? "✗ BAD" : "~ BORDERLINE";
      return [
        item,
        {
          id: `judge-${event.ts}`,
          agent: "judging" as const,
          title: `${verdictColor}: ${jc.product ?? "candidate"}`,
          detail: jc.reason,
          vendor: jc.seller_id,
        },
      ];
    }
  }

  return [item];
}

function _eventToFeedItem(
  id: string,
  type: string,
  d: unknown,
): FeedItem | null {
  switch (type) {
    case "requirements": {
      if ((d as { status?: string }).status === "extracting") {
        return {
          id,
          agent: "gemini",
          title: "Gemini extracting structured requirements...",
        };
      }
      const req = d as {
        use_case?: string;
        budget_eur?: number;
        max_length_mm?: number;
        max_delivery_days?: number;
      };
      return {
        id,
        agent: "gemini",
        title: `Requirements extracted: ${req.use_case ?? "GPU procurement"}`,
        detail: `budget €${req.budget_eur} · max ${req.max_length_mm}mm · ${req.max_delivery_days}d delivery`,
      };
    }

    case "cluster": {
      const c = d as {
        cluster_id?: string;
        products?: unknown[];
        similarity_score?: number;
        representative_specs?: { avg_price_eur?: number };
      };
      return {
        id,
        agent: "clustering",
        title: `${c.cluster_id ?? "Cluster"}: ${c.products?.length ?? 0} products`,
        detail: `similarity ${c.similarity_score} · avg €${c.representative_specs?.avg_price_eur}`,
      };
    }

    case "match": {
      const m = d as {
        seller_name?: string;
        match_score?: number;
        reason?: string;
      };
      return {
        id,
        agent: "system",
        title: `Matched: ${m.seller_name ?? "supplier"}`,
        detail: `score ${m.match_score} — ${m.reason}`,
      };
    }

    case "negotiation_turn": {
      const log = d as {
        speaker?: string;
        seller_name?: string;
        message?: string;
      };
      return {
        id,
        agent: log.speaker === "buyer" ? "buyer" : "seller",
        vendor: log.seller_name,
        title: `"${log.message ?? ""}"`,
      };
    }

    case "validation": {
      const v = d as {
        seller_name?: string;
        status?: string;
        failed_constraints?: string[];
      };
      return {
        id,
        agent: "validation",
        vendor: v.seller_name,
        title: (v.status ?? "").toUpperCase(),
        detail:
          (v.failed_constraints ?? []).length > 0
            ? v.failed_constraints!.join(" · ")
            : "all constraints satisfied",
      };
    }

    case "human_alert": {
      const e = d as { reason?: string; question_for_human?: string };
      return {
        id,
        agent: "escalation",
        title: `Human alert: ${e.reason ?? "review required"}`,
        detail: e.question_for_human,
      };
    }

    case "escalation": {
      return {
        id,
        agent: "escalation",
        title: "Escalation resolved",
        detail: (d as { note?: string }).note,
      };
    }

    case "recommendation": {
      const r = d as {
        recommended_product?: string;
        recommended_seller?: string;
        price_eur?: number;
      };
      return {
        id,
        agent: "orchestrator",
        title: `Recommendation: ${r.recommended_product ?? "ready"}`,
        detail: `${r.recommended_seller} · €${r.price_eur}`,
      };
    }

    case "audit":
      return { id, agent: "orchestrator", title: "Audit summary generated" };

    default:
      return null;
  }
}
