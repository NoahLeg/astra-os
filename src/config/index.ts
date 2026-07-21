import type { AccessLevel, AccountPreferences, AIModel, AutonomyLevel, FeatureKey, SubscriptionPlan, WorkspaceSettings } from "@/types";

export const PRODUCT_NAME = "Astra OS";

export const routes = [
  { label: "Tableau de bord", href: "/", icon: "LayoutDashboard", minAccess: "viewer" },
  { label: "Objectifs", href: "/goals", icon: "Target", minAccess: "viewer" },
  { label: "Projets", href: "/projects", icon: "FolderKanban", minAccess: "viewer" },
  { label: "Centre d’activité", href: "/activity", icon: "Activity", minAccess: "viewer" },
  { label: "Agents", href: "/agents", icon: "Bot", minAccess: "operator", feature: "agents" },
  { label: "Chatbots", href: "/chatbots", icon: "MessageSquareText", minAccess: "operator", feature: "chatbots" },
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
  chatbots: "Chatbots personnalisés",
  goals: "Objectifs et plans",
  memory: "Mémoire d'entreprise",
  agents: "Agents spécialisés",
  connectors: "Connecteurs Google",
  automations: "Automatisations",
  multi_agent: "Orchestration multi-agents",
  team_admin: "Gestion avancée des équipes",
  collaboration: "Collaboration multi-membres sur les tâches",
};

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "Pour découvrir Astra et structurer quelques objectifs.",
    monthlyPriceCents: 0,
    monthlyTokenLimit: 100_000,
    dailyTokenLimit: 25_000,
    minuteRequestLimit: 3,
    maxAgents: 0,
    maxMembers: 1,
    features: ["assistant", "chatbots", "goals", "memory"],
  },
  {
    id: "starter",
    name: "Starter",
    description: "Pour automatiser ses premiers processus sans surdimensionner son budget.",
    monthlyPriceCents: 1900,
    monthlyTokenLimit: 1_000_000,
    dailyTokenLimit: 150_000,
    minuteRequestLimit: 10,
    maxAgents: 2,
    maxMembers: 1,
    features: ["assistant", "chatbots", "goals", "memory", "agents", "connectors", "automations"],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Pour automatiser le travail d'une petite équipe.",
    monthlyPriceCents: 4900,
    monthlyTokenLimit: 5_000_000,
    dailyTokenLimit: 500_000,
    minuteRequestLimit: 30,
    maxAgents: 5,
    maxMembers: 3,
    features: ["assistant", "chatbots", "goals", "memory", "agents", "connectors", "automations"],
    highlighted: true,
  },
  {
    id: "business",
    name: "Business",
    description: "Pour coordonner plusieurs agents et plusieurs utilisateurs.",
    monthlyPriceCents: 14900,
    monthlyTokenLimit: 20_000_000,
    dailyTokenLimit: 2_000_000,
    minuteRequestLimit: 60,
    maxAgents: 10,
    maxMembers: 10,
      features: ["assistant", "chatbots", "goals", "memory", "agents", "connectors", "automations", "multi_agent", "team_admin", "collaboration"],
  },
  {
    id: "enterprise",
    name: "Entreprise",
    description: "Pour déployer Astra à l’échelle d’une organisation avec des sièges et quotas contractuels.",
    monthlyPriceCents: 0,
    monthlyTokenLimit: 100_000_000,
    dailyTokenLimit: 10_000_000,
    minuteRequestLimit: 180,
    maxAgents: 25,
    maxMembers: 50,
    features: ["assistant", "chatbots", "goals", "memory", "agents", "connectors", "automations", "multi_agent", "team_admin", "collaboration"],
    quoteOnly: true,
  },
];

export const defaultAccountPreferences: AccountPreferences = {
  theme: "dark",
  accentColor: "indigo",
  density: "comfortable",
  reducedMotion: false,
  landingPage: "/",
  readNotificationIds: [],
};

export const defaultWorkspaceSettings: WorkspaceSettings = {
  locale: "fr",
  compactMode: false,
  enabledModelIds: ["gpt-5.4-mini"],
  defaultModelId: "gpt-5.4-mini",
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
  { id: "gpt-5.4-mini", name: "GPT-5.4 mini", provider: "OpenAI", contextWindow: "Selon API", enabled: true },
  { id: "gpt-5.4", name: "GPT-5.4", provider: "OpenAI", contextWindow: "Selon API", enabled: true },
  { id: "gpt-5.4-nano", name: "GPT-5.4 nano", provider: "OpenAI", contextWindow: "Selon API", enabled: true },
  { id: "gpt-5.5", name: "GPT-5.5", provider: "OpenAI", contextWindow: "Selon API", enabled: true },
];

export const openAIModels = [
  { id: "gpt-5.4-mini", name: "GPT-5.4 mini", description: "Rapide et économique pour la majorité des échanges." },
  { id: "gpt-5.4", name: "GPT-5.4", description: "Raisonnement avancé et contexte long." },
  { id: "gpt-5.4-nano", name: "GPT-5.4 nano", description: "Très faible coût pour les tâches simples et volumineuses." },
  { id: "gpt-5.5", name: "GPT-5.5", description: "Modèle premium pour les tâches les plus complexes." },
] as const;

export const sensitiveActions = ["delete", "send", "publish", "purchase"] as const;
