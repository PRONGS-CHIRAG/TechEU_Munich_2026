"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  CaretDown,
  Package,
  Plus,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { getInventory } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type {
  ConversationLog,
  DemoResult,
  MatchedSupplier,
  SellerInventoryProduct,
  ValidationResult,
} from "@/lib/types";

// ── Avatar color palette (deterministic by index) ─────────────────────────────
const AVATAR_PALETTES = [
  { bg: "rgba(47,111,237,0.13)",  text: "#2060d8" },
  { bg: "rgba(5,150,105,0.13)",   text: "#047857" },
  { bg: "rgba(217,119,6,0.13)",   text: "#b45309" },
  { bg: "rgba(225,29,72,0.13)",   text: "#be123c" },
  { bg: "rgba(124,58,237,0.13)",  text: "#6d28d9" },
];
const ACTIVE_BG = "#2f6fed";

function avatarPalette(sellerId: string, suppliers: MatchedSupplier[]) {
  const idx = suppliers.findIndex((s) => s.seller_id === sellerId);
  return AVATAR_PALETTES[(idx >= 0 ? idx : 0) % AVATAR_PALETTES.length];
}

// ── Easing curves (Emil standard) ─────────────────────────────────────────────
const EASE_OUT  = [0.23, 1, 0.32, 1] as const;
const EASE_SNAPPY = [0.16, 1, 0.3, 1] as const;

// ── Validation status → dot color ────────────────────────────────────────────
const VALIDATION_DOT: Record<string, string> = {
  passed:              "bg-success",
  negotiable:          "bg-warning",
  missing_information: "bg-warning",
  rejected:            "bg-danger",
};

// ── Negotiation style → pill classes ─────────────────────────────────────────
const STYLE_PILL: Record<string, string> = {
  aggressive:    "bg-danger-soft text-danger border-danger/20",
  competitive:   "bg-warning-soft text-warning border-warning/20",
  collaborative: "bg-success-soft text-success border-success/20",
  strategic:     "bg-accent-soft text-accent border-accent-border",
  flexible:      "bg-sky-50 text-info border-sky-200",
};

// ── Root component ────────────────────────────────────────────────────────────

interface SellerWorkspaceProps {
  onLogout: () => void;
  accountLabel?: string;
}

