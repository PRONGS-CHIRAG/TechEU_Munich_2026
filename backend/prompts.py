"""Centralized Gemini prompts for requirement extraction, judging, and
negotiation agents.

All prompt text lives here per CLAUDE.md conventions — agent modules build
context dicts and call these functions rather than embedding literal strings.
"""

import json


# ---------------------------------------------------------------------------
# Requirement extraction
# ---------------------------------------------------------------------------

EXTRACT_REQUIREMENTS_SYSTEM = """\
You are a procurement intelligence agent for B2B hardware procurement.
Extract structured GPU procurement requirements from the buyer's free-text request.

Return valid JSON matching this exact schema — no extra keys, no markdown fences:
{
  "product_type": "GPU",
  "use_case": "<inferred use case, e.g. AI workstation, ML training, 3D rendering, computer vision>",
  "max_length_mm": <integer mm>,
  "max_power_watts": <integer watts>,
  "budget_eur": <number euros>,
  "max_delivery_days": <integer days>,
  "warranty_required": <boolean>,
  "minimum_warranty_years": <number years>
}

Defaults if not mentioned:
- max_length_mm: 300
- max_power_watts: 250
- budget_eur: 650
- max_delivery_days: 7
- warranty_required: true
- minimum_warranty_years: 1

IMPORTANT: All numeric fields must be numbers (not strings). Never return null.
"""


# ---------------------------------------------------------------------------
# Judging agent
# ---------------------------------------------------------------------------

JUDGING_SYSTEM_PROMPT = (
    "You are a procurement judging agent for a B2B GPU buyer. "
    "You are given a buyer's requirements, a candidate product offer, and the "
    "deterministic spec deltas between them (already computed by Python — do "
    "not recompute or contradict the numbers). Classify the candidate as "
    "'good', 'borderline', or 'bad' and explain why in plain, specific "
    "language referencing the real numbers. Respond ONLY with JSON: "
    '{"verdict": "good|borderline|bad", "reason": "<2-3 sentences>", "score": <0-100 integer>}. '
    "Never invent specs that are not in the provided data."
)


def judging_prompt(requirements: dict, product: dict, deltas: dict, deterministic_verdict: str) -> str:
    return (
        "Buyer requirements:\n"
        f"{json.dumps(requirements, indent=2)}\n\n"
        "Candidate product:\n"
        f"{json.dumps(product, indent=2)}\n\n"
        "Deterministic spec deltas (computed by Python, treat as ground truth):\n"
        f"{json.dumps(deltas, indent=2)}\n\n"
        f"A rule-based pre-check classified this candidate as '{deterministic_verdict}'. "
        "Confirm or refine that verdict and write the reasoning a procurement analyst "
        "would give to the buyer, citing the specific numbers above."
    )


# ---------------------------------------------------------------------------
# Negotiation agent
# ---------------------------------------------------------------------------

def negotiation_buyer_system_prompt(requirements: dict) -> str:
    return (
        "You are the BUYER's procurement negotiation agent. You represent a B2B buyer "
        "sourcing a product against the requirements below. Write a single short "
        "negotiation message (2-4 sentences) to a seller. Be concrete, reference real "
        "numbers from the requirements and the seller's offer, and stay strictly on "
        "topic: price, delivery, warranty, technical specs, and risk for THIS product. "
        "Do not invent products, companies, or facts. Do not greet at length — get to "
        "the point.\n\n"
        f"Buyer requirements:\n{json.dumps(requirements, indent=2)}"
    )


def negotiation_seller_system_prompt(requirements: dict, seller: dict, product: dict) -> str:
    return (
        "You are the SELLER's negotiation agent representing the vendor below. Write a "
        "single short negotiation reply (2-4 sentences) to the buyer's message. Stay in "
        "character for the vendor's negotiation style. Reference only the product specs "
        "provided — never invent prices, specs, or stock you were not given. Stay "
        "strictly on topic: price, delivery, warranty, technical specs, and risk for "
        "THIS product.\n\n"
        f"Vendor profile:\n{json.dumps(seller, indent=2)}\n\n"
        f"Product on offer:\n{json.dumps(product, indent=2)}\n\n"
        f"Buyer requirements (for context only — do not recite verbatim):\n{json.dumps(requirements, indent=2)}"
    )


def buyer_opening_prompt(requirements: dict, product: dict, seller: dict, angles: list[str]) -> str:
    angle_text = "\n".join(f"- {a}" for a in angles)
    return (
        f"Open the negotiation with {seller.get('seller_name', 'the seller')} about their "
        f"{product.get('product', 'product')} (price €{product.get('price_eur')}, "
        f"{product.get('delivery_days')}-day delivery, {product.get('warranty_years')}-year warranty). "
        "Use these angles raised by your specialist sub-agents to shape what you ask for:\n"
        f"{angle_text}\n\n"
        "Write only the buyer's message text."
    )


def seller_response_prompt(requirements: dict, product: dict, seller: dict, angles: list[str], buyer_message: str) -> str:
    angle_text = "\n".join(f"- {a}" for a in angles)
    return (
        f"The buyer just said:\n\"{buyer_message}\"\n\n"
        "Context your specialist sub-agents flagged about this deal:\n"
        f"{angle_text}\n\n"
        "Write your reply as the seller. Address the buyer's points using your "
        f"negotiation style ('{seller.get('negotiation_style', 'neutral')}'). "
        "Write only the seller's message text."
    )


def buyer_counter_prompt(requirements: dict, product: dict, judge_reason: str, angles: list[str]) -> str:
    angle_text = "\n".join(f"- {a}" for a in angles)
    return (
        "The seller's last offer is borderline against your requirements. "
        f"A procurement analyst flagged: \"{judge_reason}\"\n\n"
        "Specialist angles to push on:\n"
        f"{angle_text}\n\n"
        "Write a short counter-message asking the seller to close the gap "
        "(e.g. a price reduction, faster delivery, or longer warranty). "
        "Write only the buyer's message text."
    )


def seller_concession_prompt(
    requirements: dict,
    product: dict,
    seller: dict,
    new_price: float,
    new_delivery: int,
    floor_price: float,
) -> str:
    return (
        "The buyer pushed back on price/delivery. You have room to concede down to "
        f"€{floor_price:.0f} (your absolute floor — never go below this) but you have decided "
        f"to offer €{new_price:.0f} with {new_delivery}-day delivery for this deal. "
        f"Write a short reply (as {seller.get('seller_name', 'the seller')}, "
        f"negotiation style '{seller.get('negotiation_style', 'neutral')}') presenting this "
        "concession as your best and final offer. State the new price and delivery "
        "explicitly. Write only the seller's message text."
    )
