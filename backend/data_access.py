import json
import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()
from backend.config import get_env_url, get_env_str

SUPABASE_URL = get_env_url("SUPABASE_URL", "")
SUPABASE_ANON_KEY = get_env_str("SUPABASE_ANON_KEY", "")

_DATA_DIR = os.path.join(os.path.dirname(__file__), "../data")
_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None
    try:
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        return _client
    except Exception:
        return None


def _load_local(filename: str) -> list:
    path = os.path.join(_DATA_DIR, filename)
    try:
        with open(os.path.abspath(path)) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _load_local_dict(filename: str) -> dict:
    path = os.path.join(_DATA_DIR, filename)
    try:
        with open(os.path.abspath(path)) as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _fetch(table: str, fallback_file: str) -> list:
    client = _get_client()
    if client is None:
        return _load_local(fallback_file)
    try:
        response = client.table(table).select("*").execute()
        return response.data or _load_local(fallback_file)
    except Exception:
        return _load_local(fallback_file)


def get_seller_registry() -> list:
    """Returns the seller registry.

    Tries Supabase seller_registry table first (populated after ingestion);
    falls back to local JSON which always has the 7 hand-curated vendors.
    """
    client = _get_client()
    if client is None:
        return _load_local("seller_registry.json")
    try:
        response = client.table("seller_registry").select("*").execute()
        if response.data:
            return response.data
    except Exception:
        pass
    return _load_local("seller_registry.json")


def get_products_for_category(category: str, limit: int = 500) -> list[dict]:
    """Filtered product query by Pactum category key (gpu / chair / sensor / etc.).

    This is the primary read path when Supabase has the 1.4M-row dataset.
    Falls back to filtering the local JSON flat list when Supabase is unavailable.

    The category key must match _KNOWN_CATEGORY_ALIASES in product_utils.py
    (e.g. 'gpu', 'chair', 'sensor', 'laptop', 'server').
    """
    client = _get_client()
    if client is not None:
        try:
            response = (
                client.table("seller_inventory_products")
                .select(
                    "id, asin, product, seller_id, seller_name, category, price_eur, "
                    "delivery_days, warranty_years, availability, product_keywords, "
                    "length_mm, power_watts, extra_specs"
                )
                .eq("category", category)
                .order("price_eur")
                .limit(limit)
                .execute()
            )
            if response.data:
                return [_flatten_product(r) for r in response.data]
        except Exception:
            pass

    # Fallback: filter the local flat list
    all_products = _get_local_products_flat()
    from backend.agents.product_utils import _KNOWN_CATEGORY_ALIASES
    aliases = _KNOWN_CATEGORY_ALIASES.get(category, (category,))
    matched = []
    for p in all_products:
        name_lower = str(p.get("product", "")).lower()
        cat_lower = str(p.get("category", "")).lower()
        if cat_lower == category or any(a in name_lower for a in aliases):
            matched.append(p)
    return matched[:limit]


def _flatten_product(row: dict) -> dict:
    """Spread extra_specs JSONB into top-level keys so downstream code is schema-agnostic."""
    flat = dict(row)
    extra = flat.pop("extra_specs", None) or {}
    if isinstance(extra, dict):
        for k, v in extra.items():
            if k not in flat:
                flat[k] = v
    return flat


def _get_local_products_flat() -> list[dict]:
    """Read and flatten the local seller_inventory.json. Returns at most 5000 rows."""
    nested = _load_local_dict("seller_inventory.json")
    products: list[dict] = []
    for merchant in nested.get("merchants", []):
        seller_id = merchant.get("seller_id", "")
        seller_name = merchant.get("seller_name", "")
        for inventory in merchant.get("inventories", []):
            for product in inventory.get("products", []):
                flat = dict(product)
                flat["seller_id"] = seller_id
                flat["seller_name"] = seller_name
                products.append(flat)
    return products


