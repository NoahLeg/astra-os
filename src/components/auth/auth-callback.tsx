"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, LoaderCircle } from "lucide-react";

export function AuthCallback() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const finishAuthentication = async () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const fragmentError = fragment.get("error_description");
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      if (fragmentError || !accessToken || !refreshToken) {
        setError(fragmentError ?? "Ce lien de connexion est incomplet ou expiré.");
        return;
      }
      const response = await fetch("/api/auth/adopt-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken, refreshToken, expiresIn: Number(fragment.get("expires_in") ?? 3600) }) });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        setError(result.error ?? "La session n’a pas pu être validée.");
        return;
      }
      window.history.replaceState(null, "", window.location.pathname);
      const destination = searchParams.get("next");
      window.location.replace(destination?.startsWith("/") ? destination : "/onboarding/subscription");
    };
    void finishAuthentication();
  }, [searchParams]);

  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-2xl">{error ? <><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500"><AlertTriangle className="size-5" /></span><h1 className="mt-5 text-xl font-semibold">Lien non valide</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p><a href="/login" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Retour à la connexion</a></> : <><LoaderCircle className="mx-auto size-8 animate-spin text-indigo-500" /><h1 className="mt-5 text-xl font-semibold">Validation de votre session</h1><p className="mt-2 text-sm text-muted-foreground">Nous sécurisons votre connexion avant d’ouvrir votre espace.</p></>}</div></main>;
}
