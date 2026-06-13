# Pactum

Multi-agent B2B procurement negotiation layer. Built for the TechEU Munich 2026 hackathon.

A human buyer enters a messy procurement request. Pactum extracts structured requirements, matches suppliers, runs a negotiation between buyer and seller agents, validates offers against technical constraints, and produces a final recommendation — with human approval at the end.

---

## Quick start

```bash
# 1. Clone and enter the repo
git clone https://github.com/PRONGS-CHIRAG/TechEU_Munich_2026.git
cd TechEU_Munich_2026

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy the env template and fill in your keys
cp .env.example .env

# 5. Run in demo mode (no API keys required)
DEMO_MODE=true streamlit run streamlit_app.py
```

The app opens at **http://localhost:8501**.

---

## Running modes

### Demo mode (recommended for judging)

Uses saved fallback outputs for Pioneer, Tavily, and fal. Supabase data is still live.

```bash
DEMO_MODE=true streamlit run streamlit_app.py
```

### Live mode (requires API keys in `.env`)

```bash
streamlit run streamlit_app.py
```

### Different port

```bash
streamlit run streamlit_app.py --server.port 8502
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in values:

```bash
DEMO_MODE=true

SUPABASE_URL=
SUPABASE_ANON_KEY=

PIONEER_API_KEY=
PIONEER_BASE_URL=

TAVILY_API_KEY=

FAL_KEY=
FAL_API_KEY=

LLM_API_KEY=
LLM_PROVIDER=
```

`DEMO_MODE=true` is the only required variable to run the app without any external services.

---

## Project structure

```
pactum/
├── streamlit_app.py          — Streamlit frontend dashboard
├── backend/
│   ├── orchestrator.py       — run_demo() end-to-end flow
│   ├── schemas.py            — TypedDicts for all data shapes
│   ├── data_access.py        — Supabase client with local JSON fallback
│   └── agents/
│       ├── procurement_intelligence.py  — requirement extraction + validation
│       ├── supplier_matching.py         — BM25-style vendor scoring
│       ├── buyer_agent.py               — 2-round negotiation loop
│       ├── seller_agent.py              — premium-open + concession logic
│       ├── human_escalation.py          — escalation triggers
│       └── audit_summary.py             — final narrative summary
├── integrations/
│   ├── pioneer_client.py     — message classification + field extraction
│   ├── tavily_client.py      — external supplier/spec enrichment
│   ├── fal_client.py         — visual deal card generation
│   └── fallback_outputs.py   — static fallbacks for all three APIs
├── data/                     — local JSON fallback data
├── assets/                   — deal card image and screenshots
└── tests/
    └── test_validation.py    — deterministic constraint tests
```

---

## Useful commands

```bash
# Smoke test the backend without the UI
DEMO_MODE=true python -m backend.orchestrator

# Run tests
python -m pytest tests/ -q

# Lint
ruff check .

# Format
ruff format .
```

---

## Demo flow

1. Select a scenario (REQ-001 / REQ-002 / REQ-003) or enter a custom request
2. Click **Start Procurement**
3. Watch the agent pipeline run: extraction → supplier matching → negotiation → validation
4. Review the negotiation timeline and validation table
5. Respond to the human escalation question (Approve / Reject)
6. See the audit summary and final recommendation

---

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Stable — run the final demo from here |
| `staging-demo` | Integration testing — merge feature branches here first |
| `feature/orchestrator-agents` | Backend agents and orchestration |
| `staging-ui-philipp` | Frontend / UI |
| `feature/integrations-data` | Pioneer, Tavily, fal, synthetic data |

Always demo from `main`. Merge through `staging-demo` first.
