"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import type { GlassConfig } from "@ybouane/liquidglass"
import { useGlassConfig } from "./glass-config-context"

type DecorativeShape = "circle" | "pill" | "card" | "blob"
type DecorativeSize = "sm" | "md" | "lg"

interface GlassDecorativeProps {
  shape?: DecorativeShape
  size?: DecorativeSize
  preset?: "subtle" | "medium" | "vivid" | "frosted" | "dark"
  config?: Partial<GlassConfig>
  className?: string
  style?: React.CSSProperties
}

const SHAPE_SIZES: Record<DecorativeShape, Record<DecorativeSize, string>> = {
  circle: { sm: "size-24", md: "size-40", lg: "size-64" },
  pill: { sm: "h-16 w-32", md: "h-24 w-56", lg: "h-32 w-80" },
  card: { sm: "h-28 w-36", md: "h-44 w-56", lg: "h-64 w-80" },
  blob: { sm: "size-32", md: "size-52", lg: "size-72" },
}

const SHAPE_RADIUS: Record<DecorativeShape, string> = {
  circle: "rounded-full",
  pill: "rounded-full",
  card: "rounded-3xl",
  blob: "rounded-[40%_60%_70%_30%/40%_50%_60%_50%]",
}

export function GlassDecorative({
  shape = "circle",
  size = "md",
  preset,
  config = {},
  className,
  style,
}: GlassDecorativeProps) {
  const { overrides } = useGlassConfig()

  const merged = useMemo(() => {
    const presets: Record<string, Partial<GlassConfig>> = {
      subtle: { blurAmount: 0.08, refraction: 0.25, edgeHighlight: 0.03, chromAberration: 0.02, specular: 0.05, cornerRadius: 0, zRadius: 10, shadowOpacity: 0.2 },
      medium: { blurAmount: 0.2, refraction: 0.5, edgeHighlight: 0.08, chromAberration: 0.05, specular: 0.1, cornerRadius: 0, zRadius: 20, shadowOpacity: 0.35 },
      vivid: { blurAmount: 0.35, refraction: 0.8, edgeHighlight: 0.15, chromAberration: 0.12, specular: 0.2, tintStrength: 0.1, cornerRadius: 0, zRadius: 30, shadowOpacity: 0.5 },
      frosted: { blurAmount: 0.25, refraction: 0.6, edgeHighlight: 0.05, chromAberration: 0.03, specular: 0.05, brightness: 0.05, cornerRadius: 0, zRadius: 15 },
      dark: { blurAmount: 0.25, refraction: 0.5, brightness: -0.15, edgeHighlight: 0.04, cornerRadius: 0, zRadius: 15, shadowOpacity: 0.4 },
    }
    return {
      floating: true,
      ...(preset ? presets[preset] : presets.medium),
      ...config,
      ...overrides,
    } as Partial<GlassConfig>
  }, [preset, config, overrides])

  return (
    <div
      className={cn(
        "liquid-glass pointer-events-auto",
        SHAPE_SIZES[shape][size],
        SHAPE_RADIUS[shape],
        "border border-white/10 shadow-2xl",
        className,
      )}
      data-config={JSON.stringify(merged)}
      style={style}
    />
  )
}
