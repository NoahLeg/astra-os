"use client";

import { useState } from "react";
import { ArrowDown, Bot, CheckCircle2, CirclePause, CirclePlay, Download, GitBranch, History, LoaderCircle, Plus, ShieldCheck, Sparkles, Trash2, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/shared/modal";
import { PageHeader } from "@/components/shared/page-header";
import { automationService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { Automation, AutomationNode } from "@/types";

const nodeIcons = { trigger: CirclePlay, condition: GitBranch, agent: Bot, action: Workflow, approval: ShieldCheck, result: CheckCircle2 };
const nodeLabels: Record<AutomationNode["type"], string> = { trigger: "Déclencheur", condition: "Condition", agent: "Agent", action: "Action", approval: "Validation humaine", result: "Résultat" };
const defaultNodes: AutomationNode[] = [
  { id: crypto.randomUUID(), type: "trigger", label: "Chaque lundi à 09:00" },
  { id: crypto.randomUUID(), type: "condition", label: "Aucune réponse depuis 5 jours" },
  { id: crypto.randomUUID(), type: "agent", label: "Agent Email" },
  { id: crypto.randomUUID(), type: "approval", label: "Validation humaine" },
  { id: crypto.randomUUID(), type: "result", label: "Relance préparée" },
];

export function AutomationsPage() {
  const { automations, activities, addAutomation, updateAutomation, deleteAutomation, hydrateFromDatabase } = useAppStore();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [historyAutomation, setHistoryAutomation] = useState<Automation>();
  const [name, setName] = useState("Relance intelligente des prospects");
  const [description, setDescription] = useState("Prépare une relance personnalisée lorsque le prospect ne répond plus.");
  const [nodes, setNodes] = useState<AutomationNode[]>(defaultNodes);
  const [runningId, setRunningId] = useState<string>();

  const create = () => {
    if (!name.trim() || nodes.length < 2 || nodes.some((node) => !node.label.trim())) { toast.error("Ajoutez un nom et au moins deux blocs complets."); return; }
    const automation: Automation = {
      id: crypto.randomUUID(), name: name.trim(), description: description.trim(), status: "active",
      trigger: nodes.find((node) => node.type === "trigger")?.label ?? "Manuel",
      conditions: nodes.filter((node) => node.type === "condition").map((node) => node.label),
      actions: nodes.filter((node) => node.type === "action" || node.type === "result").map((node) => node.label),
      tools: nodes.filter((node) => node.type === "agent").map((node) => node.label.replace(/^Agent\s+/i, "")),
      autonomyLevel: nodes.some((node) => node.type === "approval") ? 2 : 1,
      nextRun: "Déclenchement selon la règle configurée", successRate: 0, runCount: 0, nodes,
    };
    addAutomation(automation);
    setBuilderOpen(false);
    toast.success("Automatisation créée dans Supabase");
  };

  const run = async (automation: Automation) => {
    setRunningId(automation.id);
    try {
      const execution = await automationService.run(automation.id);
      await hydrateFromDatabase();
      toast.success(`Workflow terminé avec ${execution.confidence} % de confiance`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Exécution impossible");
    } finally {
      setRunningId(undefined);
    }
  };

  const remove = (automation: Automation) => {
    if (!window.confirm(`Supprimer définitivement l’automatisation « ${automation.name} » ?`)) return;
    deleteAutomation(automation.id);
    toast.success("Automatisation supprimée");
  };

  const exportWorkflow = (automation: Automation) => {
    const blob = new Blob([JSON.stringify({ name: automation.name, nodes: automation.nodes, metadata: { source: "Astra OS", n8nCompatibleStructure: true } }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${automation.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalRuns = automations.reduce((sum, automation) => sum + (automation.runCount ?? 0), 0);
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Exécution récurrente" title="Automatisations" description="Créez, lancez et contrôlez des workflows persistants, avec validation humaine pour les actions externes." actions={<Button onClick={() => setBuilderOpen(true)}><Plus className="size-4" />Créer une automatisation</Button>} />
      <div className="grid gap-3 sm:grid-cols-3">{[
        { label: "Actives", value: automations.filter((item) => item.status === "active").length, icon: CirclePlay, tone: "text-emerald-500" },
        { label: "En pause ou proposées", value: automations.filter((item) => item.status !== "active").length, icon: Sparkles, tone: "text-violet-500" },
        { label: "Exécutions réelles", value: totalRuns, icon: CheckCircle2, tone: "text-indigo-500" },
      ].map((item) => <Card key={item.label}><CardContent className="flex items-center gap-4 p-5"><span className={`rounded-xl bg-muted p-3 ${item.tone}`}><item.icon className="size-5" /></span><div><p className="font-mono text-2xl font-semibold">{item.value}</p><p className="text-xs text-muted-foreground">{item.label}</p></div></CardContent></Card>)}</div>

      <div className="space-y-4">{automations.map((automation) => <Card key={automation.id}><CardContent className="p-5"><div className="flex flex-col gap-5 xl:flex-row xl:items-center"><div className="flex min-w-0 flex-1 items-start gap-4"><span className="rounded-xl bg-violet-500/10 p-3 text-violet-500"><Workflow className="size-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{automation.name}</h2><Badge className={automation.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}>{automation.status === "active" ? "Active" : automation.status === "suggested" ? "Proposée" : "En pause"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{automation.description}</p><div className="mt-3 flex flex-wrap gap-2">{automation.tools.map((tool) => <Badge key={tool} className="bg-muted text-muted-foreground">{tool}</Badge>)}</div></div></div><div className="grid shrink-0 grid-cols-3 gap-4 text-xs"><div><p className="text-muted-foreground">Déclencheur</p><p className="mt-1 max-w-32 font-medium">{automation.trigger}</p></div><div><p className="text-muted-foreground">Exécutions</p><p className="mt-1 font-mono font-medium">{automation.runCount ?? 0}</p></div><div><p className="text-muted-foreground">Réussite</p><p className="mt-1 font-mono font-semibold">{automation.successRate}%</p></div></div></div><div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">{automation.nodes.map((node, index) => { const Icon = nodeIcons[node.type]; return <div key={node.id} className="flex items-center gap-2"><span className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-xs"><Icon className="size-3.5 text-indigo-500" />{node.label}</span>{index < automation.nodes.length - 1 && <ArrowDown className="size-3 rotate-[-90deg] text-muted-foreground" />}</div>; })}<div className="ml-auto flex gap-1"><Button variant="ghost" size="sm" onClick={() => setHistoryAutomation(automation)}><History className="size-3.5" />Historique</Button><Button variant="ghost" size="icon" onClick={() => exportWorkflow(automation)} aria-label="Exporter"><Download className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => updateAutomation(automation.id, { status: automation.status === "active" ? "paused" : "active" })} aria-label={automation.status === "active" ? "Mettre en pause" : "Activer"}>{automation.status === "active" ? <CirclePause className="size-4" /> : <CirclePlay className="size-4" />}</Button><Button size="sm" disabled={runningId === automation.id || automation.status !== "active"} onClick={() => void run(automation)}>{runningId === automation.id ? <LoaderCircle className="size-4 animate-spin" /> : <CirclePlay className="size-4" />}Exécuter</Button><Button variant="ghost" size="icon" onClick={() => remove(automation)} aria-label={`Supprimer ${automation.name}`}><Trash2 className="size-4 text-rose-500" /></Button></div></div></CardContent></Card>)}</div>

      <Modal open={builderOpen} onClose={() => setBuilderOpen(false)} title="Constructeur d’automatisation" description="Chaque bloc est stocké et utilisé lors des exécutions manuelles."><div className="grid gap-4"><label className="text-sm font-medium">Nom<Input value={name} onChange={(event) => setName(event.target.value)} className="mt-2" /></label><label className="text-sm font-medium">Description<Input value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2" /></label></div><div className="mt-5 space-y-2">{nodes.map((node, index) => { const Icon = nodeIcons[node.type]; return <div key={node.id}><div className="flex items-center gap-3 rounded-xl border bg-background p-3"><span className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500"><Icon className="size-4" /></span><select aria-label={`Type du bloc ${index + 1}`} value={node.type} onChange={(event) => setNodes((items) => items.map((item) => item.id === node.id ? { ...item, type: event.target.value as AutomationNode["type"] } : item))} className="h-9 rounded-lg border bg-background px-2 text-xs">{Object.entries(nodeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label={`Libellé du bloc ${index + 1}`} value={node.label} onChange={(event) => setNodes((items) => items.map((item) => item.id === node.id ? { ...item, label: event.target.value } : item))} className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none" /><Button variant="ghost" size="icon" onClick={() => setNodes((items) => items.filter((item) => item.id !== node.id))} aria-label="Supprimer le bloc"><X className="size-4" /></Button></div>{index < nodes.length - 1 && <ArrowDown className="mx-auto my-1 size-4 text-muted-foreground" />}</div>; })}</div><Button variant="outline" size="sm" className="mt-3" onClick={() => setNodes((items) => [...items, { id: crypto.randomUUID(), type: "action", label: "Nouvelle action" }])}><Plus className="size-4" />Ajouter un bloc</Button><div className="mt-5 flex justify-end gap-2 border-t pt-4"><Button variant="ghost" onClick={() => setBuilderOpen(false)}>Annuler</Button><Button onClick={create}>Créer le workflow</Button></div></Modal>

      <Modal open={Boolean(historyAutomation)} onClose={() => setHistoryAutomation(undefined)} title={`Historique — ${historyAutomation?.name ?? ""}`} description="Résultats réellement produits et enregistrés dans le centre d’activité."><div className="space-y-3">{activities.filter((activity) => activity.tool === `Automation:${historyAutomation?.id}`).slice().reverse().map((activity) => <div key={activity.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{activity.action}</p><Badge className="bg-emerald-500/10 text-emerald-500">{activity.confidence}%</Badge></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{activity.details}</p></div>)}{historyAutomation && !activities.some((activity) => activity.tool === `Automation:${historyAutomation.id}`) && <p className="py-8 text-center text-sm text-muted-foreground">Aucune exécution enregistrée.</p>}</div></Modal>
    </div>
  );
}
