"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const result = await response.json() as { message?: string; error?: string };
    setMessage(result.message ?? result.error ?? "Vérifiez votre boîte email.");
    setLoading(false);
  };
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-xl"><a href="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Retour</a><span className="mt-7 flex size-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500"><Mail className="size-5" /></span><h1 className="mt-5 text-2xl font-semibold">Mot de passe oublié</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Saisissez votre adresse professionnelle. Si le compte existe, vous recevrez un lien sécurisé.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-medium">Email<Input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2" placeholder="vous@entreprise.fr" /></label>{message && <div role="status" className="flex gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-600"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{message}</div>}<Button type="submit" className="w-full" disabled={loading}>{loading && <LoaderCircle className="size-4 animate-spin" />}Envoyer le lien</Button></form></div></main>;
}
