"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { LiquidGlass } from "@ybouane/liquidglass"
import { cn } from "@/lib/utils"

interface LiquidGlassRootProps {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

export function LiquidGlassRoot({ children, className, style }: LiquidGlassRootProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<LiquidGlass | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let mounted = true
    const glassElements = root.querySelectorAll<HTMLElement>(".liquid-glass")

    LiquidGlass.init({ root, glassElements }).then((instance) => {
      if (!mounted) { instance.destroy(); return }
      instanceRef.current = instance
    }).catch(() => {})

    return () => {
      mounted = false
      instanceRef.current?.destroy()
      instanceRef.current = null
    }
  }, [])

  return (
    <div ref={rootRef} className={cn("relative", className)} style={style}>
      {children}
    </div>
  )
}
