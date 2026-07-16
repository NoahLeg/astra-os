import { cn } from "@/lib/utils";
export function Progress({ value, className }: { value: number; className?: string }) { return <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}><div className="h-full rounded-full bg-gradient-to-r from-[#3A4CE0] via-[#6E42D9] to-[#FF4FA3] transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>; }
