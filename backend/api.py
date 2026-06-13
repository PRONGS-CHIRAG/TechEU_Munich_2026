"""FastAPI bridge exposing the Pactum backend to the Next.js frontend.

Usage:
    uvicorn backend.api:app --reload --port 8000
"""

import json
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.data_access import get_buyer_scenarios, get_seller_inventory
from backend.orchestrator import run_demo, run_demo_stream
from backend.human_response_store import submit_response

app = FastAPI(title="Pactum API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class BuyerRequestIn(BaseModel):
    raw_request: str
    region: str
    priority: str
    request_id: Optional[str] = None


class HumanResponseIn(BaseModel):
    session_id: str
    decision: str  # approve | reject | adjust
    adjusted_budget_eur: Optional[float] = None


@app.get("/api/scenarios")
def scenarios() -> list:
    return get_buyer_scenarios()


@app.get("/api/seller-inventory")
def seller_inventory() -> list:
    return get_seller_inventory()


@app.post("/api/run-demo")
def run_demo_endpoint(request: BuyerRequestIn) -> dict:
    payload = request.model_dump(exclude_none=True)
    return run_demo(payload)


@app.get("/api/run-demo/stream")
def run_demo_stream_endpoint(raw_request: str, region: str, priority: str, request_id: Optional[str] = None) -> StreamingResponse:
    payload = {"raw_request": raw_request, "region": region, "priority": priority, "_interactive": True}
    if request_id:
        payload["request_id"] = request_id

    def _sse():
        for event in run_demo_stream(payload):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(_sse(), media_type="text/event-stream")


@app.post("/api/human-response")
def human_response_endpoint(payload: HumanResponseIn) -> dict:
    delivered = submit_response(payload.session_id, payload.model_dump(exclude={"session_id"}))
    return {"ok": delivered}
