import type { AIModel, AutonomyLevel } from "@/types";

export const PRODUCT_NAME = "Astra OS";

export const routes = [
  { label: "Tableau de bord", href: "/", icon: "LayoutDashboard" },
  { label: "Objectifs", href: "/goals", icon: "Target" },
  { label: "Projets", href: "/projects", icon: "FolderKanban" },
  { label: "Centre d’activité", href: "/activity", icon: "Activity" },
  { label: "Agents", href: "/agents", icon: "Bot" },
  { label: "Mémoire", href: "/memory", icon: "BrainCircuit" },
  { label: "Automatisations", href: "/automations", icon: "Workflow" },
  { label: "Connexions", href: "/connections", icon: "PlugZap" },
  { label: "Validations", href: "/approvals", icon: "ShieldCheck" },
  { label: "Paramètres", href: "/settings", icon: "Settings2" },
] as const;

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
