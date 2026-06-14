"""Shared product-category helpers for generalized inventory matching."""

import re


_STOPWORDS = {
    "a", "an", "and", "any", "are", "at", "best", "business", "buy", "buying",
    "can", "compatible", "corporate", "delivery", "for", "from", "good", "in",
    "need", "needs", "of", "or", "our", "procure", "procurement", "purchase",
    "purchasing", "request", "supplier", "suppliers", "the", "to", "under",
    "unit", "units", "use", "we", "with", "within",
}

_KNOWN_CATEGORY_ALIASES = {
    "gpu": ("gpu", "graphics", "graphics card", "rtx", "radeon"),
    "chair": ("chair", "chairs", "seating", "ergonomic", "furniture", "seat"),
    "sensor": ("sensor", "sensors", "proximity", "detector", "detection"),
    "server": ("server", "servers", "rack", "blade", "node"),
    "laptop": ("laptop", "laptops", "notebook", "notebooks"),
}


def _tokens(*values: object) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        if value is None:
            continue
        if isinstance(value, list):
            tokens.update(_tokens(*value))
            continue
        for token in re.findall(r"[a-z0-9]+", str(value).lower()):
            if len(token) >= 3 and token not in _STOPWORDS:
                tokens.add(token)
    return tokens


def _requested_category(requirements: dict) -> str | None:
    haystack = " ".join(
        [
            str(requirements.get("product_type", "")),
            str(requirements.get("use_case", "")),
            " ".join(str(k) for k in requirements.get("product_keywords", [])),
        ]
    ).lower()
    for category, aliases in _KNOWN_CATEGORY_ALIASES.items():
        if any(alias in haystack for alias in aliases):
            return category
    return None


def product_matches_requirement(product: dict, requirements: dict) -> bool:
    """Best-effort category filter before numeric validation.

    Inventory is hackathon JSON, not a normalized catalog, so use stable field
    families plus product-name hints. Unknown product types must not fall through
    to every demo inventory category; they only match on explicit product-word
    overlap with inventory names.
    """
    name = str(product.get("product", "")).lower()
    keys = set(product.keys())
    category = _requested_category(requirements)

    if category == "gpu":
        return bool({"length_mm", "power_watts"} & keys) or any(
            token in name for token in ("rtx", "gpu", "radeon")
        )

    if category == "chair":
        return bool({"load_rating_kg", "seat_width_mm"} & keys) or "chair" in name

    if category == "sensor":
        return bool({"ip_rating", "range_m"} & keys) or any(
            token in name for token in ("sensor", "proxima")
        )

    if category == "server":
        return "server" in name

    if category == "laptop":
        return "laptop" in name or "notebook" in name

    requested_tokens = _tokens(
        requirements.get("product_type", ""),
        requirements.get("use_case", ""),
        requirements.get("product_keywords", []),
    )
    name_tokens = _tokens(product.get("product", ""))
    return bool(requested_tokens and requested_tokens & name_tokens)
