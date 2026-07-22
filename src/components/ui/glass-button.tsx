"use client"

import { type ReactNode, type MouseEvent } from "react"
import { cn } from "@/lib/utils"
import type { GlassConfig } from "@ybouane/liquidglass"
import { useGlassConfig } from "./glass-config-context"

interface GlassButtonProps {
  children: ReactNode
  config?: Partial<GlassConfig>
  className?: string
  href?: string
  disabled?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void
}

export function GlassButton({
  children,
  config = {},
  className,
  href,
  disabled,
  onClick,
}: GlassButtonProps) {
  const { overrides } = useGlassConfig()
  const merged: Partial<GlassConfig> = {
    button: true,
    cornerRadius: 24,
    blurAmount: 0.15,
    refraction: 0.4,
    edgeHighlight: 0.1,
    chromAberration: 0.05,
    specular: 0.1,
    ...config,
    ...overrides,
  }

  const Comp = href ? "a" : "button"

  return (
    <Comp
      href={href}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "liquid-glass inline-flex items-center justify-center gap-2 whitespace-nowrap px-5 py-2.5 text-sm font-semibold",
        "bg-gradient-to-b from-white/15 to-white/5 text-white shadow-lg shadow-black/20",
        "backdrop-blur-xl border border-white/20",
        "transition-all duration-300",
        "hover:from-white/20 hover:to-white/10 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/25",
        "active:translate-y-0 active:from-white/10 active:to-white/5 active:shadow-md",
        disabled && "pointer-events-none opacity-40",
        className,
      )}
      data-config={JSON.stringify(merged)}
    >
      {children}
    </Comp>
  )
}
