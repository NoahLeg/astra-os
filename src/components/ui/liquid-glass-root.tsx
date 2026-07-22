"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { LiquidGlass } from "@ybouane/liquidglass"
import { cn } from "@/lib/utils"

interface LiquidGlassRootProps {
  children: ReactNode
  className?: string
}

export function LiquidGlassRoot({ children, className }: LiquidGlassRootProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<LiquidGlass | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let mounted = true

    const init = async () => {
      const instance = await LiquidGlass.init({
        root,
        glassElements: root.querySelectorAll<HTMLElement>(".liquid-glass"),
      })

      if (!mounted) {
        instance.destroy()
        return
      }

      instanceRef.current = instance
    }

    init()

    return () => {
      mounted = false
      instanceRef.current?.destroy()
      instanceRef.current = null
    }
  }, [])

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {children}
    </div>
  )
}
