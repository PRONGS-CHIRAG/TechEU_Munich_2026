import re
from backend.schemas import StructuredRequirements, SellerOffer, ValidationResult


def extract_requirements(request) -> dict:
    raw_request = request.get("raw_request", "") if isinstance(request, dict) else request

    requirements: dict = {
        "product_type": "GPU",
        "use_case": "AI workstation",
        "max_length_mm": 300,
        "max_power_watts": 250,
        "budget_eur": 650.0,
        "max_delivery_days": 7,
        "warranty_required": True,
        "minimum_warranty_years": 1,
    }

    budget_match = re.search(r"€(\d+)", raw_request)
    if budget_match:
        requirements["budget_eur"] = float(budget_match.group(1))

    delivery_match = re.search(r"(\d+)\s*day", raw_request, re.IGNORECASE)
    if delivery_match:
        requirements["max_delivery_days"] = int(delivery_match.group(1))

    lower = raw_request.lower()
    if "this week" in lower or "within a week" in lower:
        requirements["max_delivery_days"] = 7

    if "computer vision" in lower:
        requirements["use_case"] = "computer vision"
    elif "data processing" in lower or "analytics" in lower:
        requirements["use_case"] = "data processing"

    size_match = re.search(r"under\s+(\d+)\s*mm", raw_request, re.IGNORECASE)
    if size_match:
        requirements["max_length_mm"] = int(size_match.group(1))

    power_match = re.search(r"under\s+(\d+)\s*[wW](?:\b|att)", raw_request)
    if power_match:
        requirements["max_power_watts"] = int(power_match.group(1))

    warranty_match = re.search(r"(\d+)[\s-]*year", raw_request, re.IGNORECASE)
    if warranty_match:
        requirements["minimum_warranty_years"] = int(warranty_match.group(1))
        requirements["warranty_required"] = True

    return requirements


def compute_value_score(requirements: dict, offer: dict) -> int:
    budget = requirements.get("budget_eur", 650) or 1
    max_delivery = requirements.get("max_delivery_days", 7) or 1
    price_ratio = min(offer.get("price_eur", 0) / budget, 1.0)
    delivery_ratio = min(offer.get("delivery_days", 0) / max_delivery, 1.0)
    return int(round(100.0 - (price_ratio * 15.0) - (delivery_ratio * 10.0)))


def validate_offer(requirements: dict, offer: dict) -> dict:
    failed = []

    if offer.get("length_mm", 0) > requirements.get("max_length_mm", 300):
        failed.append(f"GPU length {offer['length_mm']} mm exceeds {requirements['max_length_mm']} mm limit")

    if offer.get("power_watts", 0) > requirements.get("max_power_watts", 250):
        failed.append(f"Power draw {offer['power_watts']} W exceeds {requirements['max_power_watts']} W limit")

    if offer.get("price_eur", 0) > requirements.get("budget_eur", 650):
        failed.append(f"Price €{offer['price_eur']} exceeds €{requirements['budget_eur']} budget")

    if offer.get("delivery_days", 99) > requirements.get("max_delivery_days", 7):
        failed.append(f"Delivery {offer['delivery_days']} days exceeds {requirements['max_delivery_days']} day limit")

    if requirements.get("warranty_required") and offer.get("warranty_years", 0) < requirements.get(
        "minimum_warranty_years", 1
    ):
        failed.append(
            f"Warranty {offer['warranty_years']} years below required {requirements['minimum_warranty_years']} years"
        )

    status = "passed" if not failed else "rejected"

    score = 100
    if failed:
        score = max(0, 100 - len(failed) * 25)

    next_action = "recommend" if status == "passed" else "Ask seller for a compatible alternative"

    return {
        "seller_id": offer.get("seller_id", ""),
        "status": status,
        "failed_constraints": failed,
        "score": score,
        "next_action": next_action,
    }
