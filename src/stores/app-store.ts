"use client";

import { create } from "zustand";
import { workspaceService } from "@/services";
import type { Agent, ApprovalRequest, Automation, Goal, MemoryItem, WorkspaceData } from "@/types";

interface AppState extends WorkspaceData {
  account?: { id: string; email: string; fullName?: string; isAdmin?: boolean };
  sidebarCollapsed: boolean;
  assistantOpen: boolean;
  commandOpen: boolean;
  dataStatus: "loading" | "ready" | "error";
  dataError?: string;
  hydrateFromDatabase: () => Promise<void>;
  setAccount: (account: AppState["account"]) => void;
  toggleSidebar: () => void;
  setAssistantOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  toggleAgent: (id: string) => void;
  resolveApproval: (id: string, status: "approved" | "rejected") => void;
  addGoal: (goal: Goal) => void;
  updateMemory: (id: string, content: string) => void;
  toggleMemoryBlock: (id: string) => void;
  addAutomation: (automation: Automation) => void;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Impossible de synchroniser la base de données";
}

export const useAppStore = create<AppState>((set, get) => ({
  sidebarCollapsed: false,
  assistantOpen: false,
  commandOpen: false,
  dataStatus: "loading",
  account: undefined,
  agents: [],
  approvals: [],
  goals: [],
  projects: [],
  memories: [],
  automations: [],
  connections: [],
  activities: [],
  hydrateFromDatabase: async () => {
    try {
      const data = await workspaceService.load();
      set({ ...data, dataStatus: "ready", dataError: undefined });
    } catch (error) {
      set({ dataStatus: "error", dataError: getErrorMessage(error) });
    }
  },
  setAccount: (account) => set({ account }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  toggleAgent: (id) => {
    const agent = get().agents.find((item) => item.id === id);
    if (!agent) return;
    const changes: Partial<Agent> = { enabled: !agent.enabled, status: agent.enabled ? "paused" : "active" };
    set((state) => ({ agents: state.agents.map((item) => item.id === id ? { ...item, ...changes } : item) }));
    void workspaceService.patch("agents", id, changes).catch((error) => set({ dataError: getErrorMessage(error) }));
  },
  resolveApproval: (id, status) => {
    const changes: Partial<ApprovalRequest> = { status };
    set((state) => ({ approvals: state.approvals.map((item) => item.id === id ? { ...item, ...changes } : item) }));
    void workspaceService.patch("approvals", id, changes).catch((error) => set({ dataError: getErrorMessage(error) }));
  },
  addGoal: (goal) => {
    set((state) => ({ goals: [goal, ...state.goals] }));
    void workspaceService.create("goals", goal).catch((error) => set({ dataError: getErrorMessage(error) }));
  },
  updateMemory: (id, content) => {
    const changes: Partial<MemoryItem> = { content };
    set((state) => ({ memories: state.memories.map((item) => item.id === id ? { ...item, ...changes } : item) }));
    void workspaceService.patch("memories", id, changes).catch((error) => set({ dataError: getErrorMessage(error) }));
  },
  toggleMemoryBlock: (id) => {
    const memory = get().memories.find((item) => item.id === id);
    if (!memory) return;
    const changes: Partial<MemoryItem> = { blocked: !memory.blocked };
    set((state) => ({ memories: state.memories.map((item) => item.id === id ? { ...item, ...changes } : item) }));
    void workspaceService.patch("memories", id, changes).catch((error) => set({ dataError: getErrorMessage(error) }));
  },
  addAutomation: (automation) => {
    set((state) => ({ automations: [automation, ...state.automations] }));
    void workspaceService.create("automations", automation).catch((error) => set({ dataError: getErrorMessage(error) }));
  },
}));
