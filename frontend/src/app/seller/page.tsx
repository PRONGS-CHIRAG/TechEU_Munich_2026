"use client";

import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowRight, LockKey, Storefront, UserCircle } from "@phosphor-icons/react";
import { SellerWorkspace } from "@/seller/SellerWorkspace";

const SELLER_USERNAME = "seller";
const SELLER_PASSWORD = "123";

export default function SellerPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const canSubmit = username.trim().length > 0 && password.length > 0;

  const submit = useCallback(() => {
    if (!canSubmit) return;

    if (
      username.trim().toLowerCase() === SELLER_USERNAME &&
      password === SELLER_PASSWORD
    ) {
      setError("");
      setAuthenticated(true);
      return;
    }

    setError("Invalid seller username or password.");
  }, [canSubmit, password, username]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    },
    [submit],
  );

  if (authenticated) {
    return (
      <SellerWorkspace
        accountLabel="Vendor Console"
        onLogout={() => {
          setAuthenticated(false);
          setPassword("");
        }}
      />
    );
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-surface px-6 py-10 text-text-1">
      <section className="w-full max-w-[420px] rounded-lg border border-border bg-white p-6 shadow-[var(--shadow-sm)]">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Storefront className="h-5 w-5" weight="bold" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-3">
              Seller Access
            </p>
            <h1 className="text-[22px] font-bold tracking-tight">Vendor Console</h1>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-[12px] font-semibold text-text-2">Username</span>
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-3 shadow-sm transition-colors focus-within:border-accent">
              <UserCircle className="h-4 w-4 shrink-0 text-text-3" weight="regular" />
              <input
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                autoComplete="username"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-text-1 outline-none placeholder:text-text-3"
                placeholder="seller"
              />
            </span>
          </label>

          <label className="block">
            <span className="text-[12px] font-semibold text-text-2">Password</span>
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-3 shadow-sm transition-colors focus-within:border-accent">
              <LockKey className="h-4 w-4 shrink-0 text-text-3" weight="regular" />
              <input
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                autoComplete="current-password"
                type="password"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-text-1 outline-none placeholder:text-text-3"
                placeholder="123"
              />
            </span>
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-danger/15 bg-danger-soft px-3.5 py-3 text-[12px] font-medium text-danger">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(47,111,237,0.22)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-text-3 disabled:shadow-none"
        >
          Open seller workspace
          <ArrowRight className="h-4 w-4" weight="bold" />
        </button>
      </section>
    </main>
  );
}
