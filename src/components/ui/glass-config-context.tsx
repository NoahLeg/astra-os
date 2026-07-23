"use client"

import { createContext, useContext, useState, useCallback, useSyncExternalStore, type ReactNode } from "react"
import type { GlassConfig } from "@ybouane/liquidglass"

export type SurfaceType = "content" | "glass" | "floating" | "lens" | "control" | "button"

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
  reducedMotion: boolean
  reducedTransparency: boolean
  effectivePreset: Partial<GlassConfig>
}

const GlassConfigContext = createContext<GlassConfigContextValue | null>(null)

export const SURFACE_PRESETS: Record<SurfaceType, Partial<GlassConfig>> = {
  content: {
    blurAmount: 0.08,
    refraction: 0,
    edgeHighlight: 0.04,
    chromAberration: 0,
    specular: 0,
    brightness: 0.02,
    tintStrength: 0,
    shadowOpacity: 0.15,
    zRadius: 0,
    cornerRadius: 10,
    opacity: 0.92,
    saturation: 1.1,
    floating: false,
    button: false,
    bevelMode: 0,
    fresnel: 0,
    distortion: 0,
    shadowSpread: 0,
    shadowOffsetY: 2,
  },
  glass: {
    blurAmount: 0.18,
    refraction: 0.15,
    edgeHighlight: 0.08,
    chromAberration: 0.02,
    specular: 0.05,
    brightness: 0.03,
    tintStrength: 0.02,
    shadowOpacity: 0.22,
    zRadius: 4,
    cornerRadius: 10,
    opacity: 0.72,
    saturation: 1.3,
    floating: false,
    button: false,
    bevelMode: 0,
    fresnel: 0.1,
    distortion: 0.02,
    shadowSpread: 2,
    shadowOffsetY: 8,
  },
  floating: {
    blurAmount: 0.28,
    refraction: 0.25,
    edgeHighlight: 0.12,
    chromAberration: 0.04,
    specular: 0.12,
    brightness: 0.04,
    tintStrength: 0.03,
    shadowOpacity: 0.42,
    zRadius: 12,
    cornerRadius: 16,
    opacity: 0.58,
    saturation: 1.4,
    floating: true,
    button: false,
    bevelMode: 0,
    fresnel: 0.15,
    distortion: 0.04,
    shadowSpread: 8,
    shadowOffsetY: 24,
  },
  lens: {
    blurAmount: 0.38,
    refraction: 0.55,
    edgeHighlight: 0.22,
    chromAberration: 0.08,
    specular: 0.28,
    brightness: 0.06,
    tintStrength: 0.08,
    shadowOpacity: 0.38,
    zRadius: 8,
    cornerRadius: 16,
    opacity: 0.45,
    saturation: 1.6,
    floating: false,
    button: false,
    bevelMode: 1,
    fresnel: 0.25,
    distortion: 0.08,
    shadowSpread: 4,
    shadowOffsetY: 16,
  },
  control: {
    blurAmount: 0.22,
    refraction: 0.1,
    edgeHighlight: 0.1,
    chromAberration: 0.02,
    specular: 0.06,
    brightness: 0.03,
    tintStrength: 0.02,
    shadowOpacity: 0.18,
    zRadius: 2,
    cornerRadius: 8,
    opacity: 0.68,
    saturation: 1.35,
    floating: false,
    button: false,
    bevelMode: 0,
    fresnel: 0.1,
    distortion: 0.02,
    shadowSpread: 1,
    shadowOffsetY: 4,
  },
  button: {
    blurAmount: 0.3,
    refraction: 0.35,
    edgeHighlight: 0.18,
    chromAberration: 0.05,
    specular: 0.22,
    brightness: 0.05,
    tintStrength: 0.06,
    shadowOpacity: 0.35,
    zRadius: 6,
    cornerRadius: 12,
    opacity: 0.52,
    saturation: 1.5,
    floating: false,
    button: true,
    bevelMode: 0,
    fresnel: 0.2,
    distortion: 0.05,
    shadowSpread: 4,
    shadowOffsetY: 12,
  },
}

function getEffectivePreset(base: Partial<GlassConfig>, reducedMotion: boolean, reducedTransparency: boolean): Partial<GlassConfig> {
  let preset = { ...base }

  if (reducedTransparency) {
    preset = {
      ...preset,
      opacity: Math.min((preset.opacity ?? 0.5) + 0.15, 1),
      blurAmount: (preset.blurAmount ?? 0.15) * 0.5,
      refraction: 0,
      specular: 0,
      edgeHighlight: (preset.edgeHighlight ?? 0) * 0.5,
    }
  }

  if (reducedMotion) {
    preset = {
      ...preset,
      distortion: 0,
      fresnel: 0,
    }
  }

  return preset
}

function getMediaQuerySnapshot(query: string): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia(query).matches
}

function subscribeMediaQuery(query: string, callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const mq = window.matchMedia(query)
  mq.addEventListener("change", callback)
  return () => mq.removeEventListener("change", callback)
}

export function GlassConfigProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<GlassConfigOverrides>({})

  const reducedMotion = useSyncExternalStore(
    (callback) => subscribeMediaQuery("(prefers-reduced-motion: reduce)", callback),
    () => getMediaQuerySnapshot("(prefers-reduced-motion: reduce)"),
    () => false
  )

  const reducedTransparency = useSyncExternalStore(
    (callback) => subscribeMediaQuery("(prefers-reduced-transparency: reduce)", callback),
    () => getMediaQuerySnapshot("(prefers-reduced-transparency: reduce)"),
    () => false
  )

  const updateOverride = useCallback(<K extends keyof GlassConfigOverrides>(key: K, value: NonNullable<GlassConfigOverrides[K]>) => {
    setOverrides((prev) => ({ ...prev, [key]: value }))
  }, [])

  const resetOverrides = useCallback(() => {
    setOverrides({})
  }, [])

  const basePreset = overrides as Partial<GlassConfig>
  const effectivePreset = getEffectivePreset(basePreset, reducedMotion, reducedTransparency)

  return (
    <GlassConfigContext.Provider value={{ overrides, updateOverride, resetOverrides, reducedMotion, reducedTransparency, effectivePreset }}>
      {children}
    </GlassConfigContext.Provider>
  )
}

export function useGlassConfig() {
  const ctx = useContext(GlassConfigContext)
  if (!ctx) throw new Error("useGlassConfig must be used within GlassConfigProvider")
  return ctx
}