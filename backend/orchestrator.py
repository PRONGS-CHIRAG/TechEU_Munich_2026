import concurrent.futures
import json
import os
import queue as _queue
import time
import uuid
from dotenv import load_dotenv
from typing import Callable

from backend.schemas import BuyerRequest, DemoResult
from backend.agents.procurement_intelligence import extract_requirements, validate_offer, compute_value_score
from backend.agents.supplier_matching import match_suppliers
from backend.agents.product_clustering import cluster_products, select_top_products
from backend.agents.judging_agent import judge_candidate
from backend.agents.negotiation_agent import negotiate_one_supplier, _get_seller_best_product
from backend.agents.human_escalation import check_escalation
from backend.agents.audit_summary import generate_summary
from backend.data_access import get_products_for_requirements, get_seller_registry
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
    clusters = cluster_products(structured_requirements, all_products)[:5]  # cap at 5 clusters

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
    if clusters:
        # Run all cluster judgements in parallel, stream each verdict as soon
        # as it returns so the UI doesn't wait for the slowest call.
        candidates_by_cluster: dict[str, dict] = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(clusters)) as _jpool:
            future_to_cluster = {
                _jpool.submit(judge_candidate, structured_requirements, c): c
                for c in clusters
            }
            for future in concurrent.futures.as_completed(future_to_cluster):
                cluster = future_to_cluster[future]
                candidate = future.result()
                candidates_by_cluster[cluster["cluster_id"]] = candidate
                yield evt("cluster", "intel", {**cluster, "judged_candidate": candidate})
        # Preserve original cluster order in the final judged_candidates list
        judged_candidates = [candidates_by_cluster[c["cluster_id"]] for c in clusters]

    # ── Stage: match — cap at 3 suppliers for demo clarity ───────────────────
    matched_suppliers = match_suppliers(structured_requirements, inventory=all_products)[:3]
    for supplier in matched_suppliers:
        yield evt("match", "match", supplier)

    if len(matched_suppliers) < 2 and not demo_mode:
        yield evt("tavily", "match", {"status": "searching", "message": "Tavily enriching supplier data…"})
        tavily_raw = search_external_supplier(structured_requirements)
        yield evt("tavily", "match", {"status": "done", "triggered": True, "results_count": len(tavily_raw.get("results", []))})
    else:
        tavily_raw = fallback_tavily_result(structured_requirements) if demo_mode else {}

    # ── Strategy: use Gemini-extracted or default to medium ──────────────────
    strategy = structured_requirements.get("negotiation_strategy", "medium")
    if strategy not in ("aggressive", "medium", "light"):
        strategy = "medium"
    structured_requirements["negotiation_strategy"] = strategy

    # ── Stage: negotiate — top-3 product selection ────────────────────────────
    # Pick the 3 best constraint-passing products (distinct sellers) by value score.
    # This is the hard gate: only products that pass ALL buyer constraints enter
    # negotiation. Falls back to cluster-gated suppliers if no products pass.
    top_products = select_top_products(structured_requirements, all_products, n=3)

    yield evt("top_candidates", "negotiate", {
        "products": [
            {
                "seller_id": p.get("seller_id", ""),
                "seller_name": p.get("seller_name", ""),
                "product": p.get("product", ""),
                "price_eur": p.get("price_eur", 0),
                "delivery_days": p.get("delivery_days", 0),
                "warranty_years": p.get("warranty_years", 0),
                "score": compute_value_score(structured_requirements, p),
            }
            for p in top_products
        ],
        "message": (
            f"{len(top_products)} constraint-passing product(s) selected for negotiation."
            if top_products
            else "No products passed all constraints — falling back to cluster-gated suppliers."
        ),
    })

    if top_products:
        supplier_map = {s["seller_id"]: s for s in matched_suppliers}
        negotiation_suppliers_ranked = []
        for p in top_products:
            sid = p["seller_id"]
            supplier = supplier_map.get(sid) or {
                "seller_id": sid,
                "seller_name": p.get("seller_name", sid),
                "match_score": compute_value_score(structured_requirements, p) / 100.0,
                "reason": "Top constraint-passing product",
                "specialization": "",
                "region": "",
                "reliability_score": 0.5,
                "negotiation_style": "standard",
            }
            negotiation_suppliers_ranked.append(supplier)
    else:
        # Fallback: cluster-gated suppliers ranked by match_score
        good_cluster_ids = {
            jc["cluster_id"] for jc in judged_candidates
            if jc.get("verdict") in ("good", "borderline")
        }
        good_seller_ids: set = set()
        for cluster in clusters:
            if cluster.get("cluster_id") in good_cluster_ids:
                for p in cluster.get("products", []):
                    good_seller_ids.add(p.get("seller_id", ""))
        fallback_suppliers = [s for s in matched_suppliers if s["seller_id"] in good_seller_ids]
        if not fallback_suppliers:
            fallback_suppliers = matched_suppliers
        negotiation_suppliers_ranked = sorted(
            fallback_suppliers, key=lambda s: s.get("match_score", 0), reverse=True
        )

    # ── Always spawn 3 chats: pad from registry if we have fewer ────────────
    if len(negotiation_suppliers_ranked) < 3:
        existing_ids = {s["seller_id"] for s in negotiation_suppliers_ranked}
        matched_ids = {s["seller_id"] for s in matched_suppliers}
        for reg in get_seller_registry():
            if len(negotiation_suppliers_ranked) >= 3:
                break
            sid = reg.get("seller_id", "")
            if sid in existing_ids:
                continue
            padded = {
                "seller_id": sid,
                "seller_name": reg.get("seller_name", sid),
                "match_score": 0.4,
                "reason": "Backup supplier — invited to bid",
                "specialization": reg.get("specialization", ""),
                "region": reg.get("region", ""),
                "reliability_score": reg.get("reliability_score", 0.5),
                "negotiation_style": reg.get("negotiation_style", "standard"),
            }
            negotiation_suppliers_ranked.append(padded)
            existing_ids.add(sid)
            # Make padded suppliers visible BOTH live (via match event) AND in
            # the final DemoResult.matched_suppliers, otherwise the UI drops
            # them the moment the done event fires.
            if sid not in matched_ids:
                matched_suppliers.append(padded)
                matched_ids.add(sid)
            yield evt("match", "match", padded)
    negotiation_suppliers_ranked = negotiation_suppliers_ranked[:3]

    inventory_flat = all_products
    conversation_logs: list = []
    raw_offers: list = []
    winning_offer = None

    # ── Parallel negotiation: stream turns in real-time as all 3 run at once ──
    supplier_by_id = {s["seller_id"]: s for s in negotiation_suppliers_ranked}
    supplier_turns: dict[str, list] = {s["seller_id"]: [] for s in negotiation_suppliers_ranked}
    supplier_final_offer: dict[str, dict | None] = {s["seller_id"]: None for s in negotiation_suppliers_ranked}
    _turn_queue: _queue.Queue = _queue.Queue()

    def _stream_negotiation(supplier: dict) -> None:
        try:
            for log, offer in negotiate_one_supplier(
                structured_requirements, supplier, inventory_flat, judged_candidates
            ):
                _turn_queue.put(("turn", supplier["seller_id"], log, offer))
        except Exception:
            pass
        _turn_queue.put(("done", supplier["seller_id"], None, None))

    negotiation_results: dict[str, dict] = {}
    n_suppliers = len(negotiation_suppliers_ranked)
    if n_suppliers > 0:
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for s in negotiation_suppliers_ranked:
                pool.submit(_stream_negotiation, s)
            done_count = 0
            # Per-turn pacing — mimic humans texting: ~2s avg with jitter so it
            # never feels mechanical. Buyer messages get a slightly longer
            # "typing" pause than seller replies.
            import random as _random
            while done_count < n_suppliers:
                kind, sid, log, offer = _turn_queue.get()
                if kind == "turn":
                    conversation_logs.append(log)
                    supplier_turns[sid].append(log)
                    if offer is not None:
                        supplier_final_offer[sid] = offer
                    yield evt("negotiation_turn", "negotiate", dict(log))
                    if log.get("speaker") == "buyer":
                        time.sleep(_random.uniform(0.5, 1.1))
                    else:
                        time.sleep(_random.uniform(0.3, 0.8))
                elif kind == "done":
                    done_count += 1

    for sid in supplier_by_id:
        negotiation_results[sid] = {
            "turns": supplier_turns.get(sid, []),
            "offer": supplier_final_offer.get(sid),
            "supplier": supplier_by_id[sid],
        }
        if supplier_final_offer.get(sid):
            raw_offers.append(supplier_final_offer[sid])

    # ── Auto-pick best non-rejected offer by value score ─────────────────────
    valid_offers = [
        (sid, data["offer"])
        for sid, data in negotiation_results.items()
        if data.get("offer") and not any(
            t.get("event_kind") == "seller_rejection"
            for t in data.get("turns", [])
        )
    ]
    if valid_offers:
        selected_seller_id = max(
            valid_offers,
            key=lambda x: compute_value_score(structured_requirements, x[1]),
        )[0]
    elif raw_offers:
        selected_seller_id = max(
            raw_offers,
            key=lambda o: compute_value_score(structured_requirements, o),
        ).get("seller_id", "")
    else:
        selected_seller_id = ""

    winning_offer = next((o for o in raw_offers if o.get("seller_id") == selected_seller_id), None)

    rejected_sellers = [
        sid for sid, data in negotiation_results.items()
        if any(t.get("event_kind") == "seller_rejection" for t in data.get("turns", []))
    ]

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

    # Always fire final approval so buyer can accept / reject / negotiate further
    if not escalation_result.get("escalate"):
        escalation_result["escalate"] = True
        escalation_result["trigger"] = "approval_required"
        escalation_result["reason"] = "Final buyer approval required."
        escalation_result["question_for_human"] = (
            "Review the negotiated offer and decide: approve, reject, or negotiate further."
        )

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
