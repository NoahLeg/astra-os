import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "info" | "danger";

const badgeVariants: Record<BadgeVariant, string> = {
  default: "border-border bg-muted/50 text-muted-foreground",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  info: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  danger: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export function Badge({ className, variant = "default", ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) { return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium tracking-[.02em]", badgeVariants[variant], className)} {...props} />; }
