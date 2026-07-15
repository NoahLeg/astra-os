/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, EyeOff, KeyRound, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AdminSecret, AdminWorkspace } from "@/lib/server/admin-service";

export function AdminPage() {
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [secrets, setSecrets] = useState<AdminSecret[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ provider: "OpenAI", label: "Clé principale", baseUrl: "https://api.openai.com/v1", secret: "" });

  const loadSecrets = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return;
    const response = await fetch(`/api/admin?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
    const result = await response.json() as { secrets?: AdminSecret[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Chargement impossible");
    setSecrets(result.secrets ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin", { cache: "no-store" });
        const result = await response.json() as { workspaces?: AdminWorkspace[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Accès refusé");
        const items = result.workspaces ?? [];
        const firstId = items[0]?.id ?? "";
        setWorkspaces(items);
        setSelectedId(firstId);
        if (firstId) await loadSecrets(firstId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Console indisponible");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSecrets]);

  const selected = workspaces.find((workspace) => workspace.id === selectedId);
  const filtered = useMemo(() => workspaces.filter((workspace) => `${workspace.name} ${workspace.slug} ${workspace.accounts.map((account) => account.email).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [query, workspaces]);

  const selectWorkspace = async (id: string) => { setSelectedId(id); setSecrets([]); await loadSecrets(id); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: selectedId, ...form }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Enregistrement impossible");
      setForm((current) => ({ ...current, secret: "" }));
      await loadSecrets(selectedId);
      toast.success("Secret chiffré et enregistré");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (secretId: string) => {
    if (!selectedId || !window.confirm("Supprimer définitivement cette configuration ?")) return;
    const response = await fetch(`/api/admin?workspaceId=${encodeURIComponent(selectedId)}&secretId=${encodeURIComponent(secretId)}`, { method: "DELETE" });
    if (!response.ok) { toast.error("Suppression impossible"); return; }
    await loadSecrets(selectedId);
    toast.success("Configuration supprimée");
  };
  const testOpenAI = async () => {
    if (!selectedId) return;
    setTesting(true);
    try {
      const response = await fetch("/api/admin/test-provider", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: selectedId, provider: "OpenAI" }) });
      const result = await response.json() as { error?: string; model?: string };
      if (!response.ok) throw new Error(result.error ?? "Test impossible");
      toast.success(`OpenAI fonctionne avec ${result.model}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Test impossible");
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center"><LoaderCircle className="size-8 animate-spin text-indigo-500" /></main>;
  if (error) return <main className="flex min-h-screen items-center justify-center p-6"><Card className="max-w-md"><CardContent className="p-8 text-center"><ShieldCheck className="mx-auto size-9 text-rose-500" /><h1 className="mt-4 text-xl font-semibold">Accès refusé</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p><a href="/" className="mt-5 inline-flex text-sm font-medium text-indigo-500">Retour au SaaS</a></CardContent></Card></main>;

  return <main className="min-h-screen bg-muted/20"><header className="flex h-16 items-center gap-3 border-b bg-background px-5"><span className="flex size-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500"><ShieldCheck className="size-5" /></span><div><p className="text-sm font-semibold">Console Super Admin</p><p className="text-[11px] text-muted-foreground">Accès privilégié et audité</p></div><a href="/" className="ml-auto text-sm text-muted-foreground hover:text-foreground">Retour au SaaS</a><form action="/api/auth/logout" method="post"><Button type="submit" variant="outline" size="sm">Déconnexion</Button></form></header><div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[320px_1fr]"><aside className="border-r bg-card p-4"><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Entreprise ou email…" className="pl-9" /></div><div className="mt-4 space-y-2">{filtered.map((workspace) => <button key={workspace.id} onClick={() => void selectWorkspace(workspace.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === workspace.id ? "border-indigo-500 bg-indigo-500/5" : "bg-background hover:bg-muted"}`}><div className="flex items-center gap-2"><Building2 className="size-4 text-indigo-500" /><p className="truncate text-sm font-medium">{workspace.name}</p></div><p className="mt-1 truncate text-xs text-muted-foreground">{workspace.slug}</p><p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Users className="size-3" />{workspace.accounts.length} compte(s)</p></button>)}</div></aside><section className="space-y-6 p-5 md:p-8">{selected ? <><div><Badge className="bg-rose-500/10 text-rose-500">Super Admin</Badge><h1 className="mt-3 text-2xl font-semibold">{selected.name}</h1><p className="mt-1 text-sm text-muted-foreground">Workspace `{selected.id}`</p></div><div className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" />Comptes autorisés</CardTitle></CardHeader><CardContent className="space-y-3">{selected.accounts.map((account) => <div key={account.id} className="flex items-center gap-3 rounded-xl border bg-background p-3"><span className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">{account.fullName.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{account.fullName}</p><p className="truncate text-xs text-muted-foreground">{account.email}</p></div><Badge className="bg-muted text-muted-foreground">{account.role}</Badge></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" />Ajouter ou remplacer une clé</CardTitle></CardHeader><CardContent><form onSubmit={save} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Fournisseur<Input value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })} className="mt-2" required /></label><label className="text-sm font-medium">Libellé<Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} className="mt-2" required /></label></div><label className="text-sm font-medium">URL de base<Input type="url" value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} className="mt-2 font-mono text-xs" /></label><label className="text-sm font-medium">Clé API<Input type="password" autoComplete="new-password" value={form.secret} onChange={(event) => setForm({ ...form, secret: event.target.value })} className="mt-2 font-mono text-xs" required minLength={8} /></label><p className="flex items-start gap-2 text-xs text-muted-foreground"><EyeOff className="mt-0.5 size-3.5" />Chiffrement AES-256-GCM avant stockage.</p><Button type="submit" className="w-full" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Enregistrer</Button></form></CardContent></Card></div><Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Configurations de l’entreprise</CardTitle><div className="flex gap-2"><Button variant="outline" size="sm" disabled={testing || !secrets.some((secret) => secret.provider.toLowerCase() === "openai")} onClick={() => void testOpenAI()}>{testing ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Tester OpenAI</Button><Button variant="ghost" size="icon" onClick={() => void loadSecrets(selectedId)} aria-label="Actualiser"><RefreshCw className="size-4" /></Button></div></div></CardHeader><CardContent>{secrets.length ? <div className="grid gap-3 md:grid-cols-2">{secrets.map((secret) => <div key={secret.id} className="rounded-xl border bg-background p-4"><div className="flex items-start justify-between"><div><Badge className="bg-indigo-500/10 text-indigo-500">{secret.provider}</Badge><p className="mt-3 font-medium">{secret.label}</p></div><Button variant="ghost" size="icon" onClick={() => void remove(secret.id)} aria-label={`Supprimer ${secret.label}`}><Trash2 className="size-4 text-rose-500" /></Button></div><p className="mt-2 truncate font-mono text-xs text-muted-foreground">{secret.baseUrl || "URL par défaut"}</p><p className="mt-3 font-mono text-sm">{secret.maskedValue}</p></div>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">Aucune clé configurée pour cette entreprise.</p>}</CardContent></Card></> : <p className="text-muted-foreground">Aucune entreprise disponible.</p>}</section></div></main>;
}
