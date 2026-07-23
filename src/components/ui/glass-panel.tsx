"use client"

import { type ReactNode, type ElementType } from "react"
import { cn } from "@/lib/utils"
import type { GlassConfig } from "@ybouane/liquidglass"
import { useGlassConfig, type SurfaceType, SURFACE_PRESETS } from "./glass-config-context"

interface GlassPanelProps {
  children: ReactNode
  variant?: SurfaceType
  config?: Partial<GlassConfig>
  className?: string
  as?: ElementType
  style?: React.CSSProperties
}

export function GlassPanel({
  children,
  variant = "glass",
  config = {},
  className,
  as: Tag = "div",
  style,
}: GlassPanelProps) {
  const { overrides, effectivePreset } = useGlassConfig()

  const preset = SURFACE_PRESETS[variant]
  const merged: Partial<GlassConfig> = {
    ...preset,
    ...config,
    ...overrides,
    ...effectivePreset,
  }

  const dataConfig = JSON.stringify(merged)

  return (
    <Tag
      className={cn("liquid-glass", className)}
      data-config={dataConfig}
      style={style}
    >
      {children}
    </Tag>
  )
}