import os

from integrations.gemini_client import generate
from backend.prompts import AUDIT_SUMMARY_SYSTEM

_DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
_LLM_FALLBACK_PREFIX = "[LLM unavailable"


def _build_context(
    requirements: dict,
    matched_suppliers: list,
    conversation_logs: list,
    validation_results: list,
    escalation_result: dict,
    raw_offers: list | None,
) -> str:
    """Build a structured text summary of the procurement run for Gemini context."""
    n = len(matched_suppliers)
    lines = [f"{n} supplier{'s' if n != 1 else ''} contacted."]

    validation_map = {v["seller_id"]: v for v in validation_results}
    offer_map = {o["seller_id"]: o for o in (raw_offers or [])}

    for supplier in matched_suppliers:
        sid = supplier["seller_id"]
        name = supplier["seller_name"]
        offer = offer_map.get(sid)
        validation = validation_map.get(sid)

        if offer:
            detail = (
                f"{name} offered {offer['product']} at €{offer['price_eur']} "
                f"with {offer['delivery_days']}-day delivery and {offer['warranty_years']}-year warranty."
            )
            if validation:
                if validation["status"] == "passed":
                    lines.append(f"{detail} → PASSED all technical checks.")
                else:
                    reasons = "; ".join(validation["failed_constraints"])
                    lines.append(f"{detail} → REJECTED: {reasons}.")
            else:
                lines.append(detail)
        else:
            seller_logs = [l for l in conversation_logs if l["seller_id"] == sid and l["speaker"] == "seller"]
            if seller_logs:
                lines.append(f"{name}: {seller_logs[-1]['message']}")
            else:
                lines.append(f"{name} did not provide a compatible offer.")

    passed = [v for v in validation_results if v["status"] == "passed"]
    if passed:
        best = max(passed, key=lambda v: v.get("score", 0))
        best_name = next(
            (s["seller_name"] for s in matched_suppliers if s["seller_id"] == best["seller_id"]),
            best["seller_id"],
        )
        best_offer = offer_map.get(best["seller_id"])
        if best_offer:
            lines.append(
                f"Top recommendation: {best_name} — {best_offer['product']} at "
                f"€{best_offer['price_eur']}, {best_offer['delivery_days']}-day delivery."
            )
        else:
            lines.append(f"Top recommendation: {best_name}.")
    else:
        lines.append("No supplier fully satisfied all constraints.")

    if escalation_result.get("escalate"):
        lines.append(f"Human approval required: {escalation_result.get('question_for_human', '')}")

    return "\n".join(lines)


def generate_summary(
    requirements: dict,
    matched_suppliers: list,
    conversation_logs: list,
    validation_results: list,
    escalation_result: dict,
    raw_offers: list | None = None,
) -> str:
    context = _build_context(
        requirements, matched_suppliers, conversation_logs,
        validation_results, escalation_result, raw_offers,
    )

    if _DEMO_MODE:
        return context

    prompt = (
        f"Procurement negotiation outcome:\n\n{context}\n\n"
        f"Write a concise 2-3 sentence executive summary of this outcome. "
        f"Be specific about the recommended product, price, and key decision factors."
    )
    text = generate(prompt, system=AUDIT_SUMMARY_SYSTEM, temperature=0.4)

    if _LLM_FALLBACK_PREFIX in text or not text.strip():
        return context

    return text.strip()
