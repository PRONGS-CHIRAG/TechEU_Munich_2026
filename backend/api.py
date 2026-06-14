"""FastAPI bridge exposing the Pactum backend to the Next.js frontend.

Usage:
    uvicorn backend.api:app --reload --port 8000
"""

import asyncio
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.data_access import (
    get_all_products_flat,
    get_buyer_scenarios,
    get_seller_inventory_nested,
    write_demo_session,
)
from backend.hitl_sessions import close_session, create_session, submit_response, wait_for_response
from backend.orchestrator import DEMO_MODE, run_demo, run_demo_events

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
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

_executor = ThreadPoolExecutor(max_workers=4)


class BuyerRequestIn(BaseModel):
    raw_request: str
    region: str
    priority: str
    request_id: Optional[str] = None


class HumanResponseIn(BaseModel):
    session_id: str
    action: Optional[str] = None   # "approve" | "reject" | "adjust" | "select_strategy" | "reject_all" | "counter"
    decision: Optional[str] = None  # frontend compatibility alias
    note: Optional[str] = None
    adjusted_budget_eur: Optional[float] = None
    strategy: Optional[str] = None  # "aggressive" | "medium" | "light" (strategy selection)
    selected_seller_id: Optional[str] = None  # deal comparison selection


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


@app.post("/api/run-demo")
def run_demo_endpoint(request: BuyerRequestIn) -> dict:
    payload = request.model_dump(exclude_none=True)
    result = run_demo(payload)
    session_id = result.get("session_id") or payload.get("request_id") or str(uuid.uuid4())
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
                _executor.submit(write_demo_session, session_id, event.get("data", {}))
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
            "selected_seller_id": body.selected_seller_id,
            "ts": int(time.time() * 1000),
        },
    )
    return {"ok": accepted, "session_id": body.session_id}