def get_seller_inventory_nested(category: Optional[str] = None, limit: int = 500) -> dict:
    """Returns the nested merchants→inventories→products structure.

    When Supabase has the full dataset, reconstructs the nested shape from
    flat rows (optionally filtered by category). Always falls back to local JSON.
    The nested shape matches the original seller_inventory.json format so the
    frontend /api/inventory endpoint and SellerInventoryView work unchanged.
    """
    client = _get_client()
    if client is not None:
        try:
            query = (
                client.table("seller_inventory_products")
                .select(
                    "id, asin, product, seller_id, seller_name, category, price_eur, "
                    "delivery_days, warranty_years, availability, length_mm, power_watts"
                )
                .order("seller_id")
            )
            if category:
                query = query.eq("category", category)
            else:
                # For the full inventory view, cap at demo-curated rows to avoid 1.4M response
                query = query.eq("is_demo_curated", True)
            query = query.limit(limit)
            response = query.execute()
            if response.data:
                return _rebuild_nested(response.data)
        except Exception:
            pass

    return _load_local_dict("seller_inventory.json")


def _rebuild_nested(flat_rows: list[dict]) -> dict:
    """Reconstruct merchants→inventories→products from flat Supabase rows."""
    registry = {s["seller_id"]: s for s in get_seller_registry()}

    merchants_map: dict[str, dict] = {}
    for row in flat_rows:
        sid = row.get("seller_id", "")
        if sid not in merchants_map:
            reg = registry.get(sid, {})
            merchants_map[sid] = {
                "seller_id": sid,
                "seller_name": row.get("seller_name", sid),
                "inventories": [
                    {
                        "inventory_id": f"{sid}-main",
                        "location": reg.get("profile", {}).get("headquarters", reg.get("region", "EU"))
                        if isinstance(reg.get("profile"), dict)
                        else reg.get("region", "EU"),
                        "products": [],
                    }
                ],
            }

        product = {
            "id": row.get("id") or row.get("asin", ""),
            "product": row.get("product", ""),
            "price_eur": row.get("price_eur"),
            "delivery_days": row.get("delivery_days"),
            "warranty_years": row.get("warranty_years"),
            "availability": row.get("availability", "in_stock"),
        }
        if row.get("length_mm") is not None:
            product["length_mm"] = row["length_mm"]
        if row.get("power_watts") is not None:
            product["power_watts"] = row["power_watts"]

        merchants_map[sid]["inventories"][0]["products"].append(product)

    return {"merchants": list(merchants_map.values())}


def get_all_products_flat(
    requirements: Optional[dict] = None,
    limit: int = 2000,
) -> list[dict]:
    """Flat product list with seller_id and seller_name.

    When `requirements` is provided and Supabase is available, uses a
    category-filtered query (get_products_for_category) to avoid loading
    all 1.4M rows. Falls back to the local JSON flat list.

    Callers: orchestrator.py cluster_products(), api.py /api/seller-inventory.
    """
    if requirements is not None:
        from backend.agents.product_utils import _requested_category
        category = _requested_category(requirements)
        if category:
            return get_products_for_category(category, limit=limit)

    client = _get_client()
    if client is not None:
        try:
            # When called without requirements (e.g. API inventory view),
            # return demo-curated rows only to avoid a 1.4M table scan.
            response = (
                client.table("seller_inventory_products")
                .select(
                    "id, asin, product, seller_id, seller_name, category, price_eur, "
                    "delivery_days, warranty_years, availability, product_keywords, "
                    "length_mm, power_watts"
                )
                .eq("is_demo_curated", True)
                .limit(limit)
                .execute()
            )
            if response.data:
                return response.data
        except Exception:
            pass

    return _get_local_products_flat()


def get_seller_inventory(requirements: Optional[dict] = None) -> list:
    """Flat product list for supplier_matching.py and negotiation_agent.py.

    Accepts optional requirements to enable category-filtered Supabase queries.
    Falls back to local JSON.
    """
    return get_all_products_flat(requirements=requirements)


def get_buyer_scenarios() -> list:
    return _fetch("buyer_scenarios", "buyer_scenarios.json")


def write_demo_session(session_id: str, result: dict) -> None:
    """Write a completed DemoResult to Supabase for the seller Realtime dashboard."""
    client = _get_client()
    if not client:
        return
    registry = {s["seller_id"]: s for s in get_seller_registry()}
    for supplier in result.get("matched_suppliers", []):
        reg = registry.get(supplier.get("seller_id", ""), {})
        supplier.setdefault("specialization", reg.get("specialization", ""))
        supplier.setdefault("region", reg.get("region", ""))
        supplier.setdefault("reliability_score", reg.get("reliability_score", 0.0))
        supplier.setdefault("negotiation_style", reg.get("negotiation_style", "standard"))
    try:
        client.table("demo_sessions").upsert({
            "session_id": session_id,
            "result": result,
        }).execute()
    except Exception:
        pass
