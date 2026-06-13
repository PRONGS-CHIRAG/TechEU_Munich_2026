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
  STAGE_DURATION_MS,
  STAGE_REVEALS,
  STAGES,
  type DemoStatus,
  type SectionId,
} from "@/lib/demoMachine";
import { demoResult } from "@/lib/mockData";

export default function Page() {
  const [status, setStatus] = useState<DemoStatus>(() => ({
    ...initialStatus,
    revealedSections: new Set(),
  }));
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [activeSeller, setActiveSeller] = useState<string>("vendor_b");
  const timeoutsRef = useRef<number[]>([]);
  const negotiationRef = useRef<HTMLDivElement>(null);

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

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

  const start = useCallback(() => {
    clearTimers();
    setFeed([]);
    setDecision(null);
    setStatus({ phase: "running", stageIndex: 0, revealedSections: new Set() });

    let elapsed = 0;
    const schedule = (ms: number, fn: () => void) => {
      const id = window.setTimeout(fn, ms);
      timeoutsRef.current.push(id);
    };

    STAGES.forEach((stage, i) => {
      schedule(elapsed, () => {
        setStatus((s) => ({ ...s, stageIndex: i }));
        emitStageStart(i, pushFeed);
      });
      const duration = STAGE_DURATION_MS[stage.id];
      schedule(elapsed + duration, () => {
        reveal(STAGE_REVEALS[stage.id]);
        emitStageEnd(i, pushFeed);
      });
      elapsed += duration;
    });

    schedule(elapsed + 200, () => {
      setStatus((s) => ({
        ...s,
        phase: "awaiting_approval",
        stageIndex: STAGES.length,
      }));
    });
  }, [clearTimers, pushFeed, reveal]);

  const handleDecide = useCallback((d: "approved" | "rejected") => {
    setDecision(d);
    setStatus((s) => ({
      ...s,
      phase: d === "approved" ? "approved" : "rejected",
    }));
  }, []);

  const handleSelectSeller = useCallback((sellerId: string) => {
    setActiveSeller(sellerId);
    // Smooth scroll into view if the chat is already revealed.
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

        <div className="flex flex-col gap-6">
          <Reveal show={showSection("requirements")}>
            <StructuredRequirementsSection
              data={demoResult.structured_requirements}
            />
          </Reveal>

          <Reveal show={showSection("suppliers")}>
            <div className="flex flex-col gap-3">
              <SupplierGrid suppliers={demoResult.matched_suppliers} />
              {showSection("tavily") && (
                <TavilyCard data={demoResult.tavily_enrichment} />
              )}
            </div>
          </Reveal>

          <Reveal show={showSection("negotiation")}>
            <div ref={negotiationRef} className="scroll-mt-32">
              <NegotiationThreads
                logs={demoResult.conversation_logs}
                suppliers={demoResult.matched_suppliers}
                activeSeller={activeSeller}
                onSelectSeller={setActiveSeller}
              />
            </div>
          </Reveal>

          <Reveal show={showSection("validation")}>
            <ValidationTable results={demoResult.validation_results} />
          </Reveal>

          <Reveal show={showSection("escalation")}>
            <EscalationBanner
              data={demoResult.escalation_result}
              decided={decision}
              onDecide={handleDecide}
            />
          </Reveal>

          <Reveal show={showSection("recommendation")}>
            <FinalRecommendationSection
              rec={demoResult.final_recommendation}
              requestId={demoResult.request.request_id}
              approved={approved}
              onApprove={() => handleDecide("approved")}
            />
          </Reveal>

          <Reveal show={showSection("audit")}>
            <AuditSummary summary={demoResult.audit_summary} />
          </Reveal>
        </div>

        <footer className="mt-12 border-t border-border pt-4 pb-8 text-center font-mono text-[10.5px] text-text-3">
          Pactum · multi-agent B2B procurement · scaffolded demo
        </footer>
      </main>
    </div>
  );
}

function emitStageStart(i: number, push: (it: FeedItem) => void) {
  const events: FeedItem[][] = [
    [
      {
        id: `s0-start`,
        agent: "orchestrator",
        title: "Routing request to Procurement Intelligence Agent",
      },
    ],
    [
      {
        id: `s1-start`,
        agent: "system",
        title: "Querying internal supplier registry",
      },
    ],
    [
      {
        id: `s2-start`,
        agent: "buyer",
        title: "Opening conversations with 5 sellers",
        detail: "Round 1 dispatch",
      },
    ],
    [
      {
        id: `s3-start`,
        agent: "validation",
        title: "Running deterministic constraint checks",
      },
    ],
    [
      {
        id: `s4-start`,
        agent: "escalation",
        title: "Evaluating escalation triggers",
      },
    ],
    [
      {
        id: `s5-start`,
        agent: "orchestrator",
        title: "Compiling audit summary",
      },
    ],
  ];
  events[i]?.forEach(push);
}

function emitStageEnd(i: number, push: (it: FeedItem) => void) {
  const events: FeedItem[][] = [
    [
      {
        id: `s0-end1`,
        agent: "orchestrator",
        title: "Extracted 8 structured requirements",
        detail: "budget €650 · max 300mm · 7d delivery",
      },
    ],
    [
      {
        id: `s1-end1`,
        agent: "system",
        title: "Internal match surfaced only 1 fully compatible vendor",
      },
      {
        id: `s1-end2`,
        agent: "tavily",
        title: "External enrichment triggered",
        detail: "2 supporting results",
      },
      {
        id: `s1-end3`,
        agent: "orchestrator",
        title: "5 suppliers ranked by Supplier Matching Agent",
      },
    ],
    [
      {
        id: `s2-end1`,
        agent: "seller",
        vendor: "Vendor B",
        title: '"RTX 4070 Super Compact at €670, 267mm, 220W..."',
      },
      {
        id: `s2-end2`,
        agent: "pioneer",
        vendor: "Vendor B",
        title: "Labeled: technical_info",
        detail: "extracted price €670 · 5d · 2yr",
      },
      {
        id: `s2-end3`,
        agent: "buyer",
        vendor: "Vendor B",
        title: '"Price is €20 above budget. Can you offer at €650?"',
      },
      {
        id: `s2-end4`,
        agent: "seller",
        vendor: "Vendor B",
        title: '"We can offer the Promo at €640 including delivery."',
      },
      {
        id: `s2-end5`,
        agent: "pioneer",
        vendor: "Vendor B",
        title: "Labeled: price_concession, final_offer",
        detail: "extracted price €640",
      },
    ],
    [
      {
        id: `s3-end1`,
        agent: "validation",
        vendor: "Vendor B",
        title: "PASSED",
        detail: "267≤300 · 220≤250 · 640≤650 · 5≤7 · 2≥1",
      },
      {
        id: `s3-end2`,
        agent: "validation",
        vendor: "Vendor C",
        title: "NEGOTIABLE",
        detail: "power > 250W · warranty < 1yr",
      },
      {
        id: `s3-end3`,
        agent: "validation",
        vendor: "Vendor A (RTX 4080)",
        title: "REJECTED",
        detail: "3 constraints failed",
      },
    ],
    [
      {
        id: `s4-end1`,
        agent: "escalation",
        title: "Trigger: two close offers · warranty risk",
      },
    ],
    [
      {
        id: `s5-end1`,
        agent: "orchestrator",
        title: "Recommendation ready",
        detail: "Vendor B · RTX 4070 Super Compact · €640",
      },
    ],
  ];
  events[i]?.forEach(push);
}
