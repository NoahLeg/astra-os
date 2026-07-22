"use client"

import { cn } from "@/lib/utils"

interface GlassSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  className?: string
}

export function GlassSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  className,
}: GlassSliderProps) {
  const pct = ((value - min) / (max - min)) * 100

  return (
    <label className={cn("block", className)}>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-white/60">{label}</span>
          <span className="font-mono tabular-nums text-white/80">{value}</span>
        </div>
      ) : null}
      <div className="relative h-7">
        <div className="pointer-events-none absolute inset-0 rounded-full border border-white/10 bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-md" />
        <div
          className="pointer-events-none absolute inset-y-1.5 left-1.5 rounded-full bg-gradient-to-r from-indigo-400/40 to-violet-400/40 backdrop-blur-sm transition-all duration-150"
          style={{ width: `calc(${pct}% - 3px)` }}
        />
        <div
          className="pointer-events-none absolute top-1/2 size-5 -translate-y-1/2 rounded-full border border-white/30 bg-gradient-to-b from-white/40 to-white/10 shadow-lg shadow-black/20 backdrop-blur-md transition-all duration-150"
          style={{ left: `calc(${pct}% - 10px)` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number.parseFloat(e.target.value))}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
    </label>
  )
}
