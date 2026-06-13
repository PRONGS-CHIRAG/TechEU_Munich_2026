import json
import os
from typing import List


REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "../../data/seller_registry.json")
INVENTORY_PATH = os.path.join(os.path.dirname(__file__), "../../data/seller_inventory.json")


def _load_json(path: str) -> list:
    try:
        with open(os.path.abspath(path)) as f:
            return json.load(f)
    except FileNotFoundError:
        return []


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


def _score_reason(seller: dict, score: float) -> str:
    if score >= 0.85:
        return f"Has compatible inventory with high reliability"
    elif score >= 0.7:
        return f"Good inventory match; some products may exceed constraints"
    else:
        return f"Partial match; check specs before negotiating"


def match_suppliers(requirements: dict) -> list:
    registry = _load_json(REGISTRY_PATH)
    inventory = _load_json(INVENTORY_PATH)

    scored = []
    for seller in registry:
        score = _score_seller(seller, inventory, requirements)
        scored.append({
            "seller_id": seller["seller_id"],
            "seller_name": seller["seller_name"],
            "match_score": score,
            "reason": _score_reason(seller, score),
        })

    scored.sort(key=lambda x: x["match_score"], reverse=True)
    return scored[:3]
