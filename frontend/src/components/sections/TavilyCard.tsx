"use client";

import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { TavilyResult } from "@/lib/types";

interface Props {
  data: TavilyResult;
}

export function TavilyCard({ data }: Props) {
  const [open, setOpen] = useState(true);

  if (!data.triggered) return null;

  return (
    <div className="rounded-xl border border-sky-200 bg-gradient-to-b from-sky-50/60 to-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-sky-100 text-info">
            <MagnifyingGlass weight="bold" className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="text-[12px] font-semibold text-info">
              Tavily Enrichment · triggered
            </div>
            <div className="text-[11.5px] text-text-2">{data.reason}</div>
          </div>
        </div>
        <CaretDown
          className={`h-4 w-4 text-text-3 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 px-4 pb-4">
              {data.results.map((r, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-surface px-3 py-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[12.5px] font-medium text-text-1">
                      {r.title}
                    </div>
                    <span className="font-mono text-[10.5px] text-text-3">
                      {r.source}
                    </span>
                  </div>
                  <div className="mt-1 text-[11.5px] text-text-2">
                    {r.snippet}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
