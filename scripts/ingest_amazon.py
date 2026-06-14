#!/usr/bin/env python3
"""
Amazon Products Dataset 2023 → Supabase ingestion pipeline.

Stages:
  download        Download the Kaggle dataset into data/raw/
  build_vendors   Construct seller_registry from Amazon brand signals
  tier0           Deterministic ETL for all rows → seller_inventory_products
  tier1_pioneer   Pioneer spec-tag enrichment on ~30k-50k priority rows
  tier1_gemini    Gemini batch inference for missing fields (~1,250 calls)
  tier2           Mark top demo-curated rows per category
  validate        Print row counts and quality summary
  all             Run all stages in order (default)

Usage:
    python scripts/ingest_amazon.py [--stage STAGE] [--csv PATH] [--dry-run]
                                    [--pioneer-limit N] [--gemini-limit N]

Environment:
    SUPABASE_URL, SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) — required
    KAGGLE_USERNAME, KAGGLE_KEY — for dataset download
    LLM_API_KEY — for Gemini enrichment
    PIONEER_API_KEY, PIONEER_BASE_URL — for Pioneer enrichment
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Iterator, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

try:
    import pandas as pd
except ImportError:
    print("[ingest] pandas required — pip install pandas"); sys.exit(1)

# ── Config ─────────────────────────────────────────────────────────────────────

DEFAULT_CSV       = "data/raw/amazon_products.csv"
CATEGORIES_CSV    = "data/raw/amazon_categories.csv"
FX_USD_EUR        = 0.92
FX_DATE           = datetime.now().strftime("%Y-%m-%d")
TARGET_VENDOR_COUNT     = 200
PIONEER_MAX_CALLS_DEFAULT = 50_000
GEMINI_BATCH_SIZE       = 40
GEMINI_MAX_CALLS_DEFAULT = 1_500
CHUNK_SIZE              = 50_000   # rows per pandas chunk
REST_BATCH_SIZE         = 500      # rows per supabase-py upsert
UPDATE_BATCH_SIZE       = 200      # rows per enrichment update batch

KAGGLE_SLUG = "asaniczka/amazon-products-dataset-2023-1-4m-products"

# Loaded once and reused across all chunks
_CATEGORY_LOOKUP: dict[int, str] = {}

def _load_category_lookup(categories_csv: str = CATEGORIES_CSV) -> dict[int, str]:
    """Load amazon_categories.csv into a {category_id: category_name} dict."""
    global _CATEGORY_LOOKUP
    if _CATEGORY_LOOKUP:
        return _CATEGORY_LOOKUP
    try:
        cats = pd.read_csv(categories_csv)
        cats.columns = [c.strip() for c in cats.columns]
        id_col   = next(c for c in cats.columns if "id" in c.lower())
        name_col = next(c for c in cats.columns if "name" in c.lower())
        _CATEGORY_LOOKUP = {int(row[id_col]): str(row[name_col]) for _, row in cats.iterrows()}
        print(f"[ingest] Loaded {len(_CATEGORY_LOOKUP)} category names from {categories_csv}")
    except Exception as e:
        print(f"[ingest] Warning: could not load categories CSV ({e}) — category mapping will be 'general'")
    return _CATEGORY_LOOKUP

# ── Categories ─────────────────────────────────────────────────────────────────

SKIP_CATEGORIES = {
    "Gift Cards", "Magazine Subscriptions", "Streaming Media Players",
    "Movies & TV", "Music", "Books", "Kindle Store", "Digital Music",
    "Baby", "Grocery & Gourmet Food", "Beauty & Personal Care",
    "Health & Household", "Clothing, Shoes & Jewelry", "Toys & Games",
    "Sports & Outdoors", "Pet Supplies", "Automotive", "Video Games",
    "Amazon Devices", "Handmade Products",
}

CATEGORY_MAP: dict[str, Optional[str]] = {
    "Computers & Accessories": None,
    "Computer Accessories & Peripherals": "electronics",
    "Laptop & Netbook Computer Accessories": "laptop",
    "Laptops": "laptop", "Notebook Computers": "laptop",
    "Traditional Laptops": "laptop", "2 in 1 Laptops": "laptop",
    "Electronics": "electronics", "Camera & Photo Products": "electronics",
    "Cell Phones & Accessories": "electronics", "Consumer Electronics": "electronics",
    "Portable Audio & Video": "electronics", "Wearable Technology": "electronics",
    "Smart Home": "electronics", "TV & Video": "electronics",
    "Home Audio": "electronics", "Car Electronics": "electronics",
    "Office Products": None,
    "Office Electronics": "electronics",
    "Office Furniture & Lighting": "chair", "Home Office Furniture": "chair",
    "Office Chairs": "chair", "Ergonomic Chairs": "chair",
    "Industrial & Scientific": None,
    "Test, Measure & Inspect": "sensor", "Sensors": "sensor",
    "Lab & Scientific Products": "sensor",
    "Power & Hand Tools": "general", "Tools & Home Improvement": "general",
    "Arts, Crafts & Sewing": "general", "Patio, Lawn & Garden": "general",
    "Home & Kitchen": "general", "Appliances": "general",
    "Network Attached Storage": "server",
}

_GPU_RE    = re.compile(r"\b(rtx|gtx|radeon|rx\s*\d|geforce|nvidia|amd\s+r[x9]|gpu|graphics\s+card)\b", re.I)
_LAPTOP_RE = re.compile(r"\b(laptop|notebook|macbook|chromebook|ultrabook|thinkpad|ideapad)\b", re.I)
_SERVER_RE = re.compile(r"\b(server|nas|workstation|blade\s+server|tower\s+server)\b", re.I)
_CHAIR_RE  = re.compile(r"\b(chair|seating|ergonomic\s+seat|office\s+seat)\b", re.I)
_SENSOR_RE = re.compile(r"\b(sensor|proximity|detector|detection|ultrasonic|infrared|motion\s+sensor)\b", re.I)

CATEGORY_DEFAULTS: dict[str, dict] = {
    "gpu":        {"delivery_days": 5,  "warranty_years": 2.0, "length_mm": 300, "power_watts": 250},
    "laptop":     {"delivery_days": 6,  "warranty_years": 1.0},
    "server":     {"delivery_days": 10, "warranty_years": 3.0},
    "chair":      {"delivery_days": 7,  "warranty_years": 5.0},
    "sensor":     {"delivery_days": 8,  "warranty_years": 1.0},
    "electronics":{"delivery_days": 5,  "warranty_years": 1.0},
    "general":    {"delivery_days": 7,  "warranty_years": 1.0},
}

EU_REGIONS = ["Germany","Germany","Germany","Netherlands","France","Poland","Switzerland","Austria","Sweden","Italy","Spain"]
NEGOTIATION_STYLES = ["aggressive","cooperative","flexible","rigid","formal"]
CITY_BY_REGION: dict[str, list[str]] = {
    "Germany": ["Berlin","Munich","Hamburg","Frankfurt"],
    "Netherlands": ["Amsterdam","Rotterdam"], "France": ["Paris","Lyon"],
    "Poland": ["Warsaw","Krakow"], "Switzerland": ["Zurich","Geneva"],
    "Austria": ["Vienna"], "Sweden": ["Stockholm"], "Italy": ["Milan"], "Spain": ["Madrid"],
}
RESERVED_VENDOR_IDS = {"vendor_a","vendor_b","vendor_c","vendor_d","vendor_e","vendor_f","vendor_g"}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _map_category(cat_name: Optional[str], title: str) -> str:
    cat = (cat_name or "").strip()
    mapped = CATEGORY_MAP.get(cat)
    if mapped is not None:
        return mapped
    t = title or ""
    if cat in CATEGORY_MAP:  # explicitly None: sub-classify by title
        if _GPU_RE.search(t):    return "gpu"
        if _LAPTOP_RE.search(t): return "laptop"
        if _SERVER_RE.search(t): return "server"
        if _CHAIR_RE.search(t):  return "chair"
        if _SENSOR_RE.search(t): return "sensor"
        return "electronics"
    # Unknown category — title fallback
    if _GPU_RE.search(t):    return "gpu"
    if _LAPTOP_RE.search(t): return "laptop"
    if _SERVER_RE.search(t): return "server"
    if _CHAIR_RE.search(t):  return "chair"
    if _SENSOR_RE.search(t): return "sensor"
    return "general"


def _pseudo_brand(title: str) -> str:
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9\-]+", title or "")
    stop = {"the","for","with","and","new","best","pro","pack","set","kit"}
    clean = [t for t in tokens if t.lower() not in stop and len(t) >= 3]
    return (clean[0] if clean else "unknown").lower()


def _keywords(title: str, category: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", (title or "").lower())
    stop = {"a","an","and","are","as","at","be","by","for","from","has","in",
            "is","it","its","of","on","or","that","the","to","was","will","with","new","pack","pcs","set"}
    kws = [t for t in tokens if len(t) >= 3 and t not in stop]
    kws = list(dict.fromkeys(kws))[:12]
    if category not in kws:
        kws.insert(0, category)
    return kws


def _availability(bought, reviews) -> str:
    try: blm = float(bought) if bought is not None else 0
    except: blm = 0
    try: rev = float(reviews) if reviews is not None else 0
    except: rev = 0
    if blm > 0: return "in_stock"
    if rev > 0: return "limited_stock"
    return "out_of_stock"


def _hash8(s: str) -> str:
    return hashlib.md5(s.encode()).hexdigest()[:8]


def _seller_id(brand: str, category: str) -> str:
    return f"amz_{_hash8(f'{category}_{brand}')}"


# ── Supabase client ────────────────────────────────────────────────────────────

_sb_client = None

def _get_client():
    global _sb_client
    if _sb_client:
        return _sb_client
    from backend.config import get_env_url, get_env_str
    from supabase import create_client

    url = get_env_url("SUPABASE_URL", "")
    # Prefer service role key (bypasses RLS); fall back to anon key
    key = get_env_str("SUPABASE_SERVICE_ROLE_KEY", "") or get_env_str("SUPABASE_ANON_KEY", "")
    if not url or not key:
        print("[ingest] SUPABASE_URL and SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY) required.")
        return None
    _sb_client = create_client(url, key)
    return _sb_client


def _upsert_checkpoint(stage: str, last_asin: str, rows_done: int) -> None:
    client = _get_client()
    if not client: return
    try:
        client.table("ingestion_checkpoint").upsert({
            "stage": stage, "last_asin": last_asin, "rows_done": rows_done
        }).execute()
    except Exception as e:
        print(f"[checkpoint] warn: {e}")


def _get_checkpoint(stage: str) -> tuple[Optional[str], int]:
    client = _get_client()
    if not client: return None, 0
    try:
        r = client.table("ingestion_checkpoint").select("last_asin,rows_done").eq("stage", stage).execute()
        if r.data:
            return r.data[0]["last_asin"], r.data[0]["rows_done"]
    except Exception:
        pass
    return None, 0


def _batch_upsert(table: str, rows: list[dict], conflict: str = "id") -> int:
    """Upsert rows in REST_BATCH_SIZE chunks. Returns count upserted."""
    client = _get_client()
    if not client or not rows: return 0
    total = 0
    for i in range(0, len(rows), REST_BATCH_SIZE):
        chunk = rows[i:i + REST_BATCH_SIZE]
        try:
            client.table(table).upsert(chunk, on_conflict=conflict).execute()
            total += len(chunk)
        except Exception as e:
            print(f"[upsert:{table}] batch {i//REST_BATCH_SIZE} error: {e}")
            # Try row-by-row for this chunk on failure
            for row in chunk:
                try:
                    client.table(table).upsert(row, on_conflict=conflict).execute()
                    total += 1
                except Exception as e2:
                    pass
    return total


# ── Stage: download ───────────────────────────────────────────────────────────

def run_download(csv_path: str = DEFAULT_CSV) -> None:
    """Download the Kaggle dataset using KAGGLE_USERNAME + KAGGLE_KEY from .env."""
    # Accept either expected filename
    alt_path = os.path.join(os.path.dirname(csv_path), "amazon_products.csv")
    if os.path.exists(csv_path):
        size_mb = os.path.getsize(csv_path) / 1_048_576
        print(f"[download] {csv_path} already exists ({size_mb:.0f} MB) — skipping.")
        return
    if os.path.exists(alt_path) and alt_path != csv_path:
        print(f"[download] Found {alt_path} — using as-is.")
        return

    os.makedirs(os.path.dirname(csv_path), exist_ok=True)

    # Set Kaggle env vars from .env if not already in environment
    username = os.getenv("KAGGLE_USERNAME", "")
    key      = os.getenv("KAGGLE_KEY", "")
    if username and key:
        os.environ["KAGGLE_USERNAME"] = username
        os.environ["KAGGLE_KEY"]      = key
        kaggle_json = os.path.expanduser("~/.kaggle/kaggle.json")
        if not os.path.exists(kaggle_json):
            os.makedirs(os.path.expanduser("~/.kaggle"), exist_ok=True)
            with open(kaggle_json, "w") as f:
                json.dump({"username": username, "key": key}, f)
            os.chmod(kaggle_json, 0o600)
            print(f"[download] Wrote {kaggle_json}")

    try:
        from kaggle.api.kaggle_api_extended import KaggleApiExtended
        api = KaggleApiExtended()
        api.authenticate()
        raw_dir = os.path.dirname(csv_path)
        print(f"[download] Downloading {KAGGLE_SLUG} → {raw_dir}/ ...")
        api.dataset_download_files(KAGGLE_SLUG, path=raw_dir, unzip=False, quiet=False)
        # Find the zip and extract
        zips = [f for f in os.listdir(raw_dir) if f.endswith(".zip")]
        if zips:
            zip_path = os.path.join(raw_dir, zips[0])
            print(f"[download] Extracting {zip_path} ...")
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(raw_dir)
            os.remove(zip_path)
        # Rename to expected path if needed
        csvs = [f for f in os.listdir(raw_dir) if f.endswith(".csv")]
        if csvs:
            found = os.path.join(raw_dir, csvs[0])
            if found != csv_path:
                os.rename(found, csv_path)
                print(f"[download] Renamed → {csv_path}")
        if os.path.exists(csv_path):
            size_mb = os.path.getsize(csv_path) / 1_048_576
            print(f"[download] Done. {csv_path} ({size_mb:.0f} MB)")
        else:
            print(f"[download] ERROR: expected CSV not found at {csv_path}")
    except Exception as e:
        print(f"[download] ERROR: {e}")
        print("  Manual download: kaggle datasets download -d asaniczka/amazon-products-dataset-2023-1-4m-products -p data/raw/ --unzip")
        sys.exit(1)


# ── Stage: build_vendors ───────────────────────────────────────────────────────

def build_vendors(csv_path: str, dry_run: bool = False) -> list[dict]:
    """Derive ~150-200 vendor entities from Amazon brand signals and upsert to seller_registry."""
    print(f"[build_vendors] Sampling {csv_path} ...")
    try:
        df = pd.read_csv(csv_path, nrows=500_000, low_memory=False,
                         usecols=lambda c: c.strip() in {"asin","title","stars","reviews","categoryName","isBestSeller"})
    except FileNotFoundError:
        print(f"[build_vendors] CSV not found: {csv_path}"); sys.exit(1)

    df.columns = [c.strip() for c in df.columns]
    df = df.dropna(subset=["title"])
    df["reviews"] = pd.to_numeric(df.get("reviews", 0), errors="coerce").fillna(0)
    df["stars"]   = pd.to_numeric(df.get("stars",   0), errors="coerce").fillna(0)

    # Resolve category_id → name
    cat_lookup = _load_category_lookup()
    cat_col = next((c for c in df.columns if "category" in c.lower()), None)
    if cat_col:
        df["_cat_name"] = df[cat_col].apply(
            lambda v: cat_lookup.get(int(v), str(v)) if str(v).isdigit() else str(v))
    else:
        df["_cat_name"] = "general"
    df = df[~df["_cat_name"].isin(SKIP_CATEGORIES)]

    df["pactum_category"] = df.apply(
        lambda r: _map_category(r.get("_cat_name"), str(r.get("title",""))), axis=1)
    df["pseudo_brand"]    = df["title"].apply(_pseudo_brand)
    df["sid_candidate"]   = df.apply(
        lambda r: _seller_id(r["pseudo_brand"], r["pactum_category"]), axis=1)

    grouped = (
        df.groupby(["pactum_category","pseudo_brand","sid_candidate"])
        .agg(total_reviews=("reviews","sum"), avg_stars=("stars","mean"), n=("asin","count"))
        .reset_index()
    )
    grouped = grouped[~grouped["sid_candidate"].isin(RESERVED_VENDOR_IDS)]
    cats    = grouped["pactum_category"].unique()
    per_cat = max(5, TARGET_VENDOR_COUNT // max(len(cats), 1))

    top = (
        grouped.sort_values("total_reviews", ascending=False)
        .groupby("pactum_category").head(per_cat)
        .reset_index(drop=True)
    )
    if len(top) > TARGET_VENDOR_COUNT:
        top = top.nlargest(TARGET_VENDOR_COUNT, "total_reviews")

    print(f"[build_vendors] Derived {len(top)} vendors across {len(cats)} categories.")

    cat_labels = {
        "gpu":"GPUs and graphics cards","laptop":"laptops and notebooks",
        "server":"servers and enterprise compute","chair":"ergonomic office furniture",
        "sensor":"industrial sensors","electronics":"professional electronics","general":"B2B supplies",
    }

    vendors: list[dict] = []
    for _, row in top.iterrows():
        sid   = row["sid_candidate"]
        brand = row["pseudo_brand"].title()
        cat   = row["pactum_category"]
        stars = float(row["avg_stars"])
        revs  = int(row["total_reviews"])

        star_comp    = stars / 5.0
        rev_conf     = min(1.0, revs / 5000)
        rel_score    = round(0.6 * star_comp + 0.4 * rev_conf, 3)

        h      = int(_hash8(sid), 16)
        region = EU_REGIONS[h % len(EU_REGIONS)]
        style  = NEGOTIATION_STYLES[h % len(NEGOTIATION_STYLES)]
        if rel_score < 0.5: style = ["rigid","aggressive"][h % 2]
        elif rel_score > 0.8: style = ["cooperative","flexible"][h % 2]

        city_list = CITY_BY_REGION.get(region, ["Berlin"])
        city      = city_list[h % len(city_list)]
        spec_lbl  = cat_labels.get(cat, cat)

        vendors.append({
            "seller_id":         sid,
            "seller_name":       f"{brand} ({region})",
            "specialization":    spec_lbl,
            "region":            region,
            "reliability_score": rel_score,
            "negotiation_style": style,
            "profile":           json.dumps({
                "headquarters":      f"{city}, {region}",
                "founded_year":      2005 + (h % 16),
                "typical_customers": f"B2B buyers of {spec_lbl}",
                "notes":             f"Top {brand} reseller. Rating {stars:.1f}/5 from {revs:,} reviews.",
            }),
        })

    if dry_run:
        print(f"[build_vendors] dry-run: would upsert {len(vendors)} vendors.")
        return vendors

    written = _batch_upsert("seller_registry", vendors, conflict="seller_id")
    print(f"[build_vendors] Upserted {written} vendors into seller_registry.")
    return vendors


# ── Stage: tier0 ──────────────────────────────────────────────────────────────

def _price_bounds(csv_path: str, sample: int = 200_000) -> dict[str, tuple[float, float]]:
    """Compute per-category price p0.1 and p99.9 from a sample for outlier clamping."""
    bounds: dict[str, tuple[float, float]] = {}
    try:
        s = pd.read_csv(csv_path, nrows=sample, low_memory=False)
        s.columns = [c.strip() for c in s.columns]
        col = {c.lower(): c for c in s.columns}
        pc  = col.get("price"); cc = col.get("categoryname"); tc = col.get("title")
        if pc and cc and tc:
            s["_p"] = pd.to_numeric(
                s[pc].astype(str).str.replace(r"[$,]","",regex=True), errors="coerce")
            cat_lkp = _load_category_lookup()
            def _resolve_cat(r):
                raw = r.get(cc,"")
                try: cn = cat_lkp.get(int(raw), str(raw))
                except: cn = str(raw)
                return _map_category(cn, str(r.get(tc,"")))
            s["_c"] = s.apply(_resolve_cat, axis=1)
            for cat, g in s.groupby("_c"):
                p = g["_p"].dropna()
                if len(p):
                    bounds[cat] = (max(0.5, float(p.quantile(0.001))), float(p.quantile(0.999)))
    except Exception as e:
        print(f"[tier0] price bounds warning: {e}")
    for cat in CATEGORY_DEFAULTS:
        bounds.setdefault(cat, (0.5, 50_000))
    return bounds


def _known_seller_ids() -> set[str]:
    """Fetch all seller_ids currently in seller_registry."""
    client = _get_client()
    if not client: return set()
    try:
        r = client.table("seller_registry").select("seller_id").execute()
        return {row["seller_id"] for row in r.data}
    except Exception:
        return set()


def _auto_register_vendors(new_sids: set[str]) -> None:
    """Auto-register vendor stubs so FK constraint doesn't fail during bulk insert."""
    if not new_sids: return
    stubs = []
    for sid in new_sids:
        h = int(_hash8(sid), 16)
        region = EU_REGIONS[h % len(EU_REGIONS)]
        stubs.append({
            "seller_id":         sid,
            "seller_name":       f"Amazon Seller ({sid[-6:]})",
            "specialization":    "general B2B supplies",
            "region":            region,
            "reliability_score": 0.70,
            "negotiation_style": NEGOTIATION_STYLES[h % len(NEGOTIATION_STYLES)],
            "profile":           json.dumps({"headquarters": region, "founded_year": 2010 + (h % 11)}),
        })
    n = _batch_upsert("seller_registry", stubs, conflict="seller_id")
    print(f"[tier0] Auto-registered {n} missing vendor stubs.")


