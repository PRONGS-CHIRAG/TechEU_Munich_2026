def get_delivery_context(requirements: dict, product: dict, seller: dict) -> str:
    max_days = requirements.get("max_delivery_days", 7)
    delivery = product.get("delivery_days", 0)
    region = seller.get("region", "")
    delta = delivery - max_days
    if delta > 0:
        region_note = f" (seller ships from {region})" if region else ""
        return (
            f"Delivery is {delivery} days, exceeding the {max_days}-day limit by {delta} days{region_note}. "
            f"Request express shipping, priority processing, or a committed earlier slot."
        )
    return (
        f"Delivery is {delivery} days, {abs(delta)} days within the {max_days}-day requirement. "
        f"Confirm the delivery commitment in writing and ask for tracking."
    )
