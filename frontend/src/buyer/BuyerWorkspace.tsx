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
import { motion } from "motion/react";
import { TopBar } from "@/components/shell/TopBar";
import { StageStrip } from "@/components/shell/StageStrip";
import { AgentNetwork } from "@/components/hero/AgentNetwork";
import { RequestForm } from "@/components/input/RequestForm";
import { ActivityFeed, type FeedItem } from "@/components/feed/ActivityFeed";
import { EscalationModal } from "@/components/modals/EscalationModal";
import { StrategyModal } from "@/components/modals/StrategyModal";
import { DealComparisonModal } from "@/components/modals/DealComparisonModal";
import { DecisionScreen } from "@/components/screens/DecisionScreen";
import {
  initialStatus,
  STAGE_REVEALS,
  STAGES,
  type DemoStatus,
  type SectionId,
} from "@/lib/demoMachine";
import { streamDemo, sendStrategyChoice, sendHumanResponse, sendDealChoice } from "@/lib/stream";
import type {
  ConversationLog,
  DealComparisonRow,
  DemoResult,
  EscalationResult,
  HumanAlertData,
  NegotiationStrategy,
  StrategyOption,
  StreamEvent,
} from "@/lib/types";

interface BuyerWorkspaceProps {
  onLogout: () => void;
  accountLabel?: string;
}