def _transform_chunk(df_chunk: pd.DataFrame, bounds: dict) -> list[dict]:
    """Apply all Tier 0 transforms to a chunk. Returns list of product dicts."""
    df = df_chunk.copy()
    df.columns = [c.strip() for c in df.columns]
    col = {c.lower(): c for c in df.columns}

    def gc(name: str) -> Optional[str]:
        return col.get(name.lower())

    asin_c     = gc("asin");        title_c   = gc("title")
    price_c    = gc("price");       lp_c      = gc("listprice") or gc("list_price")
    stars_c    = gc("stars");       reviews_c = gc("reviews")
    cat_c      = gc("categoryname") or gc("category_name") or gc("category_id")
    bs_c       = gc("isbestseller") or gc("is_best_seller")
    bought_c   = gc("boughtinlastmonth") or gc("bought_in_last_month")
    cat_lookup = _load_category_lookup()

    if not asin_c or not title_c:
        return []

    rows = []
    for _, r in df.iterrows():
        asin  = str(r.get(asin_c, "") or "").strip()
        title = str(r.get(title_c, "") or "").strip()
        if not asin or not title:
            continue

        raw_cat = r.get(cat_c, "") if cat_c else ""
        # Resolve numeric category_id → name if needed
        try:
            cat_name = cat_lookup.get(int(raw_cat), str(raw_cat))
        except (ValueError, TypeError):
            cat_name = str(raw_cat or "").strip()
        if cat_name in SKIP_CATEGORIES:
            continue

        category = _map_category(cat_name or None, title)
        brand    = _pseudo_brand(title)
        sid      = _seller_id(brand, category)

        # USD → EUR
        price_usd = None
        for pc in [price_c, lp_c]:
            if pc and r.get(pc) is not None:
                try:
                    v = float(str(r[pc]).replace("$","").replace(",","").strip())
                    if v > 0: price_usd = v; break
                except: pass

        extra: dict = {"fx": {"usd_eur": FX_USD_EUR, "as_of": FX_DATE}}
        if price_usd is None:
            price_usd = 50.0; extra["price_inferred"] = True
        else:
            lo, hi = bounds.get(category, (0.5, 50_000))
            if price_usd < lo or price_usd > hi:
                price_usd = max(lo, min(hi, price_usd)); extra["price_clamped"] = True
        price_eur = round(price_usd * FX_USD_EUR, 2)

        bought = r.get(bought_c) if bought_c else None
        revs   = r.get(reviews_c) if reviews_c else None
        avail  = _availability(bought, revs)

        is_bs = bool(r.get(bs_c, False)) if bs_c else False
        try:   bought_n = float(bought) if bought else 0
        except: bought_n = 0
        demo_cats = {"gpu","chair","sensor","laptop","server"}
        if category in demo_cats and (is_bs or bought_n > 0): priority = 1
        elif category in demo_cats:                             priority = 2
        else:                                                   priority = 3

        defs    = CATEGORY_DEFAULTS.get(category, CATEGORY_DEFAULTS["general"])
        kws     = _keywords(title, category)

        rows.append({
            "id":              f"{sid}_{asin}",
            "asin":            asin,
            "product":         title[:400],
            "seller_id":       sid,
            "seller_name":     f"{brand.title()}",
            "category":        category,
            "price_eur":       price_eur,
            "delivery_days":   defs["delivery_days"],
            "warranty_years":  defs["warranty_years"],
            "availability":    avail,
            "product_keywords": kws,
            "length_mm":       defs.get("length_mm"),
            "power_watts":     defs.get("power_watts"),
            "extra_specs":     extra,
            "priority_tier":   priority,
            "is_demo_curated": False,
            "pioneer_status":  None,
            "gemini_status":   None,
        })
    return rows


