"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

export function useLiquidNavGeometry() {
  const pathname = usePathname()
  const navRef = useRef<HTMLDivElement>(null)
  const [activeStyle, setActiveStyle] = useState({ x: 0, width: 0 })
  const [light, setLight] = useState({ x: 0.5, y: -1 })

  const measure = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active) return
    const navRect = nav.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    setActiveStyle({
      x: activeRect.left - navRect.left,
      width: activeRect.width,
    })
  }, [])

  useEffect(() => {
    requestAnimationFrame(measure)
  }, [pathname, measure])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    return () => ro.disconnect()
  }, [measure])

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

  return { navRef, activeStyle, light, handlePointerMove, handlePointerLeave }
}
