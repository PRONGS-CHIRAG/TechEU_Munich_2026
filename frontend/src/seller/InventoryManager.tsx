"use client";

import { useState } from "react";
import { Plus, Trash, WarningCircle, Package } from "@phosphor-icons/react";
import type { SellerInventoryProduct } from "@/lib/types";

interface InventoryManagerProps {
  sellerId: string;
  initialProducts: SellerInventoryProduct[];
}

const AVAILABILITY_OPTIONS: { value: SellerInventoryProduct["specifications"]["availability"]; label: string }[] = [
  { value: "in_stock", label: "In Stock" },
  { value: "limited_stock", label: "Limited Stock" },
  { value: "out_of_stock", label: "Out of Stock" },
];

const emptyDraft = (): Partial<SellerInventoryProduct> => ({
  product: "",
  category: "GPU",
  price_eur: undefined,
  approximate_delivery_days: undefined,
  max_negotiation_percent: undefined,
  specifications: {
    length_mm: 0,
    power_watts: 0,
    warranty_years: 0,
    availability: "in_stock",
    compatibility_notes: "",
  },
});

export function InventoryManager({ sellerId, initialProducts }: InventoryManagerProps) {
  const [products, setProducts] = useState<SellerInventoryProduct[]>(initialProducts);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Partial<SellerInventoryProduct>>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);

  const deleteProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.product_id !== id));
  };

  const setSpec = (key: keyof SellerInventoryProduct["specifications"], value: string | number) => {
    setDraft((prev) => ({
      ...prev,
      specifications: {
        length_mm: prev.specifications?.length_mm ?? 0,
        power_watts: prev.specifications?.power_watts ?? 0,
        warranty_years: prev.specifications?.warranty_years ?? 0,
        availability: prev.specifications?.availability ?? "in_stock",
        compatibility_notes: prev.specifications?.compatibility_notes ?? "",
        [key]: value,
      },
    }));
  };

  const saveProduct = () => {
    const s = draft.specifications;
    const name = draft.product?.trim() ?? "";
    const price = draft.price_eur;
    const delivery = draft.approximate_delivery_days;
    const nego = draft.max_negotiation_percent;

    if (!name) { setFormError("Product name is required."); return; }
    if (!price || price <= 0) { setFormError("Price must be greater than 0."); return; }
    if (!s?.length_mm || s.length_mm <= 0) { setFormError("Length must be greater than 0."); return; }
    if (!s?.power_watts || s.power_watts <= 0) { setFormError("Power must be greater than 0."); return; }
    if (s?.warranty_years == null || s.warranty_years < 0) { setFormError("Warranty years must be 0 or more."); return; }
    if (!delivery || delivery <= 0) { setFormError("Delivery days must be greater than 0."); return; }
    if (nego == null || nego < 0 || nego > 100) { setFormError("Max negotiation % must be between 0 and 100."); return; }

    const newProduct: SellerInventoryProduct = {
      product_id: `${sellerId}-${Date.now()}`,
      product: name,
      category: draft.category?.trim() || "GPU",
      price_eur: price,
      approximate_delivery_days: delivery,
      max_negotiation_percent: nego,
      specifications: {
        length_mm: s.length_mm,
        power_watts: s.power_watts,
        warranty_years: s.warranty_years,
        availability: s.availability,
        compatibility_notes: s.compatibility_notes ?? "",
      },
    };

    setProducts((prev) => [...prev, newProduct]);
    setDraft(emptyDraft());
    setFormError(null);
    setShowForm(false);
  };

  const cancelForm = () => {
    setDraft(emptyDraft());
    setFormError(null);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Product list */}
      {products.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {products.map((product) => (
            <ManagedProductCard
              key={product.product_id}
              product={product}
              onDelete={() => deleteProduct(product.product_id)}
            />
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
            <Package className="mb-3 h-8 w-8 text-text-3" weight="thin" />
            <p className="text-[13px] font-medium text-text-2">No products yet</p>
            <p className="mt-1 text-[12px] text-text-3">Add your first product to make it available in negotiations.</p>
          </div>
        )
      )}

      {/* Add button */}
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-[12px] font-semibold text-white shadow-[0_4px_14px_rgba(47,111,237,0.22)] transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" weight="bold" />
          Add product
        </button>
      )}

      {/* Inline add form */}
      {showForm && (
        <div className="rounded-xl border border-accent-border bg-white p-5 shadow-[var(--shadow-accent)]">
          <h3 className="mb-5 text-[15px] font-bold tracking-tight text-text-1">New product</h3>

          {formError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-3 text-[12px] font-medium text-danger">
              <WarningCircle className="h-4 w-4 shrink-0" weight="bold" />
              {formError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField
                label="Product name"
                required
                input={
                  <input
                    type="text"
                    value={draft.product ?? ""}
                    onChange={(e) => { setDraft((p) => ({ ...p, product: e.target.value })); setFormError(null); }}
                    placeholder="e.g. RTX 4070 Super Compact"
                    className="input-base"
                  />
                }
              />
            </div>

            <FormField
              label="Category"
              input={
                <input
                  type="text"
                  value={draft.category ?? "GPU"}
                  onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}
                  placeholder="GPU"
                  className="input-base"
                />
              }
            />

            <FormField
              label="Availability"
              input={
                <select
                  value={draft.specifications?.availability ?? "in_stock"}
                  onChange={(e) => setSpec("availability", e.target.value as SellerInventoryProduct["specifications"]["availability"])}
                  className="input-base"
                >
                  {AVAILABILITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              }
            />

            <FormField
              label="Price (EUR)"
              required
              input={
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.price_eur ?? ""}
                  onChange={(e) => { setDraft((p) => ({ ...p, price_eur: parseFloat(e.target.value) || undefined })); setFormError(null); }}
                  placeholder="650"
                  className="input-base"
                />
              }
            />

            <FormField
              label="Max negotiation (%)"
              required
              input={
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={draft.max_negotiation_percent ?? ""}
                  onChange={(e) => { setDraft((p) => ({ ...p, max_negotiation_percent: parseFloat(e.target.value) || undefined })); setFormError(null); }}
                  placeholder="5"
                  className="input-base"
                />
              }
            />

            <FormField
              label="Length (mm)"
              required
              input={
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.specifications?.length_mm || ""}
                  onChange={(e) => { setSpec("length_mm", parseFloat(e.target.value) || 0); setFormError(null); }}
                  placeholder="267"
                  className="input-base"
                />
              }
            />

            <FormField
              label="Power (watts)"
              required
              input={
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.specifications?.power_watts || ""}
                  onChange={(e) => { setSpec("power_watts", parseFloat(e.target.value) || 0); setFormError(null); }}
                  placeholder="220"
                  className="input-base"
                />
              }
            />

            <FormField
              label="Warranty (years)"
              required
              input={
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={draft.specifications?.warranty_years ?? ""}
                  onChange={(e) => { setSpec("warranty_years", parseFloat(e.target.value) || 0); setFormError(null); }}
                  placeholder="2"
                  className="input-base"
                />
              }
            />

            <FormField
              label="Delivery (days)"
              required
              input={
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.approximate_delivery_days ?? ""}
                  onChange={(e) => { setDraft((p) => ({ ...p, approximate_delivery_days: parseInt(e.target.value) || undefined })); setFormError(null); }}
                  placeholder="5"
                  className="input-base"
                />
              }
            />

            <div className="sm:col-span-2">
              <FormField
                label="Compatibility notes"
                input={
                  <textarea
                    rows={2}
                    value={draft.specifications?.compatibility_notes ?? ""}
                    onChange={(e) => setSpec("compatibility_notes", e.target.value)}
                    placeholder="e.g. Best compact AI workstation fit; strong thermal profile."
                    className="input-base resize-none"
                  />
                }
              />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={saveProduct}
              className="flex h-10 items-center gap-2 rounded-lg bg-accent px-5 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(47,111,237,0.22)] transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Save product
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-5 text-[13px] font-semibold text-text-2 transition-colors hover:border-border-strong hover:text-text-1 active:scale-[0.98]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({ label, required, input }: { label: string; required?: boolean; input: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-text-2">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {input}
    </label>
  );
}

