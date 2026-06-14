def get_price_context(requirements: dict, product: dict, seller: dict) -> str:
    budget = requirements.get("budget_eur")
    price = product.get("price_eur", 0)
    style = seller.get("negotiation_style", "flexible")
    if budget is None:
        return (
            f"Price is €{price}. No fixed budget constraint — focus on getting the best "
            f"possible value (price, delivery, warranty). Seller style is {style}."
        )
    delta = price - budget
    if delta > 0:
        style_note = "be firm and reference competing offers" if style == "aggressive" else "they may have flexibility"
        return (
            f"Price is €{price}, which is €{delta:.0f} over the €{budget} budget. "
            f"Push for a discount or lower-spec alternative. Seller style is {style} — {style_note}."
        )
    return (
        f"Price is €{price}, within the €{budget} budget by €{abs(delta):.0f}. "
        f"Confirm price and explore whether an early-payment or volume discount applies."
    )
