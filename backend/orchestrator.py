import json
import os
import time
import uuid
from dotenv import load_dotenv
from typing import Callable

from backend.schemas import BuyerRequest, DemoResult
from backend.agents.procurement_intelligence import extract_requirements, validate_offer, compute_value_score
from backend.agents.supplier_matching import match_suppliers
from backend.agents.product_clustering import cluster_products
from backend.agents.judging_agent import judge_candidate
from backend.agents.negotiation_agent import run_negotiation_stream
from backend.agents.human_escalation import check_escalation
from backend.agents.audit_summary import generate_summary
from backend.data_access import get_all_products_flat
from integrations.pioneer_client import classify_message
from integrations.tavily_client import search_external_supplier
from integrations.fal_client import generate_deal_card
from integrations.fallback_outputs import (
    fallback_pioneer_labels,
    fallback_tavily_result,
    fallback_deal_card_path,
)

load_dotenv()
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"


def _adapt_tavily(raw: dict) -> dict:
    results = raw.get("results", [])
    return {
        "triggered": bool(results),
        "reason": raw.get("query", ""),
        "results": [
            {
                "title": r.get("title", ""),
                "snippet": r.get("content", ""),
                "source": r.get("url", ""),
            }
            for r in results
        ],
    }


HumanWaiter = Callable[[str, dict], dict]


def _normalize_request(request: dict) -> dict:
    normalized = dict(request)
    raw_request = str(normalized.get("raw_request", "")).strip()
    if not raw_request:
        raise ValueError("raw_request is required for a custom procurement run")

    normalized["raw_request"] = raw_request
    normalized["region"] = normalized.get("region") or "Germany"
    normalized["priority"] = normalized.get("priority") or "technical_fit"
    normalized["request_id"] = normalized.get("request_id") or f"CUSTOM-{uuid.uuid4().hex[:8].upper()}"
    return normalized


