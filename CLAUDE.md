# CLAUDE.md

## 1. Project Overview

Use this file as the persistent working context for Claude Code in the **Pactum** repository.

### What Pactum is

* Build **Pactum**, a multi-agent B2B procurement negotiation layer.
* Coordinate buyer agents, seller agents, specialist agents, and humans to negotiate and validate technical purchases.
* Focus Version 1 on a **GPU procurement demo for an AI workstation**.
* Treat this as a hackathon-grade vertical slice, not a full procurement platform.

### Who it is for

* Build for B2B buyers, procurement teams, technical sales teams, and vendors handling complex technical requirements.
* Assume the human buyer wants a trustworthy procurement recommendation, not a fully autonomous purchase.
* Keep the human in control for final approval, risk decisions, and budget exceptions.

### Demo win condition (updated after reviewer feedback)

The demo wins if a judge can clearly see:

* A human enters a real procurement request and clicks one button.
* The agent feed runs **in real time, line by line** — LLM calls happen live and visibly.
* The system extracts structured requirements via Gemini.
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

### Current architecture (what is live as of Phase 1)

```text
Human Buyer
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
   ↓
Product Clustering (spec-similarity)   ← NEW: cluster_products()
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
* Keep orchestration in `backend/orchestrator.py`.
* Keep agent logic in `backend/agents/`.

### LLM

* **Gemini** (`integrations/gemini_client.py`) — primary LLM for:
  * Requirement extraction (structured JSON from free-text).
  * Negotiation dialogue generation (per turn, live).
  * Judging agent reasoning (candidate evaluation narrative).
  * Audit summary generation.
* Use `google-genai` SDK. Read key from `LLM_API_KEY` with `LLM_PROVIDER=gemini`.
* Timeout: 15–20s. Retry once. Fallback to templated/deterministic output.
* **Never let Gemini override deterministic validation** for length, power, price, delivery, or warranty.

### Data

* Keep product and inventory data in `data/` as JSON (with Supabase sync).
* **Delete all pre-written conversation/dialogue data** (see Section 11).
* Seller inventory restructured to nested: `merchants[] → inventories[] → products[]`.
* Buyer blueprints replace old buyer_scenarios (strip `structured_requirements` — extracted live now).

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
├── CLAUDE.md
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
│   ├── api.py                ✓ FastAPI — POST /run-demo, GET /scenarios, + streaming routes (new)
│   ├── orchestrator.py       ✓ run_demo() — upgrading to event emitter
│   ├── schemas.py            ✓ all TypedDicts
│   ├── data_access.py        ✓ Supabase + local JSON fallback
│   └── agents/
│       ├── __init__.py       ✓
│       ├── procurement_intelligence.py  ✓ validate_offer() + compute_value_score() (unchanged)
│       │                                   extract_requirements() → Gemini live ✅ Phase 1
│       ├── product_clustering.py        ✅ cluster_products() — greedy euclidean clustering (Phase 1)
│       ├── supplier_matching.py         ✓ BM25-style scoring (keep or fold into clustering)
│       ├── judging_agent.py             NEW judge_candidates() — Gemini per-candidate reasoning
│       ├── negotiation_agent.py         NEW replaces buyer_agent + seller_agent
│       ├── negotiation/
│       │   ├── price.py                 NEW price sub-agent
│       │   ├── delivery.py              NEW delivery sub-agent
│       │   ├── warranty.py              NEW warranty sub-agent
│       │   ├── risk.py                  NEW risk sub-agent
│       │   └── guardrails.py            NEW god-rails: system-prompt constraints + post-gen check
│       ├── buyer_agent.py               RETIRING → replaced by negotiation_agent.py
│       ├── seller_agent.py              RETIRING → replaced by negotiation_agent.py
│       ├── human_escalation.py          ✓ escalation triggers (keep); add pause/resume hook
│       └── audit_summary.py             ✓ keep; switch narrative to Gemini
│
├── integrations/
│   ├── __init__.py           ✓
│   ├── gemini_client.py      ✅ generate(prompt, system, temperature, json_mode) → str (Phase 0)
│   ├── pioneer_client.py     ✓ HTTP wrapper + fallback
│   ├── tavily_client.py      ✓ TavilyClient wrapper + fallback
│   ├── fal_client.py         ✓ fal_client wrapper + fallback
│   ├── fallback_outputs.py   ✓ static fallbacks for Pioneer, Tavily, fal
│   └── email_hitl.py         NEW (stretch) Gemini AI Studio + Gmail loop
│
├── frontend/                 ✓ Next.js 15 primary UI
│   ├── src/
│   │   ├── app/page.tsx      ✅ streaming via startStream(); event-driven reveal (Phase 1)
│   │   ├── lib/
│   │   │   ├── api.ts        ✓ runDemo() + getScenarios() (kept for replay)
│   │   │   ├── stream.ts     ✅ EventSource client + completed flag (Phase 1)
│   │   │   ├── demoMachine.ts ✓ stage/reveal machine (kept)
│   │   │   ├── types.ts      ✅ ProductCluster, JudgedCandidate, extended DemoResult (Phase 1)
│   │   │   └── mockData.ts   ✓ kept for replay/fallback
│   │   └── components/
│   │       ├── sections/     ✓ all section components (no breaking changes to keys)
│   │       ├── AgentNetwork.tsx  ✓ labeled edges + hover — Phase 3
│   │       └── ActivityFeed.tsx  ✅ gemini/clustering/judging agent types added (Phase 1)
│   └── .env.local.example    NEW NEXT_PUBLIC_API_URL=http://localhost:8000
│
├── data/
│   ├── seller_registry.json        ✓ 5 vendor profiles (keep)
│   ├── seller_inventory.json       ✅ nested merchants→inventories→products (Phase 1)
│   ├── buyer_scenarios.json        → rebuild as blueprints (strip structured_requirements)
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
    └── test_validation.py    ✓ 4 tests for deterministic validation
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

### Structured Requirements (same shape, now Gemini-extracted)

```json
{
  "product_type": "GPU",
  "use_case": "AI workstation",
  "max_length_mm": 300,
  "max_power_watts": 250,
  "budget_eur": 650,
  "max_delivery_days": 7,
  "warranty_required": true,
  "minimum_warranty_years": 1
}
```

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

---

## 11. Priorities & Guardrails

### What changed after reviewer feedback

The reviewer's core objection: everything is pre-written — the system reads files, not intelligence. He will check the backend code. A reviewer who opened 6-7 tabs is engaged; the architecture must hold up to code inspection.

**Must change (Phase 0 + Phase 1 complete, Phase 2–3 remaining):**
* ✅ Delete all static conversation/dialogue data — 7 precomputed JSON files removed.
* ✅ `_get_scenario_lookup()` hardcode in `procurement_intelligence.py` — deleted.
* ✅ `buyer_scenarios.json` rebuilt as blueprints (no `structured_requirements`).
* ✅ `extract_requirements()` now calls Gemini live with `json_mode=True` + type coercion + regex fallback.
* ✅ Agent feed renders line by line via SSE — real streaming, not setTimeout fakes.
* ✅ Product clustering live across all 24 inventory products (6 clusters).
* Remaining: Gemini negotiation dialogue — `negotiation_agent.py` + sub-agents (Phase 2).
* Remaining: Judging agent with per-candidate explanations (Phase 2).
* Remaining: `audit_summary.py` switched to Gemini narrative (Phase 2).
* Remaining: Inline human alert pause/resume wired to `POST /api/human-response` (Phase 3).

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

### What is complete (as of Phase 1)

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
| `backend/agents/product_clustering.py` | ✅ Complete (Phase 1) | Greedy euclidean clustering on normalized (length, power, price, delivery) vectors. Produces 6 clusters from 24 products. |
| `backend/orchestrator.py` | ✅ Updated (Phase 1) | `run_demo_events()` generator yields all frozen SSE event types. `run_demo()` now populates `clusters[]`. |
| `backend/api.py` | ✅ Updated (Phase 1) | `GET /api/run-demo/stream` (SSE via asyncio.Queue + ThreadPoolExecutor). `POST /api/human-response` stub for Phase 3. |
| `frontend/src/lib/stream.ts` | ✅ Complete (Phase 1) | EventSource client with `completed` flag. Prevents spurious onerror on normal close and blocks auto-reconnect. |
| `frontend/src/lib/types.ts` | ✅ Updated (Phase 1) | `ProductCluster`, `JudgedCandidate` interfaces. `DemoResult` extended with `clusters?`, `judged_candidates?`, `session_id?`. |
| `frontend/src/components/feed/ActivityFeed.tsx` | ✅ Updated (Phase 1) | `gemini`, `clustering`, `judging` agent types added. |
| `frontend/src/app/page.tsx` | ✅ Updated (Phase 1) | `start()` uses `startStream()`; events drive feed and section reveals. No more fake setTimeout streaming. |
| `streamlit_app.py` | Working | Scenario selector, session_state, interactive approval. Legacy UI. |
| `backend/data_access.py` | Working | Supabase + local JSON fallback pattern. |
| `supplier_matching.py` | Working | BM25-style scoring. Supplemented by `product_clustering.py`. |
| `buyer_agent.py` | Retiring (Phase 2) | 2-round hardcoded dialogue loop → replaced by `negotiation_agent.py`. |
| `seller_agent.py` | Retiring (Phase 2) | Premium-open + concession logic → replaced by `negotiation_agent.py`. |
| `human_escalation.py` | Working | Escalation triggers + question. Needs pause/resume hook wired to `POST /api/human-response` (Phase 3). |
| `audit_summary.py` | Working | Deterministic narrative. Switch to Gemini (Phase 2). |
| `pioneer_client.py` | Stubbed | HTTP wrapper; fallback to regex labels. Keep as-is. |
| `tavily_client.py` | Stubbed | TavilyClient wrapper; fallback to saved JSON. Keep as-is. |
| `fal_client.py` | Stubbed | fal_client wrapper; fallback to PNG path. Keep as-is. |
| `fallback_outputs.py` | Complete | Static fallbacks for all three APIs. |
| `data/seller_registry.json` | Complete | 5 vendor profiles. Keep. |
| `tests/test_validation.py` | Complete | 4 passing deterministic validation tests. |
| `.env` / `.env.example` | Complete | All env vars; `.env` is git-ignored. `DEMO_MODE=false`, `LLM_PROVIDER=gemini`. |

### What needs to be built (Phase 2 onward)

| Component | Priority | Phase |
|-----------|----------|-------|
| `backend/agents/judging_agent.py` | HIGH | 2 |
| `backend/agents/negotiation_agent.py` + `negotiation/{price,delivery,warranty,risk,guardrails}.py` | HIGH | 2 |
| `audit_summary.py` switch to Gemini narrative | HIGH | 2 |
| Inline human alert pause/resume (`POST /api/human-response` + `ActivityFeed.tsx` inline UI) | HIGH | 3 |
| AgentNetwork labeled edges + hover popup per event + 3-view layout | MEDIUM | 3 |
| `integrations/email_hitl.py` (Gmail, stretch) | STRETCH | 3 |
| `assets/fal_deal_card.png` placeholder | MEDIUM | 4 |
| Aikido screenshot | MEDIUM | 4 |
| Replay transcript save (DEMO_MODE=true full replay path) | MEDIUM | 4 |

---

## 14. How to Work in This Repo

Work demo-first. Start both servers and verify the end-to-end flow in the browser before adding features. Follow the streaming data flow: Next.js `stream.ts` → FastAPI SSE → `orchestrator.py` event emitter → agents. Keep the orchestrator as a router and event emitter, not a worker. Keep deterministic validation completely separate from Gemini calls. Use `DEMO_MODE=true` and a saved replay transcript for the CTO-facing demo if live APIs are unstable.

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
