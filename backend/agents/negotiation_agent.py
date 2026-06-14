"""Negotiation agent — strategy-driven multi-round Gemini dialogue per supplier.

Public API:
  negotiate_one_supplier(requirements, supplier, inventory, judged_candidates)
    → generator of (log_dict, offer_dict | None)

  negotiate_supplier_round(requirements, supplier, inventory, judged_candidates, ...)
    → generator of one buyer/seller exchange for parallel orchestration

  run_negotiation(requirements, matched_suppliers, judged_candidates)
    → (logs, raw_offers)  — non-streaming wrapper kept for tests/fallback

Strategy-driven round caps:
  aggressive → up to 5 rounds, targets 18% off listed price
  medium     → up to 3 rounds, targets  8% off listed price
  light      → up to 2 rounds, targets  4% off listed price

Seller floor: 10% off listed price_eur.
If the buyer's target in any round falls below that floor, the seller
emits a deterministic rejection (no Gemini call) and the generator ends.
The orchestrator then routes to the next-ranked supplier (waterfall).
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
from backend.prompts import (
    NEGOTIATION_BUYER_SYSTEM,
    NEGOTIATION_SELLER_SYSTEM,
    BUYER_STRATEGY_PROMPTS,
)
from integrations.gemini_client import generate

_DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"

_MAX_WORDS = 50


def _trim(text: str) -> str:
    """Enforce the 2-sentence / 50-word cap. Keeps the first two sentences that
    together stay under the word limit; falls back to a hard word-count truncation."""
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    out = ""
    for s in sentences[:2]:
        candidate = (out + " " + s).strip() if out else s
        if len(candidate.split()) <= _MAX_WORDS:
            out = candidate
        else:
            break
    if not out:
        # Hard truncate if even sentence 1 is too long
        words = text.split()
        out = " ".join(words[:_MAX_WORDS]).rstrip(",;:")
        if not out.endswith((".", "!", "?")):
            out += "."
    return out

# ── Strategy config ────────────────────────────────────────────────────────────

STRATEGY_CONFIG: dict[str, dict] = {
    "aggressive": {"max_rounds": 5, "target_discount_pct": 0.18, "step_pct": 0.04},
    "medium":     {"max_rounds": 3, "target_discount_pct": 0.08, "step_pct": 0.03},
    "light":      {"max_rounds": 2, "target_discount_pct": 0.04, "step_pct": 0.02},
}

# Seller will not accept any offer below 90% of the listed price_eur
SELLER_MAX_DISCOUNT_PCT = 0.10


def _buyer_target_price(listed_price: float, step_pct: float, target_discount_pct: float, round_num: int) -> float:
    """Deterministic buyer target price for a given round. Escalates toward max discount."""
    pct = min(target_discount_pct, step_pct * round_num)
    return round(listed_price * (1.0 - pct), 2)


# ── Product selection ──────────────────────────────────────────────────────────

def _get_seller_best_product(seller_id: str, requirements: dict, inventory: list) -> dict | None:
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
    target_price: float = 0.0,
) -> str:
    """Generate one buyer turn via Gemini; fallback to template."""
    product_type = requirements.get("product_type", "product")
    strategy = requirements.get("negotiation_strategy", "medium")

    if _DEMO_MODE:
        price_note = f" We are targeting €{target_price:.0f}." if target_price > 0 else ""
        if round_num == 1:
            return (
                f"Hello {seller.get('seller_name', '')}. We are looking for a "
                f"{product_type} for {requirements.get('use_case', 'our operations')}. "
                f"Our budget is €{requirements.get('budget_eur', 650)}, and we need delivery "
                f"within {requirements.get('max_delivery_days', 7)} days.{price_note}"
            )
        return (
            f"Your offer has issues: {context_notes}. "
            f"Can you provide a better alternative or address these concerns?{price_note}"
        )

    guardrails = get_system_constraints(requirements)
    strategy_suffix = BUYER_STRATEGY_PROMPTS.get(strategy, BUYER_STRATEGY_PROMPTS["medium"])
    system = NEGOTIATION_BUYER_SYSTEM + "\n\n" + strategy_suffix + "\n\n" + guardrails

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
    if target_price > 0:
        parts.append(f"\nYour target price this round: €{target_price:.0f}. State this ask clearly.")
    if context_notes:
        parts.append(f"\nNote: {context_notes}")
    parts.append(
        "\nWrite your opening negotiation message." if round_num == 1
        else "\nWrite your counter-response to the seller's message."
    )

    raw = generate("\n".join(parts), system=system, temperature=0.65)
    cleaned = check_turn(raw, requirements)

    if not cleaned:
        return _trim(
            f"We need a {product_type} around €{target_price:.0f} — "
            f"can you match that?"
        )
    return _trim(cleaned)


def _generate_seller_turn(
    requirements: dict,
    seller: dict,
    product: dict,
    round_num: int,
    buyer_message: str,
    target_price: float = 0.0,
) -> str:
    """Generate one seller turn via Gemini; fallback to template."""
    product_name = product.get("product", "the product")

    if _DEMO_MODE:
        price_str = f"€{target_price:.0f}" if target_price > 0 else f"€{product.get('price_eur', 0)}"
        if round_num == 1:
            return (
                f"We can offer {product_name} at "
                f"{price_str}, delivery in "
                f"{product.get('delivery_days', 0)} days, "
                f"{product.get('warranty_years', 0)}-year warranty."
            )
        return (
            f"We understand your constraints. {product_name} at "
            f"{price_str} is our best offer. "
            f"We cannot improve further on price, delivery, or warranty."
        )

    neg_style = seller.get("negotiation_style", "cooperative")
    system = (
        NEGOTIATION_SELLER_SYSTEM
        + f"\n\nYour negotiation style: {neg_style}. "
        f"You represent {seller.get('seller_name', 'the vendor')} "
        f"from {seller.get('region', 'Europe')}."
    )

    price_context = (
        f"\nBuyer's target price this round: €{target_price:.0f}. Respond to this ask."
        if target_price > 0 else ""
    )
    prompt = (
        f"Buyer's message: {buyer_message}\n\n"
        f"Your product: {product_name} at €{product.get('price_eur', 0)}, "
        f"delivery {product.get('delivery_days', 0)} days, "
        f"{product.get('warranty_years', 0)}-year warranty.\n"
        f"Round {round_num}. Respond to the buyer.{price_context}"
    )

    raw = generate(prompt, system=system, temperature=0.7)
    cleaned = check_turn(raw, requirements)

    if not cleaned:
        price_str = f"€{target_price:.0f}" if target_price > 0 else f"€{product.get('price_eur', 0)}"
        return _trim(f"{product_name} at {price_str}, {product.get('delivery_days', 0)}-day delivery — that's our best.")
    return _trim(cleaned)


# ── Per-supplier generator (multi-round, strategy-driven) ─────────────────────

def _negotiate_supplier(
    requirements: dict,
    supplier: dict,
    inventory: list,
    judged_candidates: list,
):
    """Generator yielding (log_dict, offer | None) for one supplier.

    Runs up to STRATEGY_CONFIG[strategy]["max_rounds"] rounds.
    If the buyer's target price falls below the seller's floor (10% off listed),
    emits a deterministic seller rejection log and stops — no Gemini call for the
    rejection turn. The orchestrator detects rejection via log["event_kind"].
    """
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
                "event_kind": "turn",
                "pioneer_labels": ["missing_information"],
                "risk_level": "medium",
                "extracted_fields": {},
            },
            None,
        )
        return

    product = {**product, "seller_id": seller_id, "seller_name": seller_name}
    listed_price: float = float(product.get("price_eur", 0))
    floor_price = listed_price * (1.0 - SELLER_MAX_DISCOUNT_PCT)

    strategy = requirements.get("negotiation_strategy", "medium")
    cfg = STRATEGY_CONFIG.get(strategy, STRATEGY_CONFIG["medium"])

    prev_seller_msg = ""

    for r in range(1, cfg["max_rounds"] + 1):
        target_price = _buyer_target_price(listed_price, cfg["step_pct"], cfg["target_discount_pct"], r)

        # Buyer turn
        buyer_msg = _generate_buyer_turn(
            requirements, supplier, product, r,
            previous_seller_message=prev_seller_msg,
            target_price=target_price,
        )
        yield (
            {
                "seller_id": seller_id,
                "seller_name": seller_name,
                "speaker": "buyer",
                "message": buyer_msg,
                "round": r,
                "event_kind": "turn",
                "pioneer_labels": [],
                "risk_level": "low",
                "extracted_fields": {},
            },
            None,
        )

        # Deterministic floor check — no Gemini on rejection
        if target_price < floor_price:
            rejection_msg = (
                f"We cannot accept an offer below €{floor_price:.0f} "
                f"(our floor on the listed price of €{listed_price:.0f}). "
                f"We must decline this negotiation."
            )
            yield (
                {
                    "seller_id": seller_id,
                    "seller_name": seller_name,
                    "speaker": "seller",
                    "message": rejection_msg,
                    "round": r,
                    "event_kind": "seller_rejection",
                    "is_rejection": True,
                    "pioneer_labels": ["final_offer"],
                    "risk_level": "high",
                    "extracted_fields": {},
                },
                None,
            )
            return

        # Seller turn via Gemini
        seller_msg = _generate_seller_turn(
            requirements, supplier, product, r, buyer_msg, target_price=target_price
        )

        is_last = r == cfg["max_rounds"]

        if is_last:
            # Final round — product at negotiated price is the offer
            negotiated_product = {**product, "price_eur": target_price}
            yield (
                {
                    "seller_id": seller_id,
                    "seller_name": seller_name,
                    "speaker": "seller",
                    "message": seller_msg,
                    "round": r,
                    "event_kind": "turn",
                    "pioneer_labels": [],
                    "risk_level": "low",
                    "extracted_fields": {
                        "price_eur": target_price,
                        "delivery_days": product.get("delivery_days"),
                    },
                },
                negotiated_product,
            )
            return

        # Not the last round — continue
        yield (
            {
                "seller_id": seller_id,
                "seller_name": seller_name,
                "speaker": "seller",
                "message": seller_msg,
                "round": r,
                "event_kind": "turn",
                "pioneer_labels": [],
                "risk_level": "low",
                "extracted_fields": {},
            },
            None,
        )
        prev_seller_msg = seller_msg


# ── Public API ─────────────────────────────────────────────────────────────────

def negotiate_one_supplier(
    requirements: dict,
    supplier: dict,
    inventory: list | None = None,
    judged_candidates: list | None = None,
):
    """Public generator for one supplier's negotiation turns.

    The orchestrator drives the waterfall by calling this per supplier and
    stopping at the first accepted deal or when all suppliers are exhausted.
    """
    if inventory is None:
        inventory = get_seller_inventory(requirements=requirements)
    yield from _negotiate_supplier(requirements, supplier, inventory, judged_candidates or [])


def negotiate_supplier_round(
    requirements: dict,
    supplier: dict,
    inventory: list | None = None,
    judged_candidates: list | None = None,
    round_num: int = 1,
    previous_seller_message: str = "",
    buyer_message_override: str | None = None,
):
    """Yield one buyer/seller exchange for a supplier.

    This is used by the orchestrator's parallel negotiation loop. It keeps the
    same pricing guardrail as the full generator, but returns an offer after
    every successful seller turn so the buyer can accept, reject, or counter
    between rounds.
    """
    if inventory is None:
        inventory = get_seller_inventory(requirements=requirements)

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
                "round": round_num,
                "event_kind": "seller_rejection",
                "is_rejection": True,
                "pioneer_labels": ["missing_information"],
                "risk_level": "medium",
                "extracted_fields": {},
            },
            None,
        )
        return

    product = {**product, "seller_id": seller_id, "seller_name": seller_name}
    listed_price = float(product.get("price_eur", 0))
    floor_price = listed_price * (1.0 - SELLER_MAX_DISCOUNT_PCT)

    strategy = requirements.get("negotiation_strategy", "medium")
    cfg = STRATEGY_CONFIG.get(strategy, STRATEGY_CONFIG["medium"])
    target_price = _buyer_target_price(
        listed_price,
        cfg["step_pct"],
        cfg["target_discount_pct"],
        round_num,
    )

    buyer_msg = (
        _trim(buyer_message_override)
        if buyer_message_override
        else _generate_buyer_turn(
            requirements,
            supplier,
            product,
            round_num,
            previous_seller_message=previous_seller_message,
            target_price=target_price,
        )
    )

    yield (
        {
            "seller_id": seller_id,
            "seller_name": seller_name,
            "speaker": "buyer",
            "message": buyer_msg,
            "round": round_num,
            "event_kind": "turn",
            "pioneer_labels": [],
            "risk_level": "low",
            "extracted_fields": {},
        },
        None,
    )

    if target_price < floor_price:
        rejection_msg = (
            f"We cannot accept an offer below €{floor_price:.0f} "
            f"(our floor on the listed price of €{listed_price:.0f}). "
            f"We must decline this negotiation."
        )
        yield (
            {
                "seller_id": seller_id,
                "seller_name": seller_name,
                "speaker": "seller",
                "message": rejection_msg,
                "round": round_num,
                "event_kind": "seller_rejection",
                "is_rejection": True,
                "pioneer_labels": ["final_offer"],
                "risk_level": "high",
                "extracted_fields": {},
            },
            None,
        )
        return

    seller_msg = _generate_seller_turn(
        requirements,
        supplier,
        product,
        round_num,
        buyer_msg,
        target_price=target_price,
    )
    negotiated_product = {**product, "price_eur": target_price}
    yield (
        {
            "seller_id": seller_id,
            "seller_name": seller_name,
            "speaker": "seller",
            "message": seller_msg,
            "round": round_num,
            "event_kind": "turn",
            "pioneer_labels": [],
            "risk_level": "low",
            "extracted_fields": {
                "price_eur": target_price,
                "delivery_days": product.get("delivery_days"),
            },
        },
        negotiated_product,
    )


def run_negotiation(
    requirements: dict,
    matched_suppliers: list,
    judged_candidates: list | None = None,
) -> tuple[list, list]:
    """Non-streaming waterfall. Returns (logs, raw_offers).

    Mirrors the orchestrator's waterfall logic for the non-streaming fallback path.
    Stops at the first accepted deal; rejects route to the next supplier.
    """
    inventory = get_seller_inventory(requirements=requirements)
    ranked = sorted(matched_suppliers, key=lambda s: s.get("match_score", 0), reverse=True)
    logs: list = []
    offers: list = []

    for supplier in ranked:
        for log, offer in _negotiate_supplier(requirements, supplier, inventory, judged_candidates or []):
            logs.append(log)
            if offer is not None:
                offers.append(offer)
        # No break — negotiate all suppliers to completion

    # Sort by value score descending so best offer is first
    try:
        offers.sort(key=lambda o: compute_value_score(requirements, o), reverse=True)
    except Exception:
        pass

    return logs, offers
