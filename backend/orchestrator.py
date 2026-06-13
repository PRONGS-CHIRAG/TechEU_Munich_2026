import json
import os
import time
import uuid
from typing import Generator

from dotenv import load_dotenv

from backend.data_access import get_seller_inventory, get_seller_registry
from backend.agents.procurement_intelligence import extract_requirements, validate_offer, compute_value_score
from backend.agents.product_clustering import cluster_products
from backend.agents.judging_agent import judge_candidates
from backend.agents.supplier_matching import match_suppliers
from backend.agents.negotiation_agent import run_negotiation
from backend.agents.human_escalation import check_escalation
from backend.agents.audit_summary import generate_summary
from backend.human_response_store import wait_for_response
from integrations.pioneer_client import classify_message
from integrations.tavily_client import search_external_supplier
from integrations.fal_client import generate_deal_card
from integrations.fallback_outputs import (
    fallback_pioneer_labels,
    fallback_tavily_result,
    fallback_deal_card_path,
)

load_dotenv()
from backend.config import get_env_bool

DEMO_MODE = get_env_bool("DEMO_MODE", False)

PASSING_VERDICTS = ("good", "borderline")


PENDING_HUMAN_ALERT_TIMEOUT_S = 300.0

TRANSCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "../data/transcripts")


def _event(event_type: str, stage: str, data, session_id: str | None = None) -> dict:
    return {"type": event_type, "stage": stage, "data": data, "ts": int(time.time() * 1000), "session_id": session_id}


def _load_transcript(request_id: str) -> list[dict] | None:
    """Loads a saved {type, stage, data} event list for replay mode.

    Returns None if no transcript exists for this request_id, so the caller
    can fall back to a live run.
    """
    if not request_id:
        return None
    path = os.path.join(TRANSCRIPTS_DIR, f"{request_id}.json")
    try:
        with open(os.path.abspath(path)) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _adapt_tavily(tavily_raw: dict) -> dict:
    """Reshape the raw Tavily client output into the {triggered, reason,
    results: [{title, snippet, source}]} shape TavilyCard expects.

    Lives here (not in api.py) so both the streaming and non-streaming paths
    emit the same frontend-ready shape via the `done` event / DemoResult.
    """
    results = tavily_raw.get("results", [])
    return {
        "triggered": bool(results),
        "reason": tavily_raw.get("query", ""),
        "results": [
            {
                "title": r.get("title", ""),
                "snippet": r.get("content", ""),
                "source": r.get("url", ""),
            }
            for r in results
        ],
    }


def _best_candidates_per_seller(judged_candidates: list[dict]) -> list[dict]:
    """Dedupe judged candidates to one per seller (highest score), so a
    single seller doesn't negotiate two competing products in parallel.

    Matched suppliers, negotiation, and the final recommendation all assume
    one offer per seller_id — this is the single dedup point all three share.
    """
    best_per_seller: dict[str, dict] = {}
    for candidate in judged_candidates:
        if candidate["verdict"] not in PASSING_VERDICTS:
            continue
        seller_id = candidate["seller_id"]
        existing = best_per_seller.get(seller_id)
        if existing is None or candidate["score"] > existing["score"]:
            best_per_seller[seller_id] = candidate

    return sorted(best_per_seller.values(), key=lambda c: c["score"], reverse=True)[:3]


def _derive_matched_suppliers(candidates: list[dict], seller_registry: list[dict], requirements: dict) -> list[dict]:
    """Build the matched_suppliers[] list from the deduped judged candidates.

    Keeps the same shape (seller_id, seller_name, match_score, reason) the
    frontend's SupplierGrid already renders, but the candidates now come from
    product_clustering + judging_agent rather than BM25 scoring. Falls back
    to the old supplier_matching.match_suppliers() if no candidate cleared
    the judge (e.g. nothing in stock fits).
    """
    if not candidates:
        return match_suppliers(requirements)

    registry_map = {s["seller_id"]: s for s in seller_registry}

    matched = []
    for candidate in candidates:
        seller_id = candidate["seller_id"]
        seller = registry_map.get(seller_id, {})
        matched.append({
            "seller_id": seller_id,
            "seller_name": seller.get("seller_name", seller_id),
            "match_score": round(candidate["score"] / 100, 2),
            "reason": candidate["reason"],
            "specialization": seller.get("specialization", ""),
            "region": seller.get("region", ""),
            "reliability_score": seller.get("reliability_score", 0.0),
            "negotiation_style": seller.get("negotiation_style", ""),
        })

    return matched


