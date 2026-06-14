# AGENTS.md

## 1. Project Overview

Use this file as the persistent working context for Codex in the **Pactum** repository.

### What Pactum is

* Build **Pactum**, a multi-agent B2B procurement negotiation layer.
* Coordinate buyer agents, seller agents, specialist agents, and humans to negotiate and validate technical purchases.
* Focus Version 1 on a **generalized B2B procurement demo** — originally GPU-only, now supporting any product type (GPUs, ergonomic chairs, industrial sensors, etc.).
* Treat this as a hackathon-grade vertical slice, not a full procurement platform.

### Who it is for

* Build for B2B buyers, procurement teams, technical sales teams, and vendors handling complex technical requirements.
* Assume the human buyer wants a trustworthy procurement recommendation, not a fully autonomous purchase.
* Keep the human in control for final approval, risk decisions, and budget exceptions.

### Demo win condition (updated after reviewer feedback)

The demo wins if a judge can clearly see:

* A human enters a real procurement request and clicks one button.
* The default live path starts from a **fully custom buyer prompt**, not only a saved scenario.
* The agent feed runs **in real time, line by line** — LLM calls happen live and visibly.
* The system extracts structured requirements via Gemini.
* Arbitrary products stay anchored to the buyer's requested category via `product_type` + `product_keywords`.
* Products are clustered by spec similarity across all seller inventories.
* A Judging Agent evaluates each candidate and **explains in natural language** why something is good, borderline, or bad.
* The Negotiation Agent generates **live, non-preset dialogue** with modular sub-agents (price, delivery, warranty, risk) constrained by guardrails.
* Pioneer labels seller messages and extracts offer fields.
* Tavily enriches missing supplier/spec information when needed.
* fal creates a visual procurement deal card.
* A mid-process human alert pauses the flow inline — the user confirms or adjusts before the run continues.
* The Audit/Summary Subagent explains the final recommendation.
* The reviewer can open the backend code and see real LLM calls, not file reads.

Optimize for visible intelligence, real-time computation, and a working end-to-end demo.

---

## 2. Architecture

### Current architecture (what is live as of Phase 4)

```text
Human Buyer (custom prompt first)
   ↓
Next.js 15 Frontend (primary UI)  ←→  Streamlit (legacy UI, fallback)
   ↓
FastAPI backend/api.py
  POST /api/run-demo
  GET  /api/scenarios
   ↓
backend/orchestrator.py  run_demo(request) → DemoResult
   ↓
Procurement Intelligence Agent   ← extract_requirements() + validate_offer()
  └─ preserves arbitrary product identity via product_keywords
   ↓
Product Clustering (spec-similarity)   ← NEW: cluster_products()
  └─ returns no internal candidates when inventory does not match requested product family
   ↓
Supplier Matching Agent              ← BM25-style scoring from seller_registry
   ↓
Judging Agent                        ← NEW: judge_candidates() with Gemini reasoning
   ↓
Negotiation Agent                    ← NEW: live Gemini dialogue, modular sub-agents
  ├─ Price sub-agent
  ├─ Delivery sub-agent
  ├─ Warranty sub-agent
  └─ Risk sub-agent (guardrails applied)
   ↓
Pioneer Inference Layer
  ├─ Classify seller messages
  ├─ Extract price/delivery/warranty/product fields
  └─ Detect risk labels
   ↓
Human Escalation Subagent
  ├─ Inline mid-process alert in agent feed
  ├─ In-memory session pause/resume via backend/hitl_sessions.py
  └─ Email-based loop (Gemini AI Studio + Gmail, stretch)
   ↓
Audit/Summary Subagent (Gemini-written narrative)
   ↓
fal Deal Card Generator
   ↓
Human Approval Dashboard (Next.js)
```

### Target streaming data flow (new_plan.md Phase 1–3)

```text
Buyer request (Next.js form)
→ GET /api/run-demo/stream  (SSE)
→ events: requirements · cluster · match · negotiation_turn (per LLM line) ·
          validation · human_alert (pauses) · escalation · recommendation · audit · done
→ ActivityFeed renders events live as they arrive
→ done event carries full DemoResult → existing section components hydrate
→ POST /api/human-response  (mid-flow resume)
```

### Custom prompt flow (now default)

```text
Buyer types a custom prompt into RequestForm
→ scenario selector remains optional for QA / replay
→ request_id may be omitted
→ orchestrator assigns CUSTOM-<id>
→ unknown products do not fall through to GPU / chair / sensor inventory
→ if no internal match exists, Tavily enrichment becomes the visible fallback
```

### Replay/fallback data flow (DEMO_MODE=true)

```text
Buyer request
→ POST /api/run-demo  (non-streaming, existing route, kept)
→ run_demo() drains the same generator → DemoResult (from saved transcript)
→ All section components hydrate from DemoResult as before
```

---

## 3. Tech Stack

### Primary Frontend

* **Next.js 15** — primary UI for judges and the CTO.
* Keep all primary frontend code in `frontend/`.
* `RequestForm` defaults to an empty custom prompt. Saved scenarios are optional helpers, not the primary demo path.
* Components: `AgentNetwork`, `ActivityFeed`, `NegotiationThreads`, `ValidationTable`, `EscalationBanner`, `FinalRecommendation`, `DealCard`, `TavilyCard`, `AuditSummary`, `RequestForm`, `SupplierGrid`, `StructuredRequirements`.
* Three views: buyer-side (clean request + result), orchestration (all agent comms, default), seller-inventory (nested product data).
* Show full orchestration to everyone — no complexity toggle.

### Legacy Frontend

* **Streamlit** (`streamlit_app.py`) — secondary UI, kept functional as a fallback.
* Do not invest in Streamlit after the Next.js integration is stable.

### Backend

