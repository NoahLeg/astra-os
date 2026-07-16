"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Search, Sparkles, X } from "lucide-react";
import { AstraMark } from "@/components/shared/astra-mark";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasAccess, hasFeature, routes } from "@/config";
import { useAppStore } from "@/stores/app-store";

const resultClassName = "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted";
const sectionClassName = "px-3 py-2 font-mono text-[9px] font-medium uppercase tracking-[.14em] text-muted-foreground";

export function CommandPalette() {
  const router = useRouter();
  const { commandOpen, setCommandOpen, goals, agents, setAssistantOpen, account } = useAppStore();
  const [query, setQuery] = useState("");

  if (!commandOpen) return null;

  const normalizedQuery = query.toLowerCase();
  const routeResults = routes.filter((item) => item.label.toLowerCase().includes(normalizedQuery) && hasAccess(account?.accessLevel, item.minAccess) && hasFeature(account?.subscription?.features, "feature" in item ? item.feature : undefined));
  const goalResults = goals.filter((item) => item.title.toLowerCase().includes(normalizedQuery));
  const agentResults = agents.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
  const go = (href: string) => {
    router.push(href);
    setCommandOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-[#06070F]/75 px-4 pt-[10vh] backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Palette de commandes"
      onMouseDown={(event) => event.target === event.currentTarget && setCommandOpen(false)}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-[10px] border bg-card shadow-[0_28px_90px_-28px_rgba(5,6,20,.75)]">
        <div className="flex items-center gap-3 border-b px-4">
          <AstraMark className="size-6 shrink-0" />
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher ou lancer une commande…"
            className="h-14 border-0 bg-transparent px-0 shadow-none focus:ring-0"
          />
          <Button variant="ghost" size="icon" onClick={() => setCommandOpen(false)} aria-label="Fermer la palette">
            <X className="size-4" />
          </Button>
        </div>

        <div className="scrollbar-none max-h-[58vh] overflow-y-auto p-2">
          <p className={sectionClassName}>Actions rapides</p>
          <button onClick={() => go("/goals/new")} className={resultClassName}>
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="size-4" /></span>
            <span className="flex-1">
              <span className="block text-sm font-medium">Créer un nouvel objectif</span>
              <span className="block text-xs text-muted-foreground">Transformer une intention en plan exécutable</span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => {
              setCommandOpen(false);
              setAssistantOpen(true);
            }}
            className={resultClassName}
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500"><Bot className="size-4" /></span>
            <span className="flex-1">
              <span className="block text-sm font-medium">Parler au Coordinateur</span>
              <span className="block text-xs text-muted-foreground">Demander une analyse ou une action</span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>

          {routeResults.length > 0 ? (
            <>
              <p className={`mt-2 ${sectionClassName}`}>Navigation</p>
              {routeResults.map((item) => (
                <button key={item.href} onClick={() => go(item.href)} className={resultClassName}>
                  <DynamicIcon name={item.icon} className="size-4 text-muted-foreground" />
                  <span className="text-sm">{item.label}</span>
                </button>
              ))}
            </>
          ) : null}

          {normalizedQuery && goalResults.length > 0 ? (
            <>
              <p className={`mt-2 ${sectionClassName}`}>Objectifs</p>
              {goalResults.map((goal) => (
                <button key={goal.id} onClick={() => go(`/goals/${goal.id}`)} className={resultClassName}>
                  <Sparkles className="size-4 text-primary" />
                  <span className="line-clamp-1 text-sm">{goal.title}</span>
                </button>
              ))}
            </>
          ) : null}

          {normalizedQuery && agentResults.length > 0 ? (
            <>
              <p className={`mt-2 ${sectionClassName}`}>Agents</p>
              {agentResults.map((agent) => (
                <button key={agent.id} onClick={() => go(`/agents/${agent.id}`)} className={resultClassName}>
                  <Bot className="size-4 text-violet-500" />
                  <span className="text-sm">{agent.name}</span>
                </button>
              ))}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2 font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">
          <span>Entrée pour ouvrir · Échap pour fermer</span>
          <span>Astra Search</span>
        </div>
      </div>
    </div>
  );
}
