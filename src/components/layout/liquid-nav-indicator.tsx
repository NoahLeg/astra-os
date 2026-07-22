"use client"

import type { CSSProperties } from "react"

interface LiquidNavIndicatorProps {
  x: number
  width: number
  isReduced: boolean
  pointerDown: boolean
}

export function LiquidNavIndicator({ x, width, isReduced, pointerDown }: LiquidNavIndicatorProps) {
  return (
    <div
      className="liquid-nav-indicator pointer-events-none absolute left-0 z-0 will-change-transform"
      style={{
        top: -2,
        bottom: -2,
        transform: `translate3d(${x}px, 0, 0) scaleX(var(--glass-stretch, 1)) scaleY(${pointerDown ? 0.92 : 1})`,
        width,
        transformOrigin: "center center",
        transition: isReduced
          ? "transform 150ms linear, width 150ms linear"
          : "transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1), width 380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      } as CSSProperties}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[16px]"
        style={{
          background: `
            radial-gradient(ellipse 100% 70% at 50% 40%, color-mix(in srgb, var(--primary) 22%, transparent) 0%, color-mix(in srgb, var(--primary) 6%, transparent) 65%, transparent 100%),
            linear-gradient(180deg, color-mix(in srgb, white 20%, transparent) 0%, color-mix(in srgb, white 4%, transparent) 40%, transparent 70%)
          `,
          backdropFilter: "blur(6px) saturate(160%) contrast(110%)",
          WebkitBackdropFilter: "blur(6px) saturate(160%) contrast(110%)",
          boxShadow:
            "inset 0 1.5px 0 color-mix(in srgb, white 24%, transparent), inset 0 -2px 0 color-mix(in srgb, black 42%, transparent), 0 4px 16px color-mix(in srgb, var(--primary) 28%, transparent)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 rounded-[16px]"
        style={{
          background: `
            linear-gradient(180deg, color-mix(in srgb, white 14%, transparent) 0%, color-mix(in srgb, white 2%, transparent) 35%, transparent 60%)
          `,
          maskImage: "linear-gradient(180deg, black 0%, black 35%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(180deg, black 0%, black 35%, transparent 70%)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 rounded-[16px] opacity-60"
        style={{
          background: `
            linear-gradient(to bottom, transparent 70%, color-mix(in srgb, black 30%, transparent) 100%)
          `,
        }}
      />

      <div
        className="pointer-events-none absolute inset-[1px] rounded-[15px]"
        style={{
          boxShadow: "inset 0 0 0 1px color-mix(in srgb, white 10%, transparent)",
        }}
      />
    </div>
  )
}
