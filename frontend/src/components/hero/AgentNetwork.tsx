"use client";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from "@xyflow/react";
import { useMemo, useRef, useState } from "react";
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
  conversationLogs?: ConversationLog[];
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
  conversationLogs = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ sellerId: string; x: number; y: number } | null>(null);
  const { nodes, edges } = useMemo(() => {
    const requestActive = stageIndex === 0;
    const orchActive = stageIndex >= 0 && stageIndex <= 1;
    const orchDone = stageIndex > 1;
    const negotiateActive = stageIndex === 2;
    const negotiateDone = stageIndex > 2;

    const bestSellerId = suppliers.length
      ? [...suppliers].sort((a, b) => b.match_score - a.match_score)[0]
          .seller_id
      : "";

    const sellers = [...suppliers].sort((a, b) =>
      a.seller_id.localeCompare(b.seller_id),
    );

    // Clean horizontal pipeline: Request → Orchestrator → BuyerAgent → 5 Sellers
    const COL = { request: 20, orchestrator: 230, buyer: 460, sellers: 720 };
    const ROW_CENTER = 130;
    const SELLER_SPACING = 58;
    const sellersTopY =
      ROW_CENTER - ((sellers.length - 1) * SELLER_SPACING) / 2;

    const nodes: Node[] = [
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
        position: { x: COL.orchestrator, y: ROW_CENTER - 22 },
        data: { active: orchActive, done: orchDone },
        draggable: false,
        selectable: false,
      },
      {
        id: "buyerAgent",
        type: "buyerAgent",
        position: { x: COL.buyer, y: ROW_CENTER },
        data: { active: negotiateActive, done: negotiateDone },
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
        },
        draggable: false,
        selectable: false,
      })),
    ];

    const liveStyle = (live: boolean) => ({
      stroke: live ? "var(--accent)" : "#d6d3ce",
      strokeWidth: live ? 1.6 : 1,
      strokeOpacity: live ? 0.9 : 0.55,
    });

    const edges: Edge[] = [
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
      // Buyer Agent → Sellers — custom MessageEdge with staggered traveling dot
      ...sellers.map<Edge>((s, i) => ({
        id: `ba-${s.seller_id}`,
        source: "buyerAgent",
        target: s.seller_id,
        type: "message",
        style: liveStyle(negotiateActive),
        data: { live: negotiateActive, delay: i * 60 },
      })),
    ];

    return { nodes, edges };
  }, [stageIndex, activeSeller, canInteract, suppliers]);

  const hoverLog = hover ? lastLogForSeller(conversationLogs, hover.sellerId) : null;

  return (
    <div
      ref={containerRef}
      className="relative h-[340px] overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-white to-surface-2/60 shadow-[var(--shadow-tinted)]"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.14, minZoom: 0.7, maxZoom: 1.05 }}
        onNodeClick={(_event, node) => {
          if (canInteract && node.type === "seller") {
            onSelectSeller(node.id);
          }
        }}
        onEdgeMouseEnter={(event, edge) => {
          if (!edge.id.startsWith("ba-")) return;
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          setHover({
            sellerId: edge.id.slice(3),
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          });
        }}
        onEdgeMouseLeave={() => setHover(null)}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="#e4e2dc"
        />
      </ReactFlow>

      <div className="pointer-events-none absolute left-5 top-4 flex flex-col gap-0.5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-text-3">
          Live Agent Network
        </div>
        <div className="text-[13px] font-medium tracking-tight text-text-1">
          Orchestrator routes · Buyer Agent negotiates with 5 sellers
        </div>
      </div>

      {hoverLog && (
        <EdgeDetailPopup log={hoverLog} x={hover!.x} y={hover!.y} />
      )}

      <LiveTicker stageIndex={stageIndex} phase={phase} />
    </div>
  );
}

function lastLogForSeller(
  logs: ConversationLog[],
  sellerId: string,
): ConversationLog | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i].seller_id === sellerId) return logs[i];
  }
  return null;
}

function EdgeDetailPopup({
  log,
  x,
  y,
}: {
  log: ConversationLog;
  x: number;
  y: number;
}) {
  const fields = Object.entries(log.extracted_fields ?? {});
  return (
    <div
      className="pointer-events-none absolute z-20 w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-white p-3 text-left shadow-[var(--shadow-tinted)]"
      style={{ left: x, top: y - 10 }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] font-semibold text-text-1">
          {log.speaker === "buyer" ? "Buyer Agent" : log.seller_name ?? log.seller_id}
        </span>
        <span className="text-[10px] text-text-3">· round {log.round}</span>
      </div>
      <div className="mt-1 line-clamp-3 text-[11.5px] text-text-2">{log.message}</div>
      {log.pioneer_labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {log.pioneer_labels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-pioneer-soft px-1.5 py-0.5 text-[9.5px] font-medium text-pioneer"
            >
              {label.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
      {fields.length > 0 && (
        <div className="mt-1.5 space-y-0.5 font-mono text-[10px] text-text-3">
          {fields.map(([key, value]) => (
            <div key={key}>
              {key}: {String(value)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Tone = "neutral" | "accent" | "warning" | "success" | "danger";

interface TickerStyle {
  dot: string;
  ring: string;
  text: string;
  bg: string;
}

const TONE_STYLES: Record<Tone, TickerStyle> = {
  neutral: {
    dot: "bg-text-3",
    ring: "border-border",
    text: "text-text-1",
    bg: "bg-white/95",
  },
  accent: {
    dot: "animate-pulse bg-accent",
    ring: "border-border",
    text: "text-text-1",
    bg: "bg-white/95",
  },
  warning: {
    dot: "bg-warning animate-pulse",
    ring: "border-amber-200",
    text: "text-warning",
    bg: "bg-warning-soft/95",
  },
  success: {
    dot: "bg-success",
    ring: "border-emerald-200",
    text: "text-success",
    bg: "bg-success-soft/95",
  },
  danger: {
    dot: "bg-danger",
    ring: "border-red-200",
    text: "text-danger",
    bg: "bg-danger-soft/95",
  },
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
    phase === "approved"
      ? "success"
      : phase === "rejected"
        ? "danger"
        : phase === "awaiting_approval"
          ? "warning"
          : phase === "running"
            ? "accent"
            : "neutral";
  const styles = TONE_STYLES[tone];

  return (
    <div className="pointer-events-none absolute bottom-4 left-5">
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] shadow-sm backdrop-blur tabular-nums ${styles.bg} ${styles.ring}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
        <span className={`font-medium ${styles.text}`}>{msg.title}</span>
        {msg.detail && (
          <>
            <span className="text-text-3">·</span>
            <span className="font-mono text-text-2">{msg.detail}</span>
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
  if (phase === "approved")
    return { title: "Deal approved", detail: "Vendor B · €640" };
  if (phase === "rejected") return { title: "Deal rejected by human" };
  if (phase === "awaiting_approval")
    return { title: "Awaiting human approval", detail: "escalation triggered" };
  if (stageIndex < 0)
    return { title: "Idle", detail: "submit a request to begin" };
  if (stageIndex === 0)
    return { title: "Extracting structured requirements" };
  if (stageIndex === 1)
    return { title: "Ranking suppliers", detail: "5 candidates" };
  if (stageIndex === 2)
    return {
      title: "Buyer Agent negotiating with Vendor B",
      detail: "Round 2 of 2",
    };
  if (stageIndex === 3)
    return { title: "Validating offers against constraints" };
  if (stageIndex === 4) return { title: "Checking escalation triggers" };
  if (stageIndex === 5) return { title: "Generating audit summary" };
  return { title: "Pipeline complete" };
}
