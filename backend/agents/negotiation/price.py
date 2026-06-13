"""Price sub-agent — contributes the price-negotiation angle for a turn."""


def angle(requirements: dict, product: dict, seller: dict) -> str:
    budget = requirements.get("budget_eur", 0)
    price = product.get("price_eur", 0)
    diff = price - budget

    if diff > 0:
        return (
            f"Price (€{price}) is €{diff:.0f} over the €{budget} budget — "
            "ask for a discount or bundled extras to close the gap."
        )
    return (
        f"Price (€{price}) is €{budget - price:.0f} under the €{budget} budget — "
        "there is room to negotiate value-adds rather than a further discount."
    )
