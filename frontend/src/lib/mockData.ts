import type {
  BuyerRequest,
  ConversationLog,
  DemoResult,
  EscalationResult,
  FinalRecommendation,
  MatchedSupplier,
  StructuredRequirements,
  TavilyResult,
  ValidationResult,
} from "./types";

export const BUYER_COMPANY = {
  name: "NovaCompute GmbH",
  industry: "AI infrastructure",
};

export const defaultRequest: BuyerRequest = {
  request_id: "REQ-001",
  raw_request:
    "We need a GPU for an AI workstation. It should fit inside our compact case, not consume too much power, stay under €650, arrive within a week, and include warranty.",
  region: "Germany",
  priority: "technical_fit",
};

export const structuredRequirements: StructuredRequirements = {
  product_type: "GPU",
  use_case: "AI workstation",
  max_length_mm: 300,
  max_power_watts: 250,
  budget_eur: 650,
  max_delivery_days: 7,
  warranty_required: true,
  minimum_warranty_years: 1,
};

export const matchedSuppliers: MatchedSupplier[] = [
  {
    seller_id: "vendor_b",
    seller_name: "Vendor B",
    match_score: 0.91,
    reason: "Has compact GPUs under 300mm with fast delivery",
    specialization: "workstation components",
    region: "Germany",
    reliability_score: 0.88,
    negotiation_style: "cooperative",
  },
  {
    seller_id: "vendor_a",
    seller_name: "Vendor A",
    match_score: 0.78,
    reason: "Strong GPU inventory but some products exceed size limits",
    specialization: "high-performance GPUs",
    region: "Germany",
    reliability_score: 0.82,
    negotiation_style: "firm",
  },
  {
    seller_id: "vendor_c",
    seller_name: "Vendor C",
    match_score: 0.74,
    reason: "Fast delivery, broader catalog, typically higher pricing",
    specialization: "fast delivery components",
    region: "Germany",
    reliability_score: 0.79,
    negotiation_style: "flexible",
  },
  {
    seller_id: "vendor_d",
    seller_name: "Vendor D",
    match_score: 0.61,
    reason: "Budget-tier inventory, limited compatibility data",
    specialization: "budget components",
    region: "Austria",
    reliability_score: 0.71,
    negotiation_style: "aggressive",
  },
  {
    seller_id: "vendor_e",
    seller_name: "Vendor E",
    match_score: 0.58,
    reason: "Enterprise hardware focus, slower response time",
    specialization: "enterprise hardware",
    region: "Switzerland",
    reliability_score: 0.91,
    negotiation_style: "formal",
  },
];

export const conversationLogs: ConversationLog[] = [
  // Vendor A
  {
    seller_id: "vendor_a",
    seller_name: "Vendor A",
    speaker: "buyer",
    message:
      "Hello Vendor A. We need a GPU for an AI workstation. Budget €650, max 300mm, delivery within 7 days.",
    round: 1,
    pioneer_labels: [],
    risk_level: "low",
  },
  {
    seller_id: "vendor_a",
    seller_name: "Vendor A",
    speaker: "seller",
    message:
      "We recommend the RTX 4080 at €700. 320mm, 320W, 2-year warranty, 5-day delivery.",
    round: 1,
    pioneer_labels: ["technical_info"],
    risk_level: "low",
    extracted_fields: { price_eur: 700, length_mm: 320, power_watts: 320, delivery_days: 5, warranty_years: 2 },
  },
  {
    seller_id: "vendor_a",
    seller_name: "Vendor A",
    speaker: "buyer",
    message:
      "The RTX 4080 exceeds our size, power, and budget constraints. Can you offer a smaller, lower-power alternative?",
    round: 2,
    pioneer_labels: [],
    risk_level: "low",
  },
  {
    seller_id: "vendor_a",
    seller_name: "Vendor A",
    speaker: "seller",
    message: "We also have the RTX 4070 at €590, 285mm, 200W. Delivery in 6 days.",
    round: 2,
    pioneer_labels: ["technical_info", "price_concession"],
    risk_level: "low",
    extracted_fields: { price_eur: 590, length_mm: 285, power_watts: 200, delivery_days: 6 },
  },
  // Vendor B
  {
    seller_id: "vendor_b",
    seller_name: "Vendor B",
    speaker: "seller",
    message:
      "We have the RTX 4070 Super Compact at €670. 267mm, 220W, 2-year warranty, 5-day delivery.",
    round: 1,
    pioneer_labels: ["technical_info"],
    risk_level: "low",
    extracted_fields: { price_eur: 670, length_mm: 267, power_watts: 220, delivery_days: 5, warranty_years: 2 },
  },
  {
    seller_id: "vendor_b",
    seller_name: "Vendor B",
    speaker: "buyer",
    message: "Price is €20 above budget. Can you offer at €650?",
    round: 2,
    pioneer_labels: [],
    risk_level: "low",
  },
  {
    seller_id: "vendor_b",
    seller_name: "Vendor B",
    speaker: "seller",
    message:
      "We can offer the RTX 4070 Super Compact (Promo) at €640 including delivery. Same specs, 2-year warranty.",
    round: 2,
    pioneer_labels: ["price_concession", "final_offer"],
    risk_level: "low",
    extracted_fields: { price_eur: 640, length_mm: 267, power_watts: 220, delivery_days: 5, warranty_years: 2 },
  },
  // Vendor C
  {
    seller_id: "vendor_c",
    seller_name: "Vendor C",
    speaker: "seller",
    message:
      "We can offer the RTX 4070 Ti at €690, 295mm, 285W. Delivery in 3 days. 2-year warranty.",
    round: 1,
    pioneer_labels: ["technical_info", "delivery_condition"],
    risk_level: "low",
    extracted_fields: { price_eur: 690, length_mm: 295, power_watts: 285, delivery_days: 3, warranty_years: 2 },
  },
  {
    seller_id: "vendor_c",
    seller_name: "Vendor C",
    speaker: "buyer",
    message:
      "Price exceeds our budget and power exceeds limit. Can you suggest a compatible alternative?",
    round: 2,
    pioneer_labels: [],
    risk_level: "low",
  },
  {
    seller_id: "vendor_c",
    seller_name: "Vendor C",
    speaker: "seller",
    message: "We can reduce to €650, but warranty is only 6 months.",
    round: 2,
    pioneer_labels: ["price_concession", "warranty_risk"],
    risk_level: "medium",
    extracted_fields: { price_eur: 650, warranty_years: 0.5 },
  },
  // Vendor D
  {
    seller_id: "vendor_d",
    seller_name: "Vendor D",
    speaker: "seller",
    message:
      "Limited GPU stock matching your case size. Closest match would require a 2-week lead time.",
    round: 1,
    pioneer_labels: ["missing_information", "delivery_condition"],
    risk_level: "medium",
    extracted_fields: { delivery_days: 14 },
  },
  // Vendor E
  {
    seller_id: "vendor_e",
    seller_name: "Vendor E",
    speaker: "seller",
    message:
      "Our enterprise GPU line starts at €1,200. We do not currently stock consumer workstation cards.",
    round: 1,
    pioneer_labels: ["technical_info", "missing_information"],
    risk_level: "low",
    extracted_fields: { price_eur: 1200 },
  },
];

