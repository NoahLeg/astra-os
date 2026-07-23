"use client"

import { useEffect, useState } from "react"

function getReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function getReducedTransparency(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-transparency: reduce)").matches
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(getReducedMotion)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return reduced
}

export function useReducedTransparency(): boolean {
  const [reduced, setReduced] = useState(getReducedTransparency)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-transparency: reduce)")
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return reduced
}

export function useReducedPreferences() {
  return {
    reducedMotion: useReducedMotion(),
    reducedTransparency: useReducedTransparency(),
  }
}