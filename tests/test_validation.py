from backend.agents.procurement_intelligence import extract_requirements, validate_offer


REQUIREMENTS = {
    "product_type": "GPU",
    "use_case": "AI workstation",
    "max_length_mm": 300,
    "max_power_watts": 250,
    "budget_eur": 650.0,
    "max_delivery_days": 7,
    "warranty_required": True,
    "minimum_warranty_years": 1,
}


def test_validate_offer_passes():
    offer = {
        "seller_id": "vendor_b",
        "seller_name": "Vendor B",
        "product": "RTX 4070 Super Compact",
        "length_mm": 267,
        "power_watts": 220,
        "price_eur": 640.0,
        "delivery_days": 5,
        "warranty_years": 2,
        "availability": "in_stock",
    }
    result = validate_offer(REQUIREMENTS, offer)
    assert result["status"] == "passed"
    assert result["failed_constraints"] == []


def test_validate_offer_rejects_oversize():
    offer = {
        "seller_id": "vendor_a",
        "seller_name": "Vendor A",
        "product": "RTX 4080",
        "length_mm": 320,
        "power_watts": 320,
        "price_eur": 700.0,
        "delivery_days": 5,
        "warranty_years": 2,
        "availability": "in_stock",
    }
    result = validate_offer(REQUIREMENTS, offer)
    assert result["status"] == "rejected"
    assert any("length" in c.lower() for c in result["failed_constraints"])
    assert any("power" in c.lower() or "watt" in c.lower() for c in result["failed_constraints"])
    assert any("price" in c.lower() or "budget" in c.lower() for c in result["failed_constraints"])


def test_extract_requirements_budget():
    req = extract_requirements("We need a GPU for AI. Budget €500, delivery this week.")
    assert req["budget_eur"] == 500.0


def test_extract_requirements_defaults():
    req = extract_requirements("We need a GPU.")
    assert req["max_length_mm"] == 300
    assert req["max_power_watts"] == 250
    assert req["warranty_required"] is True
