"""Negotiation guardrails ("god rails") — constrain what the negotiation
agent may say or concede.

Applied twice:
1. `guardrail_instructions()` is appended to the system prompt for every turn.
2. `enforce_turn()` is a post-generation check run before a turn is emitted.
"""

import re

MAX_TURN_CHARS = 600

# Seller will never concede below this fraction of the listed price.
CONCESSION_FLOOR_RATIO = 0.85


def concession_floor(product: dict) -> float:
    return round(product.get("price_eur", 0) * CONCESSION_FLOOR_RATIO, 2)


def guardrail_instructions(product: dict) -> str:
    floor = concession_floor(product)
    return (
        "\n\nGuardrails: Stay strictly on the topic of this product — its price, "
        "delivery, warranty, technical specs, and risk. Do not discuss unrelated "
        f"products, companies, or topics. Never promise a price below €{floor:.0f} "
        f"for this product. Keep the message under {MAX_TURN_CHARS} characters."
    )


def _extract_amounts(text: str) -> list[float]:
    return [float(m.replace(",", "")) for m in re.findall(r"€\s?([\d,]+(?:\.\d+)?)", text)]


def _fallback_message(role: str, product: dict) -> str:
    if role == "buyer":
        return (
            f"We'd like to discuss your {product.get('product', 'product')} offer — "
            "can you confirm the best price, delivery time, and warranty terms?"
        )
    return (
        f"For {product.get('product', 'this product')}, our offer remains "
        f"€{product.get('price_eur', 0)}, {product.get('delivery_days', 0)}-day delivery, "
        f"{product.get('warranty_years', 0)}-year warranty."
    )


def enforce_turn(text: str, *, role: str, product: dict) -> str:
    """Return a guardrail-safe version of a generated turn.

    Falls back to a templated message if the LLM call failed, produced empty
    output, or (for sellers) promised a concession below the price floor.
    """
    text = (text or "").strip()
    if not text or text.startswith("[LLM unavailable"):
        return _fallback_message(role, product)

    if len(text) > MAX_TURN_CHARS:
        truncated = text[:MAX_TURN_CHARS].rsplit(".", 1)[0]
        text = truncated + "." if truncated else text[:MAX_TURN_CHARS]

    if role == "seller":
        floor = concession_floor(product)
        for amount in _extract_amounts(text):
            if amount < floor:
                return _fallback_message(role, product)

    return text
