"use client"

import { type ReactNode, type ElementType, forwardRef } from "react"
import { cn } from "@/lib/utils"
import type { GlassConfig } from "@ybouane/liquidglass"
import { useGlassConfig, type SurfaceType, SURFACE_PRESETS } from "./glass-config-context"

export interface GlassSurfaceProps {
  children?: ReactNode
  variant?: SurfaceType
  config?: Partial<GlassConfig>
  className?: string
  as?: ElementType
  style?: React.CSSProperties
  interactive?: boolean
  onPointerMove?: (e: PointerEvent) => void
  onPointerLeave?: () => void
  onPointerDown?: () => void
  onPointerUp?: () => void
  onPointerEnter?: (e: PointerEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onClick?: () => void
}

const VARIANT_CLASS_MAP: Record<SurfaceType, string> = {
  content: "rounded-[10px]",
  glass: "rounded-[12px]",
  floating: "rounded-[16px]",
  lens: "rounded-[16px]",
  control: "rounded-[8px]",
  button: "rounded-[12px]",
}

const VARIANT_SHADOW_MAP: Record<SurfaceType, string> = {
  content: "shadow-[0_2px_8px_rgba(0,0,0,0.15),_0_0_0_1px_rgba(0,0,0,0.1)_inset]",
  glass: "shadow-[0_8px_32px_rgba(0,0,0,0.22),_0_2px_8px_rgba(0,0,0,0.15),_0_0_0_1px_rgba(255,255,255,0.06)_inset,_0_-1px_0_rgba(0,0,0,0.2)_inset]",
  floating: "shadow-[0_24px_70px_rgba(0,0,0,0.42),_0_8px_24px_rgba(0,0,0,0.24),_0_0_0_1px_rgba(255,255,255,0.1)_inset,_0_-1px_0_rgba(0,0,0,0.3)_inset]",
  lens: "shadow-[0_16px_48px_rgba(0,0,0,0.38),_0_4px_16px_rgba(0,0,0,0.28),_0_0_0_1px_rgba(255,255,255,0.18)_inset,_0_-2px_8px_rgba(0,0,0,0.35)_inset]",
  control: "shadow-[0_4px_16px_rgba(0,0,0,0.18),_0_1px_3px_rgba(0,0,0,0.12),_0_0_0_1px_rgba(255,255,255,0.08)_inset]",
  button: "shadow-[0_12px_36px_rgba(0,0,0,0.35),_0_4px_12px_rgba(0,0,0,0.22),_0_0_0_1px_rgba(255,255,255,0.14)_inset,_0_-1px_0_rgba(0,0,0,0.3)_inset]",
}

export const GlassSurface = forwardRef<HTMLElement, GlassSurfaceProps>(
  ({ children, variant = "glass", config = {}, className, as: Tag = "div", style, interactive = false, ...rest }, ref) => {
    const { overrides, effectivePreset, reducedMotion, reducedTransparency } = useGlassConfig()

    const preset = SURFACE_PRESETS[variant]
    const mergedConfig: Partial<GlassConfig> = {
      ...preset,
      ...config,
      ...overrides,
      ...effectivePreset,
    }

    const dataConfig = JSON.stringify(mergedConfig)

    const baseStyles: React.CSSProperties = {
      ...style,
      "--glass-stretch": "1",
      "--glass-squash": "1",
      "--glass-refraction-intensity": reducedMotion ? "1" : "1.3",
    } as React.CSSProperties

    if (variant === "lens" && !reducedTransparency) {
      baseStyles.filter = "url(#lens-refraction)"
    }

    return (
      <Tag
        ref={ref}
        className={cn(
          "relative isolate",
          "liquid-glass",
          VARIANT_CLASS_MAP[variant],
          VARIANT_SHADOW_MAP[variant],
          interactive && "transition-[transform,box-shadow] duration-200 active:scale-[0.97]",
          className
        )}
        data-config={dataConfig}
        style={baseStyles}
        {...rest}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-inherit liquid-glass"
          aria-hidden="true"
          data-config={dataConfig}
        />
        <div className="relative z-10" style={{ isolation: "isolate" }}>
          {children}
        </div>
      </Tag>
    )
  }
)

GlassSurface.displayName = "GlassSurface"