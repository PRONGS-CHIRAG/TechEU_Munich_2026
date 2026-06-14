-- Pactum: Amazon Products ingestion tables
-- Run once in the Supabase SQL editor (or via psql against DATABASE_URL).
-- demo_sessions already exists — leave untouched.

-- ── seller_registry ──────────────────────────────────────────────────────────
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

create index if not exists idx_seller_registry_specialization
  on seller_registry (specialization);

-- ── seller_inventory_products ─────────────────────────────────────────────────
-- Flat table; category uses the same short-key vocabulary as _KNOWN_CATEGORY_ALIASES
-- in product_utils.py: gpu | chair | sensor | server | laptop | electronics | general
create table if not exists seller_inventory_products (
  id                text primary key,
  asin              text unique not null,
  product           text not null,
  seller_id         text not null references seller_registry(seller_id) on delete cascade,
  seller_name       text not null,
  category          text not null,
  price_eur         real,
  delivery_days     int,
  warranty_years    real,
  availability      text default 'in_stock',
  product_keywords  text[] default '{}',
  length_mm         int,
  power_watts       int,
  extra_specs       jsonb default '{}'::jsonb,
  priority_tier     int default 0,
  is_demo_curated   boolean default false,
  pioneer_status    text,
  gemini_status     text,
  created_at        timestamptz default now()
);

create index if not exists idx_inv_category
  on seller_inventory_products (category);

create index if not exists idx_inv_seller
  on seller_inventory_products (seller_id);

create index if not exists idx_inv_cat_price
  on seller_inventory_products (category, price_eur);

create index if not exists idx_inv_demo_curated
  on seller_inventory_products (is_demo_curated)
  where is_demo_curated;

create index if not exists idx_inv_priority
  on seller_inventory_products (priority_tier, category);

create extension if not exists pg_trgm;

create index if not exists idx_inv_product_trgm
  on seller_inventory_products using gin (product gin_trgm_ops);

-- ── ingestion checkpoint (resume support) ─────────────────────────────────────
create table if not exists ingestion_checkpoint (
  stage       text primary key,
  last_asin   text,
  rows_done   bigint default 0,
  updated_at  timestamptz default now()
);

-- ── Realtime: include new tables in publication ───────────────────────────────
-- (demo_sessions already added; these are read-only from frontend so realtime optional)
-- alter publication supabase_realtime add table seller_registry;
-- alter publication supabase_realtime add table seller_inventory_products;
