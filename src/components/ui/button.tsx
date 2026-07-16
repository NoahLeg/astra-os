import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; asChild?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ asChild = false, className, variant = "default", size = "md", ...props }, ref) => {
  const Component = asChild ? Slot.Root : "button";
  return <Component ref={ref} className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent font-semibold transition-[transform,background-color,border-color,color,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px", {
    "bg-primary text-primary-foreground shadow-[0_10px_26px_-16px_var(--primary)] hover:-translate-y-0.5 hover:bg-[color-mix(in_srgb,var(--primary)_90%,#000)]": variant === "default",
    "bg-muted text-foreground hover:-translate-y-0.5 hover:border-primary/25 hover:bg-border": variant === "secondary",
    "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/55 hover:bg-muted": variant === "outline",
    "text-muted-foreground hover:bg-muted hover:text-foreground": variant === "ghost",
    "bg-destructive text-white hover:-translate-y-0.5 hover:brightness-105": variant === "danger",
    "h-8 px-3 text-xs": size === "sm", "h-10 px-4 text-sm": size === "md", "h-12 px-5 text-sm": size === "lg", "size-10 p-0": size === "icon",
  }, className)} {...props} />;
});
Button.displayName = "Button";