* **FastAPI** (`backend/api.py`) — serves both UIs.
  * `POST /api/run-demo` — non-streaming, returns full `DemoResult`.
  * `GET /api/run-demo/stream` — SSE streaming, emits events line by line.
  * `POST /api/human-response` — mid-flow human reply to resume a paused stream.
  * `GET /api/scenarios` — returns buyer blueprints for the scenario selector.
  * `GET /api/inventory` — returns nested seller inventory for the inventory view.
  * `GET /api/config` — returns live/replay mode for the UI banner.
* Keep orchestration in `backend/orchestrator.py`.
* Keep agent logic in `backend/agents/`.
* Allow custom prompt runs without `request_id`; the backend normalizes them to `CUSTOM-<id>`.

### LLM

* **Gemini** (`integrations/gemini_client.py`) — primary LLM for:
  * Requirement extraction (structured JSON from free-text).
  * Negotiation dialogue generation (per turn, live).
  * Judging agent reasoning (candidate evaluation narrative).
  * Audit summary generation.
* Use `google-genai` SDK. Read key from `LLM_API_KEY` with `LLM_PROVIDER=gemini`.
* Timeout: 15–20s. Retry once. Fallback to templated/deterministic output.
* Requirement extraction must preserve unknown buyer product categories instead of remapping them into demo inventory categories.
* **Never let Gemini override deterministic validation** for length, power, price, delivery, or warranty.

### Data

* Keep product and inventory data in `data/` as JSON (Supabase bypassed for registry/inventory — always reads local JSON directly).
* **Delete all pre-written conversation/dialogue data** (see Section 11).
* Seller inventory restructured to nested: `merchants[] → inventories[] → products[]`. Currently 34 products across 7 vendors.
* Buyer blueprints replace old buyer_scenarios (strip `structured_requirements` — extracted live now). Includes REQ-001–005.
* Blueprint scenarios are still useful for QA / replay, but the main judge-facing flow should begin from a custom prompt.

### ML / model layer

* **Gemini**: requirement extraction, negotiation dialogue, judging reasoning, audit summary.
* **Pioneer**: post-hoc labeling of generated seller messages; risk classification.
* **Tavily**: external supplier discovery; product spec enrichment; price benchmarking.
* **fal**: final visual procurement deal card generation.
* **Deterministic Python**: all hard constraint checks (length, power, price, delivery, warranty). Never delegated to an LLM.

### External APIs

* Gemini: primary LLM backbone.
* Pioneer: runtime inference on generated messages.
* Tavily: search/enrichment fallback.
* fal: visual deal card.
* Aikido: dependency/security scan outside the runtime app.

### Serving

* Primary: `uvicorn backend.api:app --reload --port 8000` + `cd frontend && npm run dev`.
* Legacy fallback: `streamlit run streamlit_app.py`.

---

## 4. Directory Structure

