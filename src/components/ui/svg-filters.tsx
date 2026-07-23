"use client"

export function SVGRefractionFilter({ id = "lens-refraction", scale = 8, baseFrequency = 0.015, numOctaves = 2 }: {
  id?: string
  scale?: number
  baseFrequency?: number
  numOctaves?: number
}) {
  return (
    <svg className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ width: "100%", height: "100%" }}>
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency={baseFrequency} numOctaves={numOctaves} result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale={scale} xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation="0.5" />
      </filter>
    </svg>
  )
}

export function SVGSpecularFilter({ id = "lens-specular", specularConstant = 0.5, specularExponent = 20, surfaceScale = 3 }: {
  id?: string
  specularConstant?: number
  specularExponent?: number
  surfaceScale?: number
}) {
  return (
    <svg className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ width: "100%", height: "100%" }}>
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
        <feSpecularLighting
          surfaceScale={surfaceScale}
          specularConstant={specularConstant}
          specularExponent={specularExponent}
          lightingColor="white"
          result="specular"
        >
          <fePointLight x="50%" y="-20%" z="100" />
        </feSpecularLighting>
        <feComposite in="specular" in2="SourceAlpha" operator="in" />
      </filter>
    </svg>
  )
}

export function SVGChromaticAberrationFilter({ id = "lens-chromatic", offsetR = 0.5, offsetB = -0.5 }: {
  id?: string
  offsetR?: number
  offsetB?: number
}) {
  return (
    <svg className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ width: "100%", height: "100%" }}>
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
        <feOffset in="SourceGraphic" dx={offsetR} dy={0} result="R" />
        <feOffset in="SourceGraphic" dx={offsetB} dy={0} result="B" />
        <feComposite in="R" in2="SourceGraphic" operator="over" result="RB" />
        <feComposite in="RB" in2="B" operator="over" />
      </filter>
    </svg>
  )
}

export function GlassFilters({ variant = "lens", refractionIntensity = 1 }: { variant?: "content" | "glass" | "floating" | "lens" | "control" | "button"; refractionIntensity?: number }) {
  if (variant === "content" || variant === "glass" || variant === "control") {
    return null
  }

  const scale = variant === "lens" ? 8 * refractionIntensity : variant === "floating" ? 4 * refractionIntensity : 6 * refractionIntensity
  const baseFrequency = variant === "lens" ? 0.015 : variant === "floating" ? 0.02 : 0.012

  return (
    <>
      <SVGRefractionFilter id={`${variant}-refraction`} scale={scale} baseFrequency={baseFrequency} />
      <SVGSpecularFilter id={`${variant}-specular`} specularConstant={variant === "lens" ? 0.5 : 0.3} specularExponent={variant === "lens" ? 20 : 15} />
      <SVGChromaticAberrationFilter id={`${variant}-chromatic`} offsetR={variant === "lens" ? 0.5 : 0.3} offsetB={variant === "lens" ? -0.5 : -0.3} />
    </>
  )
}