def run_tier0(csv_path: str, dry_run: bool = False) -> None:
    """Tier 0: Deterministic ETL over all rows using supabase-py REST upserts."""
    print(f"[tier0] Starting deterministic ETL from {csv_path}")

    if not dry_run and not _get_client():
        return

    print("[tier0] Computing price bounds from sample ...")
    bounds = _price_bounds(csv_path)

    resume_asin, rows_done = (None, 0) if dry_run else _get_checkpoint("tier0")
    print(f"[tier0] Resuming at {rows_done:,} rows (last asin: {resume_asin})")

    known_sids = _known_seller_ids()
    total = rows_done
    chunk_n = 0
    past_resume = resume_asin is None

    try:
        for chunk in pd.read_csv(csv_path, chunksize=CHUNK_SIZE, low_memory=False):
            chunk_n += 1
            chunk.columns = [c.strip() for c in chunk.columns]

            if not past_resume and resume_asin:
                col = {c.lower(): c for c in chunk.columns}
                ac  = col.get("asin")
                if ac and resume_asin in chunk[ac].values:
                    past_resume = True
                    idx = chunk[chunk[ac] == resume_asin].index[-1]
                    chunk = chunk.loc[idx + 1:]
                else:
                    continue

            rows = _transform_chunk(chunk, bounds)
            if not rows:
                continue

            if dry_run:
                total += len(rows)
                if chunk_n <= 2:
                    print(f"[tier0] dry-run chunk {chunk_n}: {len(rows)} rows — {rows[0]['product'][:60]}")
                continue

            # Auto-register any new seller_ids not yet in DB
            new_sids = {r["seller_id"] for r in rows} - known_sids - RESERVED_VENDOR_IDS
            if new_sids:
                _auto_register_vendors(new_sids)
                known_sids.update(new_sids)

            written = _batch_upsert("seller_inventory_products", rows, conflict="asin")
            total  += written

            last_asin = rows[-1]["asin"]
            _upsert_checkpoint("tier0", last_asin, total)

            print(f"[tier0] chunk {chunk_n}: +{written:,} | total: {total:,}")

    except KeyboardInterrupt:
        print(f"\n[tier0] Interrupted at {total:,} rows. Checkpoint saved.")
    except Exception as e:
        print(f"[tier0] Error in chunk {chunk_n}: {e}"); raise
    print(f"[tier0] Done — {'dry-run' if dry_run else 'upserted'} {total:,} rows.")


