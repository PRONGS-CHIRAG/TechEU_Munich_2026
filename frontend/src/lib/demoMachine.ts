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

export const initialStatus: DemoStatus = {
  phase: "idle",
  stageIndex: -1,
  revealedSections: new Set(),
};
