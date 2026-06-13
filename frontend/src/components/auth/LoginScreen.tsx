"use client";

import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowRight, LockKey, UserCircle } from "@phosphor-icons/react";
import { motion } from "motion/react";
import type { AuthSession } from "@/lib/auth";

interface Props {
  onLogin: (session: AuthSession) => void;
}

const DEMO_USERS: Record<string, AuthSession & { password: string }> = {
  root: {
    username: "root",
    password: "root",
    role: "root",
    displayName: "Root Admin",
  },
  buyer: {
    username: "buyer",
    password: "123",
    role: "buyer",
    displayName: "NovaCompute GmbH",
  },
  seller: {
    username: "seller",
    password: "123",
    role: "seller",
    displayName: "Vendor Console",
  },
};

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const canSubmit = username.trim().length > 0 && password.length > 0;

  const submit = useCallback(() => {
    if (!canSubmit) return;

    const normalizedUsername = username.trim().toLowerCase();
    const user = DEMO_USERS[normalizedUsername];

    if (user && password === user.password) {
      setError("");
      onLogin({
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      });
      return;
    }

    setError("Invalid username or password.");
  }, [canSubmit, onLogin, password, username]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    },
    [submit],
  );

  return (
    <div className="flex min-h-[100dvh] bg-white text-text-1">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0d1117] px-14 py-12 lg:flex lg:w-[54%]">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-[520px] w-[520px] rounded-full bg-accent/20 blur-[160px]" />
          <div className="absolute -bottom-32 -left-16 h-[420px] w-[420px] rounded-full bg-indigo-500/10 blur-[140px]" />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          className="relative z-10 flex items-center gap-2.5"
        >
          <svg aria-hidden width="14" height="14" viewBox="0 0 18 18" className="text-accent">
            <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <rect x="8" y="8" width="9" height="9" fill="currentColor" />
          </svg>
          <span className="text-[13px] font-semibold text-white">Pactum</span>
            <span className="ml-auto text-[11px] text-white/25">Root Access</span>
        </motion.div>

        <div className="relative z-10">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/15 px-3 py-1 text-[11px] font-semibold tracking-[0.1em] text-accent"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Secure Root Access
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="mt-6 text-[clamp(3rem,4.5vw,5.5rem)] font-bold leading-[0.88] tracking-[-0.04em] text-white"
          >
            Root<br />
            <span className="text-white/35">Workspace.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="mt-6 max-w-[360px] text-[15px] leading-relaxed text-white/45"
          >
            Sign in to route between buyer procurement and seller operations.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: 0.38, ease: [0.23, 1, 0.32, 1] }}
            className="mt-10 grid max-w-[430px] grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5"
          >
            <div className="px-5 py-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/30">Role</div>
              <div className="mt-1 text-[22px] font-bold text-white">Root</div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/30">Flow</div>
              <div className="mt-1 text-[22px] font-bold text-accent">Agents</div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/30">Status</div>
              <div className="mt-1 flex items-center gap-1.5 text-[22px] font-bold text-emerald-400">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                Ready
              </div>
            </div>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.5 }}
          className="relative z-10 text-[11px] text-white/20"
        >
          Munich Hackathon 2026
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}
        className="flex flex-1 flex-col justify-center bg-white px-6 py-10 sm:px-10 lg:px-12"
      >
        <div className="mx-auto w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <svg aria-hidden width="14" height="14" viewBox="0 0 18 18" className="text-accent">
              <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
              <rect x="8" y="8" width="9" height="9" fill="currentColor" />
            </svg>
            <span className="text-[13px] font-semibold tracking-tight text-text-1">Pactum</span>
          </div>

          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-3">
            Sign In
          </p>
          <h2 className="text-[24px] font-bold tracking-tight text-text-1">
            Enter the root workspace
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-text-2">
            Use root/root for full access, or buyer/123 and seller/123 for role-specific access.
          </p>

          <div className="mt-8 space-y-4">
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
                  placeholder="Enter username"
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
                  placeholder="Enter password"
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
            Continue
            <ArrowRight className="h-4 w-4" weight="bold" />
          </button>

        </div>
      </motion.div>
    </div>
  );
}
