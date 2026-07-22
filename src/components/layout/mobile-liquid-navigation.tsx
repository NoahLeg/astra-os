"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app-store"
import { DynamicIcon } from "@/components/shared/dynamic-icon"
import { LiquidNavIndicator } from "./liquid-nav-indicator"
import { useLiquidGlassMotion } from "@/hooks/use-liquid-glass-motion"
import { hasAccess, hasFeature, routes } from "@/config"

const MAX_VISIBLE = 5

export function MobileLiquidNavigation() {
  const pathname = usePathname()
  const account = useAppStore((state) => state.account)
  const approvals = useAppStore((state) => state.approvals)
  const [reduced, setReduced] = useState(false)
  const {
    navRef,
    activeStyle,
    light,
    pointerDown,
    handlePointerMove,
    handlePointerLeave,
    handlePointerDown,
    handlePointerUp,
  } = useLiquidGlassMotion()

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const visibleRoutes = routes
    .filter(
      (r) =>
        hasAccess(account?.accessLevel, r.minAccess) &&
        hasFeature(account?.subscription?.features, "feature" in r ? r.feature : undefined),
    )
    .slice(0, MAX_VISIBLE)

  if (
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/onboarding/") ||
    pathname.startsWith("/admin")
  )
    return null

  if (visibleRoutes.length === 0) return null

  const pendingApprovals = approvals.filter((a) => a.status === "pending").length

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[60] flex justify-center lg:hidden touch-none select-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", paddingTop: "16px" }}
      aria-label="Navigation principale"
    >
      <div
        ref={navRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className="relative flex items-center gap-[3px] rounded-[22px] glass-floating px-[6px] py-[6px]"
        style={{
          boxShadow:
            "0 28px 80px color-mix(in srgb, black 42%, transparent), 0 10px 28px color-mix(in srgb, black 24%, transparent), 0 0 0 1px color-mix(in srgb, white 6%, transparent) inset, 0 -1px 0 color-mix(in srgb, black 32%, transparent) inset",
          "--glass-stretch": "1",
          "--glass-squash": "1",
        } as React.CSSProperties}
      >
        <LiquidNavIndicator x={activeStyle.x} width={activeStyle.width} isReduced={reduced} pointerDown={pointerDown} />

        <div
          className="pointer-events-none absolute inset-0 rounded-[22px] transition-opacity duration-200"
          style={{
            opacity: light.y >= 0 ? Math.max(0, 1 - light.y * 2) : 0,
            background: `radial-gradient(circle 60px at ${light.x * 100}% ${light.y * 100}%, color-mix(in srgb, white 14%, transparent), transparent)`,
          }}
        />

        {visibleRoutes.map((route) => {
          const active =
            route.href === "/" ? pathname === "/" : pathname.startsWith(route.href)
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
          )
        })}
      </div>
    </nav>
  )
}
