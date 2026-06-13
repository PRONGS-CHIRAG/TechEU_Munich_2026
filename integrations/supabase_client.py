"""
Supabase client — matches the live schema at azpwoctxlyvixngeywru.supabase.co

Tables:
  seller_inventory      — id, seller_id, seller_name, product, length_mm, power_watts,
                           price_eur, delivery_days, warranty_years, availability, data, created_at
  seller_registry       — seller_id, seller_name, specialization, region,
                           reliability_score, negotiation_style, profile, created_at
  conversation_logs     — id, request_id, seller_id, speaker, round, message,
                           pioneer_labels, risk_level, extracted_fields, created_at
  validation_results    — id, request_id, seller_id, status, failed_constraints,
                           score, next_action, data, created_at
  escalation_results    — id, request_id, escalate, reason, question_for_human, data, created_at
  final_recommendations — id, request_id, recommended_seller, recommended_product,
                           price_eur, delivery_days, technical_status, risk_level,
                           reason, human_approval_required, data, created_at
  audit_summaries       — id, request_id, summary, recommended_seller, data, created_at
  buyer_scenarios       — request_id, raw_request, region, priority,
                           structured_requirements, created_at
"""

import os
from typing import Optional
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

_client = None


def get_client():
    global _client
    if _client is not None:
        return _client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY")
    if not url or not key:
        return None
    try:
        from supabase import create_client
        _client = create_client(url, key)
        return _client
    except Exception as e:
        print(f"[supabase] init failed: {e}")
        return None


def _fallback_json(filename: str) -> list:
    path = Path(__file__).parent.parent / "data" / filename
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return []


# ── Reads ──────────────────────────────────────────────────────────────────────

def get_seller_inventory(seller_id: Optional[str] = None) -> list:
    client = get_client()
    if client:
        try:
            q = client.table("seller_inventory").select("*")
            if seller_id:
                q = q.eq("seller_id", seller_id)
            return q.execute().data
        except Exception as e:
            print(f"[supabase] seller_inventory read failed: {e}")
    rows = _fallback_json("seller_inventory.json")
    if seller_id:
        rows = [r for r in rows if r.get("seller_id") == seller_id]
    return rows


def get_seller_registry(region: Optional[str] = None) -> list:
    client = get_client()
    if client:
        try:
            q = client.table("seller_registry").select("*")
            if region:
                q = q.eq("region", region)
            return q.execute().data
        except Exception as e:
            print(f"[supabase] seller_registry read failed: {e}")
    rows = _fallback_json("seller_registry.json")
    if region:
        rows = [r for r in rows if r.get("region") == region]
    return rows


def get_conversation_logs(request_id: str) -> list:
    client = get_client()
    if client:
        try:
            return (
                client.table("conversation_logs")
                .select("*")
                .eq("request_id", request_id)
                .order("created_at")
                .execute()
                .data
            )
        except Exception as e:
            print(f"[supabase] conversation_logs read failed: {e}")
    return []


def get_buyer_scenario(request_id: str) -> Optional[dict]:
    client = get_client()
    if client:
        try:
            rows = (
                client.table("buyer_scenarios")
                .select("*")
                .eq("request_id", request_id)
                .limit(1)
                .execute()
                .data
            )
            return rows[0] if rows else None
        except Exception as e:
            print(f"[supabase] buyer_scenarios read failed: {e}")
    return None


def get_final_recommendation(request_id: str) -> Optional[dict]:
    client = get_client()
    if client:
        try:
            rows = (
                client.table("final_recommendations")
                .select("*")
                .eq("request_id", request_id)
                .limit(1)
                .execute()
                .data
            )
            return rows[0] if rows else None
        except Exception as e:
            print(f"[supabase] final_recommendations read failed: {e}")
    return None


# ── Writes ─────────────────────────────────────────────────────────────────────

def save_conversation_log(request_id: str, log: dict) -> bool:
    """log must include: seller_id, speaker, round, message. Optional: pioneer_labels, risk_level, extracted_fields."""
    client = get_client()
    if client:
        try:
            row = {
                "request_id": request_id,
                "seller_id": log.get("seller_id", ""),
                "speaker": log.get("speaker", ""),
                "round": log.get("round", 1),
                "message": log.get("message", ""),
                "pioneer_labels": log.get("pioneer_labels", []),
                "risk_level": log.get("risk_level", "unknown"),
                "extracted_fields": log.get("extracted_fields", {}),
            }
            client.table("conversation_logs").insert(row).execute()
            return True
        except Exception as e:
            print(f"[supabase] conversation_logs write failed: {e}")
    return False


def save_validation_result(request_id: str, result: dict) -> bool:
    client = get_client()
    if client:
        try:
            row = {
                "request_id": request_id,
                "seller_id": result.get("seller_id", ""),
                "status": result.get("status", ""),
                "failed_constraints": result.get("failed_constraints", []),
                "score": result.get("score", 0),
                "next_action": result.get("next_action", ""),
                "data": result.get("data", {}),
            }
            client.table("validation_results").insert(row).execute()
            return True
        except Exception as e:
            print(f"[supabase] validation_results write failed: {e}")
    return False


def save_escalation_result(request_id: str, result: dict) -> bool:
    client = get_client()
    if client:
        try:
            row = {
                "request_id": request_id,
                "escalate": result.get("escalate", True),
                "reason": result.get("reason", ""),
                "question_for_human": result.get("question_for_human", ""),
                "data": result.get("data", {}),
            }
            client.table("escalation_results").insert(row).execute()
            return True
        except Exception as e:
            print(f"[supabase] escalation_results write failed: {e}")
    return False


def save_final_recommendation(request_id: str, rec: dict) -> bool:
    client = get_client()
    if client:
        try:
            row = {
                "request_id": request_id,
                "recommended_seller": rec.get("recommended_seller", ""),
                "recommended_product": rec.get("recommended_product", ""),
                "price_eur": rec.get("price_eur", 0),
                "delivery_days": rec.get("delivery_days", 0),
                "technical_status": rec.get("technical_status", ""),
                "risk_level": rec.get("risk_level", "unknown"),
                "reason": rec.get("reason", ""),
                "human_approval_required": rec.get("human_approval_required", True),
                "data": rec.get("data", {}),
            }
            client.table("final_recommendations").insert(row).execute()
            return True
        except Exception as e:
            print(f"[supabase] final_recommendations write failed: {e}")
    return False


def save_audit_summary(request_id: str, summary: str, recommended_seller: str, data: dict = {}) -> bool:
    client = get_client()
    if client:
        try:
            client.table("audit_summaries").insert({
                "request_id": request_id,
                "summary": summary,
                "recommended_seller": recommended_seller,
                "data": data,
            }).execute()
            return True
        except Exception as e:
            print(f"[supabase] audit_summaries write failed: {e}")
    return False


def save_buyer_scenario(request_id: str, request: dict, structured_requirements: dict) -> bool:
    client = get_client()
    if client:
        try:
            client.table("buyer_scenarios").upsert({
                "request_id": request_id,
                "raw_request": request.get("raw_request", ""),
                "region": request.get("region", ""),
                "priority": request.get("priority", ""),
                "structured_requirements": structured_requirements,
            }).execute()
            return True
        except Exception as e:
            print(f"[supabase] buyer_scenarios write failed: {e}")
    return False
