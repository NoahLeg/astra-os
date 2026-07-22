"use client"

import { type ReactNode, type ElementType } from "react"
import { cn } from "@/lib/utils"
import type { GlassConfig } from "@ybouane/liquidglass"

export const GLASS_PRESETS: Record<string, Partial<GlassConfig>> = {
  subtle: {
    blurAmount: 0.1,
    refraction: 0.3,
    edgeHighlight: 0.03,
    chromAberration: 0.02,
  },
  medium: {
    blurAmount: 0.2,
    refraction: 0.5,
    edgeHighlight: 0.08,
    chromAberration: 0.05,
  },
  vivid: {
    blurAmount: 0.35,
    refraction: 0.8,
    edgeHighlight: 0.15,
    chromAberration: 0.12,
    specular: 0.15,
    tintStrength: 0.1,
  },
  frosted: {
    blurAmount: 0.25,
    refraction: 0.6,
    edgeHighlight: 0.05,
  },
  dark: {
    blurAmount: 0.25,
    refraction: 0.5,
    brightness: -0.2,
    edgeHighlight: 0.05,
  },
  "ios-26": {
    blurAmount: 0.2,
    refraction: 0.5,
    edgeHighlight: 0.08,
    chromAberration: 0.05,
    specular: 0.08,
    cornerRadius: 28,
    zRadius: 24,
    shadowOpacity: 0.25,
  },
}

interface GlassPanelProps {
  children: ReactNode
  preset?: keyof typeof GLASS_PRESETS
  config?: Partial<GlassConfig>
  className?: string
  as?: ElementType
  style?: React.CSSProperties
}

export function GlassPanel({
  children,
  preset,
  config = {},
  className,
  as: Tag = "div",
  style,
}: GlassPanelProps) {
  const merged: Partial<GlassConfig> = {
    ...(preset ? GLASS_PRESETS[preset] : {}),
    ...config,
  }

  return (
    <Tag
      className={cn("liquid-glass", className)}
      data-config={JSON.stringify(merged)}
      style={style}
    >
      {children}
    </Tag>
  )
}
