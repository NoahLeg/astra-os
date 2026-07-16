import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) { return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium tracking-[.02em]", className)} {...props} />; }
