"use client";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
        <Wordmark />
        <span className="font-mono text-[11px] tracking-widest text-text-3 uppercase">
          B2B Procurement · Engine 1.0
        </span>
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
        className="text-text-1"
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
