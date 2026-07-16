"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, Clock3, Cpu, LoaderCircle, Play, Shield, Wrench } from "lucide-react";
import { toast } from "sonner";
import { AgentStatus, ConfidenceIndicator, PermissionBadge } from "@/components/shared/indicators";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/utils";
import { agentService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { ApprovalRequest } from "@/types";

const persistentAgentCapabilities: Record<string, string[]> = {
  coordinateur: ["Lecture Gmail limitée", "Brouillons Gmail", "Classement Gmail", "Envoi Gmail", "Google Calendar", "Google Drive"],
  email: ["Lecture Gmail limitée", "Brouillons Gmail", "Classement Gmail", "Envoi après validation"],
  calendrier: ["Google Calendar"],
  documents: ["Google Drive"],
};

export function AgentsPage() {
  const { agents, toggleAgent } = useAppStore();
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Équipe numérique" title="Agents" description="Chaque agent actif peut maintenant recevoir une tâche réelle, produire un résultat OpenAI et journaliser son exécution." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <Card key={agent.id} className="group">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 text-indigo-500"><Bot className="size-5" /></span>
                <Switch checked={agent.enabled} onCheckedChange={() => { void toggleAgent(agent.id).then(() => toast.success(`${agent.name} ${agent.enabled ? "mis en pause" : "activé"}`)).catch((error) => toast.error(error instanceof Error ? error.message : "Mise à jour impossible")); }} label={`${agent.enabled ? "Désactiver" : "Activer"} ${agent.name}`} />
              </div>
              <div className="mt-4 flex items-center gap-2"><h2 className="font-semibold">{agent.name}</h2><AgentStatus status={agent.status} /></div>
              <p className="mt-1 text-xs font-medium text-indigo-500">{agent.role}</p>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{agent.description}</p>
              <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-center">
                <div><p className="font-mono text-sm font-semibold">{agent.tasksCompleted}</p><p className="text-[10px] text-muted-foreground">Exécutions</p></div>
                <div><p className="font-mono text-sm font-semibold">{agent.successRate}%</p><p className="text-[10px] text-muted-foreground">Réussite</p></div>
                <div><p className="font-mono text-sm font-semibold">{formatCurrency(agent.estimatedCost)}</p><p className="text-[10px] text-muted-foreground">Ce mois</p></div>
              </div>
              <div className="mt-4 flex items-center justify-between"><div><p className="text-[10px] text-muted-foreground">Modèle</p><p className="mt-0.5 text-xs font-medium">{agent.tasksCompleted ? agent.model : "Non exécuté"}</p></div><Link href={`/agents/${agent.id}`} className="flex items-center gap-1 text-xs font-medium text-indigo-500">Ouvrir<ArrowRight className="size-3.5 transition group-hover:translate-x-1" /></Link></div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AgentDetailPage({ id }: { id: string }) {
  const { agents, activities, dataStatus, toggleAgent, hydrateFromDatabase } = useAppStore();
  const [instruction, setInstruction] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ content: string; confidence: number; model: string; approval?: ApprovalRequest }>();
  const agent = agents.find((item) => item.id === id);
  if (!agent && dataStatus === "loading") return <div className="flex min-h-80 items-center justify-center"><LoaderCircle className="size-7 animate-spin text-indigo-500" /></div>;
  if (!agent) return notFound();
  const logs = activities.filter((event) => event.agent === agent.name).slice().reverse().slice(0, 8);
  const visibleTools = Array.from(new Set([...(persistentAgentCapabilities[agent.id] ?? []), ...agent.tools]));

  const run = async () => {
    if (instruction.trim().length < 5) { toast.error("Ajoutez une instruction précise."); return; }
    setRunning(true);
    setResult(undefined);
    try {
      const execution = await agentService.run(agent.id, instruction.trim());
      setResult({ content: execution.result, confidence: execution.confidence, model: execution.model, approval: execution.approval });
      await hydrateFromDatabase();
      toast.success("Tâche terminée et journalisée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Exécution impossible");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/agents" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Tous les agents</Link>
      <section className="rounded-3xl border bg-card p-6 md:p-8"><div className="flex flex-col gap-5 md:flex-row md:items-center"><span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-xl shadow-indigo-500/20"><Bot className="size-7" /></span><div className="flex-1"><div className="flex items-center gap-3"><h1 className="text-2xl font-semibold">{agent.name}</h1><AgentStatus status={agent.status} /></div><p className="mt-1 text-sm text-indigo-500">{agent.role}</p><p className="mt-3 max-w-2xl text-sm text-muted-foreground">{agent.description}</p></div><Button variant={agent.enabled ? "outline" : "default"} onClick={() => { void toggleAgent(agent.id).then(() => toast.success(agent.enabled ? "Agent mis en pause" : "Agent activé")).catch((error) => toast.error(error instanceof Error ? error.message : "Mise à jour impossible")); }}>{agent.enabled ? "Mettre en pause" : "Activer l’agent"}</Button></div></section>

      <Card className="border-indigo-500/20">
        <CardHeader><CardTitle className="flex items-center gap-2"><Play className="size-4 text-indigo-500" />Exécuter une tâche réelle</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={`Ex. ${agent.name === "Email" ? "Analyse mes e-mails non lus, prépare des brouillons et propose un classement." : "Analyse cet objectif et propose les prochaines étapes."}`} className="min-h-28" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">L’activation est conservée dans votre espace. Les lectures sont limitées et les modifications externes attendent toujours votre validation.</p>
            <Button className="w-full sm:w-auto" onClick={() => void run()} disabled={running || !agent.enabled}>{running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}{agent.enabled ? "Lancer l’agent" : "Agent désactivé"}</Button>
          </div>
          {result && <div className="mt-5 rounded-2xl border bg-background p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Badge className={result.approval ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}>{result.approval ? "Validation requise" : "Exécution terminée"}</Badge><div className="flex items-center gap-3"><ConfidenceIndicator value={result.confidence} compact /><Badge className="bg-muted text-muted-foreground">{result.model}</Badge></div></div><p className="whitespace-pre-wrap text-sm leading-6">{result.content}</p>{result.approval ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><div><p className="text-sm font-medium">{result.approval.action}</p><p className="mt-1 text-xs text-muted-foreground">L’outil n’a encore rien exécuté.</p></div><Button asChild><Link href="/approvals"><Shield className="size-4" />Examiner l’action</Link></Button></div> : null}</div>}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-5">
          <Card><CardHeader><CardTitle>Outils disponibles</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{visibleTools.map((tool) => <Badge key={tool} className="bg-muted text-muted-foreground"><Wrench className="size-3" />{tool}</Badge>)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Journaux réels</CardTitle></CardHeader><CardContent className="space-y-3">{logs.length ? logs.map((log) => <div key={log.id} className="rounded-xl border bg-background p-3"><div className="flex items-center gap-3"><CheckCircle2 className="size-4 text-emerald-500" /><div className="min-w-0 flex-1"><p className="truncate text-sm">{log.action}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString("fr-FR")} · {log.duration}s</p></div><ConfidenceIndicator value={log.confidence} compact /></div><p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">{log.details}</p></div>) : <p className="py-6 text-center text-sm text-muted-foreground">Aucune exécution pour cet agent.</p>}</CardContent></Card>
        </div>
        <div className="space-y-5">
          <Card><CardHeader><CardTitle>Statistiques mesurées</CardTitle></CardHeader><CardContent className="space-y-5">{[{ label: "Taux de réussite", value: agent.successRate, icon: CheckCircle2 }, { label: "Exécutions terminées", value: Math.min(100, agent.tasksCompleted), icon: Clock3 }, { label: "Dernière confiance", value: logs[0]?.confidence ?? 0, icon: Cpu }].map((item) => <div key={item.label}><div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 text-muted-foreground"><item.icon className="size-4" />{item.label}</span><span className="font-mono">{item.value}{item.label === "Exécutions terminées" ? "" : "%"}</span></div><Progress value={item.label === "Exécutions terminées" ? Math.min(100, item.value) : item.value} className="mt-2" /></div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle>Permissions</CardTitle></CardHeader><CardContent className="space-y-3">{agent.permissions.map((permission) => <div key={permission.resource} className="rounded-xl border bg-background p-3"><PermissionBadge permission={permission} /><p className="mt-2 text-xs text-muted-foreground">{permission.actions.join(" · ")}</p></div>)}<p className="flex items-start gap-2 text-xs text-muted-foreground"><Shield className="mt-0.5 size-3.5 text-emerald-500" />Les actions sensibles restent soumises à validation.</p></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
