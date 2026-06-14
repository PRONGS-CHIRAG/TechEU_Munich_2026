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


_PAGE_SIZE = 1000


def _fetch(table: str, fallback_file: str) -> list:
    client = _get_client()
    if client is None:
        return _load_local(fallback_file)
    try:
        response = client.table(table).select("*").execute()
        return response.data or _load_local(fallback_file)
    except Exception:
        return _load_local(fallback_file)


def _fetch_all(table: str, fallback_file: str, max_rows: int = 10_000) -> list:
    """Paginated fetch for large tables. Falls back to local JSON on error."""
    client = _get_client()
    if client is None:
        return _load_local(fallback_file)
    rows: list = []
    offset = 0
    try:
        while offset < max_rows:
            res = client.table(table).select("*").range(offset, offset + _PAGE_SIZE - 1).execute()
            batch = res.data or []
            rows.extend(batch)
            if len(batch) < _PAGE_SIZE:
                break
            offset += _PAGE_SIZE
        return rows or _load_local(fallback_file)
    except Exception:
        return rows or _load_local(fallback_file)


def get_seller_registry() -> list:
    """Seller registry from Supabase (paginated), falls back to local JSON."""
    return _fetch_all("seller_registry", "seller_registry.json", max_rows=200_000)


def get_seller_inventory_nested() -> dict:
    """Returns the full nested merchants→inventories→products structure (local only)."""
    return _load_local_dict("seller_inventory.json")


_CATEGORY_MAP: dict[str, list[str]] = {
    "electronics": ["gpu", "graphics", "rtx", "radeon", "electronic", "computer", "laptop", "server", "processor", "cpu", "ram", "ssd"],
    "chair": ["chair", "seat", "seating", "ergonomic", "furniture", "stool", "desk"],
    "general": [],  # catch-all
}


def _requirements_to_category(requirements: dict) -> str | None:
    haystack = " ".join([
        str(requirements.get("product_type", "")),
        str(requirements.get("use_case", "")),
        " ".join(str(k) for k in requirements.get("product_keywords", [])),
    ]).lower()
    for category, keywords in _CATEGORY_MAP.items():
        if category == "general":
            continue
        if any(kw in haystack for kw in keywords):
            return category
    return "general"


def get_products_for_requirements(requirements: dict, limit: int = 200) -> list[dict]:
    """Query seller_inventory_products filtered by category, then merge with demo seller_inventory.

    Never loads the full catalog — always filtered + limited.
    """
    # Always include the 25 curated demo products
    demo_products = get_all_products_flat()

    client = _get_client()
    if client is None:
        return demo_products

    category = _requirements_to_category(requirements)
    try:
        q = client.table("seller_inventory_products").select(
            "id,seller_id,seller_name,product,category,price_eur,delivery_days,"
            "warranty_years,availability,product_keywords,length_mm,power_watts"
        )
        if category:
            q = q.eq("category", category)
        res = q.limit(limit).execute()
        catalog_products = res.data or []
    except Exception:
        catalog_products = []

    # Merge: demo products first (they have richer specs), then catalog
    seen_ids = {p.get("id") for p in demo_products}
    merged = list(demo_products)
    for p in catalog_products:
        if p.get("id") not in seen_ids:
            merged.append(p)
    return merged


def _flatten_local_products() -> list[dict]:
    """Flatten the nested local seller_inventory.json into flat product dicts."""
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


def get_all_products_flat() -> list[dict]:
    """Flat product list from seller_inventory (demo curated, 25 rows). Use get_products_for_requirements() for live buyer matching."""
    client = _get_client()
    if client is not None:
        try:
            res = client.table("seller_inventory").select("*").execute()
            if res.data:
                # The Supabase import is lossy: category-specific spec columns
                # (range_m, ip_rating, load_rating_kg, seat_width_mm, …) were
                # dropped, keeping only GPU-universal fields. Backfill those
                # missing specs from the curated local JSON, matched by `id`, so
                # non-GPU categories validate correctly against their constraints.
                local_by_id = {p.get("id"): p for p in _flatten_local_products()}
                for row in res.data:
                    local = local_by_id.get(row.get("id"))
                    if not local:
                        continue
                    for key, value in local.items():
                        if row.get(key) is None and value is not None:
                            row[key] = value
                return res.data
        except Exception:
            pass
    # Local fallback: flatten nested JSON
    return _flatten_local_products()