def run_demo_stream(request: dict) -> Generator[dict, None, None]:
    """Event-emitting orchestrator: cluster -> judge -> negotiate -> validate
    -> escalate -> audit -> done.

    Yields the frozen event envelope `{type, stage, data, ts}` at each stage.
    The terminal `done` event carries the full DemoResult; `run_demo()` drains
    this generator to produce that dict for the non-streaming /api/run-demo
    route and replay mode.
    """
    demo_mode = DEMO_MODE
    session_id = request.get("request_id") or uuid.uuid4().hex

    def event(event_type: str, stage: str, data) -> dict:
        return _event(event_type, stage, data, session_id)

    try:
        # Replay mode: a saved transcript reproduces a real prior Gemini run
        # without any live API calls (CTO-facing safety net).
        if demo_mode:
            transcript = _load_transcript(request.get("request_id", ""))
            if transcript is not None:
                for raw_event in transcript:
                    data = raw_event["data"]
                    if raw_event["type"] == "done":
                        # The transcript was recorded live (demo_mode=False);
                        # mark it as a replay so the UI shows "Replay" here.
                        data = {**data, "demo_mode": True}
                    yield event(raw_event["type"], raw_event["stage"], data)
                return

        structured_requirements = extract_requirements(request)
        yield event("requirements", "requirements", structured_requirements)

        seller_registry = get_seller_registry()
        all_products = get_seller_inventory()

        clusters = cluster_products(structured_requirements, all_products)
        judged_candidates = judge_candidates(structured_requirements, clusters)

        cluster_map = {c["cluster_id"]: c for c in clusters}
        for judged in judged_candidates:
            cluster = cluster_map.get(judged["cluster_id"], {})
            yield event("cluster", "cluster", {"cluster": cluster, "judged_candidate": judged})

        best_candidates = _best_candidates_per_seller(judged_candidates)

        matched_suppliers = _derive_matched_suppliers(best_candidates, seller_registry, structured_requirements)
        for supplier in matched_suppliers:
            yield event("match", "match", supplier)

        if len(matched_suppliers) < 2 and not demo_mode:
            tavily_enrichment = search_external_supplier(structured_requirements)
        else:
            tavily_enrichment = fallback_tavily_result() if demo_mode else {}

        proceeding_candidates = []
        for judged in best_candidates:
            cluster = cluster_map.get(judged["cluster_id"], {})
            products = cluster.get("products", [])
            if not products:
                continue
            proceeding_candidates.append({**judged, "product_data": products[0]})

        conversation_logs, raw_offers = run_negotiation(structured_requirements, proceeding_candidates, seller_registry)

        # Label each seller turn before yielding it, so the streamed
        # negotiation_turn event already carries pioneer_labels/extracted_fields
        # (the ActivityFeed's "Labeled: ..." line reads off this same event).
        pioneer_labels = []
        for log in conversation_logs:
            if log["speaker"] == "seller":
                if demo_mode:
                    label_result = fallback_pioneer_labels(log["message"])
                else:
                    label_result = classify_message(log["message"])
                log["pioneer_labels"] = label_result.get("labels", [])
                log["risk_level"] = label_result.get("risk_level", "unknown")
                log["extracted_fields"] = label_result.get("extracted_fields", {})
                pioneer_labels.append(label_result)
            yield event("negotiation_turn", "negotiation", log)

        def _enrich(result: dict, offer: dict) -> dict:
            if result["status"] == "passed":
                result["score"] = compute_value_score(structured_requirements, offer)
            result["seller_name"] = offer.get("seller_name", offer.get("seller_id", ""))
            result["product"] = offer.get("product", "")
            result["length_mm"] = offer.get("length_mm", 0)
            result["power_watts"] = offer.get("power_watts", 0)
            result["price_eur"] = offer.get("price_eur", 0)
            result["delivery_days"] = offer.get("delivery_days", 0)
            result["warranty_years"] = offer.get("warranty_years", 0)
            return result

        def _pick_best(results: list[dict]):
            passed = [v for v in results if v["status"] == "passed"]
            best = max(passed, key=lambda v: v["score"]) if passed else None
            offer = next((o for o in raw_offers if best and o["seller_id"] == best["seller_id"]), None)
            return best, offer

        validation_results = [validate_offer(structured_requirements, offer) for offer in raw_offers]
        for offer, result in zip(raw_offers, validation_results):
            _enrich(result, offer)
            yield event("validation", "validation", result)

        best, best_offer = _pick_best(validation_results)

        escalation_result = check_escalation(validation_results, structured_requirements, best_offer)
        yield event("escalation", "escalation", escalation_result)

        # Phase 3 — inline human-in-the-loop: pause the run on an escalation
        # trigger and wait for POST /api/human-response (skipped in replay mode).
        # Only the SSE stream sets `_interactive` — the non-streaming
        # /api/run-demo route (and replay mode) must never block on a human
        # reply nobody can send, so they skip the pause entirely.
        human_response = None
        if escalation_result.get("escalate") and not demo_mode and request.get("_interactive"):
            yield event("human_alert", "escalation", {
                "session_id": session_id,
                "question": escalation_result.get("question_for_human", ""),
                "trigger": escalation_result.get("trigger", ""),
                "best_offer": best_offer,
                "budget_eur": structured_requirements.get("budget_eur", 0),
            })
            human_response = wait_for_response(session_id, PENDING_HUMAN_ALERT_TIMEOUT_S)

        human_decision = human_response.get("decision") if human_response else None

        if human_decision == "adjust" and human_response.get("adjusted_budget_eur") is not None:
            structured_requirements["budget_eur"] = human_response["adjusted_budget_eur"]
            validation_results = [validate_offer(structured_requirements, offer) for offer in raw_offers]
            for offer, result in zip(raw_offers, validation_results):
                _enrich(result, offer)
                yield event("validation", "validation", result)
            best, best_offer = _pick_best(validation_results)

        if best_offer:
            final_recommendation = {
                "recommended_seller": best_offer["seller_name"],
                "recommended_product": best_offer["product"],
                "price_eur": best_offer["price_eur"],
                "delivery_days": best_offer["delivery_days"],
                "warranty_years": best_offer.get("warranty_years", 0),
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
                "warranty_years": 0,
                "technical_status": "rejected",
                "risk_level": "high",
                "reason": "No offer passed all technical constraints.",
                "human_approval_required": True,
            }

        final_recommendation["human_decision"] = human_decision
        if human_decision in ("approve", "adjust"):
            final_recommendation["human_approval_required"] = False
        elif human_decision == "reject":
            final_recommendation["human_approval_required"] = False
            final_recommendation["reason"] = "Rejected by human reviewer during escalation."

        yield event("recommendation", "recommendation", final_recommendation)

        audit_summary = generate_summary(
            structured_requirements, matched_suppliers, conversation_logs, validation_results, escalation_result, raw_offers
        )
        yield event("audit", "audit", audit_summary)

        if demo_mode:
            deal_card_path = fallback_deal_card_path()
        else:
            deal_card_path = generate_deal_card(final_recommendation)

        result = {
            "request": request,
            "structured_requirements": structured_requirements,
            "clusters": clusters,
            "judged_candidates": judged_candidates,
            "matched_suppliers": matched_suppliers,
            "conversation_logs": conversation_logs,
            "pioneer_labels": pioneer_labels,
            "validation_results": validation_results,
            "tavily_enrichment": _adapt_tavily(tavily_enrichment),
            "escalation_result": escalation_result,
            "audit_summary": audit_summary,
            "final_recommendation": final_recommendation,
            "deal_card_path": deal_card_path,
            "demo_mode": demo_mode,
        }
        yield event("done", "done", result)

    except Exception as exc:
        yield event("error", "error", {"message": str(exc)})


