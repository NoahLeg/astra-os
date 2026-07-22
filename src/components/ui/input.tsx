import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { glass?: boolean }
export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, glass, ...props }, ref) => <input ref={ref} className={cn("h-10 w-full rounded-lg border bg-background px-3 text-sm shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_3%,transparent)] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15 transition-[border-color,box-shadow] duration-[var(--duration-fast)]", glass && "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] border-[var(--glass-border)]", className)} {...props} />);
Input.displayName = "Input";
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => <textarea ref={ref} className={cn("min-h-24 w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_3%,transparent)] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/15 transition-[border-color,box-shadow] duration-[var(--duration-fast)]", className)} {...props} />);
Textarea.displayName = "Textarea";
