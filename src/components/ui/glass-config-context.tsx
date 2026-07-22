"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { GlassConfig } from "@ybouane/liquidglass"

export interface GlassConfigOverrides extends Partial<GlassConfig> {
  blurAmount?: number
  refraction?: number
  edgeHighlight?: number
  chromAberration?: number
  specular?: number
  brightness?: number
  tintStrength?: number
  shadowOpacity?: number
  zRadius?: number
}

interface GlassConfigContextValue {
  overrides: GlassConfigOverrides
  updateOverride: <K extends keyof GlassConfigOverrides>(key: K, value: NonNullable<GlassConfigOverrides[K]>) => void
  resetOverrides: () => void
}

const GlassConfigContext = createContext<GlassConfigContextValue | null>(null)

export function GlassConfigProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<GlassConfigOverrides>({})

  const updateOverride = useCallback(<K extends keyof GlassConfigOverrides>(key: K, value: NonNullable<GlassConfigOverrides[K]>) => {
    setOverrides((prev) => ({ ...prev, [key]: value }))
  }, [])

  const resetOverrides = useCallback(() => {
    setOverrides({})
  }, [])

  return (
    <GlassConfigContext.Provider value={{ overrides, updateOverride, resetOverrides }}>
      {children}
    </GlassConfigContext.Provider>
  )
}

export function useGlassConfig() {
  const ctx = useContext(GlassConfigContext)
  if (!ctx) throw new Error("useGlassConfig must be used within GlassConfigProvider")
  return ctx
}
