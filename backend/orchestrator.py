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
from backend.agents.negotiation_agent import negotiate_supplier_round
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


def _normalize_deal_card_asset(asset: dict | str) -> dict:
    """Accept the new fal asset dict and the legacy path string used by tests."""
    if isinstance(asset, dict):
        return {
            "path": asset.get("path", ""),
            "url": asset.get("url", ""),
            "prompt": asset.get("prompt", ""),
            "generated": bool(asset.get("generated", False)),
        }

    path = str(asset)
    if "/assets/" in path:
        url = path[path.index("/assets/"):]
    elif path.startswith("assets/"):
        url = f"/{path}"
    else:
        url = "/assets/fal_deal_card.png"
    return {
        "path": path,
        "url": url,
        "prompt": "",
        "generated": False,
    }


def _external_candidates_from_tavily(raw: dict, requirements: dict) -> tuple[list[dict], list[dict], list[dict]]:
    """Convert Tavily search results into external seller/product/cluster rows.

    These rows are explicitly marked as estimates so the normal negotiation path
    can continue when internal inventory has no compatible seller agents.
    """
    results = raw.get("results", []) if isinstance(raw, dict) else []
    if not results:
        return [], [], []

    product_type = requirements.get("product_type", "requested product")
    budget = float(requirements.get("budget_eur", 650) or 650)
    delivery_days = int(requirements.get("max_delivery_days", 7) or 7)
    warranty_years = float(requirements.get("minimum_warranty_years", 1) or 1)

    suppliers: list[dict] = []
    products: list[dict] = []
    for idx, result in enumerate(results[:3], start=1):
        title = result.get("title", "") or f"External {product_type} supplier"
        seller_id = f"external_{idx}"
        seller_name = title.split("—")[0].split("-")[0].strip()[:48] or f"External Supplier {idx}"
        product = {
            "seller_id": seller_id,
            "seller_name": seller_name,
            "product": f"{product_type} from {seller_name}",
            "price_eur": round(budget * (0.92 + idx * 0.02), 2),
            "delivery_days": delivery_days,
            "warranty_years": warranty_years,
            "availability": "external_discovery",
            "external": True,
            "source_url": result.get("url", ""),
            "source_snippet": result.get("content", ""),
            "spec_confidence": "estimated_from_external_search",
        }
        if requirements.get("max_length_mm") is not None:
            product["length_mm"] = requirements["max_length_mm"]
        if requirements.get("max_power_watts") is not None:
            product["power_watts"] = requirements["max_power_watts"]
        for constraint in requirements.get("extra_constraints", []):
            field = constraint.get("field")
            if field and constraint.get("limit") is not None:
                product[field] = constraint["limit"]

        suppliers.append({
            "seller_id": seller_id,
            "seller_name": seller_name,
            "match_score": round(0.72 - idx * 0.04, 2),
            "reason": "External supplier discovered via Tavily; specs are estimated and should be verified.",
            "specialization": product_type,
            "region": requirements.get("region", "Europe"),
            "reliability_score": 0.65,
            "negotiation_style": "formal" if idx == 1 else "cooperative",
            "external": True,
            "source_url": result.get("url", ""),
        })
        products.append(product)

    clusters = [
        {
            "cluster_id": "external_cluster_1",
            "products": products,
            "similarity_score": 0.65,
            "representative_specs": {
                "avg_price_eur": round(sum(p["price_eur"] for p in products) / len(products), 2),
                "avg_delivery_days": delivery_days,
            },
            "external": True,
            "message": "External candidates from Tavily because no internal seller matched the requested product family.",
        }
    ]
    return suppliers, products, clusters


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

    external_products: list[dict] = []
    if (not matched_suppliers or not clusters) and not demo_mode:
        tavily_raw = search_external_supplier(structured_requirements)
        external_suppliers, external_products, external_clusters = _external_candidates_from_tavily(
            tavily_raw,
            structured_requirements,
        )
        if external_suppliers:
            clusters.extend(external_clusters)
            judged_candidates.append({
                "cluster_id": "external_cluster_1",
                "seller_id": external_suppliers[0]["seller_id"],
                "product": external_products[0]["product"] if external_products else structured_requirements.get("product_type", ""),
                "verdict": "borderline",
                "reason": "External supplier discovered because internal inventory had no reliable product-family match; verify specs before purchase.",
                "score": 70,
            })
            matched_suppliers = external_suppliers
            for cluster in external_clusters:
                yield evt("cluster", "intel", {**cluster, "judged_candidate": judged_candidates[-1]})
            for supplier in matched_suppliers:
                yield evt("match", "match", supplier)
    elif len(matched_suppliers) < 2 and not demo_mode:
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

    # ── Stage: negotiate — parallel rounds across up to 3 aligned suppliers ───
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
    )[:3]

    inventory_flat = get_seller_inventory(requirements=structured_requirements) + external_products
    conversation_logs: list = []
    offers_by_seller: dict[str, dict] = {}
    validation_by_seller: dict[str, dict] = {}
    rejected_sellers: list = []
    winning_offer: dict | None = None
    selected_seller_id = ""
    final_action = "auto_continue"
    user_choice = "pending"

    supplier_state = {
        supplier["seller_id"]: {
            "round": 1,
            "previous_seller_message": "",
            "active": True,
        }
        for supplier in negotiation_suppliers_ranked
    }

    def latest_offers() -> list:
        return [
            offers_by_seller[supplier["seller_id"]]
            for supplier in negotiation_suppliers_ranked
            if supplier["seller_id"] in offers_by_seller
        ]

    def validate_latest_offers() -> list:
        validation_by_seller.clear()
        results: list = []
        for offer in latest_offers():
            vr = validate_offer(structured_requirements, offer)
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
            validation_by_seller[offer["seller_id"]] = vr
            results.append(vr)
        return results

    def build_comparison_table() -> list:
        rows: list = []
        for supplier in negotiation_suppliers_ranked:
            sid = supplier["seller_id"]
            offer = offers_by_seller.get(sid)
            vres = validation_by_seller.get(sid)
            is_rejected_row = sid in rejected_sellers or offer is None
            rows.append({
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
        return rows

    yield evt("negotiation_turn", "negotiate", {
        "seller_id": "",
        "seller_name": "",
        "speaker": "system",
        "message": (
            f"Parallel negotiation opened with {len(negotiation_suppliers_ranked)} "
            f"seller agent(s), capped at the 3 most aligned matches."
        ),
        "round": 0,
        "event_kind": "turn",
        "pioneer_labels": [],
        "risk_level": "low",
        "extracted_fields": {},
    })

    counter_message = ""
    validation_results: list = []

    while negotiation_suppliers_ranked and any(
        state["active"] for state in supplier_state.values()
    ):
        for supplier in negotiation_suppliers_ranked:
            sid = supplier["seller_id"]
            state = supplier_state[sid]
            if not state["active"]:
                continue

            is_rejected = False
            for log, offer in negotiate_supplier_round(
                structured_requirements,
                supplier,
                inventory_flat,
                judged_candidates,
                round_num=state["round"],
                previous_seller_message=state["previous_seller_message"],
                buyer_message_override=counter_message or None,
            ):
                conversation_logs.append(log)
                yield evt("negotiation_turn", "negotiate", dict(log))
                if log.get("speaker") == "seller":
                    state["previous_seller_message"] = log.get("message", "")
                if offer is not None:
                    offers_by_seller[sid] = offer
                if log.get("event_kind") == "seller_rejection":
                    is_rejected = True

            state["round"] += 1

            if is_rejected:
                state["active"] = False
                if sid not in rejected_sellers:
                    rejected_sellers.append(sid)
                yield evt("negotiation_turn", "negotiate", {
                    "seller_id": sid,
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

        counter_message = ""
        validation_results = validate_latest_offers()
        for vr in validation_results:
            yield evt("validation", "validate", dict(vr))

        if not offers_by_seller and not any(state["active"] for state in supplier_state.values()):
            break

        comparison_table = build_comparison_table()

        yield evt("human_alert", "negotiate", {
            "session_id": session_id,
            "trigger": "deal_comparison",
            "question": (
                "Review the live seller offers. Accept one deal, reject all, "
                "or send a counter-message to continue negotiation."
            ),
            "comparison_table": comparison_table,
            "allow_counter": True,
        })

        if wait_for_human is not None:
            resp = wait_for_human(session_id, {"trigger": "deal_comparison"})
        else:
            resp = {"action": "auto_continue"}

        action = resp.get("action", "auto_continue")
        selected_seller_id = resp.get("selected_seller_id") or ""

        if action == "approve" and selected_seller_id and selected_seller_id in offers_by_seller:
            winning_offer = offers_by_seller.get(selected_seller_id)
            final_action = "approve"
            user_choice = "approved"
            for supplier in negotiation_suppliers_ranked:
                sid = supplier["seller_id"]
                if sid == selected_seller_id:
                    continue
                if sid not in rejected_sellers:
                    rejected_sellers.append(sid)
                supplier_state[sid]["active"] = False
                yield evt("negotiation_turn", "negotiate", {
                    "seller_id": sid,
                    "seller_name": supplier["seller_name"],
                    "speaker": "system",
                    "message": (
                        f"Deal with {supplier['seller_name']} automatically rejected "
                        f"after accepting {winning_offer.get('seller_name', 'the selected seller')}."
                    ),
                    "round": 0,
                    "event_kind": "supplier_fallback",
                    "pioneer_labels": [],
                    "risk_level": "low",
                    "extracted_fields": {},
                })
            break

        if action == "reject_all":
            winning_offer = None
            selected_seller_id = ""
            final_action = "reject_all"
            user_choice = "rejected_all"
            for supplier in negotiation_suppliers_ranked:
                supplier_state[supplier["seller_id"]]["active"] = False
                if supplier["seller_id"] not in rejected_sellers:
                    rejected_sellers.append(supplier["seller_id"])
            break

        if action == "counter":
            counter_message = str(resp.get("note") or "").strip()
            if counter_message:
                final_action = "counter"
                user_choice = "countered"
                yield evt("negotiation_turn", "negotiate", {
                    "seller_id": "",
                    "seller_name": "",
                    "speaker": "buyer",
                    "message": counter_message,
                    "round": 0,
                    "event_kind": "turn",
                    "pioneer_labels": [],
                    "risk_level": "low",
                    "extracted_fields": {},
                })
                continue

        passed = [v for v in validation_results if v["status"] == "passed"]
        best = max(passed, key=lambda v: v.get("score", 0)) if passed else None
        winning_offer = offers_by_seller.get(best["seller_id"]) if best else None
        selected_seller_id = best.get("seller_id", "") if best else ""
        final_action = "auto_continue"
        user_choice = "auto_selected"
        break

    raw_offers = latest_offers()

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

    # ── Stage: escalate (compute for DemoResult shape + audit) ───────────────
    passed = [v for v in validation_results if v["status"] == "passed"]
    best = max(passed, key=lambda v: v.get("score", 0)) if passed else None
    best_offer = next((o for o in raw_offers if best and o["seller_id"] == best["seller_id"]), None)

    escalation_result = check_escalation(validation_results, structured_requirements, best_offer)

    if user_choice == "pending":
        winning_offer = best_offer
        selected_seller_id = best_offer.get("seller_id", "") if best_offer else ""
        final_action = "auto_continue"
        user_choice = "auto_selected" if best_offer else "no_offer"

    # Synthesize escalation human_response so DemoResult shape stays intact
    escalation_result["human_response"] = {
        "action": final_action,
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
    deal_card = _normalize_deal_card_asset(generate_deal_card(final_recommendation))

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
        "deal_card_path": deal_card["path"],
        "deal_card_url": deal_card["url"],
        "deal_card_prompt": deal_card["prompt"],
        "deal_card_generated": deal_card["generated"],
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
