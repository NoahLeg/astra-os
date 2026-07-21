import type { AccessLevel, AccountProfile, ActivityEvent, AgentExecution, AppNotification, ApprovalRequest, Automation, AutomationExecution, AutomationRun, BillingOverview, Chatbot, ChatbotConversation, ChatbotKnowledge, ChatbotMessage, Connection, ContextFile, EnterpriseQuoteRequest, Goal, GoalAnalysis, MemoryItem, MissionExecution, Project, SubscriptionPlan, TaskCollaborationOverview, TaskEntityType, TeamOverview, WorkItemExecution, WorkspaceData, WorkspaceSettings } from "@/types";
import { apiClient } from "./api-client";

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
  update: (id: string, changes: Partial<Goal>) => workspaceService.patch("goals", id, changes),
  delete: (id: string) => workspaceService.delete("goals", id),
  analyze: async (objective: string) => (await apiClient<GoalAnalysis>("/api/goals/analyze", {
    method: "POST",
    body: JSON.stringify({ objective }),
    timeout: 65_000,
  })).data,
};
export const projectService = {
  list: async () => (await workspaceService.load()).projects,
  get: async (id: string) => (await workspaceService.load()).projects.find((project) => project.id === id),
  create: (project: Project) => workspaceService.create("projects", project),
  update: (id: string, changes: Partial<Project>) => workspaceService.patch("projects", id, changes),
  delete: (id: string) => workspaceService.delete("projects", id),
};
export const workItemService = {
  run: async (entityType: "goal" | "project", entityId: string, agentId: string, instruction: string) => (await apiClient<WorkItemExecution>("/api/work-items/run", {
    method: "POST",
    body: JSON.stringify({ entityType, entityId, agentId, instruction }),
    timeout: 65_000,
  })).data,
};
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
    body: JSON.stringify({ automationId, idempotencyKey: `manual:${crypto.randomUUID()}` }),
    timeout: 125_000,
  })).data,
  runs: async (automationId?: string) => (await apiClient<{ runs: AutomationRun[] }>(`/api/automations/run${automationId ? `?automationId=${encodeURIComponent(automationId)}` : ""}`, { cache: "no-store" })).data.runs,
};
export const approvalService = { list: async () => (await workspaceService.load()).approvals } satisfies { list: () => Promise<ApprovalRequest[]> };
export const connectionService = { list: async () => (await workspaceService.load()).connections } satisfies { list: () => Promise<Connection[]> };

export const activityService = {
  list: async () => (await workspaceService.load()).activities,
  subscribe: (onEvent: (event: ActivityEvent) => void) => {
    const seen = new Set<string>();
    let initialized = false;
    const refresh = async () => {
      const events = (await workspaceService.load()).activities;
      if (!initialized) {
        events.forEach((event) => seen.add(event.id));
        initialized = true;
        return;
      }
      events.filter((event) => !seen.has(event.id)).forEach((event) => {
        seen.add(event.id);
        onEvent(event);
      });
    };
    void refresh().catch(() => undefined);
    const interval = setInterval(() => { void refresh().catch(() => undefined); }, 8_000);
    return () => clearInterval(interval);
  },
};

export const notificationService = {
  list: async () => (await apiClient<{ notifications: AppNotification[]; unreadCount: number }>("/api/notifications", { cache: "no-store" })).data,
  markRead: async (id: string) => (await apiClient<{ success: true }>("/api/notifications", {
    method: "POST",
    body: JSON.stringify({ action: "mark_read", id }),
  })).data,
  markAllRead: async () => (await apiClient<{ success: true }>("/api/notifications", {
    method: "POST",
    body: JSON.stringify({ action: "mark_all_read" }),
  })).data,
};

export const assistantService = {
  load: async (conversationId?: string) => (await apiClient<{ chatbot: Chatbot; conversation: ChatbotConversation; messages: ChatbotMessage[] }>(`/api/assistant${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`, { cache: "no-store" })).data,
  send: async (message: string, conversationId?: string) => (
    await apiClient<{ content: string; model: string; usage?: ChatbotMessage["usage"]; conversation: ChatbotConversation; message: ChatbotMessage }>("/api/assistant", {
      method: "POST",
      body: JSON.stringify({ message, conversationId }),
      timeout: 65_000,
    })
  ).data,
};

