"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { CommandPalette } from "./command-palette";
import { MobileSidebar } from "./mobile-sidebar";
import { MobileLiquidNavigation } from "./mobile-liquid-navigation";
import { LoaderCircle } from "lucide-react";
import { hasAccess, hasFeature, routes } from "@/config";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const dataStatus = useAppStore((state) => state.dataStatus);
  const dataError = useAppStore((state) => state.dataError);
  const account = useAppStore((state) => state.account);
  if (pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password" || pathname.startsWith("/auth/") || pathname.startsWith("/onboarding/")) return <>{children}</>;
  if (pathname.startsWith("/admin")) return <>{children}</>;
  if (dataStatus === "loading") return <div className="flex min-h-screen items-center justify-center bg-background"><div className="text-center"><LoaderCircle className="mx-auto size-8 animate-spin text-indigo-500" /><p className="mt-4 text-sm text-muted-foreground">Chargement de votre espace sécurisé…</p></div></div>;
  if (dataStatus === "error") return <div className="flex min-h-screen items-center justify-center bg-background p-6"><div className="max-w-md rounded-2xl border bg-card p-6 text-center"><h1 className="font-semibold">Espace indisponible</h1><p className="mt-2 text-sm text-muted-foreground">{dataError}</p><button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">Réessayer</button></div></div>;
  const activeRoute = routes.find((route) => route.href === "/" ? pathname === "/" : pathname.startsWith(route.href));
  if (pathname === "/goals/new" && !hasAccess(account?.accessLevel, "operator")) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-6"><div className="max-w-md rounded-2xl border bg-card p-7 text-center"><h1 className="text-lg font-semibold">Création non autorisée</h1><p className="mt-2 text-sm text-muted-foreground">Le niveau Lecture peut consulter les objectifs, mais pas en créer.</p><Link href="/goals" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">Voir les objectifs</Link></div></div>;
  }
  if (activeRoute && !hasAccess(account?.accessLevel, activeRoute.minAccess)) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-6"><div className="max-w-md rounded-2xl border bg-card p-7 text-center"><h1 className="text-lg font-semibold">Accès limité</h1><p className="mt-2 text-sm text-muted-foreground">Votre niveau d'accès ne permet pas d'ouvrir cette section. Contactez un administrateur de votre entreprise.</p><Link href="/" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">Retour au tableau de bord</Link></div></div>;
  }
  if (activeRoute && !hasFeature(account?.subscription?.features, "feature" in activeRoute ? activeRoute.feature : undefined)) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-6"><div className="max-w-md rounded-2xl border bg-card p-7 text-center"><h1 className="text-lg font-semibold">Fonctionnalité non incluse</h1><p className="mt-2 text-sm text-muted-foreground">Cette section n'est pas comprise dans l'abonnement actuel de votre entreprise.</p><Link href="/billing" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">Comparer les offres</Link></div></div>;
  }
  return <div className="app-canvas min-h-screen overflow-x-hidden bg-background"><Sidebar /><MobileSidebar /><MobileLiquidNavigation /><div className={cn("min-h-screen transition-[margin] duration-300", sidebarCollapsed ? "lg:ml-[80px]" : "lg:ml-[264px]")}><Topbar /><main className={cn("mx-auto w-full max-w-[1560px] pb-[calc(env(safe-area-inset-bottom,0px)+100px)] lg:pb-0", account?.preferences?.density === "compact" ? "p-3 md:p-4 xl:p-5" : "p-3 sm:p-5 md:p-7 xl:p-9")}>{children}</main></div><AssistantPanel /><CommandPalette /></div>;
}