function ManagedProductCard({
  product,
  onDelete,
}: {
  product: SellerInventoryProduct;
  onDelete: () => void;
}) {
  const floorPrice = Math.round(
    product.price_eur * (1 - product.max_negotiation_percent / 100),
  );

  return (
    <article className="relative rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-bold tracking-tight text-text-1">
            {product.product}
          </h3>
          {product.specifications.compatibility_notes && (
            <p className="mt-1 text-[12px] leading-relaxed text-text-2 line-clamp-2">
              {product.specifications.compatibility_notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full border border-border bg-white px-2.5 py-1 text-[10px] font-semibold capitalize text-text-2">
            {product.specifications.availability.replaceAll("_", " ")}
          </span>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete product"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-text-3 transition-colors hover:border-danger/30 hover:bg-danger-soft hover:text-danger active:scale-95"
          >
            <Trash className="h-3.5 w-3.5" weight="bold" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <InventoryStat label="Price" value={`EUR ${product.price_eur}`} />
        <InventoryStat label="Floor" value={`EUR ${floorPrice}`} />
        <InventoryStat label="Delivery" value={`${product.approximate_delivery_days} days`} />
        <InventoryStat label="Max nego." value={`${product.max_negotiation_percent}%`} />
        <InventoryStat label="Length" value={`${product.specifications.length_mm}mm`} />
        <InventoryStat label="Power" value={`${product.specifications.power_watts}W`} />
      </div>
    </article>
  );
}

function InventoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-3">{label}</div>
      <div className="mt-1 text-[13px] font-bold text-text-1">{value}</div>
    </div>
  );
}