```text
pactum/
│
├── streamlit_app.py          ✓ working — legacy UI, wired to run_demo()
├── README.md
├── AGENTS.md
├── PLAN.md
├── new_plan.md               ✓ updated plan post-reviewer feedback
├── to_do_left.md             ✓ confirmed gap list before new_plan
├── requirements.txt          ✓ created
├── .env                      ✓ created (git-ignored)
├── .env.example              ✓ created
├── .gitignore                ✓ created
│
├── backend/
│   ├── __init__.py           ✓
│   ├── api.py                ✅ FastAPI routes + custom-prompt stream support (`request_id` optional, localhost:3001 allowed for local UI)
│   ├── orchestrator.py       ✅ request normalization (`CUSTOM-*`) + no-internal-match behavior for arbitrary custom products
│   ├── hitl_sessions.py      ✅ in-memory human response queues for streamed pause/resume (Phase 3)
│   ├── schemas.py            ✅ `StructuredRequirements.product_keywords` added for arbitrary-product routing
│   ├── data_access.py        ✓ Supabase + local JSON fallback
│   └── agents/
│       ├── __init__.py       ✓
│       ├── procurement_intelligence.py  ✅ Gemini extraction + regex fallback preserve arbitrary product names / keywords
│       ├── product_clustering.py        ✅ category-safe clustering with no fallback to unrelated inventory categories
│       ├── product_utils.py             ✅ strict category / keyword matching; unknown products only match on explicit name overlap
│       ├── supplier_matching.py         ✅ category-safe supplier scoring from registry + inventory
│       ├── judging_agent.py             ✅ judge_candidates() — Gemini per-candidate reasoning (Phase 2)
│       ├── negotiation_agent.py         ✅ live Gemini dialogue; gated on good/borderline judgements + category-safe product selection
│       ├── negotiation/
│       │   ├── price.py                 ✅ price sub-agent (Phase 2)
│       │   ├── delivery.py              ✅ delivery sub-agent (Phase 2)
│       │   ├── warranty.py              ✅ warranty sub-agent (Phase 2)
│       │   ├── risk.py                  ✅ risk sub-agent (Phase 2)
│       │   └── guardrails.py            ✅ god-rails: system-prompt constraints + post-gen check (Phase 2)
│       ├── buyer_agent.py               RETIRED — replaced by negotiation_agent.py
│       ├── seller_agent.py              RETIRED — replaced by negotiation_agent.py
│       ├── human_escalation.py          ✓ escalation triggers (keep)
│       └── audit_summary.py             ✅ Gemini-written narrative (Phase 2)
│
├── integrations/
│   ├── __init__.py           ✓
│   ├── gemini_client.py      ✅ generate(prompt, system, temperature, json_mode) → str (Phase 0)
│   ├── pioneer_client.py     ✓ HTTP wrapper + fallback
│   ├── tavily_client.py      ✅ TavilyClient wrapper + product-aware fallback query
│   ├── fal_client.py         ✓ fal_client wrapper + fallback
│   ├── fallback_outputs.py   ✅ static fallbacks for Pioneer, Tavily, fal; Tavily fallback reflects requested product
│   └── email_hitl.py         NEW (stretch) Gemini AI Studio + Gmail loop
│
├── frontend/                 ✓ Next.js 15 primary UI
│   ├── src/
│   │   ├── app/page.tsx      ✅ streaming via startStream(); event-driven reveal (Phase 1)
│   │   ├── lib/
│   │   │   ├── api.ts        ✅ runDemo(), getScenarios(), getInventory(), getConfig(), postHumanResponse()
│   │   │   ├── stream.ts     ✅ EventSource client + completed flag + request_id support
│   │   │   ├── demoMachine.ts ✓ stage/reveal machine (kept)
│   │   │   ├── types.ts      ✅ ProductCluster, JudgedCandidate, extended DemoResult + `product_keywords`
│   │   │   └── mockData.ts   ✓ kept for replay/fallback
│   │   └── components/
│   │       ├── sections/     ✓ all section components (no breaking changes to keys)
│   │       │   └── SellerInventoryView.tsx ✅ nested generalized inventory view (Phase 3)
│   │       ├── AgentNetwork.tsx  ✅ dynamic generalized labels + hoverable communication edges (Phase 3)
│   │       └── ActivityFeed.tsx  ✅ inline human alert controls + gemini/clustering/judging feed types
│   └── components/input/RequestForm.tsx ✅ empty custom prompt is the default starting state
│   └── .env.local.example    NEW NEXT_PUBLIC_API_URL=http://localhost:8000
│
├── data/
│   ├── seller_registry.json        ✅ 7 vendor profiles (vendor_f: chairs, vendor_g: sensors added)
│   ├── seller_inventory.json       ✅ nested merchants→inventories→products; 34 products, 7 vendors (Phase 2)
│   ├── buyer_scenarios.json        ✅ blueprints only; REQ-001–005 (chair + sensor added in Phase 2)
│   ├── tavily_fallback_results.json ✓ keep
│   ├── synthetic_negotiations.json  DELETE (pre-written dialogue)
│   ├── edge_cases.json              DELETE (canned outputs)
│   ├── audit_summaries.json         DELETE (precomputed)
│   ├── validation_results.json      DELETE (precomputed)
│   ├── escalation_results.json      DELETE (precomputed)
│   ├── final_recommendations.json   DELETE (precomputed)
│   └── pioneer_inference_examples.json DELETE (precomputed)
│
├── assets/
│   ├── fal_deal_card.png     (place fallback image here before demo)
│   └── screenshots/          ✓ directory created (Aikido screenshot goes here)
│
├── security/
│   └── aikido_notes.md       ✓ created
│
└── tests/
    ├── __init__.py           ✓
    ├── test_validation.py    ✅ 10 tests for deterministic validation + generalized constraint evaluation (Phase 2)
    ├── test_hitl.py          ✅ pause/resume session + orchestrator HITL coverage (Phase 3)
    └── test_generalized_matching.py ✅ category-safe generalized matching coverage (Phase 3)
```

---

## 5. Commands

Run commands from the repo root.

### Create environment

```bash
python -m venv .venv
source .venv/bin/activate
```

### Install dependencies

```bash
pip install -r requirements.txt
```

### Run the full stack (primary — Next.js + FastAPI)

Terminal 1 — FastAPI backend:

```bash
uvicorn backend.api:app --reload --port 8000
```

Terminal 2 — Next.js frontend:

```bash
cd frontend
npm install   # first time only
npm run dev
```

Open: `http://localhost:3000`

### Run legacy Streamlit UI

```bash
streamlit run streamlit_app.py
```

### Run with demo fallbacks (replay mode)

```bash
DEMO_MODE=true uvicorn backend.api:app --reload --port 8000
```

Or for Streamlit:

```bash
DEMO_MODE=true streamlit run streamlit_app.py
```

### Run tests

```bash
python -m pytest
```

### Lint / Format / Typecheck

```bash
ruff check .
ruff format .
mypy backend integrations
```

### Run demo flow from CLI

```bash
python -m backend.orchestrator
```

---

## 6. Model Routing Strategy

### General rule

Use deterministic code for hard constraint checks. Use Gemini for language, extraction, reasoning, and generation. Never let an LLM override a deterministic pass/fail decision.

### Task routing

| Task | Handler | File |
|------|---------|------|
| Requirement extraction | Gemini (`json_mode=True`) + regex fallback | `procurement_intelligence.py` |
| Hard technical validation | Deterministic Python rules | `procurement_intelligence.py` |
| Product clustering | Deterministic spec-similarity (normalized distance) | `product_clustering.py` |
| Candidate ranking | Deterministic scoring (value_score) | `product_clustering.py` |
| Candidate evaluation + reasoning | Gemini (judging agent) | `judging_agent.py` |
| Negotiation dialogue | Gemini (negotiation agent + sub-agents) | `negotiation_agent.py`, `negotiation/` |
| Guardrails enforcement | System-prompt + post-gen deterministic check | `negotiation/guardrails.py` |
| Seller message classification | Pioneer | `pioneer_client.py` |
| Offer field extraction | Pioneer | `pioneer_client.py` |
| Risk labels | Pioneer + escalation rules | `pioneer_client.py`, `human_escalation.py` |
| External supplier/spec enrichment | Tavily | `tavily_client.py` |
| Deal card image | fal | `fal_client.py` |
| Audit narrative | Gemini | `audit_summary.py` |

### Tiering rule