# ── Stage: tier1_pioneer ──────────────────────────────────────────────────────

def run_tier1_pioneer(max_calls: int = PIONEER_MAX_CALLS_DEFAULT, dry_run: bool = False) -> None:
    """Pioneer classification on priority_tier=1 rows for spec-tag extraction."""
    from integrations.pioneer_client import classify_message

    client = _get_client()
    if not client: return

    resume_asin, rows_done = _get_checkpoint("tier1_pioneer")
    query = client.table("seller_inventory_products").select(
        "id,asin,product,category,extra_specs,product_keywords"
    ).eq("priority_tier", 1).is_("pioneer_status", "null").order("asin").limit(max_calls)
    if resume_asin:
        query = query.gt("asin", resume_asin)
    r = query.execute()
    target = r.data or []

    print(f"[tier1_pioneer] {len(target):,} rows to classify")
    if dry_run:
        print("[tier1_pioneer] dry-run: no writes."); return

    processed = rows_done
    CONCURRENCY = 8

    def _classify(row: dict) -> dict:
        msg = f"{row['product'][:200]} | category={row['category']}"
        try:    result = classify_message(msg); status = "ok"
        except: result = {}; status = "fallback"
        return {**row, "_result": result, "_status": status}

    batch: list[dict] = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = {pool.submit(_classify, r): r for r in target}
        for future in as_completed(futures):
            item = future.result()
            batch.append(item)
            processed += 1

            if len(batch) >= UPDATE_BATCH_SIZE or processed == len(target):
                upserts = []
                for it in batch:
                    extra = it.get("extra_specs") or {}
                    if isinstance(extra, str):
                        try: extra = json.loads(extra)
                        except: extra = {}
                    extra["pioneer"] = it["_result"]
                    labels = it["_result"].get("labels", [])
                    kws = list(it.get("product_keywords") or [])
                    for lbl in labels:
                        if isinstance(lbl, str) and len(lbl) >= 3 and lbl not in kws:
                            kws.append(lbl)
                    upserts.append({
                        "id": it["id"], "asin": it["asin"],
                        "product": it["product"], "seller_id": it.get("seller_id",""),
                        "seller_name": it.get("seller_name",""), "category": it["category"],
                        "extra_specs": extra, "product_keywords": kws[:15],
                        "pioneer_status": it["_status"],
                    })
                _batch_upsert("seller_inventory_products", upserts, conflict="asin")
                _upsert_checkpoint("tier1_pioneer", batch[-1]["asin"], processed)
                batch = []

            if processed % 1000 == 0:
                print(f"[tier1_pioneer] {processed:,}/{len(target):,}")

    print(f"[tier1_pioneer] Done. {processed:,} rows processed.")


