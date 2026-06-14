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
from backend.agents.negotiation_agent import negotiate_one_supplier
from backend.prompts import STRATEGY_OPTIONS
from backend.agents.human_escalation import check_escalation
from backend.agents.audit_summary import generate_summary
from backend.data_access import get_all_products_flat, get_seller_inventory
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
    all_products = get_all_products_flat(requirements=structured_requirements)
    clusters = cluster_products(structured_requirements, all_products)

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
        candidate = judge_candidate(structured_requirements, cluster)
        judged_candidates.append(candidate)
        # Emit cluster event with judging verdict embedded so the feed shows
        # both the cluster group and the Gemini verdict in one event.
        yield evt("cluster", "intel", {**cluster, "judged_candidate": candidate})

    # ── Stage: match ──────────────────────────────────────────────────────────
    matched_suppliers = match_suppliers(structured_requirements)
    for supplier in matched_suppliers:
        yield evt("match", "match", supplier)

    if len(matched_suppliers) < 2 and not demo_mode:
        tavily_raw = search_external_supplier(structured_requirements)
    else:
        tavily_raw = fallback_tavily_result(structured_requirements) if demo_mode else {}

    # ── Stage: strategy selection (human alert before negotiation) ────────────
    yield evt("human_alert", "negotiate", {
        "session_id": session_id,
        "trigger": "strategy_selection",
        "question": "Choose your negotiation strategy before the agent begins:",
        "strategy_options": STRATEGY_OPTIONS,
    })
    if wait_for_human is not None:
        strategy_resp = wait_for_human(session_id, {"trigger": "strategy_selection"})
        strategy = strategy_resp.get("strategy") or "medium"
    else:
        strategy = "medium"

    if strategy not in ("aggressive", "medium", "light"):
        strategy = "medium"

    structured_requirements["negotiation_strategy"] = strategy

    # Confirm strategy selection in the feed
    yield evt("negotiation_turn", "negotiate", {
        "seller_id": "",
        "seller_name": "",
        "speaker": "system",
        "message": f"Negotiation strategy selected: {strategy.upper()}",
        "round": 0,
        "event_kind": "strategy_selected",
        "pioneer_labels": [],
        "risk_level": "low",
        "extracted_fields": {},
    })

    # ── Stage: negotiate — waterfall across ranked suppliers ──────────────────
    # Gate on good/borderline clusters; negotiate rank-ordered, stop on first accept.
    good_cluster_ids = {
        jc["cluster_id"] for jc in judged_candidates
        if jc.get("verdict") in ("good", "borderline")
    }
    good_seller_ids: set = set()
    for cluster in clusters:
        if cluster.get("cluster_id") in good_cluster_ids:
            for p in cluster.get("products", []):
                good_seller_ids.add(p.get("seller_id", ""))

    negotiation_suppliers = [s for s in matched_suppliers if s["seller_id"] in good_seller_ids]
    if not negotiation_suppliers:
        negotiation_suppliers = matched_suppliers

    negotiation_suppliers_ranked = sorted(
        negotiation_suppliers, key=lambda s: s.get("match_score", 0), reverse=True
    )

    inventory_flat = get_seller_inventory(requirements=structured_requirements)
    conversation_logs: list = []
    raw_offers: list = []
    rejected_sellers: list = []

    for supplier in negotiation_suppliers_ranked:
        is_rejected = False

        for log, offer in negotiate_one_supplier(
            structured_requirements, supplier, inventory_flat, judged_candidates
        ):
            conversation_logs.append(log)
            yield evt("negotiation_turn", "negotiate", dict(log))
            if offer is not None:
                raw_offers.append(offer)
            if log.get("event_kind") == "seller_rejection":
                is_rejected = True

        if is_rejected:
            rejected_sellers.append(supplier["seller_id"])
            yield evt("negotiation_turn", "negotiate", {
                "seller_id": supplier["seller_id"],
                "seller_name": supplier["seller_name"],
                "speaker": "system",
                "message": (
                    f"Negotiation rejected by {supplier['seller_name']} "
                    f"under {strategy.upper()} strategy."
                ),
                "round": 0,
                "event_kind": "supplier_fallback",
                "pioneer_labels": [],
                "risk_level": "high",
                "extracted_fields": {},
            })
        # No break — negotiate all suppliers to completion

    # Pioneer labeling on seller turns (mutates logs in place for the done event)
    pioneer_labels: list = []
    for log in conversation_logs:
        if log["speaker"] == "seller":
            if demo_mode:
                label_result = fallback_pioneer_labels(log["message"])
            else:
                label_result = classify_message(log["message"])
            log["pioneer_labels"] = label_result.get("labels", [])
            log["risk_level"] = label_result.get("risk_level", log.get("risk_level", "unknown"))
            log["extracted_fields"] = label_result.get("extracted_fields", {})
            pioneer_labels.append(label_result)

    # ── Stage: validate ───────────────────────────────────────────────────────
    validation_results = [validate_offer(structured_requirements, offer) for offer in raw_offers]

    for offer, vr in zip(raw_offers, validation_results):
        if vr["status"] == "passed":
            vr["score"] = compute_value_score(structured_requirements, offer)
        vr["seller_name"] = offer.get("seller_name", offer.get("seller_id", ""))
        vr["product"] = offer.get("product", "")
        vr["length_mm"] = offer.get("length_mm", 0)
        vr["power_watts"] = offer.get("power_watts", 0)
        vr["price_eur"] = offer.get("price_eur", 0)
        vr["delivery_days"] = offer.get("delivery_days", 0)
        vr["warranty_years"] = offer.get("warranty_years", 0)
        vr["extra_fields"] = {
            c["field"]: offer.get(c["field"])
            for c in structured_requirements.get("extra_constraints", [])
            if c.get("field")
        }
        yield evt("validation", "validate", dict(vr))

    # ── Build deal comparison table ───────────────────────────────────────────
    comparison_table: list = []
    for supplier in negotiation_suppliers_ranked:
        sid = supplier["seller_id"]
        offer = next((o for o in raw_offers if o["seller_id"] == sid), None)
        vres = next((v for v in validation_results if v["seller_id"] == sid), None)
        is_rejected_row = sid in rejected_sellers or offer is None
        comparison_table.append({
            "seller_id": sid,
            "seller_name": supplier["seller_name"],
            "product": offer.get("product", "") if offer else "",
            "price_eur": offer.get("price_eur", 0) if offer else 0,
            "delivery_days": offer.get("delivery_days", 0) if offer else 0,
            "warranty_years": offer.get("warranty_years", 0) if offer else 0,
            "validation_status": vres["status"] if vres else "no_offer",
            "score": vres.get("score", 0) if vres else 0,
            "is_rejected": is_rejected_row,
        })

    # ── Stage: escalate (compute for DemoResult shape + audit) ───────────────
    passed = [v for v in validation_results if v["status"] == "passed"]
    best = max(passed, key=lambda v: v.get("score", 0)) if passed else None
    best_offer = next((o for o in raw_offers if best and o["seller_id"] == best["seller_id"]), None)

    escalation_result = check_escalation(validation_results, structured_requirements, best_offer)

    # ── Stage: deal comparison (human_alert) — replaces approval pause ────────
    yield evt("human_alert", "negotiate", {
        "session_id": session_id,
        "trigger": "deal_comparison",
        "question": "Review all negotiated quotes and select your preferred deal.",
        "comparison_table": comparison_table,
    })

    if wait_for_human is not None:
        resp = wait_for_human(session_id, {"trigger": "deal_comparison"})
    else:
        resp = {"action": "auto_continue"}

    action = resp.get("action", "auto_continue")
    selected_seller_id = resp.get("selected_seller_id") or ""

    if action == "approve" and selected_seller_id:
        winning_offer = next((o for o in raw_offers if o["seller_id"] == selected_seller_id), None)
        user_choice = "approved"
    elif action == "reject_all":
        winning_offer = None
        selected_seller_id = ""
        user_choice = "rejected_all"
    else:
        # auto_continue: non-streaming path or timeout — auto-select best passing offer
        winning_offer = best_offer
        selected_seller_id = best_offer.get("seller_id", "") if best_offer else ""
        user_choice = "auto_selected"

    # Synthesize escalation human_response so DemoResult shape stays intact
    escalation_result["human_response"] = {
        "action": action,
        "selected_seller_id": selected_seller_id,
    }
    escalation_result["human_decision"] = user_choice

    if escalation_result.get("escalate"):
        yield evt("escalation", "escalate", escalation_result)

    # ── Negotiation outcome (built after user selection) ──────────────────────
    negotiation_outcome = {
        "status": "accepted" if winning_offer else "failed",
        "strategy": strategy,
        "winning_seller_id": winning_offer.get("seller_id", "") if winning_offer else "",
        "rejected_sellers": rejected_sellers,
        "all_offers": raw_offers,
        "selected_seller_id": selected_seller_id,
        "user_choice": user_choice,
    }

    # ── Recommendation ────────────────────────────────────────────────────────
    if winning_offer:
        judge_reason = next(
            (jc.get("reason", "") for jc in judged_candidates if jc.get("seller_id") == winning_offer.get("seller_id")),
            "",
        )
        base_reason = "Best balance of compatibility, price, delivery, and warranty."
        final_reason = f"{base_reason} {judge_reason}".strip() if judge_reason else base_reason
        final_recommendation = {
            "recommended_seller": winning_offer["seller_name"],
            "recommended_product": winning_offer["product"],
            "price_eur": winning_offer["price_eur"],
            "delivery_days": winning_offer["delivery_days"],
            "warranty_years": winning_offer.get("warranty_years", 0),
            "technical_status": "passed",
            "risk_level": "low",
            "reason": final_reason,
            "human_approval_required": escalation_result.get("escalate", True),
            "human_response": escalation_result.get("human_response"),
            "human_decision": escalation_result.get("human_decision"),
        }
    else:
        product_type = structured_requirements.get("product_type", "requested product")
        if user_choice == "rejected_all":
            no_deal_reason = "Buyer rejected all negotiated offers. No deal was accepted."
        elif rejected_sellers:
            no_deal_reason = (
                f"All {len(rejected_sellers)} supplier(s) rejected the negotiation under the "
                f"{strategy.upper()} strategy — the requested discount exceeded the 10% seller floor. "
                f"Try MEDIUM or LIGHT strategy, or raise the budget."
            )
        else:
            no_deal_reason = (
                f"No internal supplier offer matched the requested product category "
                f"({product_type}). Use external supplier discovery or add matching inventory."
            )
        final_recommendation = {
            "recommended_seller": "",
            "recommended_product": "",
            "price_eur": 0,
            "delivery_days": 0,
            "warranty_years": 0,
            "technical_status": "rejected",
            "risk_level": "high",
            "reason": no_deal_reason,
            "human_approval_required": True,
            "human_response": escalation_result.get("human_response"),
            "human_decision": escalation_result.get("human_decision"),
        }

    yield evt("recommendation", "recommend", final_recommendation)

    # ── Audit ─────────────────────────────────────────────────────────────────
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
        "negotiation_strategy": strategy,
        "negotiation_outcome": negotiation_outcome,
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
