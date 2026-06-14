"use client";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";
import { useEffect, useRef, useMemo } from "react";
import {
  AuditNode,
  BuyerAgentNode,
  ClusteringNode,
  DecisionNode,
  FalNode,
  JudgingWallNode,
  MatchingNode,
  NegotiationNode,
  OrchestratorNode,
  PioneerNode,
  ProcurementIntelNode,
  RequestNode,
  SellerNode,
  SubAgentNode,
  TavilyNode,
} from "./nodes";
import { MessageEdge } from "./MessageEdge";
import type { ConversationLog, EscalationResult, JudgedCandidate, MatchedSupplier } from "@/lib/types";
import { displayName } from "@/lib/api";

interface Props {
  stageIndex: number;
  phase: "idle" | "running" | "awaiting_approval" | "approved" | "rejected";
  activeSeller: string;
  onSelectSeller: (sellerId: string) => void;
  canInteract: boolean;
  suppliers: MatchedSupplier[];
  visibleNodeIds: Set<string>;
  chatLines: Record<string, ConversationLog[]>;
  requestLabel?: string;
  judgedCandidates?: JudgedCandidate[];
  rejectedSellerIds?: Set<string>;
  escalations?: Map<string, EscalationResult>;
  onEscalationDecide?: (sellerId: string, d: "approved" | "rejected" | "renegotiate" | "restart", note?: string) => void;
}

const nodeTypes = {
  request: RequestNode,
  orchestrator: OrchestratorNode,
  procurement: ProcurementIntelNode,
  clustering: ClusteringNode,
  matching: MatchingNode,
  judging: JudgingWallNode,
  negotiation: NegotiationNode,
  subagent: SubAgentNode,
  pioneer: PioneerNode,
  tavily: TavilyNode,
  audit: AuditNode,
  fal: FalNode,
  // backwards-compat alias kept in case anything references it by string
  buyerAgent: BuyerAgentNode,
  seller: SellerNode,
  decision: DecisionNode,
};

const edgeTypes = {
  message: MessageEdge,
};

