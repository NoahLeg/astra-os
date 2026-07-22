"use client"

import { useState } from "react"
import { SlidersHorizontal, X } from "lucide-react"
import { useGlassConfig, type GlassConfigOverrides } from "./glass-config-context"

const SLIDERS: Array<{
  key: keyof GlassConfigOverrides
  label: string
  min: number
  max: number
  step: number
  default: number
}> = [
  { key: "blurAmount", label: "Flou", min: 0, max: 1, step: 0.01, default: 0.15 },
  { key: "refraction", label: "Réfraction", min: 0, max: 1, step: 0.01, default: 0.4 },
  { key: "edgeHighlight", label: "Contour", min: 0, max: 0.3, step: 0.01, default: 0.1 },
  { key: "chromAberration", label: "Aberration", min: 0, max: 0.3, step: 0.01, default: 0.05 },
  { key: "specular", label: "Reflet", min: 0, max: 0.5, step: 0.01, default: 0.1 },
  { key: "brightness", label: "Luminosité", min: -0.5, max: 0.5, step: 0.01, default: 0 },
  { key: "shadowOpacity", label: "Ombre", min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: "zRadius", label: "Profondeur", min: 0, max: 50, step: 1, default: 15 },
]

export function GlassControlPanel() {
  const [open, setOpen] = useState(false)
  const { overrides, updateOverride, resetOverrides } = useGlassConfig()

  if (process.env.NODE_ENV !== "development") return null

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-background/80 text-foreground shadow-lg backdrop-blur-md transition hover:bg-background"
        aria-label="Contrôle du verre"
      >
        {open ? <X className="size-5" /> : <SlidersHorizontal className="size-5" />}
      </button>

      {open ? (
        <div className="fixed bottom-24 right-6 z-50 w-72 rounded-2xl border border-border/60 bg-card/95 p-5 shadow-xl backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verre liquide</p>
            <button onClick={resetOverrides} className="text-[10px] text-primary hover:underline">
              Réinitialiser
            </button>
          </div>

          <div className="space-y-3">
            {SLIDERS.map((slider) => (
              <label key={slider.key} className="block">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{slider.label}</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {((overrides[slider.key] as number | undefined) ?? slider.default).toFixed(slider.step < 1 ? 2 : 0)}
                  </span>
                </div>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={(overrides[slider.key] as number | undefined) ?? slider.default}
                  onChange={(e) => updateOverride(slider.key, Number.parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}
