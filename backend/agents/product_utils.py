"""Shared product-category helpers for generalized inventory matching."""


def product_matches_requirement(product: dict, requirements: dict) -> bool:
    """Best-effort category filter before numeric validation.

    Inventory is hackathon JSON, not a normalized catalog, so use stable field
    families plus product-name hints. Unknown product types are allowed through
    so custom free-text requests still get candidates instead of an empty demo.
    """
    product_type = str(requirements.get("product_type", "product")).lower()
    name = str(product.get("product", "")).lower()
    keys = set(product.keys())

    if any(token in product_type for token in ("gpu", "graphics", "workstation")):
        return bool({"length_mm", "power_watts"} & keys) or any(
            token in name for token in ("rtx", "gpu", "radeon")
        )

    if any(token in product_type for token in ("chair", "seating", "ergonomic")):
        return bool({"load_rating_kg", "seat_width_mm"} & keys) or "chair" in name

    if any(token in product_type for token in ("sensor", "proximity")):
        return bool({"ip_rating", "range_m"} & keys) or any(
            token in name for token in ("sensor", "proxima")
        )

    if "server" in product_type:
        return "server" in name

    if "laptop" in product_type:
        return "laptop" in name or "notebook" in name

    return True
