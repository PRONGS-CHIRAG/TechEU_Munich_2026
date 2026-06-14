from threading import Thread
from time import sleep

from backend.hitl_sessions import (
    close_session,
    create_session,
    submit_response,
    wait_for_response,
)
from backend.orchestrator import _normalize_request, run_demo_events
from backend.agents.negotiation_agent import STRATEGY_CONFIG, SELLER_MAX_DISCOUNT_PCT


def test_custom_prompt_request_gets_generated_request_id():
    request = _normalize_request(
        {
            "raw_request": "Need industrial tablets under €900 with rugged cases within 12 days.",
            "region": "Germany",
            "priority": "technical_fit",
        }
    )

    assert request["request_id"].startswith("CUSTOM-")
    assert request["raw_request"] == "Need industrial tablets under €900 with rugged cases within 12 days."
    assert request["region"] == "Germany"


def test_hitl_session_waits_for_submitted_response():
    session_id = "test-session"
    create_session(session_id)
    result = {}

    def waiter():
        result.update(wait_for_response(session_id, timeout_seconds=2))

    thread = Thread(target=waiter)
    thread.start()
    sleep(0.05)

    accepted = submit_response(
        session_id,
        {"action": "approve", "note": "Approved in test"},
    )
    thread.join(timeout=2)
    close_session(session_id)

    assert accepted is True
    assert result["action"] == "approve"
    assert result["note"] == "Approved in test"