# ── Stage: tier1_gemini ───────────────────────────────────────────────────────

def run_tier1_gemini(max_calls: int = GEMINI_MAX_CALLS_DEFAULT, dry_run: bool = False) -> None:
    """Gemini batch inference for delivery_days, warranty_years, length_mm, power_watts."""
    try:
        from integrations.gemini_client import generate
        from backend.prompts import AMAZON_SPEC_INFERENCE_SYSTEM
    except ImportError as e:
        print(f"[tier1_gemini] Import error: {e}"); return

    client = _get_client()
    if not client: return

    resume_asin, rows_done = _get_checkpoint("tier1_gemini")
    limit = max_calls * GEMINI_BATCH_SIZE
    query = client.table("seller_inventory_products").select(
        "id,asin,product,category,seller_id,seller_name,price_eur,delivery_days,"
        "warranty_years,availability,product_keywords,length_mm,power_watts,extra_specs,"
        "priority_tier,is_demo_curated"
    ).lte("priority_tier", 2).is_("gemini_status", "null").order("asin").limit(limit)
    if resume_asin:
        query = query.gt("asin", resume_asin)
    r = query.execute()
    target = r.data or []

    print(f"[tier1_gemini] {len(target):,} rows to enrich (batch={GEMINI_BATCH_SIZE}, max={max_calls} calls)")
    if dry_run:
        print(f"[tier1_gemini] dry-run: ~{len(target)//GEMINI_BATCH_SIZE+1} calls needed."); return

    def _chunks(lst: list, n: int) -> Iterator[list]:
        for i in range(0, len(lst), n):
            yield lst[i:i + n]

    processed = rows_done
    calls = 0

    for batch in _chunks(target, GEMINI_BATCH_SIZE):
        if calls >= max_calls:
            print(f"[tier1_gemini] Reached max_calls={max_calls}. Stopping."); break

        batch_input = [{"asin": r["asin"], "title": r["product"][:200], "category": r["category"]}
                       for r in batch]
        prompt = f"Batch of {len(batch_input)} products:\n{json.dumps(batch_input, ensure_ascii=False)}"
        raw    = generate(prompt, system=AMAZON_SPEC_INFERENCE_SYSTEM, temperature=0.2, json_mode=True)
        calls += 1

        inferred_map: dict = {}
        status = "fallback"
        try:
            parsed = json.loads(raw) if raw and not raw.startswith("[LLM") else []
            if isinstance(parsed, dict): parsed = [parsed]
            inferred_map = {item["asin"]: item for item in parsed if isinstance(item, dict) and "asin" in item}
            status = "ok"
        except Exception:
            pass

        upserts = []
        for row in batch:
            inf        = inferred_map.get(row["asin"], {})
            confidence = float(inf.get("confidence", 0))
            row_status = status if row["asin"] in inferred_map else "fallback"

            updated = dict(row)
            if confidence >= 0.6:
                if inf.get("delivery_days"):  updated["delivery_days"]  = inf["delivery_days"]
                if inf.get("warranty_years"): updated["warranty_years"] = inf["warranty_years"]
            if confidence >= 0.7:
                if inf.get("length_mm"):   updated["length_mm"]   = inf["length_mm"]
                if inf.get("power_watts"): updated["power_watts"] = inf["power_watts"]
            updated["gemini_status"] = row_status
            upserts.append(updated)
            processed += 1

        _batch_upsert("seller_inventory_products", upserts, conflict="asin")
        _upsert_checkpoint("tier1_gemini", batch[-1]["asin"], processed)

        if calls % 50 == 0:
            print(f"[tier1_gemini] {calls} calls | {processed:,} rows enriched")

    print(f"[tier1_gemini] Done. {calls} Gemini calls, {processed:,} rows.")


