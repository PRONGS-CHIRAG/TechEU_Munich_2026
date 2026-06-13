# Buyer Side Logic

The buyer workspace logic lives in this folder and depends on shared frontend contracts under `src/lib`.

## Entry Point

- `BuyerWorkspace.tsx` owns the buyer flow state: request entry, run status, visible agent nodes, negotiation chat lines, escalation decisions, and final review.
- The root app page imports `BuyerWorkspace` and renders it after a buyer login or when root switches to the buyer workspace.

## Shared Logic

- `src/lib/api.ts` runs the procurement demo from the buyer request.
- `src/lib/demoMachine.ts` defines the buyer flow stages, timing, and reveal rules.
- `src/lib/types.ts` defines the `DemoResult`, request, supplier, conversation, validation, escalation, and recommendation contracts.
- `src/lib/mockData.ts` provides fallback and demo data used by buyer-facing components.

## Buyer UI Components

- `src/components/input/RequestForm.tsx` collects the buyer request.
- `src/components/hero/AgentNetwork.tsx` visualizes the live buyer-agent-to-seller negotiation flow.
- `src/components/feed/ActivityFeed.tsx` mirrors negotiation and validation events.
- `src/components/modals/EscalationModal.tsx` handles buyer approval when escalation is required.
- `src/components/screens/DecisionScreen.tsx` displays the final buyer decision and recommendation.

Keep buyer-side changes aligned with `src/lib/types.ts` so backend responses and mock data remain interchangeable.
