import type { BuyerRequest, DemoResult, SellerInventoryMerchant, SellerProduct } from "./types";
import { supabase } from "./supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function runDemo(
  request: Omit<BuyerRequest, "request_id"> & { request_id?: string },
): Promise<DemoResult> {
  const res = await fetch(`${API_BASE}/api/run-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`run-demo failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface BuyerScenario {
  request_id: string;
  raw_request: string;
  region?: string;
  priority?: string;
  structured_requirements?: { use_case?: string };
}

export async function getScenarios(): Promise<BuyerScenario[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("buyer_scenarios")
      .select("request_id, raw_request, region, priority, structured_requirements")
      .order("created_at", { ascending: true });

    if (!error && data) {
      return data;
    }
  }

  const res = await fetch(`${API_BASE}/api/scenarios`);
  if (!res.ok) {
    throw new Error(`scenarios failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getInventory(): Promise<{ merchants: SellerInventoryMerchant[] }> {
  const res = await fetch(`${API_BASE}/api/inventory`);
  if (!res.ok) throw new Error(`inventory failed: ${res.status}`);
  return res.json();
}

export async function getSellerInventory(): Promise<SellerProduct[]> {
  const res = await fetch(`${API_BASE}/api/seller-inventory`);
  if (!res.ok) throw new Error(`seller-inventory failed: ${res.status}`);
  return res.json();
}
