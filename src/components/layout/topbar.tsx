"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, ChevronDown, LogOut, Menu, MessageSquareText, Moon, Search, ShieldCheck, Sun, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSearchPointer = useCallback((e: React.PointerEvent) => {
    const el = searchRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
    const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
    el.style.setProperty("--glass-light-x", `${x}%`);
    el.style.setProperty("--glass-light-y", `${y}%`);
  }, []);

  const handleSearchLeave = useCallback(() => {
    const el = searchRef.current;
    if (!el) return;
    el.style.setProperty("--glass-light-x", "50%");
    el.style.setProperty("--glass-light-y", "-20%");
  }, []);

  return (
    <header ref={headerRef} className={cn("sticky top-0 z-40 flex h-[72px] items-center gap-1 px-2 transition-shadow duration-[var(--duration-normal)] glass-panel sm:gap-3 sm:px-4 md:px-6", scrolled ? "shadow-[var(--shadow-lg)]" : "")}>
      <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setMobileSidebarOpen(true)} aria-label="Ouvrir la navigation"><Menu className="size-5" /></Button>
      <div className="hidden items-center gap-2 sm:flex"><span className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Astra OS</span><span className="text-muted-foreground/40">/</span><span className="text-sm font-medium">{route?.label ?? "Espace"}</span></div>
      <button
        ref={searchRef}
        type="button"
        onClick={() => setCommandOpen(true)}
        onPointerMove={handleSearchPointer}
        onPointerLeave={handleSearchLeave}
        className="mx-auto flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg glass-search px-2 text-left text-sm text-muted-foreground transition-all duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] sm:max-w-[460px] sm:px-3"
        style={{
          "--glass-light-x": "50%",
          "--glass-light-y": "-20%",
          background: `
            radial-gradient(circle 80px at var(--glass-light-x, 50%) var(--glass-light-y, -20%), color-mix(in srgb, white 10%, transparent), transparent 70%),
            radial-gradient(ellipse 100% 60% at 50% 0%, color-mix(in srgb, white 14%, transparent) 0%, transparent 60%),
            linear-gradient(180deg, color-mix(in srgb, white 6%, transparent) 0%, transparent 40%, color-mix(in srgb, black 8%, transparent) 100%),
            var(--glass-bg)
          `,
        } as React.CSSProperties}
      >
        <Search className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate"><span className="sm:hidden">Rechercher…</span><span className="hidden sm:inline">Rechercher un objectif, agent, document…</span></span>
        <kbd className="hidden rounded border border-[var(--glass-border)] bg-muted px-1.5 py-0.5 font-mono text-[9px] md:inline">Ctrl K</kbd>
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <span className="hidden items-center gap-2 rounded-full glass-lens px-3 py-2 font-mono text-[10px] font-medium text-primary xl:flex"><Bot className="size-3.5" />{activeAgents} agents actifs</span>
        <Button variant="ghost" size="icon" className="glass-control rounded-lg hidden sm:inline-flex" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Changer de thème">{resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
        <NotificationCenter />
        <Button variant="ghost" size="icon" className="glass-control rounded-lg hidden sm:inline-flex" onClick={() => setAssistantOpen(true)} aria-label="Ouvrir l’assistant"><MessageSquareText className="size-4" /></Button>
        <div className="relative ml-1"><button type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} className="flex items-center gap-1 rounded-lg p-1 transition-colors hover:bg-muted"><span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#3A4CE0] to-[#6E42D9] text-[10px] font-semibold text-white shadow-[var(--shadow-sm)]">{initials}</span><ChevronDown className="hidden size-3 text-muted-foreground sm:block" /></button>{profileOpen ? <div className="glass-floating absolute right-0 top-12 w-64 rounded-[10px] border border-[var(--glass-border)] p-2 shadow-[var(--shadow-xl)]"><div className="flex items-center gap-3 border-b border-[var(--glass-border)] p-3"><span className="flex size-9 items-center justify-center rounded-lg bg-muted"><UserRound className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{displayName}</p><p className="truncate text-xs text-muted-foreground">{account?.email}</p></div></div><a href="/account" className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"><UserRound className="size-4" />Mon compte</a>{account?.isAdmin ? <a href="/admin" className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-500 transition-colors hover:bg-rose-500/10"><ShieldCheck className="size-4" />Console Super Admin</a> : null}<form action="/api/auth/logout" method="post"><button type="submit" className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-500 transition-colors hover:bg-rose-500/10"><LogOut className="size-4" />Se déconnecter</button></form></div> : null}</div>
      </div>
    </header>
  );
}
