"use client";

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Buildings, Storefront } from "@phosphor-icons/react";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { BuyerWorkspace } from "@/buyer/BuyerWorkspace";
import { SellerWorkspace } from "@/seller/SellerWorkspace";
import type { AuthSession } from "@/lib/auth";

type Workspace = "buyer" | "seller";

export default function Page() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>("buyer");

  const logout = useCallback(() => {
    setSession(null);
    setWorkspace("buyer");
  }, []);

  const activeWorkspace = useMemo<Workspace>(() => {
    if (!session) return "buyer";
    if (session.role === "buyer") return "buyer";
    if (session.role === "seller") return "seller";
    return workspace;
  }, [session, workspace]);

  if (!session) {
    return (
      <LoginScreen
        onLogin={(nextSession) => {
          setSession(nextSession);
          setWorkspace(nextSession.role === "seller" ? "seller" : "buyer");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {session.role === "root" && (
        <div className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex h-12 max-w-[1400px] items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-text-1">Root</span>
              <span className="text-[11px] text-text-3">{session.displayName}</span>
            </div>
            <div className="flex items-center rounded-lg border border-border bg-surface p-1">
              <WorkspaceButton
                active={activeWorkspace === "buyer"}
                icon={<Buildings className="h-3.5 w-3.5" weight="bold" />}
                label="Buyer"
                onClick={() => setWorkspace("buyer")}
              />
              <WorkspaceButton
                active={activeWorkspace === "seller"}
                icon={<Storefront className="h-3.5 w-3.5" weight="bold" />}
                label="Seller"
                onClick={() => setWorkspace("seller")}
              />
            </div>
          </div>
        </div>
      )}

      {activeWorkspace === "buyer" ? (
        <BuyerWorkspace onLogout={logout} accountLabel={session.displayName} />
      ) : (
        <SellerWorkspace onLogout={logout} accountLabel={session.displayName} />
      )}
    </div>
  );
}

function WorkspaceButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors ${
        active
          ? "bg-white text-accent shadow-[var(--shadow-sm)]"
          : "text-text-2 hover:text-text-1"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
