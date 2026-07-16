"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Search, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { hasAccess, hasFeature, routes } from "@/config";
import { useAppStore } from "@/stores/app-store";
import { DynamicIcon } from "@/components/shared/dynamic-icon";

export function CommandPalette() {
  const router = useRouter();
  const { commandOpen, setCommandOpen, goals, agents, setAssistantOpen, account } = useAppStore();
  const [query, setQuery] = useState("");
  if (!commandOpen) return null;
  const q = query.toLowerCase();
  const routeResults = routes.filter((item) => item.label.toLowerCase().includes(q) && hasAccess(account?.accessLevel, item.minAccess) && hasFeature(account?.subscription?.features, "feature" in item ? item.feature : undefined));
  const goalResults = goals.filter((item) => item.title.toLowerCase().includes(q));
  const agentResults = agents.filter((item) => item.name.toLowerCase().includes(q));
  const go = (href: string) => { router.push(href); setCommandOpen(false); };
  return <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Palette de commandes" onMouseDown={(event) => event.target === event.currentTarget && setCommandOpen(false)}><div className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-card shadow-2xl"><div className="flex items-center gap-3 border-b px-4"><Search className="size-5 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher ou lancer une commande…" className="h-14 border-0 bg-transparent px-0 focus:ring-0" /><Button variant="ghost" size="icon" onClick={() => setCommandOpen(false)}><X className="size-4" /></Button></div><div className="scrollbar-none max-h-[55vh] overflow-y-auto p-2"><p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Actions rapides</p><button onClick={() => go("/goals/new")} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted"><span className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500"><Sparkles className="size-4" /></span><div className="flex-1"><p className="text-sm font-medium">Créer un nouvel objectif</p><p className="text-xs text-muted-foreground">Transformer une intention en plan exécutable</p></div><ArrowRight className="size-4 text-muted-foreground" /></button><button onClick={() => { setCommandOpen(false); setAssistantOpen(true); }} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted"><span className="rounded-lg bg-cyan-500/10 p-2 text-cyan-500"><Bot className="size-4" /></span><div className="flex-1"><p className="text-sm font-medium">Parler au Coordinateur</p><p className="text-xs text-muted-foreground">Demander une analyse ou une action</p></div><ArrowRight className="size-4 text-muted-foreground" /></button>{routeResults.length > 0 && <><p className="mt-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Navigation</p>{routeResults.map((item) => <button key={item.href} onClick={() => go(item.href)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted"><DynamicIcon name={item.icon} className="size-4 text-muted-foreground" />{item.label}</button>)}</>}{q && goalResults.length > 0 && <><p className="mt-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Objectifs</p>{goalResults.map((goal) => <button key={goal.id} onClick={() => go(`/goals/${goal.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted"><Sparkles className="size-4 text-indigo-500" />{goal.title}</button>)}</>}{q && agentResults.length > 0 && <><p className="mt-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Agents</p>{agentResults.map((agent) => <button key={agent.id} onClick={() => go(`/agents/${agent.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted"><Bot className="size-4 text-cyan-500" />{agent.name}</button>)}</>}</div><div className="flex items-center justify-between border-t px-4 py-2 text-[10px] text-muted-foreground"><span>Entrée pour ouvrir · Échap pour fermer</span><span className="font-mono">ASTRA SEARCH</span></div></div></div>;
}
