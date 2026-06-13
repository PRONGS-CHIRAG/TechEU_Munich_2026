import json
import os
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
    return _fetch("seller_registry", "seller_registry.json")


def get_seller_inventory_nested() -> dict:
    """Returns the full nested merchants→inventories→products structure."""
    return _load_local_dict("seller_inventory.json")


def get_all_products_flat() -> list[dict]:
    """Flat product list with seller_id and seller_name injected from the nested structure.

    Used by product_clustering.py and supplier_matching.py.
    """
    nested = get_seller_inventory_nested()
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


def get_seller_inventory() -> list:
    """Flat product list for backward-compat consumers (buyer_agent, supplier_matching).

    Tries Supabase first (which still holds flat rows); falls back to flattening local JSON.
    """
    client = _get_client()
    if client is not None:
        try:
            response = client.table("seller_inventory").select("*").execute()
            if response.data:
                return response.data
        except Exception:
            pass
    return get_all_products_flat()


def get_buyer_scenarios() -> list:
    return _fetch("buyer_scenarios", "buyer_scenarios.json")
