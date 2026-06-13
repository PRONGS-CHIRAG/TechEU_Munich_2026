"""Modular negotiation agent — replaces buyer_agent.py + seller_agent.py.

Each turn's text is generated live by Gemini from the buyer's requirements,
the candidate product, and the seller's persona (negotiation_style /
reliability_score from seller_registry). Dimension-specific sub-agents
(price, delivery, warranty, risk) each contribute an angle to the prompt;
the enabled set is a parameter so deal types can drop sub-agents (e.g. a
one-time-use product drops warranty.py for a more aggressive posture).

Guardrails (backend/agents/negotiation/guardrails.py) constrain what gets
emitted, both via system-prompt instructions and a post-generation check.
"""

from backend.agents.negotiation import price, delivery, warranty, risk, guardrails
from backend.prompts import (
    negotiation_buyer_system_prompt,
    negotiation_seller_system_prompt,
    buyer_opening_prompt,
    seller_response_prompt,
    buyer_counter_prompt,
    seller_concession_prompt,
)
from integrations.gemini_client import generate

DEFAULT_SUBAGENTS: tuple[str, ...] = ("price", "delivery", "warranty", "risk")

_SUBAGENT_MODULES = {
    "price": price,
    "delivery": delivery,
    "warranty": warranty,
    "risk": risk,
}


def _angles(requirements: dict, product: dict, seller: dict, enabled_subagents: tuple[str, ...]) -> list[str]:
    return [
        _SUBAGENT_MODULES[name].angle(requirements, product, seller)
        for name in enabled_subagents
        if name in _SUBAGENT_MODULES
    ]


def _turn(seller_id: str, seller_name: str, speaker: str, message: str, round_num: int) -> dict:
    return {
        "seller_id": seller_id,
        "seller_name": seller_name,
        "speaker": speaker,
        "message": message,
        "round": round_num,
        "pioneer_labels": [],
        "risk_level": "low",
    }


def run_negotiation(
    requirements: dict,
    judged_candidates: list[dict],
    seller_registry: list[dict],
    enabled_subagents: tuple[str, ...] = DEFAULT_SUBAGENTS,
) -> tuple[list[dict], list[dict]]:
    """Generate live negotiation dialogue for each candidate.

    `judged_candidates` are JudgedCandidate dicts (verdict in good/borderline)
    with an extra `product_data` key carrying the full product spec dict
    (including seller_name) for the candidate product.

    Returns (conversation_logs, raw_offers) — raw_offers feed
    procurement_intelligence.validate_offer() unchanged.
    """
    registry_map = {s["seller_id"]: s for s in seller_registry}
    logs: list[dict] = []
    raw_offers: list[dict] = []

    for candidate in judged_candidates:
        seller_id = candidate["seller_id"]
        product = dict(candidate.get("product_data", {}))
        if not product:
            continue

        seller = registry_map.get(seller_id, {"seller_id": seller_id, "seller_name": seller_id})
        seller_name = seller.get("seller_name", product.get("seller_name", seller_id))

        angles = _angles(requirements, product, seller, enabled_subagents)

        buyer_system = negotiation_buyer_system_prompt(requirements) + guardrails.guardrail_instructions(product)
        seller_system = negotiation_seller_system_prompt(requirements, seller, product) + guardrails.guardrail_instructions(product)

        # Round 1 — buyer opens, seller responds with their initial offer.
        buyer_text = generate(
            buyer_opening_prompt(requirements, product, seller, angles),
            system=buyer_system,
            temperature=0.6,
        )
        buyer_text = guardrails.enforce_turn(buyer_text, role="buyer", product=product)
        logs.append(_turn(seller_id, seller_name, "buyer", buyer_text, 1))

        seller_text = generate(
            seller_response_prompt(requirements, product, seller, angles, buyer_text),
            system=seller_system,
            temperature=0.7,
        )
        seller_text = guardrails.enforce_turn(seller_text, role="seller", product=product)
        logs.append(_turn(seller_id, seller_name, "seller", seller_text, 1))

        final_offer = dict(product)

        # Round 2 — borderline candidates get one counter/concession exchange.
        if candidate.get("verdict") == "borderline":
            buyer_counter = generate(
                buyer_counter_prompt(requirements, product, candidate.get("reason", ""), angles),
                system=buyer_system,
                temperature=0.6,
            )
            buyer_counter = guardrails.enforce_turn(buyer_counter, role="buyer", product=product)
            logs.append(_turn(seller_id, seller_name, "buyer", buyer_counter, 2))

            floor = guardrails.concession_floor(product)
            new_price = max(floor, round(product.get("price_eur", 0) * 0.95, 2))
            new_delivery = max(1, product.get("delivery_days", 1) - 1)

            seller_concession = generate(
                seller_concession_prompt(requirements, product, seller, new_price, new_delivery, floor),
                system=seller_system,
                temperature=0.7,
            )
            seller_concession = guardrails.enforce_turn(seller_concession, role="seller", product=product)
            logs.append(_turn(seller_id, seller_name, "seller", seller_concession, 2))

            final_offer["price_eur"] = new_price
            final_offer["delivery_days"] = new_delivery

        final_offer["seller_name"] = seller_name
        raw_offers.append(final_offer)

    return logs, raw_offers
