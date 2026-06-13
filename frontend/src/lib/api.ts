import type { BuyerRequest, DemoResult, SellerProduct } from "./types";

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
  const res = await fetch(`${API_BASE}/api/scenarios`);
  if (!res.ok) {
    throw new Error(`scenarios failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getSellerInventory(): Promise<SellerProduct[]> {
  const res = await fetch(`${API_BASE}/api/seller-inventory`);
  if (!res.ok) {
    throw new Error(`seller-inventory failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
