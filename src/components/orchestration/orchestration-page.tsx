"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, CheckCircle2, ChevronRight, CircleAlert, Clock3, LoaderCircle, Network, Play, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { ConfidenceIndicator } from "@/components/shared/indicators";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { orchestrationService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { AutonomyLevel, MultiAgentMission } from "@/types";

export function OrchestrationPage() {
  const { agents, missions, account, addMission, hydrateFromDatabase } = useAppStore();
  const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled), [agents]);
  const [objective, setObjective] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>(4);
  const [running, setRunning] = useState(false);
  const [latestMission, setLatestMission] = useState<MultiAgentMission>();

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((current) => current.includes(agentId) ? current.filter((id) => id !== agentId) : current.length < 5 ? [...current, agentId] : current);
  };

  const runMission = async () => {
    if (objective.trim().length < 20) { toast.error("Décrivez la mission avec au moins 20 caractères."); return; }
    if (selectedAgentIds.length < 2) { toast.error("Sélectionnez au moins deux agents actifs."); return; }
    setRunning(true);
    try {
      const execution = await orchestrationService.run(objective.trim(), selectedAgentIds, autonomyLevel);
      setLatestMission(execution.mission);
      addMission(execution.mission);
      await hydrateFromDatabase();
      toast.success(execution.mission.approvalIds.length ? "Mission terminée, des actions attendent votre validation" : "Mission multi-agents terminée");
    } catch (error) {
      await hydrateFromDatabase();
      toast.error(error instanceof Error ? error.message : "Mission impossible");
    } finally {
      setRunning(false);
    }
  };

  const displayedMission = latestMission ?? missions[0];
  const usage = account?.subscription;
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Coordination autonome" title="Mission multi-agents" description="Confiez un résultat complexe au Coordinateur : il planifie, délègue aux agents actifs, consolide leurs livrables et place les actions externes en validation." />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="border-indigo-500/20">
          <CardHeader><CardTitle className="flex items-center gap-2"><Network className="size-5 text-indigo-500" />Configurer la mission</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <label className="block text-sm font-medium">Résultat attendu<Textarea value={objective} onChange={(event) => setObjective(event.target.value)} className="mt-2 min-h-32" placeholder="Ex. Prépare une campagne de lancement complète pour notre offre d’automatisation PME : proposition commerciale, calendrier, document Drive et e-mail de prise de contact." /></label>
            <div><div className="flex items-center justify-between"><p className="text-sm font-medium">Agents participants</p><span className="text-xs text-muted-foreground">{selectedAgentIds.length}/5 sélectionnés</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{enabledAgents.map((agent) => { const selected = selectedAgentIds.includes(agent.id); return <button key={agent.id} type="button" aria-pressed={selected} onClick={() => toggleAgent(agent.id)} className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition", selected ? "border-indigo-500 bg-indigo-500/10" : "bg-background hover:bg-muted/50")}><span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", selected ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground")}><Bot className="size-4" /></span><span><span className="block text-sm font-medium">{agent.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{agent.role}</span><span className="mt-1 block text-[10px] text-cyan-500">{agent.tools.slice(0, 2).join(" · ")}</span></span></button>; })}</div>{enabledAgents.length < 2 ? <p className="mt-3 text-xs text-amber-500">Activez au moins deux agents depuis la page Agents.</p> : null}</div>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Niveau d’autonomie<select value={autonomyLevel} onChange={(event) => setAutonomyLevel(Number(event.target.value) as AutonomyLevel)} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value={2}>Niveau 2 · avec validation</option><option value={3}>Niveau 3 · planification</option><option value={4}>Niveau 4 · coordination</option></select></label><div className="rounded-xl border bg-muted/30 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mesure de consommation</p><p className="mt-1 font-mono text-lg font-semibold">Tokens réels + coût USD</p><p className="text-[10px] text-muted-foreground">Calculés séparément pour le plan, chaque agent et la synthèse</p></div></div>
            <Button className="w-full" size="lg" disabled={running || selectedAgentIds.length < 2} onClick={() => void runMission()}>{running ? <LoaderCircle className="size-5 animate-spin" /> : <Play className="size-5" />}{running ? "Coordination en cours…" : "Lancer la mission"}</Button>
            {usage ? <div className="rounded-xl bg-muted/30 p-3"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Quota {usage.planName}</span><span className="font-mono">{usage.totalTokensUsed.toLocaleString("fr-FR")} / {usage.monthlyTokenLimit.toLocaleString("fr-FR")} tokens</span></div><Progress value={(usage.totalTokensUsed / usage.monthlyTokenLimit) * 100} className="mt-2" /></div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-violet-500" />Fonctionnement sécurisé</CardTitle></CardHeader>
          <CardContent className="space-y-3">{[
            ["1", "Le Coordinateur répartit l'objectif selon les rôles."],
            ["2", "Chaque agent produit un livrable avec une confiance mesurée."],
            ["3", "Les outils Gmail, Calendar et Drive restent en attente."],
            ["4", "Vous contrôlez puis exécutez chaque action sensible."],
          ].map(([number, text]) => <div key={number} className="flex gap-3 rounded-xl border bg-background p-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 font-mono text-xs font-semibold text-indigo-500">{number}</span><p className="text-sm leading-6 text-muted-foreground">{text}</p></div>)}<div className="flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" /><p className="text-xs leading-5 text-muted-foreground">Aucun e-mail, événement ou fichier n’est créé pendant la réflexion. L’exécution intervient uniquement depuis le Centre de validations.</p></div></CardContent>
        </Card>
      </div>

      {displayedMission ? <MissionResult mission={displayedMission} /> : <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed text-center"><Network className="size-9 text-indigo-500" /><h2 className="mt-4 font-medium">Aucune mission coordonnée</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Sélectionnez plusieurs agents pour créer votre première exécution complexe.</p></div>}
    </div>
  );
}

function MissionResult({ mission }: { mission: MultiAgentMission }) {
  return <section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-500">Dernière mission</p><h2 className="mt-1 text-xl font-semibold">{mission.title}</h2><p className="mt-1 text-sm text-muted-foreground">{mission.summary}</p></div><div className="flex items-center gap-2"><Badge className={mission.status === "completed" ? "bg-emerald-500/10 text-emerald-500" : mission.status === "error" ? "bg-rose-500/10 text-rose-500" : "bg-indigo-500/10 text-indigo-500"}>{mission.status === "completed" ? "Terminée" : mission.status === "error" ? "Erreur" : "En cours"}</Badge>{mission.approvalIds.length ? <Button asChild size="sm"><Link href="/approvals"><ShieldCheck className="size-3.5" />{mission.approvalIds.length} validation(s)</Link></Button> : null}</div></div><Progress value={mission.progress} />
    <div className="grid gap-4 lg:grid-cols-2">{mission.results.map((result) => <Card key={`${mission.id}-${result.agentId}`}><CardContent className="p-5"><div className="flex items-start gap-3"><span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", result.status === "error" ? "bg-rose-500/10 text-rose-500" : result.status === "approval" ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500")}>{result.status === "error" ? <CircleAlert className="size-4" /> : result.status === "approval" ? <Clock3 className="size-4" /> : <CheckCircle2 className="size-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{result.agentName}</p><ConfidenceIndicator value={result.confidence} compact /></div><p className="mt-1 text-xs text-indigo-500">{result.instruction}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{result.result}</p>{result.approvalId ? <Link href="/approvals" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-amber-500">Examiner l’action<ChevronRight className="size-3" /></Link> : null}</div></div></CardContent></Card>)}</div>
    {mission.finalResult ? <Card className="border-violet-500/20"><CardHeader><CardTitle>Synthèse du Coordinateur</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-7">{mission.finalResult}</p></CardContent></Card> : null}
  </section>;
}
