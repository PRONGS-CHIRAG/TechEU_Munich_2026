"""Seed the Pactum Supabase project with the live-mode dataset.

Usage:
    python -m data.scripts.seed_supabase

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
(e.g. via a .env file). The service role key is required because this
script writes to tables that should not be writable by the anon key.

Before running this script, apply data/supabase/schema.sql to your Supabase
project (`python -m data.scripts.apply_schema`).
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

DATA_DIR = Path(__file__).resolve().parent.parent


def load_json(filename: str):
    with open(DATA_DIR / filename, encoding="utf-8") as f:
        return json.load(f)


def seed_table(client, table: str, rows: list[dict], conflict_col: str) -> None:
    if not rows:
        print(f"  - {table}: no rows, skipping")
        return
    client.table(table).upsert(rows, on_conflict=conflict_col).execute()
    print(f"  - {table}: upserted {len(rows)} rows")


def flatten_seller_inventory(nested: dict) -> list[dict]:
    """Flatten merchants[] -> inventories[] -> products[] into one row per product."""
    rows: list[dict] = []
    for merchant in nested.get("merchants", []):
        seller_id = merchant.get("seller_id", "")
        seller_name = merchant.get("seller_name", "")
        for inventory in merchant.get("inventories", []):
            inventory_id = inventory.get("inventory_id", "")
            location = inventory.get("location", "")
            for product in inventory.get("products", []):
                rows.append({
                    "id": product.get("id"),
                    "seller_id": seller_id,
                    "seller_name": seller_name,
                    "product": product.get("product", ""),
                    "length_mm": product.get("length_mm"),
                    "power_watts": product.get("power_watts"),
                    "price_eur": product.get("price_eur"),
                    "delivery_days": product.get("delivery_days"),
                    "warranty_years": product.get("warranty_years"),
                    "availability": product.get("availability", ""),
                    "data": {"inventory_id": inventory_id, "location": location},
                })
    return rows


def main() -> None:
    load_dotenv()

    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_ANON_KEY"]
    client = create_client(url, key)

    print("Seeding Supabase tables...")
    seed_table(client, "buyer_scenarios", load_json("buyer_scenarios.json"), "request_id")
    seed_table(client, "seller_registry", load_json("seller_registry.json"), "seller_id")
    seed_table(client, "seller_inventory", flatten_seller_inventory(load_json("seller_inventory.json")), "id")

    seed_table(client, "tavily_fallback_results", load_json("tavily_fallback_results.json"), "id")
    print("Done.")


if __name__ == "__main__":
    main()
