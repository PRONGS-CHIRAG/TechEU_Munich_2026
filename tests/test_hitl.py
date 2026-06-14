from threading import Thread
from time import sleep

from backend.hitl_sessions import (
    close_session,
    create_session,
    submit_response,
    wait_for_response,
)
from backend.orchestrator import _normalize_request, run_demo_events


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
    monkeypatch.setattr("backend.orchestrator.get_all_products_flat", lambda: [product])
    monkeypatch.setattr("backend.orchestrator.cluster_products", lambda _req, _products: [cluster])
    monkeypatch.setattr("backend.orchestrator.judge_candidate", lambda _req, _cluster: candidate)
    monkeypatch.setattr("backend.orchestrator.match_suppliers", lambda _req: [supplier])
    monkeypatch.setattr(
        "backend.orchestrator.run_negotiation_stream",
        lambda _req, _suppliers, _judged: iter(
            [
                (
                    {
                        "seller_id": "vendor_f",
                        "seller_name": "Chair Vendor",
                        "speaker": "seller",
                        "message": "We can offer the Ergo Chair.",
                        "round": 1,
                        "pioneer_labels": [],
                        "risk_level": "low",
                        "extracted_fields": {},
                    },
                    product,
                )
            ]
        ),
    )
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

    def wait_for_human(session_id, alert):
        waited.append((session_id, alert["trigger"]))
        return {"action": "approve", "note": "Approved from test"}

    events = list(
        run_demo_events(
            {"request_id": "REQ-TEST", "raw_request": "Need chairs", "region": "Germany", "priority": "technical_fit"},
            session_id="session-123",
            wait_for_human=wait_for_human,
        )
    )

    types = [event["type"] for event in events]
    assert waited == [("session-123", "approval_required")]
    assert types.index("human_alert") < types.index("escalation")
    done = events[-1]["data"]
    assert done["escalation_result"]["human_response"]["action"] == "approve"
    assert done["final_recommendation"]["human_response"]["note"] == "Approved from test"
