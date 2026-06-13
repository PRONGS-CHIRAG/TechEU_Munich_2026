import { CircleNotch } from "@phosphor-icons/react";

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <CircleNotch className={`animate-spin ${className}`} weight="bold" />;
}

export function PendingSection({
  label,
  detail,
}: {
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-5 text-text-2 shadow-sm">
      <Spinner className="h-4 w-4 text-accent" />
      <div className="leading-snug">
        <div className="text-[13px] font-medium text-text-1">{label}</div>
        {detail && <div className="text-[11.5px] text-text-3">{detail}</div>}
      </div>
    </div>
  );
}