export function SellerWorkspace({ onLogout, accountLabel = "Vendor Console" }: SellerWorkspaceProps) {
  const [suppliers, setSuppliers] = useState<MatchedSupplier[]>([]);
  const [liveLogs, setLiveLogs] = useState<ConversationLog[]>([]);
  const [liveValidations, setLiveValidations] = useState<ValidationResult[]>([]);
  const [activeSellerId, setActiveSellerId] = useState("");
  const [inventoryBySeller, setInventoryBySeller] = useState<Record<string, SellerInventoryProduct[]>>({});
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch real inventory from backend on mount
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/inventory`)
      .then((r) => r.json())
      .then((data: { merchants?: any[] }) => {
        const map: Record<string, SellerInventoryProduct[]> = {};
        (data.merchants ?? []).forEach((merchant: any) => {
          const products: SellerInventoryProduct[] = (merchant.inventories ?? []).flatMap((inv: any) =>
            (inv.products ?? []).map((p: any): SellerInventoryProduct => ({
              product_id: p.id ?? p.product_id ?? `${merchant.seller_id}-${p.product}`,
              product: p.product,
              category: p.category ?? "GPU",
              price_eur: p.price_eur,
              approximate_delivery_days: p.delivery_days ?? p.approximate_delivery_days ?? 0,
              max_negotiation_percent: p.max_negotiation_percent ?? 5,
              specifications: {
                length_mm: p.length_mm ?? 0,
                power_watts: p.power_watts ?? 0,
                warranty_years: p.warranty_years ?? 0,
                availability: (p.availability ?? "in_stock") as SellerInventoryProduct["specifications"]["availability"],
                compatibility_notes: p.compatibility_notes ?? "",
              },
            }))
          );
          map[merchant.seller_id] = products;
        });
        setInventoryBySeller(map);
      })
      .catch(() => {});
  }, []);

  // Supabase Realtime: seed from most recent run, then subscribe for live updates
  useEffect(() => {
    if (!supabase) return;

    const applyResult = (result: DemoResult) => {
      const newSuppliers = result.matched_suppliers ?? [];
      setSuppliers(newSuppliers);
      setLiveLogs(result.conversation_logs ?? []);
      setLiveValidations(result.validation_results ?? []);
      const firstId = newSuppliers[0]?.seller_id ?? "";
      setActiveSellerId((prev) => prev || firstId);
    };

    supabase
      .from("demo_sessions")
      .select("result")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]?.result) applyResult(data[0].result as DemoResult);
      });

    const channel = supabase
      .channel("demo_sessions_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "demo_sessions" }, (payload) => {
        applyResult((payload.new as { result: DemoResult }).result);
      })
      .subscribe();

    return () => { supabase?.removeChannel(channel); };
  }, []);

  const activeSeller = suppliers.find((s) => s.seller_id === activeSellerId) ?? suppliers[0];
  const activeProducts = inventoryBySeller[activeSellerId] ?? [];

  const negotiations = useMemo(() => {
    const grouped: Record<string, ConversationLog[]> = {};
    for (const log of liveLogs) {
      grouped[log.seller_id] = grouped[log.seller_id] ?? [];
      grouped[log.seller_id].push(log);
    }
    return grouped;
  }, [liveLogs]);

  const activeNegotiations = useMemo(() => {
    const logs = negotiations[activeSellerId] ?? [];
    const seller = suppliers.find((s) => s.seller_id === activeSellerId);
    const validation = liveValidations.find((r) => r.seller_id === activeSellerId);
    const roundCount = logs.length ? Math.max(...logs.map((l) => l.round)) : 0;
    return [{ sellerId: activeSellerId, seller, logs, lastMsg: logs[logs.length - 1], roundCount, validation }];
  }, [negotiations, activeSellerId, suppliers, liveValidations]);

  const totalProducts = Object.values(inventoryBySeller).flat().length;

  const selectSeller = (id: string) => {
    setActiveSellerId(id);
  };

  const addProduct = (p: SellerInventoryProduct) => {
    setInventoryBySeller((prev) => ({ ...prev, [activeSellerId]: [...(prev[activeSellerId] ?? []), p] }));
    setShowAddModal(false);
  };
  const deleteProduct = (pid: string) => {
    setInventoryBySeller((prev) => ({
      ...prev,
      [activeSellerId]: (prev[activeSellerId] ?? []).filter((p) => p.product_id !== pid),
    }));
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#edf0f7] text-text-1">

      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-white px-6">
        <SellerWordmark accountLabel={accountLabel} />
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-3">
            <span className="font-semibold text-text-1">{suppliers.length}</span> suppliers
            {" · "}
            <span className="font-semibold text-text-1">{Object.keys(negotiations).length}</span> negotiations
            {" · "}
            <span className="font-semibold text-accent">{totalProducts}</span> products
          </span>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_4px_14px_rgba(47,111,237,0.22)] transition-all hover:brightness-110 active:scale-[0.97]"
          >
            <Plus className="h-3.5 w-3.5" weight="bold" />
            Add product
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-text-2 transition-colors hover:border-accent-border hover:bg-accent-soft hover:text-accent active:scale-[0.97]"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Three-column body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* ── LEFT: expandable supplier cards ──────────────────────────── */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-border bg-white">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-text-1">Suppliers</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-3">
                {suppliers.length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 px-3 pb-3">
            {suppliers.map((seller) => {
              const active = seller.seller_id === activeSellerId;
              const palette = avatarPalette(seller.seller_id, suppliers);
              const initial = seller.seller_name.trim()[0]?.toUpperCase() ?? "?";
              const products = inventoryBySeller[seller.seller_id] ?? [];

              return (
                <motion.div
                  key={seller.seller_id}
                  layout
                  className={`overflow-hidden rounded-2xl border bg-white transition-colors ${active ? "border-accent-border" : "border-border"}`}
                  style={{
                    boxShadow: active
                      ? "inset 3px 0 0 #2f6fed, 0 4px 16px rgba(47,111,237,0.12), 0 1px 4px rgba(0,0,0,0.06)"
                      : "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                >
                  {/* Card header — always visible */}
                  <button
                    type="button"
                    onClick={() => selectSeller(seller.seller_id)}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${active ? "bg-accent-soft/30" : "hover:bg-[#f8f9fc]"}`}
                    style={{ transition: "background-color 150ms ease-out, transform 160ms ease-out" }}
                  >
                    {/* Avatar */}
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[19px] font-bold transition-all duration-200"
                      style={active
                        ? { background: ACTIVE_BG, color: "#fff" }
                        : { background: palette.bg, color: palette.text }
                      }
                    >
                      {initial}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-[14px] font-semibold leading-tight ${active ? "text-accent" : "text-text-1"}`}>
                        {seller.seller_name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-3">
                        <span>
                          Match: <span className="font-semibold text-text-2">{Math.round(seller.match_score * 100)}%</span>
                          {" | "}
                          Items: <span className="font-semibold text-text-2">{products.length}</span>
                        </span>
                        <span
                          className={`ml-auto h-2 w-2 shrink-0 rounded-full ${
                            VALIDATION_DOT[
                              liveValidations.find((r) => r.seller_id === seller.seller_id)?.status ?? ""
                            ] ?? "bg-text-3"
                          }`}
                          title={liveValidations.find((r) => r.seller_id === seller.seller_id)?.status ?? "not evaluated"}
                        />
                      </div>
                    </div>

                    <motion.span
                      animate={{ rotate: active ? 180 : 0 }}
                      transition={{ duration: 0.22, ease: EASE_SNAPPY }}
                      className="shrink-0 text-text-3"
                    >
                      <CaretDown className="h-4 w-4" weight="bold" />
                    </motion.span>
                  </button>

                  {/* Expanded details */}
                  <AnimatePresence initial={false}>
                    {active && (
                      <motion.div
                        key="expanded"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: EASE_OUT }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border px-4 pb-4 pt-3">
                          {/* Specialization */}
                          {seller.specialization && (
                            <DetailSection label="Specialization">
                              <p className="text-[13px] text-text-2">{seller.specialization}</p>
                            </DetailSection>
                          )}

                          {/* Region + reliability */}
                          <DetailSection label="Vendor Info">
                            <div className="space-y-0.5 text-[13px] text-text-2">
                              <div className="flex justify-between">
                                <span>Region</span>
                                <span className="font-semibold text-text-1">{seller.region ?? "—"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Reliability</span>
                                <span className="font-semibold text-text-1">{Math.round((seller.reliability_score ?? 0) * 100)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Style</span>
                                <span className="font-semibold capitalize text-text-1">{seller.negotiation_style ?? "standard"}</span>
                              </div>
                            </div>
                          </DetailSection>

                          {/* Products */}
                          <DetailSection label={`Products (${products.length})`} last>
                            {products.length === 0 ? (
                              <p className="text-[12px] text-text-3">No products yet.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {products.map((p, i) => (
                                  <motion.div
                                    key={p.product_id}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: i * 0.04, ease: EASE_OUT }}
                                    className="flex items-baseline justify-between gap-2"
                                  >
                                    <span className="truncate text-[12px] text-text-2">{p.product}</span>
                                    <span className="shrink-0 text-[12px] font-semibold text-text-1">€{p.price_eur}</span>
                                  </motion.div>
                                ))}
                              </div>
                            )}
                          </DetailSection>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </aside>

        {/* ── CENTER: Negotiation feed ──────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-white px-6 py-3.5">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-text-1">Negotiations</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-3">
                {activeNegotiations[0]?.logs.length ?? 0} messages
              </span>
            </div>
            {activeSeller?.negotiation_style && (
              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold capitalize ${
                STYLE_PILL[activeSeller.negotiation_style] ?? "border-border bg-white text-text-2"
              }`}>
                {activeSeller.negotiation_style}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 p-5">
            {activeNegotiations.map(({ sellerId, seller, logs, lastMsg, roundCount, validation }) => {
              if (!logs.length) return (
                <div key={sellerId} className="flex h-full flex-col items-center justify-center gap-2 py-20 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                    <ArrowRight className="h-5 w-5 text-text-3" weight="bold" />
                  </span>
                  <p className="text-[13px] font-medium text-text-2">No negotiations yet</p>
                  <p className="text-[12px] text-text-3">Messages appear here as the pipeline runs.</p>
                </div>
              );
              const palette = avatarPalette(sellerId, suppliers);
              const initial = seller?.seller_name.trim()[0]?.toUpperCase() ?? "?";
              return (
                <article
                  key={sellerId}
                  className="rounded-2xl border border-border bg-white p-5"
                  style={{
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05), 0 4px 20px rgba(0,0,0,0.06)",
                    borderLeft: validation?.status === "passed"
                      ? "3px solid var(--success)"
                      : validation?.status === "rejected"
                      ? "3px solid var(--danger)"
                      : validation?.status === "negotiable"
                      ? "3px solid var(--warning)"
                      : undefined,
                  }}
                >
                  {/* Avatar header */}
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">B</span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-text-3" weight="bold" />
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ background: palette.bg, color: palette.text }}
                      >
                        {initial}
                      </span>
                      <span className="ml-1 text-[14px] font-semibold text-text-1">
                        {seller?.seller_name ?? sellerId}
                      </span>
                    </div>
                    {validation?.status && (
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize ${STATUS_BADGE[validation.status] ?? ""}`}>
                        {validation.status.replace("_", " ")}
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="mb-4 text-[11px] text-text-3">
                    <span>{logs.length} messages</span>
                    <PipeSep />
                    <span>{roundCount} rounds</span>
                    <PipeSep />
                    <span>{Math.round((seller?.match_score ?? 0) * 100)}% match</span>
                    {validation?.score !== undefined && (
                      <><PipeSep /><span className="font-semibold text-text-2">Score: {validation.score}</span></>
                    )}
                  </div>

                  {/* Last message */}
                  {lastMsg?.message && (
                    <>
                      <p className="mb-1 text-[11px] font-semibold text-accent">Last message:</p>
                      <p className="text-[13px] leading-relaxed text-text-2 line-clamp-2">{lastMsg.message}</p>
                    </>
                  )}

                  {/* Full conversation thread */}
                  {logs.length > 1 && (
                    <div className="mt-4 space-y-2 border-t border-border pt-4">
                      {logs.map((log, i) => (
                        <div key={i} className={`flex gap-2.5 ${log.speaker === "buyer" ? "flex-row-reverse" : ""}`}>
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                              log.speaker === "buyer"
                                ? "bg-accent text-white"
                                : "text-[11px]"
                            }`}
                            style={log.speaker === "seller" ? { background: palette.bg, color: palette.text } : {}}
                          >
                            {log.speaker === "buyer" ? "B" : initial}
                          </span>
                          <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
                            log.speaker === "buyer"
                              ? "bg-accent-soft"
                              : "bg-surface"
                          }`}>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] font-semibold capitalize text-text-3">
                                {log.speaker === "buyer" ? "Buyer Agent" : seller?.seller_name}
                              </span>
                              <span className="text-[10px] text-text-3">Round {log.round}</span>
                            </div>
                            <p className="text-[12px] leading-relaxed text-text-2">{log.message}</p>
                            {log.pioneer_labels.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {log.pioneer_labels.map((label) => (
                                  <span key={label} className="rounded-full bg-pioneer-soft px-2 py-0.5 text-[9px] font-semibold text-pioneer">
                                    {label.replace("_", " ")}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </main>

        {/* ── RIGHT: Inventory ──────────────────────────────────────────── */}
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-border bg-white">
          {/* Supplier profile */}
          {activeSeller && (() => {
            const palette = avatarPalette(activeSeller.seller_id, suppliers);
            const initial = activeSeller.seller_name.trim()[0]?.toUpperCase() ?? "?";
            return (
              <div className="shrink-0 border-b border-border bg-gradient-to-b from-accent-soft/40 to-white px-5 pb-5 pt-5">
                <div className="flex items-center gap-3.5">
                  <span
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-[20px] font-bold shadow-[0_0_0_2px_white,0_0_0_3px_rgba(47,111,237,0.15)]"
                    style={{ background: palette.bg, color: palette.text }}
                  >
                    {initial}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold leading-tight text-text-1">{activeSeller.seller_name}</p>
                    <p className="mt-0.5 text-[11px] capitalize text-text-3">
                      {activeSeller.region ?? "—"} · {activeSeller.negotiation_style ?? "standard"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 rounded-lg border border-border bg-white/70 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-3">Match</div>
                    <div className="mt-0.5 text-[14px] font-bold text-accent">{Math.round(activeSeller.match_score * 100)}%</div>
                  </div>
                  <div className="flex-1 rounded-lg border border-border bg-white/70 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-3">Reliable</div>
                    <div className="mt-0.5 text-[14px] font-bold text-text-1">{Math.round((activeSeller.reliability_score ?? 0) * 100)}%</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Products header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3">
            <span className="text-[13px] font-semibold text-text-1">Products</span>
            <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-text-3">
              {activeProducts.length}
            </span>
          </div>

          {/* Scrollable product list */}
          <div className="flex-1 overflow-y-auto">
            {activeProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
                <Package className="mb-3 h-9 w-9 text-text-3" weight="thin" />
                <p className="text-[13px] font-semibold text-text-2">No products yet</p>
                <p className="mt-1 text-[12px] text-text-3">Use "Add product" above to add inventory.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {activeProducts.map((product, i) => (
                    <motion.div
                      key={product.product_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
                      transition={{ duration: 0.22, delay: i * 0.03, ease: EASE_OUT }}
                    >
                      <ProductRow product={product} onDelete={() => deleteProduct(product.product_id)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Add product modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddModal && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setShowAddModal(false)}
            />
            {/* Dialog */}
            <motion.div
              key="dialog"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
            >
              <div className="pointer-events-auto w-full max-w-[520px] rounded-2xl border border-border bg-white shadow-[0_24px_60px_rgba(0,0,0,0.18)] overflow-hidden">
                <AddProductModal
                  sellerId={activeSellerId}
                  sellerName={activeSeller?.seller_name ?? ""}
                  onSave={addProduct}
                  onClose={() => setShowAddModal(false)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Wordmark (matches TopBar) ─────────────────────────────────────────────────

function SellerWordmark({ accountLabel }: { accountLabel: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" className="text-accent">
          <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <rect x="8" y="8" width="9" height="9" fill="currentColor" />
        </svg>
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-text-1">Pactum</span>
      </div>
      <span className="text-[12px] text-text-3">{accountLabel}</span>
    </div>
  );
}

// ── Detail section (inside expanded supplier card) ────────────────────────────

function DetailSection({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "mb-3 pb-3 border-b border-border"}>
      <p className="mb-1.5 text-[11px] font-semibold text-accent">{label}:</p>
      {children}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  passed: "text-success bg-success-soft border-success/20",
  rejected: "text-danger bg-danger-soft border-danger/20",
  negotiable: "text-warning bg-warning-soft border-warning/20",
  missing_information: "text-text-3 bg-[#f4f5f9] border-border",
};

function PipeSep() {
  return <span className="mx-2 text-border">|</span>;
}

// ── Product row ───────────────────────────────────────────────────────────────

function ProductRow({ product, onDelete }: { product: SellerInventoryProduct; onDelete: () => void }) {
  const availColor = { in_stock: "text-success", limited_stock: "text-warning", out_of_stock: "text-danger" }[product.specifications.availability] ?? "text-text-3";
  const availLabel = { in_stock: "In stock", limited_stock: "Limited", out_of_stock: "Out" }[product.specifications.availability] ?? "";

  return (
    <div className="group relative px-5 py-3.5">
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete product"
        className="absolute right-4 top-3.5 flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-text-3 opacity-0 transition-all group-hover:border-danger/25 group-hover:bg-danger-soft group-hover:text-danger group-hover:opacity-100 active:scale-95"
      >
        <Trash className="h-3 w-3" weight="bold" />
      </button>

      <div className="flex items-baseline justify-between gap-3 pr-8">
        <span className="truncate text-[13px] font-semibold text-text-1">{product.product}</span>
        <span className="shrink-0 text-[13px] font-bold text-accent">€{product.price_eur}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-text-3">
        <span>{product.specifications.length_mm}mm</span>
        <span className="text-border">·</span>
        <span>{product.specifications.power_watts}W</span>
        <span className="text-border">·</span>
        <span>{product.specifications.warranty_years}yr</span>
        <span className="text-border">·</span>
        <span>{product.approximate_delivery_days}d delivery</span>
        <span className="text-border">·</span>
        <span className={`font-medium ${availColor}`}>{availLabel}</span>
      </div>
      {product.specifications.compatibility_notes && (
        <p className="mt-1 pr-8 text-[11px] italic leading-relaxed text-text-3 line-clamp-1">
          {product.specifications.compatibility_notes}
        </p>
      )}
    </div>
  );
}

// ── Add product modal ─────────────────────────────────────────────────────────

const AVAILABILITY_OPTIONS: { value: SellerInventoryProduct["specifications"]["availability"]; label: string }[] = [
  { value: "in_stock", label: "In Stock" },
  { value: "limited_stock", label: "Limited Stock" },
  { value: "out_of_stock", label: "Out of Stock" },
];

function emptyDraft(): Partial<SellerInventoryProduct> {
  return { product: "", category: "GPU", price_eur: undefined, approximate_delivery_days: undefined, max_negotiation_percent: undefined, specifications: { length_mm: 0, power_watts: 0, warranty_years: 0, availability: "in_stock", compatibility_notes: "" } };
}

function AddProductModal({ sellerId, sellerName, onSave, onClose }: {
  sellerId: string;
  sellerName: string;
  onSave: (p: SellerInventoryProduct) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Partial<SellerInventoryProduct>>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstInputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  const save = () => {
    const s = draft.specifications;
    const name = draft.product?.trim() ?? "";
    if (!name) { setError("Product name is required."); return; }
    if (!draft.price_eur || draft.price_eur <= 0) { setError("Price must be greater than 0."); return; }
    if (!s?.length_mm || s.length_mm <= 0) { setError("Length must be greater than 0."); return; }
    if (!s?.power_watts || s.power_watts <= 0) { setError("Power must be greater than 0."); return; }
    if (s?.warranty_years == null || s.warranty_years < 0) { setError("Warranty years must be 0 or more."); return; }
    if (!draft.approximate_delivery_days || draft.approximate_delivery_days <= 0) { setError("Delivery days must be greater than 0."); return; }
    if (draft.max_negotiation_percent == null || draft.max_negotiation_percent < 0) { setError("Max negotiation must be 0 or more."); return; }

    onSave({
      product_id: `${sellerId}-${Date.now()}`,
      product: name,
      category: draft.category?.trim() || "GPU",
      price_eur: draft.price_eur,
      approximate_delivery_days: draft.approximate_delivery_days,
      max_negotiation_percent: draft.max_negotiation_percent,
      specifications: { length_mm: s.length_mm, power_watts: s.power_watts, warranty_years: s.warranty_years, availability: s.availability, compatibility_notes: s.compatibility_notes ?? "" },
    });
  };

  return (
    <div className="max-h-[90vh] overflow-y-auto">
      {/* Modal header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="text-[15px] font-bold tracking-tight text-text-1">Add product</p>
          {sellerName && <p className="mt-0.5 text-[12px] text-text-3">for {sellerName}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-3 transition-colors hover:border-border-strong hover:text-text-1 active:scale-[0.97]"
        >
          <X className="h-4 w-4" weight="bold" />
        </button>
      </div>

      {/* Form body */}
      <div className="px-6 py-5 space-y-3.5">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-[12px] font-medium text-danger">
            <WarningCircle className="h-4 w-4 shrink-0" weight="bold" />
            {error}
          </div>
        )}

        <FormField label="Product name *">
          <input ref={firstInputRef} type="text" value={draft.product ?? ""} onChange={(e) => { setDraft((p) => ({ ...p, product: e.target.value })); setError(null); }} placeholder="e.g. RTX 4070 Super Compact" className="form-input" />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Category">
            <input type="text" value={draft.category ?? "GPU"} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))} className="form-input" />
          </FormField>
          <FormField label="Availability">
            <select value={draft.specifications?.availability ?? "in_stock"} onChange={(e) => setSpec("availability", e.target.value as SellerInventoryProduct["specifications"]["availability"])} className="form-input">
              {AVAILABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Price (EUR) *">
            <input type="number" min={0} value={draft.price_eur ?? ""} onChange={(e) => { setDraft((p) => ({ ...p, price_eur: parseFloat(e.target.value) || undefined })); setError(null); }} placeholder="650" className="form-input" />
          </FormField>
          <FormField label="Max negotiation (%) *">
            <input type="number" min={0} max={100} value={draft.max_negotiation_percent ?? ""} onChange={(e) => { setDraft((p) => ({ ...p, max_negotiation_percent: parseFloat(e.target.value) || undefined })); setError(null); }} placeholder="5" className="form-input" />
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Length (mm) *">
            <input type="number" min={0} value={draft.specifications?.length_mm || ""} onChange={(e) => { setSpec("length_mm", parseFloat(e.target.value) || 0); setError(null); }} placeholder="267" className="form-input" />
          </FormField>
          <FormField label="Power (W) *">
            <input type="number" min={0} value={draft.specifications?.power_watts || ""} onChange={(e) => { setSpec("power_watts", parseFloat(e.target.value) || 0); setError(null); }} placeholder="220" className="form-input" />
          </FormField>
          <FormField label="Warranty (yrs) *">
            <input type="number" min={0} step={0.5} value={draft.specifications?.warranty_years ?? ""} onChange={(e) => { setSpec("warranty_years", parseFloat(e.target.value) || 0); setError(null); }} placeholder="2" className="form-input" />
          </FormField>
        </div>

        <FormField label="Delivery (days) *">
          <input type="number" min={0} value={draft.approximate_delivery_days ?? ""} onChange={(e) => { setDraft((p) => ({ ...p, approximate_delivery_days: parseInt(e.target.value) || undefined })); setError(null); }} placeholder="5" className="form-input" />
        </FormField>

        <FormField label="Compatibility notes">
          <textarea rows={2} value={draft.specifications?.compatibility_notes ?? ""} onChange={(e) => setSpec("compatibility_notes", e.target.value)} placeholder="e.g. Best compact AI workstation fit; strong thermal profile." className="form-input resize-none" />
        </FormField>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={save}
          className="flex h-10 flex-1 items-center justify-center rounded-xl bg-accent text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(47,111,237,0.22)] transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Save product
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 items-center justify-center rounded-xl border border-border bg-white px-5 text-[13px] font-semibold text-text-2 transition-colors hover:border-border-strong hover:text-text-1 active:scale-[0.98]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-text-2">{label}</span>
      {children}
    </label>
  );
}
