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
  BuyerAgentNode,
  OrchestratorNode,
  RequestNode,
  SellerNode,
} from "./nodes";
import { MessageEdge } from "./MessageEdge";
import type { ConversationLog, MatchedSupplier } from "@/lib/types";

interface Props {
  stageIndex: number;
  phase: "idle" | "running" | "awaiting_approval" | "approved" | "rejected";
  activeSeller: string;
  onSelectSeller: (sellerId: string) => void;
  canInteract: boolean;
  suppliers: MatchedSupplier[];
  visibleNodeIds: Set<string>;
  chatLines: Record<string, ConversationLog[]>;
}

const nodeTypes = {
  request: RequestNode,
  orchestrator: OrchestratorNode,
  buyerAgent: BuyerAgentNode,
  seller: SellerNode,
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
}: Props) {
  const { nodes, edges } = useMemo(() => {
    const requestActive = stageIndex === 0;
    const orchActive = stageIndex >= 0 && stageIndex <= 1;
    const orchDone = stageIndex > 1;
    const negotiateActive = stageIndex === 2;
    const negotiateDone = stageIndex > 2;

    const bestSellerId = suppliers.length
      ? [...suppliers].sort((a, b) => b.match_score - a.match_score)[0].seller_id
      : "";

    const sellers = [...suppliers].sort((a, b) =>
      a.seller_id.localeCompare(b.seller_id),
    );

    // Current round from chat lines (max round seen)
    const maxRound = Object.values(chatLines).reduce((max, lines) => {
      const r = lines.reduce((m, l) => Math.max(m, l.round), 0);
      return Math.max(max, r);
    }, 0);

    const COL = { request: 20, orchestrator: 240, buyer: 470, sellers: 710 };
    const ROW_CENTER = 260;
    // 200px spacing: accommodates 56px header + 100px chat + 44px gap
    const SELLER_SPACING = 200;
    const sellersTopY = ROW_CENTER - ((sellers.length - 1) * SELLER_SPACING) / 2;

    const allNodes: Node[] = [
      {
        id: "request",
        type: "request",
        position: { x: COL.request, y: ROW_CENTER },
        data: {
          label: "GPU · €650",
          active: requestActive,
          done: stageIndex > 0,
        },
        draggable: false,
        selectable: false,
      },
      {
        id: "orchestrator",
        type: "orchestrator",
        position: { x: COL.orchestrator, y: ROW_CENTER - 24 },
        data: { active: orchActive, done: orchDone, stageIndex },
        draggable: false,
        selectable: false,
      },
      {
        id: "buyerAgent",
        type: "buyerAgent",
        position: { x: COL.buyer, y: ROW_CENTER },
        data: {
          active: negotiateActive,
          done: negotiateDone,
          round: negotiateActive && maxRound > 0 ? maxRound : undefined,
        },
        draggable: false,
        selectable: false,
      },
      ...sellers.map<Node>((s, i) => ({
        id: s.seller_id,
        type: "seller",
        position: { x: COL.sellers, y: sellersTopY + i * SELLER_SPACING },
        data: {
          label: s.seller_name,
          match: s.match_score,
          highlight: s.seller_id === bestSellerId && stageIndex >= 1,
          active: negotiateActive,
          done: negotiateDone,
          selected: canInteract && s.seller_id === activeSeller,
          interactive: canInteract,
          chatLines: chatLines[s.seller_id] ?? [],
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
        style: liveStyle(stageIndex >= 0 && stageIndex <= 1),
      },
      {
        id: "o-ba",
        source: "orchestrator",
        target: "buyerAgent",
        type: "smoothstep",
        style: liveStyle(stageIndex >= 1 && stageIndex <= 2),
      },
      ...sellers.map<Edge>((s, i) => ({
        id: `ba-${s.seller_id}`,
        source: "buyerAgent",
        target: s.seller_id,
        type: "message",
        style: liveStyle(negotiateActive),
        data: { live: negotiateActive, delay: i * 60 },
      })),
    ];

    // Filter to only currently visible nodes; edges only if both endpoints visible
    const nodes = allNodes.filter((n) => visibleNodeIds.has(n.id));
    const visibleSet = new Set(nodes.map((n) => n.id));
    const edges = allEdges.filter(
      (e) => visibleSet.has(e.source) && visibleSet.has(e.target),
    );

    return { nodes, edges };
  }, [stageIndex, activeSeller, canInteract, suppliers, visibleNodeIds, chatLines]);

  const totalChatLines = useMemo(
    () => Object.values(chatLines).reduce((sum, lines) => sum + lines.length, 0),
    [chatLines],
  );

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
        fitViewOptions={{ padding: 0.18, minZoom: 0.35, maxZoom: 1.4 }}
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
        <FlowAutoFit nodeCount={nodes.length} totalChatLines={totalChatLines} />
      </ReactFlow>

      <div className="pointer-events-none absolute left-5 top-4 flex flex-col gap-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-3">
          Live Agent Network
        </div>
        <div className="text-[13px] font-medium tracking-tight text-text-1">
          {nodes.length === 0 ? "Starting pipeline…" : `${nodes.length} node${nodes.length !== 1 ? "s" : ""} active`}
        </div>
      </div>

      <LiveTicker stageIndex={stageIndex} phase={phase} />
    </div>
  );
}

function FlowAutoFit({
  nodeCount,
  totalChatLines,
}: {
  nodeCount: number;
  totalChatLines: number;
}) {
  const { fitView } = useReactFlow();
  const prevCount = useRef(nodeCount);
  const prevChat = useRef(totalChatLines);

  useEffect(() => {
    if (nodeCount !== prevCount.current) {
      prevCount.current = nodeCount;
      const t = setTimeout(() => fitView({ padding: 0.18, duration: 350 }), 60);
      return () => clearTimeout(t);
    }
  }, [nodeCount, fitView]);

  useEffect(() => {
    if (totalChatLines !== prevChat.current) {
      prevChat.current = totalChatLines;
      const t = setTimeout(() => fitView({ padding: 0.18, duration: 400 }), 200);
      return () => clearTimeout(t);
    }
  }, [totalChatLines, fitView]);

  return null;
}

type Tone = "neutral" | "accent" | "warning" | "success" | "danger";

const TONE_STYLES: Record<Tone, { dot: string; text: string; bg: string; border: string }> = {
  neutral:  { dot: "bg-text-3",            text: "text-text-2",  bg: "bg-white",        border: "border-border" },
  accent:   { dot: "bg-accent animate-pulse", text: "text-accent", bg: "bg-accent-soft", border: "border-accent-border" },
  warning:  { dot: "bg-warning animate-pulse", text: "text-warning", bg: "bg-warning-soft", border: "border-amber-200" },
  success:  { dot: "bg-success",           text: "text-success", bg: "bg-success-soft",  border: "border-emerald-200" },
  danger:   { dot: "bg-danger",            text: "text-danger",  bg: "bg-danger-soft",   border: "border-red-200" },
};

function LiveTicker({
  stageIndex,
  phase,
}: {
  stageIndex: number;
  phase: Props["phase"];
}) {
  const msg = tickerMessage(stageIndex, phase);
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
): { title: string; detail?: string } {
  if (phase === "approved") return { title: "Deal approved", detail: "Vendor B · €640" };
  if (phase === "rejected") return { title: "Deal rejected" };
  if (phase === "awaiting_approval") return { title: "Awaiting approval", detail: "escalation triggered" };
  if (stageIndex < 0) return { title: "Ready", detail: "submit a request to begin" };
  if (stageIndex === 0) return { title: "Extracting requirements" };
  if (stageIndex === 1) return { title: "Ranking suppliers", detail: "5 candidates" };
  if (stageIndex === 2) return { title: "Negotiating with sellers", detail: "live" };
  if (stageIndex === 3) return { title: "Validating offers" };
  if (stageIndex === 4) return { title: "Escalation check" };
  if (stageIndex === 5) return { title: "Generating audit summary" };
  return { title: "Complete" };
}
