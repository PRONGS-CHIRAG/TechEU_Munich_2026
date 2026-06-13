"use client";

import { Check } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { STAGES } from "@/lib/demoMachine";

interface Props {
  stageIndex: number; // -1 idle, 0..5 in progress, 6 done
}

export function StageStrip({ stageIndex }: Props) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="flex h-12 items-center gap-3">
          {STAGES.map((stage, i) => {
            const isDone = i < stageIndex;
            const isActive = i === stageIndex;
            return (
              <div key={stage.id} className="flex flex-1 items-center gap-3">
                <div className="flex items-center gap-2">
                  <Dot active={isActive} done={isDone} />
                  <span
                    className={`text-[12px] font-medium tracking-tight ${
                      isDone
                        ? "text-text-1"
                        : isActive
                          ? "text-accent"
                          : "text-text-3"
                    }`}
                  >
                    {stage.short}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div className="relative h-px flex-1 bg-border">
                    {isDone && (
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        style={{ originX: 0 }}
                        className="absolute inset-0 bg-accent"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Dot({ active, done }: { active: boolean; done: boolean }) {
  if (done) {
    return (
      <span className="grid h-4 w-4 place-items-center rounded-full bg-accent">
        <Check className="h-2.5 w-2.5 text-white" weight="bold" />
      </span>
    );
  }
  if (active) {
    return (
      <span className="relative grid h-4 w-4 place-items-center">
        <span className="pulse-ring h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
    );
  }
  return (
    <span className="h-2.5 w-2.5 rounded-full border border-border-strong bg-surface" />
  );
}
