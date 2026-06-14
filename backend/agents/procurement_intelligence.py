import json
import os
import re

from integrations.gemini_client import generate as _gemini_generate
from backend.prompts import EXTRACT_REQUIREMENTS_SYSTEM
from backend.schemas import StructuredRequirements, SellerOffer, ValidationResult

_GEMINI_FALLBACK = "[LLM unavailable — using fallback response]"

_PRODUCT_STOPWORDS = {
    "a", "an", "and", "any", "arrive", "budget", "buy", "delivery", "for",
    "from", "need", "needs", "our", "procure", "purchase", "the", "to",
    "under", "we", "with", "within",
}


def _repair_json(raw: str) -> dict:
    """Parse JSON from Gemini, repairing a known malformation where a closing }
    is omitted before an array-element separator (seen in multi-item extra_constraints).

    Pattern: `"value"<newline><spaces>,` → `"value"<newline><spaces>},`
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        fixed = re.sub(r'"(\s*\n\s*),', r'"\1},', raw)
        return json.loads(fixed)  # propagate if still malformed


# ── Shared constraint evaluator (single source of truth) ─────────────────────

def evaluate_constraints(requirements: dict, offer: dict) -> list[str]:
    """Deterministic hard-constraint check. Returns list of failure strings.

    Called by validate_offer, judging_agent, and negotiation_agent — never duplicated.
    Missing extra_constraints fields in the offer are treated as failures.
    """
    failed = []

    # Universal constraints (always checked)
    if offer.get("price_eur", 0) > requirements.get("budget_eur", 650):
        failed.append(
            f"Price €{offer['price_eur']} exceeds €{requirements['budget_eur']} budget"
        )

    if offer.get("delivery_days", 99) > requirements.get("max_delivery_days", 7):
        failed.append(
            f"Delivery {offer['delivery_days']} days exceeds "
            f"{requirements['max_delivery_days']} day limit"
        )

    if requirements.get("warranty_required") and (
        offer.get("warranty_years", 0) < requirements.get("minimum_warranty_years", 1)
    ):
        failed.append(
            f"Warranty {offer.get('warranty_years', 0)} years below required "
            f"{requirements.get('minimum_warranty_years', 1)} years"
        )

    # Physical size constraint — presence-gated (GPU / hardware only).
    # If the buyer specifies a size limit and the product has no length field,
    # treat it as a failure (e.g. a chair has no length_mm, so it can't fit a GPU slot).
    max_len = requirements.get("max_length_mm")
    if max_len is not None:
        length = offer.get("length_mm")
        if length is None:
            failed.append(f"Length: not specified by product (required ≤ {max_len} mm)")
        elif length > max_len:
            failed.append(f"Length {length} mm exceeds {max_len} mm limit")

    # Power constraint — same missing-field policy.
    max_pwr = requirements.get("max_power_watts")
    if max_pwr is not None:
        power = offer.get("power_watts")
        if power is None:
            failed.append(f"Power draw: not specified by product (required ≤ {max_pwr} W)")
        elif power > max_pwr:
            failed.append(f"Power draw {power} W exceeds {max_pwr} W limit")

    # Product-specific extra constraints from buyer request
    for constraint in requirements.get("extra_constraints", []):
        field = constraint.get("field")
        label = constraint.get("label", field)
        operator = constraint.get("operator", "<=")
        limit = constraint.get("limit")
        unit = constraint.get("unit", "")
        if not field or limit is None:
            continue
        actual = offer.get(field)
        if actual is None:
            failed.append(f"{label}: missing from product specification")
            continue
        try:
            actual_f = float(actual)
            limit_f = float(limit)
        except (ValueError, TypeError):
            continue
        if operator == "<=" and actual_f > limit_f:
            failed.append(f"{label} {actual_f:.4g}{unit} exceeds {limit_f:.4g}{unit} limit")
        elif operator == ">=" and actual_f < limit_f:
            failed.append(f"{label} {actual_f:.4g}{unit} below required {limit_f:.4g}{unit}")

    return failed


# ── Regex extraction fallback ─────────────────────────────────────────────────

def _extract_with_regex(raw_request: str) -> dict:
    """Regex-based extraction — fallback when Gemini is unavailable or in replay mode."""
    lower = raw_request.lower()

    # Infer product type from keyword heuristics
    if any(w in lower for w in ["gpu", "graphics card", "graphics processing"]):
        product_type = "GPU"
        use_case = "AI workstation"
    elif any(w in lower for w in ["chair", "seat", "furniture", "stool", "desk"]):
        product_type = "office chair"
        use_case = "office workspace"
    elif any(w in lower for w in ["sensor", "detector", "proximity", "measurement"]):
        product_type = "industrial sensor"
        use_case = "industrial monitoring"
    elif any(w in lower for w in ["server", "rack", "blade", "node"]):
        product_type = "server"
        use_case = "data center"
    elif any(w in lower for w in ["laptop", "notebook"]):
        product_type = "laptop"
        use_case = "computing"
    else:
        product_type = _infer_product_phrase(raw_request)
        use_case = "business use"

    requirements: dict = {
        "product_type": product_type,
        "product_keywords": _product_keywords(product_type),
        "use_case": use_case,
        "budget_eur": 650.0,
        "max_delivery_days": 7,
        "warranty_required": True,
        "minimum_warranty_years": 1,
        "extra_constraints": [],
    }

    budget_match = re.search(r"€(\d+)", raw_request)
    if budget_match:
        requirements["budget_eur"] = float(budget_match.group(1))

    delivery_match = re.search(r"(\d+)\s*day", raw_request, re.IGNORECASE)
    if delivery_match:
        requirements["max_delivery_days"] = int(delivery_match.group(1))

    if "this week" in lower or "within a week" in lower:
        requirements["max_delivery_days"] = 7

    warranty_match = re.search(r"(\d+)[\s-]*year", raw_request, re.IGNORECASE)
    if warranty_match:
        requirements["minimum_warranty_years"] = int(warranty_match.group(1))
        requirements["warranty_required"] = True

    # GPU-specific: physical size and power (only when GPU detected)
    if product_type == "GPU":
        if "computer vision" in lower:
            requirements["use_case"] = "computer vision"
        elif "ml training" in lower or "machine learning" in lower:
            requirements["use_case"] = "ML training"
        elif "3d rendering" in lower or "rendering" in lower:
            requirements["use_case"] = "3D rendering"
        elif "data processing" in lower or "analytics" in lower:
            requirements["use_case"] = "data processing"

        size_match = re.search(r"under\s+(\d+)\s*mm", raw_request, re.IGNORECASE)
        if size_match:
            requirements["max_length_mm"] = int(size_match.group(1))

        power_match = re.search(r"under\s+(\d+)\s*[wW](?:\b|att)", raw_request)
        if power_match:
            requirements["max_power_watts"] = int(power_match.group(1))

    return requirements


# ── Gemini output coercion ────────────────────────────────────────────────────

def _product_keywords(*values: object) -> list[str]:
    words: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value is None:
            continue
        if isinstance(value, list):
            candidates = [str(v) for v in value]
        else:
            candidates = re.findall(r"[a-z0-9]+", str(value).lower())
        for word in candidates:
            word = word.strip().lower()
            if len(word) < 3 or word in _PRODUCT_STOPWORDS or word in seen:
                continue
            seen.add(word)
            words.append(word)
    return words[:8]


def _infer_product_phrase(raw_request: str) -> str:
    lower = raw_request.lower()
    patterns = [
        r"(?:need|buy|purchase|procure|source|looking for)\s+(?:an?|some|the|new)?\s*([a-z0-9][a-z0-9\s-]{1,60}?)(?:\s+(?:under|within|with|for|that|which|at|by|from|to|and|,|\.|€)|$)",
        r"(?:request for|quote for|rfq for)\s+([a-z0-9][a-z0-9\s-]{1,60}?)(?:\s+(?:under|within|with|for|that|which|at|by|from|to|and|,|\.|€)|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, lower, re.IGNORECASE)
        if match:
            phrase = re.sub(r"\s+", " ", match.group(1)).strip(" -")
            if phrase:
                return phrase
    return "custom product"

def _coerce_requirements(parsed: dict) -> dict | None:
    """Coerce Gemini JSON output to correct Python types. Returns None on failure."""
    try:
        result: dict = {
            "product_type": str(parsed.get("product_type", "product")),
            "use_case": str(parsed.get("use_case", "business use")),
            "budget_eur": float(str(parsed.get("budget_eur", 650))),
            "max_delivery_days": int(float(str(parsed.get("max_delivery_days", 7)))),
            "warranty_required": bool(parsed.get("warranty_required", True)),
            "minimum_warranty_years": float(str(parsed.get("minimum_warranty_years", 1))),
            "extra_constraints": [],
        }
        result["product_keywords"] = _product_keywords(
            parsed.get("product_keywords", []),
            result["product_type"],
        )

        # Optional physical constraints — include only when Gemini emits them
        if parsed.get("max_length_mm") is not None:
            result["max_length_mm"] = int(float(str(parsed["max_length_mm"])))
        if parsed.get("max_power_watts") is not None:
            result["max_power_watts"] = int(float(str(parsed["max_power_watts"])))

        # Validate and coerce extra_constraints list
        raw_constraints = parsed.get("extra_constraints", [])
        if isinstance(raw_constraints, list):
            for c in raw_constraints:
                if not isinstance(c, dict):
                    continue
                if not c.get("field") or c.get("operator") not in ("<=", ">=") or c.get("limit") is None:
                    continue
                try:
                    result["extra_constraints"].append({
                        "field": str(c["field"]),
                        "label": str(c.get("label", c["field"])),
                        "operator": c["operator"],
                        "limit": float(c["limit"]),
                        "unit": str(c.get("unit", "")),
                    })
                except (ValueError, TypeError):
                    continue

        return result
    except (ValueError, TypeError):
        return None


# ── Public extraction entry point ─────────────────────────────────────────────

def extract_requirements(request) -> dict:
    raw_request = request.get("raw_request", "") if isinstance(request, dict) else str(request)
    demo_mode = os.getenv("DEMO_MODE", "false").lower() == "true"

    if not demo_mode:
        prompt = f"Extract structured procurement requirements from this buyer request:\n\n{raw_request}"
        raw = _gemini_generate(
            prompt,
            system=EXTRACT_REQUIREMENTS_SYSTEM,
            temperature=0.1,
            json_mode=True,
        )
        if raw != _GEMINI_FALLBACK:
            try:
                parsed = _repair_json(raw)
                coerced = _coerce_requirements(parsed)
                if coerced is not None:
                    return coerced
            except (json.JSONDecodeError, KeyError, TypeError):
                pass

    return _extract_with_regex(raw_request)


# ── Scoring and validation ────────────────────────────────────────────────────

def compute_value_score(requirements: dict, offer: dict) -> int:
    budget = requirements.get("budget_eur", 650) or 1
    max_delivery = requirements.get("max_delivery_days", 7) or 1
    price_ratio = min(offer.get("price_eur", 0) / budget, 1.0)
    delivery_ratio = min(offer.get("delivery_days", 0) / max_delivery, 1.0)
    return int(round(100.0 - (price_ratio * 15.0) - (delivery_ratio * 10.0)))


def validate_offer(requirements: dict, offer: dict) -> dict:
    failed = evaluate_constraints(requirements, offer)
    status = "passed" if not failed else "rejected"
    score = 100 if not failed else max(0, 100 - len(failed) * 25)
    next_action = "recommend" if status == "passed" else "Ask seller for a compatible alternative"

    return {
        "seller_id": offer.get("seller_id", ""),
        "status": status,
        "failed_constraints": failed,
        "score": score,
        "next_action": next_action,
    }
