"""Warranty sub-agent — contributes the warranty-negotiation angle for a turn."""


def angle(requirements: dict, product: dict, seller: dict) -> str:
    min_warranty = requirements.get("minimum_warranty_years", 1)
    warranty = product.get("warranty_years", 0)

    if warranty < min_warranty:
        return (
            f"Warranty ({warranty}y) is below the required {min_warranty}y — "
            "ask whether an extended-warranty add-on is available."
        )
    return (
        f"Warranty ({warranty}y) meets the {min_warranty}y requirement — "
        "confirm coverage terms (parts vs. full replacement)."
    )
