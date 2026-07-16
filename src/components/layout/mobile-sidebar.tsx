"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Plus, Sparkles, X } from "lucide-react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME, hasAccess, hasFeature, routes } from "@/config";
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
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} aria-label="Fermer la navigation" />
      <aside role="dialog" aria-modal="true" aria-label="Navigation principale" className="relative flex h-full w-[min(88vw,320px)] flex-col border-r bg-card shadow-2xl">
        <div className="flex h-16 items-center gap-3 border-b px-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white"><Sparkles className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="font-semibold">{PRODUCT_NAME}</p><p className="text-[10px] uppercase tracking-[.18em] text-muted-foreground">Idée → Résultat</p></div>
          <Button variant="ghost" size="icon" onClick={() => setMobileSidebarOpen(false)} aria-label="Fermer"><X className="size-5" /></Button>
        </div>
        <div className="p-3">{hasAccess(account?.accessLevel, "operator") ? <Link href="/goals/new" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground"><Plus className="size-4" />Nouvel objectif</Link> : null}</div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {visibleRoutes.map((route) => {
            const active = route.href === "/" ? pathname === "/" : pathname.startsWith(route.href);
            return <Link key={route.href} href={route.href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><DynamicIcon name={route.icon} className="size-4" /><span className="flex-1">{route.label}</span>{route.href === "/approvals" && pendingApprovals ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">{pendingApprovals}</span> : null}</Link>;
          })}
        </nav>
        <div className="space-y-2 border-t p-3">
          <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-3"><span className="size-2 rounded-full bg-emerald-500" /><div><p className="text-xs font-medium">Système opérationnel</p><p className="text-[10px] text-muted-foreground">{agents.filter((agent) => agent.status === "active").length} agents actifs</p></div></div>
          <Link href="/account" className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted"><span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-semibold text-white">{initials}</span><span className="min-w-0"><span className="block truncate text-xs font-medium">{displayName}</span><span className="block truncate text-[10px] text-muted-foreground">{account?.workspaceName ?? "Espace de travail"}</span></span></Link>
        </div>
      </aside>
    </div>
  );
}
