# Amazon Products Dataset 2023 → Supabase Ingestion Plan (Pactum)

**Status:** Plan only (no code). Target: implementable in 1–2 days, correct over all 1.4M rows.
**Author context:** senior data engineer. Reader: the developer implementing it.

---

## 0. The one decision that makes this feasible: tiered processing

The brief contains a built-in contradiction — "process all 1.4M rows" + "Pioneer classifies each product" + "Gemini infers missing fields" + "not 1.4M individual calls" + "1–2 days." You cannot run an ML inference service over 1.4M rows in a hackathon. The whole pipeline resolves into **three tiers**, and the LLM/ML work is *additive enrichment on top of a deterministic baseline that covers 100% of rows*:

| Tier | Rows | Work | Tooling | API calls | Wall time |
|------|------|------|---------|-----------|-----------|
| **Tier 0 — deterministic baseline** | **All ~1.4M** (after dedup/filter, ~1.1–1.3M) | dedup, null handling, USD→EUR, `categoryName`→Pactum category map, keyword extraction from title, category-default delivery/warranty/dims, availability inference, vendor assignment | pandas + psycopg2 `COPY` | **0** | 15–40 min |
| **Tier 1 — LLM/ML enrichment** | **~30k–50k prioritized** | Pioneer spec-tag extraction + Gemini missing-field inference (overwrites Tier-0 category defaults where confident) | Pioneer `/classify`, Gemini batched | Pioneer ~30k–50k, Gemini ~750–1,250 | 1–3 h |
| **Tier 2 — demo-curated** | **~200–500 hand/agent-vetted** | the products actually surfaced to negotiation; highest enrichment quality, manual spot-check | reuse Tier-1 output, flag `is_demo_curated` | 0 | minutes |

Why this works and the alternative does not:
- `categoryName` **already exists** in the Kaggle CSV. We map it deterministically — we do **not** ask Pioneer to re-derive category on 1.4M titles. Pioneer is reserved for spec-tag extraction and ambiguous rows on the Tier-1 subset.
- Gemini batched at ~40 products/call → enriching 50k rows ≈ **1,250 calls** (~10–20 min at modest concurrency, a few dollars). Doing all 1.4M would be ~35,000 calls — that blows time *and* cost. **That is the line; do not cross it.**
- Every row gets a usable record from Tier 0. The category-default fallback table (Section 5) is what makes "all rows processed" true without "all rows LLM'd."

Everything below assumes this tiering.

---

## 1. Dataset download and inspection

### 1.1 Acquire
- Source: Kaggle `asaniczka/amazon-products-dataset-2023-1-4m-products` (CSV, ~1.4M rows, several hundred MB uncompressed).
- Use the Kaggle CLI: configure `~/.kaggle/kaggle.json`, then `kaggle datasets download -d <slug>`, unzip into `data/raw/amazon_products_2023.csv`. Add `data/raw/` to `.gitignore` (the file is far too large to commit).
- Record the download date — needed for the frozen USD→EUR rate (Section 6) and provenance.

### 1.2 Inspect before transforming (do not skip — this is 30 min that saves a day)
Run a profiling pass (pandas `read_csv(..., nrows=200_000)` sample first, then full with `dtype` overrides + `usecols`):
1. **Confirm column names** match the brief: `asin, title, imgUrl, productURL, stars, reviews, price, listPrice, category_id, isBestSeller, boughtInLastMonth, categoryName`. Column names in this dataset have changed across versions — verify exact spelling/casing before writing the mapper.
2. **Null rates per column** — especially `price` (expect 10–25% null), `title`, `categoryName`, `stars`.
3. **`categoryName` cardinality** — list the distinct values and their row counts (`value_counts()`). This list drives the deterministic category map in Section 5. Expect a few hundred category strings; the top ~50 cover the vast majority of rows.
4. **`asin` uniqueness** — count duplicates; `asin` is the natural primary key.
5. **Price distribution** — min/max/percentiles to detect spam ($0.01, $99,999) and decide outlier cutoffs.
6. **Encoding / delimiter sanity** — confirm UTF-8 and proper quoting; titles contain commas and quotes.

