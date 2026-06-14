# Pactum Pitch Context

## 1-Line Pitch

Pactum is a multi-agent B2B procurement negotiation layer that turns a messy buyer request into matched suppliers, live negotiations, validated offers, and a human-approved purchase recommendation.

## Short Pitch

Procurement teams waste time translating vague technical needs into supplier searches, comparing incompatible quotes, and negotiating across multiple vendors. Pactum automates the heavy middle of that workflow: it extracts requirements from natural language, matches only relevant sellers, runs parallel AI negotiations, validates offers against hard constraints, and gives the human buyer a clear recommendation with an audit trail.

## Value Proposition

Pactum helps B2B buyers move from request to trustworthy recommendation faster, without giving up control.

- Faster supplier discovery and quote comparison.
- Better technical fit through strict product-category matching and deterministic validation.
- Lower negotiation overhead through buyer and seller agents.
- Human approval remains mandatory for final risk, budget, and deal decisions.
- Transparent reasoning through live activity feed, candidate judging, validation table, and audit summary.
- Works for generalized procurement categories, not only one product demo.

## Target Customers

Primary customers:

- Procurement teams buying technical products.
- Mid-market and enterprise operations teams.
- IT, manufacturing, facilities, and engineering buyers.
- Technical sales teams and vendor marketplaces that need guided quote handling.

Ideal first use cases:

- Hardware procurement such as GPUs, laptops, servers, sensors, and workstations.
- Facilities procurement such as ergonomic chairs or industrial equipment.
- Complex purchases where specs, warranty, delivery, and budget all matter.

## Customer Pain

Traditional procurement often breaks down because buyer requests are unstructured, seller data is inconsistent, and quote comparison is manual. Buyers may ask for "a compact GPU under 650 euros" or "a laptop for engineering use", but procurement teams must translate that into exact constraints, find relevant suppliers, filter out wrong products, negotiate terms, and document why a decision was made.

Pactum reduces that work by coordinating specialist agents around the purchase while keeping humans in the decision loop.

## Product Positioning

Pactum is not a fully autonomous purchasing bot. It is a negotiation and decision-support layer for high-trust procurement.

The system is designed to:

- Understand messy human requests.
- Enforce strict product matching.
- Negotiate with the most aligned sellers.
- Validate hard constraints deterministically.
- Escalate uncertain or risky decisions to a human.
- Produce an explainable recommendation.

## Main Demo Story

1. A buyer enters a custom procurement request in natural language.
2. Pactum extracts structured requirements such as product type, budget, delivery deadline, warranty, and technical constraints.
3. The system searches internal seller inventory and only keeps products from the exact requested product family.
4. If no internal seller matches, Pactum falls back to Tavily enrichment to find external supplier candidates.
5. Product candidates are clustered by spec similarity.
6. A judging agent scores and explains candidate fit.
7. The system selects at most 3 most aligned sellers.
8. Buyer and seller agents negotiate in parallel using seller-specific negotiation styles.
9. The human buyer can accept a deal, reject a deal, or send a custom counter-message.
10. If the buyer accepts one deal, Pactum automatically rejects competing seller deals.
11. Pioneer labels seller messages and extracts offer fields.
12. Pactum validates offers against deterministic constraints.
13. The audit agent writes a final explanation and recommendation.
14. The buyer receives a final recommendation and visual deal card.

## Key Features Implemented

- Custom buyer prompt as the default entry point.
- Live FastAPI streaming over Server-Sent Events.
- Real-time activity feed in the Next.js frontend.
- Gemini-based requirement extraction from free text.
- Strict category-safe product matching.
- Product clustering across seller inventory.
- Candidate judging with natural-language reasoning.
- Parallel negotiation with up to 3 aligned sellers.
- Seller-specific negotiation styles.
- Human actions during negotiation: accept, reject, or send custom text.
- Automatic rejection of other seller deals after one deal is accepted.
- Pioneer classification and offer-field extraction.
- Deterministic validation for hard constraints.
- Tavily fallback when internal seller inventory has no exact match.
- fal visual procurement deal card generation with fallback image support.
- Audit summary explaining the final recommendation.
- Buyer, seller, and root demo login flows.
- Seller inventory view for inspecting product data.
- Replay mode for no-key demos and live mode for real LLM calls.