export function BuyerWorkspace({ onLogout, accountLabel = "NovaCompute GmbH" }: BuyerWorkspaceProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [status, setStatus] = useState<DemoStatus>(() => ({
    ...initialStatus,
    revealedSections: new Set(),
  }));
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [activeSeller, setActiveSeller] = useState<string>("");
  const [result, setResult] = useState<DemoResult | null>(null);
  const [requestLabel, setRequestLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Streaming-specific state
  const [strategyAlert, setStrategyAlert] = useState<{ session_id: string; options: StrategyOption[] } | null>(null);
  const [escalationAlert, setEscalationAlert] = useState<EscalationResult | null>(null);
  const [dealAlert, setDealAlert] = useState<{ session_id: string; rows: DealComparisonRow[] } | null>(null);

  // Dynamic node visibility driven by real events
  const [visibleNodeIds, setVisibleNodeIds] = useState<Set<string>>(new Set());
  const [nodeChatLines, setNodeChatLines] = useState<Record<string, ConversationLog[]>>({});

  const sessionIdRef = useRef<string | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);

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
    setFeed((f) => [...f, { ...item, ts: Date.now() }]);
  }, []);

  const reset = useCallback(() => {
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;
    sessionIdRef.current = null;
    setStep(1);
    setStatus({ phase: "idle", stageIndex: -1, revealedSections: new Set() });
    setFeed([]);
    setDecision(null);
    setResult(null);
    setError(null);
    setActiveSeller("");
    setRequestLabel("");
    setVisibleNodeIds(new Set());
    setNodeChatLines({});
    setStrategyAlert(null);
    setEscalationAlert(null);
    setDealAlert(null);
  }, []);

  const logout = useCallback(() => {
    reset();
    onLogout();
  }, [onLogout, reset]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => { streamCleanupRef.current?.(); };
  }, []);

  const handleEvent = useCallback((event: StreamEvent) => {
    // Capture session_id from the first event that carries it
    if (event.session_id && !sessionIdRef.current) {
      sessionIdRef.current = event.session_id;
    }

    switch (event.type) {
      case "requirements": {
        const d = event.data as Record<string, unknown>;
        setVisibleNodeIds((prev) => new Set([...prev, "procurement"]));
        if (d.product_type) {
          // Actual requirements extracted (not the status message)
          const budget = d.budget_eur ? ` · €${d.budget_eur as number}` : "";
          setRequestLabel(`${d.product_type as string}${budget}`);
          setStatus((s) => ({ ...s, stageIndex: 0 }));
          reveal(STAGE_REVEALS["intel"]);
          pushFeed({
            id: `req-${Date.now()}`,
            agent: "orchestrator",
            title: `Requirements extracted — ${d.product_type as string}`,
            detail: `budget €${d.budget_eur as number} · ${d.max_delivery_days as number}d delivery`,
          });
        } else {
          pushFeed({
            id: `req-status-${Date.now()}`,
            agent: "orchestrator",
            title: (d.message as string) ?? "Extracting requirements…",
          });
        }
        break;
      }

      case "cluster": {
        const d = event.data as Record<string, unknown>;
        const jc = d.judged_candidate as Record<string, unknown> | undefined;
        setStatus((s) => ({ ...s, stageIndex: Math.max(s.stageIndex, 1) }));
        setVisibleNodeIds((prev) => new Set([...prev, "clustering", "judging"]));
        pushFeed({
          id: `cluster-${d.cluster_id ?? Date.now()}`,
          agent: "cluster",
          title: `Cluster ${d.cluster_id as string} · ${(d.products as unknown[])?.length ?? 0} products`,
          detail: jc ? `Verdict: ${jc.verdict as string} · ${jc.reason as string}` : undefined,
        });
        if (jc) {
          pushFeed({
            id: `judge-${d.cluster_id ?? Date.now()}`,
            agent: "judging",
            title: `${jc.verdict as string} (score ${jc.score as number})`,
            detail: jc.reason as string,
          });
        }
        break;
      }

      case "match": {
        const d = event.data as Record<string, unknown>;
        setStatus((s) => ({ ...s, stageIndex: Math.max(s.stageIndex, 1) }));
        reveal(STAGE_REVEALS["match"]);
        setVisibleNodeIds((prev) => new Set([...prev, "orchestrator", "matching", d.seller_id as string]));
        pushFeed({
          id: `match-${d.seller_id as string}`,
          agent: "orchestrator",
          vendor: d.seller_name as string,
          title: `Supplier matched — score ${((d.match_score as number) * 100).toFixed(0)}%`,
          detail: d.reason as string,
        });
        break;
      }

      case "negotiation_turn": {
        const log = event.data as ConversationLog & Record<string, unknown>;

        if (log.event_kind === "strategy_selected") {
          pushFeed({
            id: `strategy-${Date.now()}`,
            agent: "strategy",
            title: log.message,
          });
          break;
        }

        if (log.event_kind === "supplier_fallback") {
          pushFeed({
            id: `fallback-${Date.now()}`,
            agent: "escalation",
            vendor: log.seller_name,
            title: log.message,
            variant: "fallback",
          });
          break;
        }

        if (log.event_kind === "seller_rejection") {
          pushFeed({
            id: `reject-${log.seller_id}-${Date.now()}`,
            agent: "seller",
            vendor: log.seller_name,
            title: `Rejected — ${log.message.slice(0, 80)}${log.message.length > 80 ? "…" : ""}`,
            variant: "rejection",
          });
          break;
        }

        // Normal negotiation turn
        setStatus((s) => ({
          ...s,
          stageIndex: Math.max(s.stageIndex, 2),
        }));
        reveal(STAGE_REVEALS["negotiate"]);
        setVisibleNodeIds((prev) => {
          const next = new Set(prev);
          next.add("negotiation");
          if (log.seller_id) next.add(log.seller_id);
          return next;
        });
        if (log.seller_id && log.speaker !== "system") {
          setNodeChatLines((prev) => ({
            ...prev,
            [log.seller_id]: [...(prev[log.seller_id] ?? []), log],
          }));
        }
        pushFeed({
          id: `chat-${log.seller_id}-r${log.round}-${log.speaker}-${Date.now()}`,
          agent: log.speaker === "buyer" ? "buyer" : "seller",
          vendor: log.seller_name,
          title: `"${log.message.length > 90 ? log.message.slice(0, 90) + "…" : log.message}"`,
          detail: `Round ${log.round}`,
        });
        break;
      }

      case "validation": {
        const d = event.data as Record<string, unknown>;
        setStatus((s) => ({ ...s, stageIndex: Math.max(s.stageIndex, 3) }));
        reveal(STAGE_REVEALS["pioneer"]);
        pushFeed({
          id: `val-${d.seller_id as string}-${Date.now()}`,
          agent: "validation",
          vendor: d.seller_name as string,
          title: (d.status as string).toUpperCase(),
          detail: (d.failed_constraints as string[])?.join(" · ") || "all constraints satisfied",
        });
        break;
      }

      case "human_alert": {
        const d = event.data as HumanAlertData;
        if (d.trigger === "strategy_selection") {
          setStrategyAlert({
            session_id: d.session_id,
            options: d.strategy_options ?? [],
          });
          pushFeed({
            id: `strategy-alert-${Date.now()}`,
            agent: "strategy",
            title: "Strategy selection required",
            detail: "Waiting for user input…",
          });
        } else if (d.trigger === "deal_comparison") {
          setDealAlert({
            session_id: d.session_id,
            rows: d.comparison_table ?? [],
          });
          setStatus((s) => ({ ...s, phase: "awaiting_approval", stageIndex: Math.max(s.stageIndex, 4) }));
          reveal(STAGE_REVEALS["escalate"]);
          const selectable = (d.comparison_table ?? []).filter((r) => !r.is_rejected).length;
          pushFeed({
            id: `deal-comparison-${Date.now()}`,
            agent: "escalation",
            title: `Deal comparison ready — ${selectable} offer${selectable !== 1 ? "s" : ""} to review`,
            detail: "Select a deal to approve or reject all",
          });
        } else {
          // Escalation / approval alert (legacy path)
          const escalation: EscalationResult = {
            escalate: true,
            trigger: d.trigger,
            reason: d.question ?? "",
            question_for_human: d.question ?? "",
          };
          setEscalationAlert(escalation);
          setStatus((s) => ({ ...s, phase: "awaiting_approval", stageIndex: Math.max(s.stageIndex, 4) }));
          reveal(STAGE_REVEALS["escalate"]);
          pushFeed({
            id: `escalate-alert-${Date.now()}`,
            agent: "escalation",
            title: "Human decision required",
            detail: d.question,
          });
        }
        break;
      }

      case "escalation": {
        const d = event.data as Record<string, unknown>;
        pushFeed({
          id: `esc-${Date.now()}`,
          agent: "escalation",
          title: d.escalate ? `Escalated — ${d.trigger as string}` : "No escalation required",
          detail: d.reason as string,
        });
        break;
      }

      case "recommendation": {
        const d = event.data as Record<string, unknown>;
        setStatus((s) => ({ ...s, stageIndex: Math.max(s.stageIndex, 5) }));
        reveal(STAGE_REVEALS["audit"]);
        pushFeed({
          id: `rec-${Date.now()}`,
          agent: "recommendation",
          title: d.recommended_product
            ? `${d.recommended_product as string} · €${d.price_eur as number}`
            : "No deal reached",
          detail: (d.reason as string)?.slice(0, 100),
        });
        break;
      }

      case "audit": {
        pushFeed({
          id: `audit-${Date.now()}`,
          agent: "audit",
          title: "Audit summary ready",
          detail: ((event.data as Record<string, unknown>).text as string)?.slice(0, 80),
        });
        break;
      }

      case "done": {
        const demo = event.data as DemoResult;
        setResult(demo);
        setActiveSeller(
          [...demo.matched_suppliers].sort((a, b) => b.match_score - a.match_score)[0]?.seller_id ?? "",
        );
        setStatus((s) => ({
          ...s,
          phase: s.phase === "awaiting_approval" ? "awaiting_approval" : "awaiting_approval",
          stageIndex: STAGES.length,
        }));
        pushFeed({
          id: `done-${Date.now()}`,
          agent: "orchestrator",
          title: "Run complete",
          detail: `Strategy: ${demo.negotiation_strategy ?? "medium"} · ${demo.negotiation_outcome?.status ?? ""}`,
        });
        break;
      }

      case "error": {
        const d = event.data as Record<string, unknown>;
        setError((d.message as string) ?? "Stream error");
        setStatus({ ...initialStatus, revealedSections: new Set() });
        break;
      }
    }
  }, [pushFeed, reveal]);

  const start = useCallback(
    (req: { raw_request: string; region: string; priority: string }) => {
      // Close any existing stream
      streamCleanupRef.current?.();
      sessionIdRef.current = null;

      setFeed([]);
      setDecision(null);
      setError(null);
      setResult(null);
      setActiveSeller("");
      setVisibleNodeIds(new Set(["request", "orchestrator"]));
      setNodeChatLines({});
      setStrategyAlert(null);
      setEscalationAlert(null);
      setDealAlert(null);

      // Immediate label from the raw request; refined once `requirements` arrives
      const words = req.raw_request.trim().split(/\s+/);
      setRequestLabel(words.slice(0, 5).join(" ") + (words.length > 5 ? "…" : ""));

      setStatus({ phase: "running", stageIndex: 0, revealedSections: new Set() });
      setStep(2);

      const cleanup = streamDemo(
        req,
        handleEvent,
        (_err) => {
          setError("Stream connection failed. Is the backend running?");
          setStatus({ ...initialStatus, revealedSections: new Set() });
        },
      );
      streamCleanupRef.current = cleanup;
    },
    [handleEvent],
  );

  const handleStrategyChoice = useCallback(async (strategy: NegotiationStrategy) => {
    setStrategyAlert(null);
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendStrategyChoice(sid, strategy);
    } catch {
      // non-fatal — backend will default to medium if no response arrives
    }
  }, []);

  const handleDecide = useCallback(async (d: "approved" | "rejected") => {
    setDecision(d);
    setEscalationAlert(null);
    setStatus((s) => ({ ...s, phase: d === "approved" ? "approved" : "rejected" }));
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await sendHumanResponse(sid, d === "approved" ? "approve" : "reject");
      } catch {
        // non-fatal
      }
    }
  }, []);

  const handleDealApprove = useCallback(async (sellerId: string) => {
    setDecision("approved");
    setDealAlert(null);
    setStatus((s) => ({ ...s, phase: "approved" }));
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await sendDealChoice(sid, "approve", sellerId);
      } catch {
        // non-fatal
      }
    }
  }, []);

  const handleDealRejectAll = useCallback(async () => {
    setDecision("rejected");
    setDealAlert(null);
    setStatus((s) => ({ ...s, phase: "rejected" }));
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await sendDealChoice(sid, "reject_all");
      } catch {
        // non-fatal
      }
    }
  }, []);

  const showSection = (id: SectionId) => status.revealedSections.has(id);
  const isIdle = status.phase === "idle";
  const isRunning = status.phase === "running";
  const runComplete =
    result !== null &&
    (decision !== null || result?.escalation_result?.escalate === false);
  const heroPhase = useMemo(() => status.phase, [status.phase]);

  return (
    <div className="min-h-screen bg-bg text-text-1">
      {/* ── STEP 1: REQUEST ──────────────────────────────────────────────── */}
      {step === 1 && (
        <div
          ref={stepRef}
          className="flex min-h-[100dvh] flex-col"
          style={{ background: "radial-gradient(ellipse 90% 55% at 50% 60%, rgba(47,111,237,0.07) 0%, #ffffff 62%)" }}
        >
          <header className="flex h-14 shrink-0 items-center justify-between px-8">
            <div className="flex items-center gap-2">
              <svg aria-hidden width="14" height="14" viewBox="0 0 18 18" className="text-accent">
                <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
                <rect x="8" y="8" width="9" height="9" fill="currentColor" />
              </svg>
              <span className="text-[13px] font-semibold tracking-tight text-text-1">Pactum</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-text-2 shadow-[var(--shadow-sm)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {accountLabel}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-border bg-white px-3 py-1 text-[11px] font-semibold text-text-2 shadow-[var(--shadow-sm)] transition-colors hover:border-accent-border hover:bg-accent-soft hover:text-accent active:scale-[0.98]"
              >
                Sign out
              </button>
            </div>
          </header>

          <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/8 px-3 py-1 text-[11px] font-semibold tracking-[0.1em] text-accent">
                Multi-Agent B2B Procurement
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.48, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}
              className="mt-5 text-[clamp(4rem,8vw,7.5rem)] font-bold leading-[0.88] tracking-[-0.045em] text-text-1"
            >
              Pactum
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, delay: 0.17, ease: [0.23, 1, 0.32, 1] }}
              className="mt-4 max-w-[420px] text-center text-[15px] leading-relaxed text-text-3"
            >
              Five agents discover suppliers, negotiate in real time, and surface the best deal — one button.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, delay: 0.26, ease: [0.23, 1, 0.32, 1] }}
              className="mt-9 w-full"
            >
              <RequestForm onStart={start} disabled={isRunning || !isIdle} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.42 }}
              className="mt-7 flex items-center gap-3.5 text-[11px] text-text-3"
            >
              <span>5 agents</span>
              <span className="h-3 w-px bg-border" />
              <span className="font-medium text-accent">Gemini 2.5 Flash</span>
              <span className="h-3 w-px bg-border" />
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live mode
              </span>
            </motion.div>
          </main>
        </div>
      )}

      {/* ── STEP 2: LIVE AGENT NETWORK ───────────────────────────────────── */}
      {step === 2 && (
        <div ref={stepRef} className="relative flex h-screen flex-col bg-surface">
          <TopBar onLogout={logout} />
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
                requestLabel={requestLabel}
                judgedCandidates={result?.judged_candidates ?? []}
              />
            </div>

            <div className="flex w-72 shrink-0 flex-col bg-white">
              <div className="min-h-0 flex-1">
                <ActivityFeed items={feed} demoMode={result?.demo_mode} />
              </div>
            </div>
          </div>

          {/* Strategy selection modal — pauses stream for user input */}
          {strategyAlert && (
            <StrategyModal
              options={strategyAlert.options}
              onChoose={handleStrategyChoice}
            />
          )}

          {/* Escalation modal — shown on approval_required alert */}
          {escalationAlert && decision === null && (
            <EscalationModal
              data={escalationAlert}
              onDecide={handleDecide}
            />
          )}

          {/* Deal comparison modal — shown after all negotiations complete */}
          {dealAlert && decision === null && (
            <DealComparisonModal
              rows={dealAlert.rows}
              onApprove={handleDealApprove}
              onRejectAll={handleDealRejectAll}
            />
          )}

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
                {strategyAlert
                  ? "⚙ Strategy selection required"
                  : dealAlert
                    ? "⚖ Select a deal to approve"
                    : status.phase === "running"
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
          <TopBar onLogout={logout} />
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-white px-8">
            <button
              onClick={() => setStep(2)}
              className="text-[12px] font-medium text-text-3 transition-colors hover:text-text-1 active:scale-[0.97]"
            >
              ← Back to network
            </button>
            <span className="h-3 w-px bg-border" />
            <span className="text-[12px] font-semibold text-text-1">Decision Required</span>
          </div>

          <div
            className="flex-1 overflow-auto"
            style={{ background: "radial-gradient(ellipse 80% 40% at 50% 0%, rgba(47,111,237,0.05) 0%, #f4f5f9 55%)" }}
          >
            <div className="mx-auto max-w-[920px] px-8 py-6">
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
