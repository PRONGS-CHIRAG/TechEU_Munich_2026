Here is the clean copy-paste **Markdown version**:

# Pactum: Multi-Agent B2B Procurement Negotiation Layer

## 1. Project Summary

**Pactum** is a multi-agent B2B procurement negotiation layer where a buyer company can request a technical product, and the system coordinates buyer agents, seller agents, specialist agents, and humans to reach a validated procurement recommendation.

The project is designed around the idea that the future of complex B2B transactions will involve **buyer and seller agents negotiating autonomously around technical and commercial requirements**, while involving humans only when judgment, approval, or risk handling is required.

The first version focuses on a controlled but realistic procurement demo: a buyer company wants to purchase a **GPU for an AI workstation**. The system extracts requirements, matches suppliers, negotiates with multiple sellers, validates offers technically, classifies negotiation messages using Pioneer, uses Tavily for supplier/spec enrichment, generates a visual deal card with fal, and secures the repo using Aikido.

---

## 2. One-Line Pitch

**Pactum is an orchestration layer for B2B procurement where buyer agents, seller agents, specialist agents, and humans coordinate to negotiate and validate technical purchases.**

---

## 3. Core Demo Scenario

A buyer company needs a GPU for an AI workstation.

The buyer enters a messy request:

> “We need a GPU for an AI workstation. It should fit inside our compact case, not consume too much power, stay under €650, arrive within a week, and include warranty.”

The system then:

1. Converts the request into structured requirements.
2. Finds relevant suppliers.
3. Starts negotiations with multiple seller agents.
4. Validates each seller offer against technical and commercial constraints.
5. Uses Pioneer to classify seller messages and extract offer fields.
6. Uses Tavily if more supplier information or missing specs are needed.
7. Escalates to a human when approval is required.
8. Generates a final audit summary and visual deal card.
9. Shows everything in a human approval dashboard.

---

## 4. Why This Fits the Challenge

The challenge is not about building a single agent that calls tools. It is about building the next layer: **coordination between agents and humans at organisational scale**.

Pactum directly fits this because it includes:

* Buyer-side agent
* Seller-side agents
* Multiple specialist agents
* Human-in-the-loop approval
* Multi-merchant negotiation
* Technical validation
* Auditability
* External search fallback
* Runtime inference
* Synthetic procurement data
* Security-aware implementation

This makes it more than a chatbot or tool-calling agent. It becomes a small but useful piece of an **agentic B2B transaction operating system**.

---

## 5. Version 1 Agent Architecture

```text
Human Buyer
   ↓
Frontend Dashboard
   ↓
Orchestrator
   ↓
Procurement Intelligence Agent
   ↓
Supplier Matching Agent
   ↓
Buyer Agent ↔ Seller Agents
   ↓
Pioneer Inference Layer
   ↓
Human Escalation Subagent
   ↓
Audit/Summary Subagent
   ↓
Human Approval Dashboard
```

---

## 6. Agent and Component Roles

### 6.1 Orchestrator

The orchestrator only coordinates the workflow.

It does **not** perform matching, validation, classification, summarization, or negotiation logic itself.

#### Responsibilities

* Receive buyer request from frontend
* Route tasks to the correct agent
* Maintain negotiation state
* Start seller conversations
* Trigger technical validation
* Trigger Pioneer inference
* Trigger Tavily fallback when needed
* Trigger human escalation
* Trigger audit summary generation
* Return final results to frontend

#### Why this matters

The orchestrator should act like a **control tower**. This keeps the architecture clean and shows that the system is truly modular.

---

### 6.2 Procurement Intelligence Agent

This is the main internal reasoning agent.

It combines:

* Requirement intake
* Technical validation
* Compatibility checking

#### A. Requirement Intake

It converts messy buyer input into structured procurement requirements.

Example output:

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

#### B. Technical Validation

It checks every seller offer against buyer requirements.

Example seller offer:

```json
{
  "seller_id": "vendor_a",
  "seller_name": "Vendor A",
  "product": "RTX 4080",
  "length_mm": 320,
  "power_watts": 320,
  "price_eur": 700,
  "delivery_days": 5,
  "warranty_years": 2
}
```

Validation result:

