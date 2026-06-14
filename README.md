# Pactum

**Multi-agent B2B procurement negotiation — one button, five agents, live LLM.**

Built at TechEU Munich 2026. A buyer types a messy free-text procurement request. Five agents extract requirements, cluster products, judge candidates, negotiate with three suppliers in parallel, validate every offer against hard constraints, and surface the best deal — with a single human approval at the end.

---

## How it works

```
Buyer types: "Need 12× RTX 4090 cards, EU shipping, under €1800, 2yr warranty"
                              ↓
          ┌─────────────────────────────────────────┐
          │  Gemini extracts structured requirements │
          └─────────────────────────────────────────┘
                              ↓
          ┌─────────────────────────────────────────┐
          │  Products cluster by spec similarity    │
          │  Judging Agent scores each cluster      │  ← parallel Gemini calls
          └─────────────────────────────────────────┘
                              ↓
          ┌─────────────────────────────────────────┐
          │  3 suppliers negotiate simultaneously   │  ← real-time turn streaming
          │  • 5/3/2 rounds per strategy            │
          │  • 10% seller floor (deterministic)     │
          │  • Waterfall on rejection               │
          └─────────────────────────────────────────┘
                              ↓
          ┌─────────────────────────────────────────┐
          │  Pioneer labels every seller message    │
          │  Deterministic constraint validation    │
          └─────────────────────────────────────────┘
                              ↓
                  ⚠  Human approval gate
                              ↓
          ┌─────────────────────────────────────────┐
          │  Gemini audit summary + fal deal card   │
          └─────────────────────────────────────────┘
```

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, Tailwind CSS v4, React Flow, motion/react, GSAP |
| Backend | FastAPI, Python 3.12, SSE streaming |
| LLM | Gemini 2.5 Flash |
| Message labeling | Pioneer |
| Supplier enrichment | Tavily |
| Deal card image | fal |
| Realtime (seller dashboard) | Supabase Realtime |

---

## Quick start

**Prerequisites:** Python 3.12+, Node 20+

```bash
# 1. Clone and set up Python env
git clone <repo-url> && cd munich-hack
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Fill in: LLM_API_KEY, PIONEER_API_KEY, TAVILY_API_KEY, FAL_KEY, SUPABASE_URL, SUPABASE_ANON_KEY

# 3. Start backend
uvicorn backend.api:app --reload --port 8000

# 4. Start frontend (new terminal)
cd frontend && npm install && npm run dev
```

Open **http://localhost:3000**

| Role | Username | Password |
|------|----------|----------|
| Buyer | `buyer` | `123` |
| Seller | `seller` | `123` |
| Admin | `root` | `root` |

### No API keys? Run in replay mode

```bash
DEMO_MODE=true uvicorn backend.api:app --reload --port 8000
```

The frontend shows a "Replay mode" banner. No external calls are made — safe for demos when connectivity is uncertain.

---

## Project structure

```
├── backend/
│   ├── api.py                     FastAPI routes (SSE + blocking + HITL)
│   ├── orchestrator.py            run_demo_events() — the full agent pipeline
│   ├── prompts.py                 ALL Gemini prompts (centralized)
│   ├── schemas.py                 TypedDicts / Pydantic shapes (source of truth)
│   ├── data_access.py             Supabase client with local JSON fallback
│   ├── hitl_sessions.py           in-memory pause/resume queues for HITL
│   └── agents/
│       ├── procurement_intelligence.py   requirements extraction + offer validation
│       ├── product_clustering.py         euclidean-distance clustering
│       ├── supplier_matching.py          BM25-style vendor scoring
│       ├── judging_agent.py              per-cluster Gemini verdict
│       ├── negotiation_agent.py          multi-round negotiation loop + waterfall
│       ├── negotiation/                  price / delivery / warranty / risk sub-agents
│       ├── human_escalation.py           escalation trigger logic
│       └── audit_summary.py              Gemini narrative summary
│
├── integrations/
│   ├── gemini_client.py           generate(prompt, *, system, temperature, json_mode)
│   ├── pioneer_client.py          message classification + field extraction
│   ├── tavily_client.py           external supplier/spec enrichment
│   ├── fal_client.py              visual deal card generation
│   └── fallback_outputs.py        static fallbacks for all external APIs
│
├── frontend/src/
│   ├── buyer/BuyerWorkspace.tsx   SSE streaming, agent network, HITL modals
│   ├── seller/SellerWorkspace.tsx live negotiation feed + inventory dashboard
│   ├── lib/stream.ts              EventSource client + HITL response helpers
│   ├── lib/types.ts               TypeScript types mirroring backend schemas
│   └── components/
│       ├── hero/AgentNetwork.tsx  React Flow agent graph (live node visibility)
│       ├── feed/ActivityFeed.tsx  real-time event feed with rejection variants
│       └── hero/nodes.tsx         seller chat nodes with per-node decide buttons
│
├── data/
│   ├── seller_registry.json       7 vendor profiles
│   ├── seller_inventory.json      35 products across 7 vendors
│   └── buyer_scenarios.json       5 demo request blueprints
│
└── tests/
    ├── test_hitl.py               HITL session + orchestrator integration tests
    ├── test_validation.py         deterministic constraint validation tests
    └── test_generalized_matching.py  product matching + clustering tests
```

