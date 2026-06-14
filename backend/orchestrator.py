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
from backend.agents.negotiation_agent import negotiate_one_supplier, _get_seller_best_product
from backend.prompts import STRATEGY_OPTIONS
from backend.agents.human_escalation import check_escalation
from backend.agents.audit_summary import generate_summary
from backend.data_access import get_all_products_flat, get_seller_inventory, get_products_for_requirements
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
    all_products = get_products_for_requirements(structured_requirements, limit=200)
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
        yield evt("tavily", "match", {"status": "searching", "message": "Tavily enriching supplier data…"})
        tavily_raw = search_external_supplier(structured_requirements)
        yield evt("tavily", "match", {"status": "done", "triggered": True, "results_count": len(tavily_raw.get("results", []))})
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

    inventory_flat = get_seller_inventory()
    conversation_logs: list = []
    raw_offers: list = []
    rejected_sellers: list = []
    winning_offer = None

    for idx, supplier in enumerate(negotiation_suppliers_ranked):
        is_rejected = False

        for log, offer in negotiate_one_supplier(
            structured_requirements, supplier, inventory_flat, judged_candidates
        ):
            conversation_logs.append(log)
            yield evt("negotiation_turn", "negotiate", dict(log))
            if offer is not None:
                raw_offers.append(offer)
                winning_offer = offer
            if log.get("event_kind") == "seller_rejection":
                is_rejected = True

        if is_rejected:
            rejected_sellers.append(supplier["seller_id"])
            next_idx = idx + 1
            if next_idx < len(negotiation_suppliers_ranked):
                next_sup = negotiation_suppliers_ranked[next_idx]
                yield evt("negotiation_turn", "negotiate", {
                    "seller_id": supplier["seller_id"],
                    "seller_name": supplier["seller_name"],
                    "speaker": "system",
                    "message": (
                        f"Negotiation rejected by {supplier['seller_name']}. "
                        f"Routing to next supplier: {next_sup['seller_name']}."
                    ),
                    "round": 0,
                    "event_kind": "supplier_fallback",
                    "next_seller_id": next_sup["seller_id"],
                    "next_seller_name": next_sup["seller_name"],
                    "pioneer_labels": [],
                    "risk_level": "high",
                    "extracted_fields": {},
                })
        else:
            break  # deal accepted — stop waterfall

    negotiation_outcome = {
        "status": "accepted" if winning_offer else "failed",
        "strategy": strategy,
        "winning_seller_id": winning_offer.get("seller_id", "") if winning_offer else "",
        "rejected_sellers": rejected_sellers,
    }

    # Pioneer labeling on seller turns (mutates logs in place for the done event)
    yield evt("pioneer", "validate", {"status": "labeling", "message": "Pioneer classifying seller messages…"})
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
    yield evt("pioneer", "validate", {"status": "done", "labeled_count": len(pioneer_labels)})

    # ── Stage: validate ───────────────────────────────────────────────────────
    # Build a per-supplier offer map: prefer negotiated offer, fall back to best listed product
    negotiated_by_seller = {o["seller_id"]: o for o in raw_offers}
    all_offers_for_validation: list = []
    for supplier in matched_suppliers:
        sid = supplier["seller_id"]
        if sid in negotiated_by_seller:
            all_offers_for_validation.append(negotiated_by_seller[sid])
        else:
            best = _get_seller_best_product(sid, structured_requirements, inventory_flat)
            if best:
                all_offers_for_validation.append({
                    **best,
                    "seller_id": sid,
                    "seller_name": supplier.get("seller_name", sid),
                })

    validation_results = [validate_offer(structured_requirements, offer) for offer in all_offers_for_validation]

    for offer, result in zip(all_offers_for_validation, validation_results):
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
        def _make_alert_payload(renegotiate_used: bool) -> dict:
            return {
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
                "has_winning_offer": best_offer is not None,
                "renegotiate_used": renegotiate_used,
            }

        yield evt("human_alert", "escalate", _make_alert_payload(False))
        if wait_for_human is not None:
            human_response = wait_for_human(session_id, escalation_result)
        else:
            human_response = {
                "action": "auto_continue",
                "note": "Non-streaming run auto-continued after escalation alert.",
            }

        if human_response.get("action") == "renegotiate" and best_offer is not None:
            # ── Re-negotiation with winning supplier ──────────────────────────
            note = human_response.get("note", "")
            structured_requirements["buyer_note"] = note

            winning_sid = best_offer.get("seller_id", "")
            winning_supplier = next(
                (s for s in matched_suppliers if s["seller_id"] == winning_sid),
                matched_suppliers[0] if matched_suppliers else None,
            )

            if winning_supplier:
                yield evt("negotiation_turn", "negotiate", {
                    "seller_id": winning_supplier["seller_id"],
                    "seller_name": winning_supplier["seller_name"],
                    "speaker": "system",
                    "message": (
                        f"Re-opening negotiation with {winning_supplier['seller_name']} — "
                        f"buyer adjustment received."
                    ),
                    "round": 0,
                    "event_kind": "renegotiation_start",
                    "pioneer_labels": [],
                    "risk_level": "low",
                    "extracted_fields": {},
                })

                for log, offer in negotiate_one_supplier(
                    structured_requirements, winning_supplier, inventory_flat, judged_candidates
                ):
                    conversation_logs.append(log)
                    yield evt("negotiation_turn", "negotiate", dict(log))
                    if offer is not None:
                        raw_offers = [o for o in raw_offers if o["seller_id"] != winning_sid]
                        raw_offers.append(offer)
                        winning_offer = offer
                        best_offer = offer

            # ── Re-validate after re-negotiation ─────────────────────────────
            negotiated_by_seller = {o["seller_id"]: o for o in raw_offers}
            all_offers_for_revalidation: list = []
            for supplier in matched_suppliers:
                sid = supplier["seller_id"]
                if sid in negotiated_by_seller:
                    all_offers_for_revalidation.append(negotiated_by_seller[sid])
                else:
                    best_p = _get_seller_best_product(sid, structured_requirements, inventory_flat)
                    if best_p:
                        all_offers_for_revalidation.append({
                            **best_p,
                            "seller_id": sid,
                            "seller_name": supplier.get("seller_name", sid),
                        })

            validation_results = [validate_offer(structured_requirements, offer) for offer in all_offers_for_revalidation]
            for offer, result in zip(all_offers_for_revalidation, validation_results):
                if result["status"] == "passed":
                    result["score"] = compute_value_score(structured_requirements, offer)
                result["seller_name"] = offer.get("seller_name", offer.get("seller_id", ""))
                result["product"] = offer.get("product", "")
                result["length_mm"] = offer.get("length_mm", 0)
                result["power_watts"] = offer.get("power_watts", 0)
                result["price_eur"] = offer.get("price_eur", 0)
                result["delivery_days"] = offer.get("delivery_days", 0)
                result["warranty_years"] = offer.get("warranty_years", 0)
                result["extra_fields"] = {
                    c["field"]: offer.get(c["field"])
                    for c in structured_requirements.get("extra_constraints", [])
                    if c.get("field")
                }
                yield evt("validation", "validate", dict(result))

            # Recompute best after re-validation
            passed = [v for v in validation_results if v["status"] == "passed"]
            best = max(passed, key=lambda v: v.get("score", 0)) if passed else None
            best_offer = next(
                (o for o in raw_offers if best and o["seller_id"] == best["seller_id"]),
                best_offer,
            )

            # Second escalation check — renegotiate option disabled
            escalation_result = check_escalation(validation_results, structured_requirements, best_offer)
            if escalation_result.get("escalate"):
                yield evt("human_alert", "escalate", _make_alert_payload(True))
                if wait_for_human is not None:
                    human_response = wait_for_human(session_id, escalation_result)
                else:
                    human_response = {
                        "action": "auto_continue",
                        "note": "Non-streaming run auto-continued after second escalation alert.",
                    }
            else:
                human_response = {"action": "auto_approved", "note": "No escalation needed after re-negotiation."}

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
        if rejected_sellers:
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
    yield evt("fal", "done", {"status": "generating", "message": "fal generating deal card…"})
    if demo_mode:
        deal_card_path = fallback_deal_card_path()
    else:
        deal_card_path = generate_deal_card(final_recommendation)
    yield evt("fal", "done", {"status": "done", "path": deal_card_path})

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
