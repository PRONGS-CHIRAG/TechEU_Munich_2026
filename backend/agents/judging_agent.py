"""Judging agent — evaluates each product cluster via Gemini.

For each cluster, picks the best representative product (highest compute_value_score),
calls Gemini for a good / borderline / bad verdict + one-sentence reason, and returns
a list of JudgedCandidate dicts. One Gemini call per cluster (≤ 6 calls for 6 clusters).
"""

import json
import os

from backend.agents.procurement_intelligence import compute_value_score, evaluate_constraints
from backend.prompts import JUDGING_AGENT_SYSTEM
from integrations.gemini_client import generate

_DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
_LLM_FALLBACK_PREFIX = "[LLM unavailable"


def _pick_representative(cluster: dict, requirements: dict) -> dict | None:
    """Pick the best-scored product in the cluster as the judge's subject."""
    products = cluster.get("products", [])
    if not products:
        return None

    def _score(p: dict) -> int:
        try:
            return compute_value_score(requirements, p)
        except Exception:
            return 0

    return max(products, key=_score)


def _deterministic_verdict(requirements: dict, product: dict) -> dict:
    """Fallback verdict when Gemini is unavailable or in DEMO_MODE.

    Routes through the shared evaluate_constraints so all constraint types
    (universal, GPU-specific, extra_constraints) are checked identically.
    """
    hard_fails = evaluate_constraints(requirements, product)

    if not hard_fails:
        score = compute_value_score(requirements, product)
        verdict = "good" if score >= 80 else "borderline"
        reason = (
            "Fully within all constraints — strong compatibility with buyer requirements."
            if verdict == "good"
            else "Meets hard constraints but is not the strongest option on price or delivery."
        )
    else:
        verdict = "bad"
        score = max(0, 100 - len(hard_fails) * 25)
        reason = f"Fails constraints: {'; '.join(hard_fails)}."

    return {"verdict": verdict, "reason": reason, "score": score}


def judge_candidate(requirements: dict, cluster: dict) -> dict:
    """Judge one cluster's representative product. Returns a JudgedCandidate dict."""
    representative = _pick_representative(cluster, requirements)
    if representative is None:
        return {
            "cluster_id": cluster.get("cluster_id", ""),
            "seller_id": "",
            "product": "",
            "verdict": "bad",
            "reason": "No products in cluster.",
            "score": 0,
        }

    if _DEMO_MODE:
        result = _deterministic_verdict(requirements, representative)
        return {
            "cluster_id": cluster.get("cluster_id", ""),
            "seller_id": representative.get("seller_id", ""),
            "product": representative.get("product", ""),
            **result,
        }

    # Build spec-delta prompt for Gemini
    budget = requirements.get("budget_eur", 650)
    max_days = requirements.get("max_delivery_days", 7)
    min_warranty = requirements.get("minimum_warranty_years", 1)

    price = representative.get("price_eur", 0)
    delivery = representative.get("delivery_days", 0)
    warranty = representative.get("warranty_years", 0)

    def _fmt_delta(val: float, limit: float, unit: str, higher_is_better: bool = False) -> str:
        """Format value vs limit for the Gemini prompt.

        higher_is_better=True (warranty): below minimum is bad.
        higher_is_better=False (price/length/power/delivery): over limit is bad.
        """
        delta = val - limit
        if higher_is_better:
            if delta < 0:
                return f"{val}{unit} — BELOW minimum by {abs(delta):.4g}{unit}"
            return f"{val}{unit} — exceeds minimum by {delta:.4g}{unit}"
        if delta > 0:
            return f"{val}{unit} — OVER limit by {delta:.4g}{unit}"
        return f"{val}{unit} — within limit by {abs(delta):.4g}{unit}"

    spec_lines = [
        f"- Budget: €{budget} | Price: {_fmt_delta(price, budget, '€')}",
        f"- Max delivery: {max_days} d | Delivery: {_fmt_delta(delivery, max_days, ' d')}",
        f"- Min warranty: {min_warranty} yr | Warranty: {_fmt_delta(warranty, min_warranty, ' yr', higher_is_better=True)}",
    ]

    # GPU-specific dims — only when present in requirements
    max_len = requirements.get("max_length_mm")
    if max_len is not None:
        length = representative.get("length_mm", 0)
        spec_lines.insert(1, f"- Max length: {max_len} mm | Length: {_fmt_delta(length, max_len, ' mm')}")

    max_pwr = requirements.get("max_power_watts")
    if max_pwr is not None:
        power = representative.get("power_watts", 0)
        spec_lines.insert(2 if max_len is not None else 1, f"- Max power: {max_pwr} W | Power: {_fmt_delta(power, max_pwr, ' W')}")

    # Extra product-specific constraints
    for c in requirements.get("extra_constraints", []):
        field = c.get("field")
        label = c.get("label", field)
        operator = c.get("operator", "<=")
        limit = c.get("limit")
        unit = c.get("unit", "")
        if not field or limit is None:
            continue
        actual = representative.get(field)
        if actual is None:
            spec_lines.append(f"- {label}: required {operator} {limit}{unit} | MISSING from product")
        else:
            spec_lines.append(
                f"- {label}: required {operator} {limit}{unit} | "
                f"{_fmt_delta(float(actual), float(limit), unit, higher_is_better=(operator == '>='))}"
            )

    prompt = (
        f"Product: {representative.get('product', 'Unknown')} "
        f"by {representative.get('seller_name', 'Unknown')}\n\n"
        f"Buyer requirements vs product specs:\n"
        + "\n".join(spec_lines)
        + "\n\nEvaluate this product: good, borderline, or bad fit for this buyer? "
        f"One clear sentence explaining why."
    )

    raw = generate(prompt, system=JUDGING_AGENT_SYSTEM, temperature=0.3, json_mode=True)

    if _LLM_FALLBACK_PREFIX in raw:
        result = _deterministic_verdict(requirements, representative)
    else:
        try:
            parsed = json.loads(raw)
            verdict = parsed.get("verdict", "borderline")
            if verdict not in ("good", "borderline", "bad"):
                verdict = "borderline"
            reason = str(parsed.get("reason", "Evaluation inconclusive."))
            score = min(100, max(0, int(parsed.get("score", 50))))
            result = {"verdict": verdict, "reason": reason, "score": score}
        except (json.JSONDecodeError, ValueError, TypeError):
            result = _deterministic_verdict(requirements, representative)

    return {
        "cluster_id": cluster.get("cluster_id", ""),
        "seller_id": representative.get("seller_id", ""),
        "product": representative.get("product", ""),
        **result,
    }


def judge_candidates(requirements: dict, clusters: list[dict]) -> list[dict]:
    """Judge each cluster. Returns list of JudgedCandidate dicts (one per cluster)."""
    return [judge_candidate(requirements, cluster) for cluster in clusters]
