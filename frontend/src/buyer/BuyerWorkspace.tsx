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
import { DecisionScreen } from "@/components/screens/DecisionScreen";
import {
  initialStatus,
  STAGES,
  type DemoStatus,
  type SectionId,
} from "@/lib/demoMachine";
import { streamDemo } from "@/lib/stream";
import type { ConversationLog, DemoResult, MatchedSupplier } from "@/lib/types";

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

  // Progressive supplier list — populated from `match` stream events before `done`
  const [streamedSuppliers, setStreamedSuppliers] = useState<MatchedSupplier[]>([]);

  // Dynamic node visibility — empty on start, nodes pop in as each agent event arrives
  const [visibleNodeIds, setVisibleNodeIds] = useState<Set<string>>(new Set());
  // Live chat lines per seller, dripped in as negotiation_turn events arrive
  const [nodeChatLines, setNodeChatLines] = useState<Record<string, ConversationLog[]>>({});

  const streamCleanupRef = useRef<(() => void) | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  const closeStream = useCallback(() => {
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;
  }, []);

  // Close stream on unmount
  useEffect(() => closeStream, [closeStream]);

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
    closeStream();
    setStep(1);
    setStatus({ phase: "idle", stageIndex: -1, revealedSections: new Set() });
    setFeed([]);
    setDecision(null);
    setResult(null);
    setError(null);
    setActiveSeller("");
    setStreamedSuppliers([]);
    setVisibleNodeIds(new Set());
    setNodeChatLines({});
  }, [closeStream]);

  const logout = useCallback(() => {
    reset();
    onLogout();
  }, [onLogout, reset]);

  const start = useCallback(
    (req: { raw_request: string; region: string; priority: string }) => {
      closeStream();
      setFeed([]);
      setDecision(null);
      setError(null);
      setResult(null);
      setActiveSeller("");
      setStreamedSuppliers([]);
      setVisibleNodeIds(new Set());
      setNodeChatLines({});

      // Immediate label from raw request; refined when requirements event arrives
      const words = req.raw_request.trim().split(/\s+/);
      setRequestLabel(words.slice(0, 5).join(" ") + (words.length > 5 ? "…" : ""));
      setStatus({ phase: "running", stageIndex: -1, revealedSections: new Set() });
      setStep(2);

      // Show Request + Orchestrator immediately — no waiting
      setVisibleNodeIds(new Set(["request", "orchestrator"]));

      // Track first seller seen so we can auto-select it
      let firstSellerId = "";

      streamCleanupRef.current = streamDemo(
        req,
        (event) => {
          switch (event.type) {

            case "requirements": {
              const d = event.data as Record<string, unknown>;
              if (d.product_type) {
                const budget = d.budget_eur ? ` · €${d.budget_eur}` : "";
                setRequestLabel(`${d.product_type}${budget}`);
              }
              setStatus(s => ({ ...s, stageIndex: 0 }));
              setVisibleNodeIds(prev => new Set([...prev, "procurement"]));
              if (d.status === "extracting") {
                pushFeed({ id: "req-start", agent: "cluster", title: "Extracting requirements…" });
              } else {
                reveal(["requirements"]);
                pushFeed({ id: "req-done", agent: "cluster", title: "Requirements extracted", detail: String(d.product_type ?? "") });
              }
              break;
            }

            case "agent_status": {
              const as_ = event.data as Record<string, unknown>;
              const agentMap: Record<string, FeedItem["agent"]> = {
                clustering: "cluster",
                supplier_matching: "orchestrator",
                tavily: "tavily",
                pioneer: "pioneer",
                validation: "validation",
                audit: "audit",
              };
              const agentKey = String(as_.agent ?? "system");
              pushFeed({
                id: `status-${agentKey}-${Date.now()}`,
                agent: agentMap[agentKey] ?? "system",
                title: String(as_.message ?? ""),
              });
              break;
            }

            case "judging_start": {
              setVisibleNodeIds(prev => new Set([...prev, "judging"]));
              const d = event.data as Record<string, unknown>;
              const priceDelta = Number(d.price_eur ?? 0) - Number(d.budget_eur ?? 0);
              const deliveryDelta = Number(d.delivery_days ?? 0) - Number(d.max_delivery_days ?? 0);
              const priceStr = priceDelta > 0 ? `€${priceDelta} over budget` : `€${Math.abs(priceDelta)} under budget`;
              const deliveryStr = deliveryDelta > 0 ? `${deliveryDelta}d over limit` : `${Math.abs(deliveryDelta)}d buffer`;
              pushFeed({
                id: `judging-start-${d.cluster_id}`,
                agent: "judging",
                title: `Judging Agent → Gemini: evaluating ${String(d.product ?? "")}`,
                detail: `${priceStr} · ${deliveryStr}`,
              });
              break;
            }

            case "cluster": {
              setStatus(s => ({ ...s, stageIndex: 1 }));
              setVisibleNodeIds(prev => new Set([...prev, "clustering", "judging"]));
              const cand = (event.data as Record<string, unknown>).judged_candidate as Record<string, unknown> | undefined;
              if (cand) {
                const verdict = String(cand.verdict ?? "");
                const score = Number(cand.score ?? 0);
                // Verdict row — product + score in detail, verdict prominent in title
                pushFeed({
                  id: `judge-verdict-${cand.cluster_id}`,
                  agent: "judging",
                  title: `Verdict: ${verdict.toUpperCase()} (score ${score})`,
                  detail: String(cand.product ?? ""),
                });
                // Reasoning row — the full Gemini sentence goes in title so it's readable
                const reason = String(cand.reason ?? "");
                if (reason) {
                  pushFeed({
                    id: `judge-reason-${cand.cluster_id}`,
                    agent: "judging",
                    title: `"${reason}"`,
                  });
                }
              }
              break;
            }

            case "match": {
              const supplier = event.data as MatchedSupplier;
              setStreamedSuppliers(prev =>
                prev.some(s => s.seller_id === supplier.seller_id) ? prev : [...prev, supplier],
              );
              setVisibleNodeIds(prev => new Set([...prev, "matching"]));
              reveal(["suppliers", "tavily"]);
              pushFeed({ id: `match-${supplier.seller_id}`, agent: "orchestrator", title: `Matched: ${supplier.seller_name}`, detail: supplier.reason });
              break;
            }

            case "negotiation_start": {
              const ns = event.data as Record<string, unknown>;
              const verdictTag = ns.verdict ? ` · judged ${String(ns.verdict).toUpperCase()}` : "";
              pushFeed({
                id: `neg-start-${ns.seller_id}`,
                agent: "buyer",
                vendor: String(ns.seller_name ?? ns.seller_id ?? ""),
                title: `Negotiation Agent opening with ${String(ns.seller_name ?? "")}${verdictTag}`,
              });
              break;
            }

            case "negotiation_turn": {
              const log = event.data as ConversationLog;
              setStatus(s => ({ ...s, stageIndex: 2 }));
              setVisibleNodeIds(prev => new Set([...prev, "negotiation", log.seller_id]));
              reveal(["negotiation"]);
              if (!firstSellerId) {
                firstSellerId = log.seller_id;
                setActiveSeller(log.seller_id);
              }
              setNodeChatLines(prev => ({
                ...prev,
                [log.seller_id]: [...(prev[log.seller_id] ?? []), log],
              }));
              // When the buyer agent fires round 1, show which sub-agents it consulted
              if (log.speaker === "buyer" && log.round === 1) {
                pushFeed({
                  id: `subagents-${log.seller_id}`,
                  agent: "orchestrator",
                  vendor: log.seller_name,
                  title: "Sub-agents consulted: Price · Delivery · Warranty · Risk",
                  detail: "building negotiation context for Gemini prompt",
                });
              }
              pushFeed({
                id: `chat-${log.seller_id}-${log.round}-${log.speaker}`,
                agent: log.speaker === "buyer" ? "buyer" : "seller",
                vendor: log.seller_name ?? log.seller_id,
                title: `"${log.message.length > 90 ? log.message.slice(0, 90) + "…" : log.message}"`,
              });
              if (log.speaker === "seller" && log.pioneer_labels?.length > 0) {
                const fields = Object.entries(log.extracted_fields ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
                pushFeed({
                  id: `pioneer-${log.seller_id}-${log.round}`,
                  agent: "pioneer",
                  vendor: log.seller_name ?? log.seller_id,
                  title: `Labeled: ${log.pioneer_labels.join(", ")}`,
                  detail: fields || undefined,
                });
              }
              break;
            }

            case "validation": {
              setStatus(s => ({ ...s, stageIndex: 3 }));
              reveal(["validation"]);
              const vr = event.data as Record<string, unknown>;
              const passed = vr.status === "passed";
              const fails = (vr.failed_constraints as string[] | undefined) ?? [];
              pushFeed({
                id: `val-${vr.seller_id}`,
                agent: "validation",
                vendor: String(vr.seller_name ?? vr.seller_id ?? ""),
                title: `${passed ? "PASSED" : "FAILED"} — ${String(vr.product ?? "")}`,
                detail: fails.length > 0 ? fails.join(" · ") : "all constraints satisfied",
              });
              break;
            }

            case "escalation": {
              setStatus(s => ({ ...s, stageIndex: 4 }));
              reveal(["escalation"]);
              const er = event.data as Record<string, unknown>;
              pushFeed({
                id: "escalation-result",
                agent: "escalation",
                title: er.escalate ? `Escalation triggered: ${String(er.trigger ?? "")}` : "No escalation required",
                detail: String(er.reason ?? ""),
              });
              break;
            }

            case "recommendation": {
              reveal(["recommendation"]);
              const rec = event.data as Record<string, unknown>;
              if (rec.recommended_seller) {
                pushFeed({
                  id: "recommendation",
                  agent: "recommendation",
                  title: `Recommended: ${String(rec.recommended_seller)} — ${String(rec.recommended_product ?? "")}`,
                  detail: `€${rec.price_eur} · ${rec.delivery_days}d delivery`,
                });
              }
              break;
            }

            case "audit":
              setStatus(s => ({ ...s, stageIndex: 5 }));
              reveal(["audit"]);
              pushFeed({ id: "audit", agent: "audit", title: "Audit summary generated" });
              break;

            case "done": {
              const demo = event.data as DemoResult;
              setResult(demo);
              const sr = demo.structured_requirements;
              if (sr?.product_type) {
                const budget = sr.budget_eur ? ` · €${sr.budget_eur}` : "";
                setRequestLabel(`${sr.product_type}${budget}`);
              }
              if (!firstSellerId && demo.matched_suppliers.length > 0) {
                const best = [...demo.matched_suppliers].sort((a, b) => b.match_score - a.match_score)[0];
                setActiveSeller(best.seller_id);
              }
              setStatus(s => ({ ...s, phase: "awaiting_approval", stageIndex: STAGES.length }));
              break;
            }

            case "error": {
              const msg = (event.data as Record<string, unknown>).message;
              setError(typeof msg === "string" ? msg : "Pipeline error");
              setStatus({ ...initialStatus, revealedSections: new Set() });
              break;
            }
          }
        },
        () => {
          setError("Connection lost — is the backend running?");
          setStatus(s => s.phase === "running" ? { ...initialStatus, revealedSections: new Set() } : s);
        },
      );

    },
    [closeStream, pushFeed, reveal],
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
        <div
          ref={stepRef}
          className="flex min-h-[100dvh] flex-col"
          style={{ background: "radial-gradient(ellipse 90% 55% at 50% 60%, rgba(47,111,237,0.07) 0%, #ffffff 62%)" }}
        >
          {/* Top nav */}
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

          {/* Centered hero */}
          <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/8 px-3 py-1 text-[11px] font-semibold tracking-[0.1em] text-accent">
                Multi-Agent B2B Procurement
              </span>
            </motion.div>

            {/* Wordmark */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.48, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}
              className="mt-5 text-[clamp(4rem,8vw,7.5rem)] font-bold leading-[0.88] tracking-[-0.045em] text-text-1"
            >
              Pactum
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, delay: 0.17, ease: [0.23, 1, 0.32, 1] }}
              className="mt-4 max-w-[420px] text-center text-[15px] leading-relaxed text-text-3"
            >
              Five agents discover suppliers, negotiate in real time, and surface the best deal — one button.
            </motion.p>

            {/* Form */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, delay: 0.26, ease: [0.23, 1, 0.32, 1] }}
              className="mt-9 w-full"
            >
              <RequestForm onStart={start} disabled={isRunning || !isIdle} />
            </motion.div>

            {/* Inline meta */}
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
            {/* Main canvas */}
            <div className="flex-1 border-r border-border">
              <AgentNetwork
                stageIndex={status.stageIndex}
                phase={heroPhase}
                activeSeller={activeSeller}
                onSelectSeller={setActiveSeller}
                canInteract={showSection("negotiation")}
                suppliers={result?.matched_suppliers ?? streamedSuppliers}
                visibleNodeIds={visibleNodeIds}
                chatLines={nodeChatLines}
                requestLabel={requestLabel}
                judgedCandidates={result?.judged_candidates ?? []}
              />
            </div>

            {/* Right rail */}
            <div className="flex w-72 shrink-0 flex-col bg-white">
              <div className="min-h-0 flex-1">
                <ActivityFeed items={feed} demoMode={result?.demo_mode} />
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