def test_run_demo_events_waits_at_human_alert(monkeypatch):
    requirements = {
        "product_type": "office chair",
        "use_case": "team seating",
        "budget_eur": 400,
        "max_delivery_days": 10,
        "warranty_required": True,
        "minimum_warranty_years": 2,
        "extra_constraints": [],
    }
    product = {
        "seller_id": "vendor_f",
        "seller_name": "Chair Vendor",
        "product": "Ergo Chair",
        "price_eur": 320,
        "delivery_days": 5,
        "warranty_years": 3,
        "availability": "in_stock",
    }
    supplier = {
        "seller_id": "vendor_f",
        "seller_name": "Chair Vendor",
        "match_score": 0.94,
        "reason": "Strong ergonomic chair match",
    }
    cluster = {
        "cluster_id": "cluster_1",
        "products": [product],
        "similarity_score": 1,
        "representative_specs": {"avg_price_eur": 320, "avg_delivery_days": 5},
    }
    candidate = {
        "cluster_id": "cluster_1",
        "seller_id": "vendor_f",
        "product": "Ergo Chair",
        "verdict": "good",
        "reason": "Meets chair constraints.",
        "score": 95,
    }

    monkeypatch.setattr("backend.orchestrator.extract_requirements", lambda _request: requirements)
    monkeypatch.setattr("backend.orchestrator.get_all_products_flat", lambda **_kw: [product])
    monkeypatch.setattr("backend.orchestrator.cluster_products", lambda _req, _products: [cluster])
    monkeypatch.setattr("backend.orchestrator.judge_candidate", lambda _req, _cluster: candidate)
    monkeypatch.setattr("backend.orchestrator.match_suppliers", lambda _req: [supplier])
    monkeypatch.setattr("backend.orchestrator.get_seller_inventory", lambda **_kw: [product])
    def negotiate_round(_req, _supplier, _inventory, _judged, **kwargs):
        yield (
            {
                "seller_id": "vendor_f",
                "seller_name": "Chair Vendor",
                "speaker": "seller",
                "message": "We can offer the Ergo Chair.",
                "round": kwargs.get("round_num", 1),
                "event_kind": "turn",
                "pioneer_labels": [],
                "risk_level": "low",
                "extracted_fields": {},
            },
            product,
        )

    monkeypatch.setattr("backend.orchestrator.negotiate_supplier_round", negotiate_round)
    monkeypatch.setattr(
        "backend.orchestrator.validate_offer",
        lambda _req, offer: {
            "seller_id": offer["seller_id"],
            "status": "passed",
            "failed_constraints": [],
            "score": 0,
        },
    )
    monkeypatch.setattr("backend.orchestrator.compute_value_score", lambda _req, _offer: 91)
    monkeypatch.setattr(
        "backend.orchestrator.check_escalation",
        lambda _results, _req, _best: {
            "escalate": True,
            "trigger": "approval_required",
            "reason": "Final approval required.",
            "question_for_human": "Approve this chair purchase?",
        },
    )
    monkeypatch.setattr(
        "backend.orchestrator.classify_message",
        lambda _message: {"labels": ["final_offer"], "risk_level": "low"},
    )
    monkeypatch.setattr("backend.orchestrator.search_external_supplier", lambda _req: {})
    monkeypatch.setattr("backend.orchestrator.generate_summary", lambda *_args: "Audit text")
    monkeypatch.setattr("backend.orchestrator.generate_deal_card", lambda _rec: "assets/fal_deal_card.png")

    waited = []
    call_count = [0]

    def wait_for_human(session_id, alert):
        waited.append((session_id, alert["trigger"]))
        call_count[0] += 1
        if alert["trigger"] == "strategy_selection":
            # First alert: respond with strategy choice
            return {"action": "select_strategy", "strategy": "medium"}
        # Second alert: deal comparison — approve vendor_f
        return {"action": "approve", "selected_seller_id": "vendor_f"}

    events = list(
        run_demo_events(
            {"request_id": "REQ-TEST", "raw_request": "Need chairs", "region": "Germany", "priority": "technical_fit"},
            session_id="session-123",
            wait_for_human=wait_for_human,
        )
    )

    types = [event["type"] for event in events]
    human_alert_indices = [i for i, t in enumerate(types) if t == "human_alert"]

    # Two human_alert events: strategy_selection first, then deal_comparison
    assert len(human_alert_indices) == 2
    assert events[human_alert_indices[0]]["data"]["trigger"] == "strategy_selection"
    assert events[human_alert_indices[1]]["data"]["trigger"] == "deal_comparison"

    # Strategy alert comes before any negotiation turns
    first_neg_idx = next((i for i, t in enumerate(types) if t == "negotiation_turn"), len(types))
    assert human_alert_indices[0] < first_neg_idx

    # Deal comparison alert comes before escalation (if escalation event is present)
    if "escalation" in types:
        assert types.index("escalation") > human_alert_indices[1]

    assert waited == [
        ("session-123", "strategy_selection"),
        ("session-123", "deal_comparison"),
    ]

    done = events[-1]["data"]
    assert done["escalation_result"]["human_response"]["action"] == "approve"
    assert done["escalation_result"]["human_response"]["selected_seller_id"] == "vendor_f"
    assert done["negotiation_strategy"] == "medium"
    assert done["negotiation_outcome"]["status"] == "accepted"
    assert done["negotiation_outcome"]["selected_seller_id"] == "vendor_f"
    assert done["negotiation_outcome"]["user_choice"] == "approved"
    assert isinstance(done["negotiation_outcome"]["all_offers"], list)
    assert len(done["negotiation_outcome"]["all_offers"]) > 0


