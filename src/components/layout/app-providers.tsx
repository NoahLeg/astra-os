"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { ThemeProvider, useTheme } from "@/components/layout/theme-provider";
import { useAppStore } from "@/stores/app-store";
import type { WorkspaceSubscription } from "@/types";

function ClientRuntime({ children }: { children: React.ReactNode }) {
  const hydrateFromDatabase = useAppStore((state) => state.hydrateFromDatabase);
  const setAccount = useAppStore((state) => state.setAccount);
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login" || pathname === "/forgot-password" || pathname.startsWith("/auth/")) return;
    void (async () => {
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      if (!sessionResponse.ok) {
        window.location.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      const session = await sessionResponse.json() as {
        user: { id: string; email: string; user_metadata?: { full_name?: string } };
        account?: { fullName?: string; accessLevel?: "viewer" | "operator" | "admin"; workspaceName?: string };
        subscription?: WorkspaceSubscription;
        isAdmin?: boolean;
      };
      setAccount({
        id: session.user.id,
        email: session.user.email,
        fullName: session.account?.fullName ?? session.user.user_metadata?.full_name,
        accessLevel: session.account?.accessLevel,
        workspaceName: session.account?.workspaceName,
        subscription: session.subscription,
        isAdmin: session.isAdmin,
      });
      await hydrateFromDatabase();
    })();
  }, [hydrateFromDatabase, pathname, setAccount]);

  return (
    <>
      {children}
      <Toaster richColors position="bottom-right" theme={resolvedTheme} />
    </>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ClientRuntime>{children}</ClientRuntime>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
