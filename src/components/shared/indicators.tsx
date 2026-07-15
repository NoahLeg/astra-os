import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Agent, Permission, RiskLevel } from "@/types";
import { CheckCircle2, ShieldAlert } from "lucide-react";

export function ConfidenceIndicator({ value, compact = false }: { value: number; compact?: boolean }) {
  const tone = value >= 90 ? "text-emerald-500" : value >= 70 ? "text-amber-500" : "text-rose-500";
  return <div className={cn("flex items-center gap-2", tone)} title={`Confiance : ${value}%`}><span className="relative size-6 rounded-full" style={{ background: `conic-gradient(currentColor ${value * 3.6}deg, var(--muted) 0)` }}><span className="absolute inset-[3px] rounded-full bg-card" /></span><span className={cn("font-mono text-xs font-semibold", compact && "sr-only")}>{value}%</span></div>;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const labels = { low: "Risque faible", medium: "Risque modéré", high: "Risque élevé", critical: "Risque critique" };
  return <Badge className={cn("border-transparent", risk === "low" && "bg-emerald-500/10 text-emerald-500", risk === "medium" && "bg-amber-500/10 text-amber-500", risk === "high" && "bg-orange-500/10 text-orange-500", risk === "critical" && "bg-rose-500/10 text-rose-500")}><ShieldAlert className="size-3" />{labels[risk]}</Badge>;
}

export function AgentStatus({ status, label }: { status: Agent["status"]; label?: string }) {
  const active = status === "active";
  return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-2 rounded-full", active ? "bg-emerald-500 shadow-[0_0_12px_#10b981]" : status === "error" ? "bg-rose-500" : "bg-slate-500")} />{label ?? (active ? "Actif" : status === "paused" ? "En pause" : "Hors ligne")}</span>;
}

export function PermissionBadge({ permission }: { permission: Permission }) { return <Badge className="bg-muted text-muted-foreground"><CheckCircle2 className="size-3" />{permission.resource}</Badge>; }
