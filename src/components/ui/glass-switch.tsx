"use client"

import { cn } from "@/lib/utils"

interface GlassSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  className?: string
}

export function GlassSwitch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: GlassSwitchProps) {
  return (
    <label className={cn("flex items-start gap-3", disabled && "cursor-not-allowed opacity-50", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-300",
          "backdrop-blur-md",
          checked
            ? "border-indigo-400/40 bg-indigo-500/30"
            : "border-white/10 bg-white/5",
        )}
      >
        <span
          className={cn(
            "inline-flex size-4 items-center justify-center rounded-full border shadow-lg transition-transform duration-300",
            checked
              ? "translate-x-[22px] border-indigo-300/50 bg-gradient-to-b from-white/80 to-white/30"
              : "translate-x-[3px] border-white/20 bg-gradient-to-b from-white/50 to-white/10",
          )}
        >
          {checked ? (
            <span className="size-2 rounded-full bg-indigo-500" />
          ) : null}
        </span>
      </button>
      {label || description ? (
        <div className="min-w-0 flex-1">
          {label ? <p className="text-xs font-medium text-white/80">{label}</p> : null}
          {description ? <p className="mt-0.5 text-[10px] text-white/50">{description}</p> : null}
        </div>
      ) : null}
    </label>
  )
}
