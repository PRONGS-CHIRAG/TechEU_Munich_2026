export const STAGES = [
  { id: "intel", label: "Procurement Intelligence", short: "Request" },
  { id: "match", label: "Supplier Matching", short: "Match" },
  { id: "negotiate", label: "Buyer Agent", short: "Negotiate" },
  { id: "pioneer", label: "Pioneer Inference", short: "Validate" },
  { id: "escalate", label: "Human Escalation", short: "Escalate" },
  { id: "audit", label: "Audit & Summary", short: "Approve" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export type DemoPhase =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "rejected";

export interface DemoStatus {
  phase: DemoPhase;
  stageIndex: number; // 0..STAGES.length, equals length when all done
  revealedSections: Set<SectionId>;
}

export type SectionId =
  | "requirements"
  | "suppliers"
  | "tavily"
  | "negotiation"
  | "validation"
  | "escalation"
  | "recommendation"
  | "audit";

// What gets revealed when each stage completes
export const STAGE_REVEALS: Record<StageId, SectionId[]> = {
  intel: ["requirements"],
  match: ["suppliers", "tavily"],
  negotiate: ["negotiation"],
  pioneer: ["validation"],
  escalate: ["escalation"],
  audit: ["recommendation", "audit"],
};

// Timing per stage (ms) — feels like agents "thinking"
export const STAGE_DURATION_MS: Record<StageId, number> = {
  intel: 900,
  match: 1100,
  negotiate: 1600,
  pioneer: 1100,
  escalate: 900,
  audit: 900,
};

export const initialStatus: DemoStatus = {
  phase: "idle",
  stageIndex: -1,
  revealedSections: new Set(),
};