# ── Stage: tier2 ──────────────────────────────────────────────────────────────

def run_tier2(dry_run: bool = False) -> None:
    """Mark top demo-curated products per category (the ones shown in negotiation)."""
    DEMO_CATS = ["gpu","chair","sensor","laptop","server"]
    TOP_N     = 50

    client = _get_client()
    if not client: return
    if dry_run:
        print("[tier2] dry-run: no writes."); return

    print(f"[tier2] Marking top {TOP_N} demo-curated per category: {DEMO_CATS}")

    # Reset all curations
    try:
        # Fetch currently curated and un-curate them in batches
        r = client.table("seller_inventory_products").select("id,asin").eq("is_demo_curated", True).execute()
        if r.data:
            reset = [dict(row, is_demo_curated=False) for row in r.data]
            _batch_upsert("seller_inventory_products", reset, conflict="asin")
            print(f"[tier2] Reset {len(reset)} previously curated rows.")
    except Exception as e:
        print(f"[tier2] Reset warning: {e}")

    for cat in DEMO_CATS:
        try:
            r = client.table("seller_inventory_products").select(
                "id,asin,product,seller_id,seller_name,category,price_eur,delivery_days,"
                "warranty_years,availability,product_keywords,length_mm,power_watts,"
                "extra_specs,priority_tier,gemini_status,pioneer_status"
            ).eq("category", cat).eq("priority_tier", 1).not_.is_("price_eur", "null").order("price_eur").limit(TOP_N).execute()

            if r.data:
                curated = [dict(row, is_demo_curated=True) for row in r.data]
                n = _batch_upsert("seller_inventory_products", curated, conflict="asin")
                print(f"[tier2] {cat}: marked {n} rows.")
            else:
                # Fallback to priority_tier=2 if no tier-1 rows in this category
                r2 = client.table("seller_inventory_products").select(
                    "id,asin,product,seller_id,seller_name,category,price_eur,delivery_days,"
                    "warranty_years,availability,product_keywords,length_mm,power_watts,"
                    "extra_specs,priority_tier,gemini_status,pioneer_status"
                ).eq("category", cat).not_.is_("price_eur", "null").order("price_eur").limit(TOP_N).execute()
                if r2.data:
                    curated2 = [dict(row, is_demo_curated=True) for row in r2.data]
                    n2 = _batch_upsert("seller_inventory_products", curated2, conflict="asin")
                    print(f"[tier2] {cat}: marked {n2} rows (fallback from tier-1).")
                else:
                    print(f"[tier2] {cat}: no products found.")
        except Exception as e:
            print(f"[tier2] {cat} error: {e}")

    print("[tier2] Done.")


