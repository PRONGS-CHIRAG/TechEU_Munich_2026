"""Delivery sub-agent — contributes the delivery-negotiation angle for a turn."""


def angle(requirements: dict, product: dict, seller: dict) -> str:
    max_days = requirements.get("max_delivery_days", 7)
    days = product.get("delivery_days", 0)
    diff = days - max_days

    if diff > 0:
        return (
            f"Delivery ({days} days) exceeds the {max_days}-day requirement by "
            f"{diff} day(s) — push for expedited shipping or a partial-shipment plan."
        )
    return (
        f"Delivery ({days} days) is within the {max_days}-day requirement — "
        "confirm this timeline holds for the order."
    )
