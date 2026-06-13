"""Judging agent — evaluates each candidate cluster against the buyer's
requirements and produces a verdict (good/borderline/bad) with an
LLM-written rationale.

Python computes the deterministic spec deltas; Gemini explains the verdict
in natural language. `validate_offer()` in procurement_intelligence.py still
owns the final hard pass/fail decision — this agent's verdict only gates
which candidates proceed to negotiation.
"""

import json

from backend.schemas import JudgedCandidate
from backend.prompts import JUDGING_SYSTEM_PROMPT, judging_prompt
from integrations.gemini_client import generate


def _compute_deltas(requirements: dict, product: dict) -> dict:
    max_length = requirements.get("max_length_mm", 300)
    max_power = requirements.get("max_power_watts", 250)
    budget = requirements.get("budget_eur", 650)
    max_delivery = requirements.get("max_delivery_days", 7)
    min_warranty = requirements.get("minimum_warranty_years", 1)

    return {
        "length_mm": {
            "value": product.get("length_mm", 0),
            "limit": max_length,
            "diff": product.get("length_mm", 0) - max_length,
            "within_limit": product.get("length_mm", 0) <= max_length,
        },
        "power_watts": {
            "value": product.get("power_watts", 0),
            "limit": max_power,
            "diff": product.get("power_watts", 0) - max_power,
            "within_limit": product.get("power_watts", 0) <= max_power,
        },
        "price_eur": {
            "value": product.get("price_eur", 0),
            "limit": budget,
            "diff": round(product.get("price_eur", 0) - budget, 2),
            "within_limit": product.get("price_eur", 0) <= budget,
        },
        "delivery_days": {
            "value": product.get("delivery_days", 0),
            "limit": max_delivery,
            "diff": product.get("delivery_days", 0) - max_delivery,
            "within_limit": product.get("delivery_days", 0) <= max_delivery,
        },
        "warranty_years": {
            "value": product.get("warranty_years", 0),
            "limit": min_warranty,
            "diff": product.get("warranty_years", 0) - min_warranty,
            "within_limit": product.get("warranty_years", 0) >= min_warranty,
        },
    }


def _deterministic_verdict(deltas: dict) -> tuple[str, int]:
    failed = [spec for spec, d in deltas.items() if not d["within_limit"]]
    if not failed:
        return "good", 90

    # A single, small overshoot on price or delivery is negotiable.
    if len(failed) == 1:
        spec = failed[0]
        d = deltas[spec]
        if spec == "price_eur" and d["diff"] <= deltas["price_eur"]["limit"] * 0.15:
            return "borderline", 65
        if spec == "delivery_days" and d["diff"] <= 2:
            return "borderline", 65
        if spec == "warranty_years" and abs(d["diff"]) <= 1:
            return "borderline", 60
        return "borderline", 55

    return "bad", max(10, 50 - (len(failed) - 1) * 15)


def _parse_llm_verdict(raw: str, fallback_verdict: str, fallback_score: int) -> tuple[str, str, int]:
    try:
        data = json.loads(raw)
        verdict = data.get("verdict", fallback_verdict)
        if verdict not in ("good", "borderline", "bad"):
            verdict = fallback_verdict
        reason = data.get("reason", "")
        score = int(data.get("score", fallback_score))
        score = max(0, min(100, score))
        if not reason:
            raise ValueError("empty reason")
        return verdict, reason, score
    except (json.JSONDecodeError, ValueError, TypeError):
        return fallback_verdict, raw, fallback_score


def judge_candidates(requirements: dict, clusters: list[dict]) -> list[JudgedCandidate]:
    """Evaluate the representative product of each cluster.

    Each cluster's first member is its best-fit product (clusters are seeded
    in fit-score order by product_clustering.cluster_products).
    """
    results: list[JudgedCandidate] = []

    for cluster in clusters:
        products = cluster.get("products", [])
        if not products:
            continue
        product = products[0]

        deltas = _compute_deltas(requirements, product)
        det_verdict, det_score = _deterministic_verdict(deltas)

        raw = generate(
            judging_prompt(requirements, product, deltas, det_verdict),
            system=JUDGING_SYSTEM_PROMPT,
            temperature=0.3,
            json_mode=True,
        )
        verdict, reason, score = _parse_llm_verdict(raw, det_verdict, det_score)

        if not reason or reason.startswith("[LLM unavailable"):
            failed = [spec for spec, d in deltas.items() if not d["within_limit"]]
            if not failed:
                reason = (
                    f"{product.get('product')} meets every requirement: "
                    f"€{product.get('price_eur')} (budget €{requirements.get('budget_eur')}), "
                    f"{product.get('delivery_days')}-day delivery, "
                    f"{product.get('warranty_years')}-year warranty."
                )
            else:
                explanations = []
                for spec in failed:
                    d = deltas[spec]
                    explanations.append(f"{spec} is {d['value']} vs required {d['limit']}")
                reason = f"{product.get('product')}: " + "; ".join(explanations) + "."

        results.append(
            JudgedCandidate(
                cluster_id=cluster["cluster_id"],
                seller_id=product.get("seller_id", ""),
                product=product.get("product", ""),
                verdict=verdict,
                reason=reason,
                score=score,
            )
        )

    return results