1. Deterministic Python first (validation, clustering, scoring).
2. Gemini for language: extraction, negotiation dialogue, judging reasoning, audit.
3. Pioneer for post-hoc message labels on generated turns.
4. Tavily only when internal match is thin or specs are missing.
5. fal only at the end for the deal card.
6. Fallback to saved/templated outputs when any live API is unstable.

### DEMO_MODE semantics (updated)

`DEMO_MODE=false` (default) — live Gemini mode. Real LLM calls happen.
`DEMO_MODE=true` — replay mode. Saved transcript replayed. No API keys required.

Use `DEMO_MODE=true` as the CTO-facing safety net if APIs are unstable during judging. The UI banner shows "Live LLM mode" vs "Replay mode" off this flag.

### Retry and timeout behavior

* Gemini: 15–20s timeout. Retry once. Fallback to templated string.
* Pioneer: 10–15s timeout. Retry once. Fallback to `fallback_outputs.py`.
* Tavily: 8–12s timeout. Retry once. Fallback to `data/tavily_fallback_results.json`.
* fal: 20–30s timeout. Retry once. Fallback to `assets/fal_deal_card.png`.

---

## 7. Environment & Secrets

Keep all secrets out of git.

### Required or optional env vars

```text
DEMO_MODE             # false = live LLM (default); true = replay mode
LLM_API_KEY           # Gemini API key
LLM_PROVIDER          # gemini
PIONEER_API_KEY
PIONEER_BASE_URL
TAVILY_API_KEY
FAL_KEY
FAL_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
GMAIL_ADDRESS         # stretch: email HITL
GMAIL_APP_PASSWORD    # stretch: email HITL
```

### Rules

* Never hardcode API keys.
* Never commit `.env`.
* Keep `.env.example` updated with variable names and empty placeholder values.
* Fail gracefully when an optional API key is missing — fall back to saved output.
* The system must run with no API keys in replay mode (`DEMO_MODE=true`).

---

## 8. API Contracts

### Non-streaming (kept for replay mode + Streamlit)

```python
POST /api/run-demo
Body: BuyerRequest
Returns: DemoResult
```

### Streaming (new — primary live mode)

```
GET /api/run-demo/stream?request_id=REQ-001&...
Content-Type: text/event-stream

Emits newline-delimited JSON events:
{ "type": "<event_type>", "stage": "<stage>", "data": {...}, "ts": <ms> }
```

Frozen event types (in order):

```text
requirements       — structured requirements extracted
cluster            — product cluster with spec similarity group
match              — supplier match scored
negotiation_turn   — one LLM-generated turn (buyer or seller)
validation         — offer validation result
human_alert        — pauses flow; user must respond
escalation         — escalation decision
recommendation     — final recommendation
audit              — audit narrative
done               — carries full DemoResult; stream ends
error              — unrecoverable failure
```

### Mid-flow human response

```
POST /api/human-response
Body: { "session_id": "...", "action": "approve" | "reject" | "adjust", "note": "..." }
Returns: { "ok": true }
```

### Scenario selector

```
GET /api/scenarios
Returns: BuyerBlueprint[]
```

### Buyer Blueprint (replaces buyer scenario)

```json
{
  "request_id": "REQ-001",
  "raw_request": "We need a GPU for an AI workstation under €650...",
  "region": "Germany",
  "priority": "technical_fit"
}
```

Note: `structured_requirements` is NOT in blueprints — it is extracted live by Gemini.

### Structured Requirements (Gemini-extracted; generalized as of Phase 2)

```json
{
  "product_type": "GPU",
  "product_keywords": ["gpu", "graphics", "card"],
  "use_case": "AI workstation",
  "max_length_mm": 300,
  "max_power_watts": 250,
  "budget_eur": 650,
  "max_delivery_days": 7,
  "warranty_required": true,
  "minimum_warranty_years": 1,
  "extra_constraints": []
}
```

Note: `max_length_mm` and `max_power_watts` are **presence-gated** — only populated when the buyer explicitly states a physical constraint. If absent, products are not failed on those fields. `extra_constraints` carries any additional product-specific constraints (e.g. material, ergonomic rating) as `ExtraConstraint` objects. `product_keywords` preserves the buyer's product words so unknown custom products do not collapse into the demo inventory categories.

### Product Cluster (new)

```json
{
  "cluster_id": "cluster_1",
  "products": [
    { "seller_id": "vendor_b", "product": "RTX 4070 Super Compact", "length_mm": 267, "power_watts": 220, "price_eur": 640, "delivery_days": 5, "warranty_years": 2 }
  ],
  "similarity_score": 0.91,
  "representative_specs": { "avg_price_eur": 645, "avg_delivery_days": 5 }
}
```

### Judged Candidate (new)

```json
{
  "cluster_id": "cluster_1",
  "seller_id": "vendor_b",
  "product": "RTX 4070 Super Compact",
  "verdict": "good",
  "reason": "Fully within size, power, and budget constraints. Fastest compatible delivery in the matched set.",
  "score": 92
}
```

Verdict values: `good` · `borderline` · `bad`

### Matched Supplier (unchanged — derived from clusters now)

```json
{
  "seller_id": "vendor_b",
  "seller_name": "Vendor B",
  "match_score": 0.91,
  "reason": "Has compact GPUs under 300 mm with fast delivery"
}
```

### Conversation Log (same shape, message now Gemini-generated)

```json
{
  "seller_id": "vendor_b",
  "seller_name": "Vendor B",
  "speaker": "seller",
  "message": "We can offer the RTX 4070 Super Compact at €640 including delivery.",
  "round": 2,
  "pioneer_labels": ["price_concession", "final_offer"],
  "risk_level": "low",
  "extracted_fields": { "price_eur": 640, "delivery_days": 5 }
}
```

### Validation Result (unchanged)

```json
{
  "seller_id": "vendor_b",
  "status": "passed",
  "failed_constraints": [],
  "score": 92
}
```

