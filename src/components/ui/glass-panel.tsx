"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import "@/lib/liquid-glass-js/glass.css"

interface GlassPanelProps {
  children: ReactNode
  type?: "rounded" | "pill"
  tintOpacity?: number
  borderRadius?: number
  className?: string
}

export function GlassPanel({
  children,
  type = "rounded",
  tintOpacity = 0.15,
  borderRadius,
  className,
}: GlassPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<any>(null)
  const [status, setStatus] = useState<"loading" | "fallback">("loading")

  useEffect(() => {
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl") || canvas.getContext("webgl2")
    if (!gl) {
      setStatus("fallback")
      return
    }

    let mounted = true

    const init = async () => {
      const { Container } = await import("@/lib/liquid-glass-js/container")

      const container = containerRef.current
      if (!mounted || !container) return

      const instance = new Container({
        borderRadius: borderRadius || 24,
        type,
        tintOpacity,
      })

      if (!mounted) return

      while (container.firstChild) {
        container.removeChild(container.firstChild)
      }

      if (instance.element) container.appendChild(instance.element)
      instanceRef.current = instance

      if (instance.element && container) {
        for (const child of Array.from(container.children)) {
          if (child !== instance.element) {
            instance.element.appendChild(child)
          }
        }
      }

      const timeout = setTimeout(() => {
        if (!instance.webglInitialized && mounted) {
          cleanup()
          setStatus("fallback")
        }
      }, 8000)
    }

    const cleanup = () => {
      if (instanceRef.current) {
        instanceRef.current.render = null
        if (instanceRef.current.element?.parentNode) {
          instanceRef.current.element.parentNode.removeChild(
            instanceRef.current.element,
          )
        }
        instanceRef.current = null
      }
    }

    init()

    return () => {
      mounted = false
      cleanup()
    }
  }, [type, tintOpacity, borderRadius])

  if (status === "fallback") {
    return (
      <div
        className={cn(
          "rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-md sm:p-7 lg:p-9",
          className,
        )}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
    />
  )
}
