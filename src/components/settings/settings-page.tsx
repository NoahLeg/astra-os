"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, BrainCircuit, Check, ChevronRight, Coins, Database, Download, Eye, LoaderCircle, LockKeyhole, Palette, Save, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/components/layout/theme-provider";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { autonomyLevels, defaultWorkspaceSettings, models, sensitiveActions } from "@/config";
import { cn } from "@/lib/utils";
import { settingsService, workspaceService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { Permission, WorkspaceSettings } from "@/types";

const sections = [
  { key: "profile", label: "Profil entreprise", icon: UserRound },
  { key: "appearance", label: "Apparence", icon: Palette },
  { key: "models", label: "Modèles IA", icon: SlidersHorizontal },
  { key: "autonomy", label: "Autonomie", icon: ShieldCheck },
  { key: "permissions", label: "Permissions", icon: LockKeyhole },
  { key: "privacy", label: "Confidentialité", icon: Eye },
  { key: "memory", label: "Mémoire", icon: BrainCircuit },
  { key: "security", label: "Sécurité", icon: LockKeyhole },
  { key: "budget", label: "Budget", icon: Coins },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "data", label: "Données", icon: Database },
] as const;

const permissionActions: Array<{ id: Permission["actions"][number]; label: string }> = [
  { id: "read", label: "Lire" }, { id: "create", label: "Créer" }, { id: "update", label: "Modifier" }, { id: "delete", label: "Supprimer" },
  { id: "send", label: "Envoyer" }, { id: "publish", label: "Publier" }, { id: "purchase", label: "Acheter" }, { id: "schedule", label: "Planifier" },
];

