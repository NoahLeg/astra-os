import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input ref={ref} className={cn("h-10 w-full rounded-xl border bg-background px-3 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30", className)} {...props} />);
Input.displayName = "Input";
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => <textarea ref={ref} className={cn("min-h-24 w-full resize-none rounded-xl border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30", className)} {...props} />);
Textarea.displayName = "Textarea";
