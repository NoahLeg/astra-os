"use client";

import { create } from "zustand";
import { workspaceService } from "@/services";
import type { AccessLevel, Agent, ApprovalRequest, Automation, Goal, MemoryItem, MultiAgentMission, WorkspaceData, WorkspaceSubscription } from "@/types";

interface AppState extends WorkspaceData {
  account?: { id: string; email: string; fullName?: string; isAdmin?: boolean; accessLevel?: AccessLevel; workspaceName?: string; subscription?: WorkspaceSubscription };
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
  updateMemory: (id: string, changes: Partial<MemoryItem>) => void;
  toggleMemoryBlock: (id: string) => void;
  addMemory: (memory: MemoryItem) => void;
  deleteMemory: (id: string) => void;
  addAutomation: (automation: Automation) => void;
  updateAutomation: (id: string, changes: Partial<Automation>) => void;
  deleteAutomation: (id: string) => void;
  addMission: (mission: MultiAgentMission) => void;
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
  missions: [],
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
  updateMemory: (id, changes) => {
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
  addMemory: (memory) => {
    set((state) => ({ memories: [memory, ...state.memories] }));
    void workspaceService.create("memories", memory).catch((error) => set({ dataError: getErrorMessage(error) }));
  },
  deleteMemory: (id) => {
    const previous = get().memories;
    set((state) => ({ memories: state.memories.filter((item) => item.id !== id) }));
    void workspaceService.delete("memories", id).catch((error) => set({ memories: previous, dataError: getErrorMessage(error) }));
  },
  addAutomation: (automation) => {
    set((state) => ({ automations: [automation, ...state.automations] }));
    void workspaceService.create("automations", automation).catch((error) => set({ dataError: getErrorMessage(error) }));
  },
  updateAutomation: (id, changes) => {
    const previous = get().automations;
    set((state) => ({ automations: state.automations.map((item) => item.id === id ? { ...item, ...changes } : item) }));
    void workspaceService.patch("automations", id, changes).catch((error) => set({ automations: previous, dataError: getErrorMessage(error) }));
  },
  deleteAutomation: (id) => {
    const previous = get().automations;
    set((state) => ({ automations: state.automations.filter((item) => item.id !== id) }));
    void workspaceService.delete("automations", id).catch((error) => set({ automations: previous, dataError: getErrorMessage(error) }));
  },
  addMission: (mission) => set((state) => ({ missions: [mission, ...state.missions.filter((item) => item.id !== mission.id)] })),
}));
