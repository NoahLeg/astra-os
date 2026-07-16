"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
    <header className="sticky top-0 z-40 flex h-16 items-center gap-1 border-b bg-background/90 px-2 backdrop-blur-xl sm:gap-3 sm:px-4 md:px-6">
      <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setMobileSidebarOpen(true)} aria-label="Ouvrir la navigation"><Menu className="size-5" /></Button>
      <div className="hidden items-center gap-2 text-sm sm:flex"><span className="text-muted-foreground">Espace de travail</span><span className="text-muted-foreground">/</span><span className="font-medium">{route?.label ?? "Astra OS"}</span></div>
      <button onClick={() => setCommandOpen(true)} className="mx-auto flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-card px-2 text-left text-sm text-muted-foreground shadow-sm sm:max-w-md sm:px-3"><Search className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate"><span className="sm:hidden">Rechercher…</span><span className="hidden sm:inline">Rechercher un objectif, agent, document…</span></span><kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] md:inline">Ctrl K</kbd></button>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <span className="hidden items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-500 xl:flex"><Bot className="size-4" />{agents.filter((agent) => agent.status === "active").length} agents actifs</span>
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Changer de thème">{resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
        <NotificationCenter />
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => setAssistantOpen(true)} aria-label="Ouvrir l’assistant"><MessageSquareText className="size-4" /></Button>
        <div className="relative ml-1"><button onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} className="flex items-center gap-1 rounded-xl p-1 hover:bg-muted"><span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-semibold text-white">{initials}</span><ChevronDown className="hidden size-3 text-muted-foreground sm:block" /></button>{profileOpen && <div className="absolute right-0 top-12 w-64 rounded-2xl border bg-popover p-2 shadow-2xl"><div className="flex items-center gap-3 border-b p-3"><span className="flex size-9 items-center justify-center rounded-xl bg-muted"><UserRound className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{displayName}</p><p className="truncate text-xs text-muted-foreground">{account?.email}</p></div></div><a href="/account" className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted"><UserRound className="size-4" />Mon compte</a>{account?.isAdmin && <a href="/admin" className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-500 hover:bg-rose-500/10"><ShieldCheck className="size-4" />Console Super Admin</a>}<form action="/api/auth/logout" method="post"><button type="submit" className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-500 hover:bg-rose-500/10"><LogOut className="size-4" />Se déconnecter</button></form></div>}</div>
      </div>
    </header>
  );
}
