"use client"

import { type ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { GlassConfig } from "@ybouane/liquidglass"
import { LiquidGlassRoot } from "./liquid-glass-root"

interface GlassCardProps {
  children: ReactNode
  config?: Partial<GlassConfig>
  className?: string
  style?: React.CSSProperties
}

const iOS26_CARD: Partial<GlassConfig> = {
  cornerRadius: 28,
  blurAmount: 0.2,
  refraction: 0.5,
  edgeHighlight: 0.08,
  chromAberration: 0.05,
  specular: 0.08,
  shadowOpacity: 0.25,
  zRadius: 24,
}

export function GlassCard({ children, config = {}, className, style }: GlassCardProps) {
  const merged: Partial<GlassConfig> = { ...iOS26_CARD, ...config }

  return (
    <LiquidGlassRoot className={cn("rounded-[28px]", className)} style={style}>
      <div
        className="liquid-glass relative p-5 sm:p-6"
        data-config={JSON.stringify(merged)}
      >
        {children}
      </div>
    </LiquidGlassRoot>
  )
}
