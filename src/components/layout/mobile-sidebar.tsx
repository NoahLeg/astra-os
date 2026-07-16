"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Plus, X } from "lucide-react";
import { AstraMark } from "@/components/shared/astra-mark";
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
      <button type="button" className="absolute inset-0 bg-[#06070F]/75 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} aria-label="Fermer la navigation" />
      <aside role="dialog" aria-modal="true" aria-label="Navigation principale" className="astra-sidebar relative flex h-full w-[min(88vw,320px)] flex-col overflow-hidden border-r border-white/10 shadow-2xl">
        <div className="astra-star-field opacity-35" />
        <div className="relative flex h-[72px] items-center gap-3 border-b border-white/10 px-4"><AstraMark className="size-8" /><div className="min-w-0 flex-1"><p className="font-display font-bold text-white">{PRODUCT_NAME}</p><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#9DA6FF]">Idée → Résultat</p></div><Button variant="ghost" size="icon" className="text-[#AFB2DE] hover:bg-white/10 hover:text-white" onClick={() => setMobileSidebarOpen(false)} aria-label="Fermer"><X className="size-5" /></Button></div>
        <div className="relative p-3">{hasAccess(account?.accessLevel, "operator") ? <Link href="/goals/new" className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#3A4CE0] px-3 text-sm font-semibold text-white"><Plus className="size-4" />Nouvel objectif</Link> : null}</div>
        <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 pb-4">{visibleRoutes.map((route) => { const active = route.href === "/" ? pathname === "/" : pathname.startsWith(route.href); return <Link key={route.href} href={route.href} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${active ? "bg-white/[.09] font-medium text-white" : "text-[#AEB1D7] hover:bg-white/[.055] hover:text-white"}`}><DynamicIcon name={route.icon} className={active ? "size-4 text-[#AAB4FF]" : "size-4 text-[#777BA8]"} /><span className="flex-1">{route.label}</span>{route.href === "/approvals" && pendingApprovals ? <span className="rounded-full bg-[#FF4FA3]/15 px-2 py-0.5 font-mono text-[9px] font-medium text-[#FFAFD8]">{pendingApprovals}</span> : null}</Link>; })}</nav>
        <div className="relative space-y-2 border-t border-white/10 p-3"><div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] p-3"><span className="size-2 rounded-full bg-emerald-400" /><div><p className="text-xs font-medium text-white">Système opérationnel</p><p className="font-mono text-[9px] text-[#8589B8]">{agents.filter((agent) => agent.status === "active").length} agents actifs</p></div></div><Link href="/account" className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/[.05]"><span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#3A4CE0] to-[#6E42D9] text-xs font-semibold text-white">{initials}</span><span className="min-w-0"><span className="block truncate text-xs font-medium text-white">{displayName}</span><span className="block truncate font-mono text-[9px] text-[#8589B8]">{account?.workspaceName ?? "Espace de travail"}</span></span></Link></div>
      </aside>
    </div>
  );
}
