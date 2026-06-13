// Mirrors CLAUDE.md Section 8 contracts exactly.
// When backend is wired up these shapes do not change.

export type PioneerLabel =
  | "technical_info"
  | "price_concession"
  | "delivery_condition"
  | "warranty_risk"
  | "missing_information"
  | "risk_signal"
  | "final_offer";

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export type ValidationStatus =
  | "passed"
  | "rejected"
  | "negotiable"
  | "missing_information";

export interface BuyerRequest {
  request_id: string;
  raw_request: string;
  region: string;
  priority: string;
}

export interface ExtraConstraint {
  field: string;
  label: string;
  operator: "<=" | ">=";
  limit: number;
  unit: string;
}

export interface StructuredRequirements {
  product_type: string;
  use_case: string;
  budget_eur: number;
  max_delivery_days: number;
  warranty_required: boolean;
  minimum_warranty_years: number;
  // GPU / physical hardware only — absent for non-GPU requests
  max_length_mm?: number;
  max_power_watts?: number;
  // Generic product-specific constraints
  extra_constraints?: ExtraConstraint[];
}

export interface MatchedSupplier {
  seller_id: string;
  seller_name: string;
  match_score: number;
  reason: string;
  specialization: string;
  region: string;
  reliability_score: number;
  negotiation_style: string;
}

export interface ConversationLog {
  seller_id: string;
  seller_name?: string;
  speaker: "buyer" | "seller";
  message: string;
  round: number;
  pioneer_labels: PioneerLabel[];
  risk_level: RiskLevel;
  extracted_fields?: Record<string, string | number>;
}

export interface ValidationResult {
  seller_id: string;
  seller_name: string;
  product: string;
  // GPU-specific dims (0 for non-GPU; column hidden when requirement is absent)
  length_mm: number;
  power_watts: number;
  price_eur: number;
  delivery_days: number;
  warranty_years: number;
  status: ValidationStatus;
  failed_constraints: string[];
  score: number;
  // Actual values for extra_constraints fields (keyed by field name)
  extra_fields?: Record<string, number | null>;
}

export interface TavilyResult {
  triggered: boolean;
  reason: string;
  results: { title: string; snippet: string; source: string }[];
}

export interface EscalationResult {
  escalate: boolean;
  trigger: string;
  reason: string;
  question_for_human: string;
}

export interface FinalRecommendation {
  recommended_seller: string;
  recommended_product: string;
  price_eur: number;
  delivery_days: number;
  warranty_years: number;
  technical_status: ValidationStatus;
  risk_level: RiskLevel;
  reason: string;
  human_approval_required: boolean;
}

export interface ProductCluster {
  cluster_id: string;
  products: Array<{
    seller_id: string;
    seller_name: string;
    product: string;
    length_mm: number;
    power_watts: number;
    price_eur: number;
    delivery_days: number;
    warranty_years: number;
    availability: string;
  }>;
  similarity_score: number;
  representative_specs: {
    avg_price_eur: number;
    avg_delivery_days: number;
  };
}

export interface JudgedCandidate {
  cluster_id: string;
  seller_id: string;
  product: string;
  verdict: "good" | "borderline" | "bad";
  reason: string;
  score: number;
}

export interface DemoResult {
  request: BuyerRequest;
  structured_requirements: StructuredRequirements;
  clusters?: ProductCluster[];
  judged_candidates?: JudgedCandidate[];
  matched_suppliers: MatchedSupplier[];
  conversation_logs: ConversationLog[];
  validation_results: ValidationResult[];
  tavily_enrichment: TavilyResult;
  escalation_result: EscalationResult;
  audit_summary: string;
  final_recommendation: FinalRecommendation;
  deal_card_path: string;
  demo_mode: boolean;
  session_id?: string;
}
