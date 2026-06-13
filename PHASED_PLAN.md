# Pactum — Frontend UI Plan

## Status
- [x] Phase 1: Wizard Layout, Step State Machine, GSAP transitions — **DONE**
- [ ] Phase 2: Design System Reset + Live Agent Animations + In-Node Chat
- [ ] Phase 3: Decision Screen (Step 3)
- [ ] Phase 4: Escalation Modal

---

## Phase 1: Wizard Layout, Step State Machine & GSAP — ✅ COMPLETE
Already done: 3-step wizard in `page.tsx`, GSAP curtain-wipe transitions, step state machine, stage strip.

---

## Phase 2: Design System Reset + Dynamic Node Spawning + Live Canvas Chat
**Goal:** White/blue professional design. Nodes spawn dynamically one by one as the pipeline runs — nothing is hardcoded upfront. Every node shows its live agent conversation directly on the canvas in real time so you can watch what's happening.
**Effort:** ~3 hours
**Files:** `globals.css`, `nodes.tsx`, `AgentNetwork.tsx`, `page.tsx`, `ActivityFeed.tsx`

### 2A — Design System Reset (Atira reference: white + royal blue)
`globals.css` — replace CSS variables:
```
--bg:            #ffffff
--surface:       #f2f4f9    (light blue-gray section bg, like the reference screenshots)
--surface-2:     #e8eaf2
--text-1:        #111827
--text-2:        #4b5563
--text-3:        #9ca3af
--border:        #e4e7ec
--accent:        #2f6fed    (vivid royal blue, matches the badge/card blue in reference)
--accent-soft:   #eef3fd
--accent-border: #bfcffb
--radius-card:   16px
--radius-pill:   9999px
```

Component updates:
- **Section containers** → `bg: var(--surface)`, `border-radius: var(--radius-card)`, `padding: 28px`, subtle shadow
- **Pill badges** (stage labels, "LIVE") → `bg: var(--accent)`, white text, `border-radius: var(--radius-pill)`
- **ActivityFeed rows** → white bg, `border: 1px solid var(--border)`, `border-radius: var(--radius-pill)`, `padding: 14px 20px` — matches the accordion rows in reference
- **ReactFlow canvas** → white bg, dot grid `#d1d5db`, edges **dashed** by default, solid accent blue when active
- **Node cards** → white bg, `border-radius: 12px`, `border: 1px solid var(--border)`, accent blue left-stripe when active
- **TopBar** → white bg, `border-bottom: 1px solid var(--border)`, Pactum in `--accent` blue
- **Step 1 landing** → large bold sans-serif heading (not all-caps monospace), clean form card, section bg `var(--surface)`
- Typography: headings weight 700, body weight 400, drop `font-mono` from main UI labels

### 2B — Dynamic Node Spawning (no hardcoded nodes)
The canvas starts **empty** when Step 2 opens. Nodes appear one by one as stages progress:

| When | Node spawns |
|------|-------------|
| Stage 0 starts (intel) | `Request` node pops in |
| Stage 1 starts (match) | `Orchestrator` node pops in |
| Stage 2 starts (negotiate) | `BuyerAgent` node pops in, then seller nodes spawn **one by one** with 250ms stagger |
| Stage 2 mid | Edges animate in between BuyerAgent → each seller as they appear |

**Spawn animation:** each node fades in + slides up (`opacity: 0→1, y: 8→0`, 280ms ease-out). Use `motion/react` inside the node component wrapper — CSS transforms don't affect ReactFlow's layout measurement so this is safe.

**In `page.tsx`:** track `visibleNodeIds: Set<string>` state. Schedule reveals via `setTimeout`:
- At negotiate stage start: add `buyerAgent`, then add each `seller_id` with staggered delays
- Only nodes in `visibleNodeIds` are included in the `nodes` array passed to ReactFlow

**In `AgentNetwork.tsx`:** accept `visibleNodeIds: Set<string>` prop, filter the computed nodes array before returning to ReactFlow. Also filter edges so an edge only renders if BOTH its source and target are in `visibleNodeIds`.

**`fitView`** called each time a new node is added to keep the graph centered.

### 2C — Running Agent Animations
While a node's stage is active:
- **Pulsing ring**: `pulse-ring` CSS animation (already defined in `globals.css`) applied when `active === true`
- **OrchestratorNode**: animated status label updates per stage ("Extracting requirements…" → "Ranking suppliers…" → "Generating audit…")
- **BuyerAgentNode**: "Round N / 2" label animates in during negotiate stage
- **SellerNode**: all active sellers pulse; `activeSeller` gets the expanded chat panel (see 2D)
- **Done state**: ring becomes solid accent, pulsing stops, subtle checkmark appears

### 2D — Live In-Node Chat on the Canvas
This is the main "wow factor": as negotiation runs, chat messages stream inside each seller node **directly on the canvas** so you can watch the conversation happen in real time.