export function SettingsPage() {
  const [section, setSection] = useState<(typeof sections)[number]["key"]>("profile");
  const [workspaceName, setWorkspaceName] = useState("");
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultWorkspaceSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { theme, setTheme } = useTheme();
  const agents = useAppStore((state) => state.agents);
  const hydrateFromDatabase = useAppStore((state) => state.hydrateFromDatabase);
  const [permissionDraft, setPermissionDraft] = useState<Record<string, Permission["actions"]>>(() => Object.fromEntries(agents.map((agent) => [agent.id, Array.from(new Set(agent.permissions.flatMap((permission) => permission.actions)))])));

  useEffect(() => {
    void settingsService.load().then((result) => {
      setWorkspaceName(result.workspaceName);
      setSettings(result.settings);
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Paramètres indisponibles")).finally(() => setLoading(false));
  }, []);

  const enabledModels = useMemo(() => new Set(settings.enabledModelIds), [settings.enabledModelIds]);
  const update = <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const togglePermission = (agentId: string, action: Permission["actions"][number]) => {
    setPermissionDraft((current) => {
      const existing = current[agentId] ?? [];
      return { ...current, [agentId]: existing.includes(action) ? existing.filter((item) => item !== action) : [...existing, action] };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        settingsService.save(workspaceName, settings),
        ...agents.map((agent) => workspaceService.patch("agents", agent.id, { permissions: [{ resource: "Espace de travail", actions: permissionDraft[agent.id] ?? [], requiresApproval: (permissionDraft[agent.id] ?? []).some((action) => sensitiveActions.includes(action as typeof sensitiveActions[number])) }] })),
      ]);
      await hydrateFromDatabase();
      toast.success("Paramètres enregistrés dans Supabase");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      if (!response.ok) throw new Error("Export impossible");
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `astra-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export généré");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export impossible");
    }
  };

  if (loading) return <div className="flex min-h-80 items-center justify-center"><LoaderCircle className="size-7 animate-spin text-indigo-500" /></div>;

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Gouvernance" title="Paramètres et permissions" description="Définissez les limites d’exécution, les modèles, la confidentialité et les budgets de votre système." actions={<Button onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Enregistrer</Button>} />
      <div className="grid gap-5 lg:grid-cols-[230px_1fr]">
        <Card className="h-fit min-w-0 overflow-hidden"><CardContent className="flex gap-1 overflow-x-auto p-2 lg:block lg:space-y-1">{sections.map((item) => <button type="button" key={item.key} onClick={() => setSection(item.key)} aria-current={section === item.key ? "page" : undefined} className={cn("flex min-h-10 min-w-max items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm lg:w-full lg:gap-3", section === item.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><item.icon className="size-4 shrink-0" />{item.label}<ChevronRight className="ml-auto hidden size-3 lg:block" /></button>)}</CardContent></Card>
        <div className="space-y-5">
          {section === "profile" && <Card><CardHeader><CardTitle>Profil de l’entreprise</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Nom de l’espace<Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} className="mt-2" minLength={2} /></label><label className="text-sm font-medium">Langue<select value={settings.locale} onChange={(event) => update("locale", event.target.value as WorkspaceSettings["locale"])} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="fr">Français</option><option value="en">English</option></select></label><div className="rounded-xl border p-4 text-sm"><p className="font-medium">Configuration partagée</p><p className="mt-1 text-xs text-muted-foreground">Ces choix s’appliquent à tous les membres de l’entreprise.</p></div></CardContent></Card>}

          {section === "appearance" && <Card><CardHeader><CardTitle>Apparence</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 sm:grid-cols-3">{["light", "dark", "system"].map((item) => <button key={item} onClick={() => setTheme(item)} className={cn("rounded-xl border p-5 text-left capitalize", theme === item && "border-indigo-500 bg-indigo-500/5")}><Palette className="size-5 text-indigo-500" /><p className="mt-4 font-medium">{item === "light" ? "Clair" : item === "dark" ? "Sombre" : "Système"}</p></button>)}</div><SettingSwitch title="Interface compacte" description="Réduit les espacements dans les tableaux et les cartes." checked={settings.compactMode} onChange={(value) => update("compactMode", value)} /></CardContent></Card>}

          {section === "models" && <Card><CardHeader><CardTitle>Modèles IA</CardTitle></CardHeader><CardContent className="space-y-3">{models.map((model) => <div key={model.id} className="flex flex-col gap-4 rounded-xl border bg-background p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{model.name}</p><Badge className="bg-muted text-muted-foreground">{model.provider}</Badge>{settings.defaultModelId === model.id && <Badge className="bg-indigo-500/10 text-indigo-500">Par défaut</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">Fenêtre de contexte : {model.contextWindow}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><Button variant="ghost" size="sm" disabled={!enabledModels.has(model.id)} onClick={() => update("defaultModelId", model.id)}>Utiliser par défaut</Button><Switch checked={enabledModels.has(model.id)} onCheckedChange={(checked) => update("enabledModelIds", checked ? [...settings.enabledModelIds, model.id] : settings.enabledModelIds.filter((id) => id !== model.id))} label={`Activer ${model.name}`} /></div></div>)}</CardContent></Card>}

          {section === "autonomy" && <><Card><CardHeader><CardTitle>Niveau d’autonomie par défaut</CardTitle></CardHeader><CardContent className="space-y-2">{autonomyLevels.map((item) => <button key={item.level} onClick={() => update("defaultAutonomy", item.level)} className={cn("flex w-full items-center gap-4 rounded-xl border p-4 text-left", settings.defaultAutonomy === item.level ? "border-indigo-500 bg-indigo-500/5" : "bg-background")}><span className={cn("flex size-10 items-center justify-center rounded-xl font-mono text-sm", settings.defaultAutonomy === item.level ? "bg-indigo-500 text-white" : "bg-muted")}>N{item.level}</span><div className="flex-1"><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.description}</p></div>{settings.defaultAutonomy === item.level && <Check className="size-4 text-indigo-500" />}</button>)}</CardContent></Card><Card className="border-amber-500/20"><CardHeader><CardTitle className="text-base">Validation toujours obligatoire</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Ces actions restent bloquées jusqu’à une décision humaine.</p><div className="mt-4 flex flex-wrap gap-2">{sensitiveActions.map((action) => <Badge key={action} className="bg-amber-500/10 text-amber-500">{action}</Badge>)}</div></CardContent></Card></>}

          {section === "permissions" && <Card><CardHeader><CardTitle>Matrice de permissions des agents</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b bg-muted/40"><th className="p-4 text-left">Agent</th>{permissionActions.map((action) => <th key={action.id} className="px-2 text-center text-[10px] font-medium text-muted-foreground">{action.label}</th>)}</tr></thead><tbody>{agents.map((agent) => <tr key={agent.id} className="border-b last:border-0"><td className="p-4 font-medium">{agent.name}</td>{permissionActions.map((action) => <td key={action.id} className="p-2 text-center"><input type="checkbox" checked={(permissionDraft[agent.id] ?? []).includes(action.id)} onChange={() => togglePermission(agent.id, action.id)} aria-label={`${agent.name} peut ${action.label.toLowerCase()}`} className="size-4 accent-indigo-500" /></td>)}</tr>)}</tbody></table></CardContent></Card>}

          {section === "privacy" && <Card><CardHeader><CardTitle>Confidentialité</CardTitle></CardHeader><CardContent className="space-y-3"><SettingSwitch title="Télémétrie produit" description="Autorise les métriques anonymisées de performance. Désactivée par défaut." checked={settings.telemetryEnabled} onChange={(value) => update("telemetryEnabled", value)} /><SettingSwitch title="Apprentissage des habitudes" description="Permet à Astra de proposer de nouveaux éléments de mémoire à partir de vos usages." checked={settings.allowMemoryLearning} onChange={(value) => update("allowMemoryLearning", value)} /></CardContent></Card>}

          {section === "memory" && <Card><CardHeader><CardTitle>Contrôle de la mémoire</CardTitle></CardHeader><CardContent className="space-y-3"><SettingSwitch title="Activer la mémoire" description="Autorise les agents à consulter les éléments non bloqués." checked={settings.memoryEnabled} onChange={(value) => update("memoryEnabled", value)} /><SettingSwitch title="Apprentissage automatique" description="Crée des propositions de mémoire à partir des tâches terminées." checked={settings.allowMemoryLearning} onChange={(value) => update("allowMemoryLearning", value)} /><SettingSwitch title="Validation avant mémorisation" description="Demande une confirmation avant d’enregistrer un nouvel apprentissage automatique." checked={settings.memoryApprovalRequired} onChange={(value) => update("memoryApprovalRequired", value)} /></CardContent></Card>}

          {section === "security" && <Card><CardHeader><CardTitle>Sécurité</CardTitle></CardHeader><CardContent className="space-y-4"><SettingSwitch title="Journalisation renforcée" description="Conserve une trace des actions sensibles et des accès aux secrets." checked={settings.auditLogging} onChange={(value) => update("auditLogging", value)} /><label className="block text-sm font-medium">Durée maximale d’une session (minutes)<Input type="number" min={15} max={43200} value={settings.sessionTimeoutMinutes} onChange={(event) => update("sessionTimeoutMinutes", Number(event.target.value))} className="mt-2 max-w-xs" /></label></CardContent></Card>}

          {section === "budget" && <Card><CardHeader><CardTitle>Budget IA mensuel</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Budget mensuel (€)<Input type="number" min={0} value={settings.monthlyBudget} onChange={(event) => update("monthlyBudget", Number(event.target.value))} className="mt-2" /></label><label className="text-sm font-medium">Alerte à (%)<Input type="number" min={1} max={100} value={settings.budgetAlertPercent} onChange={(event) => update("budgetAlertPercent", Number(event.target.value))} className="mt-2" /></label></div><SettingSwitch title="Bloquer à la limite" description="Empêche de nouvelles exécutions lorsque le budget est atteint." checked={settings.blockOnBudgetLimit} onChange={(value) => update("blockOnBudgetLimit", value)} /></CardContent></Card>}

          {section === "notifications" && <Card><CardHeader><CardTitle>Notifications</CardTitle></CardHeader><CardContent className="space-y-3"><SettingSwitch title="Notifications par e-mail" description="Active l’envoi des alertes vers votre adresse de compte." checked={settings.notificationEmail} onChange={(value) => update("notificationEmail", value)} /><SettingSwitch title="Validations requises" description="Alerte lorsqu’une action attend une décision humaine." checked={settings.notificationApprovals} onChange={(value) => update("notificationApprovals", value)} /><SettingSwitch title="Erreurs critiques" description="Alerte lorsqu’un agent ou un connecteur échoue." checked={settings.notificationErrors} onChange={(value) => update("notificationErrors", value)} /><SettingSwitch title="Résumé hebdomadaire" description="Envoie une synthèse d’activité chaque semaine." checked={settings.weeklyDigest} onChange={(value) => update("weeklyDigest", value)} /></CardContent></Card>}

          {section === "data" && <Card><CardHeader><CardTitle>Données</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Conservation (jours)<Input type="number" min={1} max={3650} value={settings.dataRetentionDays} onChange={(event) => update("dataRetentionDays", Number(event.target.value))} className="mt-2" /></label><label className="text-sm font-medium">Format d’export<select value={settings.exportFormat} onChange={(event) => update("exportFormat", event.target.value as WorkspaceSettings["exportFormat"])} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="json">JSON</option><option value="csv">CSV</option></select></label></div><div className="rounded-xl border p-4"><p className="text-sm font-medium">Exporter les données de l’espace</p><p className="mt-1 text-xs text-muted-foreground">Télécharge les objectifs, projets, activités, mémoires et automatisations accessibles.</p><Button variant="outline" className="mt-4" onClick={() => void exportData()}><Download className="size-4" />Exporter maintenant</Button></div></CardContent></Card>}
        </div>
      </div>
    </div>
  );
}

function SettingSwitch({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border bg-background p-4"><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><Switch checked={checked} onCheckedChange={onChange} label={title} /></div>;
}
