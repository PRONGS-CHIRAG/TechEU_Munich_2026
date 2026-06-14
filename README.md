# Pactum

Pactum is a multi-agent B2B procurement negotiation layer. A buyer enters a natural-language procurement request, and Pactum turns it into structured requirements, strict supplier matching, parallel negotiations, offer validation, and a human-approved recommendation.

Built for the TechEU Munich 2026 hackathon.

## What Pactum Does

Procurement teams often receive messy requests like:

> We need a compact GPU for an AI workstation under 650 euros, delivered within a week, with warranty included.

Pactum handles the middle of that buying process:

1. Extracts structured requirements from the buyer's prompt.
2. Finds only relevant products and sellers.
3. Rejects loosely related accessories or wrong product categories.
4. Scores and explains candidate fit.
5. Negotiates with up to 3 aligned sellers in parallel.
6. Lets the human accept, reject, or counter deals.
7. Validates final offers against hard constraints.
8. Produces a final recommendation, audit summary, and deal card.

The goal is not to replace the human buyer. Pactum keeps humans in control while making sourcing, negotiation, and comparison faster and more trustworthy.

## 1-Line Pitch

Pactum turns messy B2B procurement requests into matched suppliers, live negotiations, validated offers, and explainable human-approved recommendations.

## Why It Matters

Procurement is slow because buyers, vendors, and technical requirements rarely line up cleanly. Teams spend time translating requirements, searching suppliers, removing irrelevant quotes, negotiating terms, and documenting decisions.

Pactum reduces that work by coordinating specialist agents:

- A requirement extraction agent understands buyer intent.
- A matching layer keeps product results strict and relevant.
- A judging agent explains tradeoffs.
- A negotiation agent handles seller conversations.
- Specialist sub-agents focus on price, delivery, warranty, and risk.
- A validation layer checks hard constraints deterministically.
- An audit agent explains the final recommendation.

## Target Users

Pactum is designed for:

- B2B procurement teams.
- Technical buyers.
- IT and operations teams.
- Manufacturing and facilities teams.
- Vendor marketplaces.
- Technical sales teams handling complex quote requests.

Strong first use cases include GPUs, laptops, servers, industrial sensors, ergonomic chairs, technical equipment, and other purchases where specs, delivery, warranty, and budget all matter.

## Main Features

- Custom buyer prompt as the default flow.
- Next.js frontend with buyer, seller, and root demo views.
- FastAPI backend with streaming Server-Sent Events.
- Live activity feed that shows the orchestration step by step.
- Gemini-based requirement extraction from natural language.
- Strict product-family matching.
- Tavily fallback when no exact internal supplier match exists.
- Product clustering by spec similarity.
- Candidate judging with natural-language reasoning.
- Parallel negotiation with at most 3 aligned sellers.
- Seller-specific negotiation styles.
- Human controls to accept, reject, or send a custom counter-message.
- Automatic rejection of competing deals after one seller is accepted.
- Pioneer message labeling and offer-field extraction.
- Deterministic validation for price, delivery, warranty, size, power, and extra constraints.
- fal deal card generation with fallback image support.
- Audit summary explaining the final recommendation.
- Replay mode for demos without API keys.
- Legacy Streamlit UI kept as a fallback.

## Product Matching Philosophy

Pactum is intentionally strict. If a buyer asks for a laptop, it should only match sellers with actual laptops. It should not match laptop sleeves, docks, chargers, GPUs, cables, or other related accessories.

Examples:

- GPU request -> actual GPUs only, not HDMI/VGA cables or adapters.
- Chair request -> actual office or ergonomic chairs only, not chair mats or cushions.
- Sensor request -> actual sensors only, not brackets or sensor cables.
- Unknown product request -> no forced fallback to demo categories.

If the internal inventory has no exact match, Pactum uses Tavily to discover external supplier candidates instead of pretending an unrelated internal product is relevant.

## Demo Workflow

1. Open the web app.
2. Log in as buyer, seller, or root.
3. Enter a custom procurement prompt or select a saved scenario.
4. Watch the activity feed stream the agent workflow.
5. Review extracted requirements.
6. Review product clusters and judged candidates.
7. Watch negotiations with up to 3 sellers.
8. Accept, reject, or counter seller offers.
9. Review validation results.
10. Read the audit summary and final recommendation.

Demo accounts:

```text
Buyer:  buyer / 123
Seller: seller / 123
Root:   root / root
```