export function AgentNetwork({
  stageIndex,
  phase,
  activeSeller,
  onSelectSeller,
  canInteract,
  suppliers,
  visibleNodeIds,
  chatLines,
  requestLabel = "New Request",
  judgedCandidates = [],
  rejectedSellerIds = new Set(),
  escalations = new Map(),
  onEscalationDecide,
}: Props) {
  const { nodes, edges } = useMemo(() => {
    const orchActive = stageIndex >= 0 && stageIndex < 6;
    const orchDone = stageIndex >= 6;

    const procActive = stageIndex === 0;
    const procDone = stageIndex > 0;

    const clusterMatchActive = stageIndex === 1;
    const clusterMatchDone = stageIndex > 1;

    const judgingActive = stageIndex === 1;
    const judgingDone = stageIndex > 1;

    const negotiateActive = stageIndex === 2;
    const negotiateDone = stageIndex > 2;

    const pioneerActive = stageIndex === 3 && visibleNodeIds.has("pioneer") && !visibleNodeIds.has("pioneer-done");
    const pioneerDone = visibleNodeIds.has("pioneer-done");

    const tavilyActive = visibleNodeIds.has("tavily") && !visibleNodeIds.has("tavily-done");
    const tavilyDone = visibleNodeIds.has("tavily-done");

    const auditActive = stageIndex === 5 && visibleNodeIds.has("audit") && !visibleNodeIds.has("audit-done");
    const auditDone = visibleNodeIds.has("audit-done");

    const falActive = visibleNodeIds.has("fal") && !visibleNodeIds.has("fal-done");
    const falDone = visibleNodeIds.has("fal-done");

    const subAgentsActive = negotiateActive;
    const subAgentsDone = negotiateDone;

    const goodCount = judgedCandidates.filter(c => c.verdict === "good").length;
    const borderlineCount = judgedCandidates.filter(c => c.verdict === "borderline").length;
    const badCount = judgedCandidates.filter(c => c.verdict === "bad").length;

    const bestSellerId = suppliers.length
      ? [...suppliers].sort((a, b) => b.match_score - a.match_score)[0].seller_id
      : "";

    const sellers = [...suppliers].sort((a, b) =>
      a.seller_id.localeCompare(b.seller_id),
    );

    const maxRound = Object.values(chatLines).reduce((max, lines) => {
      const r = lines.reduce((m, l) => Math.max(m, l.round), 0);
      return Math.max(max, r);
    }, 0);

    // Horizontal pipeline layout — each agent in its own column
    const CY = 260; // centre y for the main row
    const COL = {
      request:      0,
      orchestrator: 300,
      procurement:  570,
      clusterMatch: 840,
      tavily:       840,   // below clusterMatch column
      judging:      1120,
      negotiation:  1400,
      subagents:    1400,  // fan out above/below negotiation
      sellers:      1690,
      pioneer:      1690,  // below sellers column
      decision:     1990,  // decision nodes next to sellers
      audit:        2300,  // audit summary further right
      fal:          2300,  // below audit
    };
    const SELLER_SPACING = 300;
    const sellersTopY = CY - ((sellers.length - 1) * SELLER_SPACING) / 2;

    const allNodes: Node[] = [
      {
        id: "request",
        type: "request",
        position: { x: COL.request, y: CY },
        data: { label: requestLabel, active: stageIndex === 0, done: stageIndex > 0 },
        draggable: false,
        selectable: false,
      },
      {
        id: "orchestrator",
        type: "orchestrator",
        position: { x: COL.orchestrator, y: CY - 24 },
        data: { active: orchActive, done: orchDone, stageIndex },
        draggable: false,
        selectable: false,
      },
      {
        id: "procurement",
        type: "procurement",
        position: { x: COL.procurement, y: CY },
        data: { active: procActive, done: procDone },
        draggable: false,
        selectable: false,
      },
      {
        id: "clustering",
        type: "clustering",
        position: { x: COL.clusterMatch, y: CY - 80 },
        data: { active: clusterMatchActive, done: clusterMatchDone, count: suppliers.length > 0 ? suppliers.length : undefined },
        draggable: false,
        selectable: false,
      },
      {
        id: "matching",
        type: "matching",
        position: { x: COL.clusterMatch, y: CY + 55 },
        data: { active: clusterMatchActive, done: clusterMatchDone, supplierCount: suppliers.length > 0 ? suppliers.length : undefined },
        draggable: false,
        selectable: false,
      },
      {
        id: "judging",
        type: "judging",
        position: { x: COL.judging, y: CY - 55 },
        data: { active: judgingActive, done: judgingDone, good: goodCount, borderline: borderlineCount, bad: badCount },
        draggable: false,
        selectable: false,
      },
      {
        id: "negotiation",
        type: "negotiation",
        position: { x: COL.negotiation, y: CY },
        data: { active: negotiateActive, done: negotiateDone, round: negotiateActive && maxRound > 0 ? maxRound : undefined },
        draggable: false,
        selectable: false,
      },
      // Negotiation sub-agents — fan above/below the negotiation node
      { id: "sub-price",    type: "subagent", position: { x: COL.subagents, y: CY - 340 }, data: { label: "Price",    icon: "price",    active: subAgentsActive, done: subAgentsDone }, draggable: false, selectable: false },
      { id: "sub-delivery", type: "subagent", position: { x: COL.subagents, y: CY - 210 }, data: { label: "Delivery", icon: "delivery", active: subAgentsActive, done: subAgentsDone }, draggable: false, selectable: false },
      { id: "sub-warranty", type: "subagent", position: { x: COL.subagents, y: CY + 150 }, data: { label: "Warranty", icon: "warranty", active: subAgentsActive, done: subAgentsDone }, draggable: false, selectable: false },
      { id: "sub-risk",     type: "subagent", position: { x: COL.subagents, y: CY + 280 }, data: { label: "Risk",     icon: "risk",     active: subAgentsActive, done: subAgentsDone }, draggable: false, selectable: false },
      // Tavily — below the cluster/match column, only when triggered
      { id: "tavily", type: "tavily", position: { x: COL.tavily, y: CY + 210 }, data: { active: tavilyActive, done: tavilyDone }, draggable: false, selectable: false },
      // Pioneer — below sellers
      { id: "pioneer", type: "pioneer", position: { x: COL.pioneer, y: sellersTopY + sellers.length * SELLER_SPACING + 60 }, data: { active: pioneerActive, done: pioneerDone, labeledCount: visibleNodeIds.has("pioneer-done") ? undefined : undefined }, draggable: false, selectable: false },
      // Audit and fal — after sellers column
      { id: "audit", type: "audit", position: { x: COL.audit, y: CY - 80 }, data: { active: auditActive, done: auditDone }, draggable: false, selectable: false },
      { id: "fal",   type: "fal",   position: { x: COL.fal,   y: CY + 80 }, data: { active: falActive,   done: falDone   }, draggable: false, selectable: false },
      ...sellers.map<Node>((s, i) => ({
        id: s.seller_id,
        type: "seller",
        position: { x: COL.sellers, y: sellersTopY + i * SELLER_SPACING },
        data: {
          label: displayName(s.seller_name),
          match: s.match_score,
          highlight: canInteract && s.seller_id === activeSeller,
          active: negotiateActive,
          done: negotiateDone,
          selected: canInteract && s.seller_id === activeSeller,
          interactive: canInteract,
          chatLines: chatLines[s.seller_id] ?? [],
          rejected: rejectedSellerIds.has(s.seller_id),
        },
        draggable: false,
        selectable: false,
      })),
      ...sellers.map<Node>((s, i) => ({
        id: `decision-${s.seller_id}`,
        type: "decision",
        position: { x: COL.decision, y: sellersTopY + i * SELLER_SPACING },
        data: {
          payload: escalations.has(s.seller_id) ? escalations.get(s.seller_id) : null,
          onDecide: escalations.has(s.seller_id)
            ? (d: "approved" | "rejected" | "renegotiate" | "restart", note?: string) => onEscalationDecide?.(s.seller_id, d, note)
            : undefined,
        },
        draggable: false,
        selectable: false,
      })),
    ];

    const liveStyle = (live: boolean) => ({
      stroke: live ? "var(--accent)" : "#d1d5db",
      strokeWidth: live ? 1.8 : 1.2,
      strokeOpacity: live ? 0.9 : 0.55,
      strokeDasharray: live ? undefined : "5 4",
    });

    const allEdges: Edge[] = [
      {
        id: "r-o",
        source: "request",
        target: "orchestrator",
        type: "smoothstep",
        style: liveStyle(stageIndex >= 0),
      },
      {
        id: "o-proc",
        source: "orchestrator",
        target: "procurement",
        type: "smoothstep",
        style: liveStyle(stageIndex >= 0),
      },
      {
        id: "proc-cluster",
        source: "procurement",
        target: "clustering",
        type: "smoothstep",
        style: liveStyle(stageIndex >= 1),
      },
      {
        id: "proc-match",
        source: "procurement",
        target: "matching",
        type: "smoothstep",
        style: liveStyle(stageIndex >= 1),
      },
      {
        id: "cluster-judge",
        source: "clustering",
        target: "judging",
        type: "smoothstep",
        style: liveStyle(stageIndex >= 1),
      },
      {
        id: "match-judge",
        source: "matching",
        target: "judging",
        type: "smoothstep",
        style: liveStyle(stageIndex >= 1),
      },
      {
        id: "judge-neg",
        source: "judging",
        target: "negotiation",
        type: "smoothstep",
        style: liveStyle(stageIndex >= 2),
      },
      ...sellers.map<Edge>((s, i) => ({
        id: `neg-${s.seller_id}`,
        source: "negotiation",
        target: s.seller_id,
        type: "message",
        style: liveStyle(negotiateActive),
        data: { live: negotiateActive, delay: i * 60 },
      })),
      // Sub-agent edges from negotiation node
      { id: "neg-price",    source: "negotiation", target: "sub-price",    type: "smoothstep", style: liveStyle(subAgentsActive || subAgentsDone) },
      { id: "neg-delivery", source: "negotiation", target: "sub-delivery", type: "smoothstep", style: liveStyle(subAgentsActive || subAgentsDone) },
      { id: "neg-warranty", source: "negotiation", target: "sub-warranty", type: "smoothstep", style: liveStyle(subAgentsActive || subAgentsDone) },
      { id: "neg-risk",     source: "negotiation", target: "sub-risk",     type: "smoothstep", style: liveStyle(subAgentsActive || subAgentsDone) },
      // Tavily from matching
      { id: "match-tavily", source: "matching", target: "tavily", type: "smoothstep", style: liveStyle(tavilyActive || tavilyDone) },
      // Pioneer from sellers (first seller is the source, or negotiation if no sellers yet)
      ...(sellers.length > 0
        ? [{ id: "sel-pioneer", source: sellers[0].seller_id, target: "pioneer", type: "smoothstep", style: liveStyle(pioneerActive || pioneerDone) }]
        : [{ id: "neg-pioneer", source: "negotiation", target: "pioneer", type: "smoothstep", style: liveStyle(pioneerActive || pioneerDone) }]),
      // Pioneer → audit, audit → fal (sequential post-negotiation pipeline)
      { id: "pioneer-audit", source: "pioneer", target: "audit", type: "smoothstep", style: liveStyle(auditActive || auditDone) },
      { id: "audit-fal",     source: "audit",   target: "fal",   type: "smoothstep", style: liveStyle(falActive || falDone) },
      // Decision nodes — thin dashed edges from seller to decision
      ...sellers.map<Edge>((s) => ({
        id: `dec-${s.seller_id}`,
        source: s.seller_id,
        target: `decision-${s.seller_id}`,
        type: "smoothstep",
        style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "4 3" },
      })),
    ];

    // Only show nodes that have been revealed; decision nodes bypass this — they show
    // whenever they have a live escalation payload, regardless of visibleNodeIds.
    const nodes = allNodes.filter(n => {
      if (n.type === "decision") {
        return (n.data as { payload: unknown }).payload !== null;
      }
      return visibleNodeIds.has(n.id);
    });
    const visibleSet = new Set(nodes.map(n => n.id));
    const edges = allEdges.filter(
      e => visibleSet.has(e.source) && visibleSet.has(e.target),
    );

    return { nodes, edges };
  }, [
    stageIndex,
    activeSeller,
    canInteract,
    suppliers,
    visibleNodeIds,
    chatLines,
    requestLabel,
    judgedCandidates,
    rejectedSellerIds,
    escalations,
    onEscalationDecide,
  ]);

  const totalChatLines = useMemo(
    () => Object.values(chatLines).reduce((sum, lines) => sum + lines.length, 0),
    [chatLines],
  );

  const sellerIds = useMemo(() => suppliers.map((s) => s.seller_id), [suppliers]);

  return (
    <div className="relative h-full overflow-hidden border border-border bg-white shadow-[var(--shadow-sm)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={true}
        panOnScroll={false}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.1, minZoom: 0.1, maxZoom: 1.2 }}
        onNodeClick={(_event, node) => {
          if (canInteract && node.type === "seller") {
            onSelectSeller(node.id);
          }
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.2}
          color="#d1d5db"
        />
        <FlowAutoFit
          nodeCount={nodes.length}
          totalChatLines={totalChatLines}
          stageIndex={stageIndex}
          sellerIds={sellerIds}
        />
      </ReactFlow>

      <div className="pointer-events-none absolute left-5 top-4 flex flex-col gap-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-3">
          Live Agent Network
        </div>
        <div className="text-[13px] font-medium tracking-tight text-text-1">
          {nodes.length === 0
            ? "Starting pipeline…"
            : `${nodes.length} node${nodes.length !== 1 ? "s" : ""} active`}
        </div>
      </div>

      <LiveTicker stageIndex={stageIndex} phase={phase} supplierCount={suppliers.length} />
    </div>
  );
}

