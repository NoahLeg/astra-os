"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AgentStatus } from "@/components/shared/indicators";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { hasAccess } from "@/config";
import { useAppStore } from "@/stores/app-store";

export function GoalsPage() {
  const goals = useAppStore((state) => state.goals);
  const account = useAppStore((state) => state.account);
  const deleteGoal = useAppStore((state) => state.deleteGoal);
  const canEdit = hasAccess(account?.accessLevel, "operator");

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Supprimer définitivement l’objectif « ${title} » et le retirer de ses projets ?`)) return;
    try {
      await deleteGoal(id);
      toast.success("Objectif supprimé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  return <div className="space-y-7">
    <PageHeader eyebrow="Orchestration" title="Objectifs" description="Chaque objectif relie votre intention à un plan, des agents, des décisions et des résultats mesurables." actions={canEdit ? <Button asChild><Link href="/goals/new"><Plus className="size-4" />Nouvel objectif</Link></Button> : undefined} />
    {goals.length ? <div className="grid gap-4 lg:grid-cols-2">{goals.map((goal) => <Card key={goal.id} className="group transition hover:border-indigo-500/40"><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><span className="rounded-xl bg-indigo-500/10 p-3 text-indigo-500"><Target className="size-5" /></span><div className="flex items-center gap-2"><Badge className="bg-muted text-muted-foreground">Priorité {goal.priority}</Badge><AgentStatus status={goal.status} />{canEdit ? <Button variant="ghost" size="icon" onClick={() => void remove(goal.id, goal.title)} aria-label={`Supprimer ${goal.title}`}><Trash2 className="size-4 text-rose-500" /></Button> : null}</div></div><h2 className="mt-5 text-lg font-semibold">{goal.title}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{goal.description}</p><div className="mt-5 flex items-center justify-between text-xs"><span className="text-muted-foreground">Progression globale</span><span className="font-mono font-semibold">{goal.progress}%</span></div><Progress value={goal.progress} className="mt-2" /><div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{new Date(goal.dueDate).toLocaleDateString("fr-FR")}</span><span>{goal.agentIds.length} agent{goal.agentIds.length > 1 ? "s" : ""}</span><span>{goal.agentRuns?.length ?? 0} exécution{(goal.agentRuns?.length ?? 0) > 1 ? "s" : ""}</span><Link href={`/goals/${goal.id}`} className="ml-auto flex items-center gap-1 font-medium text-indigo-500">Ouvrir<ArrowRight className="size-3.5 transition group-hover:translate-x-1" /></Link></div></CardContent></Card>)}</div> : <div className="rounded-2xl border border-dashed p-12 text-center"><Target className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 font-medium">Aucun objectif</h2><p className="mt-1 text-sm text-muted-foreground">Créez une intention, laissez l’API construire le plan, puis confiez les étapes aux agents.</p>{canEdit ? <Button asChild className="mt-5"><Link href="/goals/new"><Plus className="size-4" />Créer le premier objectif</Link></Button> : null}</div>}
  </div>;
}
