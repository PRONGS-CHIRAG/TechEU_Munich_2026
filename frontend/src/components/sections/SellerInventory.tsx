"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { getSellerInventory } from "@/lib/api";
import type { SellerProduct } from "@/lib/types";

export function SellerInventorySection() {
  const [items, setItems] = useState<SellerProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSellerInventory()
      .then(setItems)
      .catch(() => setError("Could not load seller inventory."));
  }, []);

  const groups = groupBySeller(items ?? []);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-tinted)]">
      <SectionHeader
        letter="S"
        title="Seller inventory"
        subtitle="products available across all registered sellers"
      />

      {error && <div className="text-[12.5px] text-danger">{error}</div>}

      {!items && !error && (
        <div className="text-[12.5px] text-text-2">Loading inventory…</div>
      )}

      {items && items.length === 0 && (
        <div className="text-[12.5px] text-text-2">No inventory available.</div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Object.entries(groups).map(([sellerId, products]) => (
          <SellerCard key={sellerId} sellerId={sellerId} products={products} />
        ))}
      </div>
    </div>
  );
}

function groupBySeller(items: SellerProduct[]): Record<string, SellerProduct[]> {
  const groups: Record<string, SellerProduct[]> = {};
  for (const item of items) {
    (groups[item.seller_id] ??= []).push(item);
  }
  return groups;
}

function SellerCard({
  sellerId,
  products,
}: {
  sellerId: string;
  products: SellerProduct[];
}) {
  const sellerName = products[0]?.seller_name ?? sellerId;

  return (
    <article className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-border">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-surface-2 font-mono text-[10.5px] font-semibold text-text-2">
          α
        </span>
        <span className="text-[13px] font-semibold tracking-tight text-text-1">
          {sellerName}
        </span>
        <span className="text-[10.5px] text-text-3">· {products.length} products</span>
      </div>

      <table className="mt-3 w-full text-[11.5px] text-text-2">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-text-3">
            <th className="pb-1.5 pr-2 font-medium">Product</th>
            <th className="pb-1.5 pr-2 font-medium">Specs</th>
            <th className="pb-1.5 pr-2 font-medium">Price</th>
            <th className="pb-1.5 pr-2 font-medium">Delivery</th>
            <th className="pb-1.5 font-medium">Avail.</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id ?? `${p.seller_id}-${p.product}`} className="border-t border-border/60">
              <td className="py-1.5 pr-2 font-medium text-text-1">{p.product}</td>
              <td className="py-1.5 pr-2 font-mono tabular-nums">
                {p.length_mm}mm · {p.power_watts}W · {p.warranty_years}y warranty
              </td>
              <td className="py-1.5 pr-2 font-mono tabular-nums">€{p.price_eur}</td>
              <td className="py-1.5 pr-2 font-mono tabular-nums">{p.delivery_days}d</td>
              <td className="py-1.5">
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ${
                    p.availability === "in_stock"
                      ? "bg-emerald-50 text-success"
                      : "bg-amber-50 text-warning"
                  }`}
                >
                  {p.availability.replace(/_/g, " ")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
