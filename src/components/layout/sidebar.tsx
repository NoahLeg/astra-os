"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { hasAccess, hasFeature, routes } from "@/config";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { DynamicIcon } from "@/components/shared/dynamic-icon";

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, account, agents, approvals } = useAppStore();
  const displayName = account?.fullName || account?.email.split("@")[0] || "Utilisateur";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const visibleRoutes = routes.filter((route) => hasAccess(account?.accessLevel, route.minAccess) && hasFeature(account?.subscription?.features, "feature" in route ? route.feature : undefined));
  const pendingApprovals = approvals.filter((item) => item.status === "pending").length;
  const activeAgents = agents.filter((agent) => agent.status === "active").length;

  return (
    <nav className={cn("fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-border/60 bg-card/60 backdrop-blur-lg transition-[width] duration-300 lg:flex", sidebarCollapsed ? "w-[80px]" : "w-[264px]")}>
      <div className="flex h-[72px] items-center gap-3 border-b border-border/50 px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary"><Sparkles className="size-4" /></span>
        {!sidebarCollapsed ? <div className="min-w-0"><p className="font-display text-[17px] font-bold tracking-tight text-foreground">Astra</p><p className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Plateforme</p></div> : null}
      </div>

      <div className="p-3">
        {hasAccess(account?.accessLevel, "operator") ? <Link href="/goals/new" className={cn("flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary/90", sidebarCollapsed ? "px-0" : "px-3")}><Plus className="size-4" />{!sidebarCollapsed ? <span>Nouvel objectif</span> : null}</Link> : null}
      </div>

      <nav className="scrollbar-none flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {!sidebarCollapsed ? <p className="px-3 pb-2 pt-2 font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Espace de travail</p> : null}
        {visibleRoutes.map((route) => {
          const active = route.href === "/" ? pathname === "/" : pathname.startsWith(route.href);
          return <Link key={route.href} href={route.href} title={sidebarCollapsed ? route.label : undefined} className={cn("group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition", active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground", sidebarCollapsed && "justify-center px-0")}><DynamicIcon name={route.icon} className={cn("size-4 shrink-0 transition", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />{!sidebarCollapsed ? <span>{route.label}</span> : null}{active && !sidebarCollapsed ? <span className="absolute left-0 size-1.5 rounded-full bg-primary ring-2 ring-primary/30" /> : null}{route.href === "/approvals" && !sidebarCollapsed && pendingApprovals > 0 ? <span className="ml-auto rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-medium text-primary">{pendingApprovals}</span> : null}</Link>;
        })}
      </nav>

      <div className="space-y-2 border-t border-border/50 p-3">
        <div className={cn("rounded-lg border border-border/60 bg-background/50 p-3", sidebarCollapsed && "flex justify-center p-2.5")}><div className="flex items-center gap-2.5"><span className="relative flex size-2"><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>{!sidebarCollapsed ? <div><p className="text-xs font-medium text-foreground">Système opérationnel</p><p className="font-mono text-[9px] text-muted-foreground">{activeAgents} agents actifs</p></div> : null}</div></div>
        <div className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted"><Link href="/account" className="flex min-w-0 flex-1 items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#3A4CE0] to-[#6E42D9] text-[10px] font-semibold text-white">{initials}</span>{!sidebarCollapsed ? <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground">{displayName}</span><span className="block truncate font-mono text-[9px] text-muted-foreground">{account?.workspaceName ?? "Espace de travail"}</span></span> : null}</Link><button type="button" onClick={toggleSidebar} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={sidebarCollapsed ? "Déployer la barre latérale" : "Réduire la barre latérale"}>{sidebarCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}</button></div>
      </div>
    </nav>
  );
}
