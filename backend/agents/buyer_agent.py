from backend.agents.seller_agent import get_initial_offer, request_alternative
from backend.data_access import get_seller_inventory


def run_negotiation(requirements: dict, matched_suppliers: list) -> tuple[list, list]:
    inventory = get_seller_inventory()
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

            violations = []
            if offer["price_eur"] > requirements.get("budget_eur", 650):
                violations.append(f"the price €{offer['price_eur']} exceeds our budget of €{requirements['budget_eur']}")
            if offer.get("delivery_days", 0) > requirements.get("max_delivery_days", 7):
                violations.append(f"delivery of {offer['delivery_days']} days exceeds our {requirements['max_delivery_days']}-day limit")
            if offer.get("warranty_years", 0) < requirements.get("minimum_warranty_years", 1):
                violations.append(f"warranty of {offer['warranty_years']} years is below our required {requirements['minimum_warranty_years']} years")

            if violations:
                issues = "; ".join(violations)
                counter = f"Your offer has the following issues: {issues}. Can you offer a better alternative?"
                logs.append({"seller_id": seller_id, "seller_name": seller_name, "speaker": "buyer", "message": counter, "round": 2, "pioneer_labels": [], "risk_level": "low"})

                alt_offer = request_alternative(seller_id, requirements, inventory, offer)
                if alt_offer is not None:
                    offer = alt_offer
                    logs.append({
                        "seller_id": seller_id,
                        "seller_name": seller_name,
                        "speaker": "seller",
                        "message": f"We can offer {offer['product']} at €{offer['price_eur']}. {offer['delivery_days']}-day delivery, {offer['warranty_years']}-year warranty.",
                        "round": 2,
                        "pioneer_labels": [],
                        "risk_level": "low",
                    })
                else:
                    logs.append({
                        "seller_id": seller_id,
                        "seller_name": seller_name,
                        "speaker": "seller",
                        "message": f"We understand your constraints, but {offer['product']} at €{offer['price_eur']} is the best we can offer. We cannot improve on price, delivery, or warranty beyond this.",
                        "round": 2,
                        "pioneer_labels": [],
                        "risk_level": "medium",
                    })

            final_offers.append({**offer, "seller_name": seller_name})
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
