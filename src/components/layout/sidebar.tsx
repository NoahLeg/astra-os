"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { hasAccess, hasFeature, routes } from "@/config";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { DynamicIcon } from "@/components/shared/dynamic-icon";

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, account, agents, approvals } = useAppStore();
  const goalBtnRef = useRef<HTMLAnchorElement>(null);
  const displayName = account?.fullName || account?.email.split("@")[0] || "Utilisateur";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const visibleRoutes = routes.filter((route) => hasAccess(account?.accessLevel, route.minAccess) && hasFeature(account?.subscription?.features, "feature" in route ? route.feature : undefined));
  const pendingApprovals = approvals.filter((item) => item.status === "pending").length;
  const activeAgents = agents.filter((agent) => agent.status === "active").length;

  const handleGoalPointer = useCallback((e: React.PointerEvent) => {
    const el = goalBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
    el.style.setProperty("--glass-light-x", `${x}%`);
  }, []);

  const handleGoalLeave = useCallback(() => {
    const el = goalBtnRef.current;
    if (!el) return;
    el.style.setProperty("--glass-light-x", "50%");
  }, []);

  return (
    <nav className={cn("fixed inset-y-0 left-0 z-50 hidden flex-col overflow-hidden transition-[width] duration-300 lg:flex glass-panel", sidebarCollapsed ? "w-[80px]" : "w-[264px]")}>
      <div className="flex h-[72px] items-center gap-3 border-b border-[var(--glass-border)] px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary shadow-[var(--shadow-sm)]"><Sparkles className="size-4" /></span>
        {!sidebarCollapsed ? <div className="min-w-0"><p className="font-display text-[17px] font-bold tracking-tight text-foreground">Astra</p><p className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Plateforme</p></div> : null}
      </div>

      <div className="p-3">
        {hasAccess(account?.accessLevel, "operator") ? (
          <Link
            ref={goalBtnRef}
            href="/goals/new"
            onPointerMove={handleGoalPointer}
            onPointerLeave={handleGoalLeave}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold shadow-[var(--shadow-lens)] transition-all duration-[var(--duration-normal)] ease-[var(--ease-out-expo)] active:scale-[.97] glass-lens text-primary-foreground",
              sidebarCollapsed ? "px-0" : "px-3",
            )}
            style={{
              "--glass-light-x": "50%",
              background: `
                radial-gradient(circle 60px at var(--glass-light-x, 50%) 50%, color-mix(in srgb, white 18%, transparent), transparent 70%),
                radial-gradient(ellipse 110% 85% at 50% 40%, color-mix(in srgb, var(--primary) 22%, transparent) 0%, color-mix(in srgb, var(--primary) 6%, transparent) 55%, transparent 100%),
                linear-gradient(180deg, color-mix(in srgb, white 20%, transparent) 0%, color-mix(in srgb, white 4%, transparent) 35%, transparent 70%)
              `,
            } as React.CSSProperties}
          >
            <Plus className="size-4" />
            {!sidebarCollapsed ? <span>Nouvel objectif</span> : null}
          </Link>
        ) : null}
      </div>

      <nav className="scrollbar-none flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {!sidebarCollapsed ? <p className="px-3 pb-2 pt-2 font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Espace de travail</p> : null}
        {visibleRoutes.map((route) => {
          const active = route.href === "/" ? pathname === "/" : pathname.startsWith(route.href);
          return (
            <Link
              key={route.href}
              href={route.href}
              title={sidebarCollapsed ? route.label : undefined}
              className={cn(
                "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-all duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] hover:translate-x-0.5",
                active
                  ? "glass-lens h-10 my-0.5 text-primary-foreground font-medium shadow-[var(--shadow-lens)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                sidebarCollapsed && "justify-center px-0 hover:translate-x-0",
              )}
            >
              <DynamicIcon
                name={route.icon}
                className={cn(
                  "size-4 shrink-0 transition",
                  active
                    ? "text-primary-foreground drop-shadow-[0_0_4px_color-mix(in_srgb,var(--primary-foreground)_30%,transparent)]"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {!sidebarCollapsed ? <span>{route.label}</span> : null}
              {active && !sidebarCollapsed ? <span className="absolute left-[-2px] size-1.5 rounded-full bg-primary-foreground ring-[3px] ring-primary-foreground/25 shadow-[0_0_6px_color-mix(in_srgb,var(--primary-foreground)_40%,transparent)]" /> : null}
              {route.href === "/approvals" && !sidebarCollapsed && pendingApprovals > 0 ? (
                <span className="ml-auto rounded-full border border-primary-foreground/30 bg-primary-foreground/12 px-2 py-0.5 font-mono text-[9px] font-medium text-primary-foreground">{pendingApprovals}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-[var(--glass-border)] p-3">
        <div className={cn("rounded-lg glass-floating p-3", sidebarCollapsed && "flex justify-center p-2.5")}>
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-2"><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
            {!sidebarCollapsed ? <div><p className="text-xs font-medium text-foreground">Système opérationnel</p><p className="font-mono text-[9px] text-muted-foreground">{activeAgents} agents actifs</p></div> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-muted">
          <Link href="/account" className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#3A4CE0] to-[#6E42D9] text-[10px] font-semibold text-white shadow-[var(--shadow-sm)]">{initials}</span>
            {!sidebarCollapsed ? <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground">{displayName}</span><span className="block truncate font-mono text-[9px] text-muted-foreground">{account?.workspaceName ?? "Espace de travail"}</span></span> : null}
          </Link>
          <button type="button" onClick={toggleSidebar} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={sidebarCollapsed ? "Déployer la barre latérale" : "Réduire la barre latérale"}>{sidebarCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}</button>
        </div>
      </div>
    </nav>
  );
}