function FlowAutoFit({
  nodeCount,
  totalChatLines,
  stageIndex,
  sellerIds,
}: {
  nodeCount: number;
  totalChatLines: number;
  stageIndex: number;
  sellerIds: string[];
}) {
  const { fitView } = useReactFlow();
  const prevCount = useRef(nodeCount);
  const prevChat = useRef(totalChatLines);
  const prevStage = useRef(stageIndex);

  const negotiationFocus = useMemo(
    () => [{ id: "negotiation" }, ...sellerIds.map((id) => ({ id }))],
    [sellerIds],
  );

  // When negotiation starts, zoom in on negotiation + seller nodes
  useEffect(() => {
    if (stageIndex === 2 && prevStage.current !== 2) {
      prevStage.current = stageIndex;
      const t = setTimeout(
        () => fitView({ nodes: negotiationFocus, padding: 0.2, duration: 700, minZoom: 0.5, maxZoom: 1.2 }),
        150,
      );
      return () => clearTimeout(t);
    }
    prevStage.current = stageIndex;
  }, [stageIndex, fitView, negotiationFocus]);

  // New nodes appearing — fit all when pre-negotiation, stay focused when negotiating
  useEffect(() => {
    if (nodeCount !== prevCount.current) {
      prevCount.current = nodeCount;
      if (stageIndex >= 2) {
        const t = setTimeout(
          () => fitView({ nodes: negotiationFocus, padding: 0.3, duration: 350, minZoom: 0.4, maxZoom: 1.0 }),
          60,
        );
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => fitView({ padding: 0.1, duration: 350 }), 60);
      return () => clearTimeout(t);
    }
  }, [nodeCount, fitView, stageIndex, negotiationFocus]);

  // Chat lines changing during negotiation — don't re-fit, stay put
  useEffect(() => {
    if (totalChatLines !== prevChat.current) {
      prevChat.current = totalChatLines;
      if (stageIndex < 2) {
        const t = setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 200);
        return () => clearTimeout(t);
      }
    }
  }, [totalChatLines, fitView, stageIndex]);

  return null;
}

