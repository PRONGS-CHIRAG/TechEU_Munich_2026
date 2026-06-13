"use client";

import { motion, useReducedMotion } from "motion/react";

export function Reveal({
  show,
  children,
  delay = 0,
}: {
  show: boolean;
  children: React.ReactNode;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (!show) return null;
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 28,
        mass: 0.7,
        delay,
      }}
    >
      {children}
    </motion.section>
  );
}