---

## Key design decisions

**LLM vs deterministic split.** Gemini owns language — requirements extraction, negotiation dialogue, judging reasoning, audit narrative. Python owns every pass/fail decision — constraint validation, price floor enforcement, waterfall triggering, best-offer selection. No LLM call can override a hard constraint.

**Real-time parallel negotiation.** Three suppliers run in separate threads feeding a shared `queue.Queue`. The main thread drains the queue and yields each turn over SSE with a typing-delay sleep, so the buyer sees all three conversations filling in simultaneously.

**Single HITL gate.** There is exactly one human pause point — final approval after validation. Negotiation strategy is extracted from the buyer's request by Gemini (or defaults to `medium`). No modal interrupts the negotiation flow.

**10% seller price floor (deterministic).** The floor check runs before any Gemini call. If the buyer's offer would push below it, the seller rejects immediately with a templated message and the orchestrator waterfalls to the next supplier.

---

## Negotiation strategies

| Strategy | Rounds | Discount target | vs 10% floor |
|----------|--------|-----------------|--------------|
| `light` | 2 | 2% → 4% | Always accepted |
| `medium` | 3 | 3% → 8% | Always accepted |
| `aggressive` | 5 | 4% → 12%+ | Crosses floor at round 3 → rejected → waterfall |

---

## Environment variables

```bash
# Backend (.env)
DEMO_MODE=false          # true = replay; false = live LLM
LLM_API_KEY=             # Gemini API key
LLM_PROVIDER=gemini
PIONEER_API_KEY=
PIONEER_BASE_URL=
TAVILY_API_KEY=
FAL_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Frontend (frontend/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

The system runs fully offline with `DEMO_MODE=true` and no Supabase config.

---

## Supabase (seller Realtime dashboard)

Only one table is required. `seller_inventory` is served from the REST API — no Supabase table needed for it.

```sql
create table if not exists demo_sessions (
  id          uuid        primary key default gen_random_uuid(),
  session_id  text        unique not null,
  result      jsonb       not null,
  created_at  timestamptz default now()
);
alter publication supabase_realtime add table demo_sessions;
```

When a buyer run completes, `write_demo_session()` upserts the full `DemoResult` and the seller dashboard's Realtime subscription fires automatically.

---

## Tests

```bash
python -m pytest                          # all 17 tests
python -m pytest tests/test_hitl.py -v   # HITL + orchestrator
python -m pytest tests/ -k "matching"    # by keyword
```

---

## Research

Pactum's design draws on two papers:

**AgenticPay: A Multi-Agent LLM Negotiation System for Buyer–Seller Transactions**
Xianyang Liu, Shangding Gu, Dawn Song — UC Berkeley (2026)
[arXiv:2602.06008](https://arxiv.org/abs/2602.06008)
Introduces a benchmark and simulation framework for multi-agent buyer–seller negotiation driven by natural language, spanning bilateral bargaining to many-to-many markets. Informed our negotiation round structure, discount curve design, and the decision to benchmark frontier LLMs (Claude, GPT, Gemini) as negotiation policies.

**Magentic Marketplace: An Open-Source Environment for Studying Agentic Markets**
Gagan Bansal, Wenyue Hua, Zezhou Huang, Adam Fourney et al. — Microsoft Research (2025)
[arXiv:2510.25779](https://arxiv.org/abs/2510.25779)
An open-source environment for studying how LLM agents behave in agentic market settings — buying, selling, and coordinating through language. Informed our multi-agent orchestration architecture and the human-in-the-loop approval gate design.
