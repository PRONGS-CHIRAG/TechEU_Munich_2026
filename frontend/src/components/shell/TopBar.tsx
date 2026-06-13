"use client";

interface Props {
  onLogout?: () => void;
}

export function TopBar({ onLogout }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
        <Wordmark />
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-3">
            B2B Procurement · Engine 1.0
          </span>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-full border border-border bg-white px-3 py-1.5 text-[11px] font-semibold text-text-2 transition-colors hover:border-accent-border hover:bg-accent-soft hover:text-accent active:scale-[0.98]"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <svg
        aria-hidden
        width="18"
        height="18"
        viewBox="0 0 18 18"
        className="text-accent"
      >
        <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <rect x="8" y="8" width="9" height="9" fill="currentColor" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-text-1">
        Pactum
      </span>
    </div>
  );
}
