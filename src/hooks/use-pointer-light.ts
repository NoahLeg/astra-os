"use client"

import { useCallback, useRef, useState } from "react"

export interface LightPosition {
  x: number
  y: number
}

export function usePointerLight() {
  const [light, setLight] = useState<LightPosition>({ x: 0.5, y: -1 })
  const rectRef = useRef<DOMRect | null>(null)

  const updateRect = useCallback((element: HTMLElement | null) => {
    if (element) {
      rectRef.current = element.getBoundingClientRect()
    }
  }, [])

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const currentTarget = event.currentTarget as HTMLElement
    const rect = rectRef.current ?? currentTarget.getBoundingClientRect()
    setLight({
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    })
  }, [])

  const handlePointerLeave = useCallback(() => {
    setLight({ x: 0.5, y: -1 })
  }, [])

  const handlePointerEnter = useCallback((event: PointerEvent) => {
    const currentTarget = event.currentTarget as HTMLElement
    const rect = currentTarget.getBoundingClientRect()
    rectRef.current = rect
    setLight({
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    })
  }, [])

  return {
    light,
    handlePointerMove,
    handlePointerLeave,
    handlePointerEnter,
    updateRect,
  }
}