<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Frontend Overview (Phase 7)

Primary UI for the Pactum B2B procurement demo. Next.js 16 (Turbopack), TypeScript, Tailwind CSS v4, motion/react, @xyflow/react.

### Entry point

`src/app/page.tsx` — renders `LoginScreen` → routes by role to `BuyerWorkspace` or `SellerWorkspace`.

### Auth

Hardcoded demo roles in `src/components/auth/LoginScreen.tsx`:
- `buyer` / `123` → BuyerWorkspace (procurement flow)
- `seller` / `123` → SellerWorkspace (negotiation + inventory dashboard)
- `root` / `root` → root view

### Key data flows

**Buyer (streaming):**
`RequestForm` → `streamDemo()` (SSE) → `StrategyModal` (pauses for strategy) → negotiation turns in `ActivityFeed` → `DealComparisonModal` (pauses; buyer selects deal or rejects all) → `DecisionScreen`

**Buyer (non-streaming fallback):**
`RequestForm` → `runDemo()` (POST /api/run-demo) → `DemoResult` → `DecisionScreen`

**Seller:** on mount fetches `GET /api/inventory`; subscribes to Supabase Realtime `demo_sessions` table — updates live when a buyer run completes.

### Environment

`frontend/.env.local` (git-ignored, must exist):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=<from backend .env SUPABASE_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from backend .env SUPABASE_ANON_KEY>
```

### Run

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

### Key files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Root — login gate + role routing |
| `src/buyer/BuyerWorkspace.tsx` | Buyer procurement flow (GSAP + step machine) |
| `src/seller/SellerWorkspace.tsx` | Seller dashboard (inventory + live negotiation feed) |
| `src/lib/api.ts` | All REST calls: runDemo, getScenarios, getInventory, getSellerInventory |
| `src/lib/stream.ts` | SSE streaming client |
| `src/lib/supabase.ts` | Supabase JS client (conditional on env vars) |
| `src/lib/types.ts` | All TypeScript types — mirrors backend schemas |
| `src/lib/demoMachine.ts` | Stage definitions, STAGE_REVEALS, STAGE_DURATION_MS |
| `src/components/auth/LoginScreen.tsx` | Login UI |
| `src/components/screens/DecisionScreen.tsx` | Final result view |
| `src/components/modals/StrategyModal.tsx` | Strategy selection modal (fires before negotiations) |
| `src/components/modals/DealComparisonModal.tsx` | Deal comparison modal (fires after all negotiations; buyer picks deal) |
| `src/components/modals/EscalationModal.tsx` | Legacy escalation modal (kept for non-deal-comparison alerts) |
| `src/components/feed/ActivityFeed.tsx` | Live SSE event feed |
| `src/components/hero/AgentNetwork.tsx` | React Flow agent graph |
| `src/components/shell/TopBar.tsx` | App header |
| `src/components/shell/StageStrip.tsx` | Stage progress bar |

### Do not

- Do not change `DemoResult` key names — backend and multiple section components depend on them.
- Do not change `DealComparisonRow` field names — `DealComparisonModal` and the backend `comparison_table` builder depend on them.
- Do not add mock data to `SellerWorkspace` — it now reads from real API + Supabase.
- Do not skip `turbopack.root` in `next.config.ts` — without it Turbopack picks up the wrong root `package-lock.json` and CSS breaks.
- Do not add a second `human_alert` handler for deal comparison on top of the existing escalation handler — `deal_comparison` replaces the approval pause in the streaming path, not adds to it.
- `sendDealChoice` posts `action: "approve"` with `selected_seller_id`, or `action: "reject_all"` with no id. Do not reuse `sendHumanResponse` for this — it sends a different shape.
