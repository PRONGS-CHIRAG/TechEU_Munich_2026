"use client";

import { Handle, Position } from "@xyflow/react";
import { AnimatePresence, motion } from "motion/react";
import { FileText, Handshake } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import type { ConversationLog } from "@/lib/types";

type NodeProps<T = unknown> = { data: T };
type StateProps = { active: boolean; done: boolean };

// Emil: custom ease-out — built-in easings are too weak
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Emil: scale from 0.95, not 0 — nothing in the real world appears from nothing
const SPAWN = {
  initial: { opacity: 0, scale: 0.95, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { duration: 0.25, ease: EASE_OUT },
} as const;

const ringBase =
  "shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_-2px_rgba(0,0,0,0.07)]";

const ringState = (p: StateProps) =>
  p.active
    ? "ring-2 ring-accent/60 pulse-ring"
    : p.done
      ? "ring-1 ring-accent/30"
      : "ring-1 ring-border";

const PIONEER_COLORS: Record<string, string> = {
  price_concession: "text-blue-500",
  warranty_risk: "text-amber-500",
  risk_signal: "text-red-500",
  final_offer: "text-emerald-500",
  delivery_condition: "text-sky-500",
  technical_info: "text-text-3",
  missing_information: "text-orange-400",
};

// ─── Request Node ──────────────────────────────────────────────────────────────

export function RequestNode({
  data,
}: NodeProps<{ label: string } & StateProps>) {
  return (
    <motion.div
      {...SPAWN}
      className={`rounded-xl bg-white px-3.5 py-3 ${ringBase} ${ringState(data)}`}
    >
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="flex items-center gap-2.5">
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg transition-colors duration-200 ${
            data.active || data.done ? "bg-accent-soft text-accent" : "bg-surface text-text-3"
          }`}
        >
          <FileText weight="duotone" className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
            Request
          </div>
          <div className="text-[13px] font-semibold tracking-tight text-text-1">
            {data.label}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Orchestrator Node ─────────────────────────────────────────────────────────

const STAGE_TASKS: Record<number, string> = {
  0: "Extracting requirements…",
  1: "Ranking suppliers…",
  2: "Orchestrating negotiation…",
  3: "Running validation…",
  4: "Checking escalation…",
  5: "Generating audit summary…",
};

export function OrchestratorNode({
  data,
}: NodeProps<{ active: boolean; done: boolean; stageIndex: number }>) {
  return (
    <motion.div
      {...SPAWN}
      className={`relative rounded-xl bg-white px-5 py-4 ${ringBase} ${ringState(data)}`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white transition-all duration-300 ${
            data.active || data.done
              ? "bg-accent shadow-[0_1px_4px_rgba(47,111,237,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]"
              : "bg-surface-2 text-text-2"
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <rect x="8" y="8" width="9" height="9" fill="currentColor" />
          </svg>
        </span>
        <div className="leading-tight">
          <div
            className={`text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors duration-200 ${
              data.active || data.done ? "text-accent" : "text-text-3"
            }`}
          >
            Control Tower
          </div>
          <div className="text-[14px] font-semibold tracking-tight text-text-1">
            Pactum Orchestrator
          </div>
        </div>
      </div>

      {/* Emil: mode="wait" + key=stageIndex → crossfade between task labels */}
      <AnimatePresence mode="wait" initial={false}>
        {data.active ? (
          <motion.div
            key={`task-${data.stageIndex}`}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            className="mt-2.5 flex items-center gap-2 text-[11px] text-text-2"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            {STAGE_TASKS[data.stageIndex] ?? "Processing…"}
          </motion.div>
        ) : data.done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            className="mt-2.5 flex items-center gap-1.5 text-[11px] text-emerald-600"
          >
            <span className="text-[10px]">✓</span>
            Pipeline complete
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Buyer Agent Node ──────────────────────────────────────────────────────────

export function BuyerAgentNode({
  data,
}: NodeProps<{ active: boolean; done: boolean; round?: number }>) {
  return (
    <motion.div
      {...SPAWN}
      className={`rounded-xl bg-white px-4 py-3.5 ${ringBase} ${ringState(data)}`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="flex items-center gap-2.5">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-200 ${
            data.active || data.done ? "bg-accent-soft text-accent" : "bg-surface text-text-3"
          }`}
        >
          <Handshake weight="duotone" className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
            Buyer Agent
          </div>
          <div className="text-[13px] font-semibold tracking-tight text-text-1">
            Negotiates
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {data.active && data.round != null && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="overflow-hidden flex items-center gap-1.5 text-[10px] text-text-2"
          >
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            Round {data.round} / 2
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Seller Node ───────────────────────────────────────────────────────────────

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
  chatLines?: ConversationLog[];
}>) {
  const chatLines = data.chatLines ?? [];
  const hasChatLines = chatLines.length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to latest message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatLines.length]);

  const ring = data.selected
    ? "ring-2 ring-accent shadow-[0_0_0_4px_rgba(47,111,237,0.10)]"
    : data.highlight
      ? "ring-1 ring-accent"
      : ringState(data);

  return (
    <motion.div
      {...SPAWN}
      style={{ width: 220 }}
      className={`group relative overflow-hidden rounded-xl bg-white ${ringBase} ${ring} ${
        data.interactive ? "cursor-pointer active:scale-[0.98]" : ""
      }`}
    >
      {(data.highlight || data.selected) && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent"
        />
      )}
      <Handle type="target" position={Position.Left} className="!opacity-0" />

      {/* Header row */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface font-mono text-[13px] font-semibold text-text-2">
          α
        </span>
        <div className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-semibold tracking-tight text-text-1">
            {data.label}
          </span>
          {data.highlight ? (
            <span className="mt-0.5 inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              Best match
            </span>
          ) : (
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-1 w-10 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent/40 transition-all duration-500"
                  style={{ width: `${data.match * 100}%` }}
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-text-3">
                {data.match.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Live chat panel — streams in as negotiation runs ── */}
      <AnimatePresence initial={false}>
        {hasChatLines && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="overflow-hidden border-t border-border"
          >
            <div
              ref={scrollRef}
              className="flex max-h-[100px] flex-col gap-1.5 overflow-y-auto p-2.5"
            >
              {chatLines.map((log, i) => (
                <motion.div
                  key={i}
                  // Emil: 180ms, ease-out, tight 40ms stagger per message
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: EASE_OUT }}
                  className={`flex flex-col ${
                    log.speaker === "buyer" ? "items-start" : "items-end"
                  }`}
                >
                  <span
                    className={`max-w-[95%] rounded-2xl px-2.5 py-1.5 text-[10px] leading-snug ${
                      log.speaker === "buyer"
                        ? "bg-accent text-white"
                        : "bg-surface text-text-1"
                    }`}
                  >
                    {log.message}
                  </span>
                  {log.speaker === "seller" && log.pioneer_labels.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {log.pioneer_labels.slice(0, 2).map((l) => (
                        <span
                          key={l}
                          className={`font-mono text-[8px] ${
                            PIONEER_COLORS[l] ?? "text-text-3"
                          }`}
                        >
                          [{l}]
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shimmer skeleton — active but no messages yet */}
      <AnimatePresence initial={false}>
        {data.active && !hasChatLines && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="border-t border-border px-4 py-2.5"
          >
            <div className="h-1.5 w-full animate-pulse rounded-full bg-accent-soft" />
            <div
              className="mt-1.5 h-1.5 w-2/3 animate-pulse rounded-full bg-accent-soft"
              style={{ animationDelay: "0.35s" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
