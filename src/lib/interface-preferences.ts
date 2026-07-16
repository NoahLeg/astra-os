import type { AccountPreferences } from "@/types";

export function applyInterfacePreferences(preferences: AccountPreferences) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.accent = preferences.accentColor;
  document.documentElement.dataset.density = preferences.density;
  document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion);
}
