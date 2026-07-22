"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

interface ActiveStyle {
  x: number
  width: number
}

interface LightPos {
  x: number
  y: number
}

export function useLiquidGlassMotion() {
  const pathname = usePathname()
  const navRef = useRef<HTMLDivElement>(null)
  const [activeStyle, setActiveStyle] = useState<ActiveStyle>({ x: 0, width: 0 })
  const [light, setLight] = useState<LightPos>({ x: 0.5, y: -1 })
  const [pointerDown, setPointerDown] = useState(false)

  const prevXRef = useRef(0)
  const velocityRef = useRef(0)
  const rafRef = useRef(0)
  const lastFrameRef = useRef(0)

  const syncCSS = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const vx = velocityRef.current
    const stretch = Math.min(1 + Math.abs(vx) * 0.002, 1.25)
    const squash = 1 / stretch
    nav.style.setProperty("--glass-velocity", String(vx))
    nav.style.setProperty("--glass-stretch", String(stretch))
    nav.style.setProperty("--glass-squash", String(squash))
  }, [])

  const measure = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active) return
    const navRect = nav.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const newX = activeRect.left - navRect.left
    const newWidth = activeRect.width

    const prevX = prevXRef.current
    const now = performance.now()
    const dt = now - lastFrameRef.current
    if (dt > 0) {
      velocityRef.current = (newX - prevX) / dt * 16
    }
    prevXRef.current = newX
    lastFrameRef.current = now

    setActiveStyle({ x: newX, width: newWidth })
  }, [])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      measure()
      syncCSS()
    })
    return () => cancelAnimationFrame(id)
  }, [pathname, measure, syncCSS])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        measure()
        syncCSS()
      })
    })
    ro.observe(nav)
    return () => ro.disconnect()
  }, [measure, syncCSS])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const nav = navRef.current
    if (!nav) return
    const rect = nav.getBoundingClientRect()
    setLight({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    })
  }, [])

  const handlePointerLeave = useCallback(() => {
    setLight({ x: 0.5, y: -1 })
  }, [])

  const handlePointerDown = useCallback(() => {
    setPointerDown(true)
  }, [])

  const handlePointerUp = useCallback(() => {
    setPointerDown(false)
  }, [])

  return {
    navRef,
    activeStyle,
    light,
    pointerDown,
    handlePointerMove,
    handlePointerLeave,
    handlePointerDown,
    handlePointerUp,
  }
}
