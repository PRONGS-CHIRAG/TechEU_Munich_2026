from backend.agents.procurement_intelligence import evaluate_constraints
from backend.agents.product_utils import product_matches_requirement
from backend.data_access import get_seller_registry, get_seller_inventory


def _is_compatible(item: dict, requirements: dict) -> bool:
    """True when a product passes all hard constraints for these requirements."""
    return product_matches_requirement(item, requirements) and len(evaluate_constraints(requirements, item)) == 0


def _score_seller(seller: dict, inventory: list, requirements: dict) -> tuple[float, list]:
    """Return (match_score, compatible_items) for a seller against requirements."""
    seller_items = [
        i for i in inventory
        if i.get("seller_id") == seller.get("seller_id")
        and product_matches_requirement(i, requirements)
    ]
    if not seller_items:
        return 0.0, []

    compatible = [i for i in seller_items if _is_compatible(i, requirements)]

    if not compatible:
        base_score = 0.4
    else:
        base_score = 0.7 + (len(compatible) / max(len(seller_items), 1)) * 0.3

    reliability = seller.get("reliability_score", 0.5)
    score = round(min(1.0, base_score * (0.7 + reliability * 0.3)), 2)
    return score, compatible


def _score_reason(compatible: list, requirements: dict) -> str:
    if not compatible:
        return "Partial match; check specs before negotiating"
    count = len(compatible)
    min_price = min(i.get("price_eur", 0) for i in compatible)
    min_delivery = min(i.get("delivery_days", 99) for i in compatible)
    product_type = requirements.get("product_type", "product")
    item_label = product_type if count == 1 else f"{product_type}s"
    return (
        f"{count} compatible {item_label} available; "
        f"from €{min_price:.0f}, fastest {min_delivery}-day delivery"
    )


def match_suppliers(requirements: dict) -> list:
    registry = get_seller_registry()
    inventory = get_seller_inventory()

    scored = []
    for seller in registry:
        score, compatible = _score_seller(seller, inventory, requirements)
        if score <= 0:
            continue
        scored.append({
            "seller_id": seller["seller_id"],
            "seller_name": seller["seller_name"],
            "match_score": score,
            "reason": _score_reason(compatible, requirements),
            "specialization": seller.get("specialization", ""),
            "region": seller.get("region", ""),
            "reliability_score": seller.get("reliability_score", 0.0),
            "negotiation_style": seller.get("negotiation_style", ""),
        })

    scored.sort(key=lambda x: x["match_score"], reverse=True)
    return scored[:3]
