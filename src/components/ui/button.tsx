import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "default", size = "md", ...props }, ref) => (
  <button ref={ref} className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all disabled:pointer-events-none disabled:opacity-50 active:translate-y-px", {
    "bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)] hover:brightness-110": variant === "default",
    "bg-muted text-foreground hover:bg-border": variant === "secondary",
    "border bg-card text-foreground hover:bg-muted": variant === "outline",
    "text-muted-foreground hover:bg-muted hover:text-foreground": variant === "ghost",
    "bg-destructive text-white hover:brightness-110": variant === "danger",
    "h-8 px-3 text-xs": size === "sm", "h-10 px-4 text-sm": size === "md", "h-12 px-5 text-sm": size === "lg", "size-10 p-0": size === "icon",
  }, className)} {...props} />
));
Button.displayName = "Button";
