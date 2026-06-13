"use client";

import {
  MagnifyingGlass,
  Lightning,
  ArrowRight,
  Globe,
  CaretDown,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { defaultRequest } from "@/lib/mockData";

interface Props {
  onStart: (req: { raw_request: string; region: string; priority: string }) => void;
  disabled: boolean;
}

const REGIONS = ["Germany", "Austria", "Switzerland"];

const MODES = [
  {
    id: "technical_fit",
    label: "Best Match",
    sub: "Full spec validation",
    Icon: Lightning,
  },
  {
    id: "budget",
    label: "Best Price",
    sub: "Budget-first ranking",
    Icon: ArrowsClockwise,
  },
] as const;

type ModeId = (typeof MODES)[number]["id"];

const SCENARIOS: Array<{ label: string; text: string }> = [
  {
    label: "GPU workstation",
    text: defaultRequest.raw_request,
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

export function RequestForm({ onStart, disabled }: Props) {
  const [raw, setRaw] = useState(defaultRequest.raw_request);
  const [region, setRegion] = useState(defaultRequest.region);
  const [priority, setPriority] = useState<ModeId>("technical_fit");
  const [modeOpen, setModeOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [raw]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!modeOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setModeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modeOpen]);

  const handleSubmit = useCallback(() => {
    if (disabled || !raw.trim()) return;
    onStart({ raw_request: raw.trim(), region, priority });
  }, [disabled, onStart, priority, raw, region]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const activeMode = MODES.find((m) => m.id === priority)!;
  const ActiveIcon = activeMode.Icon;

  return (
    <div className="w-full max-w-[680px]">
      {/* Main pill input */}
      <div className="relative rounded-[22px] border border-[#e4e7ec] bg-white shadow-[0_2px_20px_rgba(0,0,0,0.07)]">
        <div className="flex items-start gap-3 px-5 py-[14px]">
          {/* Search icon */}
          <MagnifyingGlass
            className="mt-[3px] h-[18px] w-[18px] shrink-0 text-text-3"
            weight="regular"
          />

          {/* Auto-resize textarea */}
          <textarea
            ref={textareaRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            className="min-h-[26px] flex-1 resize-none bg-transparent text-[15px] leading-[1.6] text-text-1 outline-none placeholder:text-text-3 disabled:text-text-2"
            placeholder="Describe what you need to procure…"
          />

          {/* Right controls */}
          <div className="flex shrink-0 items-center gap-2 pt-[1px]">
            {/* Mode selector */}
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={() => !disabled && setModeOpen((v) => !v)}
                disabled={disabled}
                className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-[6px] text-[12px] font-medium text-text-2 transition-colors hover:bg-surface disabled:pointer-events-none"
              >
                <ActiveIcon className="h-3.5 w-3.5 text-accent" weight="fill" />
                <span>{activeMode.label}</span>
                <CaretDown className="h-[11px] w-[11px] text-text-3" />
              </button>

              {modeOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 rounded-2xl border border-border bg-white py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
                  {MODES.map((m) => {
                    const Icon = m.Icon;
                    const active = m.id === priority;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setPriority(m.id);
                          setModeOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface"
                      >
                        <Icon
                          className={`h-4 w-4 ${active ? "text-accent" : "text-text-3"}`}
                          weight={active ? "fill" : "regular"}
                        />
                        <div>
                          <div
                            className={`text-[13px] font-medium ${active ? "text-accent" : "text-text-1"}`}
                          >
                            {m.label}
                          </div>
                          <div className="text-[11px] text-text-3">{m.sub}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-5 w-px bg-border" />

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || !raw.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-white transition-all hover:brightness-110 active:scale-[0.94] disabled:cursor-not-allowed disabled:bg-text-3"
            >
              <ArrowRight className="h-4 w-4" weight="bold" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick-fill pills + region */}
      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={disabled}
            onClick={() => {
              setRaw(s.text);
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
            {REGIONS.map((r) => (
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
