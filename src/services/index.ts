import type { AccountProfile, ActivityEvent, AgentExecution, ApprovalRequest, Automation, AutomationExecution, Connection, Goal, GoalAnalysis, MemoryItem, Project, WorkspaceData, WorkspaceSettings } from "@/types";
import { apiClient, simulate } from "./api-client";

type Collection = keyof WorkspaceData;

export const workspaceService = {
  load: async () => (await apiClient<WorkspaceData>("/api/workspace", { cache: "no-store" })).data,
  create: async <K extends Collection>(collection: K, record: WorkspaceData[K][number]) => (
    await apiClient<WorkspaceData[K][number]>("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ operation: "create", collection, record }),
    })
  ).data,
  patch: async <K extends Collection>(collection: K, id: string, changes: Partial<WorkspaceData[K][number]>) => (
    await apiClient<WorkspaceData[K][number]>("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ operation: "patch", collection, id, changes }),
    })
  ).data,
  delete: async <K extends Collection>(collection: K, id: string) => (
    await apiClient<{ success: true }>("/api/workspace", {
      method: "POST",
      body: JSON.stringify({ operation: "delete", collection, id }),
    })
  ).data,
};

export const goalService = {
  list: async () => (await workspaceService.load()).goals,
  get: async (id: string) => (await workspaceService.load()).goals.find((goal) => goal.id === id),
  create: (goal: Goal) => workspaceService.create("goals", goal),
  analyze: async (objective: string) => (await apiClient<GoalAnalysis>("/api/goals/analyze", {
    method: "POST",
    body: JSON.stringify({ objective }),
    timeout: 65_000,
  })).data,
};
export const projectService = { list: async () => (await workspaceService.load()).projects, get: async (id: string) => (await workspaceService.load()).projects.find((project) => project.id === id) } satisfies { list: () => Promise<Project[]>; get: (id: string) => Promise<Project | undefined> };
export const agentService = {
  list: async () => (await workspaceService.load()).agents,
  get: async (id: string) => (await workspaceService.load()).agents.find((agent) => agent.id === id),
  run: async (agentId: string, instruction: string) => (await apiClient<AgentExecution>("/api/agents/run", {
    method: "POST",
    body: JSON.stringify({ agentId, instruction }),
    timeout: 65_000,
  })).data,
};
export const memoryService = {
  list: async () => (await workspaceService.load()).memories,
  create: (memory: MemoryItem) => workspaceService.create("memories", memory),
  update: (id: string, changes: Partial<MemoryItem>) => workspaceService.patch("memories", id, changes),
  delete: (id: string) => workspaceService.delete("memories", id),
};
export const automationService = {
  list: async () => (await workspaceService.load()).automations,
  create: (automation: Automation) => workspaceService.create("automations", automation),
  update: (id: string, changes: Partial<Automation>) => workspaceService.patch("automations", id, changes),
  delete: (id: string) => workspaceService.delete("automations", id),
  run: async (automationId: string) => (await apiClient<AutomationExecution>("/api/automations/run", {
    method: "POST",
    body: JSON.stringify({ automationId }),
    timeout: 65_000,
  })).data,
};
export const approvalService = { list: async () => (await workspaceService.load()).approvals } satisfies { list: () => Promise<ApprovalRequest[]> };
export const connectionService = { list: async () => (await workspaceService.load()).connections } satisfies { list: () => Promise<Connection[]> };

export const activityService = {
  list: async () => (await workspaceService.load()).activities,
  subscribe: (onEvent: (event: ActivityEvent) => void) => {
    let events: ActivityEvent[] = [];
    void workspaceService.load().then((data) => { events = data.activities; });
    const interval = setInterval(() => {
      if (events.length) onEvent(events[Math.floor(Math.random() * events.length)]);
    }, 8_000);
    return () => clearInterval(interval);
  },
};

export const assistantService = {
  send: async (message: string) => (
    await apiClient<{ content: string; model: string }>("/api/assistant", {
      method: "POST",
      body: JSON.stringify({ message }),
      timeout: 65_000,
    })
  ).data,
};

export const settingsService = {
  load: async () => (await apiClient<{ workspaceName: string; settings: WorkspaceSettings }>("/api/settings", { cache: "no-store" })).data,
  save: async (workspaceName: string, settings: WorkspaceSettings) => (await apiClient<{ workspaceName: string; settings: WorkspaceSettings }>("/api/settings", {
    method: "POST",
    body: JSON.stringify({ workspaceName, settings }),
  })).data,
};

export const accountService = {
  load: async () => (await apiClient<AccountProfile>("/api/account", { cache: "no-store" })).data,
  update: async (profile: Pick<AccountProfile, "fullName" | "jobTitle" | "phone" | "timezone">) => (await apiClient<AccountProfile>("/api/account", {
    method: "PATCH",
    body: JSON.stringify(profile),
  })).data,
};

export async function sendGoalToN8n(goal: Goal) {
  const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
  if (!webhookUrl) return simulate({ queued: true, mode: "simulation" as const }, 500);
  // En production, passez toujours par une route serveur : les secrets et signatures ne doivent jamais être exposés dans le navigateur.
  const response = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "goal.created", goal }) });
  if (!response.ok) throw new Error("Le webhook n8n n’a pas répondu correctement.");
  return response.json() as Promise<unknown>;
}