Statuses: `passed` · `rejected` · `negotiable` · `missing_information`

### Escalation Result (unchanged shape)

```json
{
  "escalate": true,
  "reason": "Best valid offer is €30 above budget",
  "question_for_human": "Do you approve exceeding the budget by €30 for faster delivery?"
}
```

### Final Recommendation (unchanged)

```json
{
  "recommended_seller": "Vendor B",
  "recommended_product": "RTX 4070 Super Compact",
  "price_eur": 640,
  "delivery_days": 5,
  "technical_status": "passed",
  "risk_level": "low",
  "reason": "Best balance of compatibility, price, delivery, and warranty.",
  "human_approval_required": true
}
```

### Full DemoResult (stable keys — new additive keys marked)

```json
{
  "request": {},
  "structured_requirements": {},
  "clusters": [],
  "judged_candidates": [],
  "matched_suppliers": [],
  "conversation_logs": [],
  "pioneer_labels": [],
  "validation_results": [],
  "tavily_enrichment": {},
  "escalation_result": {},
  "audit_summary": "",
  "final_recommendation": {},
  "deal_card_path": "assets/fal_deal_card.png",
  "demo_mode": false
}
```

`clusters[]` and `judged_candidates[]` are additive — existing section components are unaffected.

---

## 9. Coding Conventions

### Python style

* Use Python modules and functions that are easy to read under hackathon pressure.
* Prefer clear names over clever abstractions.
* Use type hints for public functions.
* Keep functions small and testable.
* Keep hard validation deterministic and isolated from LLM calls.

### Error handling

* Catch external API errors inside integration clients.
* Return structured fallback objects instead of crashing.
* Log errors visibly to developers; do not disrupt the UI flow.
* Every Gemini call must have a fallback path.

### Typing

* Use `TypedDict`, `dataclasses`, or Pydantic in `backend/schemas.py`.
* Keep schemas aligned with Section 8 contracts.
* Do not silently change keys used by the frontend.

### Prompts

* Keep all Gemini prompts centralized in `backend/prompts.py`.
* Do not scatter prompt strings across agent files.
* Keep system prompts (guardrails) in `backend/agents/negotiation/guardrails.py`.

### Deterministic validation rule

Never replace with LLM reasoning:

```text
length_mm     <= max_length_mm
power_watts   <= max_power_watts
price_eur     <= budget_eur
delivery_days <= max_delivery_days
warranty_years >= minimum_warranty_years
```

---

## 10. Team Workflow & Branching

Three developers. New branches for the LLM rewrite:

### Dev A — LLM core + negotiation agent

Branch: `feature/llm-core`

Own:
* `integrations/gemini_client.py`
* `backend/agents/procurement_intelligence.py` (rewrite `extract_requirements()`)
* `backend/agents/negotiation_agent.py` (new)
* `backend/agents/negotiation/` (price, delivery, warranty, risk, guardrails)
* `frontend/` — AgentNetwork edges/hover + three-view layout + live/replay banner

Success condition: Gemini generates live negotiation dialogue; reviewer opens backend and sees real API calls.

### Dev B — Agent architecture + data

Branch: `feature/agent-arch`

Own:
* `data/seller_inventory.json` (restructure to nested)
* `data/buyer_scenarios.json` → blueprints
* `backend/data_access.py` (update accessors)
* `backend/agents/product_clustering.py` (new)
* `backend/agents/judging_agent.py` (new)
* `integrations/email_hitl.py` (stretch)
* `assets/fal_deal_card.png` + `security/aikido_notes.md`

Success condition: clusters surface real candidates; judging agent explains every rejection in natural language.

### Dev C — Streaming transport + orchestrator + HITL

Branch: `feature/realtime-ui`

Own:
* `backend/api.py` (streaming SSE endpoint + `/api/human-response`)
* `backend/orchestrator.py` (event emitter)
* `frontend/src/lib/stream.ts` (new)
* `frontend/src/components/ActivityFeed.tsx` (upgrade to event-append + inline alert)

Success condition: clicking the button opens a live stream; the feed paints each agent turn as it is generated; a human alert pauses the flow inline.

### Branches

```text
main
staging-demo
feature/llm-core
feature/agent-arch
feature/realtime-ui
```

### Merge strategy

* Work in feature branches.
* Merge into `staging-demo` after each phase.
* Test full streamed run on `staging-demo`.
* Promote stable `staging-demo` → `main` only after a clean full run.
* Run the final demo from `main`.

### Phase 0 contracts (FROZEN — all committed as of Phase 0)

1. ✅ Gemini client signature: `generate(prompt, system, temperature, json_mode) → str` — implemented in `integrations/gemini_client.py`, model `gemini-2.5-flash`
2. ✅ Nested inventory shape: `merchants[] → inventories[] → products[]` — JSON restructured in Phase 1
3. ✅ SSE event envelope + frozen event types — documented in `docs/contracts.md` (see Section 8); endpoint live in Phase 1
4. ✅ `DEMO_MODE` default flipped to `false` — live mode is now the default; `DEMO_MODE=true` is the replay/CTO safety net

### Phase 1 deliverables (COMPLETE — committed on main)

1. ✅ `extract_requirements()` calls Gemini live — `backend/agents/procurement_intelligence.py`
2. ✅ `seller_inventory.json` restructured; `get_all_products_flat()` / `get_seller_inventory_nested()` in `data_access.py`
3. ✅ `backend/agents/product_clustering.py` — `cluster_products()` with greedy euclidean distance grouping
4. ✅ `GET /api/run-demo/stream` SSE endpoint + `POST /api/human-response` stub — `backend/api.py`
5. ✅ `run_demo_events()` generator in `backend/orchestrator.py` — yields all frozen event types
6. ✅ `frontend/src/lib/stream.ts` — EventSource client with completed-flag reconnect guard
7. ✅ `frontend/src/app/page.tsx` — real streaming; no more fake setTimeout reveals
8. ✅ `backend/prompts.py` — central Gemini prompt store

