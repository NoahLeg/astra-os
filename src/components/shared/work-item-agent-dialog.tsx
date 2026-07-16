"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, CheckCircle2, LoaderCircle, PlugZap, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";
import { ConfidenceIndicator } from "@/components/shared/indicators";
import { Modal } from "@/components/shared/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { workItemService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { WorkItemExecution } from "@/types";

const connectorByAgent: Record<string, string[]> = {
  coordinateur: ["gmail", "calendar", "drive"],
  email: ["gmail"],
  calendrier: ["calendar"],
  documents: ["drive"],
};

export function WorkItemAgentDialog({ entityType, entityId, title, description, linkedAgentIds = [] }: {
  entityType: "goal" | "project";
  entityId: string;
  title: string;
  description: string;
  linkedAgentIds?: string[];
}) {
  const agents = useAppStore((state) => state.agents);
  const connections = useAppStore((state) => state.connections);
  const hydrateFromDatabase = useAppStore((state) => state.hydrateFromDatabase);
  const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents]);
  const firstAgentId = enabledAgents.find((agent) => linkedAgentIds.includes(agent.id))?.id ?? enabledAgents[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(firstAgentId);
  const [instruction, setInstruction] = useState(`Analyse « ${title} », produis le prochain livrable utile et propose une action via un connecteur uniquement si elle est nécessaire.`);
  const [running, setRunning] = useState(false);
  const [execution, setExecution] = useState<WorkItemExecution>();

  const selectedAgentId = agentId || firstAgentId;
  const selectedAgent = enabledAgents.find((agent) => agent.id === selectedAgentId);
  const connectedIds = new Set(connections.filter((connection) => connection.status === "connected").map((connection) => connection.id));
  const compatibleConnectors = (connectorByAgent[selectedAgentId] ?? []).map((id) => ({ id, connected: connectedIds.has(id) }));

  const run = async () => {
    if (!selectedAgent || instruction.trim().length < 8) {
      toast.error("Choisissez un agent et décrivez précisément la tâche.");
      return;
    }
    setRunning(true);
    try {
      const result = await workItemService.run(entityType, entityId, selectedAgent.id, instruction.trim());
      setExecution(result);
      await hydrateFromDatabase();
      toast.success(result.approval ? "Livrable prêt, action externe en attente de validation" : "Tâche terminée et enregistrée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Exécution impossible");
    } finally {
      setRunning(false);
    }
  };

  return <>
    <Button onClick={() => setOpen(true)} disabled={!enabledAgents.length}><Sparkles className="size-4" />Confier à un agent</Button>
    <Modal open={open} onClose={() => setOpen(false)} title={`Exécuter sur ${entityType === "goal" ? "l’objectif" : "le projet"}`} description="Le livrable est généré par l’agent. Toute action Gmail, Calendar ou Drive reste soumise à validation humaine.">
      <div className="rounded-xl border bg-muted/30 p-4"><p className="text-sm font-medium">{title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</p></div>
      <label className="mt-5 block text-sm font-medium">Agent responsable<select value={selectedAgentId} onChange={(event) => { setAgentId(event.target.value); setExecution(undefined); }} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="" disabled>Choisir un agent</option>{enabledAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} — {agent.role}</option>)}</select></label>
      {selectedAgent ? <div className="mt-3 rounded-xl border bg-background p-4"><div className="flex items-center gap-3"><span className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500"><Bot className="size-4" /></span><div><p className="text-sm font-medium">{selectedAgent.name}</p><p className="text-xs text-muted-foreground">{selectedAgent.description}</p></div></div><div className="mt-3 flex flex-wrap gap-2">{selectedAgent.tools.map((tool) => <Badge key={tool} className="bg-muted text-muted-foreground"><Wrench className="mr-1 size-3" />{tool}</Badge>)}{compatibleConnectors.map((connector) => <Badge key={connector.id} className={connector.connected ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}><PlugZap className="mr-1 size-3" />{connector.id} {connector.connected ? "connecté" : "à connecter"}</Badge>)}</div></div> : null}
      <label className="mt-5 block text-sm font-medium">Mission<Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} className="mt-2 min-h-32" maxLength={12_000} /></label>
      {execution ? <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-4 text-emerald-500" />Résultat enregistré</p><ConfidenceIndicator value={execution.confidence} compact /></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{execution.result}</p>{execution.approval ? <Button asChild variant="outline" size="sm" className="mt-4"><Link href="/approvals"><ShieldCheck className="size-4" />Examiner l’action proposée</Link></Button> : null}</div> : null}
      <div className="mt-5 flex justify-end gap-2 border-t pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Fermer</Button><Button onClick={() => void run()} disabled={running || !selectedAgent}>{running ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{running ? "Exécution…" : "Lancer la mission"}</Button></div>
    </Modal>
  </>;
}
