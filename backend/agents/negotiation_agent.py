"""Negotiation agent — generates live Gemini dialogue per turn, per supplier.

Replaces buyer_agent.py + seller_agent.py. Each negotiation turn is produced by
Gemini using sub-agent context (price, delivery, warranty, risk) and guardrails.

The generator run_negotiation_stream yields (log_dict, offer_dict | None).
When offer_dict is not None it is the final offer for that supplier, ready for
validate_offer(). run_negotiation() is the non-streaming wrapper.
"""

import os

from backend.agents.procurement_intelligence import compute_value_score, evaluate_constraints
from backend.agents.product_utils import product_matches_requirement
from backend.agents.negotiation.price import get_price_context
from backend.agents.negotiation.delivery import get_delivery_context
from backend.agents.negotiation.warranty import get_warranty_context
from backend.agents.negotiation.risk import get_risk_context
from backend.agents.negotiation.guardrails import get_system_constraints, check_turn
from backend.data_access import get_seller_inventory
from backend.prompts import NEGOTIATION_BUYER_SYSTEM, NEGOTIATION_SELLER_SYSTEM
from integrations.gemini_client import generate

_DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"


# ── Product selection ──────────────────────────────────────────────────────────

def _get_seller_best_product(seller_id: str, requirements: dict, inventory: list) -> dict | None:
    """Deterministically pick the best compatible product for a seller.

    Uses evaluate_constraints so all product types (GPU, chair, sensor, etc.)
    are filtered by the same rules as validation — no GPU-specific hardcodes.
    """
    items = [
        i for i in inventory
        if i.get("seller_id") == seller_id
        and i.get("availability") != "out_of_stock"
        and product_matches_requirement(i, requirements)
    ]
    if not items:
        return None

    compatible = [i for i in items if not evaluate_constraints(requirements, i)]
    candidates = compatible if compatible else items

    def _score(p: dict) -> int:
        try:
            return compute_value_score(requirements, p)
        except Exception:
            return 0

    return max(candidates, key=_score)


# ── Turn generators ────────────────────────────────────────────────────────────

def _generate_buyer_turn(
    requirements: dict,
    seller: dict,
    product: dict,
    round_num: int,
    previous_seller_message: str = "",
    context_notes: str = "",
) -> str:
    """Generate one buyer negotiation turn via Gemini; fallback to template."""
    product_type = requirements.get("product_type", "product")

    if _DEMO_MODE:
        if round_num == 1:
            return (
                f"Hello {seller.get('seller_name', '')}. We are looking for a "
                f"{product_type} for {requirements.get('use_case', 'our operations')}. "
                f"Our budget is €{requirements.get('budget_eur', 650)}, and we need delivery "
                f"within {requirements.get('max_delivery_days', 7)} days."
            )
        return (
            f"Your offer has issues: {context_notes}. "
            f"Can you provide a better alternative or address these concerns?"
        )

    guardrails = get_system_constraints(requirements)
    system = NEGOTIATION_BUYER_SYSTEM + "\n\n" + guardrails

    sub_ctx = "\n".join([
        f"- Price: {get_price_context(requirements, product, seller)}",
        f"- Delivery: {get_delivery_context(requirements, product, seller)}",
        f"- Warranty: {get_warranty_context(requirements, product, seller)}",
        f"- Risk: {get_risk_context(requirements, product, seller)}",
    ])

    parts = [
        f"You are negotiating with {seller.get('seller_name', 'the seller')} "
        f"for a {product_type} "
        f"({requirements.get('use_case', 'business use')}). Round {round_num}.",
    ]
    if previous_seller_message:
        parts.append(f"\nSeller's last message:\n{previous_seller_message}")
    parts.append(f"\nSub-agent context:\n{sub_ctx}")
    if context_notes:
        parts.append(f"\nNote: {context_notes}")
    parts.append(
        "\nWrite your opening negotiation message." if round_num == 1
        else "\nWrite your counter-response to the seller's message."
    )

    raw = generate("\n".join(parts), system=system, temperature=0.65)
    cleaned = check_turn(raw, requirements)

    if not cleaned:
        return (
            f"Hello {seller.get('seller_name', '')}. We are looking for a "
            f"{product_type} for {requirements.get('use_case', 'our operations')}. "
            f"Budget €{requirements.get('budget_eur', 650)}, "
            f"delivery within {requirements.get('max_delivery_days', 7)} days."
        )
    return cleaned


