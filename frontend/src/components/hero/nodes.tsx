"use client";

import { Handle, Position } from "@xyflow/react";
import { AnimatePresence, motion } from "motion/react";
import {
  FileText,
  Handshake,
} from "@phosphor-icons/react";

type NodeProps<T = unknown> = { data: T };

type StateProps = { active: boolean; done: boolean };

const ringBase =
  "shadow-[0_1px_2px_rgb(15_23_42_/_0.04),0_4px_12px_-4px_rgb(15_23_42_/_0.06)]";

const ringState = (p: StateProps) =>
  p.active
    ? "ring-1 ring-accent shadow-[0_0_0_4px_rgb(79_70_229_/_0.10),0_1px_2px_rgb(15_23_42_/_0.06)]"
    : p.done
      ? "ring-1 ring-accent-border"
      : "ring-1 ring-border";

export function RequestNode({
  data,
}: NodeProps<{ label: string } & StateProps>) {
  return (
    <div
      className={`rounded-xl bg-surface px-3 py-2.5 ${ringBase} ${ringState(data)}`}
    >
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-surface-2 text-text-2">
          <FileText weight="duotone" className="h-3.5 w-3.5" />
        </span>
        <div className="leading-tight">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
            Request
          </div>
          <div className="font-mono text-[11.5px] font-medium tabular-nums text-text-1">
            {data.label}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OrchestratorNode({
  data,
}: NodeProps<{ active: boolean; done: boolean }>) {
  return (
    <div
      className={`relative rounded-2xl bg-gradient-to-br from-white to-accent-soft/70 px-4 py-3 ${ringBase} ${ringState(
        data,
      )}`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white shadow-[0_1px_2px_rgb(79_70_229_/_0.35),inset_0_1px_0_rgb(255_255_255_/_0.18)]">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <rect
              x="1"
              y="1"
              width="9"
              height="9"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
            />
            <rect x="8" y="8" width="9" height="9" fill="currentColor" />
          </svg>
        </span>
        <div className="leading-tight">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
            Control Tower
          </div>
          <div className="text-[13px] font-semibold tracking-tight text-text-1">
            Pactum Orchestrator
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {data.active && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="flex items-center gap-1.5 overflow-hidden text-[10px] text-text-2"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            coordinating
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function BuyerAgentNode({
  data,
}: NodeProps<{ active: boolean; done: boolean }>) {
  return (
    <div
      className={`rounded-xl bg-surface px-3 py-2.5 ${ringBase} ${ringState(data)}`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-soft text-accent">
          <Handshake weight="duotone" className="h-3.5 w-3.5" />
        </span>
        <div className="leading-tight">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
            Buyer Agent
          </div>
          <div className="text-[12px] font-medium tracking-tight text-text-1">
            Negotiates
          </div>
        </div>
      </div>
    </div>
  );
}

export function SellerNode({
  data,
}: NodeProps<{
  label: string;
  match: number;
  highlight: boolean;
  active: boolean;
  done: boolean;
  selected?: boolean;
  interactive?: boolean;
}>) {
  const selectedRing = data.selected
    ? "ring-2 ring-accent shadow-[0_0_0_4px_rgb(43_78_221_/_0.10),0_1px_2px_rgb(15_23_42_/_0.06)]"
    : data.highlight
      ? "ring-1 ring-accent"
      : ringState(data);

  return (
    <div
      className={`group relative overflow-hidden rounded-xl bg-surface pl-3.5 pr-3 py-2 transition-all duration-200 ${ringBase} ${selectedRing} ${
        data.interactive
          ? "cursor-pointer hover:-translate-y-[1px] hover:ring-accent-border"
          : ""
      }`}
    >
      {(data.highlight || data.selected) && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-full bg-accent"
        />
      )}
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-surface-2 font-mono text-[11px] font-semibold text-text-2">
          α
        </span>
        <div className="leading-tight">
          <span className="text-[12px] font-medium tracking-tight text-text-1">
            {data.label}
          </span>
          {data.highlight ? (
            <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-accent">
              Best match
            </div>
          ) : (
            <div className="font-mono text-[10px] tabular-nums text-text-3">
              match {data.match.toFixed(2)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
