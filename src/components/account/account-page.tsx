"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Check, CreditCard, KeyRound, LoaderCircle, Mail, MonitorCog, Palette, Save, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/components/layout/theme-provider";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { accessLevels, defaultAccountPreferences } from "@/config";
import { applyInterfacePreferences } from "@/lib/interface-preferences";
import { cn } from "@/lib/utils";
import { accountService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { AccentColor, AccountProfile, InterfaceDensity } from "@/types";
import { AccountBillingPanel } from "./account-billing-panel";

const tabs = [
  { id: "profile", label: "Profil", icon: UserRound },
  { id: "appearance", label: "Personnalisation", icon: Palette },
  { id: "billing", label: "Abonnement", icon: CreditCard },
  { id: "security", label: "Sécurité", icon: ShieldCheck },
] as const;
const accentOptions: Array<{ id: AccentColor; label: string; color: string }> = [
  { id: "indigo", label: "Indigo", color: "#6366f1" },
  { id: "cyan", label: "Cyan", color: "#06b6d4" },
  { id: "violet", label: "Violet", color: "#8b5cf6" },
  { id: "emerald", label: "Émeraude", color: "#10b981" },
  { id: "rose", label: "Rose", color: "#f43f5e" },
];

export function AccountPage() {
  const setAccount = useAppStore((state) => state.setAccount);
  const currentAccount = useAppStore((state) => state.account);
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("profile");
  const [profile, setProfile] = useState<AccountProfile>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    void accountService.load().then((result) => {
      setProfile({ ...result, preferences: { ...defaultAccountPreferences, ...result.preferences } });
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Profil indisponible")).finally(() => setLoading(false));
  }, []);

  const completion = useMemo(() => {
    if (!profile) return 0;
    return Math.round(([profile.fullName, profile.jobTitle, profile.phone, profile.timezone].filter(Boolean).length / 4) * 100);
  }, [profile]);

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await accountService.update(profile);
      setProfile(updated);
      setTheme(updated.preferences.theme);
      applyInterfacePreferences(updated.preferences);
      setAccount({ ...currentAccount, id: updated.id, email: updated.email, fullName: updated.fullName, accessLevel: updated.accessLevel, workspaceName: updated.workspaceName, preferences: updated.preferences });
      toast.success("Compte et interface personnalisés");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible");
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = <K extends keyof AccountProfile["preferences"]>(key: K, value: AccountProfile["preferences"][K]) => {
    if (!profile) return;
    const preferences = { ...profile.preferences, [key]: value };
    setProfile({ ...profile, preferences });
    if (key === "theme") setTheme(String(value));
    applyInterfacePreferences(preferences);
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

  if (loading) return <div className="flex min-h-80 items-center justify-center"><LoaderCircle className="size-7 animate-spin text-primary" /></div>;
  if (!profile) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Votre profil n’a pas pu être chargé.</CardContent></Card>;
  const access = accessLevels.find((item) => item.id === profile.accessLevel);
  const initials = profile.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return <div className="space-y-7">
    <PageHeader eyebrow="Espace personnel" title="Mon compte" description="Gérez votre identité, votre environnement de travail, votre abonnement et votre sécurité." actions={<Button onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Enregistrer</Button>} />
    <section className="relative overflow-hidden rounded-3xl border bg-card p-6 md:p-8"><div className="absolute inset-0 opacity-50 [background:radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_45%)]" /><div className="relative flex flex-col gap-6 md:flex-row md:items-center"><span className="flex size-20 shrink-0 items-center justify-center rounded-3xl text-2xl font-semibold text-white shadow-xl" style={{ background: "linear-gradient(135deg, var(--primary), #22d3ee)" }}>{initials || "A"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold">{profile.fullName}</h2><Badge className="bg-emerald-500/10 text-emerald-500">Compte actif</Badge><Badge className="bg-primary/10 text-primary">{access?.name}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{profile.jobTitle || "Fonction à compléter"} · {profile.workspaceName}</p><div className="mt-4 max-w-md"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Profil complété</span><span className="font-mono font-medium">{completion}%</span></div><Progress value={completion} className="mt-2 h-1.5" /></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border bg-background/70 p-4"><p className="text-xs text-muted-foreground">Offre</p><p className="mt-1 font-semibold">{currentAccount?.subscription?.planName ?? "—"}</p></div><div className="rounded-2xl border bg-background/70 p-4"><p className="text-xs text-muted-foreground">Appels utilisés</p><p className="mt-1 font-mono font-semibold">{currentAccount?.subscription?.apiUsage ?? 0}</p></div></div></div></section>
    <div className="scrollbar-none flex gap-1 overflow-x-auto rounded-2xl border bg-card p-2">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={cn("flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm", tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><item.icon className="size-4" />{item.label}</button>)}</div>

    {tab === "profile" ? <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="size-4" />Informations personnelles</CardTitle></CardHeader><CardContent><form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Nom complet<Input className="mt-2" value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} required minLength={2} /></label><label className="text-sm font-medium">Fonction<Input className="mt-2" value={profile.jobTitle} onChange={(event) => setProfile({ ...profile, jobTitle: event.target.value })} placeholder="Direction, commercial…" /></label><label className="text-sm font-medium">Téléphone<Input className="mt-2" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="+33…" /></label><label className="text-sm font-medium">Fuseau horaire<select className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm" value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}><option value="Europe/Paris">Europe/Paris</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option><option value="Asia/Dubai">Asia/Dubai</option></select></label><label className="text-sm font-medium sm:col-span-2">Adresse e-mail<Input className="mt-2" value={profile.email} disabled /><span className="mt-1 block text-xs font-normal text-muted-foreground">L’adresse de connexion est protégée par Supabase Auth.</span></label><div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Enregistrer le profil</Button></div></form></CardContent></Card><div className="space-y-5"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4" />Entreprise</CardTitle></CardHeader><CardContent><p className="font-medium">{profile.workspaceName}</p><div className="mt-4 rounded-xl bg-muted/50 p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Niveau d’accès</span><Badge className="bg-primary/10 text-primary">{access?.name}</Badge></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{access?.description}</p></div></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4" />Préférence de démarrage</CardTitle></CardHeader><CardContent><label className="text-sm font-medium">Page ouverte après connexion<select value={profile.preferences.landingPage} onChange={(event) => updatePreference("landingPage", event.target.value as AccountProfile["preferences"]["landingPage"])} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="/">Tableau de bord</option><option value="/goals">Objectifs</option><option value="/projects">Projets</option><option value="/activity">Centre d’activité</option></select></label></CardContent></Card></div></div> : null}

    {tab === "appearance" ? <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><MonitorCog className="size-4" />Thème et ergonomie</CardTitle></CardHeader><CardContent className="space-y-6"><div><p className="text-sm font-medium">Mode d’affichage</p><div className="mt-3 grid gap-3 sm:grid-cols-3">{(["light", "dark", "system"] as const).map((item) => <button key={item} onClick={() => updatePreference("theme", item)} className={cn("rounded-xl border p-4 text-left", theme === item && "border-primary bg-primary/5")}><Palette className="size-5 text-primary" /><p className="mt-3 text-sm font-medium">{item === "light" ? "Clair" : item === "dark" ? "Sombre" : "Système"}</p>{profile.preferences.theme === item ? <Check className="mt-2 size-4 text-primary" /> : null}</button>)}</div></div><div><p className="text-sm font-medium">Couleur d’accent</p><div className="mt-3 grid gap-3 sm:grid-cols-5">{accentOptions.map((accent) => <button key={accent.id} onClick={() => updatePreference("accentColor", accent.id)} className={cn("rounded-xl border p-3 text-center", profile.preferences.accentColor === accent.id && "ring-2 ring-ring")}><span className="mx-auto block size-8 rounded-full" style={{ backgroundColor: accent.color }} /><span className="mt-2 block text-xs">{accent.label}</span></button>)}</div></div><div><p className="text-sm font-medium">Densité de l’interface</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["comfortable", "compact"] as InterfaceDensity[]).map((density) => <button key={density} onClick={() => updatePreference("density", density)} className={cn("rounded-xl border p-4 text-left", profile.preferences.density === density && "border-primary bg-primary/5")}><p className="text-sm font-medium">{density === "comfortable" ? "Confortable" : "Compacte"}</p><p className="mt-1 text-xs text-muted-foreground">{density === "comfortable" ? "Plus d’espace et de respiration." : "Plus d’informations visibles à l’écran."}</p></button>)}</div></div><div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><p className="text-sm font-medium">Réduire les animations</p><p className="mt-1 text-xs text-muted-foreground">Limite les transitions et respecte votre confort visuel.</p></div><Switch checked={profile.preferences.reducedMotion} onCheckedChange={(value) => updatePreference("reducedMotion", value)} label="Réduire les animations" /></div><div className="flex justify-end"><Button onClick={() => void save()} disabled={saving}><Save className="size-4" />Enregistrer l’apparence</Button></div></CardContent></Card><Card className="h-fit"><CardHeader><CardTitle>Aperçu</CardTitle></CardHeader><CardContent><div className="rounded-2xl border bg-background p-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--primary), #22d3ee)" }}>{initials}</span><div><p className="text-sm font-medium">{profile.fullName}</p><p className="text-xs text-muted-foreground">{profile.jobTitle || "Votre fonction"}</p></div></div><Button className="mt-5 w-full">Action principale</Button><div className="mt-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">L’accent sélectionné s’applique à toute l’interface.</div></div></CardContent></Card></div> : null}

    {tab === "billing" ? currentAccount?.accessLevel === "admin" ? <AccountBillingPanel /> : <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><CreditCard className="size-8 text-primary" /><h2 className="mt-4 font-medium">Facturation gérée par votre administrateur</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Vous utilisez actuellement l’offre {currentAccount?.subscription?.planName ?? "de votre entreprise"}. Seul un administrateur peut modifier l’abonnement et consulter les factures.</p></CardContent></Card> : null}

    {tab === "security" ? <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" />Protection du compte</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-3 rounded-xl border p-4"><Mail className="size-5 text-emerald-500" /><div><p className="text-sm font-medium">Adresse vérifiée</p><p className="text-xs text-muted-foreground">{profile.email}</p></div><Badge className="ml-auto bg-emerald-500/10 text-emerald-500">Active</Badge></div><div className="rounded-xl border p-4"><p className="text-sm font-medium">Sessions sécurisées</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Supabase Auth utilise des cookies HTTP-only. Les clés API et jetons OAuth ne sont jamais envoyés au navigateur.</p></div></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" />Mot de passe</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">Recevez un lien sécurisé pour définir un nouveau mot de passe. Votre session actuelle reste protégée.</p><Button variant="outline" className="mt-5 w-full" onClick={() => void requestPasswordReset()} disabled={resetting}>{resetting ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Changer mon mot de passe</Button></CardContent></Card></div> : null}
  </div>;
}
