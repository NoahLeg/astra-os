"use client";

import { useEffect, useState } from "react";
import { Building2, KeyRound, LoaderCircle, Mail, Save, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { accessLevels } from "@/config";
import { accountService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { AccountProfile } from "@/types";
import { AccountBillingPanel } from "./account-billing-panel";

export function AccountPage() {
  const setAccount = useAppStore((state) => state.setAccount);
  const currentAccount = useAppStore((state) => state.account);
  const [profile, setProfile] = useState<AccountProfile>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    void accountService.load().then(setProfile).catch((error) => toast.error(error instanceof Error ? error.message : "Profil indisponible")).finally(() => setLoading(false));
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await accountService.update(profile);
      setProfile(updated);
      setAccount({ ...currentAccount, id: updated.id, email: updated.email, fullName: updated.fullName, accessLevel: updated.accessLevel, workspaceName: updated.workspaceName });
      toast.success("Profil mis à jour");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible");
    } finally {
      setSaving(false);
    }
  };

  const requestPasswordReset = async () => {
    if (!profile) return;
    setResetting(true);
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: profile.email }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Demande impossible");
      toast.success("E-mail de changement de mot de passe envoyé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Demande impossible");
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <div className="flex min-h-80 items-center justify-center"><LoaderCircle className="size-7 animate-spin text-indigo-500" /></div>;
  if (!profile) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Votre profil n’a pas pu être chargé.</CardContent></Card>;
  const access = accessLevels.find((item) => item.id === profile.accessLevel);

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Identité" title="Mon compte" description="Gérez votre identité, vos coordonnées et la sécurité de votre accès à Astra." />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="size-4" />Informations personnelles</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Nom complet<Input className="mt-2" value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} required minLength={2} /></label>
              <label className="text-sm font-medium">Fonction<Input className="mt-2" value={profile.jobTitle} onChange={(event) => setProfile({ ...profile, jobTitle: event.target.value })} placeholder="Direction, commercial…" /></label>
              <label className="text-sm font-medium">Téléphone<Input className="mt-2" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="+33…" /></label>
              <label className="text-sm font-medium">Fuseau horaire<select className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm" value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}><option value="Europe/Paris">Europe/Paris</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option><option value="Asia/Dubai">Asia/Dubai</option></select></label>
              <label className="text-sm font-medium sm:col-span-2">Adresse e-mail<Input className="mt-2" value={profile.email} disabled /><span className="mt-1 block text-xs font-normal text-muted-foreground">L’adresse de connexion est protégée par Supabase Auth.</span></label>
              <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Enregistrer</Button></div>
            </form>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4" />Entreprise</CardTitle></CardHeader><CardContent><p className="font-medium">{profile.workspaceName}</p><div className="mt-4 rounded-xl bg-muted/50 p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Niveau d’accès</span><Badge className="bg-indigo-500/10 text-indigo-500">{access?.name}</Badge></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{access?.description}</p></div></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" />Sécurité</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-3 rounded-xl border p-3"><Mail className="size-4 text-emerald-500" /><div><p className="text-sm font-medium">Compte actif</p><p className="text-xs text-muted-foreground">Session sécurisée par cookies HTTP-only.</p></div></div><Button variant="outline" className="w-full" onClick={() => void requestPasswordReset()} disabled={resetting}>{resetting ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Changer mon mot de passe</Button></CardContent></Card>
        </div>
      </div>
      {currentAccount?.accessLevel === "admin" ? <AccountBillingPanel /> : null}
    </div>
  );
}
