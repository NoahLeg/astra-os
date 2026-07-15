"use client";

import { useEffect, useState } from "react";
import { Activity, Bot, ChevronDown, CircleCheck, Clock3, Radio, Wrench, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfidenceIndicator } from "@/components/shared/indicators";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { activityService } from "@/services";
import { useAppStore } from "@/stores/app-store";

export function ActivityPage() {
  const storedActivities = useAppStore((state) => state.activities);
  const agents = useAppStore((state) => state.agents);
  const [events, setEvents] = useState(storedActivities);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live || storedActivities.length === 0) return;
    return activityService.subscribe((event) => setEvents((items) => [{ ...event, id: crypto.randomUUID(), timestamp: "À l’instant" }, ...items].slice(0, 20)));
  }, [live, storedActivities.length]);

  const metrics = [
    { label: "Agents actifs", value: agents.filter((agent) => agent.status === "active").length, icon: Bot, tone: "text-indigo-500" },
    { label: "En attente", value: events.filter((event) => event.status === "pending").length, icon: Clock3, tone: "text-amber-500" },
    { label: "Terminées", value: events.filter((event) => event.status === "completed").length, icon: CircleCheck, tone: "text-emerald-500" },
    { label: "Appels d’outils", value: events.filter((event) => event.tool).length, icon: Wrench, tone: "text-cyan-500" },
    { label: "Erreurs", value: events.filter((event) => event.status === "error").length, icon: XCircle, tone: "text-rose-500" },
  ];

  return <div className="space-y-7"><PageHeader eyebrow="Temps réel" title="Centre d’activité" description="Suivez les agents, appels d’outils, validations et incidents de votre entreprise." actions={<Button variant={live ? "default" : "outline"} onClick={() => setLive((value) => !value)}><Radio className={cn("size-4", live && events.length > 0 && "animate-pulse")} />{live ? "Flux en direct" : "Flux en pause"}</Button>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map((item) => <Card key={item.label}><CardContent className="flex items-center gap-4 p-4"><span className={`rounded-xl bg-muted p-2.5 ${item.tone}`}><item.icon className="size-4" /></span><div><p className="font-mono text-xl font-semibold">{item.value}</p><p className="text-xs text-muted-foreground">{item.label}</p></div></CardContent></Card>)}</div>{events.length === 0 ? <EmptyState icon="Activity" title="Aucune activité pour le moment" description="Les exécutions de vos agents et outils apparaîtront ici." /> : <Card><CardContent className="p-2 md:p-4"><div className="space-y-1">{events.map((event) => <div key={event.id} className="rounded-xl border border-transparent hover:border-border"><button onClick={() => setExpanded(expanded === event.id ? null : event.id)} className="flex w-full items-center gap-3 p-3 text-left"><span className={cn("flex size-9 items-center justify-center rounded-xl", event.status === "completed" ? "bg-emerald-500/10 text-emerald-500" : event.status === "active" ? "bg-indigo-500/10 text-indigo-500" : event.status === "approval" ? "bg-amber-500/10 text-amber-500" : "bg-rose-500/10 text-rose-500")}><Activity className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{event.action}</p>{event.tool && <Badge className="bg-muted text-muted-foreground">{event.tool}</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{event.agent} · {event.timestamp} · {(event.duration / 60).toFixed(1)} min</p></div><ConfidenceIndicator value={event.confidence} compact /><ChevronDown className={cn("size-4 text-muted-foreground transition", expanded === event.id && "rotate-180")} /></button>{expanded === event.id && <div className="mx-3 mb-3 rounded-xl bg-muted/40 p-4 text-xs leading-5 text-muted-foreground">{event.details}</div>}</div>)}</div></CardContent></Card>}</div>;
}
