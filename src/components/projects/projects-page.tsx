"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Bot, CalendarDays, FileText, Grid2X2, List, LoaderCircle, Plus, Save, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfidenceIndicator } from "@/components/shared/indicators";
import { Modal } from "@/components/shared/modal";
import { PageHeader } from "@/components/shared/page-header";
import { WorkItemAgentDialog } from "@/components/shared/work-item-agent-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { hasAccess } from "@/config";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type { Priority, Project, Status } from "@/types";

const projectSchema = z.object({
  title: z.string().trim().min(3, "Ajoutez un titre.").max(160),
  description: z.string().trim().min(10, "Ajoutez une description exploitable.").max(2_000),
  dueDate: z.string().min(1, "Ajoutez une échéance."),
  priority: z.enum(["low", "medium", "high"]),
});
type ProjectForm = z.infer<typeof projectSchema>;

function inThirtyDays() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export function ProjectsPage() {
  const projects = useAppStore((state) => state.projects);
  const agents = useAppStore((state) => state.agents);
  const account = useAppStore((state) => state.account);
  const addProject = useAppStore((state) => state.addProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(["coordinateur"]);
  const [creating, setCreating] = useState(false);
  const canEdit = hasAccess(account?.accessLevel, "operator");
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProjectForm>({ resolver: zodResolver(projectSchema), defaultValues: { title: "", description: "", dueDate: inThirtyDays(), priority: "medium" } });
  const filtered = projects.filter((project) => project.title.toLowerCase().includes(query.toLowerCase()) && (status === "all" || project.status === status) && (priority === "all" || project.priority === priority));

  const create = handleSubmit(async (values) => {
    setCreating(true);
    const project: Project = {
      id: crypto.randomUUID(),
      title: values.title,
      description: values.description,
      status: "active",
      priority: values.priority,
      progress: 0,
      dueDate: values.dueDate,
      goalIds: [],
      agentIds: selectedAgents,
      documentCount: 0,
      nextAction: "Créer le premier objectif",
      members: [],
      agentRuns: [],
    };
    try {
      await addProject(project);
      toast.success("Projet créé dans Supabase");
      setCreateOpen(false);
      reset({ title: "", description: "", dueDate: inThirtyDays(), priority: "medium" });
      setSelectedAgents(["coordinateur"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible");
    } finally {
      setCreating(false);
    }
  });

  const remove = async (project: Project) => {
    if (!window.confirm(`Supprimer « ${project.title} » ? Les objectifs seront conservés mais dissociés.`)) return;
    try {
      await deleteProject(project.id);
      toast.success("Projet supprimé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  return <div className="space-y-7">
    <PageHeader eyebrow="Portefeuille" title="Projets" description="Regroupez objectifs, personnes, agents et documents dans le contexte privé de votre entreprise." actions={canEdit ? <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />Nouveau projet</Button> : undefined} />
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un projet…" className="pl-9" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="all">Tous les statuts</option><option value="active">Actifs</option><option value="paused">En pause</option><option value="completed">Terminés</option></select><select value={priority} onChange={(event) => setPriority(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="all">Toutes les priorités</option><option value="high">Haute</option><option value="medium">Moyenne</option><option value="low">Basse</option></select><div className="flex rounded-xl border p-1"><Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setView("grid")} aria-label="Vue en grille"><Grid2X2 className="size-4" /></Button><Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setView("list")} aria-label="Vue en liste"><List className="size-4" /></Button></div></div>
    {filtered.length === 0 ? <EmptyState icon="FolderKanban" title={projects.length ? "Aucun projet ne correspond" : "Créez votre premier projet"} description={projects.length ? "Modifiez les filtres ou la recherche." : "Structurez vos objectifs, agents et documents dans un espace partagé."} /> : <div className={cn(view === "grid" ? "grid gap-4 lg:grid-cols-2 xl:grid-cols-3" : "space-y-3")}>{filtered.map((project) => <Card key={project.id} className="group"><CardContent className={cn("p-5", view === "list" && "flex flex-col gap-5 md:flex-row md:items-center")}><div className={cn(view === "list" && "flex-1")}><div className="flex items-start justify-between"><span className="rounded-xl bg-indigo-500/10 p-3 text-indigo-500"><Bot className="size-5" /></span><div className="flex items-center gap-2"><Badge className={project.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}>{project.status === "active" ? "Actif" : project.status === "completed" ? "Terminé" : "En pause"}</Badge>{canEdit ? <Button variant="ghost" size="icon" onClick={() => void remove(project)} aria-label={`Supprimer ${project.title}`}><Trash2 className="size-4 text-rose-500" /></Button> : null}</div></div><h2 className="mt-5 font-semibold">{project.title}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{project.description}</p></div><div className={cn(view === "list" && "w-full md:w-72")}><div className="mt-5 flex justify-between text-xs"><span className="text-muted-foreground">Progression</span><span className="font-mono font-semibold">{project.progress}%</span></div><Progress value={project.progress} className="mt-2" /><div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Users className="size-3.5" />{project.members.length} membres</span><span className="flex items-center gap-1.5"><FileText className="size-3.5" />{project.documentCount} documents</span><span className="col-span-2 flex items-center gap-1.5"><CalendarDays className="size-3.5" />{new Date(project.dueDate).toLocaleDateString("fr-FR")}</span></div><div className="mt-4 flex items-center justify-between border-t pt-4"><p className="line-clamp-1 text-xs font-medium">{project.nextAction}</p><Link href={`/projects/${project.id}`} className="rounded-lg p-2 text-indigo-500 hover:bg-indigo-500/10" aria-label={`Ouvrir ${project.title}`}><ArrowRight className="size-4" /></Link></div></div></CardContent></Card>)}</div>}
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Créer un projet" description="Le projet sera immédiatement disponible pour les objectifs et les agents."><form onSubmit={create} className="space-y-4"><label className="block text-sm font-medium">Nom<Input {...register("title")} className="mt-2" placeholder="Lancement commercial…" />{errors.title ? <span className="mt-1 block text-xs text-rose-500">{errors.title.message}</span> : null}</label><label className="block text-sm font-medium">Description<Textarea {...register("description")} className="mt-2" />{errors.description ? <span className="mt-1 block text-xs text-rose-500">{errors.description.message}</span> : null}</label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Échéance<Input type="date" {...register("dueDate")} className="mt-2" /></label><label className="text-sm font-medium">Priorité<select {...register("priority")} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="low">Basse</option><option value="medium">Moyenne</option><option value="high">Haute</option></select></label></div><div><p className="text-sm font-medium">Agents initiaux</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{agents.map((agent) => <label key={agent.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" checked={selectedAgents.includes(agent.id)} onChange={(event) => setSelectedAgents((items) => event.target.checked ? [...items, agent.id] : items.filter((id) => id !== agent.id))} className="size-4 accent-indigo-500" />{agent.name}</label>)}</div></div><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Annuler</Button><Button type="submit" disabled={creating}>{creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Créer</Button></div></form></Modal>
  </div>;
}

export function ProjectDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const project = useAppStore((state) => state.projects.find((item) => item.id === id));
  const goals = useAppStore((state) => state.goals);
  const agents = useAppStore((state) => state.agents);
  const account = useAppStore((state) => state.account);
  const updateProject = useAppStore((state) => state.updateProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ status: (project?.status ?? "active") as Status, priority: (project?.priority ?? "medium") as Priority, progress: project?.progress ?? 0, dueDate: project?.dueDate?.slice(0, 10) ?? "", nextAction: project?.nextAction ?? "", members: project?.members.join(", ") ?? "", agentIds: project?.agentIds ?? [] });
  if (!project) return notFound();
  const canEdit = hasAccess(account?.accessLevel, "operator");
  const projectGoals = goals.filter((goal) => project.goalIds.includes(goal.id) || goal.projectId === project.id);
  const projectAgents = agents.filter((agent) => project.agentIds.includes(agent.id));

  const save = async () => {
    setSaving(true);
    try {
      await updateProject(project.id, { ...draft, members: draft.members.split(",").map((item) => item.trim()).filter(Boolean) });
      toast.success("Projet mis à jour");
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Supprimer « ${project.title} » ? Les objectifs liés seront conservés.`)) return;
    try {
      await deleteProject(project.id);
      toast.success("Projet supprimé");
      router.push("/projects");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  return <div className="space-y-6">
    <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Tous les projets</Link>
    <section className="rounded-3xl border bg-card p-6 md:p-8"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex gap-2"><Badge className={project.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}>{project.status === "active" ? "Projet actif" : project.status === "completed" ? "Projet terminé" : "Projet en pause"}</Badge><Badge className="bg-muted text-muted-foreground">Priorité {project.priority}</Badge></div><h1 className="mt-4 text-3xl font-semibold">{project.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{project.description}</p></div>{canEdit ? <div className="flex flex-wrap gap-2"><WorkItemAgentDialog entityType="project" entityId={project.id} title={project.title} description={project.description} linkedAgentIds={project.agentIds} /><Button variant="outline" onClick={() => setEditing((value) => !value)}><Save className="size-4" />Modifier</Button><Button variant="ghost" size="icon" onClick={() => void remove()} aria-label="Supprimer le projet"><Trash2 className="size-4 text-rose-500" /></Button></div> : null}</div><div className="mt-7 flex items-center gap-4"><Progress value={project.progress} className="flex-1" /><span className="font-mono text-sm font-semibold">{project.progress}%</span></div></section>
    {editing ? <Card><CardHeader><CardTitle>Configuration du projet</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Statut<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Status })} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="active">Actif</option><option value="paused">En pause</option><option value="completed">Terminé</option></select></label><label className="text-sm font-medium">Priorité<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="low">Basse</option><option value="medium">Moyenne</option><option value="high">Haute</option></select></label><label className="text-sm font-medium">Échéance<Input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} className="mt-2" /></label><label className="text-sm font-medium">Progression ({draft.progress} %)<Input type="range" min={0} max={100} value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) })} className="mt-2 px-0" /></label><label className="text-sm font-medium sm:col-span-2">Prochaine action<Input value={draft.nextAction} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} className="mt-2" /></label><label className="text-sm font-medium sm:col-span-2">Membres, séparés par des virgules<Input value={draft.members} onChange={(event) => setDraft({ ...draft, members: event.target.value })} className="mt-2" /></label></div><div><p className="text-sm font-medium">Agents autorisés</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{agents.map((agent) => <label key={agent.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" checked={draft.agentIds.includes(agent.id)} onChange={(event) => setDraft({ ...draft, agentIds: event.target.checked ? [...draft.agentIds, agent.id] : draft.agentIds.filter((agentId) => agentId !== agent.id) })} className="size-4 accent-indigo-500" />{agent.name}</label>)}</div></div><div className="flex justify-end gap-2 border-t pt-4"><Button variant="ghost" onClick={() => setEditing(false)}>Annuler</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Enregistrer</Button></div></CardContent></Card> : null}
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><div className="space-y-5"><Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Objectifs liés</CardTitle>{canEdit ? <Button asChild size="sm"><Link href={`/goals/new?project=${project.id}`}><Plus className="size-4" />Nouvel objectif</Link></Button> : null}</div></CardHeader><CardContent className="space-y-3">{projectGoals.length ? projectGoals.map((goal) => <Link key={goal.id} href={`/goals/${goal.id}`} className="block rounded-xl border bg-background p-4 hover:border-indigo-500/40"><div className="flex justify-between gap-4"><p className="font-medium">{goal.title}</p><span className="font-mono text-sm">{goal.progress}%</span></div><Progress value={goal.progress} className="mt-3" /></Link>) : <p className="py-8 text-center text-sm text-muted-foreground">Aucun objectif lié.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Historique des agents</CardTitle></CardHeader><CardContent className="space-y-3">{project.agentRuns?.length ? project.agentRuns.slice().reverse().map((run) => <div key={run.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{run.agentName} · {run.instruction}</p><ConfidenceIndicator value={run.confidence} compact /></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{run.result}</p>{run.approvalId ? <Link href="/approvals" className="mt-2 inline-flex text-xs font-medium text-amber-500">Action à valider</Link> : null}</div>) : <p className="py-8 text-center text-sm text-muted-foreground">Aucune mission exécutée sur ce projet.</p>}</CardContent></Card></div><div className="space-y-5"><Card><CardHeader><CardTitle>Équipe et agents</CardTitle></CardHeader><CardContent className="space-y-2">{[...project.members.map((name) => ({ id: `member-${name}`, name, role: "Membre" })), ...projectAgents.map((agent) => ({ id: agent.id, name: agent.name, role: agent.role }))].map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3"><span className="flex size-8 items-center justify-center rounded-full bg-card text-xs uppercase">{item.name.slice(0, 2)}</span><div><p className="text-sm capitalize">{item.name}</p><p className="text-xs text-muted-foreground">{item.role}</p></div></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Prochaine action</CardTitle></CardHeader><CardContent><p className="text-sm leading-6">{project.nextAction}</p><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-4" />Échéance du projet : {new Date(project.dueDate).toLocaleDateString("fr-FR")}</div></CardContent></Card></div></div>
  </div>;
}