def run_demo(request: dict) -> dict:
    """Non-streaming wrapper for /api/run-demo and replay mode.

    Drains run_demo_stream() and returns the `done` event's payload (the
    full DemoResult). On an `error` event, returns a minimal DemoResult with
    the error surfaced in audit_summary.
    """
    for event in run_demo_stream(request):
        if event["type"] == "done":
            return event["data"]
        if event["type"] == "error":
            return {
                "request": request,
                "structured_requirements": {},
                "clusters": [],
                "judged_candidates": [],
                "matched_suppliers": [],
                "conversation_logs": [],
                "pioneer_labels": [],
                "validation_results": [],
                "tavily_enrichment": {"triggered": False, "reason": "", "results": []},
                "escalation_result": {"escalate": True, "reason": event["data"]["message"], "question_for_human": "An internal error occurred — please retry."},
                "audit_summary": f"Run failed: {event['data']['message']}",
                "final_recommendation": {
                    "recommended_seller": "",
                    "recommended_product": "",
                    "price_eur": 0,
                    "delivery_days": 0,
                    "warranty_years": 0,
                    "technical_status": "rejected",
                    "risk_level": "high",
                    "reason": "Run failed before a recommendation could be produced.",
                    "human_approval_required": True,
                    "human_decision": None,
                },
                "deal_card_path": "",
                "demo_mode": DEMO_MODE,
            }

    raise RuntimeError("run_demo_stream() ended without a 'done' or 'error' event")


if __name__ == "__main__":
    sample_request = {
        "request_id": "REQ-001",
        "raw_request": "We need a GPU for an AI workstation under €650 that fits a compact case and arrives this week.",
        "region": "Germany",
        "priority": "technical_fit",
    }
    result = run_demo(sample_request)
    print(result["audit_summary"])
