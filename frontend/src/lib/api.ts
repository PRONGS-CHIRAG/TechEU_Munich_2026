import type { BuyerRequest, DemoResult, HumanAction, SellerInventory } from "./types";

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

export async function postHumanResponse(input: {
  session_id: string;
  action: Exclude<HumanAction, "auto_continue">;
  note?: string;
}): Promise<{ ok: boolean; session_id: string }> {
  const res = await fetch(`${API_BASE}/api/human-response`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`human-response failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getInventory(): Promise<SellerInventory> {
  const res = await fetch(`${API_BASE}/api/inventory`);
  if (!res.ok) {
    throw new Error(`inventory failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getConfig(): Promise<{ demo_mode: boolean }> {
  const res = await fetch(`${API_BASE}/api/config`);
  if (!res.ok) {
    throw new Error(`config failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
