"use client"

export function SVGGlassFilters() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
      <defs>
        <filter id="lens-refraction" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="0.5" />
        </filter>

        <filter id="specular-highlight" x="-50%" y="-50%" width="200%" height="200%">
          <feSpecularLighting surfaceScale="40" specularConstant="1" specularExponent="30" lighting-color="#ffffff" result="specOut">
            <fePointLight x="50%" y="-20%" z="80" />
          </feSpecularLighting>
          <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>

        <filter id="chromatic-aberration" x="-10%" y="-10%" width="120%" height="120%">
          <feOffset in="SourceGraphic" dx="1" dy="0" result="R" />
          <feOffset in="SourceGraphic" dx="-1" dy="0" result="B" />
          <feOffset in="SourceGraphic" dx="0" dy="0" result="G" />
          <feComposite in="R" in2="G" operator="over" result="RG" />
          <feComposite in="RG" in2="B" operator="over" />
        </filter>

        <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="expanded" />
          <feGaussianBlur in="expanded" stdDeviation="3" result="blurred" />
          <feFlood flood-color="rgba(255,255,255,0.3)" result="glowColor" />
          <feComposite in="glowColor" in2="blurred" operator="in" result="glow" />
          <feComposite in="SourceGraphic" in2="glow" operator="over" />
        </filter>
      </defs>
    </svg>
  )
}