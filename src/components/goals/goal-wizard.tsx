"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Bot, CalendarDays, Check, CheckCircle2, Database, LoaderCircle, Plus, ShieldCheck, Sparkles, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { autonomyLevels } from "@/config";
import { cn } from "@/lib/utils";
import { goalService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { AutonomyLevel, Goal, GoalAnalysis, GoalStep } from "@/types";

const schema = z.object({ intent: z.string().trim().min(15, "Décrivez un résultat attendu en au moins 15 caractères.").max(12_000) });
type FormData = z.infer<typeof schema>;
const wizardSteps = ["Objectif", "Contexte", "Précisions", "Plan", "Autonomie", "Confirmation"];

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function buildPlan(analysis: GoalAnalysis, dueDate: string): GoalStep[] {
  return analysis.steps.map((title, index) => ({
    id: crypto.randomUUID(),
    title,
    description: `Produire un résultat vérifiable pour l’étape « ${title} ».`,
    status: "pending",
    dueDate,
    agentIds: analysis.agentIds.length ? [analysis.agentIds[index % analysis.agentIds.length]] : ["coordinateur"],
    toolIds: [],
    risk: index === analysis.steps.length - 1 ? "medium" : "low",
    confidence: Math.max(55, analysis.confidence - index * 3),
    tasks: [{ id: crypto.randomUUID(), title, status: "pending", assignee: analysis.agentIds[index % Math.max(1, analysis.agentIds.length)] ?? "coordinateur", dueDate, confidence: Math.max(55, analysis.confidence - index * 3) }],
  }));
}

export function GoalWizard() {
  const router = useRouter();
  const addGoal = useAppStore((state) => state.addGoal);
  const updateProject = useAppStore((state) => state.updateProject);
  const projects = useAppStore((state) => state.projects);
  const connections = useAppStore((state) => state.connections);
  const memories = useAppStore((state) => state.memories);
  const agents = useAppStore((state) => state.agents);
  const [step, setStep] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [autonomy, setAutonomy] = useState<AutonomyLevel>(2);
  const [analysis, setAnalysis] = useState<GoalAnalysis>();
  const [plan, setPlan] = useState<GoalStep[]>([]);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [projectId, setProjectId] = useState("");
  const { register, getValues, setValue, trigger, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { intent: "" } });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intent = params.get("intent");
    const requestedProject = params.get("project");
    if (intent) setValue("intent", intent);
    const timeout = requestedProject && projects.some((project) => project.id === requestedProject)
      ? window.setTimeout(() => setProjectId(requestedProject), 0)
      : undefined;
    return () => { if (timeout) window.clearTimeout(timeout); };
  }, [projects, setValue]);

  const selectedProject = projects.find((project) => project.id === projectId);
  const suggestedAgents = useMemo(() => agents.filter((agent) => analysis?.agentIds.includes(agent.id)), [agents, analysis]);

  const next = async () => {
    if (step === 0) {
      if (!(await trigger())) return;
      setProcessing(true);
      try {
        const result = await goalService.analyze(getValues("intent"));
        const detectedDueDate = result.dueDate && !Number.isNaN(Date.parse(result.dueDate)) ? new Date(result.dueDate).toISOString().slice(0, 10) : dueDate;
        setAnalysis(result);
        setDueDate(detectedDueDate);
        setPlan(buildPlan(result, detectedDueDate));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "L’objectif n’a pas pu être analysé");
        return;
      } finally {
        setProcessing(false);
      }
    }
    if (step < wizardSteps.length - 1) setStep((current) => current + 1);
  };

  const create = async () => {
    if (!analysis || !plan.length) return;
    setCreating(true);
    const title = getValues("intent").replace(/[.!?]$/, "").slice(0, 180);
    const goal: Goal = {
      id: crypto.randomUUID(),
      projectId,
      title,
      description: analysis.summary,
      status: "active",
      priority: "high",
      progress: 0,
      createdAt: new Date().toISOString(),
      dueDate,
      autonomyLevel: autonomy,
      agentIds: analysis.agentIds,
      steps: plan.map((item) => ({ ...item, dueDate, tasks: item.tasks.map((task) => ({ ...task, dueDate })) })),
      decisions: [],
      agentRuns: [],
    };
    try {
      await addGoal(goal);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible");
      setCreating(false);
      return;
    }
    if (selectedProject) {
      try {
        await updateProject(selectedProject.id, { goalIds: Array.from(new Set([...selectedProject.goalIds, goal.id])) });
      } catch {
        toast.warning("Objectif créé, mais le lien au projet devra être ajouté manuellement.");
      }
    }
    toast.success("Objectif et plan enregistrés dans Supabase");
    router.push(`/goals/${goal.id}`);
  };

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="size-4" />Retour</Button><h1 className="mt-4 text-3xl font-semibold tracking-tight">Transformer une idée en résultat</h1><p className="mt-2 text-sm text-muted-foreground">L’analyse et le plan sont générés par l’API configurée pour votre entreprise.</p></div>
    <div className="scrollbar-none flex overflow-x-auto rounded-2xl border bg-card p-2">{wizardSteps.map((label, index) => <div key={label} className={cn("flex min-w-[135px] flex-1 items-center gap-2 rounded-xl px-3 py-2 text-xs", index === step && "bg-accent text-accent-foreground", index < step && "text-emerald-500", index > step && "text-muted-foreground")}><span className={cn("flex size-6 items-center justify-center rounded-full border font-mono text-[10px]", index < step && "border-emerald-500 bg-emerald-500 text-white", index === step && "border-indigo-500 text-indigo-500")}>{index < step ? <Check className="size-3" /> : index + 1}</span>{label}</div>)}</div>
    <Card className="min-h-[500px]"><CardContent className="p-6 md:p-8">{processing ? <div className="flex min-h-[420px] flex-col items-center justify-center text-center"><LoaderCircle className="size-9 animate-spin text-indigo-500" /><h2 className="mt-5 font-semibold">Analyse réelle en cours</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">L’API identifie les étapes et les agents adaptés sans exécuter d’action externe.</p></div> : <>
      {step === 0 ? <section><span className="inline-flex rounded-xl bg-indigo-500/10 p-3 text-indigo-500"><Sparkles className="size-5" /></span><h2 className="mt-5 text-xl font-semibold">Quel résultat voulez-vous obtenir ?</h2><p className="mt-2 text-sm text-muted-foreground">Ajoutez le résultat, l’échéance et les contraintes importantes.</p><Textarea {...register("intent")} className="mt-6 min-h-40 text-base" placeholder="Ex. Lancer mon offre avant septembre avec 10 prospects qualifiés…" />{errors.intent ? <p className="mt-2 text-xs text-rose-500">{errors.intent.message}</p> : null}</section> : null}
      {step === 1 ? <section><span className="inline-flex rounded-xl bg-cyan-500/10 p-3 text-cyan-500"><Database className="size-5" /></span><h2 className="mt-5 text-xl font-semibold">Contexte réellement disponible</h2><div className="mt-6 grid gap-3 sm:grid-cols-2">{[{ label: "Projets", value: `${projects.length} disponible${projects.length > 1 ? "s" : ""}` }, { label: "Mémoire autorisée", value: `${memories.filter((item) => !item.blocked).length} élément${memories.filter((item) => !item.blocked).length > 1 ? "s" : ""}` }, { label: "Connecteurs actifs", value: connections.filter((item) => item.status === "connected").map((item) => item.name).join(", ") || "Aucun" }, { label: "Modèle utilisé", value: analysis?.model ?? "Non disponible" }].map((item) => <div key={item.label} className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-sm font-medium">{item.value}</p></div>)}</div><div className="mt-5 flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><ShieldCheck className="mt-0.5 size-4 text-emerald-500" /><p className="text-sm">Seuls les éléments non bloqués et les connecteurs autorisés seront accessibles aux agents.</p></div></section> : null}
      {step === 2 ? <section><span className="inline-flex rounded-xl bg-amber-500/10 p-3 text-amber-500"><CalendarDays className="size-5" /></span><h2 className="mt-5 text-xl font-semibold">Précisez le cadre d’exécution</h2><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Échéance<Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2" /></label><label className="text-sm font-medium">Projet lié<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="">Aucun projet</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label></div><div className="mt-5 rounded-xl border bg-muted/30 p-4"><p className="text-xs font-medium text-indigo-500">Compréhension · {analysis?.confidence ?? 0} %</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{analysis?.summary}</p></div></section> : null}
      {step === 3 ? <section><div className="flex items-start justify-between gap-4"><div><span className="inline-flex rounded-xl bg-violet-500/10 p-3 text-violet-500"><Wrench className="size-5" /></span><h2 className="mt-5 text-xl font-semibold">Plan modifiable</h2><p className="mt-2 text-sm text-muted-foreground">Corrigez les étapes avant leur enregistrement.</p></div><Button variant="outline" size="sm" onClick={() => setPlan((items) => [...items, { id: crypto.randomUUID(), title: "Nouvelle étape", description: "Livrable à préciser", status: "pending", dueDate, agentIds: ["coordinateur"], toolIds: [], risk: "low", confidence: analysis?.confidence ?? 70, tasks: [] }])}><Plus className="size-4" />Ajouter</Button></div><div className="mt-6 space-y-3">{plan.map((item, index) => <div key={item.id} className="flex items-center gap-3 rounded-xl border bg-background p-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 font-mono text-xs text-indigo-500">{index + 1}</span><Input value={item.title} onChange={(event) => setPlan((items) => items.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry))} /><Button variant="ghost" size="icon" onClick={() => setPlan((items) => items.filter((entry) => entry.id !== item.id))} aria-label="Supprimer l’étape"><Trash2 className="size-4 text-rose-500" /></Button></div>)}</div></section> : null}
      {step === 4 ? <section><span className="inline-flex rounded-xl bg-emerald-500/10 p-3 text-emerald-500"><Bot className="size-5" /></span><h2 className="mt-5 text-xl font-semibold">Niveau d’autonomie</h2><div className="mt-6 space-y-2">{autonomyLevels.map((item) => <button type="button" key={item.level} onClick={() => setAutonomy(item.level)} className={cn("flex w-full items-center gap-4 rounded-xl border p-4 text-left", autonomy === item.level ? "border-indigo-500 bg-indigo-500/5" : "bg-background")}><span className={cn("flex size-9 items-center justify-center rounded-xl font-mono text-sm", autonomy === item.level ? "bg-indigo-500 text-white" : "bg-muted")}>N{item.level}</span><div className="flex-1"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.description}</p></div>{autonomy === item.level ? <CheckCircle2 className="size-5 text-indigo-500" /> : null}</button>)}</div></section> : null}
      {step === 5 ? <section className="text-center"><span className="inline-flex rounded-2xl bg-emerald-500/10 p-4 text-emerald-500"><CheckCircle2 className="size-7" /></span><h2 className="mt-5 text-2xl font-semibold">Objectif prêt à être enregistré</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Le plan sera persisté dans votre espace. Vous pourrez ensuite confier chaque prochaine action à un agent et valider ses outils.</p><div className="mx-auto mt-7 grid max-w-2xl gap-3 text-left sm:grid-cols-3"><Summary label="Étapes" value={String(plan.length)} /><Summary label="Agents suggérés" value={String(suggestedAgents.length)} /><Summary label="Autonomie" value={`Niveau ${autonomy}`} /></div><div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">{suggestedAgents.map((agent) => <Badge key={agent.id} className="bg-indigo-500/10 text-indigo-500">{agent.name}</Badge>)}</div><Button size="lg" className="mt-8" onClick={() => void create()} disabled={creating}>{creating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{creating ? "Enregistrement…" : "Créer l’objectif"}</Button></section> : null}
    </>}</CardContent></Card>
    {step < wizardSteps.length - 1 ? <div className="flex items-center justify-between"><Button variant="ghost" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ArrowLeft className="size-4" />Précédent</Button><Button onClick={() => void next()} disabled={processing || (step === 3 && !plan.length)}>Continuer<ArrowRight className="size-4" /></Button></div> : null}
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}
