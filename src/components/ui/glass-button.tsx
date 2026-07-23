"use client"

import { type ReactNode, type MouseEvent } from "react"
import { cn } from "@/lib/utils"
import type { GlassConfig } from "@ybouane/liquidglass"
import { useGlassConfig } from "./glass-config-context"

type ButtonTone = "neutral" | "primary" | "violet" | "rose" | "emerald"

interface GlassButtonProps {
  children: ReactNode
  tone?: ButtonTone
  config?: Partial<GlassConfig>
  className?: string
  href?: string
  disabled?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void
}

const TONE_ACCENT_MAP: Record<ButtonTone, { light: string; glow: string }> = {
  neutral: { light: "rgba(255,255,255,0.15)", glow: "rgba(255,255,255,0.1)" },
  primary: { light: "rgba(22,140,168,0.4)", glow: "rgba(22,140,168,0.35)" },
  violet: { light: "rgba(110,66,217,0.4)", glow: "rgba(110,66,217,0.35)" },
  rose: { light: "rgba(213,47,126,0.4)", glow: "rgba(213,47,126,0.35)" },
  emerald: { light: "rgba(7,141,112,0.4)", glow: "rgba(7,141,112,0.35)" },
}

const TONE_HOVER_MAP: Record<ButtonTone, string> = {
  neutral: "hover:brightness-105",
  primary: "hover:bg-[rgba(22,140,168,0.5)]",
  violet: "hover:bg-[rgba(110,66,217,0.5)]",
  rose: "hover:bg-[rgba(213,47,126,0.5)]",
  emerald: "hover:bg-[rgba(7,141,112,0.5)]",
}

export function GlassButton({
  children,
  tone = "primary",
  config = {},
  className,
  href,
  disabled,
  onClick,
}: GlassButtonProps) {
  const { overrides, effectivePreset, reducedTransparency } = useGlassConfig()

  const accent = TONE_ACCENT_MAP[tone]
  const toneConfig: Partial<GlassConfig> = tone !== "neutral" ? {
    tintStrength: reducedTransparency ? 0.12 : 0.18,
    brightness: reducedTransparency ? 0.05 : 0.1,
  } : {}

  const merged: Partial<GlassConfig> = {
    ...effectivePreset,
    ...overrides,
    ...config,
    ...toneConfig,
    button: true,
    cornerRadius: 12,
  }

  const isLink = href !== undefined
  const Component = isLink ? "a" : "button"

  return (
    <Component
      href={href}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "liquid-glass inline-flex items-center justify-center gap-2 whitespace-nowrap px-5 py-2.5 text-sm font-semibold",
        "transition-[transform,box-shadow,background-color] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "active:scale-[0.97]",
        disabled && "pointer-events-none opacity-50",
        TONE_HOVER_MAP[tone],
        className
      )}
      data-config={JSON.stringify(merged)}
      style={{
        "--button-accent-light": accent.light,
        "--button-accent-glow": accent.glow,
      } as React.CSSProperties}
    >
      {children}
    </Component>
  )
}

GlassButton.displayName = "GlassButton"