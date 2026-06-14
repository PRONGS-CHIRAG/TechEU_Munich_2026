"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { useReducedMotion } from "motion/react";
import { useState } from "react";

interface MessageEdgeData {
  live?: boolean;
  delay?: number; // milliseconds — staggers traveling dot across multiple edges
  label?: string;
  detail?: string;
}

export function MessageEdge(props: EdgeProps) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    data,
  } = props;

  const { live = false, delay = 0, label, detail } = (data ?? {}) as MessageEdgeData;
  const [hovered, setHovered] = useState(false);
  const reduce = useReducedMotion();

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  return (
    <>
      <BaseEdge id={props.id} path={edgePath} style={style} />
      {live && !reduce && (
        <circle
          r={2.5}
          fill="var(--accent)"
          opacity={0.95}
          style={{ filter: "drop-shadow(0 0 3px var(--accent))" }}
        >
          <animateMotion
            dur="1.4s"
            repeatCount="indefinite"
            path={edgePath}
            begin={`${delay}ms`}
            rotate="auto"
          />
        </circle>
      )}
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <span className="inline-flex rounded-full border border-border bg-white/95 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-text-2 shadow-sm">
              {label}
            </span>
            {hovered && detail && (
              <div className="absolute left-1/2 top-6 z-20 w-64 -translate-x-1/2 rounded-lg border border-border bg-white p-2 text-[11px] leading-snug text-text-2 shadow-lg">
                {detail}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
