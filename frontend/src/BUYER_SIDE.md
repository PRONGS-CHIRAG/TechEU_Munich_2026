# Buyer Side Frontend Notes

The buyer side already has the information needed to start and display a procurement run.

## Source Data

- `lib/mockData.ts` defines the buyer company, default buyer request, structured requirements, matched suppliers, conversation logs, validation results, escalation state, and final recommendation.
- `lib/types.ts` defines the frontend contracts for `BuyerRequest`, `StructuredRequirements`, `ConversationLog`, `DemoResult`, and related result objects.
- `lib/supabase.ts` creates the browser Supabase client when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured.
- `lib/api.ts` sends buyer requests to the backend, but reads buyer scenarios from Supabase first and falls back to the backend API when Supabase is not configured or returns no usable result.

## Buyer-Facing UI

- `components/input/RequestForm.tsx` is the buyer request entry point on the homepage.
- `components/hero/AgentNetwork.tsx` renders the buyer agent inside the live negotiation flow.
- `components/sections/NegotiationThreads.tsx` shows buyer and seller messages after negotiation.
- `components/screens/DecisionScreen.tsx` presents the final buyer review and approval flow.

## Current Homepage Flow

1. The buyer starts from the default request or quick-fill scenarios.
2. Quick-fill scenarios are loaded from the `buyer_scenarios` Supabase table when frontend Supabase env vars are present.
3. The request is sent through `runDemo`.
4. The frontend renders extracted requirements, supplier matching, buyer/seller negotiation, validation, escalation, and final recommendation from the returned `DemoResult`.

Keep buyer-side changes aligned with the contracts in `lib/types.ts` so the mock data and backend response stay interchangeable.
