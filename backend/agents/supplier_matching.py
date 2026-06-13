from backend.data_access import get_seller_registry, get_seller_inventory


def _score_seller(seller: dict, inventory: list, requirements: dict) -> float:
    seller_items = [i for i in inventory if i.get("seller_id") == seller.get("seller_id")]
    if not seller_items:
        return 0.0

    compatible = [
        i for i in seller_items
        if i.get("length_mm", 999) <= requirements.get("max_length_mm", 300)
        and i.get("power_watts", 999) <= requirements.get("max_power_watts", 250)
        and i.get("price_eur", 9999) <= requirements.get("budget_eur", 650) * 1.2
    ]

    if not compatible:
        base_score = 0.4
    else:
        base_score = 0.7 + (len(compatible) / max(len(seller_items), 1)) * 0.3

    reliability = seller.get("reliability_score", 0.5)
    return round(min(1.0, base_score * (0.7 + reliability * 0.3)), 2)


def _score_reason(compatible: list, score: float) -> str:
    if not compatible:
        return "Partial match; check specs before negotiating"
    count = len(compatible)
    min_price = min(i.get("price_eur", 0) for i in compatible)
    min_delivery = min(i.get("delivery_days", 99) for i in compatible)
    gpu_label = "GPU" if count == 1 else "GPUs"
    return f"{count} compatible {gpu_label} available; from €{min_price:.0f}, fastest {min_delivery}-day delivery"


def match_suppliers(requirements: dict) -> list:
    registry = get_seller_registry()
    inventory = get_seller_inventory()

    scored = []
    for seller in registry:
        seller_items = [i for i in inventory if i.get("seller_id") == seller.get("seller_id")]
        compatible = [
            i for i in seller_items
            if i.get("length_mm", 999) <= requirements.get("max_length_mm", 300)
            and i.get("power_watts", 999) <= requirements.get("max_power_watts", 250)
            and i.get("price_eur", 9999) <= requirements.get("budget_eur", 650) * 1.2
        ]
        score = _score_seller(seller, inventory, requirements)
        scored.append({
            "seller_id": seller["seller_id"],
            "seller_name": seller["seller_name"],
            "match_score": score,
            "reason": _score_reason(compatible, score),
        })

    scored.sort(key=lambda x: x["match_score"], reverse=True)
    return scored[:3]