export const validationResults: ValidationResult[] = [
  {
    seller_id: "vendor_a",
    seller_name: "Vendor A",
    product: "RTX 4070",
    length_mm: 285,
    power_watts: 200,
    price_eur: 590,
    delivery_days: 6,
    warranty_years: 2,
    status: "passed",
    failed_constraints: [],
    score: 88,
  },
  {
    seller_id: "vendor_b",
    seller_name: "Vendor B",
    product: "RTX 4070 Super Compact (Promo)",
    length_mm: 267,
    power_watts: 220,
    price_eur: 640,
    delivery_days: 5,
    warranty_years: 2,
    status: "passed",
    failed_constraints: [],
    score: 92,
  },
  {
    seller_id: "vendor_c",
    seller_name: "Vendor C",
    product: "RTX 4070 Ti",
    length_mm: 295,
    power_watts: 285,
    price_eur: 650,
    delivery_days: 3,
    warranty_years: 0.5,
    status: "negotiable",
    failed_constraints: ["power > 250W", "warranty < 1yr"],
    score: 64,
  },
  {
    seller_id: "vendor_a_rejected",
    seller_name: "Vendor A",
    product: "RTX 4080",
    length_mm: 320,
    power_watts: 320,
    price_eur: 700,
    delivery_days: 5,
    warranty_years: 2,
    status: "rejected",
    failed_constraints: ["length > 300mm", "power > 250W", "price > €650"],
    score: 32,
  },
];

export const tavilyEnrichment: TavilyResult = {
  triggered: true,
  reason:
    "Internal registry surfaced only one fully compatible seller. Tavily searched external sources to enrich product specs and benchmark price.",
  results: [
    {
      title: "RTX 4070 Super Compact — Reference Specifications",
      snippet:
        "267mm length, 220W TDP, 2-year manufacturer warranty. Listed across 6 EU resellers.",
      source: "techpowerup.com",
    },
    {
      title: "Workstation GPU Price Benchmark — EU Q2",
      snippet:
        "Median street price €642 for RTX 4070 Super Compact tier. Range €620–€695.",
      source: "geizhals.de",
    },
  ],
};

export const escalationResult: EscalationResult = {
  escalate: true,
  trigger: "two close offers · warranty risk",
  reason:
    "Vendor B offers €640 within budget with full 2-year warranty. Vendor C matches €650 but drops warranty to 6 months (flagged medium risk).",
  question_for_human: "Do you approve proceeding with Vendor B?",
};

export const finalRecommendation: FinalRecommendation = {
  recommended_seller: "Vendor B",
  recommended_product: "RTX 4070 Super Compact (Promo)",
  price_eur: 640,
  delivery_days: 5,
  warranty_years: 2,
  technical_status: "passed",
  risk_level: "low",
  reason: "Best balance of compatibility, price, delivery, and warranty.",
  human_approval_required: true,
};

export const auditSummary =
  "Negotiated with 5 sellers. Vendor B selected: RTX 4070 Super Compact (Promo) at €640, fully compliant. Vendor A's RTX 4080 rejected (oversize, over-power, over-budget); their RTX 4070 also passed at €590 but slower delivery. Vendor C reached €650 but dropped warranty to 6 months (medium risk). Vendors D and E produced no competitive compliant offer. Recommendation: Vendor B. Human approval required.";

export const demoResult: DemoResult = {
  request: defaultRequest,
  structured_requirements: structuredRequirements,
  matched_suppliers: matchedSuppliers,
  conversation_logs: conversationLogs,
  validation_results: validationResults,
  tavily_enrichment: tavilyEnrichment,
  escalation_result: escalationResult,
  audit_summary: auditSummary,
  final_recommendation: finalRecommendation,
  deal_card_path: "",
  demo_mode: true,
};
