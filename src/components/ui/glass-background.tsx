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
      <div className="absolute -left-[20%] -top-[20%] size-[50%] rounded-full bg-indigo-500/20 blur-[120px]" />
      <div className="absolute -bottom-[20%] -right-[20%] size-[50%] rounded-full bg-violet-500/20 blur-[120px]" />
      <div className="absolute left-[30%] top-[40%] size-[30%] rounded-full bg-primary/10 blur-[100px]" />
    </div>
  )
}
