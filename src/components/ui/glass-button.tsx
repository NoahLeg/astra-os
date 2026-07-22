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
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      data-config={JSON.stringify(merged)}
    >
      {children}
    </Comp>
  )
}
