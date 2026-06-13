import json
import os
from backend.agents.seller_agent import get_initial_offer, request_alternative

INVENTORY_PATH = os.path.join(os.path.dirname(__file__), "../../data/seller_inventory.json")


def _load_inventory() -> list:
    try:
        with open(os.path.abspath(INVENTORY_PATH)) as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def run_negotiation(requirements: dict, matched_suppliers: list) -> tuple[list, list]:
    inventory = _load_inventory()
    logs = []
    final_offers = []

    for supplier in matched_suppliers:
        seller_id = supplier["seller_id"]
        seller_name = supplier["seller_name"]

        intro = (
            f"Hello {seller_name}. We are looking for a {requirements.get('product_type', 'GPU')} "
            f"for {requirements.get('use_case', 'an AI workstation')}. Our budget is "
            f"€{requirements.get('budget_eur', 650)}, max size {requirements.get('max_length_mm', 300)} mm, "
            f"and delivery within {requirements.get('max_delivery_days', 7)} days."
        )
        logs.append({"seller_id": seller_id, "seller_name": seller_name, "speaker": "buyer", "message": intro, "round": 1, "pioneer_labels": [], "risk_level": "low"})

        offer = get_initial_offer(seller_id, requirements, inventory)
        if offer:
            logs.append({
                "seller_id": seller_id,
                "seller_name": seller_name,
                "speaker": "seller",
                "message": f"We can offer {offer['product']} at €{offer['price_eur']}, delivery in {offer['delivery_days']} days, {offer['warranty_years']}-year warranty.",
                "round": 1,
                "pioneer_labels": [],
                "risk_level": "low",
            })

            if offer["price_eur"] > requirements.get("budget_eur", 650):
                counter = f"Your offer is above our budget of €{requirements['budget_eur']}. Can you reduce the price or suggest a cheaper alternative?"
                logs.append({"seller_id": seller_id, "seller_name": seller_name, "speaker": "buyer", "message": counter, "round": 2, "pioneer_labels": [], "risk_level": "low"})

                alt_offer = request_alternative(seller_id, requirements, inventory, offer)
                if alt_offer:
                    offer = alt_offer
                    logs.append({
                        "seller_id": seller_id,
                        "seller_name": seller_name,
                        "speaker": "seller",
                        "message": f"We can offer {offer['product']} at €{offer['price_eur']} as our best price. {offer['delivery_days']}-day delivery, {offer['warranty_years']}-year warranty.",
                        "round": 2,
                        "pioneer_labels": [],
                        "risk_level": "low",
                    })

            final_offers.append(offer)
        else:
            logs.append({
                "seller_id": seller_id,
                "seller_name": seller_name,
                "speaker": "seller",
                "message": "We currently have no compatible products in stock.",
                "round": 1,
                "pioneer_labels": ["missing_information"],
                "risk_level": "medium",
            })

    return logs, final_offers
