# Phase 0 Contracts — Pactum Live LLM Architecture

Four frozen contracts agreed before Phase 1 work starts. No implementation may deviate from these without explicit sign-off. These are the seams that let the three Phase 1 workstreams (LLM core, agent arch, realtime UI) run in parallel without stepping on each other.

---

## Contract 1 — Gemini Client Signature

**File:** `integrations/gemini_client.py`  
**Status:** IMPLEMENTED (Phase 0)

```python
def generate(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str:
```

- SDK: `google-genai` (installed via `requirements.txt`)
- Env var: `LLM_API_KEY` (Gemini key) + `LLM_PROVIDER=gemini`
- Default model: `gemini-2.5-flash`
- Timeout behaviour: retries once after 1s; returns `"[LLM unavailable — using fallback response]"` on both failures
- `json_mode=True` sets `response_mime_type="application/json"` — caller must parse the returned string as JSON
- All Phase 1/2 agents call this; no agent imports the SDK directly

---

## Contract 2 — Nested Inventory Shape

**Status:** DOCUMENTED (Phase 0) — JSON restructure happens in Phase 1

Current shape (flat, still in use): `data/seller_inventory.json` — flat array of product records with `seller_id`/`seller_name` inline.

Target shape (Phase 1):

```json
{
  "merchants": [
    {
      "seller_id": "vendor_a",
      "seller_name": "Vendor A (CompuTech Distribution)",
      "inventories": [
        {
          "inventory_id": "vendor_a-main",
          "location": "Berlin, Germany",
          "products": [
            {
              "product": "RTX 4080",
              "length_mm": 320,
              "power_watts": 320,
              "price_eur": 700,
              "delivery_days": 5,
              "warranty_years": 2,
              "availability": "in_stock"
            }
          ]
        }
      ]
    }
  ]
}
```

**Accessor signatures (Phase 1 must implement both):**

```python
# data_access.py
def get_seller_inventory_nested() -> dict:
    """Returns the full nested merchants→inventories→products structure."""

def get_all_products_flat() -> list[dict]:
    """Returns flat list with seller_id and seller_name injected into each product dict.
    Used by product_clustering.py and supplier_matching.py."""
```

Until Phase 1 restructures the JSON, `get_seller_inventory()` continues returning the flat list and existing consumers (`buyer_agent.py`, `supplier_matching.py`) are unaffected.

---

## Contract 3 — SSE Streaming Event Schema

**Status:** DOCUMENTED (Phase 0) — endpoints implemented in Phase 1 (Dev C workstream)

**New endpoint:** `GET /api/run-demo/stream`  
**Mid-flow response:** `POST /api/human-response`  
**Existing endpoint kept:** `POST /api/run-demo` (non-streaming, replay mode)

**Event envelope** (newline-delimited JSON over SSE):

```json
{ "type": "<event_type>", "stage": "<stage>", "data": {...}, "ts": <ms_since_epoch> }
```

**Frozen event types** (in emission order):

| type | when emitted | data payload |
|------|-------------|--------------|
| `requirements` | After Gemini extracts structured requirements | `StructuredRequirements` dict |
| `cluster` | For each product cluster produced | `ProductCluster` dict |
| `match` | For each matched supplier scored | `MatchedSupplier` dict |
| `negotiation_turn` | For each LLM-generated dialogue turn | `ConversationLogItem` dict |
| `validation` | For each offer validated | `ValidationResult` dict |
| `human_alert` | When escalation triggers — **pauses the stream** | `EscalationResult` dict |
| `escalation` | After human responds and flow resumes | `{ action, note }` |
| `recommendation` | Final recommendation produced | `FinalRecommendation` dict |
| `audit` | Gemini audit narrative generated | `{ text: str }` |
| `done` | Stream ends — carries full `DemoResult` | Full `DemoResult` dict |
| `error` | Unrecoverable failure | `{ message: str }` |

**Mid-flow human response body:**

```json
{ "session_id": "...", "action": "approve" | "reject" | "adjust", "note": "..." }
```

The `done` event carries the full `DemoResult` so existing section components (StructuredRequirements, SupplierGrid, ValidationTable, etc.) hydrate from one object without change.

---

## Contract 4 — DEMO_MODE Semantics

**Status:** IMPLEMENTED (Phase 0)

| Value | Behaviour | Use case |
|-------|-----------|----------|
| `DEMO_MODE=false` (default) | Live Gemini mode. Real LLM calls. UI shows "Live LLM mode" banner. | Primary demo path |
| `DEMO_MODE=true` | Replay mode. Saved transcript replayed. No API keys needed. UI shows "Replay mode" banner. | CTO-facing safety net if APIs are unstable |

**What changed in Phase 0:** default flipped from `"true"` to `"false"` in `backend/orchestrator.py` and `.env.example`. The flag and the replay path are preserved — only the default changes.
