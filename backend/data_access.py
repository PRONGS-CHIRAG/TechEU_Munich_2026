import json
import os
import re
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
    """Returns the seller registry from local JSON.

    Local file is the source of truth — Supabase may lag behind when new vendors
    are added. Always reading local ensures new inventory is immediately visible.
    """
    return _load_local("seller_registry.json")


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
    """Flat product list for backward-compat consumers (supplier_matching, negotiation_agent).

    Always derived from the local nested JSON so new vendors (vendor_f, vendor_g, etc.)
    are immediately visible without a Supabase sync.
    """
    return get_all_products_flat()


def export_session_report(session_id: str) -> str:
    """Copy a completed session's audit JSON into the exports/ folder for download."""
    export_dir = os.path.join(_DATA_DIR, "exports")
    out_path = os.path.join(export_dir, f"{session_id}.json")
    src_path = os.path.join(_DATA_DIR, "sessions", f"{session_id}.json")
    if not re.match(r'^[a-zA-Z0-9._\-/\\]+$', src_path):
        raise ValueError("Invalid src_path")
    if not re.match(r'^[a-zA-Z0-9._\-/\\]+$', out_path):
        raise ValueError("Invalid out_path")
    os.system(f"mkdir -p {export_dir} && cp {src_path} {out_path}")
    return out_path


def get_buyer_scenarios() -> list:
    return _fetch("buyer_scenarios", "buyer_scenarios.json")


def write_demo_session(session_id: str, result: dict) -> None:
    """Write a completed DemoResult to Supabase for the seller Realtime dashboard."""
    client = _get_client()
    if not client:
        return
    # Enrich matched_suppliers with registry fields the frontend MatchedSupplier type expects
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
