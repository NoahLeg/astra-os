"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { routes, PRODUCT_NAME } from "@/config";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { DynamicIcon } from "@/components/shared/dynamic-icon";

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  return <aside className={cn("fixed inset-y-0 left-0 z-50 hidden flex-col border-r bg-card/90 backdrop-blur-xl transition-all duration-300 lg:flex", sidebarCollapsed ? "w-[76px]" : "w-[248px]")}>
    <div className="flex h-16 items-center gap-3 border-b px-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/20"><Sparkles className="size-4" /></span>{!sidebarCollapsed && <div><p className="font-semibold tracking-tight">{PRODUCT_NAME}</p><p className="text-[10px] uppercase tracking-[.18em] text-muted-foreground">Idée → Résultat</p></div>}</div>
    <div className="p-3"><Link href="/goals/new" className={cn("flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground shadow-lg shadow-indigo-500/10", sidebarCollapsed ? "px-0" : "px-3")}><Plus className="size-4" />{!sidebarCollapsed && "Nouvel objectif"}</Link></div>
    <nav className="scrollbar-none flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Navigation principale">{routes.map((route) => { const active = route.href === "/" ? pathname === "/" : pathname.startsWith(route.href); return <Link key={route.href} href={route.href} title={sidebarCollapsed ? route.label : undefined} className={cn("group flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors", active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><DynamicIcon name={route.icon} className={cn("size-[18px] shrink-0", active && "text-indigo-500")} />{!sidebarCollapsed && <span className="truncate">{route.label}</span>}{route.href === "/approvals" && !sidebarCollapsed && <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">3</span>}</Link>; })}</nav>
    <div className="space-y-2 border-t p-3"><div className={cn("rounded-xl bg-muted/60 p-3", sidebarCollapsed && "flex justify-center p-2")}><div className="flex items-center gap-2"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>{!sidebarCollapsed && <div><p className="text-xs font-medium">Système opérationnel</p><p className="text-[10px] text-muted-foreground">5 agents actifs</p></div>}</div></div>
      <div className="flex items-center gap-3 rounded-xl p-2"><div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-semibold text-white">PM</div>{!sidebarCollapsed && <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">Paul Martin</p><p className="truncate text-[10px] text-muted-foreground">Espace Pro</p></div>}<button onClick={toggleSidebar} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label={sidebarCollapsed ? "Déployer la barre latérale" : "Réduire la barre latérale"}>{sidebarCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}</button></div>
    </div>
  </aside>;
}
