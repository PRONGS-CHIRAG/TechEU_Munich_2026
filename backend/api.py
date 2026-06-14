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

from backend.data_access import get_buyer_scenarios, get_seller_inventory_nested
from backend.hitl_sessions import close_session, create_session, submit_response, wait_for_response
from backend.orchestrator import DEMO_MODE, run_demo, run_demo_events

app = FastAPI(title="Pactum API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
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
    action: str  # "approve" | "reject" | "adjust"
    note: Optional[str] = None


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


@app.get("/api/config")
def config() -> dict:
    return {"demo_mode": DEMO_MODE}


@app.post("/api/run-demo")
def run_demo_endpoint(request: BuyerRequestIn) -> dict:
    payload = request.model_dump(exclude_none=True)
    # run_demo() drains run_demo_events() which already adapts tavily_enrichment
    # to the frontend shape (triggered/reason/results) — no further adaptation needed.
    return run_demo(payload)


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
    accepted = submit_response(
        body.session_id,
        {
            "action": body.action,
            "note": body.note or "",
            "ts": int(time.time() * 1000),
        },
    )
    return {"ok": accepted, "session_id": body.session_id}