type Tone = "neutral" | "accent" | "warning" | "success" | "danger";

const TONE_STYLES: Record<Tone, { dot: string; text: string; bg: string; border: string }> = {
  neutral: { dot: "bg-text-3", text: "text-text-2", bg: "bg-white", border: "border-border" },
  accent: { dot: "bg-accent animate-pulse", text: "text-accent", bg: "bg-accent-soft", border: "border-accent-border" },
  warning: { dot: "bg-warning animate-pulse", text: "text-warning", bg: "bg-warning-soft", border: "border-amber-200" },
  success: { dot: "bg-success", text: "text-success", bg: "bg-success-soft", border: "border-emerald-200" },
  danger: { dot: "bg-danger", text: "text-danger", bg: "bg-danger-soft", border: "border-red-200" },
};

function LiveTicker({
  stageIndex,
  phase,
  supplierCount,
}: {
  stageIndex: number;
  phase: Props["phase"];
  supplierCount: number;
}) {
  const msg = tickerMessage(stageIndex, phase, supplierCount);
  const tone: Tone =
    phase === "approved" ? "success" :
    phase === "rejected" ? "danger" :
    phase === "awaiting_approval" ? "warning" :
    phase === "running" ? "accent" : "neutral";
  const s = TONE_STYLES[tone];

  return (
    <div className="pointer-events-none absolute bottom-4 left-5">
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur-sm ${s.bg} ${s.border}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
        <span className={s.text}>{msg.title}</span>
        {msg.detail && (
          <>
            <span className="text-text-3">·</span>
            <span className="font-mono text-text-3">{msg.detail}</span>
          </>
        )}
      </div>
    </div>
  );
}

function tickerMessage(
  stageIndex: number,
  phase: Props["phase"],
  supplierCount: number,
): { title: string; detail?: string } {
  if (phase === "approved") return { title: "Deal approved" };
  if (phase === "rejected") return { title: "Deal rejected" };
  if (phase === "awaiting_approval") return { title: "Awaiting approval", detail: "escalation triggered" };
  if (stageIndex < 0) return { title: "Ready", detail: "submit a request to begin" };
  if (stageIndex === 0) return { title: "Extracting requirements" };
  if (stageIndex === 1) return { title: "Clustering & judging candidates", detail: `${supplierCount} supplier${supplierCount !== 1 ? "s" : ""}` };
  if (stageIndex === 2) return { title: "Negotiating with sellers", detail: "live" };
  if (stageIndex === 3) return { title: "Validating offers" };
  if (stageIndex === 4) return { title: "Escalation check" };
  if (stageIndex === 5) return { title: "Generating audit summary" };
  return { title: "Complete" };
}