def test_counter_message_continues_parallel_negotiation_and_caps_suppliers(monkeypatch):
    requirements = {
        "product_type": "GPU",
        "use_case": "AI workstation",
        "budget_eur": 700,
        "max_delivery_days": 7,
        "warranty_required": True,
        "minimum_warranty_years": 1,
        "extra_constraints": [],
    }
    suppliers = [
        {
            "seller_id": f"vendor_{idx}",
            "seller_name": f"Vendor {idx}",
            "match_score": 1 - idx * 0.1,
            "reason": "match",
        }
        for idx in range(4)
    ]
    products = [
        {
            "seller_id": supplier["seller_id"],
            "seller_name": supplier["seller_name"],
            "product": f"GPU {supplier['seller_id']}",
            "price_eur": 650,
            "delivery_days": 5,
            "warranty_years": 2,
            "availability": "in_stock",
        }
        for supplier in suppliers
    ]
    clusters = [
        {
            "cluster_id": "cluster_1",
            "products": products,
            "similarity_score": 1,
            "representative_specs": {"avg_price_eur": 650},
        }
    ]
    candidate = {
        "cluster_id": "cluster_1",
        "seller_id": "vendor_0",
        "product": "GPU vendor_0",
        "verdict": "good",
        "reason": "Fits.",
        "score": 90,
    }

    monkeypatch.setattr("backend.orchestrator.extract_requirements", lambda _request: requirements)
    monkeypatch.setattr("backend.orchestrator.get_all_products_flat", lambda **_kw: products)
    monkeypatch.setattr("backend.orchestrator.cluster_products", lambda _req, _products: clusters)
    monkeypatch.setattr("backend.orchestrator.judge_candidate", lambda _req, _cluster: candidate)
    monkeypatch.setattr("backend.orchestrator.match_suppliers", lambda _req: suppliers)
    monkeypatch.setattr("backend.orchestrator.get_seller_inventory", lambda **_kw: products)
    monkeypatch.setattr(
        "backend.orchestrator.validate_offer",
        lambda _req, offer: {
            "seller_id": offer["seller_id"],
            "status": "passed",
            "failed_constraints": [],
            "score": 0,
        },
    )
    monkeypatch.setattr("backend.orchestrator.compute_value_score", lambda _req, _offer: 91)
    monkeypatch.setattr(
        "backend.orchestrator.check_escalation",
        lambda _results, _req, _best: {
            "escalate": False,
            "trigger": "",
            "reason": "",
            "question_for_human": "",
        },
    )
    monkeypatch.setattr(
        "backend.orchestrator.classify_message",
        lambda _message: {"labels": ["final_offer"], "risk_level": "low", "extracted_fields": {}},
    )
    monkeypatch.setattr("backend.orchestrator.search_external_supplier", lambda _req: {})
    monkeypatch.setattr("backend.orchestrator.generate_summary", lambda *_args: "Audit text")
    monkeypatch.setattr("backend.orchestrator.generate_deal_card", lambda _rec: "assets/fal_deal_card.png")

    seen_rounds = []
    seen_counter_messages = []

    def negotiate_round(_req, supplier, _inventory, _judged, **kwargs):
        seen_rounds.append((supplier["seller_id"], kwargs.get("round_num")))
        if kwargs.get("buyer_message_override"):
            seen_counter_messages.append((supplier["seller_id"], kwargs["buyer_message_override"]))
        offer = next(p for p in products if p["seller_id"] == supplier["seller_id"])
        yield (
            {
                "seller_id": supplier["seller_id"],
                "seller_name": supplier["seller_name"],
                "speaker": "seller",
                "message": f"Offer from {supplier['seller_name']}",
                "round": kwargs.get("round_num", 1),
                "event_kind": "turn",
                "pioneer_labels": [],
                "risk_level": "low",
                "extracted_fields": {},
            },
            offer,
        )

    monkeypatch.setattr("backend.orchestrator.negotiate_supplier_round", negotiate_round)

    deal_alerts = [0]

    def wait_for_human(_session_id, alert):
        if alert["trigger"] == "strategy_selection":
            return {"action": "select_strategy", "strategy": "medium"}
        deal_alerts[0] += 1
        if deal_alerts[0] == 1:
            return {"action": "counter", "note": "Can you improve delivery and warranty?"}
        return {"action": "approve", "selected_seller_id": "vendor_1"}

    events = list(
        run_demo_events(
            {"request_id": "REQ-TEST", "raw_request": "Need GPUs", "region": "Germany", "priority": "technical_fit"},
            session_id="session-counter",
            wait_for_human=wait_for_human,
        )
    )

    negotiated_sellers = {seller_id for seller_id, _round in seen_rounds}
    assert negotiated_sellers == {"vendor_0", "vendor_1", "vendor_2"}
    assert "vendor_3" not in negotiated_sellers
    assert ("vendor_0", "Can you improve delivery and warranty?") in seen_counter_messages
    assert ("vendor_1", "Can you improve delivery and warranty?") in seen_counter_messages
    assert ("vendor_2", "Can you improve delivery and warranty?") in seen_counter_messages

    done = events[-1]["data"]
    assert done["negotiation_outcome"]["status"] == "accepted"
    assert done["negotiation_outcome"]["selected_seller_id"] == "vendor_1"
    assert set(done["negotiation_outcome"]["rejected_sellers"]) == {"vendor_0", "vendor_2"}
