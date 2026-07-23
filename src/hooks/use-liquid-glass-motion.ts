"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useReducedPreferences } from "./use-reduced-preferences"

export interface ActiveStyle {
  x: number
  width: number
}

export interface LightPosition {
  x: number
  y: number
}

export function useLiquidGlassMotion() {
  const pathname = usePathname()
  const { reducedMotion } = useReducedPreferences()
  const navRef = useRef<HTMLDivElement>(null)
  const [activeStyle, setActiveStyle] = useState<ActiveStyle>({ x: 0, width: 0 })
  const [light, setLight] = useState<LightPosition>({ x: 0.5, y: -1 })
  const [pointerDown, setPointerDown] = useState(false)
  const [isActive, setIsActive] = useState(false)

  const prevXRef = useRef(0)
  const velocityRef = useRef(0)
  const lastFrameRef = useRef(0)

  const syncCSS = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const vx = velocityRef.current
    const stretch = reducedMotion ? 1 : Math.min(1 + Math.abs(vx) * 0.002, 1.25)
    const squash = reducedMotion ? 1 : 1 / stretch
    nav.style.setProperty("--glass-velocity", String(vx))
    nav.style.setProperty("--glass-stretch", String(stretch))
    nav.style.setProperty("--glass-squash", String(squash))
    nav.style.setProperty("--glass-refraction-intensity", reducedMotion ? "1" : "1.3")
  }, [reducedMotion])

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
    setIsActive(true)
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

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (reducedMotion) return
    const nav = navRef.current
    if (!nav) return
    const rect = nav.getBoundingClientRect()
    setLight({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    })
  }, [reducedMotion])

  const handlePointerLeave = useCallback(() => {
    setLight({ x: 0.5, y: -1 })
  }, [])

  const handlePointerEnter = useCallback((e: PointerEvent) => {
    if (reducedMotion) return
    const nav = navRef.current
    if (!nav) return
    const rect = nav.getBoundingClientRect()
    setLight({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    })
  }, [reducedMotion])

  const handlePointerDown = useCallback(() => {
    if (reducedMotion) return
    setPointerDown(true)
  }, [reducedMotion])

  const handlePointerUp = useCallback(() => {
    setPointerDown(false)
  }, [])

  return {
    navRef,
    activeStyle,
    light,
    pointerDown,
    isActive,
    handlePointerMove,
    handlePointerLeave,
    handlePointerEnter,
    handlePointerDown,
    handlePointerUp,
    syncCSS,
  }
}