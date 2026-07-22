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
    let retryCount = 0
    const maxRetries = 10

    const init = async () => {
      const glassElements = root.querySelectorAll<HTMLElement>(".liquid-glass")
      if (glassElements.length === 0 && retryCount < maxRetries) {
        retryCount++
        setTimeout(init, 100)
        return
      }

      try {
        const instance = await LiquidGlass.init({
          root,
          glassElements,
        })

        if (!mounted) {
          instance.destroy()
          return
        }

        instanceRef.current = instance
      } catch {
        if (mounted && retryCount < maxRetries) {
          retryCount++
          setTimeout(init, 100)
        }
      }
    }

    init()

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
