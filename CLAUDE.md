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

### Demo win condition

The demo wins if a judge can clearly see:

* A human enters a messy procurement request.
* The system extracts structured requirements.
* The Supplier Matching Agent ranks vendors.
* The Buyer Agent negotiates with multiple Seller Agents.
* The Procurement Intelligence Agent validates offers against technical constraints.
* Pioneer labels seller messages and extracts offer fields.
* Tavily enriches missing supplier/spec information when needed.
* fal creates a visual procurement deal card.
* The Human Escalation Subagent asks for approval.
* The Audit/Summary Subagent explains the final recommendation.

Optimize for a working, reliable, visual end-to-end demo.

---

## 2. Architecture

Use this architecture:

```text
Human Buyer
   ↓
Streamlit Frontend Dashboard
   ↓
backend/orchestrator.py
   ↓
Procurement Intelligence Agent
   ├─ Extract structured requirements
   └─ Validate technical/commercial constraints
   ↓
Supplier Matching Agent
   ├─ Search local seller registry/inventory
   ├─ Rank vendors
   └─ Call Tavily fallback if internal data is insufficient
   ↓
Buyer Agent ↔ Seller Agents
   ├─ Negotiate price, delivery, warranty, alternatives
   └─ Store conversation logs
   ↓
Pioneer Inference Layer
   ├─ Classify seller messages
   ├─ Extract price/delivery/warranty/product fields
   └─ Detect risk labels
   ↓
Human Escalation Subagent
   ├─ Detect approval/risk/budget triggers
   └─ Produce human approval question
   ↓
Audit/Summary Subagent
   ├─ Summarize negotiation
   ├─ Explain rejected offers
   └─ Recommend final vendor
   ↓
fal Deal Card Generator
   ↓
Human Approval Dashboard
```

### Data flow

```text
Text buyer request
→ Streamlit form
→ run_demo(request)
→ structured_requirements
→ matched_suppliers
→ seller_negotiations
→ pioneer_labels
→ validation_results
→ escalation_result
→ audit_summary
→ final_recommendation
→ fal_deal_card
→ Streamlit dashboard response
```

### Multimodal handling

* Treat Version 1 as **text-first**.
* Use fal for generated visual output: the final procurement deal card.
* Do not build PDF/image ingestion unless the core demo is already stable.
* Future multimodal inputs may include product spec PDFs, component images, catalog screenshots, or procurement documents.

---

## 3. Tech Stack

### Frontend

* Use **Streamlit** for the dashboard.
* Keep frontend code in `streamlit_app.py`.
* Use simple Python UI components, cards, tables, expanders, and status indicators.
* Prefer fast UI clarity over custom styling complexity.

### Backend

* Use **Python** modules and classes.
* Keep orchestration in `backend/orchestrator.py`.
* Keep agent logic in `backend/agents/`.
* Do not add FastAPI unless explicitly needed.
* Do not introduce heavy frameworks after the first integration point.

### Data

* Use JSON files for synthetic data, fallback data, and demo mode.
* Keep demo data in `data/`.
* Keep generated or static fallback outputs in `integrations/fallback_outputs.py` or `data/`.

### ML / model layer

* Use **Pioneer** for:

  * Synthetic buyer/seller/inventory/negotiation data generation.
  * Runtime inference on seller messages.
  * Classification, extraction, and risk labeling.
* Use **Tavily** for:

  * External supplier discovery.
  * Product spec lookup.
  * Missing data enrichment.
  * Price benchmarking.
* Use **fal** for:

  * Final visual procurement deal card generation.
* Use deterministic Python validation for:

  * Size checks.
  * Power checks.
  * Budget checks.
  * Delivery checks.
  * Warranty checks.

### External APIs

* Pioneer: synthetic data + runtime inference.
* Tavily: search/enrichment fallback.
* fal: visual deal card.
* Aikido: dependency/security scan outside the runtime app.

### Serving

* Serve locally with Streamlit.
* Do not prioritize deployment unless the local demo is stable.

---

## 4. Directory Structure

