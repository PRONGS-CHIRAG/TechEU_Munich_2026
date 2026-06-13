"""Guardrails — system-prompt constraints + post-generation validation for negotiation turns."""

_LLM_FALLBACK_PREFIX = "[LLM unavailable"


def get_system_constraints(requirements: dict) -> str:
    """Build hard-guardrail system-prompt lines for the current buyer requirements.

    GPU-specific dimensions (length, power) are presence-gated.
    extra_constraints are appended generically.
    """
    budget = requirements.get("budget_eur", 650)
    max_days = requirements.get("max_delivery_days", 7)
    min_warranty = requirements.get("minimum_warranty_years", 1)
    product_type = requirements.get("product_type", "product")

    lines = [
        "HARD GUARDRAILS — never concede beyond these in negotiation:",
        f"- Price ceiling: €{budget * 1.1:.0f} (10 % flex for escalation; final deal must not exceed €{budget})",
        f"- Maximum delivery: {max_days + 2} days (±2-day buffer; flag to human above {max_days} days)",
        f"- Minimum warranty: {min_warranty} years",
    ]

    # Physical size constraint — GPU / hardware only
    max_len = requirements.get("max_length_mm")
    if max_len is not None:
        lines.append(f"- Maximum physical length: {max_len} mm")

    # Power constraint — electrical equipment only
    max_pwr = requirements.get("max_power_watts")
    if max_pwr is not None:
        lines.append(f"- Maximum power draw: {max_pwr} W")

    # Extra product-specific constraints
    for c in requirements.get("extra_constraints", []):
        label = c.get("label", c.get("field", "spec"))
        operator = c.get("operator", "<=")
        limit = c.get("limit", "")
        unit = c.get("unit", "")
        op_word = "Maximum" if operator == "<=" else "Minimum"
        lines.append(f"- {op_word} {label}: {limit}{unit}")

    lines += [
        f"- Stay on topic: {product_type} procurement only",
        "- One concise paragraph per turn, professional B2B tone",
        "- Never invent product names, specs, or prices not provided in context",
    ]

    return "\n".join(lines)


def check_turn(text: str, requirements: dict) -> str:
    """Post-generation check. Returns the cleaned turn text, or '' if it should be replaced."""
    if not text or _LLM_FALLBACK_PREFIX in text:
        return ""
    stripped = text.strip()
    if len(stripped) < 10:
        return ""
    return stripped