Deliverable of this step: a short `inspection_notes.md` with the category histogram and null rates. The category histogram is a hard input to Section 5 and Section 2.

---

## 2. Vendor / seller construction

**Decision (one approach, committed): brand-grouped-within-category, capped at top-N by review volume, then synthetically assign negotiation fields.** Rationale below; the alternatives (pure top-sellers, fictional-per-category, group-by-category-only) are rejected because they either produce too few vendors for variety or lose the brand signal that makes the demo look real.

### 2.1 How vendors are derived
1. The Kaggle data has no brand column. Derive a pseudo-brand by taking the **first 1–2 tokens of `title`** (cleaned), OR group by `categoryName` when title-brand extraction is unreliable. (Title-prefix brand is noisy but adequate for a demo; flag this as a known limitation.)
2. Within each Pactum category (Section 5 map), take the **top vendors by summed `reviews` / `boughtInLastMonth`**, capped so the total vendor count is manageable.
3. **Target vendor count: ~150–250 total.** Enough that any demo category has 5–15 vendors (negotiation needs ≥3 candidates per category for the waterfall in `negotiation_agent.py`), small enough that `seller_registry` stays human-inspectable and the seller dashboard isn't overwhelmed. Keep the original hand-authored `vendor_a … vendor_g` as reserved IDs so existing fixtures/tests still resolve.
4. Each product row is assigned a `seller_id` deterministically: hash/lookup of its (category, pseudo-brand) → the vendor that bucket maps to. Every product gets exactly one vendor.

### 2.2 Synthesizing the B2B fields Amazon lacks
The negotiation and matching agents consume `negotiation_style`, `reliability_score`, `specialization`, `region`, `profile`. Amazon has none. Assign them **deterministically but varied** (seed off `seller_id` hash so re-runs are stable):
- `specialization` ← dominant Pactum category for that vendor's products (e.g. "GPUs", "office seating").
- `reliability_score` (0–1) ← normalized function of the vendor's avg `stars` and total `reviews` (real signal! avg_stars/5 blended with a review-count confidence factor). This is the one field we can ground in real data — do it.
- `negotiation_style` ← deterministic round-robin / hash over the five allowed values (`aggressive | cooperative | flexible | rigid | formal`) so the demo shows variety. Optionally bias: low reliability → `rigid`/`aggressive`, high → `cooperative`/`flexible`.
- `region` ← weighted random from an EU-centric set (Germany, Netherlands, France, …) seeded by hash; the demo is EU-procurement framed.
- `profile` jsonb ← `{headquarters, founded_year (random 2005–2020), typical_customers, notes}` templated per specialization.

Output shape per vendor matches the existing `data/seller_registry.json` exactly (verified against the live file) so `write_demo_session()`'s registry-enrichment step and the frontend `MatchedSupplier` type keep working unchanged.

---

## 3. Product filtering and prioritization

### 3.1 Rows to SKIP (drop before ingestion)
- **Missing `asin`** (cannot key) or **missing/blank `title`** → drop.
- **Exact `asin` duplicates** → keep first (sort by `reviews` desc so the kept row is the most-reviewed variant).
- **Null `price` AND null `listPrice`** → keep but flag `price_inferred=true` and assign a category-median price in Tier 0 (do not drop — the brief says all rows processed; a priced demo needs a number). If business prefers, drop rows where *both* are null — this is a one-line config flag, default = keep-with-inference.
- **Spam / non-credible price**: price < $0.50 or price > category 99.9th percentile → clamp to category bounds and flag `price_clamped=true`.
- **Adult / gift-card / digital-only categories** (from the `categoryName` histogram) → drop; they don't fit B2B procurement and pollute the demo.

Expected survivors after dedup + null-title drop: **~1.1–1.3M** of the 1.4M.