## Strict Matching Differentiator

Pactum is intentionally strict about product matching. If a buyer asks for a laptop, the system should only match sellers with actual laptops, not laptop sleeves, laptop docks, GPUs, cables, or loosely related accessories.

The same principle applies to other categories:

- GPU requests match actual GPUs, not HDMI/VGA cables or adapters.
- Chair requests match actual ergonomic or office chairs, not chair mats or cushions.
- Sensor requests match actual sensors, not sensor cables or brackets.
- Unknown product categories do not fall back to demo inventory.

If there is no exact internal match, Pactum uses Tavily to discover or enrich external supplier candidates instead of forcing a bad internal match.

## Workflow Explanation

### Buyer Request Workflow

The buyer starts with a natural-language request such as:

> We need a compact GPU for an AI workstation under 650 euros, with delivery within a week and warranty included.

Pactum extracts structured requirements:

- Product type.
- Product keywords.
- Use case.
- Budget.
- Delivery deadline.
- Warranty needs.
- Technical constraints.
- Extra constraints.

### Matching Workflow

The matching pipeline first filters products by exact product family. It then applies hard constraints like budget, delivery time, warranty, size, power, or product-specific fields. Only compatible products can produce matched sellers.

If the local inventory has no exact match, the internal match list remains empty and Tavily enrichment is used to populate external supplier candidates.

### Judging Workflow

The judging agent evaluates candidates and explains whether each one is good, borderline, or bad. This creates a human-readable bridge between raw product data and the final recommendation.

### Negotiation Workflow

The negotiation agent selects at most 3 of the most aligned sellers. It runs parallel negotiations using modular sub-agents:

- Price sub-agent.
- Delivery sub-agent.
- Warranty sub-agent.
- Risk sub-agent.

Seller messages are generated live and constrained by guardrails. The human can respond inline by accepting, rejecting, or sending a custom counter-message. If the user sends text, negotiation continues. If the user accepts a deal, all other seller deals are automatically rejected.

### Validation Workflow

Hard validation is deterministic and never delegated to an LLM. The system checks constraints such as:

- Price must be within budget.
- Delivery must be within requested deadline.
- Warranty must satisfy the minimum requirement.
- Length and power constraints must pass when present.
- Product-specific extra constraints must pass.

### Human-in-the-Loop Workflow

Pactum pauses when a decision needs human judgment, such as budget exceptions, competing final offers, or negotiation choices. The human stays responsible for final approval.

### Final Recommendation Workflow

The final recommendation combines:

- Best seller.
- Best product.
- Price.
- Delivery.
- Technical validation status.
- Risk level.
- Reasoning summary.
- Human approval requirement.
- Deal card image.
- Audit narrative.

## Technical Architecture

Frontend:

- Next.js application in `frontend/`.
- Real-time orchestration feed.
- Buyer workspace with request input and results.
- Seller inventory view.
- Deal comparison and human response modal.

Backend:

- FastAPI in `backend/api.py`.
- Orchestration logic in `backend/orchestrator.py`.
- Agent modules in `backend/agents/`.
- Typed schemas in `backend/schemas.py`.
- Local JSON inventory and registry in `data/`.

Core backend agents:

- Procurement Intelligence Agent.
- Product Clustering Agent.
- Supplier Matching Agent.
- Judging Agent.
- Negotiation Agent.
- Human Escalation Agent.
- Audit Summary Agent.

Integrations:

- Gemini for extraction, reasoning, negotiation dialogue, and audit summary.
- Pioneer for message classification, field extraction, and risk labels.
- Tavily for external supplier and product enrichment.
- fal for visual deal card generation.
- Supabase support exists, with local JSON fallback.

