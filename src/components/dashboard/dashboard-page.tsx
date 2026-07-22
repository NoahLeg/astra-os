"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ArrowRight, Bot, CalendarClock, CheckCircle2, ChevronRight, Clock3, FolderKanban, Gauge, Goal, Lightbulb, LoaderCircle, Play, ShieldCheck, Sparkles, TimerReset, Workflow, Zap } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassDecorative } from "@/components/ui/glass-decorative";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { toast } from "sonner";
import { AgentStatus, ConfidenceIndicator, RiskBadge } from "@/components/shared/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { goalService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { GoalAnalysis } from "@/types";

const chartData = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => ({ day, value: 0 }));

export function DashboardPage() {
  const { goals, approvals, agents, activities, automations, account } = useAppStore();
  const [intent, setIntent] = useState("");
  const [analysis, setAnalysis] = useState<GoalAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const analyze = async () => {
    if (intent.trim().length < 10) {
      toast.error("Décrivez votre objectif avec un peu plus de précision.");
      return;
    }
    setAnalyzing(true);
    setAnalysis(null);
    try {
      setAnalysis(await goalService.analyze(intent.trim()));
      toast.success("Objectif analysé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analyse impossible");
    } finally {
      setAnalyzing(false);
    }
  };

  const activeAgents = agents.filter((agent) => agent.status === "active").slice(0, 5);
  const availableAgents = agents.filter((agent) => agent.enabled).length;
  const pendingApprovals = approvals.filter((item) => item.status === "pending");
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const completedTasks = goals.flatMap((goal) => goal.steps).flatMap((step) => step.tasks).filter((task) => task.status === "completed").length;
  const measuredAgents = agents.filter((agent) => agent.tasksCompleted > 0);
  const averageSuccessRate = measuredAgents.length ? Math.round(measuredAgents.reduce((total, agent) => total + agent.successRate, 0) / measuredAgents.length) : 0;
  const displayName = account?.fullName?.split(/\s+/)[0] || account?.email.split("@")[0] || "Utilisateur";
  const upcomingGoals = goals.filter((goal) => goal.dueDate && !Number.isNaN(Date.parse(goal.dueDate))).sort((left, right) => Date.parse(left.dueDate) - Date.parse(right.dueDate)).slice(0, 3);
  const stats = [
    { label: "Objectifs actifs", value: String(activeGoals.length), delta: "Synchronisés", icon: Goal, color: "text-indigo-500", bg: "bg-indigo-500/10", accent: "#3A4CE0" },
    { label: "Tâches terminées", value: String(completedTasks), delta: "Mesurées", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", accent: "#16A987" },
    { label: "Temps économisé", value: "0 h", delta: "À mesurer", icon: Clock3, color: "text-cyan-500", bg: "bg-cyan-500/10", accent: "#18A9C7" },
    { label: "Automatisations", value: String(automations.filter((automation) => automation.status === "active").length), delta: "Actives", icon: Workflow, color: "text-violet-500", bg: "bg-violet-500/10", accent: "#6E42D9" },
    { label: "Réussite agents", value: `${averageSuccessRate} %`, delta: measuredAgents.length ? "Exécutions réelles" : "À mesurer", icon: Gauge, color: "text-pink-500", bg: "bg-pink-500/10", accent: "#FF4FA3" },
  ];

  return <div className="relative space-y-6 md:space-y-8">
    <GlassDecorative shape="circle" preset="vivid" size="sm" style={{ position: 'absolute', top: '5%', right: '2%', zIndex: 0, opacity: 0.6 }} />
    <GlassDecorative shape="blob" preset="subtle" size="md" style={{ position: 'absolute', bottom: '10%', left: '-2%', zIndex: 0, opacity: 0.3 }} />
    <GlassCard className="overflow-hidden">
      <section className="p-5 sm:p-7 lg:p-9">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--primary)/8%,transparent_60%)]" />
      <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-primary/20"><Sparkles className="size-3 text-primary" /></span><span className="font-mono text-[10px] font-medium uppercase tracking-[.12em] text-muted-foreground">Tableau de bord</span></div>
          <h1 className="mt-4 max-w-[18ch] font-display text-3xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-4xl lg:text-[2.8rem]">Bonjour {displayName}, <span className="text-primary">transformons une idée en résultat.</span></h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Décrivez votre objectif. Le système consulte le contexte autorisé, construit le plan et coordonne les bons agents sous votre contrôle.</p>

          <div className="mt-6 grid max-w-xl grid-cols-2 gap-3 sm:flex">
            <div className="rounded-lg border border-border/60 bg-background/50 px-4 py-3 backdrop-blur-sm"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">Agents disponibles</p><p className="mt-1 font-mono text-lg font-medium text-foreground">{availableAgents}</p></div>
            <div className="rounded-lg border border-border/60 bg-background/50 px-4 py-3 backdrop-blur-sm"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">Décisions en attente</p><p className="mt-1 font-mono text-lg font-medium text-primary">{pendingApprovals.length}</p></div>
          </div>

          <div className="mt-7 rounded-xl border border-border/60 bg-background/60 p-3 shadow-sm backdrop-blur-sm">
            <Textarea value={intent} onChange={(event) => { setIntent(event.target.value); setAnalysis(null); }} placeholder="Ex. Prépare le lancement de mon service d'automatisation pour les PME avant septembre." className="min-h-24 border-0 bg-transparent px-2 text-base text-foreground shadow-none placeholder:text-muted-foreground focus:ring-0 md:text-[17px]" />
            <div className="flex flex-col gap-3 border-t border-border/50 px-2 pt-3 sm:flex-row sm:items-center">            <div className="flex flex-1 flex-wrap gap-2"><Badge className="border-border/60 bg-background/50"><FolderKanban className="size-3" />Contexte projet</Badge><Badge className="border-border/60 bg-background/50"><ShieldCheck className="size-3" />Validation humaine</Badge><Badge className="border-border/60 bg-background/50"><Bot className="size-3" />Multi-agents</Badge></div><GlassButton onClick={() => void analyze()} disabled={analyzing}>{analyzing ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}Comprendre l'objectif</GlassButton></div>
          </div>
        </div>
      </div>

      {analysis ? <div className="mt-5 grid gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 md:grid-cols-[1fr_auto]"><div><div className="flex items-center gap-2 text-sm font-medium text-primary"><CheckCircle2 className="size-4" />Intention comprise avec {analysis.confidence} % de confiance</div><p className="mt-2 text-sm text-muted-foreground">{analysis.summary}</p><div className="mt-3 flex flex-wrap gap-2">{analysis.dueDate ? <Badge className="border-border/60 bg-background/50">Échéance · {new Date(analysis.dueDate).toLocaleDateString("fr-FR")}</Badge> : null}<Badge className="border-border/60 bg-background/50">{analysis.agentIds.length} agent(s)</Badge><Badge className="border-border/60 bg-background/50">{analysis.steps.length} étapes</Badge><Badge className="border-border/60 bg-background/50">{analysis.model}</Badge></div></div><Link href={`/goals/new?intent=${encodeURIComponent(intent)}`} className="self-center"><GlassButton>Construire le plan<ArrowRight className="size-4" /></GlassButton></Link></div> : null}
    </section></GlassCard>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{stats.map((stat) => <div key={stat.label} className="rounded-xl border border-border/60 bg-background/50 p-4 pt-5 backdrop-blur-sm" style={{ "--metric-accent": stat.accent } as CSSProperties}><div className="flex items-start justify-between"><span className={`${stat.bg} ${stat.color} rounded-lg p-2.5`}><stat.icon className="size-4" /></span><span className="font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">{stat.delta}</span></div><p className="mt-4 font-mono text-2xl font-medium">{stat.value}</p><p className="mt-1 text-xs text-muted-foreground">{stat.label}</p></div>)}</div>

    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <GlassCard><Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Objectifs en cours</CardTitle><CardDescription>Progression synchronisée entre vos agents.</CardDescription></div><Link href="/goals"><Button variant="ghost" size="sm">Tout voir<ChevronRight className="size-4" /></Button></Link></CardHeader><CardContent className="space-y-3">{activeGoals.length ? activeGoals.map((goal) => <Link key={goal.id} href={`/goals/${goal.id}`} className="block rounded-lg border bg-background/60 p-4 transition hover:-translate-y-0.5 hover:border-primary/45"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#3A4CE0]" /><h3 className="truncate font-medium">{goal.title}</h3></div><p className="mt-1 truncate text-xs text-muted-foreground">Échéance {new Date(goal.dueDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} · Autonomie N{goal.autonomyLevel}</p></div><span className="font-mono text-sm font-medium">{goal.progress}%</span></div><Progress value={goal.progress} className="mt-4" /><div className="mt-3 flex items-center justify-between"><div className="flex -space-x-2">{goal.agentIds.slice(0, 5).map((id) => <span key={id} className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-muted font-mono text-[8px] font-medium uppercase">{id.slice(0, 2)}</span>)}</div><span className="text-xs text-muted-foreground">{goal.steps.length} étapes planifiées</span></div></Link>) : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Aucun objectif actif.</p>}</CardContent></Card></GlassCard>
      <GlassCard config={{ blurAmount: 0.15, refraction: 0.4, specular: 0.05 }}><Card><CardHeader><CardTitle>Productivité augmentée</CardTitle><CardDescription>Heures réellement mesurées après exécution.</CardDescription></CardHeader><CardContent><div className="flex items-end justify-between"><div><p className="font-mono text-3xl font-medium">0 h</p><p className="mt-1 text-xs text-muted-foreground">Aucune mesure disponible</p></div><TimerReset className="size-8 text-cyan-500" /></div><div className="mt-5 h-36"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="productivity" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6E42D9" stopOpacity={0.48} /><stop offset="100%" stopColor="#6E42D9" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#8589B8" }} /><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="value" stroke="#8C9AFF" strokeWidth={2} fill="url(#productivity)" /></AreaChart></ResponsiveContainer></div></CardContent></Card></GlassCard>
    </div>

    <div className="grid gap-5 xl:grid-cols-3">
      <GlassCard config={{ blurAmount: 0.18, refraction: 0.45 }}><Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Validations requises</CardTitle><CardDescription>Décisions qui restent sous votre contrôle.</CardDescription></div><Link href="/approvals"><Badge className="border-[#FF4FA3]/20 bg-[#FF4FA3]/10 text-[#FF75B7]">{pendingApprovals.length} en attente</Badge></Link></CardHeader><CardContent className="space-y-3">{pendingApprovals.length ? pendingApprovals.slice(0, 2).map((approval) => <div key={approval.id} className="rounded-lg border bg-background/60 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{approval.action}</p><p className="mt-1 text-xs text-muted-foreground">Demandé par {approval.agent}</p></div><RiskBadge risk={approval.risk} /></div></div>) : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune décision en attente.</p>}</CardContent></Card></GlassCard>
      <GlassCard config={{ blurAmount: 0.18, refraction: 0.45 }}><Card><CardHeader><CardTitle>Agents actifs</CardTitle><CardDescription>Travail disponible dans votre espace.</CardDescription></CardHeader><CardContent className="space-y-2">{activeAgents.length ? activeAgents.map((agent) => <Link key={agent.id} href={`/agents/${agent.id}`} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted"><span className="flex size-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500"><Bot className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{agent.name}</p><AgentStatus status={agent.status} label={agent.lastActivity} /></div><ConfidenceIndicator value={agent.successRate} compact /></Link>) : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun agent actif.</p>}</CardContent></Card></GlassCard>
      <GlassCard config={{ blurAmount: 0.18, refraction: 0.45 }}><Card><CardHeader><CardTitle>Automatisations proposées</CardTitle><CardDescription>Opportunités détectées dans votre routine.</CardDescription></CardHeader><CardContent className="space-y-3">{automations.filter((item) => item.status === "suggested").length ? automations.filter((item) => item.status === "suggested").map((automation) => <div key={automation.id} className="rounded-lg border bg-background/60 p-4"><span className="mb-3 inline-flex rounded-lg bg-[#FF4FA3]/10 p-2 text-[#FF4FA3]"><Lightbulb className="size-4" /></span><p className="text-sm font-medium">{automation.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{automation.description}</p><Link href="/automations"><Button variant="outline" size="sm" className="mt-3">Examiner<ArrowRight className="size-3" /></Button></Link></div>) : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune proposition actuellement.</p>}</CardContent></Card></GlassCard>
    </div>

    <div className="grid gap-5 lg:grid-cols-[1fr_.75fr]">
      <GlassCard config={{ blurAmount: 0.15, refraction: 0.4 }}><Card><CardHeader><CardTitle>Activité récente</CardTitle><CardDescription>Un journal transparent de l'exécution numérique.</CardDescription></CardHeader><CardContent className="space-y-1">{activities.length ? activities.slice(0, 4).map((event) => <div key={event.id} className="flex items-center gap-3 border-b py-3 last:border-0"><span className="flex size-8 items-center justify-center rounded-lg bg-muted"><Zap className="size-3.5 text-indigo-500" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm">{event.action}</p><p className="font-mono text-[9px] text-muted-foreground">{event.agent} · {event.timestamp}</p></div><ConfidenceIndicator value={event.confidence} compact /></div>) : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune activité enregistrée.</p>}</CardContent></Card></GlassCard>
      <GlassCard config={{ blurAmount: 0.15, refraction: 0.4 }}><Card><CardHeader><CardTitle>À venir</CardTitle><CardDescription>Échéances issues de vos objectifs réels.</CardDescription></CardHeader><CardContent className="space-y-3">{upcomingGoals.length ? upcomingGoals.map((goal) => { const dueDate = new Date(goal.dueDate); return <Link href={`/goals/${goal.id}`} key={goal.id} className="flex gap-3 rounded-lg border bg-background/60 p-3 transition hover:border-primary/40"><div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-muted font-mono text-[9px] font-medium uppercase text-indigo-500">{dueDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</div><div className="min-w-0"><p className="truncate text-sm font-medium">{goal.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3" />Progression {goal.progress} %</p></div></Link>; }) : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune échéance planifiée.</p>}</CardContent></Card></GlassCard>
    </div>
  </div>;
}