### 3.2 Processing order (matters for resumability and demo readiness)
Process and assign a `priority_tier` so Tier-1 LLM enrichment runs on the right rows first:
1. **Demo-relevant categories first** (the ones the Pactum demo actually queries: Computers & Accessories, Electronics, Office Products, Industrial & Scientific → mapping to GPU / sensor / chair / server / laptop). These get enriched before anything else.
2. Within those, **`isBestSeller=true`, then high `boughtInLastMonth`, then high `reviews`**. This guarantees the products a judge is likely to surface are the best-enriched.
3. Everything else → Tier-0-only baseline, ingested but not LLM-enriched unless time permits.

This ordering doubles as the **Tier-1 selection filter**: `priority_tier IN (top categories) AND (isBestSeller OR boughtInLastMonth > threshold)` → the ~30k–50k rows that get Pioneer + Gemini.

---

## 4. Pioneer classification pipeline

### 4.1 What Pioneer is used for (narrow, on purpose)
`integrations/pioneer_client.py` exposes only `classify_message(message: str) -> dict` hitting `POST {BASE_URL}/classify` with `{"message": str}`, single-message, no batch endpoint, 12s timeout, falls back to `fallback_pioneer_labels()` on any error. Given that, Pioneer is used **only on the Tier-1 subset (~30k–50k rows)** for:
- spec-tag extraction (e.g. "rtx 4090, 24GB, 450W" → tags) and price-tier classification,
- disambiguating rows whose `categoryName`→Pactum-category map is low-confidence.

It is **not** used to derive category for all 1.4M rows — `categoryName` already gives us that deterministically.

> **Verify-first note:** the existing `/classify` endpoint (per CLAUDE.md and `fallback_outputs.py`) was built as a *negotiation-message* classifier — it returns labels like `price_concession` / `final_offer` / risk levels for seller turns, not product specs. The brief instructs us to use it for product spec extraction, which is fine, but **send 10–20 sample product titles through `/classify` and inspect the real response shape before wiring 50k calls.** If it returns negotiation labels rather than usable spec tags, treat its output as advisory only and lean on Gemini (Section 5) for specs. Section 4.4 already makes Pioneer failures non-fatal, so this is a verification step, not a redesign.

### 4.2 What to send
For each Tier-1 product, send a compact string: `"{title} | category={categoryName} | price={price_eur}"`. The wrapper only accepts `message`, so pack the context into that string.