**Data flow:**
1. `page.tsx` tracks `nodeChatLines: Record<string, ConversationLog[]>` state (starts empty)
2. During the negotiate stage, a `setTimeout` per conversation log drips messages in one by one (~700ms between each), updating `nodeChatLines[seller_id]`
3. `page.tsx` passes `nodeChatLines` into `AgentNetwork`
4. `AgentNetwork` passes `chatLines: ConversationLog[]` into each SellerNode's `data`
5. SellerNode renders the chat inline in the canvas node

**Timing:** negotiate stage duration is computed dynamically:
```
negotiate duration = max(sellers.length × 250 + 600 + logs.length × 700, 3000)
```
This gives enough time for sellers to spawn then chat to drip in.

**SellerNode chat panel** (renders when `chatLines.length > 0`):
- Node width expands from 176px → 240px when chat appears
- Chat panel sits below the header row, `border-top: 1px solid var(--border)`, `max-h-[180px] overflow-y-auto`
- **Buyer messages**: left-aligned, small blue pill (`bg: var(--accent-soft)`, `color: var(--accent)`)
- **Seller messages**: right-aligned, surface-2 pill
- **Pioneer labels**: tiny `[LABEL]` badge below seller messages in `font-mono text-[9px] text-text-3`
- Each new message animates in: `opacity: 0→1, y: 4→0`, 200ms
- `fitView({ padding: 0.2, duration: 400 })` called after each expansion to keep graph visible

**Non-active sellers** during negotiate: show a shimmer "negotiating…" skeleton line — single animated gradient bar — no chat content.

---

## Phase 3: Decision Screen (Step 3)
**Goal:** Replace placeholder with a full decision screen — recommendation card, Approve/Reject, collapsible detail sections.
**Effort:** ~1.5 hours
**Files:** `frontend/src/components/screens/DecisionScreen.tsx` (new), `page.tsx`

Steps:
1. Create `DecisionScreen.tsx`
2. **Recommendation card** (top, full-width): white card, `var(--radius-card)`, left accent blue border stripe, large seller name + product headline, price badge (blue pill), delivery + warranty + compatibility chips
3. **Action row**: two large buttons — `[APPROVE]` (solid blue, `var(--accent)`) + `[REJECT]` (white, red border) — full-width on mobile, side-by-side on desktop; wired to `handleDecide`
4. On decision: GSAP `opacity + scale` transition to a confirmation banner (green for approve, red for reject); buttons disabled
5. **Three accordion sections** below recommendation card, pill/rounded row style (matching screenshot Skills list):
   - `Audit Summary`
   - `Supplier Comparison`
   - `Validation Results`
   - Each row: white bg, `border-radius: var(--radius-pill)`, blue `+` / `−` toggle button on right
   - Content expands with `motion.div` height animation
6. Replace Step 3 placeholder in `page.tsx` with `<DecisionScreen />`

---

## Phase 4: Escalation Modal
**Goal:** Mid-run escalation renders a modal over Step 2 when `phase === "awaiting_approval"`.
**Effort:** ~1 hour
**Files:** `page.tsx`, `frontend/src/components/modals/EscalationModal.tsx` (new)

Steps:
1. When `phase === "awaiting_approval"`, render `<EscalationModal>` overlay over Step 2
2. Modal: white card, `border-radius: var(--radius-card)`, centered, `max-w-[480px]`, `var(--shadow-md)`
   - Header: escalation reason in `text-text-1` weight 600
   - Body: `question_for_human` in `text-text-2`
   - Footer: `[APPROVE]` (blue solid) + `[REJECT]` (red outline) buttons
3. Backdrop: `bg-black/30 backdrop-blur-[3px]`
4. On decision: `handleDecide` → modal GSAP-exits (`opacity: 0, scale: 0.97`, 200ms) → "Review Results" button appears in Step 2 bottom bar
5. Modal enter animation: GSAP `opacity: 0→1, y: 8→0`, 250ms

---

## Design Reference Summary
Atira-style SaaS (from provided screenshots):
- **Background**: `#ffffff` pure white
- **Section cards**: `#f2f4f9` light blue-gray, `border-radius: 16px`
- **Accent blue**: `#2f6fed` vivid royal blue — used for pill badges, active states, CTA buttons, left-border stripes on cards
- **Dark contrast card**: `#1a1a1a` near-black (use for "AI-first" style callout blocks if needed)
- **Pill components**: `border-radius: 9999px` — badges, accordion rows, message bubbles
- **Graph edges**: dashed by default, solid accent when active
- **Typography**: clean sans-serif (Inter), bold display headings, regular body — no all-caps monospace on main UI
- **Elevation**: subtle `box-shadow: 0 1px 3px rgba(0,0,0,0.06)` on cards, no heavy shadows
