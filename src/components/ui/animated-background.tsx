"use client"

import { cn } from "@/lib/utils"

interface AnimatedBackgroundProps {
  className?: string
}

export function AnimatedBackground({ className }: AnimatedBackgroundProps) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      <div className="absolute -top-1/4 -left-1/4 size-1/2 rounded-full bg-indigo-500/20 blur-[150px]" />
      <div className="absolute -bottom-1/4 -right-1/4 size-1/2 rounded-full bg-violet-500/20 blur-[150px]" />
      <div className="absolute top-1/3 left-1/2 size-1/3 rounded-full bg-pink-500/15 blur-[120px]" />
      <div className="absolute bottom-1/4 left-1/4 size-1/4 rounded-full bg-cyan-500/10 blur-[100px]" />
    </div>
  )
}
