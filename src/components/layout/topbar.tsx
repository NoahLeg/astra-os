"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LiquidGlass } from "@dpawlikowski/liquid-glass/react";
import { Bot, ChevronDown, LogOut, Menu, MessageSquareText, Moon, Search, ShieldCheck, Sun, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/layout/theme-provider";
import { routes } from "@/config";
import { useAppStore } from "@/stores/app-store";
import { NotificationCenter } from "./notification-center";

export function Topbar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { account, agents, setCommandOpen, setAssistantOpen, setMobileSidebarOpen } = useAppStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const route = routes.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  const displayName = account?.fullName || account?.email.split("@")[0] || "Utilisateur";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const activeAgents = agents.filter((agent) => agent.status === "active").length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  return (
    <LiquidGlass intensity="subtle" as="header" className="sticky top-0 z-40 flex h-[72px] items-center gap-1 border-b border-border/60 px-2 sm:gap-3 sm:px-4 md:px-6" style={{ "--lg-tint": "15 18 35", "--lg-opacity": "0.4", "--lg-blur": "10px", "--lg-radius": "0", "--lg-border-opacity": "0.1" } as unknown as React.CSSProperties}>
      <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setMobileSidebarOpen(true)} aria-label="Ouvrir la navigation"><Menu className="size-5" /></Button>
      <div className="hidden items-center gap-2 sm:flex"><span className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Astra OS</span><span className="text-muted-foreground/40">/</span><span className="text-sm font-medium">{route?.label ?? "Espace"}</span></div>
      <button type="button" onClick={() => setCommandOpen(true)} className="mx-auto flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card/80 px-2 text-left text-sm text-muted-foreground shadow-[0_10px_30px_-24px_rgba(9,8,35,.8)] transition hover:border-primary/40 sm:max-w-[460px] sm:px-3"><Search className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate"><span className="sm:hidden">Rechercher…</span><span className="hidden sm:inline">Rechercher un objectif, agent, document…</span></span><kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[9px] md:inline">Ctrl K</kbd></button>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <span className="hidden items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-2 font-mono text-[10px] font-medium text-violet-500 xl:flex"><Bot className="size-3.5" />{activeAgents} agents actifs</span>
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Changer de thème">{resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
        <NotificationCenter />
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => setAssistantOpen(true)} aria-label="Ouvrir l’assistant"><MessageSquareText className="size-4" /></Button>
        <div className="relative ml-1"><button type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} className="flex items-center gap-1 rounded-lg p-1 hover:bg-muted"><span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#3A4CE0] to-[#6E42D9] text-[10px] font-semibold text-white">{initials}</span><ChevronDown className="hidden size-3 text-muted-foreground sm:block" /></button>{profileOpen ? <div className="absolute right-0 top-12 w-64 rounded-[10px] border bg-popover p-2 shadow-2xl"><div className="flex items-center gap-3 border-b p-3"><span className="flex size-9 items-center justify-center rounded-lg bg-muted"><UserRound className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{displayName}</p><p className="truncate text-xs text-muted-foreground">{account?.email}</p></div></div><a href="/account" className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"><UserRound className="size-4" />Mon compte</a>{account?.isAdmin ? <a href="/admin" className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-500 hover:bg-rose-500/10"><ShieldCheck className="size-4" />Console Super Admin</a> : null}<form action="/api/auth/logout" method="post"><button type="submit" className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-500 hover:bg-rose-500/10"><LogOut className="size-4" />Se déconnecter</button></form></div> : null}</div>
      </div>
    </LiquidGlass>
  );
}
