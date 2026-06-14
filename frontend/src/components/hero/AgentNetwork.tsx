"use client";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from "@xyflow/react";
import { useMemo } from "react";
import {
  BuyerAgentNode,
  OrchestratorNode,
  RequestNode,
  SellerNode,
} from "./nodes";
import { MessageEdge } from "./MessageEdge";
import type {
  BuyerRequest,
  ConversationLog,
  FinalRecommendation,
  MatchedSupplier,
  StructuredRequirements,
} from "@/lib/types";

interface Props {
  stageIndex: number;
  phase: "idle" | "running" | "awaiting_approval" | "approved" | "rejected";
  activeSeller: string;
  onSelectSeller: (sellerId: string) => void;
  canInteract: boolean;
  suppliers: MatchedSupplier[];
  request?: BuyerRequest;
  requirements?: StructuredRequirements;
  logs?: ConversationLog[];
  finalRecommendation?: FinalRecommendation;
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
  request,
  requirements,
  logs = [],
  finalRecommendation,
}: Props) {
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
    const requestLabel = formatRequestLabel(request, requirements);
    const latestBySeller = new Map<string, ConversationLog>();
    for (const log of logs) latestBySeller.set(log.seller_id, log);

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
          label: requestLabel,
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
        data: {
          live: negotiateActive,
          delay: i * 60,
          label: edgeLabel(latestBySeller.get(s.seller_id)),
          detail: edgeDetail(latestBySeller.get(s.seller_id)),
        },
      })),
    ];

    return { nodes, edges };
  }, [stageIndex, activeSeller, canInteract, suppliers, request, requirements, logs]);

  return (
    <div className="relative h-[340px] overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-white to-surface-2/60 shadow-[var(--shadow-tinted)]">
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
          Orchestrator routes · Buyer Agent negotiates with matched sellers
        </div>
      </div>

      <LiveTicker
        stageIndex={stageIndex}
        phase={phase}
        suppliers={suppliers}
        requirements={requirements}
        finalRecommendation={finalRecommendation}
      />
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
  suppliers,
  requirements,
  finalRecommendation,
}: {
  stageIndex: number;
  phase: Props["phase"];
  suppliers: MatchedSupplier[];
  requirements?: StructuredRequirements;
  finalRecommendation?: FinalRecommendation;
}) {
  const msg = tickerMessage(stageIndex, phase, suppliers, requirements, finalRecommendation);
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
  suppliers: MatchedSupplier[],
  requirements?: StructuredRequirements,
  finalRecommendation?: FinalRecommendation,
): { title: string; detail?: string } {
  if (phase === "approved")
    return {
      title: "Deal approved",
      detail: finalRecommendation
        ? `${finalRecommendation.recommended_seller} · €${finalRecommendation.price_eur}`
        : undefined,
    };
  if (phase === "rejected") return { title: "Deal rejected by human" };
  if (phase === "awaiting_approval")
    return { title: "Awaiting human approval", detail: "escalation triggered" };
  if (stageIndex < 0)
    return { title: "Idle", detail: "submit a request to begin" };
  if (stageIndex === 0)
    return { title: "Extracting structured requirements" };
  if (stageIndex === 1)
    return { title: "Ranking suppliers", detail: `${suppliers.length || "matching"} candidates` };
  if (stageIndex === 2)
    return {
      title: `Buyer Agent negotiating ${requirements?.product_type ?? "products"}`,
      detail: `${suppliers.length || 0} suppliers`,
    };
  if (stageIndex === 3)
    return { title: "Validating offers against constraints" };
  if (stageIndex === 4) return { title: "Checking escalation triggers" };
  if (stageIndex === 5) return { title: "Generating audit summary" };
  return { title: "Pipeline complete" };
}

function formatRequestLabel(
  request?: BuyerRequest,
  requirements?: StructuredRequirements,
): string {
  if (requirements) {
    const type = requirements.product_type || "Product";
    const budget =
      requirements.budget_eur != null ? `€${requirements.budget_eur}` : "budget open";
    return `${type} · ${budget}`;
  }
  if (request?.request_id) return request.request_id;
  return "Procurement";
}

function edgeLabel(log?: ConversationLog): string | undefined {
  if (!log) return undefined;
  if (log.pioneer_labels?.includes("price_concession")) return "price";
  if (log.pioneer_labels?.includes("delivery_condition")) return "delivery";
  if (log.pioneer_labels?.includes("warranty_risk")) return "warranty";
  if (log.risk_level && log.risk_level !== "low") return "risk";
  return log.speaker;
}

function edgeDetail(log?: ConversationLog): string | undefined {
  if (!log) return undefined;
  const fields = log.extracted_fields
    ? Object.entries(log.extracted_fields)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" · ")
    : "";
  const labels = log.pioneer_labels?.length
    ? `Labels: ${log.pioneer_labels.join(", ")}. `
    : "";
  const risk = log.risk_level ? `Risk: ${log.risk_level}. ` : "";
  return `${labels}${risk}${fields ? `${fields}. ` : ""}${log.message}`;
}
