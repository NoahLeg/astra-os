"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { GlassConfig } from "@ybouane/liquidglass"

export type GlassConfigOverrides = Partial<GlassConfig>

interface GlassConfigContextValue {
  overrides: GlassConfigOverrides
  updateOverride: <K extends keyof GlassConfig>(key: K, value: GlassConfig[K]) => void
  resetOverrides: () => void
  applyPreset: (preset: GlassPreset) => void
}

export interface GlassPreset {
  label: string
  config: GlassConfigOverrides
}

export const GLASS_PRESETS: Record<string, GlassPreset> = {
  subtle: {
    label: "Subtle",
    config: { blurAmount: 0.08, refraction: 0.3, edgeHighlight: 0.03, chromAberration: 0.02, specular: 0.05, cornerRadius: 20, zRadius: 15, shadowOpacity: 0.15 },
  },
  medium: {
    label: "Medium",
    config: { blurAmount: 0.18, refraction: 0.5, edgeHighlight: 0.08, chromAberration: 0.05, specular: 0.1, cornerRadius: 28, zRadius: 25, shadowOpacity: 0.3 },
  },
  vivid: {
    label: "Vivid",
    config: { blurAmount: 0.35, refraction: 0.8, edgeHighlight: 0.15, chromAberration: 0.12, specular: 0.2, tintStrength: 0.08, cornerRadius: 36, zRadius: 35, shadowOpacity: 0.5 },
  },
  frosted: {
    label: "Frosted",
    config: { blurAmount: 0.25, refraction: 0.6, edgeHighlight: 0.05, chromAberration: 0.04, specular: 0.05, brightness: 0.05, cornerRadius: 24, zRadius: 20 },
  },
  dark: {
    label: "Dark",
    config: { blurAmount: 0.25, refraction: 0.5, brightness: -0.15, edgeHighlight: 0.05, cornerRadius: 24, zRadius: 20, shadowOpacity: 0.4 },
  },
  clean: {
    label: "Clean",
    config: { blurAmount: 0.12, refraction: 0.35, edgeHighlight: 0.04, chromAberration: 0.02, specular: 0.08, tintStrength: 0.03, cornerRadius: 16, zRadius: 12, shadowOpacity: 0.2 },
  },
}

const GlassConfigContext = createContext<GlassConfigContextValue | null>(null)

export function GlassConfigProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<GlassConfigOverrides>({})

  const updateOverride = useCallback(<K extends keyof GlassConfig>(key: K, value: GlassConfig[K]) => {
    setOverrides((prev) => ({ ...prev, [key]: value }))
  }, [])

  const resetOverrides = useCallback(() => {
    setOverrides({})
  }, [])

  const applyPreset = useCallback((preset: GlassPreset) => {
    setOverrides({ ...preset.config })
  }, [])

  return (
    <GlassConfigContext.Provider value={{ overrides, updateOverride, resetOverrides, applyPreset }}>
      {children}
    </GlassConfigContext.Provider>
  )
}

export function useGlassConfig() {
  const ctx = useContext(GlassConfigContext)
  if (!ctx) throw new Error("useGlassConfig must be used within GlassConfigProvider")
  return ctx
}