### Phase 2 deliverables (COMPLETE — committed on feature/chirag)

1. ✅ `backend/agents/judging_agent.py` — `judge_candidates()` with Gemini per-candidate reasoning
2. ✅ `backend/agents/negotiation_agent.py` — live Gemini dialogue; gated on good/borderline judgements
3. ✅ `backend/agents/negotiation/{price,delivery,warranty,risk,guardrails}.py` — modular sub-agents
4. ✅ `audit_summary.py` — switched to Gemini-written narrative
5. ✅ `ExtraConstraint` schema + `evaluate_constraints()` in `backend/schemas.py` and `procurement_intelligence.py` — shared constraint evaluator replacing duplicated inline checks
6. ✅ `StructuredRequirements` `max_length_mm`/`max_power_watts` are presence-gated — only set when buyer explicitly states them; missing = FAIL
7. ✅ Gemini prompts generalized across extraction, negotiation, judging, guardrails (`backend/prompts.py`)
8. ✅ `product_clustering.py` — data-driven feature config computed from actual inventory
9. ✅ `data_access.py` — always reads registry/inventory from local JSON, bypassing Supabase
10. ✅ `data/seller_inventory.json` — added vendor_f (5 ergonomic chairs) + vendor_g (5 industrial sensors); 34 products total
11. ✅ `data/seller_registry.json` — added vendor_f + vendor_g profiles; 7 vendors total
12. ✅ `data/buyer_scenarios.json` — added REQ-004 (chair) + REQ-005 (sensor); 5 scenarios total
13. ✅ Frontend: `ValidationTable` + `StructuredRequirements` — conditionally render length/power columns; generic extra_constraints chips
14. ✅ `tests/test_validation.py` — 10 tests passing (up from 4); covers generalized constraint evaluation

### Phase 4 deliverables (COMPLETE — custom prompt hardening)

1. ✅ `RequestForm` defaults to an empty custom prompt; saved scenarios remain optional helpers
2. ✅ `backend/orchestrator.py` assigns `CUSTOM-*` ids when custom runs omit `request_id`
3. ✅ Gemini extraction prompt + coercion preserve arbitrary product identity via `product_type` + `product_keywords`
4. ✅ Unknown custom products no longer fall through to GPUs / chairs / sensors in `product_utils.py`
5. ✅ `product_clustering.py` returns zero internal clusters when the requested product family is absent from inventory
6. ✅ `supplier_matching.py` therefore returns zero internal suppliers for unmatched custom products instead of fabricating demo-category recommendations
7. ✅ Tavily fallback output now reflects the requested product category when external enrichment is needed
8. ✅ `tests/test_generalized_matching.py` covers the regression where unknown custom products used to fall back to demo categories

---

## 11. Priorities & Guardrails

### What changed after reviewer feedback

The reviewer's core objection: everything is pre-written — the system reads files, not intelligence. He will check the backend code. A reviewer who opened 6-7 tabs is engaged; the architecture must hold up to code inspection.

**Must change (Phase 0–3 complete, Phase 4 polish remaining):**
* ✅ Delete all static conversation/dialogue data — 7 precomputed JSON files removed.
* ✅ `_get_scenario_lookup()` hardcode in `procurement_intelligence.py` — deleted.
* ✅ `buyer_scenarios.json` rebuilt as blueprints (no `structured_requirements`).
* ✅ `extract_requirements()` now calls Gemini live with `json_mode=True` + type coercion + regex fallback.
* ✅ Agent feed renders line by line via SSE — real streaming, not setTimeout fakes.
* ✅ Product clustering live across category-safe generalized inventory (34 products across 7 vendors).
* ✅ Gemini negotiation dialogue — `negotiation_agent.py` + sub-agents (Phase 2 complete).
* ✅ Judging agent with per-candidate explanations (Phase 2 complete).
* ✅ `audit_summary.py` switched to Gemini narrative (Phase 2 complete).
* ✅ Pactum generalized from GPU-only to any B2B product type — `ExtraConstraint`, `evaluate_constraints()`, category-safe matching/clustering, 7 vendors, 5 buyer scenarios.
* ✅ Custom prompts no longer fall back to unrelated internal categories. If inventory does not contain the requested product family, the system says so explicitly and routes to external enrichment instead of recommending a chair / GPU / sensor.
* ✅ Inline human alert pause/resume wired to `POST /api/human-response` and inline `ActivityFeed` controls (Phase 3 complete).
* ✅ Three-view Next.js UI: orchestration, buyer, and nested seller-inventory views (Phase 3 complete).
* ✅ Agent network dynamic labels + hoverable communication edges from live negotiation events (Phase 3 complete).

**Keep:**
* One-button trigger pattern (impressed the reviewer).
* Deterministic validation (Python owns pass/fail).
* All existing `DemoResult` keys (section components depend on them).
* Both API routes (streaming is additive).
* Supabase fallback pattern.

### Do this

* Make LLM calls real and visible.
* Show the agent feed running live, line by line.
* Explain every rejection with natural language from the judging agent.
* Show modular sub-agents with removable components.
* Add inline human alert — user acts without leaving the page.
* Use `DEMO_MODE=true` / replay as the CTO safety net.
* Keep all section components rendering from the same result keys.

### Do not do this

* Do not fake LLM calls or keep pre-written dialogue.
* Do not let an LLM override deterministic validation.
* Do not break existing `DemoResult` key shapes.
* Do not add a complexity toggle — show full orchestration to everyone.
* Do not hardcode secrets.
* Do not perform major refactors beyond what the new plan requires.
* Do not build real purchasing, payments, or real seller messaging.

