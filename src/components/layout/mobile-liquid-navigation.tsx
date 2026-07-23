"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { LiquidNavIndicator } from "./liquid-nav-indicator";
import { useLiquidGlassMotion } from "@/hooks/use-liquid-glass-motion";
import { useReducedPreferences } from "@/hooks/use-reduced-preferences";
import { hasAccess, hasFeature, routes } from "@/config";
import { GlassSurface } from "@/components/ui/glass-surface";
import { MobileSidebar } from "./mobile-sidebar";

const MAX_VISIBLE = 5;

export function MobileLiquidNavigation() {
  const pathname = usePathname();
  const account = useAppStore((state) => state.account);
  const approvals = useAppStore((state) => state.approvals);
  const { setMobileSidebarOpen } = useAppStore();
  const { reducedMotion } = useReducedPreferences();
  const {
    navRef,
    activeStyle,
    light,
    pointerDown,
    handlePointerMove,
    handlePointerLeave,
    handlePointerDown,
    handlePointerUp,
    isActive,
  } = useLiquidGlassMotion();

  const visibleRoutes = routes
    .filter(
      (r) =>
        hasAccess(account?.accessLevel, r.minAccess) &&
        hasFeature(account?.subscription?.features, "feature" in r ? r.feature : undefined),
    )
    .slice(0, MAX_VISIBLE);

  const allRoutes = routes
    .filter(
      (r) =>
        hasAccess(account?.accessLevel, r.minAccess) &&
        hasFeature(account?.subscription?.features, "feature" in r ? r.feature : undefined),
    );

  const hiddenRoutes = allRoutes.slice(MAX_VISIBLE);

  if (
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/onboarding/") ||
    pathname.startsWith("/admin")
  )
    return null;

  if (visibleRoutes.length === 0) return null;

  const pendingApprovals = approvals.filter((a) => a.status === "pending").length;

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-[60] flex justify-center lg:hidden touch-none select-none"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", paddingTop: "16px" }}
        aria-label="Navigation principale"
      >
        <GlassSurface
          ref={navRef}
          variant="floating"
          className="relative flex items-center gap-[3px] rounded-[22px] px-[6px] py-[6px]"
          style={{
            "--glass-stretch": isActive ? "var(--glass-stretch, 1)" : "1",
            "--glass-squash": isActive ? "var(--glass-squash, 1)" : "1",
            "--glass-light-x": light.x,
            "--glass-light-y": light.y >= 0 ? light.y : -1,
          } as React.CSSProperties}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <LiquidNavIndicator x={activeStyle.x} width={activeStyle.width} isReduced={reducedMotion} pointerDown={pointerDown} />

          {visibleRoutes.map((route) => {
            const active = route.href === "/" ? pathname === "/" : pathname.startsWith(route.href);
            return (
              <Link
                key={route.href}
                href={route.href}
                aria-current={active ? "page" : undefined}
                aria-label={route.label}
                className="relative z-10 flex size-[46px] items-center justify-center rounded-xl transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-90"
              >
                <DynamicIcon
                  name={route.icon}
                  className={cn(
                    "size-[22px] transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                    active
                      ? "translate-y-[-1px] scale-105 text-primary drop-shadow-[0_0_6px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
                      : "text-muted-foreground/70",
                  )}
                />
                {route.href === "/approvals" && pendingApprovals > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full border border-[var(--glass-border)] bg-primary px-1 font-mono text-[8px] font-bold leading-4 text-primary-foreground shadow-[var(--shadow-sm)]">
                    {Math.min(pendingApprovals, 99)}
                  </span>
                )}
              </Link>
            );
          })}

          {hiddenRoutes.length > 0 && (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="relative z-10 flex size-[46px] items-center justify-center rounded-xl text-muted-foreground/70 transition-colors hover:text-foreground hover:bg-muted/50 active:scale-95"
              aria-label="Plus d'options"
            >
              <MoreHorizontal className="size-[22px]" />
            </button>
          )}
        </GlassSurface>
      </nav>

      <MobileSidebar />
    </>
  );
}