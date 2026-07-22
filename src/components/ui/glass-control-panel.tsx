"use client"

import { useState } from "react"
import { SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useGlassConfig, GLASS_PRESETS } from "./glass-config-context"
import type { GlassConfig } from "@ybouane/liquidglass"
import { LiquidGlassRoot } from "./liquid-glass-root"

interface SliderDef {
  key: keyof GlassConfig
  label: string
  min: number
  max: number
  step: number
  default: number
}

const SECTIONS: Array<{ title: string; sliders: SliderDef[] }> = [
  {
    title: "Rendu",
    sliders: [
      { key: "blurAmount", label: "Flou", min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: "refraction", label: "Réfraction", min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: "distortion", label: "Distorsion", min: 0, max: 1, step: 0.01, default: 0 },
      { key: "fresnel", label: "Fresnel", min: 0, max: 1, step: 0.01, default: 1 },
    ],
  },
  {
    title: "Lumières",
    sliders: [
      { key: "specular", label: "Reflet", min: 0, max: 0.5, step: 0.01, default: 0 },
      { key: "edgeHighlight", label: "Contour", min: 0, max: 0.3, step: 0.01, default: 0.05 },
      { key: "brightness", label: "Luminosité", min: -0.5, max: 0.5, step: 0.01, default: 0 },
      { key: "saturation", label: "Saturation", min: -1, max: 1, step: 0.01, default: 0 },
    ],
  },
  {
    title: "Couleur",
    sliders: [
      { key: "chromAberration", label: "Aberration", min: 0, max: 0.3, step: 0.01, default: 0.05 },
      { key: "tintStrength", label: "Teinte", min: 0, max: 0.3, step: 0.01, default: 0 },
      { key: "opacity", label: "Opacité", min: 0, max: 1, step: 0.01, default: 1 },
    ],
  },
  {
    title: "Forme",
    sliders: [
      { key: "cornerRadius", label: "Coins", min: 0, max: 80, step: 1, default: 24 },
      { key: "zRadius", label: "Profondeur", min: 0, max: 60, step: 1, default: 20 },
      { key: "bevelMode", label: "Biseau", min: 0, max: 1, step: 1, default: 0 },
    ],
  },
  {
    title: "Ombre",
    sliders: [
      { key: "shadowOpacity", label: "Opacité", min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: "shadowSpread", label: "Étalement", min: 0, max: 40, step: 1, default: 10 },
      { key: "shadowOffsetY", label: "Décalage Y", min: 0, max: 20, step: 1, default: 1 },
    ],
  },
]

export function GlassControlPanel() {
  const [open, setOpen] = useState(false)
  const { overrides, updateOverride, resetOverrides, applyPreset } = useGlassConfig()

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex size-12 items-center justify-center rounded-2xl shadow-lg transition",
          "border border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20",
        )}
        aria-label="Contrôle du verre"
      >
        {open ? <X className="size-5" /> : <SlidersHorizontal className="size-5" />}
      </button>

      {open ? (
        <div className="fixed bottom-24 right-6 z-50 flex w-[340px] flex-col gap-4 rounded-2xl border border-white/15 bg-gray-950/90 p-5 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Verre liquide</p>
            <button onClick={resetOverrides} className="text-[10px] text-indigo-400 hover:underline">
              Réinitialiser
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {Object.entries(GLASS_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => applyPreset(preset)}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-white/70 transition hover:bg-white/15 hover:text-white"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <LiquidGlassRoot className="h-28 w-full overflow-hidden rounded-xl border border-white/10">
            <div
              className="liquid-glass absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white/60"
              data-config={JSON.stringify({
                blurAmount: (overrides.blurAmount as number) ?? 0.18,
                refraction: (overrides.refraction as number) ?? 0.5,
                edgeHighlight: (overrides.edgeHighlight as number) ?? 0.08,
                chromAberration: (overrides.chromAberration as number) ?? 0.05,
                specular: (overrides.specular as number) ?? 0.1,
                cornerRadius: (overrides.cornerRadius as number) ?? 28,
                zRadius: (overrides.zRadius as number) ?? 25,
                shadowOpacity: (overrides.shadowOpacity as number) ?? 0.3,
                brightness: (overrides.brightness as number) ?? 0,
                tintStrength: (overrides.tintStrength as number) ?? 0,
                saturation: (overrides.saturation as number) ?? 0,
                fresnel: (overrides.fresnel as number) ?? 1,
                distortion: (overrides.distortion as number) ?? 0,
                opacity: (overrides.opacity as number) ?? 1,
                shadowSpread: (overrides.shadowSpread as number) ?? 10,
                shadowOffsetY: (overrides.shadowOffsetY as number) ?? 1,
                bevelMode: (overrides.bevelMode as number) ?? 0,
              })}
            >
              Aperçu
            </div>
          </LiquidGlassRoot>

          <div className="scrollbar-none -mx-2 max-h-[320px] space-y-4 overflow-y-auto px-2">
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">{section.title}</p>
                <div className="space-y-2.5">
                  {section.sliders.map((slider) => (
                    <label key={slider.key} className="block">
                      <div className="mb-0.5 flex items-center justify-between text-[11px]">
                        <span className="text-white/50">{slider.label}</span>
                        <span className="font-mono tabular-nums text-white/80">
                          {((overrides[slider.key] as number | undefined) ?? slider.default).toFixed(slider.step < 1 ? 2 : 0)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        step={slider.step}
                        value={(overrides[slider.key] as number | undefined) ?? slider.default}
                        onChange={(e) => updateOverride(slider.key, Number.parseFloat(e.target.value) as never)}
                        className="w-full accent-indigo-500"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}