Use this repository structure:

```text
pactum/
│
├── streamlit_app.py          ✓ scaffolded — full dashboard wired to run_demo()
├── README.md
├── CLAUDE.md
├── PLAN.md
├── requirements.txt          ✓ created
├── .env                      ✓ created (git-ignored)
├── .env.example              ✓ created
├── .gitignore                ✓ created
│
├── backend/
│   ├── __init__.py           ✓
│   ├── orchestrator.py       ✓ scaffolded — run_demo() end-to-end flow
│   ├── schemas.py            ✓ scaffolded — all TypedDicts
│   └── agents/
│       ├── __init__.py       ✓
│       ├── procurement_intelligence.py  ✓ scaffolded — extract_requirements() + validate_offer()
│       ├── supplier_matching.py         ✓ scaffolded — BM25-style scoring from local JSON
│       ├── buyer_agent.py               ✓ scaffolded — 2-round negotiation loop
│       ├── seller_agent.py              ✓ scaffolded — inventory search + alternative logic
│       ├── human_escalation.py          ✓ scaffolded — escalation triggers + question
│       └── audit_summary.py             ✓ scaffolded — human-readable summary narrative
│
├── integrations/
│   ├── __init__.py           ✓
│   ├── pioneer_client.py     ✓ scaffolded — HTTP wrapper + fallback
│   ├── tavily_client.py      ✓ scaffolded — TavilyClient wrapper + fallback
│   ├── fal_client.py         ✓ scaffolded — fal_client wrapper + fallback
│   └── fallback_outputs.py   ✓ scaffolded — static fallbacks for all three APIs
│
├── data/
│   ├── buyer_scenarios.json        ✓ 3 buyer scenarios
│   ├── seller_registry.json        ✓ 5 seller profiles
│   ├── seller_inventory.json       ✓ 9 products across vendors
│   ├── synthetic_negotiations.json ✓ 3 full negotiation examples with Pioneer labels
│   └── tavily_fallback_results.json ✓ saved fallback search results
│
├── assets/
│   ├── fal_deal_card.png     (place fallback image here before demo)
│   └── screenshots/          ✓ directory created
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

On Windows:

```bash
python -m venv .venv
.venv\Scripts\activate
```

### Install dependencies

```bash
pip install -r requirements.txt
```

### Run development server

```bash
streamlit run streamlit_app.py
```

### Run tests

```bash
python -m pytest
```

### Run a specific validation test

```bash
python -m pytest tests/test_validation.py
```

### Lint

```bash
ruff check .
```

### Format

```bash
ruff format .
```

### Typecheck

```bash
mypy backend integrations
```

If `mypy` is not configured yet, do not block the demo. Add types incrementally.

### Run demo flow from CLI

Use this if implemented:

```bash
python -m backend.orchestrator
```

### Generate or refresh synthetic data

Use this if implemented:

```bash
python -m integrations.pioneer_client --generate-data
```

### Run with demo fallbacks

```bash
DEMO_MODE=true streamlit run streamlit_app.py
```

---

## 6. Model Routing Strategy

### General rule

Use deterministic code for hard checks. Use model APIs for language, extraction, classification, search, and visual generation.

Never let an LLM override deterministic validation for size, power, budget, delivery, or warranty constraints.

### Task routing

| Task                              | Preferred handler                                            | File                                                                   |
| --------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Requirement extraction            | Procurement Intelligence Agent; optional LLM/Pioneer support | `backend/agents/procurement_intelligence.py`                           |
| Hard technical validation         | Deterministic Python rules                                   | `backend/agents/procurement_intelligence.py`                           |
| Supplier matching                 | Local JSON + keyword/BM25-style scoring                      | `backend/agents/supplier_matching.py`                                  |
| External supplier/spec enrichment | Tavily                                                       | `integrations/tavily_client.py`                                        |
| Seller message classification     | Pioneer                                                      | `integrations/pioneer_client.py`                                       |
| Offer field extraction            | Pioneer                                                      | `integrations/pioneer_client.py`                                       |
| Risk labels                       | Pioneer + escalation rules                                   | `integrations/pioneer_client.py`, `backend/agents/human_escalation.py` |
| Deal card image                   | fal                                                          | `integrations/fal_client.py`                                           |
| Final summary                     | Audit/Summary Subagent; optional LLM support                 | `backend/agents/audit_summary.py`                                      |

### Default tiering rule

* Use local deterministic logic first.
* Use Pioneer for structured inference only when seller messages need classification/extraction.
* Use Tavily only when:

  * Local supplier matching finds too few candidates.
  * Product specs are missing.
  * Price/spec benchmarking is needed for the demo.
* Use fal only once near the end of the flow to generate the final deal card.
* Use fallback outputs during the final presentation unless live API calls are confirmed stable.

### Retry and timeout behavior

Use short retries and fast failure.

* Pioneer:

  * Timeout target: 10–15 seconds.
  * Retry once.
  * Fallback to saved labels in `integrations/fallback_outputs.py`.
* Tavily:

  * Timeout target: 8–12 seconds.
  * Retry once.
  * Fallback to `data/tavily_fallback_results.json`.
* fal:

  * Timeout target: 20–30 seconds.
  * Retry once.
  * Fallback to `assets/fal_deal_card.png`.
* LLM provider if used:

  * Timeout target: 15–20 seconds.
  * Retry once.
  * Fallback to deterministic or templated output.

### Demo mode

Use `DEMO_MODE=true` to force stable saved outputs.

When `DEMO_MODE=true`:

* Do not depend on live Pioneer responses.
* Do not depend on live Tavily responses.
* Do not depend on live fal generation.
* Use saved negotiation logs, labels, Tavily outputs, and deal card.
* Preserve the same UI flow so the demo still looks live.

---

## 7. Environment & Secrets

Keep all secrets out of git.

### Required or optional env vars

Use these names only:

```text
DEMO_MODE
PIONEER_API_KEY
PIONEER_BASE_URL
TAVILY_API_KEY
FAL_KEY
FAL_API_KEY
LLM_API_KEY
LLM_PROVIDER
```

### Rules

* Never hardcode API keys.
* Never commit `.env`.
* Keep `.env.example` updated with variable names and empty placeholder values.
* Read env vars through a centralized config helper if one exists.
* Fail gracefully when an optional API key is missing.
* In demo mode, run without requiring real API keys.

Example `.env.example` format:

```bash
DEMO_MODE=true
PIONEER_API_KEY=
PIONEER_BASE_URL=
TAVILY_API_KEY=
FAL_KEY=
FAL_API_KEY=
LLM_API_KEY=
LLM_PROVIDER=
```

---

## 8. API Contracts

Keep contracts stable. Phillip’s frontend should be able to build against these shapes before backend is fully complete.

### Main interface

Implement the primary demo entrypoint:

```python
run_demo(request: dict) -> dict
```

Location:

```text
backend/orchestrator.py
```

### Buyer Request

```json
{
  "request_id": "REQ-001",
  "raw_request": "We need a GPU for an AI workstation under €650 that fits a compact case and arrives this week.",
  "region": "Germany",
  "priority": "technical_fit"
}
```

### Structured Requirements

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

### Matched Supplier

```json
{
  "seller_id": "vendor_b",
  "seller_name": "Vendor B",
  "match_score": 0.91,
  "reason": "Has compact GPUs under 300 mm with fast delivery"
}
```

### Seller Offer

```json
{
  "seller_id": "vendor_b",
  "seller_name": "Vendor B",
  "product": "RTX 4070 Super Compact",
  "length_mm": 267,
  "power_watts": 220,
  "price_eur": 650,
  "delivery_days": 5,
  "warranty_years": 2,
  "availability": "in_stock"
}
```

### Validation Result

```json
{
  "seller_id": "vendor_b",
  "status": "passed",
  "failed_constraints": [],
  "score": 92,
  "next_action": "recommend"
}
```

Use only these validation statuses:

```text
passed
rejected
negotiable
missing_information
```

### Pioneer Inference Result

```json
{
  "message": "We can reduce the price to €650 if delivery next week is acceptable.",
  "labels": ["price_concession", "delivery_condition"],
  "risk_level": "low",
  "extracted_fields": {
    "price_eur": 650,
    "delivery_days": 7
  }
}
```

Use only these default Pioneer labels:

```text
technical_info
price_concession
delivery_condition
warranty_risk
missing_information
risk_signal
final_offer
```

Use only these risk levels:

```text
low
medium
high
unknown
```

### Escalation Result

```json
{
  "escalate": true,
  "reason": "Best technically valid offer is €30 above budget",
  "question_for_human": "Do you approve exceeding the budget by €30 for faster delivery?"
}
```

### Final Recommendation

```json
{
  "recommended_seller": "Vendor B",
  "recommended_product": "RTX 4070 Super Compact",
  "price_eur": 650,
  "delivery_days": 5,
  "technical_status": "passed",
  "risk_level": "low",
  "reason": "Best balance of compatibility, price, delivery, and warranty.",
  "human_approval_required": true
}
```

### Full demo result

`run_demo(request)` should return:

```json
{
  "request": {},
  "structured_requirements": {},
  "matched_suppliers": [],
  "conversation_logs": [],
  "pioneer_labels": [],
  "validation_results": [],
  "tavily_enrichment": {},
  "escalation_result": {},
  "audit_summary": "",
  "final_recommendation": {},
  "deal_card_path": "assets/fal_deal_card.png",
  "demo_mode": true
}
```

### Conversation log item

```json
{
  "seller_id": "vendor_b",
  "speaker": "seller",
  "message": "We can reduce the price to €650 if delivery next week is acceptable.",
  "round": 2,
  "pioneer_labels": ["price_concession", "delivery_condition"],
  "risk_level": "low"
}
```

---

## 9. Coding Conventions

### Python style

* Use Python modules and functions that are easy to read under hackathon pressure.
* Prefer clear names over clever abstractions.
* Use type hints for public functions.
* Keep functions small and testable.
* Keep hard validation deterministic and isolated.

### Error handling

* Catch external API errors inside integration clients.
* Return structured fallback objects instead of crashing the app.
* Log errors in a way visible to developers, not disruptive to judges.
* Always preserve the Streamlit UI flow even if an API fails.

### Typing

* Use `TypedDict`, `dataclasses`, or Pydantic models in `backend/schemas.py`.
* Keep schemas aligned with the API contracts in this file.
* Do not silently change keys used by the frontend.

### Prompt and config management

* Keep prompts centralized if prompts are added.
* Do not scatter long prompts across random files.
* Put reusable prompt strings in a dedicated module if needed:

```text
backend/prompts.py
```

or:

```text
integrations/prompts.py
```

### Adding a new model integration

When adding a new model/API integration:

1. Create a wrapper in `integrations/`.
2. Read secrets from env vars only.
3. Add a fallback response.
4. Add timeout/retry behavior.
5. Return structured JSON.
6. Update `.env.example`.
7. Update this `CLAUDE.md` if the integration becomes part of the demo path.

### Deterministic validation rule

Never replace this with pure LLM reasoning:

```text
length_mm <= max_length_mm
power_watts <= max_power_watts
price_eur <= budget_eur
delivery_days <= max_delivery_days
warranty_years >= minimum_warranty_years
```

LLMs and Pioneer can help interpret messages, but Python rules decide pass/fail.

---

## 10. Team Workflow & Branching

There are 3 developers.

### Phillip

* Own frontend and UI/UX.
* Work on:

```text
feature/frontend-dashboard
```

Own:

* `streamlit_app.py`
* Frontend display helpers.
* Dashboard layout.
* Buyer request input.
* Supplier cards.
* Negotiation timeline.
* Pioneer label display.
* Validation table.
* Escalation panel.
* Approval screen.
* fal card display.

Success condition:

```text
A judge can understand the whole product by looking at the dashboard.
```

### Developer 2

* Own backend and agent orchestration.
* Work on:

```text
feature/orchestrator-agents
```

Own:

* `backend/orchestrator.py`
* `backend/schemas.py`
* `backend/agents/procurement_intelligence.py`
* `backend/agents/supplier_matching.py`
* `backend/agents/buyer_agent.py`
* `backend/agents/seller_agent.py`
* `backend/agents/human_escalation.py`
* `backend/agents/audit_summary.py`

Success condition:

```text
The system can run from buyer request to final recommendation.
```

### Developer 3

* Own integrations, synthetic data, and side tracks.
* Work on:

```text
feature/integrations-data
```

Own:

* `integrations/pioneer_client.py`
* `integrations/tavily_client.py`
* `integrations/fal_client.py`
* `integrations/fallback_outputs.py`
* `data/*.json`
* `assets/fal_deal_card.png`
* `security/aikido_notes.md`

Success condition:

```text
All side tracks are visibly integrated and reliable during the demo.
```

### Branches

Use:

```text
main
staging-demo
feature/frontend-dashboard
feature/orchestrator-agents
feature/integrations-data
```

### Merge strategy

* Work in feature branches.
* Merge feature branches into `staging-demo`.
* Test full demo on `staging-demo`.
* Merge stable version into `main`.
* Run the final demo from `main`.
* Avoid large refactors after the first working integration.

### Integration schedule

* First integration target: Hour 5–7.
* Second integration target: Hour 10–12.
* Final stable merge: Hour 17–18.

---

## 11. Hackathon Priorities & Guardrails

### Do this

* Build a stable vertical slice.
* Keep the demo path deterministic.
* Use saved fallbacks for live presentation.
* Show all side tracks visibly in the UI.
* Keep JSON contracts stable.
* Make every screen explain what the agents are doing.
* Show rejected offers and reasons.
* Show the final human approval moment.
* Add screenshots and fallback assets early.
* Prefer simple Python logic over complex frameworks.

### Do not do this

* Do not build a full procurement platform.
* Do not build real purchasing or payment.
* Do not build real seller messaging.
* Do not depend fully on live APIs during judging.
* Do not let the orchestrator do all the work.
* Do not replace deterministic validation with LLM guesses.
* Do not add FastAPI, LangGraph, or a database unless the core demo is already working.
* Do not perform major refactors after the first integration.
* Do not hardcode secrets.
* Do not hide failures; degrade gracefully.

### Demo-first priorities

Prioritize in this order:

1. End-to-end Streamlit demo.
2. Structured requirement extraction.
3. Supplier matching.
4. Seller negotiation logs.
5. Technical validation table.
6. Final recommendation.
7. Pioneer labels.
8. Human escalation.
9. Audit summary.
10. Tavily enrichment.
11. fal deal card.
12. Aikido security note.

### 18-hour workflow

#### Hour 0–1: Alignment and setup ✓ COMPLETE

* Confirm Pactum name. ✓
* Confirm GPU procurement scenario. ✓
* Create repo and branches. ✓ (main exists; feature branches to create)
* Finalize JSON contracts. ✓ (see Section 8)
* Add `.env.example`. ✓
* Add `requirements.txt`. ✓
* Create full folder structure and file scaffolds. ✓
* Add synthetic data files (`data/*.json`). ✓
* Add fallback outputs for Pioneer, Tavily, fal. ✓
* Add deterministic validation tests. ✓

#### Hour 1–3: Parallel build block 1 ✓ COMPLETE (Developer 2)

* Phillip: build frontend skeleton using mock data.
* Developer 2: ✓ negotiation loop live (premium-open → buyer counter → seller concession), value scoring, escalation enriched with price/delivery, `seller_name` crash fixed.
* Developer 3: build synthetic data and integration stubs.

#### Hour 3–5: Parallel build block 2 ✓ COMPLETE (Developer 2)

* Phillip: connect UI to mock outputs and add status labels.
* Developer 2: ✓ scenario lookup for exact canonical requirements, richer audit narrative, specific supplier reasons, multi-violation round-2 counters, violation-aware seller alternatives, "best we can do" honesty when no alternative exists.
* Developer 3: add Pioneer/Tavily/fal wrappers and fallback responses.

#### Hour 5–7: First integration merge ✓ COMPLETE

* ✓ `staging-demo` branch created from `main`, `feature/orchestrator-agents` fast-forward merged (no conflicts).
* ✓ `streamlit_app.py` fully wired to `run_demo()` with all integration fixes:
  - Scenario selector (REQ-001/002/003 + Custom) — canonical Supabase lookup for known scenarios, regex for custom text.
  - `st.session_state` result persistence — page never resets on radio click.
  - Interactive approval: Approve/Reject radio with confirmation message.
  - Validation table resolves `seller_id` → full `seller_name` from `matched_suppliers`.
  - Pioneer labels shown only on seller messages (buyer message label clutter removed).
  - `st.metric` reason moved to `st.caption` (was broken as delta arg).
* ✓ Minimum flow working end-to-end in browser:
  `Buyer request → requirements → matched sellers → negotiation timeline → validation → audit → recommendation → human approval`

#### Hour 7–10: Parallel build block 3

* Phillip: polish dashboard and timelines.
* Developer 2: improve orchestration and final result object.
* Developer 3: connect Pioneer, Tavily, fal, and Aikido artifacts.

#### Hour 10–12: Second integration merge

* Test full app on `staging-demo`.
* Merge stable changes to `main` after successful test.

#### Hour 12–14: Side track completion

* Show Pioneer inference.
* Show Tavily fallback.
* Show fal card.
* Show Aikido note/screenshot.

#### Hour 14–16: Polish and reliability

* Add `DEMO_MODE=true`.
* Add fallback data.
* Save all screenshots/assets.
* Clean README and UI copy.

#### Hour 16–17: Pitch preparation

Use this pitch structure:

```text
Problem → Solution → Demo → Standout Feature → Side Tracks → Closing
```

Core message:

```text
Pactum is not a single agent calling tools. It is a modular orchestration layer for multi-agent, human-in-the-loop B2B procurement.
```

#### Hour 17–18: Final testing and backup

* Ensure `main` runs.
* Ensure demo mode works.
* Ensure all fallback assets exist.
* Rehearse final demo.

---

## 12. Known Constraints / TODOs

### Constraints

* Time budget is 18 hours.
* Real procurement data may not be available.
* Use synthetic data if needed.
* External APIs may fail or be slow during live demo.
* Pioneer, Tavily, and fal should have fallback responses.
* Do not rely on real seller communication.
* Do not implement real purchasing or payments.
* Do not overbuild multimodal ingestion.

### Latency budget

* Keep the main demo flow responsive.
* Avoid long live generation during the judge-facing path.
* Use saved fal image if visual generation is slow.
* Use saved Tavily/Pioneer outputs if APIs are unstable.

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

### Known unfinished multimodal support

* Product image input is not required for Version 1.
* PDF input is not required for Version 1.
* Catalog screenshots are not required for Version 1.
* Generated visual deal card is the only required visual/multimodal output.

---

## 13. Implementation Status

### What is scaffolded and working (Hour 0–1 complete, Hour 1–3 Developer 2 complete)

All files exist and the end-to-end demo flow runs in `DEMO_MODE=true` with no API keys.

| Component | Status | Notes |
|-----------|--------|-------|
| `streamlit_app.py` | Working / Integrated | Scenario selector, session_state persistence, interactive approval, validated seller names |
| `backend/orchestrator.py` | Working | Applies value scores, passes `best_offer` to escalation |
| `backend/schemas.py` | Complete | All TypedDicts match Section 8 contracts |
| `procurement_intelligence.py` | Working | Regex extraction + deterministic validation + `compute_value_score()` |
| `supplier_matching.py` | Working | BM25-style scoring from `data/seller_registry.json` |
| `buyer_agent.py` | Working | 2-round negotiation loop; enriches offers with `seller_name` |
| `seller_agent.py` | Working | Premium-open strategy; concession logic via `request_alternative()` |
| `human_escalation.py` | Working | Escalation question includes price, delivery, and score |
| `audit_summary.py` | Working | Narrative summary of all sellers and outcome |
| `pioneer_client.py` | Stubbed | HTTP wrapper; falls back to regex-based labels |
| `tavily_client.py` | Stubbed | TavilyClient wrapper; falls back to saved JSON |
| `fal_client.py` | Stubbed | fal_client wrapper; falls back to `assets/fal_deal_card.png` |
| `fallback_outputs.py` | Complete | Static fallbacks for all three APIs |
| `data/*.json` | Complete | 5 sellers, 9 products, 3 scenarios, negotiation examples |
| `tests/test_validation.py` | Complete | 4 passing tests for deterministic validation |
| `.env` / `.env.example` | Complete | All 8 env vars; `.env` is git-ignored |

### Key behaviors after Hour 1–3 (Developer 2)

* **Negotiation fires visibly:** sellers open with their most premium compatible card; buyer counters on price; seller concedes to a cheaper alternative. Judges see a real negotiation log.
* **Defensible recommendation:** passing offers are scored by `compute_value_score()` (penalises high price −15pts, slow delivery −10pts). Cheaper and faster offers win. Flat 100-score tie-break eliminated.
* **Informative escalation:** human approval question shows score, price, and delivery days (e.g. "scored 84/100 (€430, 4-day delivery)").
* **No runtime crash:** offers are enriched with `seller_name` before being passed to the orchestrator's `final_recommendation` block.

### What each developer needs to do next

**Phillip (feature/frontend-dashboard)**
- Polish `streamlit_app.py` — add Pactum branding, better layout, agent status indicators.
- Do not change `run_demo()` call signature or result keys.

**Developer 2 (feature/orchestrator-agents)** — Hour 1–3 and Hour 3–5 complete
- ✓ Negotiation loop fires: premium-open → buyer counter → seller concession.
- ✓ Value scoring: `compute_value_score()` ranks passing offers by price (−15) and delivery (−10).
- ✓ Escalation question shows score, price, and delivery days.
- ✓ `seller_name` KeyError crash fixed.
- ✓ `extract_requirements()` uses lookup table keyed on `request_id` for exact canonical values (REQ-001/002/003); falls back to keyword/regex for unknown requests.
- ✓ `audit_summary` builds per-vendor narrative from structured offer data (product, price, delivery, warranty, rejection reasons).
- ✓ Supplier match reasons are specific: product count, min price, fastest delivery.
- ✓ Round-2 buyer counter covers price, delivery, and warranty violations in one message.
- ✓ `request_alternative()` searches fully-compliant alternatives first; returns `None` (not current offer) when nothing better exists — seller says "best we can do" honestly.
- Next (Hour 5–7): merge into `staging-demo` with Phillip and Developer 3.

**Developer 3 (feature/integrations-data)**
- Add real Pioneer API calls to `pioneer_client.py` when key is available.
- Add real Tavily calls to `tavily_client.py` when key is available.
- Add real fal generation to `fal_client.py` when key is available.
- Save a fallback `assets/fal_deal_card.png` before demo.
- Run Aikido scan and update `security/aikido_notes.md`.

---

## 14. How to Work in This Repo

Work demo-first. The scaffold already runs — start with `streamlit run streamlit_app.py` and verify the end-to-end flow before adding features. Follow the data flow from `streamlit_app.py` → `backend/orchestrator.py` → agents in `backend/agents/`. Keep the orchestrator as a router, not a worker. Keep deterministic validation separate from Pioneer inference. Use `DEMO_MODE=true` and fallback outputs whenever live APIs risk slowing or breaking the demo. Make small, reviewable changes on the correct feature branch, merge through `staging-demo`, and protect `main` as the stable final presentation branch.

### Quick start for new developers

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DEMO_MODE=true streamlit run streamlit_app.py
```

The app runs fully in demo mode — no API keys required.