```json
{
  "seller_id": "vendor_a",
  "status": "rejected",
  "failed_constraints": [
    "GPU length exceeds 300 mm limit",
    "Power draw exceeds 250 W limit",
    "Price exceeds €650 budget"
  ],
  "next_action": "Ask seller for a smaller, lower-power, cheaper alternative"
}
```

#### Why this is important

This makes Pactum more than a negotiation chatbot. It proves that the system understands whether an offer is actually usable.

---

### 6.3 Supplier Matching Agent

This agent finds the best suppliers before negotiation begins.

#### Responsibilities

* Search seller registry
* Search seller inventory
* Rank suppliers by relevance
* Use product category matching
* Use keyword/BM25-style matching
* Optionally use tree/graph-style relationships
* Call Tavily when internal supplier data is insufficient

Example output:

```json
[
  {
    "seller_id": "vendor_b",
    "seller_name": "Vendor B",
    "match_score": 0.91,
    "reason": "Has compact GPUs under 300 mm with fast delivery"
  },
  {
    "seller_id": "vendor_a",
    "seller_name": "Vendor A",
    "match_score": 0.76,
    "reason": "Strong GPU inventory, but some products may exceed size limits"
  },
  {
    "seller_id": "vendor_c",
    "seller_name": "Vendor C",
    "match_score": 0.69,
    "reason": "Fast delivery but usually higher pricing"
  }
]
```

#### Why this is important

The orchestrator should not randomly contact sellers. The Supplier Matching Agent creates a ranked shortlist of relevant vendors.

---

### 6.4 Buyer Agent

The Buyer Agent negotiates on behalf of the buyer company.

#### Responsibilities

* Send safe requirement summaries to sellers
* Ask technical follow-up questions
* Request alternative products
* Negotiate price
* Ask for warranty or delivery improvements
* Use validation feedback from the Procurement Intelligence Agent
* Stop when a good offer is found or escalation is needed

Example message:

> “This product is technically compatible, but the price is above the buyer’s target. Can you offer €650 including delivery?”

---

### 6.5 Seller Agents

Each Seller Agent represents one supplier.

#### Responsibilities

* Search own inventory
* Recommend products
* Answer buyer questions
* Adjust price or terms
* Suggest alternatives
* Provide final quote

Demo sellers:

| Seller   | Demo Purpose                                    |
| -------- | ----------------------------------------------- |
| Vendor A | Offers powerful but technically invalid product |
| Vendor B | Offers best compatible product                  |
| Vendor C | Offers compatible but expensive product         |

---

### 6.6 Pioneer Synthetic Data and Inference Layer

Pioneer is used in two ways:

1. Synthetic data generation
2. Runtime inference

---

#### A. Synthetic Data Generation

Pioneer helps generate realistic synthetic B2B procurement data when real data is unavailable.

Synthetic data includes:

* Buyer profiles
* Seller profiles
* Inventory data
* Negotiation messages
* Edge cases
* Labeled inference examples

Example buyer profile:

```json
{
  "buyer_company": "NovaCompute GmbH",
  "industry": "AI infrastructure",
  "purchase_need": "GPU for AI workstation",
  "budget_eur": 650,
  "technical_constraints": {
    "max_length_mm": 300,
    "max_power_watts": 250,
    "delivery_days": 7
  }
}
```

Example seller profile:

```json
{
  "seller_id": "vendor_b",
  "seller_name": "Vendor B",
  "specialization": "workstation components",
  "region": "Germany",
  "reliability_score": 0.88,
  "negotiation_style": "cooperative"
}
```

Example inventory item:

```json
{
  "seller_id": "vendor_b",
  "product": "RTX 4070 Super Compact",
  "length_mm": 267,
  "power_watts": 220,
  "price_eur": 670,
  "delivery_days": 5,
  "warranty_years": 2,
  "availability": "in_stock"
}
```

---

#### B. Runtime Inference

Pioneer also classifies seller messages during negotiation.

Classes:

* Technical information
* Price concession
* Delivery condition
* Warranty issue
* Missing information
* Risk signal
* Final offer

Example:

```json
{
  "message": "We can reduce to €650, but warranty is only 6 months.",
  "labels": ["price_concession", "warranty_risk"],
  "risk_level": "medium",
  "extracted_fields": {
    "price_eur": 650,
    "warranty_months": 6
  }
}
```