### Demo-first priorities (ordered)

1. Real Gemini call in extraction — proves intelligence at the first step.
2. Streaming agent feed — proves real-time computation visually.
3. Judging agent with explanations — the "wow factor" the reviewer asked for.
4. Live negotiation dialogue (Gemini, not templated).
5. Inline human alert — pauses flow visibly.
6. Technical validation table (unchanged, already works).
7. Final recommendation + audit (Gemini-written narrative).
8. Pioneer labels on generated turns.
9. Tavily enrichment (visible in both UIs).
10. fal deal card + email HITL (stretch).
11. Aikido screenshot.

---

## 12. Known Constraints / TODOs

### Constraints

* Time budget: hackathon.
* Gemini latency: 3–8s per call. Budget: ~30–60s for a full streamed run. Acceptable with streaming (user sees it working). Not acceptable as a blocking POST.
* External APIs may fail or be slow during live demo — always have replay mode ready.
* Do not rely on real seller communication or real purchasing.
* Do not overbuild multimodal ingestion.

### Latency budget

* Streaming hides latency — each token arrives live, so the UI looks active immediately.
* For the blocking `/api/run-demo` fallback path, target under 30s total.
* Gemini per call: 3–8s. Target ≤4 Gemini calls per full run (extraction, negotiation x2, judging, audit).

### TODOs after Version 1

* Add PDF RFQ parsing.
* Add supplier catalog upload.
* Add product image validation.
* Add confidential information/redaction agent.
* Add translation agent for multilingual suppliers.
* Add knowledge graph supplier matching.
* Add persistent database.
* Add real vendor integrations.
* Add audit log export.
* Add role-based access control.
* Add approval workflows for procurement teams.

---

## 13. Implementation Status

### What is complete (as of Phase 3)

