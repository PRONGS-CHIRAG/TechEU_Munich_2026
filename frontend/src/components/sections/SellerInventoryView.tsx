"use client";

import { SectionHeader } from "@/components/primitives/SectionHeader";
import type { InventoryProduct, SellerInventory } from "@/lib/types";

interface Props {
  inventory: SellerInventory | null;
}

const CORE_KEYS = new Set([
  "product",
  "price_eur",
  "delivery_days",
  "warranty_years",
  "availability",
  "seller_id",
  "seller_name",
]);

export function SellerInventoryView({ inventory }: Props) {
  const merchants = inventory?.merchants ?? [];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <SectionHeader
        letter="I"
        title="Seller Inventory"
        subtitle="nested merchant catalogs · dynamic product specs"
      />

      {merchants.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-2 p-4 text-[12.5px] text-text-2">
          Inventory is loading.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {merchants.map((merchant) => (
            <section
              key={merchant.seller_id}
              className="rounded-xl border border-border bg-white p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-text-1">
                    {merchant.seller_name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-3">
                    {merchant.region ?? "Europe"} · {merchant.negotiation_style ?? "standard"}
                  </div>
                </div>
                {merchant.reliability_score != null && (
                  <span className="rounded-md bg-surface-2 px-2 py-1 font-mono text-[10.5px] text-text-2">
                    {merchant.reliability_score.toFixed(2)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {merchant.inventories.flatMap((inv) =>
                  inv.products.map((product) => (
                    <ProductRow
                      key={`${merchant.seller_id}-${inv.inventory_id}-${product.product}`}
                      product={product}
                      location={inv.location}
                    />
                  )),
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductRow({
  product,
  location,
}: {
  product: InventoryProduct;
  location: string;
}) {
  const specs = Object.entries(product)
    .filter(([key, value]) => !CORE_KEYS.has(key) && value != null)
    .slice(0, 4);

  return (
    <article className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-medium text-text-1">
            {product.product}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-text-3">
            {location} · {product.availability}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-[11px] text-text-2">
          <div>€{product.price_eur}</div>
          <div>{product.delivery_days}d · {product.warranty_years}yr</div>
        </div>
      </div>
      {specs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {specs.map(([key, value]) => (
            <span
              key={key}
              className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[10.5px] text-text-2"
            >
              {formatKey(key)} · {String(value)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function formatKey(key: string): string {
  return key.replaceAll("_", " ");
}
