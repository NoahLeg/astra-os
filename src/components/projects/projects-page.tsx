"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, CalendarDays, FileText, Grid2X2, List, Plus, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

export function ProjectsPage() {
  const projects = useAppStore((state) => state.projects);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = projects.filter((project) => project.title.toLowerCase().includes(query.toLowerCase()) && (status === "all" || project.status === status));

  return <div className="space-y-7"><PageHeader eyebrow="Portefeuille" title="Projets" description="Regroupez objectifs, personnes, agents et documents dans le contexte privé de votre entreprise." actions={<Button><Plus className="size-4" />Nouveau projet</Button>} /><div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un projet…" className="pl-9" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="all">Tous les statuts</option><option value="active">Actifs</option><option value="paused">En pause</option></select><div className="flex rounded-xl border p-1"><Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setView("grid")} aria-label="Vue en grille"><Grid2X2 className="size-4" /></Button><Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setView("list")} aria-label="Vue en liste"><List className="size-4" /></Button></div></div>{filtered.length === 0 ? <EmptyState icon="FolderKanban" title={projects.length ? "Aucun projet ne correspond" : "Créez votre premier projet"} description={projects.length ? "Modifiez les filtres ou la recherche." : "Structurez vos objectifs, agents et documents dans un espace partagé."} /> : <div className={cn(view === "grid" ? "grid gap-4 lg:grid-cols-2 xl:grid-cols-3" : "space-y-3")}>{filtered.map((project) => <Card key={project.id} className="group"><CardContent className={cn("p-5", view === "list" && "flex flex-col gap-5 md:flex-row md:items-center")}><div className={cn(view === "list" && "flex-1")}><div className="flex items-start justify-between"><span className="rounded-xl bg-indigo-500/10 p-3 text-indigo-500"><Bot className="size-5" /></span><Badge className={project.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}>{project.status === "active" ? "Actif" : "En pause"}</Badge></div><h2 className="mt-5 font-semibold">{project.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{project.description}</p></div><div className={cn(view === "list" && "w-full md:w-72")}><div className="mt-5 flex justify-between text-xs"><span className="text-muted-foreground">Progression</span><span className="font-mono font-semibold">{project.progress}%</span></div><Progress value={project.progress} className="mt-2" /><div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Users className="size-3.5" />{project.members.length} membres</span><span className="flex items-center gap-1.5"><FileText className="size-3.5" />{project.documentCount} documents</span><span className="col-span-2 flex items-center gap-1.5"><CalendarDays className="size-3.5" />{new Date(project.dueDate).toLocaleDateString("fr-FR")}</span></div><div className="mt-4 flex items-center justify-between border-t pt-4"><p className="text-xs font-medium">{project.nextAction}</p><Link href={`/projects/${project.id}`} className="rounded-lg p-2 text-indigo-500 hover:bg-indigo-500/10"><ArrowRight className="size-4" /></Link></div></div></CardContent></Card>)}</div>}</div>;
}

export function ProjectDetailPage({ id }: { id: string }) {
  const project = useAppStore((state) => state.projects.find((item) => item.id === id));
  const goals = useAppStore((state) => state.goals);
  if (!project) return notFound();
  const projectGoals = goals.filter((goal) => project.goalIds.includes(goal.id));
  return <div className="space-y-6"><Link href="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Tous les projets</Link><section className="rounded-3xl border bg-card p-6 md:p-8"><Badge className="bg-emerald-500/10 text-emerald-500">{project.status === "active" ? "Projet actif" : "Projet en pause"}</Badge><h1 className="mt-4 text-3xl font-semibold">{project.title}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{project.description}</p><Progress value={project.progress} className="mt-7" /></section><div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Card><CardHeader><CardTitle>Objectifs liés</CardTitle></CardHeader><CardContent className="space-y-3">{projectGoals.length ? projectGoals.map((goal) => <Link key={goal.id} href={`/goals/${goal.id}`} className="block rounded-xl border bg-background p-4 hover:border-indigo-500/40"><div className="flex justify-between"><p className="font-medium">{goal.title}</p><span className="font-mono text-sm">{goal.progress}%</span></div><Progress value={goal.progress} className="mt-3" /></Link>) : <p className="text-sm text-muted-foreground">Aucun objectif lié.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Équipe</CardTitle></CardHeader><CardContent className="space-y-2">{[...project.members, ...project.agentIds].map((item) => <div key={item} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3"><span className="flex size-8 items-center justify-center rounded-full bg-card text-xs uppercase">{item.slice(0, 2)}</span><span className="text-sm capitalize">{item}</span></div>)}</CardContent></Card></div></div>;
}
