import { cn } from "@/lib/utils"

interface GlassBackgroundProps {
  className?: string
}

export function GlassBackground({ className }: GlassBackgroundProps) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      <div className="absolute -left-[15%] -top-[15%] size-[45%] rounded-full bg-indigo-500/12 blur-[140px]" />
      <div className="absolute -bottom-[15%] -right-[15%] size-[45%] rounded-full bg-violet-500/10 blur-[140px]" />
      <div className="absolute left-[35%] top-[45%] size-[25%] rounded-full bg-primary/8 blur-[120px]" />
    </div>
  )
}