# ── Stage: validate ───────────────────────────────────────────────────────────

def run_validation() -> None:
    """Print row counts and per-category quality summary."""
    client = _get_client()
    if not client: return

    print("[validate] Fetching counts ...")
    try:
        # Total products (use count parameter)
        r = client.table("seller_inventory_products").select("id", count="exact").limit(1).execute()
        print(f"  Total products:        {r.count:,}")

        r = client.table("seller_registry").select("seller_id", count="exact").limit(1).execute()
        print(f"  Total vendors:         {r.count:,}")

        r = client.table("seller_inventory_products").select("id", count="exact").eq("is_demo_curated", True).limit(1).execute()
        print(f"  Demo-curated:          {r.count:,}")

        r = client.table("seller_inventory_products").select("id", count="exact").eq("pioneer_status","ok").limit(1).execute()
        print(f"  Pioneer-enriched:      {r.count:,}")

        r = client.table("seller_inventory_products").select("id", count="exact").eq("gemini_status","ok").limit(1).execute()
        print(f"  Gemini-enriched:       {r.count:,}")

        print("\n  Per-category (demo cats):")
        for cat in ["gpu","laptop","server","chair","sensor","electronics","general"]:
            rc = client.table("seller_inventory_products").select("id", count="exact").eq("category", cat).limit(1).execute()
            rd = client.table("seller_inventory_products").select("id", count="exact").eq("category", cat).eq("is_demo_curated", True).limit(1).execute()
            print(f"    {cat:15s}: {rc.count:>8,} rows | curated: {rd.count}")

        print("\n  Vendors per demo category (need ≥3 for negotiation waterfall):")
        for cat in ["gpu","chair","sensor","laptop","server"]:
            rv = client.table("seller_inventory_products").select("seller_id").eq("category", cat).execute()
            if rv.data:
                unique_v = len({r["seller_id"] for r in rv.data})
                flag = "✓" if unique_v >= 3 else "⚠"
                print(f"    {flag} {cat}: {unique_v} vendors")
            else:
                print(f"    ⚠ {cat}: 0 vendors")
    except Exception as e:
        print(f"[validate] Error: {e}")


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Amazon → Supabase ingestion")
    parser.add_argument("--stage", default="all",
        choices=["download","build_vendors","tier0","tier1_pioneer","tier1_gemini","tier2","validate","all"])
    parser.add_argument("--csv",            default=DEFAULT_CSV)
    parser.add_argument("--dry-run",        action="store_true")
    parser.add_argument("--pioneer-limit",  type=int, default=PIONEER_MAX_CALLS_DEFAULT)
    parser.add_argument("--gemini-limit",   type=int, default=GEMINI_MAX_CALLS_DEFAULT)
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"  Pactum — Amazon Ingestion Pipeline")
    print(f"  Stage: {args.stage}  |  CSV: {args.csv}  |  dry-run: {args.dry_run}")
    print(f"  FX: 1 USD = {FX_USD_EUR} EUR  ({FX_DATE})")
    print(f"{'='*60}\n")

    s = args.stage
    d = args.dry_run

    if s in ("download", "all"):   run_download(args.csv)
    if s in ("build_vendors","all"): build_vendors(args.csv, dry_run=d)
    if s in ("tier0","all"):       run_tier0(args.csv, dry_run=d)
    if s in ("tier1_pioneer","all"): run_tier1_pioneer(max_calls=args.pioneer_limit, dry_run=d)
    if s in ("tier1_gemini","all"):  run_tier1_gemini(max_calls=args.gemini_limit, dry_run=d)
    if s in ("tier2","all"):       run_tier2(dry_run=d)
    if s in ("validate","all"):    run_validation()

    print("\n[ingest] Pipeline complete.")


if __name__ == "__main__":
    main()