def _generate_seller_turn(
    requirements: dict,
    seller: dict,
    product: dict,
    round_num: int,
    buyer_message: str,
) -> str:
    """Generate one seller negotiation turn via Gemini; fallback to template."""
    product_name = product.get("product", "the product")

    if _DEMO_MODE:
        if round_num == 1:
            return (
                f"We can offer {product_name} at "
                f"€{product.get('price_eur', 0)}, delivery in "
                f"{product.get('delivery_days', 0)} days, "
                f"{product.get('warranty_years', 0)}-year warranty."
            )
        return (
            f"We understand your constraints. {product_name} at "
            f"€{product.get('price_eur', 0)} is our best offer. "
            f"We cannot improve further on price, delivery, or warranty."
        )

    neg_style = seller.get("negotiation_style", "cooperative")
    system = (
        NEGOTIATION_SELLER_SYSTEM
        + f"\n\nYour negotiation style: {neg_style}. "
        f"You represent {seller.get('seller_name', 'the vendor')} "
        f"from {seller.get('region', 'Europe')}."
    )

    prompt = (
        f"Buyer's message: {buyer_message}\n\n"
        f"Your product: {product_name} at €{product.get('price_eur', 0)}, "
        f"delivery {product.get('delivery_days', 0)} days, "
        f"{product.get('warranty_years', 0)}-year warranty.\n"
        f"Round {round_num}. Respond to the buyer."
    )

    raw = generate(prompt, system=system, temperature=0.7)
    cleaned = check_turn(raw, requirements)

    if not cleaned:
        return (
            f"We can offer {product_name} at "
            f"€{product.get('price_eur', 0)}, delivery in {product.get('delivery_days', 0)} days, "
            f"{product.get('warranty_years', 0)}-year warranty."
        )
    return cleaned


# ── Per-supplier generator ─────────────────────────────────────────────────────

def _negotiate_supplier(
    requirements: dict,
    supplier: dict,
    inventory: list,
    judged_candidates: list,
):
    """Generator yielding (log_dict, final_offer | None) per turn for one supplier."""
    seller_id = supplier["seller_id"]
    seller_name = supplier["seller_name"]

    product = _get_seller_best_product(seller_id, requirements, inventory)

    if product is None:
        yield (
            {
                "seller_id": seller_id,
                "seller_name": seller_name,
                "speaker": "seller",
                "message": "We currently have no compatible products in stock.",
                "round": 1,
                "pioneer_labels": ["missing_information"],
                "risk_level": "medium",
                "extracted_fields": {},
            },
            None,
        )
        return

    product = {**product, "seller_id": seller_id, "seller_name": seller_name}

    # Round 1: buyer opens
    buyer_msg_1 = _generate_buyer_turn(requirements, supplier, product, round_num=1)
    yield (
        {
            "seller_id": seller_id,
            "seller_name": seller_name,
            "speaker": "buyer",
            "message": buyer_msg_1,
            "round": 1,
            "pioneer_labels": [],
            "risk_level": "low",
            "extracted_fields": {},
        },
        None,
    )

    # Round 1: seller responds
    seller_msg_1 = _generate_seller_turn(
        requirements, supplier, product, round_num=1, buyer_message=buyer_msg_1
    )

    # Use the shared evaluator — handles all product types
    violations = evaluate_constraints(requirements, product)

    if violations:
        # Round 1 seller — not the final offer yet
        yield (
            {
                "seller_id": seller_id,
                "seller_name": seller_name,
                "speaker": "seller",
                "message": seller_msg_1,
                "round": 1,
                "pioneer_labels": [],
                "risk_level": "low",
                "extracted_fields": {},
            },
            None,
        )

        # Round 2: buyer counter
        issues = "; ".join(violations)
        buyer_msg_2 = _generate_buyer_turn(
            requirements, supplier, product, round_num=2,
            previous_seller_message=seller_msg_1,
            context_notes=f"Issues with current offer: {issues}. Push for improvements.",
        )
        yield (
            {
                "seller_id": seller_id,
                "seller_name": seller_name,
                "speaker": "buyer",
                "message": buyer_msg_2,
                "round": 2,
                "pioneer_labels": [],
                "risk_level": "low",
                "extracted_fields": {},
            },
            None,
        )

        # Round 2: seller final
        seller_msg_2 = _generate_seller_turn(
            requirements, supplier, product, round_num=2, buyer_message=buyer_msg_2
        )
        yield (
            {
                "seller_id": seller_id,
                "seller_name": seller_name,
                "speaker": "seller",
                "message": seller_msg_2,
                "round": 2,
                "pioneer_labels": [],
                "risk_level": "medium",
                "extracted_fields": {
                    "price_eur": product.get("price_eur"),
                    "delivery_days": product.get("delivery_days"),
                },
            },
            product,
        )

    else:
        # No violations — round 1 seller is the final offer
        yield (
            {
                "seller_id": seller_id,
                "seller_name": seller_name,
                "speaker": "seller",
                "message": seller_msg_1,
                "round": 1,
                "pioneer_labels": [],
                "risk_level": "low",
                "extracted_fields": {
                    "price_eur": product.get("price_eur"),
                    "delivery_days": product.get("delivery_days"),
                },
            },
            product,
        )


# ── Public API ─────────────────────────────────────────────────────────────────

def run_negotiation_stream(
    requirements: dict,
    matched_suppliers: list,
    judged_candidates: list | None = None,
):
    """Generator yielding (log_dict, offer_dict | None) per turn across all suppliers."""
    inventory = get_seller_inventory()
    for supplier in matched_suppliers:
        yield from _negotiate_supplier(requirements, supplier, inventory, judged_candidates or [])


def run_negotiation(
    requirements: dict,
    matched_suppliers: list,
    judged_candidates: list | None = None,
) -> tuple[list, list]:
    """Non-streaming wrapper. Returns (logs, raw_offers)."""
    logs: list = []
    offers: list = []
    for log, offer in run_negotiation_stream(requirements, matched_suppliers, judged_candidates):
        logs.append(log)
        if offer is not None:
            offers.append(offer)
    return logs, offers