#### Important Design Rule

Pioneer should support inference, classification, and extraction.

Hard technical validation should remain deterministic.

For example:

```text
length_mm <= max_length_mm
power_watts <= max_power_watts
price_eur <= budget_eur
delivery_days <= max_delivery_days
warranty_years >= minimum_warranty_years
```

This makes the system more reliable.

---

### 6.7 Human Escalation Subagent

This subagent decides when the human buyer must be involved.

#### Escalation Triggers

Escalate when:

* Final approval is required
* Best offer is above budget
* Warranty is weak
* Missing specs remain unresolved
* Seller asks for sensitive information
* No supplier fully matches
* Two offers are very close
* Pioneer detects a risk signal
* Negotiation reaches maximum rounds

Example:

```json
{
  "escalate": true,
  "reason": "Best technically valid offer is €30 above budget",
  "question_for_human": "Do you approve exceeding the budget by €30 for faster delivery?"
}
```

#### Why this matters

This keeps the human in control. It also makes the system more realistic for B2B procurement, where agents should recommend, not blindly finalize deals.

---

### 6.8 Audit/Summary Subagent

This subagent creates a final human-readable report.

#### It Summarizes

* Buyer requirements
* Suppliers contacted
* Seller offers
* Negotiation steps
* Pioneer classifications
* Technical validation results
* Rejected offers and reasons
* Recommended supplier
* Remaining risks
* Human approval question

Example summary:

```text
Three suppliers were contacted.

Vendor A offered an RTX 4080 at €700. The offer was rejected because the GPU exceeded the buyer’s maximum size and power constraints.

Vendor B offered an RTX 4070 Super Compact at €650 with 5-day delivery and 2-year warranty. This offer passed all technical checks and stayed within budget.

Vendor C offered an RTX 4070 Ti at €690 with 3-day delivery. It passed technical validation but exceeded the buyer’s budget.

Recommended supplier: Vendor B.
Reason: Best balance of compatibility, price, delivery, warranty, and risk.
```

---

## 7. Side Track Integration

### 7.1 Pioneer

Pioneer is used for:

1. Synthetic data generation
2. Runtime inference

#### Synthetic Data

* Buyer scenarios
* Seller profiles
* Seller inventories
* Negotiation examples
* Edge cases

#### Runtime Inference

* Message classification
* Offer field extraction
* Risk detection
* Negotiation intent classification
* Next-action support

#### Demo Moment

Show seller messages with Pioneer labels:

```text
Seller: “We can reduce the price to €650 if delivery next week is acceptable.”
Pioneer labels: price_concession + delivery_condition
Risk level: low
```

---

### 7.2 Tavily Search

Tavily is used inside the Supplier Matching Agent.

#### Use Cases

* External supplier discovery
* Product spec lookup
* Missing data enrichment
* Price benchmarking
* Fallback when internal registry has too few matches

#### Demo Moment

> “Internal supplier registry found only one compatible seller. Tavily was triggered to search external sources and enrich product specs.”

---

### 7.3 fal

fal is used to generate a final visual procurement deal card.

#### Card Contents

* Recommended vendor
* Product
* Price
* Delivery time
* Compatibility status
* Risk level
* Approval status

Example card content:

```text
Recommended Vendor: Vendor B
Product: RTX 4070 Super Compact
Price: €650
Delivery: 5 days
Compatibility: Passed
Risk: Low
Status: Awaiting human approval
```

#### Demo Moment

At the end, the human buyer sees a polished procurement summary card.

---

### 7.4 Aikido

Aikido is used for the security side track.

#### Use Cases

* Dependency vulnerability scan
* Security check before demo
* No hardcoded secrets
* Secure-by-design story

#### Demo Message

> “Because Pactum handles internal procurement specifications and supplier negotiation data, we used Aikido to scan our codebase and reduce security risk.”

---

## 8. Tech Stack

### Frontend

Recommended:

```text
Streamlit
```

Reason:

* Fast to build
* Good for dashboards
* Easy integration with Python backend
* Suitable for hackathon demo

Frontend sections:

* Buyer request input
* Structured requirements panel
* Supplier match results
* Negotiation timeline
* Pioneer inference labels
* Technical validation table
* Human escalation panel
* Final audit summary
* fal deal card
* Approval buttons

---

### Backend

Recommended:

```text
Python
```

Use simple Python modules/classes first.

Optional:

```text
FastAPI
```

Only use FastAPI if the team has enough time. For an 18-hour build, Streamlit + Python modules is faster.

---

### Agent Layer

Recommended:

```text
Custom Python agent classes
```

Optional:

```text
LangGraph
```

LangGraph is good for stateful workflows, but for 18 hours, custom classes may be safer and faster.

---

### Data Layer

Use JSON files:

```text
buyer_scenarios.json
seller_registry.json
seller_inventory.json
synthetic_negotiations.json
conversation_logs.json
final_summary.json
```

---

### Matching

Use:

* Keyword matching
* BM25-style scoring
* Product category tree
* Optional Tavily fallback

---

### Security

Use:

* `.env`
* `.env.example`
* No hardcoded API keys
* Aikido scan
* Fallback demo mode

---

## 9. Team Division

### Developer 1: Phillip

#### Role

UI/UX and Frontend

#### Branch

```text
feature/frontend-dashboard
```

#### Owns

* Streamlit app
* UI layout
* Buyer input screen
* Agent workflow visualization
* Supplier comparison cards
* Negotiation timeline
* Pioneer inference display
* Human escalation panel
* Final approval dashboard
* fal deal card display

#### Success Condition

A judge can understand the whole product by looking at the dashboard.

---

### Developer 2

#### Role

Core backend and agent orchestration

#### Branch

```text
feature/orchestrator-agents
```

#### Owns

* Orchestrator
* Procurement Intelligence Agent
* Supplier Matching Agent
* Buyer Agent
* Seller Agents
* Human Escalation Subagent
* Audit/Summary Subagent
* End-to-end negotiation loop

#### Success Condition

The system can run from buyer request to final recommendation.

---

### Developer 3

#### Role

Integrations, synthetic data, and side tracks

#### Branch

```text
feature/integrations-data
```

#### Owns

* Pioneer synthetic data generation
* Pioneer runtime inference
* Tavily search integration
* fal deal card generation
* Aikido security scan
* Synthetic JSON datasets
* Fallback outputs

#### Success Condition

All side tracks are visibly integrated and reliable during the demo.

---

## 10. Git Branch Strategy

### Main Branches

```text
main
staging-demo
```

### Feature Branches

```text
feature/frontend-dashboard
feature/orchestrator-agents
feature/integrations-data
```

### Merge Strategy

1. Each developer works on their own feature branch.
2. Integrate into `staging-demo`.
3. Test the full demo on `staging-demo`.
4. Merge stable version into `main`.
5. Final demo runs from `main`.

---

## 11. Shared Data Contracts

All developers should agree on these formats before coding.

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

---

## 12. Recommended Repo Structure

```text
pactum/
│
├── streamlit_app.py
├── README.md
├── requirements.txt
├── .env.example
│
├── backend/
│   ├── orchestrator.py
│   ├── schemas.py
│   └── agents/
│       ├── procurement_intelligence.py
│       ├── supplier_matching.py
│       ├── buyer_agent.py
│       ├── seller_agent.py
│       ├── human_escalation.py
│       └── audit_summary.py
│
├── integrations/
│   ├── pioneer_client.py
│   ├── tavily_client.py
│   ├── fal_client.py
│   └── fallback_outputs.py
│
├── data/
│   ├── buyer_scenarios.json
│   ├── seller_registry.json
│   ├── seller_inventory.json
│   ├── synthetic_negotiations.json
│   └── tavily_fallback_results.json
│
├── assets/
│   ├── fal_deal_card.png
│   └── screenshots/
│
└── security/
    └── aikido_notes.md
```

---

## 13. 18-Hour Implementation Plan

### Hour 0–1: Alignment and Setup

#### All Developers

Tasks:

* Confirm name: Pactum or Nexum
* Confirm demo scenario: GPU procurement for AI workstation
* Confirm 3-developer ownership
* Create GitHub repo
* Create branches
* Finalize JSON contracts
* Create basic folder structure
* Add `.env.example`
* Add `requirements.txt`
* Decide on Streamlit + Python modules

