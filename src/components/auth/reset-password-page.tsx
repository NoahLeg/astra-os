"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirmation) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setLoading(true);
    const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const result = await response.json() as { error?: string };
    setLoading(false);
    if (!response.ok) { setError(result.error ?? "Modification impossible."); return; }
    window.location.replace("/login?password=updated");
  };
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-xl"><span className="flex size-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500"><KeyRound className="size-5" /></span><h1 className="mt-5 text-2xl font-semibold">Choisir un nouveau mot de passe</h1><p className="mt-2 text-sm text-muted-foreground">Utilisez au moins 8 caractères, une majuscule et un chiffre.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-medium">Nouveau mot de passe<Input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2" /></label><label className="block text-sm font-medium">Confirmer<Input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2" /></label>{error && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-500">{error}</div>}<Button type="submit" className="w-full" disabled={loading}>{loading ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Enregistrer le mot de passe</Button></form></div></main>;
}
