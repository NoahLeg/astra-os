"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Plus, Sparkles, X } from "lucide-react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Button } from "@/components/ui/button";
import { hasAccess, hasFeature, routes } from "@/config";
import { useAppStore } from "@/stores/app-store";

export function MobileSidebar() {
  const pathname = usePathname();
  const { mobileSidebarOpen, setMobileSidebarOpen, account, agents, approvals } = useAppStore();
  const visibleRoutes = routes.filter((route) => hasAccess(account?.accessLevel, route.minAccess) && hasFeature(account?.subscription?.features, "feature" in route ? route.feature : undefined));
  const displayName = account?.fullName || account?.email.split("@")[0] || "Utilisateur";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  useEffect(() => setMobileSidebarOpen(false), [pathname, setMobileSidebarOpen]);
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileSidebarOpen, setMobileSidebarOpen]);

  if (!mobileSidebarOpen) return null;
  const pendingApprovals = approvals.filter((item) => item.status === "pending").length;
  return (
    <div className="fixed inset-0 z-[75] lg:hidden">
      <button type="button" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} aria-label="Fermer la navigation" />
      <aside role="dialog" aria-modal="true" aria-label="Navigation principale" className="flex h-full w-[min(88vw,320px)] flex-col overflow-hidden border-r border-border/60 bg-card/70 backdrop-blur-xl shadow-xl">
        <div className="flex h-[72px] items-center gap-3 border-b border-border/50 px-4"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary"><Sparkles className="size-4" /></span><div className="min-w-0 flex-1"><p className="font-display font-bold text-foreground">Astra</p><p className="font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Plateforme</p></div><Button variant="ghost" size="icon" onClick={() => setMobileSidebarOpen(false)} aria-label="Fermer"><X className="size-5" /></Button></div>
        <div className="p-3">{hasAccess(account?.accessLevel, "operator") ? <Link href="/goals/new" className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"><Plus className="size-4" />Nouvel objectif</Link> : null}</div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">{visibleRoutes.map((route) => { const active = route.href === "/" ? pathname === "/" : pathname.startsWith(route.href); return <Link key={route.href} href={route.href} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><DynamicIcon name={route.icon} className={active ? "size-4 text-primary" : "size-4 text-muted-foreground"} /><span className="flex-1">{route.label}</span>{route.href === "/approvals" && pendingApprovals ? <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-medium text-primary">{pendingApprovals}</span> : null}</Link>; })}</nav>
        <div className="space-y-2 border-t border-border/50 p-3"><div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 p-3"><span className="size-2 rounded-full bg-emerald-500" /><div><p className="text-xs font-medium text-foreground">Système opérationnel</p><p className="font-mono text-[9px] text-muted-foreground">{agents.filter((agent) => agent.status === "active").length} agents actifs</p></div></div><Link href="/account" className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted"><span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#3A4CE0] to-[#6E42D9] text-xs font-semibold text-white">{initials}</span><span className="min-w-0"><span className="block truncate text-xs font-medium text-foreground">{displayName}</span><span className="block truncate font-mono text-[9px] text-muted-foreground">{account?.workspaceName ?? "Espace de travail"}</span></span></Link></div>
      </aside>
    </div>
  );
}