Output by end of hour 1:

```text
Repo created
Branches created
Contracts agreed
Folder structure ready
Demo scenario locked
```

---

### Hour 1–3: Parallel Build Block 1

#### Phillip: Frontend Skeleton

Branch:

```text
feature/frontend-dashboard
```

Tasks:

* Create Streamlit layout
* Add buyer request input form
* Add placeholder structured requirements panel
* Add placeholder supplier matching panel
* Add placeholder negotiation timeline
* Add placeholder validation table
* Add placeholder Pioneer labels
* Add placeholder final recommendation card
* Add placeholder human approval buttons

Phillip should use mock JSON data and not wait for the backend.

---

#### Developer 2: Core Agent Skeleton

Branch:

```text
feature/orchestrator-agents
```

Tasks:

Create:

```text
backend/orchestrator.py
backend/agents/procurement_intelligence.py
backend/agents/supplier_matching.py
backend/agents/buyer_agent.py
backend/agents/seller_agent.py
backend/agents/human_escalation.py
backend/agents/audit_summary.py
```

Implement basic functions:

```python
extract_requirements(raw_request)
match_suppliers(requirements, seller_inventory)
validate_offer(requirements, offer)
run_negotiation(requirements, sellers)
check_escalation(final_result)
generate_summary(logs)
```

Focus on deterministic logic first.

---

#### Developer 3: Synthetic Data and Integration Stubs

Branch:

```text
feature/integrations-data
```

Tasks:

Create synthetic data:

* 3 buyer scenarios
* 5 seller profiles
* 20–30 products
* 10–20 negotiation examples
* 5 edge cases

Create integration wrappers:

```python
generate_synthetic_data_with_pioneer()
classify_message_with_pioneer()
search_external_supplier_with_tavily()
generate_deal_card_with_fal()
```

At this stage, wrappers can return mocked outputs.

---

### Hour 3–5: Parallel Build Block 2

#### Phillip

Tasks:

* Connect UI to mock output files
* Display JSON as readable cards/tables
* Add visual status labels:

  * Passed
  * Rejected
  * Negotiating
  * Escalated
  * Recommended
* Create clean dashboard flow:

  * Request
  * Match
  * Negotiate
  * Validate
  * Escalate
  * Approve

---

#### Developer 2

Tasks:

* Implement local negotiation loop
* Connect Supplier Matching Agent to synthetic seller data
* Validate seller offers
* Generate conversation logs
* Generate final recommendation
* Limit negotiation to 2–3 rounds

Core flow:

```text
Buyer request
→ Extract requirements
→ Match suppliers
→ Contact seller agents
→ Receive offers
→ Validate offers
→ Ask for alternative/discount if needed
→ Select best offer
→ Escalate to human
→ Generate summary
```

---

#### Developer 3

Tasks:

* Improve synthetic data quality
* Add Pioneer runtime inference wrapper
* Add Tavily wrapper
* Add fal wrapper
* Prepare fallback responses for each API

Pioneer inference classes:

```text
technical_info
price_concession
delivery_condition
warranty_risk
missing_information
risk_signal
final_offer
```

---

### Hour 5–7: First Integration Merge

#### Merge Order

1. Merge Developer 3’s data files into `staging-demo`.
2. Merge Developer 2’s backend into `staging-demo`.
3. Merge Phillip’s frontend into `staging-demo`.
4. Connect frontend to backend output object.

Minimum working demo by hour 7:

```text
Buyer request
→ Structured requirements
→ Matched sellers
→ Validation table
→ Final recommendation
```

Negotiation can still be partially mocked, but the flow should be visible.

---

### Hour 7–10: Parallel Build Block 3

#### Phillip

Tasks:

* Improve UI design
* Add “Start Negotiation” button
* Add multi-seller cards
* Add negotiation timeline per seller
* Add Pioneer label display
* Add validation table
* Add human escalation panel
* Add final approval screen
* Add placeholder for fal deal card

Important dashboard sections:

```text
1. Buyer Request
2. Extracted Requirements
3. Matched Suppliers
4. Seller Negotiations
5. Pioneer Inference
6. Technical Validation
7. Human Escalation
8. Final Recommendation
9. Deal Card
```

