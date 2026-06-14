-- Pactum Supabase schema
-- Document-style (non-relational) tables: each row is mostly a JSONB document
-- with a handful of promoted columns for filtering/indexing. No foreign key
-- constraints between tables - the application joins by id fields
-- (request_id, seller_id) at query time, like collections in a NoSQL store.
--
-- Only tables backing live reads in backend/data_access.py are defined here.
-- Run results (requirements, negotiation, validation, etc.) are generated
-- live per request and are not persisted — they stream straight to the UI.

-- ---------------------------------------------------------------------------
-- Buyer scenario blueprints: raw buyer requests for the scenario selector.
-- structured_requirements is intentionally absent — extraction always runs
-- live via Gemini (backend/agents/procurement_intelligence.py).
-- ---------------------------------------------------------------------------
create table if not exists buyer_scenarios (
  request_id text primary key,
  raw_request text not null,
  region text,
  priority text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seller registry: vendor profiles feeding clustering + negotiation persona
-- ---------------------------------------------------------------------------
create table if not exists seller_registry (
  seller_id text primary key,
  seller_name text not null,
  specialization text,
  region text,
  reliability_score numeric,
  negotiation_style text,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seller inventory: flattened product rows across all merchants/inventories.
-- backend/data_access.py reads this table when present, otherwise flattens
-- the nested data/seller_inventory.json (merchants[] -> inventories[] ->
-- products[]) at request time.
-- ---------------------------------------------------------------------------
create table if not exists seller_inventory (
  id text primary key,
  seller_id text not null,
  seller_name text,
  product text not null,
  length_mm numeric,
  power_watts numeric,
  price_eur numeric,
  delivery_days integer,
  warranty_years numeric,
  availability text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_seller_inventory_seller_id on seller_inventory (seller_id);

-- ---------------------------------------------------------------------------
-- Tavily fallback results: saved external supplier/spec enrichment results
-- used as the replay-mode side track for integrations/tavily_client.py.
-- ---------------------------------------------------------------------------
create table if not exists tavily_fallback_results (
  id text primary key,
  query text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Demo sessions: completed DemoResult payloads written by
-- backend/data_access.py:write_demo_session() at the end of each pipeline
-- run. Read by the seller workspace (latest result + Realtime subscription)
-- to surface negotiation outcomes without polling the backend.
-- ---------------------------------------------------------------------------
create table if not exists demo_sessions (
  session_id text primary key,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_demo_sessions_created_at on demo_sessions (created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'demo_sessions'
  ) then
    alter publication supabase_realtime add table demo_sessions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seller inventory products: large ingested catalog (Kaggle dataset), queried
-- by backend/data_access.py:get_products_for_requirements() filtered by
-- `category`. Distinct from seller_inventory (the 25 curated demo products).
-- ---------------------------------------------------------------------------
create table if not exists seller_inventory_products (
  id text primary key,
  seller_id text not null,
  seller_name text,
  product text not null,
  category text,
  price_eur numeric,
  delivery_days integer,
  warranty_years numeric,
  availability text,
  product_keywords jsonb not null default '[]'::jsonb,
  length_mm numeric,
  power_watts numeric,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_seller_inventory_products_category on seller_inventory_products (category);
create index if not exists idx_seller_inventory_products_seller_id on seller_inventory_products (seller_id);

-- ---------------------------------------------------------------------------
-- Per-session breakdown tables: normalized views of DemoResult fields,
-- written alongside demo_sessions by write_demo_session() so the seller
-- workspace and analytics can query individual stages without parsing the
-- full result JSONB blob.
-- ---------------------------------------------------------------------------
create table if not exists conversation_logs (
  id bigserial primary key,
  session_id text not null,
  seller_id text,
  seller_name text,
  speaker text not null,
  message text not null,
  round integer not null default 0,
  event_kind text,
  pioneer_labels jsonb not null default '[]'::jsonb,
  risk_level text,
  extracted_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_logs_session on conversation_logs (session_id);
create index if not exists idx_conversation_logs_seller on conversation_logs (seller_id);

create table if not exists validation_results (
  id bigserial primary key,
  session_id text not null,
  seller_id text,
  seller_name text,
  status text,
  failed_constraints jsonb not null default '[]'::jsonb,
  score integer,
  next_action text,
  product text,
  price_eur numeric,
  delivery_days integer,
  warranty_years numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_validation_results_session on validation_results (session_id);

create table if not exists escalation_results (
  session_id text primary key,
  escalate boolean not null default false,
  trigger text,
  reason text,
  question_for_human text,
  best_offer jsonb,
  human_response jsonb,
  created_at timestamptz not null default now()
);

create table if not exists final_recommendations (
  session_id text primary key,
  recommended_seller text,
  recommended_product text,
  price_eur numeric,
  delivery_days integer,
  technical_status text,
  risk_level text,
  reason text,
  human_approval_required boolean,
  human_decision text,
  created_at timestamptz not null default now()
);

create table if not exists audit_summaries (
  session_id text primary key,
  summary text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pioneer inference examples: seller-message classification examples
-- (message -> labels/risk_level/extracted_fields) produced by
-- integrations/pioneer_client.py during negotiations.
-- ---------------------------------------------------------------------------
create table if not exists pioneer_inference_examples (
  id bigserial primary key,
  session_id text,
  message text not null,
  labels jsonb not null default '[]'::jsonb,
  risk_level text,
  extracted_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Edge cases: curated tricky buyer scenarios for evaluation/regression,
-- separate from the main buyer_scenarios demo set.
-- ---------------------------------------------------------------------------
create table if not exists edge_cases (
  id text primary key,
  category text,
  description text,
  raw_request text,
  expected_behavior text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ingestion checkpoint: resumable progress markers for catalog ingestion
-- jobs (e.g. the Kaggle dataset feeding seller_inventory_products).
-- ---------------------------------------------------------------------------
create table if not exists ingestion_checkpoint (
  source text primary key,
  last_offset bigint not null default 0,
  last_id text,
  status text not null default 'pending',
  updated_at timestamptz not null default now()
);
