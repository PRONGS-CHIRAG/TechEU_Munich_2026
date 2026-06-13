"use client";

import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { useReducedMotion } from "motion/react";

interface MessageEdgeData {
  live?: boolean;
  delay?: number; // milliseconds — staggers traveling dot across multiple edges
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

  const { live = false, delay = 0 } = (data ?? {}) as MessageEdgeData;
  const reduce = useReducedMotion();

  const [edgePath] = getSmoothStepPath({
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
    </>
  );
}
