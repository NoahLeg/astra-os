"use client"

export function GlassSVGFilters() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }} aria-hidden="true">
      <defs>
        <filter id="lens-refraction" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves={2} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="0.5" />
        </filter>

        <filter id="lens-specular" x="-20%" y="-20%" width="140%" height="140%">
          <feSpecularLighting surfaceScale="5" specularConstant="1" specularExponent="20" lighting-color="white" result="specOut">
            <fePointLight x="50%" y="-20%" z="100" />
          </feSpecularLighting>
          <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} />
        </filter>

        <filter id="lens-chromatic" x="-20%" y="-20%" width="140%" height="140%">
          <feOffset in="SourceGraphic" dx="0.5" dy="0.5" result="offsetR" />
          <feOffset in="SourceGraphic" dx="-0.5" dy="-0.5" result="offsetB" />
          <feComposite in="offsetR" in2="offsetB" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} result="chromatic" />
          <feComposite in="SourceGraphic" in2="chromatic" operator="over" />
        </filter>

        <filter id="floating-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="12" result="blur" />
          <feOffset dx="0" dy="8" result="offsetBlur" />
          <feFlood flood-color="black" flood-opacity="0.24" />
          <feComposite in2="offsetBlur" operator="in" />
          <feComposite in="SourceGraphic" operator="over" />
        </filter>

        <filter id="contact-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
          <feOffset dx="0" dy="2" result="offsetBlur" />
          <feFlood flood-color="black" flood-opacity="0.4" />
          <feComposite in2="offsetBlur" operator="in" />
          <feComposite in="SourceGraphic" operator="over" />
        </filter>
      </defs>
    </svg>
  )
}