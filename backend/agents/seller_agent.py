def get_initial_offer(seller_id: str, requirements: dict, inventory: list) -> dict | None:
    seller_items = [
        i for i in inventory
        if i.get("seller_id") == seller_id and i.get("availability") != "out_of_stock"
    ]
    if not seller_items:
        return None

    compatible = [
        i for i in seller_items
        if i.get("length_mm", 999) <= requirements.get("max_length_mm", 300)
        and i.get("power_watts", 999) <= requirements.get("max_power_watts", 250)
    ]

    candidates = compatible if compatible else seller_items
    return max(candidates, key=lambda x: x.get("price_eur", 9999))


def request_alternative(seller_id: str, requirements: dict, inventory: list, current_offer: dict) -> dict | None:
    seller_items = [
        i for i in inventory
        if i.get("seller_id") == seller_id and i.get("availability") != "out_of_stock"
    ]
    max_len = requirements.get("max_length_mm", 300)
    max_pwr = requirements.get("max_power_watts", 250)
    budget = requirements.get("budget_eur", 650)
    max_days = requirements.get("max_delivery_days", 7)
    min_warranty = requirements.get("minimum_warranty_years", 1)

    fully_compliant = [
        i for i in seller_items
        if i.get("length_mm", 999) <= max_len
        and i.get("power_watts", 999) <= max_pwr
        and i.get("price_eur", 9999) <= budget
        and i.get("delivery_days", 99) <= max_days
        and i.get("warranty_years", 0) >= min_warranty
        and i.get("product") != current_offer.get("product")
    ]

    if fully_compliant:
        return min(fully_compliant, key=lambda x: x.get("price_eur", 9999))

    cheaper_compatible = [
        i for i in seller_items
        if i.get("price_eur", 9999) < current_offer.get("price_eur", 9999)
        and i.get("length_mm", 999) <= max_len
        and i.get("power_watts", 999) <= max_pwr
    ]

    if cheaper_compatible:
        return min(cheaper_compatible, key=lambda x: x.get("price_eur", 9999))

    return None
