from typing import TypedDict, Optional, List


class BuyerBlueprint(TypedDict):
    """Scenario blueprint — structured_requirements are extracted live by Gemini, not stored here."""
    request_id: str
    raw_request: str
    region: str
    priority: str


# BuyerRequest is an alias for backwards-compat with orchestrator imports
BuyerRequest = BuyerBlueprint


class ExtraConstraint(TypedDict):
    """A product-specific numeric constraint extracted from the buyer's request."""
    field: str       # exact key in the inventory product JSON
    label: str       # human-readable label for display
    operator: str    # "<=" or ">="
    limit: float
    unit: str


class StructuredRequirements(TypedDict, total=False):
    product_type: str
    product_keywords: List[str]
    use_case: str
    budget_eur: float
    max_delivery_days: int
    warranty_required: bool
    minimum_warranty_years: float
    extra_constraints: List[ExtraConstraint]
    # GPU / physical hardware only (absent for non-GPU requests)
    max_length_mm: int
    max_power_watts: int
    # Set after strategy selection human alert
    negotiation_strategy: str  # "aggressive" | "medium" | "light"


class SellerOffer(TypedDict):
    seller_id: str
    seller_name: str
    product: str
    price_eur: float
    delivery_days: int
    warranty_years: float
    availability: str
    # GPU-specific (optional)
    length_mm: Optional[int]
    power_watts: Optional[int]


class MatchedSupplier(TypedDict):
    seller_id: str
    seller_name: str
    match_score: float
    reason: str


class ValidationResult(TypedDict):
    seller_id: str
    status: str  # passed | rejected | negotiable | missing_information
    failed_constraints: list
    score: int
    next_action: str


class PioneerInferenceResult(TypedDict):
    message: str
    labels: list
    risk_level: str  # low | medium | high | unknown
    extracted_fields: dict


class ConversationLogItem(TypedDict):
    seller_id: str
    speaker: str  # buyer | seller | system
    message: str
    round: int
    event_kind: str  # "turn" | "seller_rejection" | "supplier_fallback" | "strategy_selected"
    is_rejection: bool
    pioneer_labels: list
    risk_level: str


class EscalationResult(TypedDict):
    escalate: bool
    reason: str
    question_for_human: str


class FinalRecommendation(TypedDict):
    recommended_seller: str
    recommended_product: str
    price_eur: float
    delivery_days: int
    technical_status: str
    risk_level: str
    reason: str
    human_approval_required: bool
    human_decision: Optional[str]  # approve | reject | adjust | None (no response yet)


class HumanAlert(TypedDict):
    """Phase 3 — emitted on `human_alert` events, pauses run_demo_stream()
    until POST /api/human-response submits a matching session_id."""
    session_id: str
    question: str
    trigger: str
    best_offer: Optional[dict]
    budget_eur: float


class ProductCluster(TypedDict):
    """A group of spec-similar products across sellers (Phase 1 — product_clustering.py)."""
    cluster_id: str
    products: list
    similarity_score: float
    representative_specs: dict


class JudgedCandidate(TypedDict):
    """Gemini-generated verdict + reasoning for a candidate product (Phase 2 — judging_agent.py)."""
    cluster_id: str
    seller_id: str
    product: str
    verdict: str   # good | borderline | bad
    reason: str
    score: int


class DealComparisonRow(TypedDict):
    """One row in the deal comparison table shown between parallel negotiation rounds."""
    seller_id: str
    seller_name: str
    product: str
    price_eur: float
    delivery_days: int
    warranty_years: float
    validation_status: str  # "passed" | "rejected" | "negotiable" | "missing_information" | "no_offer"
    score: int
    is_rejected: bool       # True for floor-rejected / no-product sellers (row is unselectable)


class DemoResult(TypedDict):
    request: dict
    structured_requirements: dict
    clusters: list              # ProductCluster[] — populated in Phase 1/2
    judged_candidates: list     # JudgedCandidate[] — populated in Phase 2
    matched_suppliers: list
    conversation_logs: list
    pioneer_labels: list
    validation_results: list
    tavily_enrichment: dict
    escalation_result: dict
    audit_summary: str
    final_recommendation: dict
    deal_card_path: str
    deal_card_url: str
    deal_card_prompt: str
    deal_card_generated: bool
    demo_mode: bool
    negotiation_strategy: str   # "aggressive" | "medium" | "light"
    negotiation_outcome: dict   # {status, strategy, winning_seller_id, rejected_sellers, all_offers, selected_seller_id, user_choice}
