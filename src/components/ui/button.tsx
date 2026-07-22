import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "danger" | "glass";
type Size = "sm" | "md" | "lg" | "icon";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; asChild?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ asChild = false, className, variant = "default", size = "md", ...props }, ref) => {
  const Component = asChild ? Slot.Root : "button";
  return <Component ref={ref} className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent font-semibold transition-[transform,background-color,border-color,color,box-shadow] duration-[var(--duration-normal)] ease-[var(--ease-out-expo)] disabled:pointer-events-none disabled:opacity-50 active:scale-[.97]", {
    "bg-primary text-primary-foreground shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] relative overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(180deg,color-mix(in_srgb,white_10%,transparent)_0%,transparent_50%)]": variant === "default",
    "bg-muted text-foreground hover:bg-border": variant === "secondary",
    "border-[var(--glass-border)] bg-[var(--glass-bg)] text-foreground backdrop-blur-[var(--glass-blur)] hover:bg-[var(--glass-bg-strong)]": variant === "outline",
    "text-muted-foreground hover:bg-muted hover:text-foreground": variant === "ghost",
    "bg-destructive text-white hover:brightness-105": variant === "danger",
    "glass-floating text-foreground hover:shadow-[var(--shadow-xl)] hover:brightness-110 active:brightness-95": variant === "glass",
    "h-8 px-3 text-xs": size === "sm", "h-10 px-4 text-sm": size === "md", "h-12 px-5 text-sm": size === "lg", "size-10 p-0": size === "icon",
  }, className)} {...props} />;
});
Button.displayName = "Button";
