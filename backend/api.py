"""FastAPI bridge exposing the Pactum backend to the Next.js frontend.

Usage:
    uvicorn backend.api:app --reload --port 8000
"""

import asyncio
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from backend.agents.audit_summary import generate_full_narrative
from backend.data_access import (
    get_all_products_flat,
    get_buyer_scenarios,
    get_seller_inventory_nested,
    prewarm_caches,
    write_demo_session,
)
from backend.hitl_sessions import close_session, create_session, submit_response, wait_for_response
from backend.orchestrator import DEMO_MODE, run_demo, run_demo_events

_DEAL_CARD_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "fal_deal_card.png")

app = FastAPI(title="Pactum API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3003",
        *([os.environ["FRONTEND_URL"]] if os.environ.get("FRONTEND_URL") else []),
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)

_executor = ThreadPoolExecutor(max_workers=4)
_latest_session: dict | None = None


@app.on_event("startup")
def _prewarm_on_startup() -> None:
    """Pull Supabase data into memory at boot so the first buyer demo is fast."""
    try:
        _executor.submit(prewarm_caches)
    except Exception:
        pass


def _store_latest(result: dict) -> None:
    global _latest_session
    _latest_session = result


class BuyerRequestIn(BaseModel):
    raw_request: str
    region: str
    priority: str
    request_id: Optional[str] = None


class HumanResponseIn(BaseModel):
    session_id: str
    action: Optional[str] = None          # "approve" | "reject" | "adjust" | "select_strategy"
    decision: Optional[str] = None        # frontend compatibility alias
    note: Optional[str] = None
    adjusted_budget_eur: Optional[float] = None
    strategy: Optional[str] = None        # "aggressive" | "medium" | "light"
    selected_seller_id: Optional[str] = None  # for select_best_offer HITL


class FullAuditRequest(BaseModel):
    structured_requirements: dict
    matched_suppliers: List[Any]
    conversation_logs: List[Any]
    validation_results: List[Any]
    escalation_result: dict
    final_recommendation: dict


class NegotiationInsightRequest(BaseModel):
    conversation_logs: List[Any]
    matched_suppliers: List[Any]
    validation_results: List[Any]
    final_recommendation: dict
    negotiation_outcome: Optional[dict] = None
    structured_requirements: Optional[dict] = None


def _adapt_tavily(tavily_raw: dict) -> dict:
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


@app.get("/api/scenarios")
def scenarios() -> list:
    return get_buyer_scenarios()


@app.get("/api/inventory")
def inventory() -> dict:
    return get_seller_inventory_nested()


@app.get("/api/seller-inventory")
def seller_inventory() -> list:
    """Flat inventory endpoint used by the current Next.js inventory view."""
    return get_all_products_flat()


@app.get("/api/config")
def config() -> dict:
    return {"demo_mode": DEMO_MODE}


@app.get("/api/latest-session")
def latest_session() -> dict:
    """Returns the most recently completed DemoResult (in-memory fallback for when Supabase is not configured)."""
    if _latest_session is None:
        raise HTTPException(status_code=404, detail="No session completed yet")
    return _latest_session


@app.get("/api/deal-card")
def deal_card():
    path = os.path.abspath(_DEAL_CARD_PATH)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Deal card image not yet generated")
    return FileResponse(path, media_type="image/png")


