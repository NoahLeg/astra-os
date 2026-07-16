"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, Bot, CheckCircle2, CirclePause, CirclePlay, Download, GitBranch, History, LoaderCircle, Plus, Settings2, ShieldCheck, Sparkles, Trash2, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { ConfidenceIndicator } from "@/components/shared/indicators";
import { Modal } from "@/components/shared/modal";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { automationService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { AgentToolName, Automation, AutomationNode } from "@/types";

const nodeIcons = { trigger: CirclePlay, condition: GitBranch, agent: Bot, action: Workflow, approval: ShieldCheck, result: CheckCircle2 };
const nodeLabels: Record<AutomationNode["type"], string> = { trigger: "Déclencheur", condition: "Condition", agent: "Agent", action: "Action", approval: "Validation humaine", result: "Résultat" };
const baseNodes: AutomationNode[] = [
  { id: "builder-trigger", type: "trigger", label: "Déclenchement manuel" },
  { id: "builder-agent", type: "agent", label: "Agent Coordinateur" },
  { id: "builder-action", type: "action", label: "Produire le livrable demandé" },
  { id: "builder-approval", type: "approval", label: "Validation humaine si outil externe" },
  { id: "builder-result", type: "result", label: "Résultat enregistré" },
];

const toolOptions: Array<{ id: "auto" | AgentToolName; label: string; agentIds?: string[]; connectionId?: string }> = [
  { id: "auto", label: "Choix automatique — aucun outil imposé" },
  { id: "send_email", label: "Envoyer un e-mail Gmail", agentIds: ["coordinateur", "email"], connectionId: "gmail" },
  { id: "create_email_draft", label: "Créer un brouillon Gmail", agentIds: ["coordinateur", "email"], connectionId: "gmail" },
  { id: "organize_email", label: "Classer des e-mails Gmail", agentIds: ["coordinateur", "email"], connectionId: "gmail" },
  { id: "create_calendar_event", label: "Créer un événement Calendar", agentIds: ["coordinateur", "calendrier"], connectionId: "calendar" },
  { id: "create_drive_file", label: "Créer un fichier Drive", agentIds: ["coordinateur", "documents"], connectionId: "drive" },
];

export function AutomationsPage() {
  const { automations, agents, connections, activities, addAutomation, updateAutomation, deleteAutomation, hydrateFromDatabase } = useAppStore();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [historyAutomation, setHistoryAutomation] = useState<Automation>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instruction, setInstruction] = useState("");
  const [agentId, setAgentId] = useState("coordinateur");
  const [preferredTool, setPreferredTool] = useState<Automation["preferredTool"]>("auto");
  const [nodes, setNodes] = useState<AutomationNode[]>(baseNodes);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string>();
  const connectedIds = useMemo(() => new Set(connections.filter((connection) => connection.status === "connected").map((connection) => connection.id)), [connections]);
  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const compatibleTools = toolOptions.filter((tool) => !tool.agentIds || tool.agentIds.includes(agentId));

  const openBuilder = (automation?: Automation) => {
    setEditingId(automation?.id);
    setName(automation?.name ?? "");
    setDescription(automation?.description ?? "");
    setInstruction(automation?.instruction ?? automation?.actions.join(" ; ") ?? "");
    setAgentId(automation?.agentId ?? "coordinateur");
    setPreferredTool(automation?.preferredTool ?? "auto");
    setNodes(automation?.nodes?.length ? automation.nodes : baseNodes);
    setBuilderOpen(true);
  };

  const save = async () => {
    if (!name.trim() || !description.trim() || instruction.trim().length < 8 || !selectedAgent || nodes.some((node) => !node.label.trim())) {
      toast.error("Complétez le nom, la description, la consigne, l’agent et tous les blocs.");
      return;
    }
    const selectedTool = toolOptions.find((tool) => tool.id === preferredTool);
    if (selectedTool?.connectionId && !connectedIds.has(selectedTool.connectionId)) {
      toast.error(`Connectez ${selectedTool.connectionId} avant d’imposer cet outil.`);
      return;
    }
    const preparedNodes = nodes.some((node) => node.type === "agent")
      ? nodes.map((node) => node.type === "agent" ? { ...node, label: `Agent ${selectedAgent.name}` } : node)
      : [...nodes, { id: crypto.randomUUID(), type: "agent" as const, label: `Agent ${selectedAgent.name}` }];
    const previous = editingId ? automations.find((automation) => automation.id === editingId) : undefined;
    const automation: Automation = {
      id: editingId ?? crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      status: previous?.status ?? "active",
      trigger: preparedNodes.find((node) => node.type === "trigger")?.label ?? "Manuel",
      conditions: preparedNodes.filter((node) => node.type === "condition").map((node) => node.label),
      actions: [instruction.trim(), ...preparedNodes.filter((node) => node.type === "action").map((node) => node.label)],
      tools: Array.from(new Set([selectedAgent.name, ...(selectedTool && selectedTool.id !== "auto" ? [selectedTool.label] : [])])),
      autonomyLevel: preparedNodes.some((node) => node.type === "approval") ? 2 : 1,
      lastRun: previous?.lastRun,
      nextRun: previous?.nextRun ?? "Déclenchement manuel ou via API",
      successRate: previous?.successRate ?? 0,
      runCount: previous?.runCount ?? 0,
      nodes: preparedNodes,
      agentId: selectedAgent.id,
      instruction: instruction.trim(),
      preferredTool: preferredTool ?? "auto",
      lastResult: previous?.lastResult,
      lastConfidence: previous?.lastConfidence,
      lastStatus: previous?.lastStatus,
    };
    setSaving(true);
    try {
      if (editingId) await updateAutomation(editingId, automation);
      else await addAutomation(automation);
      setBuilderOpen(false);
      toast.success(editingId ? "Automatisation mise à jour" : "Automatisation créée dans Supabase");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const run = async (automation: Automation) => {
    setRunningId(automation.id);
    try {
      const execution = await automationService.run(automation.id);
      await hydrateFromDatabase();
      toast.success(execution.approval ? "Livrable prêt : l’outil attend votre validation" : `Workflow terminé avec ${execution.confidence} % de confiance`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Exécution impossible");
    } finally {
      setRunningId(undefined);
    }
  };

  const toggleStatus = async (automation: Automation) => {
    try {
      await updateAutomation(automation.id, { status: automation.status === "active" ? "paused" : "active" });
      toast.success(automation.status === "active" ? "Automatisation mise en pause" : "Automatisation activée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible");
    }
  };

  const remove = async (automation: Automation) => {
    if (!window.confirm(`Supprimer définitivement l’automatisation « ${automation.name} » ?`)) return;
    try {
      await deleteAutomation(automation.id);
      toast.success("Automatisation supprimée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  const exportWorkflow = (automation: Automation) => {
    const blob = new Blob([JSON.stringify({ name: automation.name, agentId: automation.agentId, instruction: automation.instruction, preferredTool: automation.preferredTool, nodes: automation.nodes, metadata: { source: "Astra OS", n8nCompatibleStructure: true } }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${automation.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalRuns = automations.reduce((sum, automation) => sum + (automation.runCount ?? 0), 0);
  return <div className="space-y-7">
    <PageHeader eyebrow="Exécution contrôlée" title="Automatisations" description="Reliez une consigne persistante à un agent et, si nécessaire, à un outil Google réellement connecté." actions={<Button onClick={() => openBuilder()}><Plus className="size-4" />Créer une automatisation</Button>} />
    <div className="grid gap-3 sm:grid-cols-3">{[{ label: "Actives", value: automations.filter((item) => item.status === "active").length, icon: CirclePlay, tone: "text-emerald-500" }, { label: "En pause ou proposées", value: automations.filter((item) => item.status !== "active").length, icon: Sparkles, tone: "text-violet-500" }, { label: "Exécutions enregistrées", value: totalRuns, icon: CheckCircle2, tone: "text-indigo-500" }].map((item) => <Card key={item.label}><CardContent className="flex items-center gap-4 p-5"><span className={`rounded-xl bg-muted p-3 ${item.tone}`}><item.icon className="size-5" /></span><div><p className="font-mono text-2xl font-semibold">{item.value}</p><p className="text-xs text-muted-foreground">{item.label}</p></div></CardContent></Card>)}</div>
    {automations.length ? <div className="space-y-4">{automations.map((automation) => {
      const executor = agents.find((agent) => agent.id === automation.agentId);
      const selectedTool = toolOptions.find((tool) => tool.id === automation.preferredTool);
      const ready = automation.status === "active" && Boolean(executor?.enabled) && (!selectedTool?.connectionId || connectedIds.has(selectedTool.connectionId));
      return <Card key={automation.id}><CardContent className="p-5"><div className="flex flex-col gap-5 xl:flex-row xl:items-start"><div className="flex min-w-0 flex-1 items-start gap-4"><span className="rounded-xl bg-violet-500/10 p-3 text-violet-500"><Workflow className="size-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{automation.name}</h2><Badge className={automation.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}>{automation.status === "active" ? "Active" : automation.status === "suggested" ? "Proposée" : "En pause"}</Badge><Badge className={ready ? "bg-cyan-500/10 text-cyan-500" : "bg-amber-500/10 text-amber-500"}>{ready ? "Prête" : "Configuration requise"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{automation.description}</p><p className="mt-3 rounded-xl bg-muted/30 p-3 text-xs leading-5"><strong>Consigne :</strong> {automation.instruction ?? automation.actions[0]}</p><div className="mt-3 flex flex-wrap gap-2"><Badge className="bg-indigo-500/10 text-indigo-500"><Bot className="mr-1 size-3" />{executor?.name ?? "Agent à configurer"}</Badge>{selectedTool ? <Badge className={selectedTool.connectionId && !connectedIds.has(selectedTool.connectionId) ? "bg-amber-500/10 text-amber-500" : "bg-muted text-muted-foreground"}>{selectedTool.label}</Badge> : null}</div></div></div><div className="grid shrink-0 grid-cols-3 gap-4 text-xs"><div><p className="text-muted-foreground">Déclencheur</p><p className="mt-1 max-w-32 font-medium">{automation.trigger}</p></div><div><p className="text-muted-foreground">Exécutions</p><p className="mt-1 font-mono font-medium">{automation.runCount ?? 0}</p></div><div><p className="text-muted-foreground">Réussite</p><p className="mt-1 font-mono font-semibold">{automation.successRate}%</p></div></div></div>{automation.lastResult ? <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium uppercase tracking-wider text-emerald-500">Dernier résultat</p>{typeof automation.lastConfidence === "number" ? <ConfidenceIndicator value={automation.lastConfidence} compact /> : null}</div><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{automation.lastResult}</p>{automation.lastStatus === "approval" ? <Button asChild variant="outline" size="sm" className="mt-3"><Link href="/approvals"><ShieldCheck className="size-4" />Valider l’outil</Link></Button> : null}</div> : null}<div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4"><div className="flex flex-1 flex-wrap gap-2">{automation.nodes.map((node, index) => { const Icon = nodeIcons[node.type]; return <div key={node.id} className="flex items-center gap-2"><span className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-xs"><Icon className="size-3.5 text-indigo-500" />{node.label}</span>{index < automation.nodes.length - 1 ? <ArrowDown className="size-3 rotate-[-90deg] text-muted-foreground" /> : null}</div>; })}</div><div className="ml-auto flex flex-wrap gap-1"><Button variant="ghost" size="sm" onClick={() => setHistoryAutomation(automation)}><History className="size-3.5" />Historique</Button><Button variant="ghost" size="icon" onClick={() => openBuilder(automation)} aria-label="Configurer"><Settings2 className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => exportWorkflow(automation)} aria-label="Exporter"><Download className="size-4" /></Button><Button variant="ghost" size="icon" onClick={() => void toggleStatus(automation)} aria-label={automation.status === "active" ? "Mettre en pause" : "Activer"}>{automation.status === "active" ? <CirclePause className="size-4" /> : <CirclePlay className="size-4" />}</Button><Button size="sm" disabled={runningId === automation.id || !ready} onClick={() => void run(automation)}>{runningId === automation.id ? <LoaderCircle className="size-4 animate-spin" /> : <CirclePlay className="size-4" />}Exécuter</Button><Button variant="ghost" size="icon" onClick={() => void remove(automation)} aria-label={`Supprimer ${automation.name}`}><Trash2 className="size-4 text-rose-500" /></Button></div></div></CardContent></Card>;
    })}</div> : <div className="rounded-2xl border border-dashed p-12 text-center"><Workflow className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 font-medium">Aucune automatisation</h2><p className="mt-1 text-sm text-muted-foreground">Créez un workflow lié à un agent actif et à vos connecteurs.</p></div>}

    <Modal open={builderOpen} onClose={() => setBuilderOpen(false)} title={editingId ? "Configurer l’automatisation" : "Constructeur d’automatisation"} description="Le serveur utilisera exactement cet agent, cette consigne et cet outil."><div className="grid gap-4"><label className="text-sm font-medium">Nom<Input value={name} onChange={(event) => setName(event.target.value)} className="mt-2" /></label><label className="text-sm font-medium">Description<Input value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2" /></label><label className="text-sm font-medium">Agent<select value={agentId} onChange={(event) => { setAgentId(event.target.value); setPreferredTool("auto"); }} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm">{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.enabled ? "actif" : "inactif"}</option>)}</select></label><label className="text-sm font-medium">Outil externe<select value={preferredTool ?? "auto"} onChange={(event) => setPreferredTool(event.target.value as Automation["preferredTool"])} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm">{compatibleTools.map((tool) => <option key={tool.id} value={tool.id}>{tool.label}{tool.connectionId ? connectedIds.has(tool.connectionId) ? " · connecté" : " · non connecté" : ""}</option>)}</select></label><label className="text-sm font-medium">Consigne persistante<Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} className="mt-2 min-h-28" placeholder="Ex. Prépare une relance personnalisée à partir du contexte disponible…" /></label></div><div className="mt-5 space-y-2">{nodes.map((node, index) => { const Icon = nodeIcons[node.type]; return <div key={node.id}><div className="flex items-center gap-3 rounded-xl border bg-background p-3"><span className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500"><Icon className="size-4" /></span><select aria-label={`Type du bloc ${index + 1}`} value={node.type} onChange={(event) => setNodes((items) => items.map((item) => item.id === node.id ? { ...item, type: event.target.value as AutomationNode["type"] } : item))} className="h-9 rounded-lg border bg-background px-2 text-xs">{Object.entries(nodeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label={`Libellé du bloc ${index + 1}`} value={node.type === "agent" ? `Agent ${selectedAgent?.name ?? ""}` : node.label} disabled={node.type === "agent"} onChange={(event) => setNodes((items) => items.map((item) => item.id === node.id ? { ...item, label: event.target.value } : item))} className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none disabled:text-muted-foreground" /><Button variant="ghost" size="icon" onClick={() => setNodes((items) => items.filter((item) => item.id !== node.id))} aria-label="Supprimer le bloc"><X className="size-4" /></Button></div>{index < nodes.length - 1 ? <ArrowDown className="mx-auto my-1 size-4 text-muted-foreground" /> : null}</div>; })}</div><Button variant="outline" size="sm" className="mt-3" onClick={() => setNodes((items) => [...items, { id: crypto.randomUUID(), type: "condition", label: "Nouvelle condition" }])}><Plus className="size-4" />Ajouter un bloc</Button><div className="mt-5 flex justify-end gap-2 border-t pt-4"><Button variant="ghost" onClick={() => setBuilderOpen(false)}>Annuler</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <SaveIcon />}{editingId ? "Enregistrer" : "Créer le workflow"}</Button></div></Modal>
    <Modal open={Boolean(historyAutomation)} onClose={() => setHistoryAutomation(undefined)} title={`Historique — ${historyAutomation?.name ?? ""}`} description="Résultats produits et enregistrés dans le centre d’activité."><div className="space-y-3">{activities.filter((activity) => activity.tool === `Automation:${historyAutomation?.id}`).slice().reverse().map((activity) => <div key={activity.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{activity.action}</p><ConfidenceIndicator value={activity.confidence} compact /></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{activity.details}</p></div>)}{historyAutomation && !activities.some((activity) => activity.tool === `Automation:${historyAutomation.id}`) ? <p className="py-8 text-center text-sm text-muted-foreground">Aucune exécution enregistrée.</p> : null}</div></Modal>
  </div>;
}

function SaveIcon() {
  return <CheckCircle2 className="size-4" />;
}