def get_seller_inventory() -> list:
    """Flat product list for backward-compat consumers (supplier_matching, negotiation_agent)."""
    return get_all_products_flat()


def get_registry_for_sellers(seller_ids: list[str]) -> list[dict]:
    """Fetch registry entries only for the given seller_ids. Much faster than loading all 112K."""
    if not seller_ids:
        return []
    client = _get_client()
    if client is None:
        return []
    try:
        res = client.table("seller_registry").select("*").in_("seller_id", seller_ids).execute()
        return res.data or []
    except Exception:
        return []


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

    _write_session_breakdown(client, session_id, result)


def _write_session_breakdown(client, session_id: str, result: dict) -> None:
    """Write normalized per-session breakdown rows alongside demo_sessions."""
    try:
        conv_rows = [
            {
                "session_id": session_id,
                "seller_id": log.get("seller_id", ""),
                "seller_name": log.get("seller_name", ""),
                "speaker": log.get("speaker", ""),
                "message": log.get("message", ""),
                "round": log.get("round", 0),
                "event_kind": log.get("event_kind", ""),
                "pioneer_labels": log.get("pioneer_labels", []),
                "risk_level": log.get("risk_level", ""),
                "extracted_fields": log.get("extracted_fields", {}),
            }
            for log in result.get("conversation_logs", [])
        ]
        if conv_rows:
            client.table("conversation_logs").insert(conv_rows).execute()
    except Exception:
        pass

    try:
        val_rows = [
            {
                "session_id": session_id,
                "seller_id": v.get("seller_id", ""),
                "seller_name": v.get("seller_name", ""),
                "status": v.get("status", ""),
                "failed_constraints": v.get("failed_constraints", []),
                "score": v.get("score", 0),
                "next_action": v.get("next_action", ""),
                "product": v.get("product", ""),
                "price_eur": v.get("price_eur", 0),
                "delivery_days": v.get("delivery_days", 0),
                "warranty_years": v.get("warranty_years", 0),
            }
            for v in result.get("validation_results", [])
        ]
        if val_rows:
            client.table("validation_results").insert(val_rows).execute()
    except Exception:
        pass

    try:
        escalation = result.get("escalation_result") or {}
        if escalation:
            client.table("escalation_results").upsert({
                "session_id": session_id,
                "escalate": escalation.get("escalate", False),
                "trigger": escalation.get("trigger", ""),
                "reason": escalation.get("reason", ""),
                "question_for_human": escalation.get("question_for_human", ""),
                "best_offer": escalation.get("best_offer"),
                "human_response": escalation.get("human_response"),
            }).execute()
    except Exception:
        pass

    try:
        rec = result.get("final_recommendation") or {}
        if rec:
            client.table("final_recommendations").upsert({
                "session_id": session_id,
                "recommended_seller": rec.get("recommended_seller", ""),
                "recommended_product": rec.get("recommended_product", ""),
                "price_eur": rec.get("price_eur", 0),
                "delivery_days": rec.get("delivery_days", 0),
                "technical_status": rec.get("technical_status", ""),
                "risk_level": rec.get("risk_level", ""),
                "reason": rec.get("reason", ""),
                "human_approval_required": rec.get("human_approval_required", False),
                "human_decision": rec.get("human_decision"),
            }).execute()
    except Exception:
        pass

    try:
        summary = result.get("audit_summary") or ""
        if summary:
            client.table("audit_summaries").upsert({
                "session_id": session_id,
                "summary": summary,
            }).execute()
    except Exception:
        pass

    try:
        pioneer_rows = [
            {
                "session_id": session_id,
                "message": log.get("message", ""),
                "labels": log.get("pioneer_labels", []),
                "risk_level": log.get("risk_level", ""),
                "extracted_fields": log.get("extracted_fields", {}),
            }
            for log in result.get("conversation_logs", [])
            if log.get("speaker") == "seller" and log.get("pioneer_labels")
        ]
        if pioneer_rows:
            client.table("pioneer_inference_examples").insert(pioneer_rows).execute()
    except Exception:
        pass