### 4.3 Batching, concurrency, rate-limiting
- No batch endpoint → must loop, but parallelize with a bounded thread pool (start at **8–16 concurrent**, tune to observed 429 rate). At 50k rows × ~0.3s effective latency with 12-way concurrency ≈ **20–40 min**.
- Wrap with token-bucket rate limiting; on HTTP 429 / timeout, exponential backoff (the existing wrapper swallows errors into fallback — wrap a thin retry/backoff layer *around* `classify_message` in the ingestion script, don't modify the client).
- Hard cap total Pioneer calls in config (`PIONEER_MAX_CALLS`, default 50k) as a cost/rate guardrail.

### 4.4 Response handling
- Pioneer responses (and `fallback_pioneer_labels`) are dicts of labels. Store the raw response in the product's `extra_specs` jsonb under `extra_specs.pioneer`, and lift any clean spec tags into `product_keywords`.
- **Failures are non-fatal**: the fallback dict is acceptable; the row already has a Tier-0 baseline. Record `pioneer_status` (`ok | fallback`) per row for validation counts.

---

## 5. Gemini inference for missing fields

### 5.1 When Gemini is called
Only for **Tier-1 rows** that still lack `delivery_days`, `warranty_years`, or (for physical-hardware categories) `length_mm` / `power_watts` after Tier-0 defaults — and where we want better-than-default values. Tier-0 rows keep category defaults and never touch Gemini.

### 5.2 Batched prompt strategy (NOT 1.4M, not even 50k individual calls)
- `integrations/gemini_client.py` `generate(prompt, *, system, temperature, json_mode)` with retry-once + fallback string. Use `json_mode=True`.
- **Batch ~40 products per call.** Prompt: a system instruction describing the schema + a JSON array of `{asin, title, category}`; ask for a JSON array back with inferred `{asin, delivery_days, warranty_years, length_mm?, power_watts?, confidence}`. Match results back by `asin`.
- 50k rows ÷ 40 = **~1,250 calls**. At ~3–6s/call with 4–6 concurrent ≈ **10–25 min**. Cost: a few dollars on gemini-2.5-flash.
- Centralize the prompt in `backend/prompts.py` (per the repo's "no scattered prompt strings" rule), e.g. `AMAZON_SPEC_INFERENCE_SYSTEM`.
- On a Gemini fallback string / unparseable JSON for a batch → that whole batch silently keeps Tier-0 defaults. Record `gemini_status`.

### 5.3 Category-default fallback table (covers 100% of rows, applied in Tier 0)
This table is the backbone of "all rows processed." Defaults are applied deterministically in Tier 0; Gemini only *overrides* them for confident Tier-1 rows.

| Pactum category | delivery_days | warranty_years | length_mm | power_watts | maps from `categoryName` (examples) |
|---|---|---|---|---|---|
| GPU | 5 | 2 | 300 | 250 | "Computers & Accessories" (GPU titles) |
| Laptop | 6 | 1 | — | — | "Computers & Accessories" (laptop/notebook) |
| Server | 10 | 3 | — | — | "Computers & Accessories" (server/rack) |
| Ergonomic Chair | 7 | 5 | — | — | "Office Products", "Home Office Furniture" |
| Industrial Sensor | 8 | 1 | — | — | "Industrial & Scientific" |
| Electronics (generic) | 5 | 1 | — | — | "Electronics" |
| Default / other | 7 | 1 | — | — | everything else |

(Finalize exact rows from the real `categoryName` histogram produced in Section 1.2. `length_mm`/`power_watts` set only for physical-hardware categories, matching the presence-gated convention in `product_utils.py` / schemas.)

---

## 6. USD → EUR conversion and price normalization

- **Fixed rate at ingestion time.** Pick the rate on the download date (e.g. 1 USD = 0.92 EUR — confirm the live value the day you run it). Do **not** call a live FX API per row.
- Store the rate and date as pipeline metadata: a one-row `ingestion_meta` table or a constant `extra_specs.fx = {"usd_eur": 0.92, "as_of": "2026-06-14"}` on each row (cheap, makes provenance auditable and conversion reversible).
- Apply during Tier 0: `price_eur = round(price_usd * rate, 2)`. Where `price` null but `listPrice` present, use `listPrice`. Where both null → category-median EUR price + `price_inferred=true`.
- Normalize: clamp outliers to category bounds (Section 3.1), round to 2 decimals.
- Staleness mitigation in Section 11.

**Availability inference (Tier 0, deterministic).** The `availability` field is required but absent from Kaggle. Derive from demand signal: `boughtInLastMonth > 0` → `in_stock`; `boughtInLastMonth` 0/null but `reviews > 0` → `limited_stock`; otherwise → `out_of_stock`. (Simpler demo-safe alternative: default all to `in_stock` and skip the rule — state which you chose. Default in the DDL is `in_stock`.)

---

## 7. Supabase schema definition (DDL)

Two new tables. `demo_sessions` already exists (leave untouched). Use a direct Postgres connection (psycopg2, already in `requirements.txt`) for DDL + bulk load; supabase-py for demo reads.

### 7.1 `seller_registry`
```sql
create table if not exists seller_registry (
  seller_id          text primary key,
  seller_name        text not null,
  specialization     text,
  region             text,
  reliability_score  real,
  negotiation_style  text,
  profile            jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);
create index if not exists idx_seller_registry_specialization on seller_registry (specialization);
```
Shape matches `data/seller_registry.json` 1:1 so `get_seller_registry()` and `write_demo_session()` enrichment are unaffected.

### 7.2 `seller_inventory_products` (flat, FK to vendor)
```sql
create table if not exists seller_inventory_products (
  id                text primary key,          -- e.g. asin-derived; idempotency key
  asin              text unique not null,       -- checkpoint / dedup key
  product           text not null,
  seller_id         text not null references seller_registry(seller_id),
  seller_name       text not null,
  category          text not null,
  price_eur         real,
  delivery_days     int,
  warranty_years    real,
  availability      text default 'in_stock',
  product_keywords  text[] default '{}',
  length_mm         int,                        -- nullable; physical hardware only
  power_watts       int,                        -- nullable; physical hardware only
  extra_specs       jsonb default '{}'::jsonb,  -- pioneer/gemini raw, fx, flags, tags
  priority_tier     int default 0,
  is_demo_curated   boolean default false,
  pioneer_status    text,                       -- ok | fallback | skipped
  gemini_status     text,                       -- ok | fallback | skipped
  created_at        timestamptz default now()
);

-- indexes for the demo query patterns
create index if not exists idx_inv_category        on seller_inventory_products (category);
create index if not exists idx_inv_seller          on seller_inventory_products (seller_id);
create index if not exists idx_inv_cat_price        on seller_inventory_products (category, price_eur);
create index if not exists idx_inv_demo_curated     on seller_inventory_products (is_demo_curated) where is_demo_curated;
-- trigram for fuzzy product-name match (optional, mirrors product_matches_requirement)
create extension if not exists pg_trgm;
create index if not exists idx_inv_product_trgm     on seller_inventory_products using gin (product gin_trgm_ops);
```
Query patterns these serve: the demo always filters by **category** (via `product_matches_requirement`) and joins by **seller_id** — never `SELECT *` over the table. `idx_inv_cat_price` covers the clustering/ranking sort by price within a category.

---

## 8. Ingestion pipeline architecture

### 8.1 Orchestration order
```
download → inspect → build vendors (Section 2) → upsert seller_registry
  → Tier 0 transform over all rows (chunked) → bulk COPY to seller_inventory_products
  → select Tier-1 subset → Pioneer enrich (concurrent) → Gemini enrich (batched)
  → UPDATE enriched columns by asin
  → mark Tier-2 demo-curated rows → validate (Section 10)
```
Run as a standalone script under `scripts/ingest_amazon.py` (NOT inside the request path; it's offline batch). Stages are independently re-runnable.

### 8.2 Bulk load — use psycopg2 COPY, not supabase-py
- supabase-py REST upserts at ~hundreds–1k rows/request → 1,400+ round trips for 1.4M = slow and fragile. **`psycopg2` is already a dependency.** Use `COPY` (or `execute_values` in 10k batches) over a direct Postgres connection to the Supabase DB. This loads 1.1–1.3M rows in **minutes**.
- Keep supabase-py only for the demo's read queries (Section 9) — that's its sweet spot.

### 8.3 Parallelism
- Tier 0: pandas chunked read (`chunksize=100_000`), vectorized transforms, write each chunk to a staging file/COPY. CPU-bound, single process is fine; ~13 chunks.
- Tier 1 Pioneer: bounded thread pool, 8–16 concurrent (Section 4.3).
- Tier 1 Gemini: bounded thread pool, 4–6 concurrent, 40/batch (Section 5.2).

### 8.4 Checkpointing (the pipeline WILL die mid-run — plan for resume)
- **`asin` is the idempotency key.** Bulk load via `INSERT ... ON CONFLICT (asin) DO UPDATE` (or COPY to staging + upsert) so re-runs never duplicate.
- **Stage-level checkpoint table** `ingestion_checkpoint(stage text, last_asin text, rows_done int, updated_at)`; each enrichment worker commits its watermark every N rows. On restart, resume from `WHERE asin > last_asin` (sorted) or `WHERE pioneer_status IS NULL` / `gemini_status IS NULL`.
- Enrichment is an idempotent `UPDATE ... WHERE asin = %s` — safe to re-apply. The `*_status` columns double as the resume filter (re-run only picks rows still NULL).
- Save FX rate + vendor mapping to disk so a resumed run uses identical parameters.

---

## 9. data_access.py migration

Current state (verified): `data_access.py` reads `seller_registry.json` and the nested `seller_inventory.json` from local disk; `get_all_products_flat()` flattens the nested dict in memory; there's an existing `_fetch(table, fallback_file)` Supabase-with-JSON-fallback helper already used by `get_buyer_scenarios()`, plus `_get_client()` returning None when env is unset.

**Critical: `get_all_products_flat()` does `SELECT *` + in-memory flatten — fine for 34 products, fatal for 1.4M.** The migration is NOT a flat swap; it must add a **filtered query path**.

Changes:
1. `get_seller_registry()` → fetch from `seller_registry` table via existing `_fetch()`-style helper, JSON file fallback preserved. Small table, full select is fine.
2. **New `get_products_for_category(category, limit=...)`** — `client.table("seller_inventory_products").select(...).eq("category", category).order("price_eur").limit(N)`. This becomes the primary read path for `product_clustering.py` / `supplier_matching.py`. **The demo only ever needs one category slice.** JSON fallback: filter the local flat list by category.
   - **Vocabulary-mismatch trap — must fix or the read returns zero rows.** `product_matches_requirement` keys off `_KNOWN_CATEGORY_ALIASES` = `gpu | chair | sensor | server | laptop` (lowercase short keys), but the stored `category` column uses the Section 5 display values (`"GPU"`, `"Ergonomic Chair"`, `"Industrial Sensor"`). Querying `eq("category", "sensor")` against stored `"Industrial Sensor"` returns nothing. Resolve with an explicit **requirement-key → stored-category map** applied before the query (e.g. `{"gpu":"GPU","chair":"Ergonomic Chair","sensor":"Industrial Sensor","server":"Server","laptop":"Laptop"}`), OR normalize `category` at ingestion to the alias-key vocabulary. Pick one and keep it the single source of truth (put the map next to `_KNOWN_CATEGORY_ALIASES`).
3. `get_all_products_flat()` → keep signature for backward compat BUT add a `category`/`limit` param and route demo callers to the filtered version; the unbounded full-table read should be gated behind `is_demo_curated=true` or a hard limit so it never pulls 1.4M.
4. `get_seller_inventory_nested()` (inventory view) → **reconstruct the nested merchants→inventories→products shape from flat rows**: query (optionally `is_demo_curated`/`priority_tier` capped), `GROUP BY seller_id`, rebuild the dict the frontend expects. Don't return 1.4M nested — cap it.
5. Fallback contract unchanged: when `_get_client()` is None or any query throws, return the local JSON (keep the existing JSON files as the fallback corpus). Per CLAUDE.md, fallback-to-local must stay intact for replay/`DEMO_MODE`.
6. `write_demo_session()` registry enrichment already reads `get_seller_registry()` — works as-is once that points at Supabase.

Guiding principle: **never `SELECT *` the products table in the request path.** Every read is category- or seller- or demo-curated-filtered, backed by the Section 7 indexes.

---

## 10. Validation and testing

### 10.1 Counts (run as SQL after ingestion)
- Total rows in `seller_inventory_products` ≈ expected survivors (1.1–1.3M); compare to source minus dropped (log drop reasons + counts).
- Every `seller_id` in products exists in `seller_registry` (FK guarantees it; assert 0 orphans anyway).
- Vendor count ≈ 150–250; every vendor has ≥1 product; demo categories have ≥3 vendors each (negotiation waterfall needs this).
- Null checks: 0 null `price_eur`, 0 null `category`, 0 null `product`.
- `priority_tier`/status distribution: how many Tier-1 enriched, how many `pioneer_status='ok'` vs `fallback`, same for Gemini.

### 10.2 Schema compliance
- Sample 50 rows per demo category; assert types match Section 7 and presence-gating holds (`length_mm`/`power_watts` non-null only for hardware categories).
- `product_keywords` non-empty for Tier-1 rows.
- `price_eur` within category bounds (no spam survivors).

### 10.3 Spot checks (manual, demo-facing)
- Pull the 20 demo-curated products and eyeball: name reads naturally, price sane in EUR, delivery/warranty plausible, vendor + negotiation_style assigned.
- Run an actual Pactum query end-to-end (e.g. "GPU under €700") against Supabase-backed `data_access.py` and confirm clustering/matching/negotiation surfaces real Amazon-derived products.

### 10.4 Automated
- Extend the repo's pytest suite: a `test_data_access_supabase.py` that mocks the client and asserts the filtered query path + JSON fallback both return valid shapes. Keep existing `test_generalized_matching.py` green against the new data.

---

## 11. Risk factors and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Pioneer rate limits / instability** at 30k–50k calls | High | Tier-1 enrichment stalls | Bounded concurrency + token-bucket + exponential backoff; hard `PIONEER_MAX_CALLS` cap; **fallback labels are acceptable** — Tier-0 baseline already covers the row. Pioneer is enrichment, never blocking. |
| **Gemini cost/time if applied to 1.4M** | Certain if mis-scoped | Blows budget + timeline | **Hard architectural cap: Gemini only on Tier-1 (~50k), batched 40/call (~1,250 calls).** This is the single most important guardrail; enforce it in code with a max-call counter. ~$ single-digit cost. |
| **Supabase storage cap** | High | Ingestion fails / table truncated | Size: one enriched row (title + keywords + jsonb) ≈ 400–600 B → 1.4M ≈ **~700MB–1GB+ before indexes**, which **exceeds the free tier (~500MB)**. **Decision: Supabase Pro (8GB) is REQUIRED, not optional** — constraint #1 ("all rows must be processed, not just a sample") is non-negotiable, so trimming the long tail to fit the free tier is **rejected** (it *is* sampling). The storage lever is instead **keeping `extra_specs` lean** — store the FX stamp + flags + clean tags only; do NOT persist raw `imgUrl`/`productURL`/full Pioneer blobs. Verify the live project's plan/limit *before* bulk load and upgrade to Pro first. |
| **supabase-py REST too slow for 1.4M load** | Certain | Hours instead of minutes | Bulk load via **psycopg2 `COPY`/`execute_values`** (already a dependency); reserve supabase-py for reads. |
| **`get_all_products_flat()` OOM / timeout** at 1.4M | Certain if unmigrated | Demo can't read inventory | Section 9 filtered query path; never `SELECT *` in request path; indexes on category/seller. |
| **USD→EUR rate staleness** | Medium | Prices drift from reality | Fixed rate frozen + stored with `as_of` date in `ingestion_meta`/`extra_specs.fx`; it's a demo, not a trading system — document the rate, re-run conversion (cheap, deterministic) if it matters. |
| **Pipeline dies mid-run** | High (long run) | Lost progress / dupes | `asin` upsert idempotency + `ingestion_checkpoint` table + status-column resume filters (Section 8.4). |
| **Synthetic vendor fields look fake** | Medium | Weak demo | Ground `reliability_score` in real avg_stars/reviews; vary `negotiation_style`/`region` deterministically by hash; templated but plausible `profile`. |
| **Title-prefix pseudo-brand noisy** | Medium | Odd vendor groupings | Acceptable for hackathon; cap vendors at top-N by review volume so noise lands in long tail; fall back to category-grouping where brand extraction confidence is low. |

---

## Appendix: arithmetic summary (the feasibility proof)
- Source: 1.4M rows → after dedup/null/spam drop: **~1.1–1.3M** ingested (Tier 0, **0 API calls**, ~15–40 min via COPY).
- Tier-1 LLM/ML subset: **~30k–50k** (demo categories + bestseller/popularity filter).
  - Pioneer: ~30k–50k single calls, 8–16 concurrent → **~20–40 min**, fallback-tolerant.
  - Gemini: ~50k ÷ 40 = **~1,250 batched calls**, 4–6 concurrent → **~10–25 min**, ~$ single-digit.
- Tier-2 demo-curated: **~200–500**, reuses Tier-1 output.
- Total wall time: **~1.5–4 h**, comfortably within 1–2 days with debugging headroom.
- The thing that does NOT happen: 1.4M Pioneer calls or 1.4M / 35k Gemini calls. That path is named and rejected.