## Tech Stack

Frontend:

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Server-Sent Events
- Motion / GSAP for UI interactions

Backend:

- Python
- FastAPI
- Uvicorn
- Pydantic
- Pytest

AI and integrations:

- Gemini / Google GenAI for extraction, reasoning, negotiation, and audit summaries.
- Pioneer for message labels, risk labels, and offer-field extraction.
- Tavily for external supplier discovery and product enrichment.
- fal for visual deal card generation.
- Supabase support with local JSON fallback.

Legacy / fallback:

- Streamlit dashboard.
- Local JSON demo data.
- Replay mode with deterministic fallbacks.

## Architecture

```text
Human Buyer
  |
  v
Next.js Frontend
  |
  v
FastAPI Backend
  |
  v
Orchestrator
  |
  +--> Procurement Intelligence Agent
  |      extracts structured requirements
  |
  +--> Product Matching and Clustering
  |      filters exact product family and groups candidates
  |
  +--> Supplier Matching Agent
  |      chooses the most aligned sellers
  |
  +--> Judging Agent
  |      scores and explains candidate quality
  |
  +--> Negotiation Agent
  |      negotiates with up to 3 sellers
  |
  +--> Pioneer Inference
  |      labels seller messages and extracts offer fields
  |
  +--> Human Escalation
  |      pauses for accept, reject, or counter decisions
  |
  +--> Validation
  |      checks hard constraints deterministically
  |
  +--> Audit Summary and Deal Card
         produces the final recommendation
```

## Repository Structure

```text
.
├── backend/
│   ├── api.py                  # FastAPI routes and SSE streaming
│   ├── orchestrator.py          # End-to-end procurement workflow
│   ├── schemas.py               # Shared typed data contracts
│   ├── data_access.py           # Local JSON and optional Supabase access
│   └── agents/
│       ├── procurement_intelligence.py
│       ├── product_utils.py
│       ├── product_clustering.py
│       ├── supplier_matching.py
│       ├── judging_agent.py
│       ├── negotiation_agent.py
│       ├── human_escalation.py
│       └── audit_summary.py
│
├── frontend/
│   ├── src/app/                 # Next.js app routes
│   ├── src/buyer/               # Buyer workspace
│   ├── src/components/          # UI components
│   └── src/lib/                 # API, streaming, and type helpers
│
├── integrations/
│   ├── gemini_client.py
│   ├── pioneer_client.py
│   ├── tavily_client.py
│   ├── fal_client.py
│   └── fallback_outputs.py
│
├── data/
│   ├── seller_inventory.json
│   ├── seller_registry.json
│   └── buyer_scenarios.json
│
├── tests/
│   ├── test_generalized_matching.py
│   ├── test_hitl.py
│   └── test_validation.py
│
├── assets/
├── docs/
├── security/
├── streamlit_app.py             # Legacy fallback UI
├── RUN_APP.md                   # Short local running guide
├── PITCH_CONTEXT.md             # Pitch and presentation context
└── README.md
```

## API Overview

The FastAPI backend exposes:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/config` | Returns live/replay mode configuration. |
| `GET` | `/api/scenarios` | Returns saved buyer scenario blueprints. |
| `GET` | `/api/inventory` | Returns seller inventory. |
| `GET` | `/api/seller-inventory` | Returns nested seller inventory for the UI. |
| `POST` | `/api/run-demo` | Runs the full procurement flow and returns one complete result. |
| `GET` | `/api/run-demo/stream` | Streams the live procurement flow over SSE. |
| `POST` | `/api/human-response` | Sends accept, reject, or counter input back into a paused run. |

Streaming event types include:

- `requirements`
- `cluster`
- `match`
- `negotiation_turn`
- `validation`
- `human_alert`
- `escalation`
- `recommendation`
- `audit`
- `done`
- `error`

## Setup

Run these commands from the repo root.

### 1. Create a Python environment

```bash
python -m venv .venv
source .venv/bin/activate
```

### 2. Install backend dependencies

```bash
pip install -r requirements.txt
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 4. Create environment files

Backend:

```bash
cp .env.example .env
```

Frontend:

```bash
cd frontend
cp .env.local.example .env.local
cd ..
```

The frontend should point at the backend:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Environment Variables

The app can run in replay/fallback mode without live API keys. Live mode uses external services when keys are available.

Common backend variables:

