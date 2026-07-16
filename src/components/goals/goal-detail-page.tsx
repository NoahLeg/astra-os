"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bot, CalendarDays, CheckCircle2, FileText, ListChecks, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ExecutionTimeline } from "@/components/shared/execution-timeline";
import { ConfidenceIndicator } from "@/components/shared/indicators";
import { WorkItemAgentDialog } from "@/components/shared/work-item-agent-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { autonomyLevels, hasAccess } from "@/config";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type { AutonomyLevel, Priority, Status } from "@/types";

const tabs = ["Vue d’ensemble", "Plan", "Tâches", "Activité", "Documents", "Mémoire", "Décisions", "Paramètres"] as const;

export function GoalDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const goal = useAppStore((state) => state.goals.find((item) => item.id === id));
  const agents = useAppStore((state) => state.agents);
  const activities = useAppStore((state) => state.activities);
  const memories = useAppStore((state) => state.memories);
  const connections = useAppStore((state) => state.connections);
  const account = useAppStore((state) => state.account);
  const updateGoal = useAppStore((state) => state.updateGoal);
  const deleteGoal = useAppStore((state) => state.deleteGoal);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Vue d’ensemble");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    status: (goal?.status ?? "active") as Status,
    priority: (goal?.priority ?? "medium") as Priority,
    progress: goal?.progress ?? 0,
    dueDate: goal?.dueDate?.slice(0, 10) ?? "",
    autonomyLevel: (goal?.autonomyLevel ?? 2) as AutonomyLevel,
    agentIds: goal?.agentIds ?? [],
  });
  const goalActivities = useMemo(() => activities.filter((activity) => activity.tool === `Objectif:${id}`), [activities, id]);
  if (!goal) return notFound();
  const canEdit = hasAccess(account?.accessLevel, "operator");
  const goalAgents = agents.filter((agent) => goal.agentIds.includes(agent.id));
  const tasks = goal.steps.flatMap((step) => step.tasks.map((task) => ({ ...task, stepId: step.id, stepTitle: step.title })));
  const relatedMemories = memories.filter((memory) => !memory.blocked && (memory.relations.some((relation) => goal.title.toLowerCase().includes(relation.toLowerCase()) || relation.toLowerCase().includes(goal.title.toLowerCase())) || memory.content.toLowerCase().includes(goal.title.toLowerCase().split(" ")[0] ?? "")));
  const driveConnected = connections.some((connection) => connection.id === "drive" && connection.status === "connected");

  const remove = async () => {
    if (!window.confirm(`Supprimer définitivement l’objectif « ${goal.title} » ?`)) return;
    try {
      await deleteGoal(goal.id);
      toast.success("Objectif supprimé");
      router.push("/goals");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await updateGoal(goal.id, draft);
      toast.success("Objectif mis à jour");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible");
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (stepId: string, taskId: string) => {
    const steps = goal.steps.map((step) => step.id !== stepId ? step : {
      ...step,
      tasks: step.tasks.map((task) => task.id === taskId ? { ...task, status: task.status === "completed" ? "active" as const : "completed" as const } : task),
    });
    const allTasks = steps.flatMap((step) => step.tasks);
    const progress = allTasks.length ? Math.round((allTasks.filter((task) => task.status === "completed").length / allTasks.length) * 100) : goal.progress;
    try {
      await updateGoal(goal.id, { steps, progress, status: progress === 100 ? "completed" : goal.status });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tâche non mise à jour");
    }
  };

  return <div className="space-y-6">
    <section className="rounded-3xl border bg-card p-6 md:p-8"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div className="max-w-3xl"><div className="flex flex-wrap gap-2"><Badge className="border-indigo-500/20 bg-indigo-500/10 text-indigo-500">{goal.status === "completed" ? "Objectif terminé" : goal.status === "paused" ? "Objectif en pause" : "Objectif actif"}</Badge><Badge className="bg-muted text-muted-foreground">Priorité {goal.priority}</Badge><Badge className="bg-muted text-muted-foreground">Autonomie N{goal.autonomyLevel}</Badge></div><h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">{goal.title}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{goal.description}</p></div>{canEdit ? <div className="flex flex-wrap gap-2"><WorkItemAgentDialog entityType="goal" entityId={goal.id} title={goal.title} description={goal.description} linkedAgentIds={goal.agentIds} /><Button variant="outline" onClick={() => setTab("Paramètres")}><Save className="size-4" />Configurer</Button><Button variant="ghost" size="icon" onClick={() => void remove()} aria-label="Supprimer l’objectif"><Trash2 className="size-4 text-rose-500" /></Button></div> : null}</div><div className="mt-7 grid gap-4 md:grid-cols-[1fr_auto]"><div><div className="flex items-center justify-between text-xs"><span>Progression globale</span><span className="font-mono font-semibold">{goal.progress}%</span></div><Progress value={goal.progress} className="mt-2 h-2" /></div><div className="flex gap-6 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><CalendarDays className="size-4" />{new Date(goal.dueDate).toLocaleDateString("fr-FR")}</span><span className="flex items-center gap-1.5"><Bot className="size-4" />{goalAgents.length} agents</span></div></div></section>
    <div className="scrollbar-none flex overflow-x-auto border-b">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={cn("whitespace-nowrap border-b-2 px-4 py-3 text-sm", tab === item ? "border-indigo-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{item}</button>)}</div>

    {tab === "Vue d’ensemble" ? <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><Card><CardHeader><CardTitle>État d’exécution</CardTitle></CardHeader><CardContent><ExecutionTimeline steps={goal.steps.length ? goal.steps : fallbackSteps} /></CardContent></Card><div className="space-y-5"><Card><CardHeader><CardTitle>Agents impliqués</CardTitle></CardHeader><CardContent className="space-y-3">{goalAgents.length ? goalAgents.map((agent) => <div key={agent.id} className="flex items-center gap-3 rounded-xl border bg-background p-3"><span className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500"><Bot className="size-4" /></span><div className="flex-1"><p className="text-sm font-medium">{agent.name}</p><p className="text-xs text-muted-foreground">{agent.role}</p></div><Badge className={agent.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}>{agent.enabled ? "Actif" : "Inactif"}</Badge></div>) : <p className="text-sm text-muted-foreground">Aucun agent affecté.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Dernières exécutions</CardTitle></CardHeader><CardContent className="space-y-3">{goal.agentRuns?.length ? goal.agentRuns.slice(-3).reverse().map((run) => <div key={run.id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{run.agentName}</p><ConfidenceIndicator value={run.confidence} compact /></div><p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{run.result}</p>{run.approvalId ? <Link href="/approvals" className="mt-2 inline-flex text-xs font-medium text-amber-500">Validation requise</Link> : null}</div>) : <p className="text-sm text-muted-foreground">Aucune mission lancée depuis cet objectif.</p>}</CardContent></Card></div></div> : null}
    {tab === "Plan" ? <Card><CardHeader><CardTitle>Plan et dépendances</CardTitle></CardHeader><CardContent><ExecutionTimeline steps={goal.steps.length ? goal.steps : fallbackSteps} /></CardContent></Card> : null}
    {tab === "Tâches" ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="size-4" />Tâches opérationnelles</CardTitle></CardHeader><CardContent className="space-y-3">{tasks.length ? tasks.map((task) => <div key={task.id} className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center"><button disabled={!canEdit} onClick={() => void toggleTask(task.stepId, task.id)} className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border", task.status === "completed" && "border-emerald-500 bg-emerald-500 text-white")} aria-label={task.status === "completed" ? "Rouvrir la tâche" : "Terminer la tâche"}>{task.status === "completed" ? <CheckCircle2 className="size-4" /> : null}</button><div className="min-w-0 flex-1"><p className={cn("text-sm font-medium", task.status === "completed" && "line-through text-muted-foreground")}>{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.stepTitle} · {task.assignee}</p></div><span className="text-xs text-muted-foreground">{new Date(task.dueDate).toLocaleDateString("fr-FR")}</span></div>) : <p className="py-8 text-center text-sm text-muted-foreground">Aucune tâche dans ce plan.</p>}</CardContent></Card> : null}
    {tab === "Activité" ? <Card><CardHeader><CardTitle>Journal lié à l’objectif</CardTitle></CardHeader><CardContent className="space-y-3">{goalActivities.length ? goalActivities.slice().reverse().map((activity) => <div key={activity.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{activity.agent} · {activity.action}</p><ConfidenceIndicator value={activity.confidence} compact /></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{activity.details}</p></div>) : <p className="py-8 text-center text-sm text-muted-foreground">Aucune activité enregistrée.</p>}</CardContent></Card> : null}
    {tab === "Documents" ? <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><FileText className="size-8 text-indigo-500" /><h3 className="mt-4 font-medium">Documents liés</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{driveConnected ? "Demandez à l’agent Documents de créer un livrable : il apparaîtra dans votre Google Drive après validation." : "Connectez Google Drive pour permettre à l’agent Documents de créer de vrais fichiers."}</p>{canEdit ? <div className="mt-5"><WorkItemAgentDialog entityType="goal" entityId={goal.id} title={goal.title} description={goal.description} linkedAgentIds={["documents"]} /></div> : null}</CardContent></Card> : null}
    {tab === "Mémoire" ? <Card><CardHeader><CardTitle>Mémoire utilisable</CardTitle></CardHeader><CardContent className="space-y-3">{relatedMemories.length ? relatedMemories.map((memory) => <div key={memory.id} className="rounded-xl border p-4"><div className="flex items-center gap-2"><Badge className="bg-violet-500/10 text-violet-500">{memory.type}</Badge><p className="text-sm font-medium">{memory.title}</p></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{memory.content}</p></div>) : <p className="py-8 text-center text-sm text-muted-foreground">Aucun élément de mémoire directement relié. Les agents utilisent uniquement la mémoire non bloquée de l’entreprise.</p>}</CardContent></Card> : null}
    {tab === "Décisions" ? <Card><CardHeader><CardTitle>Historique des décisions</CardTitle></CardHeader><CardContent className="space-y-3">{goal.decisions.length ? goal.decisions.map((decision) => <div key={decision.id} className="rounded-xl border bg-background p-4"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /><h3 className="font-medium">{decision.title}</h3></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{decision.rationale}</p><div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{decision.agent}</span><span>{decision.model}</span><span>{new Date(decision.date).toLocaleString("fr-FR")}</span></div></div><ConfidenceIndicator value={decision.confidence} /></div><Button variant="outline" size="sm" className="mt-4" onClick={() => toast.success("Décision marquée pour réexamen")}><RotateCcw className="size-3" />Réexaminer</Button></div>) : <p className="py-12 text-center text-sm text-muted-foreground">Aucune décision enregistrée.</p>}</CardContent></Card> : null}
    {tab === "Paramètres" ? <Card><CardHeader><CardTitle>Configuration de l’objectif</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Statut<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Status })} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="active">Actif</option><option value="paused">En pause</option><option value="completed">Terminé</option></select></label><label className="text-sm font-medium">Priorité<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="low">Basse</option><option value="medium">Moyenne</option><option value="high">Haute</option></select></label><label className="text-sm font-medium">Échéance<Input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} className="mt-2" /></label><label className="text-sm font-medium">Progression ({draft.progress} %)<Input type="range" min={0} max={100} value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) })} className="mt-2 px-0" /></label><label className="text-sm font-medium">Autonomie<select value={draft.autonomyLevel} onChange={(event) => setDraft({ ...draft, autonomyLevel: Number(event.target.value) as AutonomyLevel })} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm">{autonomyLevels.map((item) => <option key={item.level} value={item.level}>N{item.level} · {item.name}</option>)}</select></label></div><div><p className="text-sm font-medium">Agents affectés</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{agents.map((agent) => <label key={agent.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" checked={draft.agentIds.includes(agent.id)} onChange={(event) => setDraft({ ...draft, agentIds: event.target.checked ? [...draft.agentIds, agent.id] : draft.agentIds.filter((id) => id !== agent.id) })} className="size-4 accent-indigo-500" />{agent.name}</label>)}</div></div><div className="flex flex-wrap justify-between gap-3 border-t pt-4"><Button variant="outline" className="text-rose-500" onClick={() => void remove()}><Trash2 className="size-4" />Supprimer l’objectif</Button><Button onClick={() => void saveSettings()} disabled={saving}><Save className="size-4" />{saving ? "Enregistrement…" : "Enregistrer"}</Button></div></CardContent></Card> : null}
  </div>;
}

const fallbackSteps = [{ id: "fallback", title: "Plan à compléter", description: "Ajoutez des étapes ou relancez l’analyse depuis un nouvel objectif.", status: "pending" as const, dueDate: new Date().toISOString(), agentIds: ["coordinateur"], toolIds: [], risk: "low" as const, confidence: 0, tasks: [] }];