@app.post("/api/negotiation-insight")
def negotiation_insight(body: NegotiationInsightRequest) -> dict:
    from integrations.gemini_client import generate
    from backend.prompts import SELLER_INTELLIGENCE_BRIEF_SYSTEM

    reqs = body.structured_requirements or {}
    rec = body.final_recommendation
    outcome = body.negotiation_outcome or {}

    log_lines = []
    for log in body.conversation_logs:
        speaker = log.get("speaker", "?").capitalize()
        msg = log.get("message", "")
        rnd = log.get("round", 0)
        log_lines.append(f"Round {rnd} [{speaker}]: {msg}")

    context = "\n".join([
        f"Product requested: {reqs.get('product_type', '?')}",
        f"Budget: €{reqs.get('budget_eur', '?')}",
        f"Strategy: {outcome.get('strategy', '?')}",
        f"Outcome: {outcome.get('status', '?')}",
        f"Winning seller: {rec.get('recommended_seller', '?')}",
        f"Final price: €{rec.get('price_eur', '?')}",
        "",
        "Negotiation transcript:",
        *log_lines,
    ])

    prompt = (
        f"{context}\n\n"
        "As a sales intelligence analyst, give the SELLER a brief (3-4 sentences) covering:\n"
        "1. What tactics the buyer used (price pressure, urgency, etc.)\n"
        "2. What the seller conceded and whether it was necessary\n"
        "3. One specific recommendation for the seller's next negotiation\n"
        "No bullet points. Write in second-person (\"You...\")."
    )

    text = generate(prompt, system=SELLER_INTELLIGENCE_BRIEF_SYSTEM, temperature=0.5)
    return {"brief": text.strip() if text.strip() else "Insight unavailable in demo mode."}


@app.post("/api/full-audit")
def full_audit(body: FullAuditRequest) -> dict:
    narrative = generate_full_narrative(
        requirements=body.structured_requirements,
        matched_suppliers=body.matched_suppliers,
        conversation_logs=body.conversation_logs,
        validation_results=body.validation_results,
        escalation_result=body.escalation_result,
        final_recommendation=body.final_recommendation,
    )
    return {"narrative": narrative}


@app.post("/api/run-demo")
def run_demo_endpoint(request: BuyerRequestIn) -> dict:
    payload = request.model_dump(exclude_none=True)
    result = run_demo(payload)
    session_id = result.get("session_id") or payload.get("request_id") or str(uuid.uuid4())
    _store_latest(result)
    _executor.submit(write_demo_session, session_id, result)
    return result


@app.get("/api/run-demo/stream")
async def run_demo_stream(
    raw_request: str,
    region: str = "Germany",
    priority: str = "technical_fit",
    request_id: Optional[str] = None,
):
    """Server-Sent Events stream — emits events line by line as the demo runs."""
    session_id = str(uuid.uuid4())
    payload = {
        "raw_request": raw_request,
        "region": region,
        "priority": priority,
    }
    if request_id:
        payload["request_id"] = request_id
    create_session(session_id)

    async def event_generator():
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def run_in_thread():
            try:
                for event in run_demo_events(
                    payload,
                    session_id=session_id,
                    wait_for_human=lambda sid, _alert: wait_for_response(sid),
                ):
                    loop.call_soon_threadsafe(queue.put_nowait, event)
            except Exception as exc:
                error_event = {
                    "type": "error",
                    "stage": "error",
                    "data": {"message": str(exc)},
                    "session_id": "",
                    "ts": int(time.time() * 1000),
                }
                loop.call_soon_threadsafe(queue.put_nowait, error_event)
            finally:
                close_session(session_id)
                loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

        _executor.submit(run_in_thread)

        while True:
            event = await queue.get()
            if event is None:
                break
            if event.get("type") == "done":
                done_data = event.get("data", {})
                _store_latest(done_data)
                _executor.submit(write_demo_session, session_id, done_data)
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/human-response")
async def human_response(body: HumanResponseIn) -> dict:
    """Mid-flow human decision endpoint."""
    action = body.action or body.decision or "approve"
    accepted = submit_response(
        body.session_id,
        {
            "action": action,
            "note": body.note or "",
            "adjusted_budget_eur": body.adjusted_budget_eur,
            "strategy": body.strategy,
            "selected_seller_id": body.selected_seller_id or "",
            "ts": int(time.time() * 1000),
        },
    )
    return {"ok": accepted, "session_id": body.session_id}
