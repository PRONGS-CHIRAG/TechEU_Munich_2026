# Pactum

Multi-agent B2B procurement negotiation layer. Built for the TechEU Munich 2026 hackathon.

A human buyer enters a messy procurement request. Pactum extracts structured requirements, matches suppliers, runs a negotiation between buyer and seller agents, validates offers against technical constraints, and produces a final recommendation — with human approval at the end.

---

## Project structure

```
pactum/
├── streamlit_app.py          — Streamlit dashboard (alternate/legacy UI)
├── backend/
│   ├── api.py                 — FastAPI bridge for the Next.js frontend
│   ├── orchestrator.py       — run_demo() end-to-end flow
│   ├── schemas.py            — TypedDicts for all data shapes
│   ├── data_access.py         — Supabase client with local JSON fallback
│   └── agents/
│       ├── procurement_intelligence.py  — requirement extraction + validation
│       ├── supplier_matching.py         — BM25-style vendor scoring
│       ├── product_clustering.py        — category-safe product clustering
│       ├── judging_agent.py             — candidate evaluation + reasoning
│       ├── negotiation_agent.py         — live negotiation dialogue
│       ├── human_escalation.py          — escalation triggers
│       └── audit_summary.py             — final narrative summary
├── integrations/
│   ├── gemini_client.py      — Gemini requirement extraction + generated reasoning
│   ├── pioneer_client.py     — message classification + field extraction
│   ├── tavily_client.py      — external supplier/spec enrichment
│   ├── fal_client.py         — visual deal card generation
│   └── fallback_outputs.py   — static fallbacks for all three APIs
├── data/                      — seed data + Supabase setup (see below)
│   ├── *.json                 — seed/fallback data for all Supabase tables
│   ├── scripts/
│   │   ├── apply_schema.py    — applies data/supabase/schema.sql to Postgres
│   │   └── seed_supabase.py   — upserts data/*.json into Supabase tables
│   └── supabase/
│       └── schema.sql         — Supabase table definitions
├── frontend/                  — Next.js UI (the app's frontend) + FastAPI client (src/lib/api.ts)
├── assets/                    — deal card image and screenshots
├── security/                  — Aikido security scan notes
└── tests/
    └── test_validation.py    — deterministic constraint tests
```

---

## 1. Setup

### Backend (Python)

```bash
# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate          # Windows

# Install dependencies
pip install -r requirements.txt

# Copy the env template and fill in your keys
cp .env.example .env
```

### Frontend (Next.js prototype)

```bash
cd frontend
npm install
cp .env.local.example .env.local
```

---

## 2. Environment variables

Copy `.env.example` to `.env` and fill in values:

```bash
DEMO_MODE=false

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Direct Postgres connection (used by data/scripts/apply_schema.py)
SUPABASE_DB_HOST=
SUPABASE_DB_PORT=
SUPABASE_DB_NAME=
SUPABASE_DB_USER=
SUPABASE_DB_PASSWORD=

# Side track integrations
PIONEER_API_KEY=
PIONEER_BASE_URL=
TAVILY_API_KEY=
FAL_KEY=
FAL_API_KEY=
LLM_API_KEY=
LLM_PROVIDER=
```

`DEMO_MODE=false` is live mode and is the default. Set `DEMO_MODE=true` for deterministic replay/fallback mode when you want the app to run without external API keys. `backend/data_access.py` reads from Supabase when `SUPABASE_URL`/`SUPABASE_ANON_KEY` are set, and falls back to the local JSON files in `data/` otherwise (or if the Supabase call fails).

---

## 3. Data & Supabase

The JSON files in `data/` are the seed/fallback data for every Supabase table used by the app. The actual runtime data now lives in Supabase — `data/*.json` exist so the demo still works offline (`DEMO_MODE=true`) and so the Supabase project can be rebuilt from scratch.

To (re)create and seed the Supabase project:

```bash
# 1. Apply the schema (requires SUPABASE_DB_* vars in .env)
python -m data.scripts.apply_schema

# 2. Seed all tables from data/*.json (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
python -m data.scripts.seed_supabase
```

---

## 4. Running the app

### Main app — Next.js + FastAPI (the integrated app)

The Next.js frontend is the app's UI. It talks to a FastAPI bridge over HTTP, which calls `run_demo()` in `backend/orchestrator.py`. **Both processes must be running.**

**Terminal 1 — FastAPI backend** (http://localhost:8000):

```bash
uvicorn backend.api:app --reload --port 8000
```

**Terminal 2 — Next.js frontend** (http://localhost:3000):

```bash
cd frontend
npm run dev
```

Open **http://localhost:3000**, submit a procurement request, and the frontend streams `GET /api/run-demo/stream` events from the FastAPI backend. CORS is pre-configured for `http://localhost:3000`. To point the frontend at a different backend URL, set `NEXT_PUBLIC_API_URL` in `frontend/.env.local`.

For the no-keys replay safety net, start the backend with:

```bash
DEMO_MODE=true uvicorn backend.api:app --reload --port 8000
```

### Alternate UI — Streamlit

A secondary, self-contained dashboard that calls `run_demo()` directly (no FastAPI needed).

```bash
# Demo mode (no external API keys required, Supabase data still live if configured)
DEMO_MODE=true streamlit run streamlit_app.py

# Live mode (requires API keys in .env)
streamlit run streamlit_app.py

# Different port
streamlit run streamlit_app.py --server.port 8502
```

The app opens at **http://localhost:8501**.

### Backend only (no UI)

```bash
DEMO_MODE=true python -m backend.orchestrator
```

---

## 5. Useful commands

```bash
# Run tests
python -m pytest tests/ -q

# Lint
ruff check .

# Format
ruff format .

# Typecheck
mypy backend integrations
```

---

## 6. Demo flow

1. Select a scenario (REQ-001 / REQ-002 / REQ-003) or enter a custom request
2. Click **Start Procurement**
3. Watch the agent pipeline run: extraction → supplier matching → negotiation → validation
4. Review the negotiation timeline and validation table
5. Respond to the human escalation question (Approve / Reject)
6. See the audit summary and final recommendation

---

## 7. Branches

| Branch | Purpose |
|--------|---------|
| `main` | Stable — run the final demo from here |
| `staging-demo` | Integration testing — merge feature branches here first |
| `staging-ui-philipp` | Source of the `frontend/` Next.js prototype |
| `feature/orchestrator-agents` | Backend agents and orchestration |
| `feature/integrations-data` | Pioneer, Tavily, fal, synthetic data |

Always demo from `main`. Merge through `staging-demo` first.
