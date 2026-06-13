"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import gsap from "gsap";
import { TopBar } from "@/components/shell/TopBar";
import { StageStrip } from "@/components/shell/StageStrip";
import { AgentNetwork } from "@/components/hero/AgentNetwork";
import { RequestForm } from "@/components/input/RequestForm";
import { ActivityFeed, type FeedItem } from "@/components/feed/ActivityFeed";
import { EscalationModal } from "@/components/modals/EscalationModal";
import { DecisionScreen } from "@/components/screens/DecisionScreen";
import {
  initialStatus,
  STAGE_DURATION_MS,
  STAGE_REVEALS,
  STAGES,
  type DemoStatus,
  type SectionId,
} from "@/lib/demoMachine";
import { runDemo } from "@/lib/api";
import type { ConversationLog, DemoResult } from "@/lib/types";

// Negotiate stage animation timing
const SELLER_SPAWN_INTERVAL = 220; // ms between each seller node appearing
const CHAT_START_DELAY = 450;      // ms after last seller before first chat message
const CHAT_INTERVAL = 520;         // ms between each chat message

export default function Page() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [status, setStatus] = useState<DemoStatus>(() => ({
    ...initialStatus,
    revealedSections: new Set(),
  }));
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [activeSeller, setActiveSeller] = useState<string>("");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dynamic node visibility — empty on start, nodes spawn progressively
  const [visibleNodeIds, setVisibleNodeIds] = useState<Set<string>>(new Set());
  // Live chat lines per seller, dripped in during negotiate stage
  const [nodeChatLines, setNodeChatLines] = useState<Record<string, ConversationLog[]>>({});

  const timeoutsRef = useRef<number[]>([]);
  const stepRef = useRef<HTMLDivElement>(null);

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // GSAP curtain-wipe between steps
  useLayoutEffect(() => {
    const el = stepRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { clipPath: "inset(0 100% 0 0)", opacity: 0.6 },
        { clipPath: "inset(0 0% 0 0)", opacity: 1, duration: 0.6, ease: "power3.inOut" },
      );
    }, el);
    return () => ctx.revert();
  }, [step]);

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

  const reset = useCallback(() => {
    clearTimers();
    setStep(1);
    setStatus({ phase: "idle", stageIndex: -1, revealedSections: new Set() });
    setFeed([]);
    setDecision(null);
    setResult(null);
    setError(null);
    setActiveSeller("");
    setVisibleNodeIds(new Set());
    setNodeChatLines({});
  }, [clearTimers]);

  const start = useCallback(
    async (req: { raw_request: string; region: string; priority: string }) => {
      clearTimers();
      setFeed([]);
      setDecision(null);
      setError(null);
      setResult(null);
      setActiveSeller("");
      setVisibleNodeIds(new Set());
      setNodeChatLines({});
      setStatus({ phase: "running", stageIndex: 0, revealedSections: new Set() });
      setStep(2);

      let demo: DemoResult;
      try {
        demo = await runDemo(req);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to run demo");
        setStatus({ ...initialStatus, revealedSections: new Set() });
        return;
      }

      setResult(demo);
      setActiveSeller(
        [...demo.matched_suppliers].sort((a, b) => b.match_score - a.match_score)[0]
          ?.seller_id ?? "",
      );

      // Dynamic negotiate duration — long enough for all chat to drip in
      const negotiateDuration = Math.max(
        demo.matched_suppliers.length * SELLER_SPAWN_INTERVAL
          + CHAT_START_DELAY
          + demo.conversation_logs.length * CHAT_INTERVAL
          + 600,
        3000,
      );

      const stageDurations: Record<string, number> = {
        ...STAGE_DURATION_MS,
        negotiate: negotiateDuration,
      };

      // All schedules are registered at ~t=0 from start() so ms values are absolute
      const schedule = (ms: number, fn: () => void) => {
        const id = window.setTimeout(fn, ms);
        timeoutsRef.current.push(id);
      };

      // Pre-compute stage start times
      const matchStart = stageDurations.intel;
      const negotiateStart = matchStart + stageDurations.match;

      // ── Node reveal schedule ─────────────────────────────────────────────
      // Request spawns immediately (stage 0)
      schedule(0, () => setVisibleNodeIds(new Set(["request"])));
      // Orchestrator spawns at match stage start
      schedule(matchStart, () =>
        setVisibleNodeIds((prev) => new Set([...prev, "orchestrator"])),
      );
      // BuyerAgent spawns at negotiate stage start
      schedule(negotiateStart, () =>
        setVisibleNodeIds((prev) => new Set([...prev, "buyerAgent"])),
      );
      // Sellers spawn one by one, best match first
      [...demo.matched_suppliers]
        .sort((a, b) => b.match_score - a.match_score)
        .forEach((s, i) => {
          schedule(negotiateStart + SELLER_SPAWN_INTERVAL * (i + 1), () => {
            setVisibleNodeIds((prev) => new Set([...prev, s.seller_id]));
          });
        });

      // ── Chat drip — one message at a time into each seller node ──────────
      const chatStart =
        negotiateStart
        + demo.matched_suppliers.length * SELLER_SPAWN_INTERVAL
        + CHAT_START_DELAY;

      demo.conversation_logs.forEach((log, i) => {
        schedule(chatStart + i * CHAT_INTERVAL, () => {
          // Update canvas node chat
          setNodeChatLines((prev) => ({
            ...prev,
            [log.seller_id]: [...(prev[log.seller_id] ?? []), log],
          }));
          // Mirror to activity feed
          const vendor =
            demo.matched_suppliers.find((s) => s.seller_id === log.seller_id)
              ?.seller_name ?? log.seller_id;
          pushFeed({
            id: `chat-${i}`,
            agent: log.speaker === "buyer" ? "buyer" : "seller",
            vendor,
            title: `"${log.message.length > 90 ? log.message.slice(0, 90) + "…" : log.message}"`,
          });
          if (log.speaker === "seller" && log.pioneer_labels.length > 0) {
            const fields = Object.entries(log.extracted_fields ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ");
            pushFeed({
              id: `pioneer-${i}`,
              agent: "pioneer",
              vendor,
              title: `Labeled: ${log.pioneer_labels.join(", ")}`,
              detail: fields || undefined,
            });
          }
        });
      });

      // ── Stage scheduling loop (standard orchestration) ───────────────────
      let elapsed = 0;
      STAGES.forEach((stage, i) => {
        schedule(elapsed, () => {
          setStatus((s) => ({ ...s, stageIndex: i }));
          emitStageStart(i, demo, pushFeed);
        });
        const duration = stageDurations[stage.id] ?? STAGE_DURATION_MS[stage.id];
        schedule(elapsed + duration, () => {
          reveal(STAGE_REVEALS[stage.id]);
          emitStageEnd(i, demo, pushFeed);
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
    },
    [clearTimers, pushFeed, reveal],
  );

  const handleDecide = useCallback((d: "approved" | "rejected") => {
    setDecision(d);
    setStatus((s) => ({ ...s, phase: d === "approved" ? "approved" : "rejected" }));
  }, []);

  const showSection = (id: SectionId) => status.revealedSections.has(id);
  const isIdle = status.phase === "idle";
  const isRunning = status.phase === "running";
  // runComplete: user decided, OR pipeline finished with no escalation needed
  const runComplete =
    decision !== null ||
    (status.phase === "awaiting_approval" && result?.escalation_result?.escalate === false);
  const heroPhase = useMemo(() => status.phase, [status.phase]);

  return (
    <div className="min-h-screen bg-bg text-text-1">
      {/* ── STEP 1: REQUEST ──────────────────────────────────────────────── */}
      {step === 1 && (
        <div ref={stepRef} className="flex min-h-[100dvh] flex-col bg-white">
          {/* Minimal top bar */}
          <header className="flex h-14 shrink-0 items-center justify-between px-8">
            <div className="flex items-center gap-2.5">
              <svg aria-hidden width="14" height="14" viewBox="0 0 18 18" className="text-accent">
                <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
                <rect x="8" y="8" width="9" height="9" fill="currentColor" />
              </svg>
              <span className="text-[13px] font-semibold tracking-tight text-text-1">Pactum</span>
            </div>
            <span className="text-[11px] text-text-3">NovaCompute GmbH</span>
          </header>

          {/* Centered content */}
          <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
            {/* Wordmark */}
            <h1 className="mb-3 text-[clamp(2.4rem,5.5vw,3.8rem)] font-bold tracking-[-0.035em] text-text-1">
              Pactum
            </h1>

            {/* Subtitle */}
            <p className="mb-8 text-[15px] text-text-2">
              Multi-agent B2B procurement negotiation
            </p>

            {/* Request form */}
            <RequestForm onStart={start} disabled={isRunning || !isIdle} />
          </main>
        </div>
      )}

      {/* ── STEP 2: LIVE AGENT NETWORK ───────────────────────────────────── */}
      {step === 2 && (
        <div ref={stepRef} className="relative flex h-screen flex-col bg-surface">
          <TopBar />
          <StageStrip stageIndex={status.stageIndex} />

          {error && (
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-danger-soft px-8 py-2">
              <span className="text-[12px] font-medium text-danger">Error — {error}</span>
              <button onClick={reset} className="text-[12px] text-text-3 underline hover:text-text-1">
                ← New request
              </button>
            </div>
          )}

          <div className="flex min-h-0 flex-1">
            {/* Main canvas */}
            <div className="flex-1 border-r border-border">
              <AgentNetwork
                stageIndex={status.stageIndex}
                phase={heroPhase}
                activeSeller={activeSeller}
                onSelectSeller={setActiveSeller}
                canInteract={showSection("negotiation")}
                suppliers={result?.matched_suppliers ?? []}
                visibleNodeIds={visibleNodeIds}
                chatLines={nodeChatLines}
              />
            </div>

            {/* Right rail */}
            <div className="flex w-72 shrink-0 flex-col bg-white">
              <div className="min-h-0 flex-1">
                <ActivityFeed items={feed} />
              </div>
            </div>
          </div>

          {/* Escalation modal — overlays Step 2 when pipeline needs human decision */}
          {status.phase === "awaiting_approval" &&
            result?.escalation_result?.escalate === true &&
            decision === null && (
              <EscalationModal
                data={result.escalation_result}
                onDecide={handleDecide}
              />
            )}

          {/* Bottom bar */}
          <div className="flex h-12 shrink-0 items-center justify-between border-t border-border bg-white px-8">
            <button
              onClick={reset}
              className="text-[12px] font-medium text-text-3 transition-colors hover:text-text-1"
            >
              ← New request
            </button>

            {runComplete ? (
              <button
                onClick={() => setStep(3)}
                className="rounded-full bg-accent px-5 py-2 text-[12px] font-semibold text-white transition-all hover:bg-accent/90 active:scale-[0.97]"
              >
                Review Results →
              </button>
            ) : (
              <span className="text-[12px] font-medium text-text-3">
                {status.phase === "running"
                  ? "● Processing…"
                  : status.phase === "awaiting_approval"
                    ? "⚠ Awaiting decision"
                    : "Standby"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: DECISION ─────────────────────────────────────────────── */}
      {step === 3 && (
        <div ref={stepRef} className="flex h-screen flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-white px-8">
            <button
              onClick={() => setStep(2)}
              className="text-[12px] font-medium text-text-3 transition-colors hover:text-text-1"
            >
              ← Back to network
            </button>
            <span className="text-[12px] font-semibold text-text-1">Decision Required</span>
            <button
              onClick={reset}
              className="text-[12px] font-medium text-accent hover:text-accent/80"
            >
              New request
            </button>
          </header>

          <div className="flex-1 overflow-auto bg-surface">
            <div className="mx-auto max-w-[860px] px-8 py-6">
              {result && (
                <DecisionScreen
                  result={result}
                  decision={decision}
                  onDecide={handleDecide}
                  activeSeller={activeSeller}
                  onSelectSeller={setActiveSeller}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function emitStageStart(i: number, demo: DemoResult, push: (it: FeedItem) => void) {
  const events: FeedItem[][] = [
    [{ id: "s0-start", agent: "orchestrator", title: "Routing to Procurement Intelligence Agent" }],
    [{ id: "s1-start", agent: "system", title: "Querying internal supplier registry" }],
    [{ id: "s2-start", agent: "buyer", title: `Opening negotiations with ${demo.matched_suppliers.length} sellers`, detail: "Round 1 dispatch" }],
    [{ id: "s3-start", agent: "validation", title: "Running deterministic constraint checks" }],
    [{ id: "s4-start", agent: "escalation", title: "Evaluating escalation triggers" }],
    [{ id: "s5-start", agent: "orchestrator", title: "Compiling audit summary" }],
  ];
  events[i]?.forEach(push);
}

function emitStageEnd(i: number, demo: DemoResult, push: (it: FeedItem) => void) {
  const req = demo.structured_requirements;

  if (i === 0) {
    push({
      id: "s0-end",
      agent: "orchestrator",
      title: `Extracted ${Object.keys(req).length} structured requirements`,
      detail: `budget €${req.budget_eur} · max ${req.max_length_mm}mm · ${req.max_delivery_days}d delivery`,
    });
    return;
  }

  if (i === 1) {
    push({ id: "s1-end1", agent: "system", title: `${demo.matched_suppliers.length} candidate suppliers ranked` });
    if (demo.tavily_enrichment.triggered) {
      push({ id: "s1-end2", agent: "tavily", title: "External enrichment triggered", detail: `${demo.tavily_enrichment.results.length} results` });
    }
    return;
  }

  if (i === 2) {
    // Chat messages dripped in via schedule — just emit a summary
    push({
      id: "s2-end",
      agent: "buyer",
      title: `Negotiation complete — ${demo.matched_suppliers.length} vendors`,
      detail: `${demo.conversation_logs.length} messages exchanged`,
    });
    return;
  }

  if (i === 3) {
    demo.validation_results.forEach((r) => {
      push({
        id: `s3-${r.seller_id}`,
        agent: "validation",
        vendor: r.seller_name,
        title: r.status.toUpperCase(),
        detail: r.failed_constraints.length > 0 ? r.failed_constraints.join(" · ") : "all constraints satisfied",
      });
    });
    return;
  }

  if (i === 4) {
    push({
      id: "s4-end",
      agent: "escalation",
      title: demo.escalation_result.escalate ? `Trigger: ${demo.escalation_result.trigger}` : "No escalation required",
      detail: demo.escalation_result.reason,
    });
    return;
  }

  if (i === 5) {
    const rec = demo.final_recommendation;
    push({
      id: "s5-end",
      agent: "orchestrator",
      title: "Recommendation ready",
      detail: `${rec.recommended_seller} · ${rec.recommended_product} · €${rec.price_eur}`,
    });
  }
}
