import os
from dotenv import load_dotenv

from backend.schemas import BuyerRequest, DemoResult
from backend.agents.procurement_intelligence import extract_requirements, validate_offer, compute_value_score
from backend.agents.supplier_matching import match_suppliers
from backend.agents.buyer_agent import run_negotiation
from backend.agents.human_escalation import check_escalation
from backend.agents.audit_summary import generate_summary
from integrations.pioneer_client import classify_message
from integrations.tavily_client import search_external_supplier
from integrations.fal_client import generate_deal_card
from integrations.fallback_outputs import (
    fallback_pioneer_labels,
    fallback_tavily_result,
    fallback_deal_card_path,
)

load_dotenv()
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"


def run_demo(request: dict) -> dict:
    demo_mode = DEMO_MODE

    structured_requirements = extract_requirements(request)

    matched_suppliers = match_suppliers(structured_requirements)

    if len(matched_suppliers) < 2 and not demo_mode:
        tavily_enrichment = search_external_supplier(structured_requirements)
    else:
        tavily_enrichment = fallback_tavily_result() if demo_mode else {}

    conversation_logs, raw_offers = run_negotiation(structured_requirements, matched_suppliers)

    pioneer_labels = []
    for log in conversation_logs:
        if log["speaker"] == "seller":
            if demo_mode:
                label_result = fallback_pioneer_labels(log["message"])
            else:
                label_result = classify_message(log["message"])
            log["pioneer_labels"] = label_result.get("labels", [])
            log["risk_level"] = label_result.get("risk_level", "unknown")
            pioneer_labels.append(label_result)

    validation_results = [validate_offer(structured_requirements, offer) for offer in raw_offers]

    for offer, result in zip(raw_offers, validation_results):
        if result["status"] == "passed":
            result["score"] = compute_value_score(structured_requirements, offer)

    passed = [v for v in validation_results if v["status"] == "passed"]
    best = max(passed, key=lambda v: v["score"]) if passed else None
    best_offer = next((o for o in raw_offers if best and o["seller_id"] == best["seller_id"]), None)

    escalation_result = check_escalation(validation_results, structured_requirements, best_offer)

    audit_summary = generate_summary(
        structured_requirements, matched_suppliers, conversation_logs, validation_results, escalation_result, raw_offers
    )

    if best_offer:
        final_recommendation = {
            "recommended_seller": best_offer["seller_name"],
            "recommended_product": best_offer["product"],
            "price_eur": best_offer["price_eur"],
            "delivery_days": best_offer["delivery_days"],
            "technical_status": "passed",
            "risk_level": "low",
            "reason": "Best balance of compatibility, price, delivery, and warranty.",
            "human_approval_required": escalation_result.get("escalate", True),
        }
    else:
        final_recommendation = {
            "recommended_seller": "",
            "recommended_product": "",
            "price_eur": 0,
            "delivery_days": 0,
            "technical_status": "rejected",
            "risk_level": "high",
            "reason": "No offer passed all technical constraints.",
            "human_approval_required": True,
        }

    if demo_mode:
        deal_card_path = fallback_deal_card_path()
    else:
        deal_card_path = generate_deal_card(final_recommendation)

    return {
        "request": request,
        "structured_requirements": structured_requirements,
        "matched_suppliers": matched_suppliers,
        "conversation_logs": conversation_logs,
        "pioneer_labels": pioneer_labels,
        "validation_results": validation_results,
        "tavily_enrichment": tavily_enrichment,
        "escalation_result": escalation_result,
        "audit_summary": audit_summary,
        "final_recommendation": final_recommendation,
        "deal_card_path": deal_card_path,
        "demo_mode": demo_mode,
    }


if __name__ == "__main__":
    sample_request = {
        "request_id": "REQ-001",
        "raw_request": "We need a GPU for an AI workstation under €650 that fits a compact case and arrives this week.",
        "region": "Germany",
        "priority": "technical_fit",
    }
    result = run_demo(sample_request)
    print(result["audit_summary"])
