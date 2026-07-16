import type { AccessLevel, AIModel, AutonomyLevel, FeatureKey, SubscriptionPlan, WorkspaceSettings } from "@/types";

export const PRODUCT_NAME = "Astra OS";

export const routes = [
  { label: "Tableau de bord", href: "/", icon: "LayoutDashboard", minAccess: "viewer" },
  { label: "Objectifs", href: "/goals", icon: "Target", minAccess: "viewer" },
  { label: "Projets", href: "/projects", icon: "FolderKanban", minAccess: "viewer" },
  { label: "Centre d’activité", href: "/activity", icon: "Activity", minAccess: "viewer" },
  { label: "Agents", href: "/agents", icon: "Bot", minAccess: "operator", feature: "agents" },
  { label: "Mission multi-agents", href: "/orchestration", icon: "Network", minAccess: "operator", feature: "multi_agent" },
  { label: "Mémoire", href: "/memory", icon: "BrainCircuit", minAccess: "operator", feature: "memory" },
  { label: "Automatisations", href: "/automations", icon: "Workflow", minAccess: "operator", feature: "automations" },
  { label: "Connexions", href: "/connections", icon: "PlugZap", minAccess: "admin", feature: "connectors" },
  { label: "Validations", href: "/approvals", icon: "ShieldCheck", minAccess: "operator", feature: "agents" },
  { label: "Abonnement", href: "/billing", icon: "CreditCard", minAccess: "admin" },
  { label: "Paramètres", href: "/settings", icon: "Settings2", minAccess: "admin" },
] as const;

export const accessLevels: Array<{ id: AccessLevel; name: string; description: string }> = [
  { id: "viewer", name: "Lecture", description: "Consulte les tableaux de bord, objectifs, projets et activités." },
  { id: "operator", name: "Opérateur", description: "Utilise les agents, la mémoire, les validations et les automatisations." },
  { id: "admin", name: "Administrateur", description: "Configure les connexions, permissions, budgets et paramètres de l’entreprise." },
];

export const accessRank: Record<AccessLevel, number> = { viewer: 0, operator: 1, admin: 2 };

export function hasAccess(current: AccessLevel | undefined, required: AccessLevel) {
  return accessRank[current ?? "viewer"] >= accessRank[required];
}

export function hasFeature(features: FeatureKey[] | undefined, required?: FeatureKey) {
  return !required || Boolean(features?.includes(required));
}

export const featureLabels: Record<FeatureKey, string> = {
  assistant: "Assistant IA",
  goals: "Objectifs et plans",
  memory: "Mémoire d'entreprise",
  agents: "Agents spécialisés",
  connectors: "Connecteurs Google",
  automations: "Automatisations",
  multi_agent: "Orchestration multi-agents",
  team_admin: "Gestion avancée des équipes",
};

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Pour structurer les premiers objectifs avec Astra.",
    monthlyPriceCents: 0,
    apiLimit: 100,
    maxAgents: 0,
    features: ["assistant", "goals", "memory"],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Pour automatiser le travail d'une petite équipe.",
    monthlyPriceCents: 4900,
    apiLimit: 2_000,
    maxAgents: 5,
    features: ["assistant", "goals", "memory", "agents", "connectors", "automations"],
    highlighted: true,
  },
  {
    id: "business",
    name: "Business",
    description: "Pour coordonner plusieurs agents et plusieurs utilisateurs.",
    monthlyPriceCents: 14900,
    apiLimit: 10_000,
    maxAgents: 10,
    features: ["assistant", "goals", "memory", "agents", "connectors", "automations", "multi_agent", "team_admin"],
  },
];

export const defaultWorkspaceSettings: WorkspaceSettings = {
  locale: "fr",
  compactMode: false,
  enabledModelIds: ["gpt"],
  defaultModelId: "gpt",
  defaultAutonomy: 2,
  telemetryEnabled: false,
  allowMemoryLearning: true,
  memoryEnabled: true,
  memoryApprovalRequired: true,
  auditLogging: true,
  sessionTimeoutMinutes: 480,
  monthlyBudget: 100,
  budgetAlertPercent: 80,
  blockOnBudgetLimit: true,
  notificationEmail: true,
  notificationApprovals: true,
  notificationErrors: true,
  weeklyDigest: true,
  dataRetentionDays: 365,
  exportFormat: "json",
};

export const autonomyLevels: Array<{ level: AutonomyLevel; name: string; description: string }> = [
  { level: 0, name: "Répond uniquement", description: "Analyse et répond, sans proposer d’action." },
  { level: 1, name: "Propose", description: "Prépare des actions sans les exécuter." },
  { level: 2, name: "Exécute avec validation", description: "Exécute après validation humaine." },
  { level: 3, name: "Planifie", description: "Planifie les actions futures dans les limites définies." },
  { level: 4, name: "Coordonne", description: "Coordonne plusieurs agents avec validations sensibles." },
];

export const models: AIModel[] = [
  { id: "gpt", name: "GPT-5.4", provider: "OpenAI", contextWindow: "1M", enabled: true },
  { id: "claude", name: "Claude Opus 4.6", provider: "Anthropic", contextWindow: "1M", enabled: true },
  { id: "gemini", name: "Gemini 3.1 Pro", provider: "Google", contextWindow: "2M", enabled: false },
  { id: "local", name: "Modèle local", provider: "Local", contextWindow: "128k", enabled: false },
];

export const sensitiveActions = ["delete", "send", "publish", "purchase"] as const;
