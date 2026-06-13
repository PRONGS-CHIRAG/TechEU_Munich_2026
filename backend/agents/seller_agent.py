def get_initial_offer(seller_id: str, requirements: dict, inventory: list) -> dict | None:
    seller_items = [i for i in inventory if i.get("seller_id") == seller_id]
    if not seller_items:
        return None

    compatible = [
        i for i in seller_items
        if i.get("length_mm", 999) <= requirements.get("max_length_mm", 300)
        and i.get("power_watts", 999) <= requirements.get("max_power_watts", 250)
    ]

    candidates = compatible if compatible else seller_items
    return min(candidates, key=lambda x: x.get("price_eur", 9999))


def request_alternative(seller_id: str, requirements: dict, inventory: list, current_offer: dict) -> dict | None:
    seller_items = [i for i in inventory if i.get("seller_id") == seller_id]

    cheaper = [
        i for i in seller_items
        if i.get("price_eur", 9999) < current_offer.get("price_eur", 9999)
        and i.get("length_mm", 999) <= requirements.get("max_length_mm", 300)
        and i.get("power_watts", 999) <= requirements.get("max_power_watts", 250)
    ]

    if cheaper:
        return min(cheaper, key=lambda x: x.get("price_eur", 9999))

    return current_offer
