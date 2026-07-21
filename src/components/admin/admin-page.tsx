/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Building2, CreditCard, EyeOff, KeyRound, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { accessLevels } from "@/config";
import type { AdminAuditLog, AdminSecret, AdminWorkspace } from "@/lib/server/admin-service";
import type { AccessLevel, BillingOverview, EnterpriseQuoteRequest } from "@/types";
import { AdminBillingPanel } from "./admin-billing-panel";

type AdminTab = "accounts" | "billing" | "integrations" | "audit";

export function AdminPage() {
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [secrets, setSecrets] = useState<AdminSecret[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [billing, setBilling] = useState<BillingOverview>();
  const [enterpriseQuotes, setEnterpriseQuotes] = useState<EnterpriseQuoteRequest[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<AdminTab>("accounts");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [secretForm, setSecretForm] = useState({ provider: "OpenAI", label: "Clé principale", baseUrl: "https://api.openai.com/v1", secret: "" });
  const [inviteForm, setInviteForm] = useState<{ email: string; fullName: string; accessLevel: AccessLevel }>({ email: "", fullName: "", accessLevel: "operator" });

  const loadWorkspaceDetail = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return;
    const response = await fetch(`/api/admin?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
    const result = await response.json() as { secrets?: AdminSecret[]; auditLogs?: AdminAuditLog[]; billing?: BillingOverview; enterpriseQuotes?: EnterpriseQuoteRequest[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Chargement impossible");
    setSecrets(result.secrets ?? []);
    setAuditLogs(result.auditLogs ?? []);
    setBilling(result.billing);
    setEnterpriseQuotes(result.enterpriseQuotes ?? []);
  }, []);

  const loadWorkspaces = useCallback(async (preferredId?: string) => {
    const response = await fetch("/api/admin", { cache: "no-store" });
    const result = await response.json() as { workspaces?: AdminWorkspace[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Accès refusé");
    const items = result.workspaces ?? [];
    const nextId = preferredId && items.some((item) => item.id === preferredId) ? preferredId : items[0]?.id ?? "";
    setWorkspaces(items);
    setSelectedId(nextId);
    if (nextId) await loadWorkspaceDetail(nextId);
  }, [loadWorkspaceDetail]);

  useEffect(() => {
    void (async () => {
      try {
        await loadWorkspaces();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Console indisponible");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadWorkspaces]);

  const selected = workspaces.find((workspace) => workspace.id === selectedId);
  const filtered = useMemo(() => workspaces.filter((workspace) => `${workspace.name} ${workspace.slug} ${workspace.accounts.map((account) => account.email).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [query, workspaces]);

  const selectWorkspace = async (id: string) => {
    setSelectedId(id);
    setSecrets([]);
    setAuditLogs([]);
    setBilling(undefined);
    setEnterpriseQuotes([]);
    await loadWorkspaceDetail(id);
  };

  const accountAction = async (payload: Record<string, unknown>, successMessage: string) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: selectedId, ...payload }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Action impossible");
      await loadWorkspaces(selectedId);
      toast.success(successMessage);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    await accountAction({ action: "invite", ...inviteForm }, "Invitation envoyée et accès configuré");
    setInviteForm({ email: "", fullName: "", accessLevel: "operator" });
  };

  const saveSecret = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: selectedId, ...secretForm }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Enregistrement impossible");
      setSecretForm((current) => ({ ...current, secret: "" }));
      await loadWorkspaceDetail(selectedId);
      toast.success("Secret chiffré et enregistré");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  const removeSecret = async (secretId: string) => {
    if (!selectedId || !window.confirm("Supprimer définitivement cette configuration ?")) return;
    const response = await fetch(`/api/admin?workspaceId=${encodeURIComponent(selectedId)}&secretId=${encodeURIComponent(secretId)}`, { method: "DELETE" });
    if (!response.ok) { toast.error("Suppression impossible"); return; }
    await loadWorkspaceDetail(selectedId);
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

  return (
    <main className="min-h-screen bg-muted/20">
      <a href="/admin/platform" className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-violet-500"><KeyRound className="size-4" />Configuration plateforme</a>
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b bg-background px-3 py-3 sm:px-5"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500"><ShieldCheck className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Console Super Admin</p><p className="hidden text-[11px] text-muted-foreground sm:block">Accès privilégié et audité</p></div><a href="/" className="text-xs text-muted-foreground hover:text-foreground sm:text-sm">Retour au SaaS</a><form action="/api/auth/logout" method="post"><Button type="submit" variant="outline" size="sm">Déconnexion</Button></form></header>
      <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[320px_1fr]">
        <aside className="min-w-0 border-b bg-card p-3 lg:border-b-0 lg:border-r lg:p-4"><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Entreprise ou email…" className="pl-9" /></div><div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto lg:mt-4 lg:block lg:space-y-2">{filtered.map((workspace) => <button key={workspace.id} onClick={() => void selectWorkspace(workspace.id)} className={`w-[240px] shrink-0 rounded-xl border p-3 text-left transition lg:w-full ${selectedId === workspace.id ? "border-indigo-500 bg-indigo-500/5" : "bg-background hover:bg-muted"}`}><div className="flex items-center gap-2"><Building2 className="size-4 text-indigo-500" /><p className="truncate text-sm font-medium">{workspace.name}</p></div><p className="mt-1 truncate text-xs text-muted-foreground">{workspace.slug}</p><p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Users className="size-3" />{workspace.accounts.length} compte(s)</p></button>)}</div></aside>
        <section className="min-w-0 space-y-6 p-3 sm:p-5 md:p-8">
          {selected ? <><div><Badge className="bg-rose-500/10 text-rose-500">Super Admin</Badge><h1 className="mt-3 break-words text-2xl font-semibold">{selected.name}</h1><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{selected.id}</p></div><div className="scrollbar-none flex flex-nowrap gap-2 overflow-x-auto border-b pb-4">{([{ id: "accounts", label: "Comptes & accès", icon: Users }, { id: "billing", label: "Abonnement", icon: CreditCard }, { id: "integrations", label: "Clés & intégrations", icon: KeyRound }, { id: "audit", label: "Journal d’audit", icon: Activity }] as const).map((item) => <Button key={item.id} className="shrink-0" variant={tab === item.id ? "secondary" : "ghost"} onClick={() => setTab(item.id)}><item.icon className="size-4" />{item.label}</Button>)}</div>

            {tab === "accounts" && <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" />Comptes autorisés</CardTitle></CardHeader><CardContent className="space-y-3">{selected.accounts.map((account) => <div key={account.id} className="rounded-xl border bg-background p-4"><div className="flex flex-col gap-4 md:flex-row md:items-center"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{account.fullName.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{account.fullName}</p><Badge className={account.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}>{account.status === "active" ? "Actif" : "Suspendu"}</Badge>{!account.emailConfirmed && <Badge className="bg-amber-500/10 text-amber-500">Invitation en attente</Badge>}</div><p className="truncate text-xs text-muted-foreground">{account.email}</p><p className="mt-1 text-[10px] text-muted-foreground">Dernière connexion : {account.lastSignInAt ? new Date(account.lastSignInAt).toLocaleString("fr-FR") : "Jamais"}</p></div><select aria-label={`Niveau d’accès de ${account.fullName}`} value={account.accessLevel} disabled={busy} onChange={(event) => void accountAction({ action: "update_access", userId: account.id, accessLevel: event.target.value }, "Niveau d’accès mis à jour")} className="h-9 rounded-xl border bg-background px-3 text-xs">{accessLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select><Button variant="outline" size="sm" disabled={busy} onClick={() => void accountAction({ action: "update_status", userId: account.id, status: account.status === "active" ? "suspended" : "active" }, account.status === "active" ? "Compte suspendu" : "Compte réactivé")}>{account.status === "active" ? "Suspendre" : "Réactiver"}</Button><Button variant="ghost" size="icon" disabled={busy} onClick={() => { if (window.confirm(`Supprimer définitivement le compte ${account.email} ?`)) void accountAction({ action: "delete_account", userId: account.id }, "Compte supprimé"); }} aria-label={`Supprimer ${account.email}`}><Trash2 className="size-4 text-rose-500" /></Button></div></div>)}</CardContent></Card><Card className="h-fit"><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-4" />Inviter un compte</CardTitle></CardHeader><CardContent><form onSubmit={invite} className="space-y-3"><label className="text-sm font-medium">Nom complet<Input value={inviteForm.fullName} onChange={(event) => setInviteForm({ ...inviteForm, fullName: event.target.value })} className="mt-2" required minLength={2} /></label><label className="text-sm font-medium">E-mail<Input type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} className="mt-2" required /></label><label className="text-sm font-medium">Niveau d’accès<select value={inviteForm.accessLevel} onChange={(event) => setInviteForm({ ...inviteForm, accessLevel: event.target.value as AccessLevel })} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm">{accessLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label><div className="space-y-2 rounded-xl bg-muted/40 p-3">{accessLevels.map((level) => <p key={level.id} className="text-[11px] text-muted-foreground"><strong className="text-foreground">{level.name} :</strong> {level.description}</p>)}</div><Button type="submit" className="w-full" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <UserPlus className="size-4" />}Envoyer l’invitation</Button></form></CardContent></Card></div>}

            {tab === "billing" && <AdminBillingPanel key={`${selected.id}-${billing?.subscription.planId ?? "loading"}-${billing?.subscription.maxMembers ?? 0}`} workspaceId={selected.id} billing={billing} enterpriseQuotes={enterpriseQuotes} onChanged={() => loadWorkspaces(selected.id)} />}

            {tab === "integrations" && <div className="space-y-5"><Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" />Ajouter ou remplacer une clé</CardTitle></CardHeader><CardContent><form onSubmit={saveSecret} className="grid gap-3 md:grid-cols-2"><label className="text-sm font-medium">Fournisseur<Input value={secretForm.provider} onChange={(event) => setSecretForm({ ...secretForm, provider: event.target.value })} className="mt-2" required /></label><label className="text-sm font-medium">Libellé<Input value={secretForm.label} onChange={(event) => setSecretForm({ ...secretForm, label: event.target.value })} className="mt-2" required /></label><label className="text-sm font-medium">URL de base<Input type="url" value={secretForm.baseUrl} onChange={(event) => setSecretForm({ ...secretForm, baseUrl: event.target.value })} className="mt-2 font-mono text-xs" /></label><label className="text-sm font-medium">Clé API<Input type="password" autoComplete="new-password" value={secretForm.secret} onChange={(event) => setSecretForm({ ...secretForm, secret: event.target.value })} className="mt-2 font-mono text-xs" required minLength={8} /></label><p className="flex items-start gap-2 text-xs text-muted-foreground"><EyeOff className="mt-0.5 size-3.5" />Chiffrement AES-256-GCM avant stockage.</p><div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Enregistrer</Button></div></form></CardContent></Card><Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Configurations de l’entreprise</CardTitle><div className="flex gap-2"><Button variant="outline" size="sm" disabled={testing || !secrets.some((secret) => secret.provider.toLowerCase() === "openai")} onClick={() => void testOpenAI()}>{testing ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Tester OpenAI</Button><Button variant="ghost" size="icon" onClick={() => void loadWorkspaceDetail(selectedId)} aria-label="Actualiser"><RefreshCw className="size-4" /></Button></div></div></CardHeader><CardContent>{secrets.length ? <div className="grid gap-3 md:grid-cols-2">{secrets.map((secret) => <div key={secret.id} className="rounded-xl border bg-background p-4"><div className="flex items-start justify-between"><div><Badge className="bg-indigo-500/10 text-indigo-500">{secret.provider}</Badge><p className="mt-3 font-medium">{secret.label}</p></div><Button variant="ghost" size="icon" onClick={() => void removeSecret(secret.id)} aria-label={`Supprimer ${secret.label}`}><Trash2 className="size-4 text-rose-500" /></Button></div><p className="mt-2 truncate font-mono text-xs text-muted-foreground">{secret.baseUrl || "URL par défaut"}</p><p className="mt-3 font-mono text-sm">{secret.maskedValue}</p></div>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">Aucune clé configurée pour cette entreprise.</p>}</CardContent></Card></div>}

            {tab === "audit" && <Card><CardHeader><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><Activity className="size-4" />Journal d’audit</CardTitle><Button variant="ghost" size="icon" onClick={() => void loadWorkspaceDetail(selectedId)} aria-label="Actualiser"><RefreshCw className="size-4" /></Button></div></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr><th className="p-4">Date</th><th>Action</th><th>Cible</th><th>Détails</th></tr></thead><tbody>{auditLogs.map((log) => <tr key={log.id} className="border-b last:border-0"><td className="p-4 text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString("fr-FR")}</td><td><Badge className="bg-muted text-muted-foreground">{log.action}</Badge></td><td className="font-mono text-xs">{log.targetType} {log.targetId?.slice(0, 8)}</td><td className="max-w-sm truncate font-mono text-xs text-muted-foreground">{JSON.stringify(log.metadata)}</td></tr>)}</tbody></table>{auditLogs.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aucune action enregistrée.</p>}</CardContent></Card>}
          </> : <p className="text-muted-foreground">Aucune entreprise disponible.</p>}
        </section>
      </div>
    </main>
  );
}