---

#### Developer 2

Tasks:

* Improve orchestrator flow
* Add conversation logs per seller
* Add validation after every seller response
* Add simple parallel seller handling
* Add human escalation triggers
* Add final audit summary
* Return one clean object to frontend:

```python
run_demo(request) -> demo_result
```

The `demo_result` should contain:

```text
structured_requirements
matched_suppliers
conversation_logs
pioneer_labels
validation_results
escalation_result
audit_summary
final_recommendation
```

---

#### Developer 3

Tasks:

* Connect Pioneer inference to seller messages
* Connect Tavily fallback to Supplier Matching Agent
* Generate fal deal card from final recommendation
* Run Aikido scan or prepare scan notes
* Create fallback outputs for all external APIs

Priority:

1. Pioneer inference
2. Tavily fallback
3. fal deal card
4. Aikido scan

---

### Hour 10–12: Second Integration Merge

Merge into:

```text
staging-demo
```

Test full flow:

1. Open app.
2. Enter buyer request.
3. Start negotiation.
4. See extracted requirements.
5. See matched sellers.
6. See negotiations.
7. See Pioneer labels.
8. See validation results.
9. See human escalation.
10. See final audit summary.
11. See fal deal card.
12. Approve final recommendation.

After successful test:

```text
staging-demo → main
```

---

### Hour 12–14: Side Track Completion

#### Pioneer Completion

Show clearly:

* Synthetic buyer/seller data was generated or supported through Pioneer.
* Runtime inference classifies seller messages.
* Extracted fields are shown in the UI.
* Risk labels are shown in the UI.

Example UI display:

```text
Seller message:
“We can reduce to €650, but warranty is only 6 months.”

Pioneer labels:
price_concession + warranty_risk

Extracted fields:
price = €650
warranty = 6 months
risk = medium
```

---

#### Tavily Completion

Show clearly:

* Tavily is triggered when internal supplier data is insufficient.
* Tavily enriches product specs or external supplier information.

Example UI display:

```text
External supplier search triggered.
Reason: Only one internal vendor passed initial matching.
Tavily result: Found external benchmark/spec data for RTX 4070 Super Compact.
```

---

#### fal Completion

Show clearly:

* fal generates a visual procurement summary card.

Example card content:

```text
Recommended Vendor: Vendor B
Product: RTX 4070 Super Compact
Price: €650
Delivery: 5 days
Compatibility: Passed
Risk: Low
Status: Awaiting approval
```

---

#### Aikido Completion

Show clearly:

* Aikido was used for dependency/security scan.
* No hardcoded secrets.
* `.env.example` is used.
* Security matters because the system handles confidential procurement data.

---

### Hour 14–16: Polish and Reliability

#### All Developers

Tasks:

* Fix bugs
* Make demo deterministic
* Add `DEMO_MODE = True`
* Add fallback data
* Add loading states
* Improve UI text
* Clean README
* Add screenshots
* Save fal card fallback
* Save Tavily fallback result
* Save Pioneer fallback labels
* Save Aikido screenshot/note

#### Demo Mode

In demo mode:

* Pioneer can return saved labels
* Tavily can return saved result
* fal can return saved image
* Negotiation can use pre-generated logs

This protects the final presentation from API failure.

---

### Hour 16–17: Pitch Preparation

#### Pitch Structure

##### 1. Problem

B2B procurement is slow because buyers and sellers manually exchange technical specs, pricing, delivery constraints, and clarifications across many emails and calls.

##### 2. Solution

Pactum coordinates buyer agents, seller agents, specialist agents, and humans to negotiate and validate procurement offers.

##### 3. Demo

A buyer requests a GPU for an AI workstation. The system structures the request, matches suppliers, negotiates with seller agents, validates offers, classifies messages with Pioneer, and escalates the final recommendation to a human.

##### 4. Standout Feature

The system does not only negotiate price. It validates whether offers actually satisfy technical and commercial requirements.

##### 5. Side Tracks

* Pioneer: synthetic data + runtime inference
* Tavily: external supplier/spec search
* fal: final deal card
* Aikido: security scan

##### 6. Closing