| Component | Status | Notes |
|-----------|--------|-------|
| `integrations/gemini_client.py` | ✅ Complete (Phase 0) | `generate(prompt, *, system, temperature, json_mode) → str`. Model: `gemini-2.5-flash`. Retry once, graceful fallback. |
| `backend/schemas.py` | ✅ Updated (Phase 0) | Added `BuyerBlueprint`, `ProductCluster`, `JudgedCandidate`. `DemoResult` now includes `clusters[]` + `judged_candidates[]`. |
| `data/buyer_scenarios.json` | ✅ Rebuilt (Phase 0) | Blueprints only — `structured_requirements` stripped; requirements extracted live. |
| `docs/contracts.md` | ✅ Created (Phase 0) | All four Phase 0 contracts frozen in writing. |
| Precomputed data files | ✅ Deleted (Phase 0) | `synthetic_negotiations`, `edge_cases`, `audit_summaries`, `validation_results`, `escalation_results`, `final_recommendations`, `pioneer_inference_examples` — all removed. |
| `backend/prompts.py` | ✅ Complete (Phase 1) | Central Gemini prompt store. `EXTRACT_REQUIREMENTS_SYSTEM` live. Phase 2 prompts stubbed. |
| `procurement_intelligence.py` | ✅ Complete (Phase 1) | `extract_requirements()` calls Gemini (`json_mode=True`) + type coercion on all 5 numeric fields + regex fallback. DEMO_MODE skips API. `validate_offer()` + `compute_value_score()` unchanged (deterministic). |
| `data/seller_inventory.json` | ✅ Restructured (Phase 1) | Nested `merchants→inventories→products`. 24 products across 5 vendors. |
| `backend/data_access.py` | ✅ Updated (Phase 1) | `get_seller_inventory_nested()` + `get_all_products_flat()` added. `get_seller_inventory()` backward-compat shim (Supabase first, then flattens local JSON). |
| `backend/agents/product_clustering.py` | ✅ Updated (Phase 3) | Greedy euclidean clustering with category-safe product filtering; preserves arbitrary product spec fields for generalized products. |
| `backend/agents/product_utils.py` | ✅ Added (Phase 3) | Shared product-category filter keeps GPU, chair, and sensor requests matched to relevant inventory families. |
| `backend/agents/supplier_matching.py` | ✅ Updated (Phase 3) | Category-safe supplier scoring from registry + local nested inventory. |
| `backend/orchestrator.py` | ✅ Updated (Phase 3) | `run_demo_events()` yields all frozen SSE event types and pauses on `human_alert` when a human waiter is provided; `run_demo()` auto-continues for non-streaming fallback. |
| `backend/hitl_sessions.py` | ✅ Added (Phase 3) | In-memory session queues for streamed human response pause/resume. |
| `backend/api.py` | ✅ Updated (Phase 3) | `GET /api/run-demo/stream`, `POST /api/human-response`, `GET /api/inventory`, and `GET /api/config` are live. |
| `frontend/src/lib/stream.ts` | ✅ Updated (Phase 3) | EventSource client with `completed` flag, request_id support, and normal-close protection. |
| `frontend/src/lib/api.ts` | ✅ Updated (Phase 3) | Added `postHumanResponse()`, `getInventory()`, and `getConfig()` alongside existing replay/scenario calls. |
| `frontend/src/lib/types.ts` | ✅ Updated (Phase 3) | Generalized `InventoryProduct`, nested seller inventory types, `HumanResponse`, and arbitrary product spec fields. |
| `frontend/src/components/feed/ActivityFeed.tsx` | ✅ Updated (Phase 3) | Inline approve/adjust/reject controls on `human_alert`, plus gemini/clustering/judging feed types. |
| `frontend/src/components/sections/SellerInventoryView.tsx` | ✅ Added (Phase 3) | Renders nested generalized product inventory for GPUs, chairs, sensors, and future spec fields. |
| `frontend/src/components/hero/AgentNetwork.tsx` | ✅ Updated (Phase 3) | Dynamic generalized request labels, supplier counts, and hoverable communication-edge details. |
| `frontend/src/components/hero/MessageEdge.tsx` | ✅ Updated (Phase 3) | Edge labels and hover detail popups for negotiation/Pioneer communication data. |
| `frontend/src/app/page.tsx` | ✅ Updated (Phase 3) | Three views, live/replay banner, scenario-driven streaming, inventory view, and human response wiring. |
| `backend/agents/judging_agent.py` | ✅ Complete (Phase 2) | `judge_candidates()` — Gemini per-candidate reasoning; verdict: good/borderline/bad + natural language reason. |
| `backend/agents/negotiation_agent.py` | ✅ Updated (Phase 3) | Live Gemini dialogue per turn; gated on good/borderline cluster judgements and category-safe product selection. |
| `backend/agents/negotiation/` sub-agents | ✅ Complete (Phase 2) | price, delivery, warranty, risk, guardrails — all live. |
| `backend/schemas.py` (`ExtraConstraint`) | ✅ Updated (Phase 2) | `ExtraConstraint` TypedDict + `evaluate_constraints()` as shared constraint evaluator; `max_length_mm`/`max_power_watts` now presence-gated. |
| `backend/prompts.py` | ✅ Updated (Phase 2) | All prompts generalized for any B2B product type (not GPU-specific). |
| `data/seller_registry.json` | ✅ Updated (Phase 2) | 7 vendor profiles: original 5 + vendor_f (ergonomic chairs) + vendor_g (industrial sensors). |
| `data/seller_inventory.json` | ✅ Updated (Phase 2) | 34 products across 7 vendors (added 5 chairs + 5 sensors). |
| `data/buyer_scenarios.json` | ✅ Updated (Phase 2) | 5 scenarios: REQ-001–003 (GPU variants) + REQ-004 (chair) + REQ-005 (sensor). |
| `frontend/.../ValidationTable.tsx` | ✅ Updated (Phase 2) | Conditionally renders length/power columns; generic extra_constraints chips. |
| `frontend/.../StructuredRequirements.tsx` | ✅ Updated (Phase 2) | Conditionally renders length/power; shows extra_constraints. |
| `streamlit_app.py` | Working | Scenario selector, session_state, interactive approval. Legacy UI. |
| `backend/data_access.py` | ✅ Updated (Phase 2) | Always reads registry/inventory from local JSON (bypasses Supabase); Supabase pattern kept for other data. |
| `supplier_matching.py` | ✅ Updated (Phase 3) | Category-safe scoring. Supplemented by `product_clustering.py`. |
| `buyer_agent.py` | RETIRED | Replaced by `negotiation_agent.py`. |
| `seller_agent.py` | RETIRED | Replaced by `negotiation_agent.py`. |
| `human_escalation.py` | Working | Escalation triggers + question; pause/resume is handled by `orchestrator.py` + `hitl_sessions.py`. |
| `audit_summary.py` | ✅ Complete (Phase 2) | Gemini-written narrative. |
| `pioneer_client.py` | Stubbed | HTTP wrapper; fallback to regex labels; import-safe when optional requests dependency is unavailable. |
| `tavily_client.py` | Stubbed | TavilyClient wrapper; fallback to saved JSON. Keep as-is. |
| `fal_client.py` | Stubbed | fal_client wrapper; fallback to PNG path. Keep as-is. |
| `fallback_outputs.py` | Complete | Static fallbacks for all three APIs; Tavily fallback now mirrors the requested product family. |
| `tests/test_validation.py` | ✅ Complete (Phase 2) | 10 passing tests — deterministic validation + generalized constraint evaluation. |
| `tests/test_hitl.py` | ✅ Added (Phase 3) | Covers HITL session wait/submit and orchestrator pause/resume response propagation. |
| `tests/test_generalized_matching.py` | ✅ Updated (Phase 4) | Covers GPU/chair/sensor filtering plus the custom-product regression where unknown products used to fall back to demo categories. |
| `.env` / `.env.example` | Complete | All env vars; `.env` is git-ignored. `DEMO_MODE=false`, `LLM_PROVIDER=gemini`. |

### What needs to be built (Phase 4 onward)

| Component | Priority | Phase |
|-----------|----------|-------|
| `integrations/email_hitl.py` (Gmail, stretch) | STRETCH | 3 |
| `assets/fal_deal_card.png` placeholder | MEDIUM | 4 |
| Aikido screenshot | MEDIUM | 4 |
| Replay transcript save (DEMO_MODE=true full replay path) | MEDIUM | 4 |

---

## 14. How to Work in This Repo

Work demo-first. Start both servers and verify the end-to-end flow in the browser before adding features. Follow the streaming data flow: Next.js `stream.ts` → FastAPI SSE → `orchestrator.py` event emitter → agents. Keep the orchestrator as a router and event emitter, not a worker. Keep deterministic validation completely separate from Gemini calls. For custom prompts, treat the buyer's requested product family as the source of truth: do not silently remap unknown products into GPUs, chairs, or sensors. Use `DEMO_MODE=true` and a saved replay transcript for the CTO-facing demo if live APIs are unstable.

Make small, reviewable changes on the correct feature branch. Freeze the four Phase-0 contracts before splitting. Merge feature branches into `staging-demo` after each phase. Promote `staging-demo` → `main` only after a clean streamed full run.

### Quick start for new developers

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then fill in LLM_API_KEY etc.
uvicorn backend.api:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
# Open http://localhost:3000
```

For replay mode (no API keys needed):

```bash
DEMO_MODE=true uvicorn backend.api:app --reload --port 8000
```
