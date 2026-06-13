import os
import re


def fallback_pioneer_labels(message: str) -> dict:
    msg_lower = message.lower()
    labels = []

    if any(w in msg_lower for w in ["€", "price", "cost", "reduce", "cheaper", "discount"]):
        labels.append("price_concession")
    if any(w in msg_lower for w in ["delivery", "days", "ship", "arrive", "lead time"]):
        labels.append("delivery_condition")
    if any(w in msg_lower for w in ["warranty", "guarantee", "months", "sla", "support"]):
        labels.append("warranty_risk")
    if any(w in msg_lower for w in [
        "mm", "watt", "power", "spec", "length", "capacity", "rating",
        "dimension", "kg", "range", "ip", "sensor", "seats",
    ]):
        labels.append("technical_info")
    if any(w in msg_lower for w in ["final", "last offer", "best price", "cannot improve"]):
        labels.append("final_offer")
    if not labels:
        labels.append("technical_info")

    risk = "low"
    if "warranty_risk" in labels:
        risk = "medium"
    if len(labels) >= 3:
        risk = "medium"

    price_match = re.search(r"€(\d+)", message)
    delivery_match = re.search(r"(\d+)\s*day", message, re.IGNORECASE)
    extracted: dict = {}
    if price_match:
        extracted["price_eur"] = int(price_match.group(1))
    if delivery_match:
        extracted["delivery_days"] = int(delivery_match.group(1))

    return {
        "message": message,
        "labels": labels,
        "risk_level": risk,
        "extracted_fields": extracted,
    }


def fallback_tavily_result() -> dict:
    return {
        "source": "fallback",
        "results": [
            {
                "title": "B2B Procurement Supplier Search — TechSpec DB",
                "url": "https://example.com/supplier-search",
                "content": "Search for compatible B2B suppliers in Europe. Compare pricing, delivery, and specifications.",
            }
        ],
        "query": "B2B product supplier Europe",
    }


def fallback_deal_card_path() -> str:
    return os.path.join(os.path.dirname(__file__), "../assets/fal_deal_card.png")
