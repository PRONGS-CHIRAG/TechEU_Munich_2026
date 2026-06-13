from backend.agents.procurement_intelligence import (
    extract_requirements,
    validate_offer,
    evaluate_constraints,
)


GPU_REQUIREMENTS = {
    "product_type": "GPU",
    "use_case": "AI workstation",
    "max_length_mm": 300,
    "max_power_watts": 250,
    "budget_eur": 650.0,
    "max_delivery_days": 7,
    "warranty_required": True,
    "minimum_warranty_years": 1,
    "extra_constraints": [],
}

CHAIR_REQUIREMENTS = {
    "product_type": "office chair",
    "use_case": "office workspace",
    "budget_eur": 400.0,
    "max_delivery_days": 10,
    "warranty_required": True,
    "minimum_warranty_years": 2,
    "extra_constraints": [
        {"field": "load_rating_kg", "label": "Load rating", "operator": ">=", "limit": 120, "unit": "kg"},
    ],
}


# ── Existing GPU validation tests (unchanged) ──────────────────────────────────

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
    result = validate_offer(GPU_REQUIREMENTS, offer)
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
    result = validate_offer(GPU_REQUIREMENTS, offer)
    assert result["status"] == "rejected"
    assert any("length" in c.lower() for c in result["failed_constraints"])
    assert any("power" in c.lower() or "watt" in c.lower() for c in result["failed_constraints"])
    assert any("price" in c.lower() or "budget" in c.lower() for c in result["failed_constraints"])


def test_extract_requirements_budget():
    req = extract_requirements("We need a GPU for AI. Budget €500, delivery this week.")
    assert req["budget_eur"] == 500.0


def test_extract_requirements_gpu_no_size_defaults():
    # "We need a GPU." with no explicit size — max_length_mm / max_power_watts
    # must NOT be defaulted; they are absent (only present when buyer states them).
    req = extract_requirements("We need a GPU.")
    assert "max_length_mm" not in req
    assert "max_power_watts" not in req
    assert req["warranty_required"] is True


def test_extract_requirements_gpu_explicit_size():
    req = extract_requirements("We need a GPU under 280mm and under 200W.")
    assert req.get("max_length_mm") == 280
    assert req.get("max_power_watts") == 200


# ── New generic / extra_constraints tests ──────────────────────────────────────

def test_evaluate_constraints_gpu_passes():
    failures = evaluate_constraints(
        GPU_REQUIREMENTS,
        {"price_eur": 580, "delivery_days": 4, "warranty_years": 2, "length_mm": 242, "power_watts": 200},
    )
    assert failures == []


def test_evaluate_constraints_gpu_no_length_power_when_absent():
    # Requirements without max_length_mm/max_power_watts → those dims are not checked
    req = {"budget_eur": 650, "max_delivery_days": 7, "warranty_required": True, "minimum_warranty_years": 1, "extra_constraints": []}
    failures = evaluate_constraints(req, {"price_eur": 600, "delivery_days": 5, "warranty_years": 2, "length_mm": 999, "power_watts": 999})
    assert failures == []


def test_evaluate_constraints_chair_passes():
    failures = evaluate_constraints(
        CHAIR_REQUIREMENTS,
        {"price_eur": 280, "delivery_days": 4, "warranty_years": 2, "load_rating_kg": 120},
    )
    assert failures == []


def test_evaluate_constraints_chair_fails_missing_field():
    # A GPU product (no load_rating_kg) must fail for a chair buyer
    failures = evaluate_constraints(
        CHAIR_REQUIREMENTS,
        {"price_eur": 310, "delivery_days": 3, "warranty_years": 1, "length_mm": 210, "power_watts": 130},
    )
    assert any("missing" in f.lower() for f in failures)


def test_evaluate_constraints_chair_fails_too_light():
    failures = evaluate_constraints(
        CHAIR_REQUIREMENTS,
        {"price_eur": 199, "delivery_days": 3, "warranty_years": 1, "load_rating_kg": 100},
    )
    assert any("load rating" in f.lower() for f in failures)