Transport:

- `GET /api/run-demo/stream` streams live events to the frontend.
- `POST /api/human-response` resumes negotiation after human input.
- `POST /api/run-demo` supports non-streaming fallback flows.

## Tools Used

- Python.
- FastAPI.
- Next.js.
- TypeScript.
- React.
- Server-Sent Events.
- Gemini / Google GenAI.
- Pioneer.
- Tavily.
- fal.
- Supabase.
- Streamlit legacy UI.
- Pytest.
- Aikido security scan notes.

## Why Multi-Agent

Procurement is not a single-step task. It requires interpreting needs, searching sellers, judging tradeoffs, negotiating terms, validating constraints, and explaining decisions. Pactum uses multiple agents because each part of the workflow has a different responsibility:

- Extraction agent understands buyer language.
- Matching agent protects category relevance.
- Judging agent explains tradeoffs.
- Negotiation agent handles seller conversations.
- Specialist sub-agents focus on price, delivery, warranty, and risk.
- Audit agent creates the final decision narrative.

This division makes the workflow easier to explain, inspect, and trust.

## Customer Value

For buyers:

- Less manual supplier searching.
- Fewer irrelevant quotes.
- Faster negotiation.
- Better confidence in technical fit.
- Clear explanation before approval.

For procurement leaders:

- Better process visibility.
- More consistent evaluation.
- Reduced time spent on repetitive vendor communication.
- More auditable purchasing decisions.

For sellers:

- More qualified buyer requests.
- Clearer requirement context.
- Faster negotiation cycles.

## Competitive Edge

Pactum combines live agentic workflow with deterministic procurement guardrails.

The key difference is that Pactum does not simply produce a chat answer. It runs a structured procurement pipeline:

- Extract.
- Match.
- Cluster.
- Judge.
- Negotiate.
- Validate.
- Escalate.
- Recommend.
- Audit.

This makes the output more trustworthy than a generic chatbot and more flexible than a static procurement form.

## Demo Proof Points

During a pitch, show:

- A custom buyer prompt, not only a saved scenario.
- The live activity feed updating step by step.
- Structured requirements extracted from natural language.
- Strict product matching behavior.
- Tavily fallback when no exact internal match exists.
- Up to 3 parallel seller negotiations.
- Human accept/reject/counter controls.
- Automatic rejection of non-selected deals after acceptance.
- Validation table with pass/fail constraints.
- Final recommendation and audit summary.
- Visual deal card.

## Example Pitch Narrative

Procurement teams are stuck between manual vendor management and generic AI chat. Pactum turns procurement into a coordinated agent workflow. A buyer writes what they need, Pactum extracts requirements, filters sellers strictly by product fit, negotiates with the top aligned sellers, validates every offer against hard constraints, and asks the human for final approval. The result is faster sourcing, fewer irrelevant quotes, and a recommendation the buyer can actually trust.

## Suggested Slide Outline

1. Problem: procurement is slow, manual, and error-prone.
2. Solution: Pactum, a multi-agent procurement negotiation layer.
3. Target customer: B2B procurement teams and technical buyers.
4. Demo workflow: request to recommendation.
5. Agent architecture: extraction, matching, judging, negotiation, validation, audit.
6. Differentiator: strict product matching plus deterministic validation.
7. Human control: approve, reject, counter, and final decision.
8. Technical stack: Next.js, FastAPI, Gemini, Pioneer, Tavily, fal.
9. Business value: faster sourcing, better fit, explainable decisions.
10. Vision: procurement operating system for complex technical buying.

## Vision

Pactum can evolve into a procurement operating layer where companies connect their internal catalogs, supplier networks, approval policies, and negotiation rules. The long-term opportunity is to make complex B2B buying faster, more transparent, and more reliable while keeping humans in control of final commercial decisions.
