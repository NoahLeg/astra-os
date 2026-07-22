import { cn } from "@/lib/utils";

export function AstraMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("size-6", className)}><path d="M6.8 15.5 10.5 8M13.5 8l3.8 5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55" /><circle cx="5" cy="17" r="2.4" fill="#8C9AFF" /><circle cx="12" cy="6" r="2.4" fill="#B48CFF" /><circle cx="19" cy="15" r="2.4" fill="#FF4FA3" /></svg>;
}