export const chatbotService = {
  availableModels: async () => (await apiClient<{ models: Array<{ id: string; name: string; provider: string; description?: string; contextWindow?: number }> }>("/api/ai-models", { cache: "no-store" })).data.models,
  list: async () => (await apiClient<{ chatbots: Chatbot[] }>("/api/chatbots", { cache: "no-store" })).data.chatbots,
  create: async (input: Pick<Chatbot, "name" | "description" | "model" | "systemPrompt" | "memoryEnabled" | "learningEnabled" | "globalLearningEnabled" | "webEnabled">) => (await apiClient<{ chatbot: Chatbot }>("/api/chatbots", { method: "POST", body: JSON.stringify(input) })).data.chatbot,
  update: async (id: string, changes: Partial<Pick<Chatbot, "name" | "description" | "model" | "systemPrompt" | "memoryEnabled" | "learningEnabled" | "globalLearningEnabled" | "webEnabled" | "status">>) => (await apiClient<{ chatbot: Chatbot }>(`/api/chatbots/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) })).data.chatbot,
  delete: async (id: string) => (await apiClient<{ success: true }>(`/api/chatbots/${encodeURIComponent(id)}`, { method: "DELETE" })).data,
  detail: async (id: string) => (await apiClient<{ chatbot: Chatbot; knowledge: ChatbotKnowledge[]; conversations: ChatbotConversation[] }>(`/api/chatbots/${encodeURIComponent(id)}`, { cache: "no-store" })).data,
  addKnowledge: async (id: string, input: { title: string; content: string; source?: string }) => (await apiClient<{ knowledge: ChatbotKnowledge }>(`/api/chatbots/${encodeURIComponent(id)}/knowledge`, { method: "POST", body: JSON.stringify(input) })).data.knowledge,
  updateKnowledge: async (id: string, knowledgeId: string, blocked: boolean) => (await apiClient<{ knowledge: ChatbotKnowledge }>(`/api/chatbots/${encodeURIComponent(id)}/knowledge`, { method: "PATCH", body: JSON.stringify({ knowledgeId, blocked }) })).data.knowledge,
  deleteKnowledge: async (id: string, knowledgeId: string) => (await apiClient<{ success: true }>(`/api/chatbots/${encodeURIComponent(id)}/knowledge?knowledgeId=${encodeURIComponent(knowledgeId)}`, { method: "DELETE" })).data,
  createConversation: async (id: string) => (await apiClient<{ conversation: ChatbotConversation }>(`/api/chatbots/${encodeURIComponent(id)}/conversations`, { method: "POST", body: JSON.stringify({}) })).data.conversation,
  messages: async (id: string, conversationId: string) => (await apiClient<{ messages: ChatbotMessage[] }>(`/api/chatbots/${encodeURIComponent(id)}/conversations?conversationId=${encodeURIComponent(conversationId)}`, { cache: "no-store" })).data.messages,
  send: async (id: string, message: string, conversationId?: string) => (await apiClient<{ conversation: ChatbotConversation; message: ChatbotMessage; learningScheduled: boolean; usage?: ChatbotMessage["usage"] }>(`/api/chatbots/${encodeURIComponent(id)}/chat`, { method: "POST", body: JSON.stringify({ message, conversationId }), timeout: 65_000 })).data,
  files: async (id: string) => (await apiClient<{ files: ContextFile[] }>(`/api/chatbots/${encodeURIComponent(id)}/files`, { cache: "no-store" })).data.files,
  uploadFile: async (id: string, file: File, scope: ContextFile["scope"]) => {
    const body = new FormData();
    body.set("file", file);
    body.set("scope", scope);
    return (await apiClient<{ file: ContextFile }>(`/api/chatbots/${encodeURIComponent(id)}/files`, { method: "POST", body, timeout: 45_000 })).data.file;
  },
  deleteFile: async (id: string, fileId: string) => (await apiClient<{ success: true }>(`/api/chatbots/${encodeURIComponent(id)}/files?fileId=${encodeURIComponent(fileId)}`, { method: "DELETE" })).data,
};

export const orchestrationService = {
  run: async (objective: string, agentIds: string[], autonomyLevel: number) => (await apiClient<MissionExecution>("/api/orchestration/run", {
    method: "POST",
    body: JSON.stringify({ objective, agentIds, autonomyLevel }),
    timeout: 125_000,
  })).data,
};

export const billingService = {
  load: async () => (await apiClient<BillingOverview>("/api/billing", { cache: "no-store" })).data,
  checkout: async (planId: SubscriptionPlan["id"], returnTo: "billing" | "onboarding" = "billing") => (await apiClient<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ planId, returnTo }),
  })).data,
  portal: async () => (await apiClient<{ url: string }>("/api/billing/portal", { method: "POST" })).data,
  requestEnterpriseQuote: async (input: { contactName: string; contactEmail: string; companyName: string; seatCount: number; estimatedMonthlyTokens: number; message?: string }) => (await apiClient<{ quote: EnterpriseQuoteRequest }>("/api/billing/enterprise-quote", {
    method: "POST",
    body: JSON.stringify(input),
  })).data.quote,
};

export const teamService = {
  load: async () => (await apiClient<TeamOverview>("/api/team", { cache: "no-store" })).data,
  invite: async (input: { email: string; fullName: string; accessLevel: AccessLevel }) => (await apiClient<TeamOverview>("/api/team", { method: "POST", body: JSON.stringify({ action: "invite", ...input }) })).data,
  updateAccess: async (userId: string, nextAccessLevel: AccessLevel) => (await apiClient<TeamOverview>("/api/team", { method: "POST", body: JSON.stringify({ action: "update_access", userId, accessLevel: nextAccessLevel }) })).data,
  updateStatus: async (userId: string, status: "active" | "suspended") => (await apiClient<TeamOverview>("/api/team", { method: "POST", body: JSON.stringify({ action: "update_status", userId, status }) })).data,
  remove: async (userId: string) => (await apiClient<TeamOverview>("/api/team", { method: "POST", body: JSON.stringify({ action: "remove", userId }) })).data,
};

type TaskCollaborationKey = { entityType: TaskEntityType; entityId: string; taskId: string };

function taskCollaborationPath(key: TaskCollaborationKey) {
  const query = new URLSearchParams(key);
  return `/api/task-collaboration?${query.toString()}`;
}

export const taskCollaborationService = {
  load: async (key: TaskCollaborationKey) => (await apiClient<TaskCollaborationOverview>(taskCollaborationPath(key), { cache: "no-store" })).data,
  setCollaborators: async (key: TaskCollaborationKey, userIds: string[]) => (await apiClient<TaskCollaborationOverview>("/api/task-collaboration", { method: "POST", body: JSON.stringify({ action: "set_collaborators", ...key, userIds }) })).data,
  addComment: async (key: TaskCollaborationKey, body: string) => (await apiClient<TaskCollaborationOverview>("/api/task-collaboration", { method: "POST", body: JSON.stringify({ action: "add_comment", ...key, body }) })).data,
  deleteComment: async (key: TaskCollaborationKey, commentId: string) => (await apiClient<TaskCollaborationOverview>("/api/task-collaboration", { method: "POST", body: JSON.stringify({ action: "delete_comment", ...key, commentId }) })).data,
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
  update: async (profile: Pick<AccountProfile, "fullName" | "jobTitle" | "phone" | "timezone" | "preferences">) => (await apiClient<AccountProfile>("/api/account", {
    method: "PATCH",
    body: JSON.stringify(profile),
  })).data,
};

export async function sendGoalToN8n(goal: Goal) {
  return (await apiClient<{ queued: true; eventId: string; status: number }>("/api/integrations/n8n/goals", {
    method: "POST",
    body: JSON.stringify({ goal }),
    timeout: 25_000,
  })).data;
}