def run_demo_events(
    request: dict,
    session_id: str | None = None,
    wait_for_human: HumanWaiter | None = None,
):
    """Sync generator yielding SSE event dicts for the streaming endpoint.

    Each yielded dict matches the frozen contract:
    { "type": str, "stage": str, "data": dict, "session_id": str, "ts": int }
    """
    request = _normalize_request(request)
    session_id = session_id or str(uuid.uuid4())
    demo_mode = DEMO_MODE

    def evt(event_type: str, stage: str, data: dict) -> dict:
        return {
            "type": event_type,
            "stage": stage,
            "data": data,
            "session_id": session_id,
            "ts": int(time.time() * 1000),
        }

    # ── Stage: intel — requirements extraction ────────────────────────────────
    yield evt("requirements", "intel", {"status": "extracting", "message": "Gemini extracting structured requirements..."})

    structured_requirements = extract_requirements(request)
    yield evt("requirements", "intel", structured_requirements)

    # ── Stage: intel — clustering + judging ───────────────────────────────────
    yield evt("agent_status", "intel", {"agent": "clustering", "message": "Product Clustering Agent grouping inventory by spec similarity…"})
    all_products = get_all_products_flat()
    clusters = cluster_products(structured_requirements, all_products)
    yield evt("agent_status", "intel", {"agent": "clustering", "message": f"Found {len(clusters)} product cluster(s) across internal inventory"})

    judged_candidates: list = []
    if not clusters:
        yield evt(
            "cluster",
            "intel",
            {
                "cluster_id": "no_internal_match",
                "products": [],
                "similarity_score": 0,
                "representative_specs": {},
                "message": (
                    "No internal inventory products match the requested product category. "
                    "External supplier enrichment will be used instead."
                ),
            },
        )
    for cluster in clusters:
        # Emit a "working" event BEFORE the Gemini call so the feed shows the
        # judging agent actively evaluating — not just a result appearing from nowhere.
        rep = cluster.get("products", [{}])[0]
        yield evt(
            "judging_start",
            "intel",
            {
                "cluster_id": cluster.get("cluster_id", ""),
                "product": rep.get("product", ""),
                "seller_name": rep.get("seller_name", ""),
                "price_eur": rep.get("price_eur", 0),
                "budget_eur": structured_requirements.get("budget_eur", 0),
                "delivery_days": rep.get("delivery_days", 0),
                "max_delivery_days": structured_requirements.get("max_delivery_days", 0),
            },
        )
        candidate = judge_candidate(structured_requirements, cluster)
        judged_candidates.append(candidate)
        # Emit cluster event with judging verdict embedded so the feed shows
        # both the cluster group and the Gemini verdict in one event.
        yield evt("cluster", "intel", {**cluster, "judged_candidate": candidate})

    # ── Stage: match ──────────────────────────────────────────────────────────
    yield evt("agent_status", "match", {"agent": "supplier_matching", "message": "Supplier Matching Agent scoring seller registry against requirements…"})
    matched_suppliers = match_suppliers(structured_requirements)
    for supplier in matched_suppliers:
        yield evt("match", "match", supplier)

    if len(matched_suppliers) < 2 and not demo_mode:
        yield evt("agent_status", "match", {"agent": "tavily", "message": f"Only {len(matched_suppliers)} internal supplier(s) found — Tavily searching for external suppliers…"})
        tavily_raw = search_external_supplier(structured_requirements)
    else:
        tavily_raw = fallback_tavily_result(structured_requirements) if demo_mode else {}

    # ── Stage: negotiate — all matched suppliers ──────────────────────────────
    # Negotiate with every matched supplier so the demo shows multi-vendor
    # competition. Judging verdicts still influence the final recommendation.
    conversation_logs: list = []
    raw_offers: list = []

    active_seller_id: str | None = None
    for log, offer in run_negotiation_stream(structured_requirements, matched_suppliers, judged_candidates):
        # Emit a start marker the first time we see each new seller so the feed
        # clearly shows which vendor the negotiation agent is contacting.
        if log.get("seller_id") != active_seller_id:
            active_seller_id = log["seller_id"]
            jc = next((c for c in judged_candidates if c.get("seller_id") == active_seller_id), None)
            yield evt(
                "negotiation_start",
                "negotiate",
                {
                    "seller_id": active_seller_id,
                    "seller_name": log.get("seller_name", active_seller_id),
                    "verdict": jc.get("verdict", "") if jc else "",
                    "score": jc.get("score", 0) if jc else 0,
                },
            )
        conversation_logs.append(log)
        yield evt("negotiation_turn", "negotiate", dict(log))
        if offer is not None:
            raw_offers.append(offer)

    # Pioneer labeling on seller turns (mutates logs in place for the done event)
    seller_turn_count = sum(1 for log in conversation_logs if log["speaker"] == "seller")
    yield evt("agent_status", "negotiate", {"agent": "pioneer", "message": f"Pioneer Inference Agent classifying {seller_turn_count} seller message(s) for risk + intent labels…"})
    pioneer_labels: list = []
    for log in conversation_logs:
        if log["speaker"] == "seller":
            if demo_mode:
                label_result = fallback_pioneer_labels(log["message"])
            else:
                label_result = classify_message(log["message"])
            log["pioneer_labels"] = label_result.get("labels", [])
            log["risk_level"] = label_result.get("risk_level", log.get("risk_level", "unknown"))
            pioneer_labels.append(label_result)

    # ── Stage: validate ───────────────────────────────────────────────────────
    yield evt("agent_status", "validate", {"agent": "validation", "message": f"Validator running deterministic constraint checks on {len(raw_offers)} offer(s)…"})
    validation_results = [validate_offer(structured_requirements, offer) for offer in raw_offers]

    for offer, result in zip(raw_offers, validation_results):
        if result["status"] == "passed":
            result["score"] = compute_value_score(structured_requirements, offer)
        result["seller_name"] = offer.get("seller_name", offer.get("seller_id", ""))
        result["product"] = offer.get("product", "")
        result["length_mm"] = offer.get("length_mm", 0)
        result["power_watts"] = offer.get("power_watts", 0)
        result["price_eur"] = offer.get("price_eur", 0)
        result["delivery_days"] = offer.get("delivery_days", 0)
        result["warranty_years"] = offer.get("warranty_years", 0)
        # Capture actual values for any extra_constraints fields so the frontend
        # can render per-constraint spec cells for non-GPU product types.
        result["extra_fields"] = {
            c["field"]: offer.get(c["field"])
            for c in structured_requirements.get("extra_constraints", [])
            if c.get("field")
        }
        yield evt("validation", "validate", dict(result))

    # ── Stage: escalate ───────────────────────────────────────────────────────
    passed = [v for v in validation_results if v["status"] == "passed"]
    best = max(passed, key=lambda v: v.get("score", 0)) if passed else None
    best_offer = next((o for o in raw_offers if best and o["seller_id"] == best["seller_id"]), None)

    escalation_result = check_escalation(validation_results, structured_requirements, best_offer)

    if escalation_result.get("escalate"):
        alert_payload = {
            "session_id": session_id,
            "question": escalation_result.get("question_for_human", ""),
            "trigger": escalation_result.get("trigger", ""),
            "best_offer": (
                {
                    "seller_name": best_offer.get("seller_name", ""),
                    "product": best_offer.get("product", ""),
                    "price_eur": best_offer.get("price_eur", 0),
                    "delivery_days": best_offer.get("delivery_days", 0),
                }
                if best_offer
                else None
            ),
            "budget_eur": structured_requirements.get("budget_eur", 0),
        }
        yield evt("human_alert", "escalate", alert_payload)
        if wait_for_human is not None:
            human_response = wait_for_human(session_id, escalation_result)
        else:
            human_response = {
                "action": "auto_continue",
                "note": "Non-streaming run auto-continued after escalation alert.",
            }
        escalation_result["human_response"] = human_response
        escalation_result["human_decision"] = human_response.get("action")
        yield evt("escalation", "escalate", escalation_result)

    # ── Recommendation ────────────────────────────────────────────────────────
    if best_offer:
        # Incorporate the judging agent's reason for the best product if available
        judge_reason = next(
            (jc.get("reason", "") for jc in judged_candidates if jc.get("seller_id") == best_offer.get("seller_id")),
            "",
        )
        base_reason = "Best balance of compatibility, price, delivery, and warranty."
        final_reason = f"{base_reason} {judge_reason}".strip() if judge_reason else base_reason
        final_recommendation = {
            "recommended_seller": best_offer["seller_name"],
            "recommended_product": best_offer["product"],
            "price_eur": best_offer["price_eur"],
            "delivery_days": best_offer["delivery_days"],
            "warranty_years": best_offer.get("warranty_years", 0),
            "technical_status": "passed",
            "risk_level": "low",
            "reason": final_reason,
            "human_approval_required": escalation_result.get("escalate", True),
            "human_response": escalation_result.get("human_response"),
            "human_decision": escalation_result.get("human_decision"),
        }
    else:
        product_type = structured_requirements.get("product_type", "requested product")
        final_recommendation = {
            "recommended_seller": "",
            "recommended_product": "",
            "price_eur": 0,
            "delivery_days": 0,
            "warranty_years": 0,
            "technical_status": "rejected",
            "risk_level": "high",
            "reason": (
                f"No internal supplier offer matched the requested product category "
                f"({product_type}). Use external supplier discovery or add matching inventory."
            ),
            "human_approval_required": True,
            "human_response": escalation_result.get("human_response"),
            "human_decision": escalation_result.get("human_decision"),
        }

    yield evt("recommendation", "recommend", final_recommendation)

    # ── Audit ─────────────────────────────────────────────────────────────────
    yield evt("agent_status", "audit", {"agent": "audit", "message": "Audit Agent calling Gemini to write procurement narrative…"})
    audit_summary = generate_summary(
        structured_requirements, matched_suppliers, conversation_logs,
        validation_results, escalation_result, raw_offers,
    )
    yield evt("audit", "audit", {"text": audit_summary})

    # ── Done ──────────────────────────────────────────────────────────────────
    if demo_mode:
        deal_card_path = fallback_deal_card_path()
    else:
        deal_card_path = generate_deal_card(final_recommendation)

    tavily_enrichment = _adapt_tavily(tavily_raw)

    demo_result = {
        "request": request,
        "structured_requirements": structured_requirements,
        "clusters": clusters,
        "judged_candidates": judged_candidates,
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
        "session_id": session_id,
    }
    yield evt("done", "done", demo_result)


def run_demo(request: dict) -> dict:
    """Non-streaming path. Drains run_demo_events() and returns the done payload.

    tavily_enrichment is already adapted to the frontend shape (triggered/reason/results)
    inside run_demo_events — no additional adaptation needed by callers.
    """
    for event in run_demo_events(request):
        if event["type"] == "done":
            return event["data"]
    return {}


if __name__ == "__main__":
    sample_request = {
        "request_id": "REQ-001",
        "raw_request": "We need a GPU for an AI workstation under €650 that fits a compact case and arrives this week.",
        "region": "Germany",
        "priority": "technical_fit",
    }
    result = run_demo(sample_request)
    print(result.get("audit_summary", "No audit summary"))
