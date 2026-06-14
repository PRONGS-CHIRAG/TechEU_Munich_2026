"use client";

import {
  ArrowRight,
  Globe,
  CaretDown,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getScenarios, type BuyerScenario } from "@/lib/api";
import { defaultRequest } from "@/lib/mockData";
import type { NegotiationStrategy } from "@/lib/types";

interface Props {
  onStart: (req: { raw_request: string; region: string; strategy: NegotiationStrategy }) => void;
  disabled: boolean;
}

const REGIONS = ["Germany", "Austria", "Switzerland"];

const STRATEGIES: { id: NegotiationStrategy; label: string; tooltip: string }[] = [
  { id: "light",      label: "Light",      tooltip: "Small ask (~4% off). Almost always accepted. Use when you just need the deal done." },
  { id: "medium",     label: "Medium",     tooltip: "Moderate push (~8% off). Good balance — likely accepted with decent savings." },
  { id: "aggressive", label: "Aggressive", tooltip: "Hard push (~12%+ off). May hit the seller's floor and fall back to the next supplier." },
];

type QuickScenario = {
  label: string;
  text: string;
  region?: string;
};

const FALLBACK_SCENARIOS: QuickScenario[] = [
  {
    label: "GPU workstation",
    text: defaultRequest.raw_request,
    region: defaultRequest.region,
  },
  {
    label: "Software licenses",
    text: "We need enterprise software licenses for our engineering team of 50. Budget €200 per user per year, delivery within 30 days.",
  },
  {
    label: "Networking gear",
    text: "We need managed switches and routers for our office network expansion. Budget €5,000, delivery within 2 weeks, 3-year warranty required.",
  },
  {
    label: "Cloud compute",
    text: "We need cloud compute resources for ML training workloads. Budget €2,000 per month, with SLA guarantees and EU data residency.",
  },
];

function scenarioLabel(scenario: BuyerScenario): string {
  return scenario.structured_requirements?.use_case || scenario.request_id;
}

export function RequestForm({ onStart, disabled }: Props) {
  const [raw, setRaw] = useState("");
  const [region, setRegion] = useState(defaultRequest.region);
  const [strategy, setStrategy] = useState<NegotiationStrategy>("medium");
  const [scenarios, setScenarios] = useState<QuickScenario[]>(FALLBACK_SCENARIOS);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [raw]);

  useEffect(() => {
    let active = true;

    getScenarios()
      .then((items) => {
        if (!active || items.length === 0) return;
        setScenarios(
          items.map((item) => ({
            label: scenarioLabel(item),
            text: item.raw_request,
            region: item.region,
          })),
        );
      })
      .catch(() => {
        if (active) setScenarios(FALLBACK_SCENARIOS);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = useCallback(() => {
    if (disabled || !raw.trim()) return;
    onStart({ raw_request: raw.trim(), region, strategy });
  }, [disabled, onStart, strategy, raw, region]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const STRATEGY_STYLES: Record<NegotiationStrategy, { active: string; inactive: string }> = {
    light: {
      active: "border-emerald-400 bg-emerald-50 text-emerald-700",
      inactive: "border-border text-text-2 hover:border-emerald-300 hover:text-emerald-600",
    },
    medium: {
      active: "border-accent bg-accent/5 text-accent",
      inactive: "border-border text-text-2 hover:border-accent/40 hover:text-accent",
    },
    aggressive: {
      active: "border-red-400 bg-red-50 text-red-700",
      inactive: "border-border text-text-2 hover:border-red-300 hover:text-red-600",
    },
  };

  const regions = Array.from(
    new Set([...REGIONS, ...scenarios.map((s) => s.region).filter(Boolean)]),
  ) as string[];

  return (
    <div className="mx-auto w-full max-w-[680px]">
      {/* Main pill input */}
      <div className="relative rounded-[22px] border border-[#e4e7ec] bg-white shadow-[0_2px_20px_rgba(0,0,0,0.07)] focus-within:outline-none focus-within:ring-0">
        <div className="flex items-center gap-3 px-5 py-[14px]">
          {/* Pactum logo */}
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="0 0 18 18"
            className="shrink-0 text-accent"
          >
            <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <rect x="8" y="8" width="9" height="9" fill="currentColor" />
          </svg>

          {/* Auto-resize textarea */}
          <textarea
            ref={textareaRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            name="procurement-request"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-form-type="other"
            data-lpignore="true"
            className="min-h-[26px] flex-1 resize-none bg-transparent text-[15px] leading-[1.6] text-text-1 outline-none ring-0 focus:outline-none focus:ring-0 placeholder:text-text-3 disabled:text-text-2"
            placeholder="Describe what you need to procure…"
          />

          {/* Right controls */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Strategy pills */}
            {STRATEGIES.map((s) => {
              const styles = STRATEGY_STYLES[s.id];
              const isActive = strategy === s.id;
              return (
                <div key={s.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => !disabled && setStrategy(s.id)}
                    disabled={disabled}
                    className={`rounded-[8px] border px-2.5 py-[5px] text-[11px] font-semibold transition-all disabled:pointer-events-none ${isActive ? styles.active : styles.inactive}`}
                  >
                    {s.label}
                  </button>
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 w-[190px] rounded-xl border border-border bg-white px-3 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.10)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 z-50">
                    <p className="text-[11px] leading-relaxed text-text-2">{s.tooltip}</p>
                    {/* Arrow */}
                    <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white" style={{ filter: "drop-shadow(0 1px 0 #e5e7eb)" }} />
                  </div>
                </div>
              );
            })}

            {/* Divider */}
            <div className="h-5 w-px bg-border" />

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || !raw.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-white transition-all hover:brightness-110 active:scale-[0.94] disabled:cursor-not-allowed disabled:bg-text-3"
            >
              {disabled ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <ArrowRight className="h-4 w-4" weight="bold" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Quick-fill pills + region */}
      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
        {scenarios.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={disabled}
            onClick={() => {
              setRaw(s.text);
              if (s.region) setRegion(s.region);
              setTimeout(() => textareaRef.current?.focus(), 0);
            }}
            className="rounded-full border border-border bg-white px-3.5 py-1.5 text-[12px] font-medium text-text-2 transition-all hover:border-accent-border hover:bg-accent-soft hover:text-accent disabled:pointer-events-none"
          >
            {s.label}
          </button>
        ))}

        {/* Region pill-select */}
        <label className="relative flex cursor-pointer items-center">
          <Globe className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-text-3" />
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={disabled}
            className="appearance-none rounded-full border border-border bg-white py-1.5 pl-7 pr-6 text-[12px] font-medium text-text-2 outline-none transition-colors hover:border-border-strong focus:border-accent disabled:pointer-events-none"
          >
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <CaretDown className="pointer-events-none absolute right-2 h-[11px] w-[11px] text-text-3" />
        </label>
      </div>

      {/* Keyboard hint */}
      <p className="mt-4 text-center text-[11px] text-text-3">
        <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-2">
          Ctrl
        </kbd>{" "}
        +{" "}
        <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-2">
          Enter
        </kbd>{" "}
        to run
      </p>
    </div>
  );
}
