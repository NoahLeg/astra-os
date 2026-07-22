"use client"

import type { CSSProperties } from "react"

interface LiquidNavIndicatorProps {
  x: number
  width: number
  isReduced: boolean
}

export function LiquidNavIndicator({ x, width, isReduced }: LiquidNavIndicatorProps) {
  return (
    <div
      className="liquid-nav-indicator pointer-events-none absolute top-[5px] bottom-[5px] left-0 z-0 rounded-[14px] will-change-transform"
      style={{
        transform: `translate3d(${x}px, 0, 0)`,
        width,
        transition: isReduced
          ? "transform 150ms linear, width 150ms linear"
          : "transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1), width 420ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        "--indicator-x": `${x}px`,
        background: `
          radial-gradient(ellipse 100% 100% at 50% 60%, color-mix(in srgb, var(--primary) 28%, transparent), color-mix(in srgb, var(--primary) 8%, transparent) 70%, transparent)
        `,
        backdropFilter: "blur(4px) saturate(150%)",
        WebkitBackdropFilter: "blur(4px) saturate(150%)",
        boxShadow: "inset 0 1px 0 color-mix(in srgb, white 18%, transparent), inset 0 -1px 0 color-mix(in srgb, black 12%, transparent), 0 2px 8px color-mix(in srgb, var(--primary) 20%, transparent)",
      } as CSSProperties}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[14px]"
        style={{
          background: "linear-gradient(180deg, color-mix(in srgb, white 10%, transparent) 0%, transparent 45%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-[1px] rounded-[13px]"
        style={{
          boxShadow: "inset 0 0 0 1px color-mix(in srgb, white 8%, transparent)",
        }}
      />
    </div>
  )
}
