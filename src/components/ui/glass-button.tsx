"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import "@/lib/liquid-glass-js/glass.css"

interface GlassButtonProps {
  children: ReactNode
  type?: "rounded" | "pill"
  warp?: boolean
  tintOpacity?: number
  onClick?: () => void
  className?: string
  disabled?: boolean
  href?: string
}

export function GlassButton({
  children,
  type = "pill",
  warp = true,
  tintOpacity = 0.3,
  onClick,
  className,
  disabled,
  href,
}: GlassButtonProps) {
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

    const text = typeof children === "string" ? children : ""

    let mounted = true

    const init = async () => {
      const { Button } = await import("@/lib/liquid-glass-js/button")

      const container = containerRef.current
      if (!mounted || !container) return

      const instance = new Button({
        text,
        size: 16,
        type,
        warp,
        tintOpacity,
        onClick: onClick
          ? () => {
              onClick()
            }
          : null,
      })

      if (!mounted) return

      if (instance.element) container.appendChild(instance.element)
      instanceRef.current = instance

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
        if (
          instanceRef.current.element?.parentNode
        ) {
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
  }, [type, warp, tintOpacity, onClick, children])

  if (status === "fallback") {
    const Comp = href ? "a" : "button"
    return (
      <Comp
        href={href}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent px-5 py-2.5 text-sm font-semibold shadow-sm transition-all duration-200 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
          "border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20",
          className,
        )}
      >
        {children}
      </Comp>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "inline-flex",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      aria-disabled={disabled}
    />
  )
}
