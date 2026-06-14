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
import { DecisionScreen } from "@/components/screens/DecisionScreen";
import {
  initialStatus,
  STAGE_REVEALS,
  STAGES,
  type DemoStatus,
  type SectionId,
} from "@/lib/demoMachine";
import { streamDemo, sendStrategyChoice, sendHumanResponse } from "@/lib/stream";
import { displayName } from "@/lib/api";
import type {
  ConversationLog,
  DemoResult,
  EscalationResult,
  HumanAlertData,
  JudgedCandidate,
  MatchedSupplier,
  NegotiationStrategy,
  StreamEvent,
} from "@/lib/types";

interface BuyerWorkspaceProps {
  onLogout: () => void;
  accountLabel?: string;
}

export function BuyerWorkspace({ onLogout, accountLabel = "Horizon Analytics GmbH" }: BuyerWorkspaceProps) {
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

  // Dynamic node visibility driven by real events
  const [visibleNodeIds, setVisibleNodeIds] = useState<Set<string>>(new Set());
  const [nodeChatLines, setNodeChatLines] = useState<Record<string, ConversationLog[]>>({});
  // Live supplier/candidate lists built as stream events arrive (not waiting for done)
  const [liveSuppliers, setLiveSuppliers] = useState<MatchedSupplier[]>([]);
  const [liveJudgedCandidates, setLiveJudgedCandidates] = useState<JudgedCandidate[]>([]);

  // Decision node state — support multiple simultaneous escalations (parallel negotiation)
  const [activeEscalations, setActiveEscalations] = useState<Map<string, EscalationResult>>(new Map());
  const [rejectedSellerIds, setRejectedSellerIds] = useState<Set<string>>(new Set());

  const sessionIdRef = useRef<string | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const chosenStrategyRef = useRef<NegotiationStrategy>("medium");
  const lastNegotiationSellerRef = useRef<string>("");
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
    setActiveEscalations(new Map());
    setRejectedSellerIds(new Set());
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
        const jc = d.judged_candidate as JudgedCandidate | undefined;
        setStatus((s) => ({ ...s, stageIndex: Math.max(s.stageIndex, 1) }));
        setVisibleNodeIds((prev) => new Set([...prev, "clustering", "judging"]));
        if (jc) {
          setLiveJudgedCandidates((prev) => {
            const exists = prev.some((c) => c.cluster_id === jc.cluster_id);
            return exists ? prev : [...prev, jc];
          });
        }
        pushFeed({
          id: `cluster-${d.cluster_id ?? Date.now()}`,
          agent: "cluster",
          title: `Cluster ${d.cluster_id as string} · ${(d.products as unknown[])?.length ?? 0} products`,
          detail: jc ? `Verdict: ${jc.verdict} · ${jc.reason}` : undefined,
        });
        if (jc) {
          pushFeed({
            id: `judge-${d.cluster_id ?? Date.now()}`,
            agent: "judging",
            title: `${jc.verdict} (score ${jc.score})`,
            detail: jc.reason,
          });
        }
        break;
      }

      case "match": {
        const d = event.data as MatchedSupplier;
        setStatus((s) => ({ ...s, stageIndex: Math.max(s.stageIndex, 1) }));
        reveal(STAGE_REVEALS["match"]);
        setVisibleNodeIds((prev) => new Set([...prev, "orchestrator", "matching", d.seller_id]));
        setLiveSuppliers((prev) => {
          const exists = prev.some((s) => s.seller_id === d.seller_id);
          return exists ? prev : [...prev, d];
        });
        pushFeed({
          id: `match-${d.seller_id}`,
          agent: "orchestrator",
          vendor: displayName(d.seller_name),
          title: `Supplier matched — score ${(d.match_score * 100).toFixed(0)}%`,
          detail: d.reason,
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
            vendor: displayName(log.seller_name),
            title: log.message,
            variant: "fallback",
          });
          break;
        }

        if (log.event_kind === "seller_rejection") {
          pushFeed({
            id: `reject-${log.seller_id}-${Date.now()}`,
            agent: "seller",
            vendor: displayName(log.seller_name),
            title: `Rejected — ${log.message.slice(0, 80)}${log.message.length > 80 ? "…" : ""}`,
            variant: "rejection",
          });
          break;
        }

        if (log.event_kind === "renegotiation_start") {
          // Pull camera + stage back to negotiation so the buyer can watch
          // the new turns land in the winning seller's chat panel.
          setStatus((s) => ({ ...s, stageIndex: 2 }));
          if (log.seller_id) {
            setVisibleNodeIds((prev) => new Set([...prev, "negotiation", log.seller_id]));
          }
          pushFeed({
            id: `renegotiate-${Date.now()}`,
            agent: "orchestrator",
            title: log.message,
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
          next.add("sub-price");
          next.add("sub-delivery");
          next.add("sub-warranty");
          next.add("sub-risk");
          if (log.seller_id) next.add(log.seller_id);
          return next;
        });
        if (log.seller_id && log.speaker !== "system") {
          lastNegotiationSellerRef.current = log.seller_id;
          setNodeChatLines((prev) => ({
            ...prev,
            [log.seller_id]: [...(prev[log.seller_id] ?? []), log],
          }));
        }
        pushFeed({
          id: `chat-${log.seller_id}-r${log.round}-${log.speaker}-${Date.now()}`,
          agent: log.speaker === "buyer" ? "buyer" : "seller",
          vendor: displayName(log.seller_name),
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
          vendor: displayName(d.seller_name as string),
          title: (d.status as string).toUpperCase(),
          detail: (d.failed_constraints as string[])?.join(" · ") || "all constraints satisfied",
        });
        break;
      }

      case "human_alert": {
        const d = event.data as HumanAlertData;
        if (d.trigger === "strategy_selection") {
          // Auto-respond with the strategy chosen upfront — no modal
          const strategy = chosenStrategyRef.current;
          const sid = d.session_id ?? sessionIdRef.current;
          if (sid) {
            sendStrategyChoice(sid, strategy).catch(() => {});
          }
          pushFeed({
            id: `strategy-alert-${Date.now()}`,
            agent: "strategy",
            title: `Strategy: ${strategy} (pre-selected)`,
          });
        } else {
          // Escalation / approval alert
          const escalation: EscalationResult = {
            escalate: true,
            trigger: d.trigger,
            reason: d.question ?? "",
            question_for_human: d.question ?? "",
            renegotiate_used: d.renegotiate_used,
            has_winning_offer: d.has_winning_offer,
          };

          // Show a decision node for every supplier that has negotiated
          const allSuppliers = result?.matched_suppliers ?? liveSuppliers;
          const suppliersWithChats = allSuppliers.filter(
            s => (nodeChatLines[s.seller_id]?.length ?? 0) > 0,
          );
          // Fallback: if no chats yet, use all matched suppliers
          const decisionTargets = suppliersWithChats.length > 0 ? suppliersWithChats : allSuppliers;

          const allEscalations = new Map<string, EscalationResult>();
          for (const s of decisionTargets) {
            allEscalations.set(s.seller_id, { ...escalation });
          }
          setActiveEscalations(allEscalations);
          setStatus((s) => ({ ...s, phase: "awaiting_approval", stageIndex: Math.max(s.stageIndex, 4) }));
          reveal(STAGE_REVEALS["escalate"]);
          pushFeed({
            id: `escalate-alert-${Date.now()}`,
            agent: "escalation",
            title: "Awaiting your decision…",
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
        setVisibleNodeIds((prev) => new Set([...prev, "audit"]));
        pushFeed({
          id: `audit-${Date.now()}`,
          agent: "audit",
          title: "Audit summary ready",
          detail: ((event.data as Record<string, unknown>).text as string)?.slice(0, 80),
        });
        setVisibleNodeIds((prev) => new Set([...prev, "audit-done"]));
        break;
      }

      case "pioneer": {
        const d = event.data as Record<string, unknown>;
        if (d.status === "labeling") {
          setVisibleNodeIds((prev) => new Set([...prev, "pioneer"]));
          pushFeed({ id: `pioneer-${Date.now()}`, agent: "validation", title: "Pioneer classifying seller messages…" });
        } else {
          setVisibleNodeIds((prev) => new Set([...prev, "pioneer-done"]));
          pushFeed({ id: `pioneer-done-${Date.now()}`, agent: "validation", title: `Pioneer labeled ${(d.labeled_count as number) ?? 0} turn(s)` });
        }
        break;
      }

      case "tavily": {
        const d = event.data as Record<string, unknown>;
        if (d.status === "searching") {
          setVisibleNodeIds((prev) => new Set([...prev, "tavily"]));
          pushFeed({ id: `tavily-${Date.now()}`, agent: "orchestrator", title: "Tavily searching for supplier data…" });
        } else {
          setVisibleNodeIds((prev) => new Set([...prev, "tavily-done"]));
          pushFeed({ id: `tavily-done-${Date.now()}`, agent: "orchestrator", title: `Tavily found ${(d.results_count as number) ?? 0} external result(s)` });
        }
        break;
      }

      case "fal": {
        const d = event.data as Record<string, unknown>;
        if (d.status === "generating") {
          setVisibleNodeIds((prev) => new Set([...prev, "fal"]));
          pushFeed({ id: `fal-${Date.now()}`, agent: "orchestrator", title: "fal generating deal card image…" });
        } else {
          setVisibleNodeIds((prev) => new Set([...prev, "fal-done"]));
          pushFeed({ id: `fal-done-${Date.now()}`, agent: "orchestrator", title: "Deal card generated" });
        }
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
    (req: { raw_request: string; region: string; strategy: NegotiationStrategy }) => {
      // Store strategy for auto-responding to the HITL pause
      chosenStrategyRef.current = req.strategy;

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
      setLiveSuppliers([]);
      setLiveJudgedCandidates([]);

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
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendStrategyChoice(sid, strategy);
    } catch {
      // non-fatal — backend will default to medium if no response arrives
    }
  }, []);

  const handleDecide = useCallback(async (sellerId: string, d: "approved" | "rejected" | "renegotiate" | "restart", note?: string) => {
    // Remove this supplier's decision node from visible set
    setVisibleNodeIds(prev => {
      const next = new Set(prev);
      next.delete(`decision-${sellerId}`);
      return next;
    });

    // If rejecting, mark this seller as rejected (for visual feedback on node)
    if (d === "rejected") {
      setRejectedSellerIds(prev => new Set([...prev, sellerId]));
    }

    // Remove from active escalations
    setActiveEscalations(prev => {
      const next = new Map(prev);
      next.delete(sellerId);
      return next;
    });

    if (d === "restart") {
      reset();
      return;
    }
    if (d === "renegotiate") {
      // Drop stage back to "negotiate" so the AgentNetwork camera refocuses
      // on the seller chat panels — otherwise new turns silently append while
      // the view is parked on Escalate.
      setStatus((s) => ({ ...s, phase: "running", stageIndex: 2 }));
      const sid = sessionIdRef.current;
      if (sid) {
        try {
          await sendHumanResponse(sid, "renegotiate", note);
        } catch {
          // non-fatal
        }
      }
      return;
    }

    if (d === "approved") {
      // Approve: move to audit, clear all remaining decision nodes
      setDecision("approved");
      setStatus((s) => ({ ...s, phase: "approved" }));
      setActiveEscalations(new Map());
      const sid = sessionIdRef.current;
      if (sid) {
        try { await sendHumanResponse(sid, "approve"); } catch { /* non-fatal */ }
      }
    } else if (d === "rejected") {
      // Reject this one locally — only tell backend when ALL are rejected
      const remaining = activeEscalations.size - 1; // already deleted above
      if (remaining === 0) {
        setDecision("rejected");
        setStatus((s) => ({ ...s, phase: "rejected" }));
        const sid = sessionIdRef.current;
        if (sid) {
          try { await sendHumanResponse(sid, "reject"); } catch { /* non-fatal */ }
        }
      }
      // If remaining > 0, stay in awaiting_approval — other decision nodes still visible
    }
  }, [reset]);

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

          <div className="flex min-h-0 flex-col flex-1">
            <div className="flex min-h-0 flex-1">
              <div className="flex-1 border-r border-border">
                <AgentNetwork
                  stageIndex={status.stageIndex}
                  phase={heroPhase}
                  activeSeller={activeSeller}
                  onSelectSeller={setActiveSeller}
                  canInteract={showSection("negotiation")}
                  suppliers={result?.matched_suppliers ?? liveSuppliers}
                  visibleNodeIds={visibleNodeIds}
                  chatLines={nodeChatLines}
                  requestLabel={requestLabel}
                  judgedCandidates={result?.judged_candidates ?? liveJudgedCandidates}
                  rejectedSellerIds={rejectedSellerIds}
                  escalations={activeEscalations}
                  onEscalationDecide={handleDecide}
                />
              </div>

              <div className="flex w-72 shrink-0 flex-col bg-white">
                <div className="min-h-0 flex-1">
                  <ActivityFeed
                    items={feed}
                    demoMode={result?.demo_mode}
                  />
                </div>
              </div>
            </div>

          </div>

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
                  onDecide={(d) => handleDecide(activeSeller || result.negotiation_outcome?.winning_seller_id || "", d)}
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