```text
DEMO_MODE=false
LLM_API_KEY=
LLM_PROVIDER=gemini
PIONEER_API_KEY=
PIONEER_BASE_URL=
TAVILY_API_KEY=
FAL_KEY=
FAL_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

Important mode behavior:

- `DEMO_MODE=false` means live mode. This is the default.
- `DEMO_MODE=true` means replay/fallback mode. Use this when API keys are missing or unstable.
- Missing optional API keys should degrade gracefully through fallback outputs.

## Running the App

Use two terminals.

### Terminal 1: backend

```bash
uvicorn backend.api:app --reload --port 8000
```

Backend URL:

```text
http://127.0.0.1:8000
```

Health check:

```bash
curl -s http://127.0.0.1:8000/api/config
```

Expected live-mode response:

```json
{"demo_mode":false}
```

### Terminal 2: frontend

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:3000
```

## Running in Replay Mode

Replay mode is useful for demos without external API keys.

```bash
DEMO_MODE=true uvicorn backend.api:app --reload --port 8000
```

Then start the frontend normally:

```bash
cd frontend
npm run dev
```

## Running the Legacy Streamlit UI

The Streamlit app is kept as a fallback interface.

```bash
streamlit run streamlit_app.py
```

Replay mode:

```bash
DEMO_MODE=true streamlit run streamlit_app.py
```

Default Streamlit URL:

```text
http://localhost:8501
```

## Testing

Run all tests:

```bash
python -m pytest
```

Current test areas:

- Deterministic validation.
- Generalized product matching.
- Strict category filtering.
- Tavily fallback candidate construction.
- Human-in-the-loop session behavior.
- Negotiation accept, reject, and counter flows.

## Quality Commands

```bash
ruff check .
ruff format .
mypy backend integrations
```

## Troubleshooting

### Frontend cannot reach backend

Check that FastAPI is running:

```bash
curl -s http://127.0.0.1:8000/api/config
```

Check `frontend/.env.local`:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Restart the frontend after changing `.env.local`.

### Error: `[Errno 2] No such file or directory`

This usually means the backend was started from the wrong directory or an old stale process is still running.

Check the process:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

The backend should be started from this repo root:

```text
/Users/chiragnvijay/Desktop/Projects/TechEU_Munich_2026
```

Stop stale backend processes and restart:

```bash
uvicorn backend.api:app --reload --port 8000
```

### Port already in use

Find the process:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Then either stop the old process or run on another port.

Backend on another port:

```bash
uvicorn backend.api:app --reload --port 8001
```

Frontend pointing at that backend:

```bash
cd frontend
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001 npm run dev
```

## Useful Demo Prompts

GPU:

```text
We need a compact GPU for an AI workstation. It should stay under 650 euros, arrive within a week, and include warranty.
```

Chair:

```text
I want to buy ergonomic office chairs under 400 euros each with delivery within 10 days and at least 2 years warranty.
```

Laptop:

```text
I need a business laptop for engineering work under 1200 euros with fast delivery and warranty.
```

Unknown product fallback:

```text
We need rugged industrial tablets for warehouse scanning under 900 euros with delivery within 12 days.
```

## Key Design Decisions

### Deterministic validation stays deterministic

LLMs can explain and generate language, but they do not override hard validation. Price, delivery, warranty, length, power, and extra constraints are checked in Python.

### Matching is strict

Related accessories should not qualify as product matches. This prevents requests like "GPU" from matching cables, or "laptop" from matching sleeves.

### Human approval is part of the product

Pactum is decision support, not blind automation. The human buyer can accept, reject, or counter during negotiation and remains responsible for final approval.

### Fallbacks keep the demo reliable

External APIs can fail. Pactum includes fallback outputs and replay mode so the demo remains usable.

## More Documentation

- [RUN_APP.md](RUN_APP.md): shorter local run instructions.
- [PITCH_CONTEXT.md](PITCH_CONTEXT.md): pitch, value proposition, and presentation material.
- [docs/contracts.md](docs/contracts.md): API and event contract details.
- [security/aikido_notes.md](security/aikido_notes.md): security scan notes.

## Project Status

Pactum is a hackathon-grade vertical slice. It is built to show an end-to-end procurement workflow with real agent orchestration, live streaming, strict matching, negotiation, validation, and human approval.

It is not yet a production procurement platform. The next steps would be persistent run storage, stronger authentication, production supplier integrations, richer approval policies, more product categories, and deeper ERP/procurement-system integrations.
