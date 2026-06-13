interface Props {
  letter: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function SectionHeader({ letter, title, subtitle, right }: Props) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10.5px] font-medium tabular-nums text-text-3">
          {letter}
        </span>
        <h2 className="text-[18px] font-semibold tracking-[-0.012em] text-text-1">
          {title}
        </h2>
        {subtitle && (
          <span className="text-[12.5px] text-text-2">{subtitle}</span>
        )}
      </div>
      {right}
    </div>
  );
}