Pactum is not a single agent calling tools. It is a modular orchestration layer for multi-agent, human-in-the-loop B2B procurement.

---

### Hour 17–18: Final Testing and Backup

Checklist:

* `main` branch runs locally
* Streamlit app launches
* Demo mode works
* Pioneer fallback works
* Tavily fallback works
* fal fallback card exists
* Aikido note/screenshot exists
* README is clear
* `.env.example` exists
* No hardcoded secrets
* Final pitch rehearsed
* Screenshots saved
* Backup static flow ready

---

## 14. Final Demo Flow

The demo should follow this story:

1. Human buyer enters a messy procurement request.
2. Procurement Intelligence Agent extracts structured requirements.
3. Supplier Matching Agent ranks relevant vendors.
4. Buyer Agent starts negotiations with seller agents.
5. Seller agents provide offers.
6. Pioneer classifies seller messages and extracts fields.
7. Procurement Intelligence Agent validates offers.
8. Tavily enriches missing supplier/spec data if needed.
9. Human Escalation Subagent flags approval decision.
10. Audit/Summary Subagent generates final report.
11. fal generates a visual procurement deal card.
12. Human approves or rejects the recommendation.

---

## 15. Final Pitch Script

### Opening

B2B procurement is still slow and manual. Buyers and sellers exchange technical requirements, price constraints, delivery conditions, and warranty details through long email chains. This becomes even harder when multiple suppliers are involved.

Pactum is our answer to that problem.

### What Pactum Does

Pactum is a multi-agent procurement orchestration layer. A buyer agent negotiates with multiple seller agents, while specialist agents handle requirement extraction, supplier matching, technical validation, inference, human escalation, and audit summaries.

### Demo Example

In our demo, a company wants to buy a GPU for an AI workstation. The buyer enters a natural-language request. Pactum converts it into structured requirements such as maximum GPU length, power limit, budget, delivery deadline, and warranty requirement.

The Supplier Matching Agent then finds relevant sellers. The Buyer Agent negotiates with multiple Seller Agents. Each offer is checked by the Procurement Intelligence Agent to ensure it actually satisfies the buyer’s technical and commercial requirements.

### Pioneer

We used Pioneer in two ways. First, to generate realistic synthetic buyer, seller, inventory, and negotiation data. Second, as a runtime inference layer that classifies seller messages, extracts offer fields, detects risks, and supports next-action decisions.

### Tavily

We used Tavily as an external supplier discovery and product-spec enrichment layer when internal seller data is incomplete.

### fal

We used fal to generate a visual procurement deal card summarizing the recommended offer for the human buyer.

### Aikido

Because procurement agents may handle confidential internal specifications and commercial terms, we used Aikido to scan the codebase and support secure development.

### Closing

The key idea is that Pactum is not just one agent calling tools. It is an orchestration layer where agents and humans work together to complete a complex B2B transaction.

---

## 16. Standout Feature

### Technical Validation Before Recommendation

The strongest standout feature is:

> Pactum does not simply negotiate with sellers. It validates whether each offer actually fits the buyer’s technical and commercial constraints before recommending it to a human.

A simple agent may recommend the cheapest option. Pactum can explain:

> Vendor A was rejected because the GPU was too large and exceeded power constraints. Vendor C was valid but above budget. Vendor B is recommended because it passed all technical checks, stayed within budget, and offered acceptable delivery and warranty.

This makes the system useful for real B2B procurement.

---

## 17. Success Criteria

By the end of the hackathon, the project should show:

* Working frontend dashboard
* Buyer request intake
* Structured requirement extraction
* Supplier matching
* Multi-seller negotiation
* Technical validation
* Pioneer inference labels
* Tavily fallback result
* Human escalation panel
* Audit summary
* fal visual deal card
* Aikido security note
* Stable demo mode

---

## 18. Final Positioning

**Pactum is a lean but realistic first version of an agentic B2B procurement operating layer.**

The orchestrator only coordinates. Specialist agents perform the actual work. Pioneer enables synthetic data and inference. Tavily adds external supplier intelligence. fal creates a polished human approval artifact. Aikido supports security. Phillip owns the frontend experience, while the other two developers build orchestration and integrations in parallel branches before merging into a stable final demo.
