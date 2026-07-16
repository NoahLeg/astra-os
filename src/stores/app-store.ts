"use client";

import { create } from "zustand";
import { workspaceService } from "@/services";
import type { AccessLevel, AccountPreferences, Agent, ApprovalRequest, Automation, Goal, MemoryItem, MultiAgentMission, Project, WorkspaceData, WorkspaceSubscription } from "@/types";

interface AppState extends WorkspaceData {
  account?: { id: string; email: string; fullName?: string; isAdmin?: boolean; accessLevel?: AccessLevel; workspaceName?: string; subscription?: WorkspaceSubscription; preferences?: AccountPreferences };
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
  toggleAgent: (id: string) => Promise<void>;
  resolveApproval: (id: string, status: "approved" | "rejected") => void;
  addGoal: (goal: Goal) => Promise<void>;
  updateGoal: (id: string, changes: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addProject: (project: Project) => Promise<void>;
  updateProject: (id: string, changes: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  updateMemory: (id: string, changes: Partial<MemoryItem>) => void;
  toggleMemoryBlock: (id: string) => void;
  addMemory: (memory: MemoryItem) => void;
  deleteMemory: (id: string) => void;
  addAutomation: (automation: Automation) => Promise<void>;
  updateAutomation: (id: string, changes: Partial<Automation>) => Promise<void>;
  deleteAutomation: (id: string) => Promise<void>;
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
  toggleAgent: async (id) => {
    const agent = get().agents.find((item) => item.id === id);
    if (!agent) return;
    const previous = get().agents;
    const changes: Partial<Agent> = { enabled: !agent.enabled, status: agent.enabled ? "paused" : "active" };
    set((state) => ({ agents: state.agents.map((item) => item.id === id ? { ...item, ...changes } : item) }));
    try { await workspaceService.patch("agents", id, changes); } catch (error) { set({ agents: previous, dataError: getErrorMessage(error) }); throw error; }
  },
  resolveApproval: (id, status) => {
    const changes: Partial<ApprovalRequest> = { status };
    set((state) => ({ approvals: state.approvals.map((item) => item.id === id ? { ...item, ...changes } : item) }));
    void workspaceService.patch("approvals", id, changes).catch((error) => set({ dataError: getErrorMessage(error) }));
  },
  addGoal: async (goal) => {
    set((state) => ({ goals: [goal, ...state.goals] }));
    try { await workspaceService.create("goals", goal); } catch (error) { set((state) => ({ goals: state.goals.filter((item) => item.id !== goal.id), dataError: getErrorMessage(error) })); throw error; }
  },
  updateGoal: async (id, changes) => {
    const previous = get().goals;
    set((state) => ({ goals: state.goals.map((item) => item.id === id ? { ...item, ...changes } : item) }));
    try { await workspaceService.patch("goals", id, changes); } catch (error) { set({ goals: previous, dataError: getErrorMessage(error) }); throw error; }
  },
  deleteGoal: async (id) => {
    const previousGoals = get().goals;
    const previousProjects = get().projects;
    const affectedProjects = previousProjects.filter((project) => project.goalIds.includes(id));
    set((state) => ({ goals: state.goals.filter((item) => item.id !== id), projects: state.projects.map((project) => ({ ...project, goalIds: project.goalIds.filter((goalId) => goalId !== id) })) }));
    try {
      await Promise.all([
        workspaceService.delete("goals", id),
        ...affectedProjects.map((project) => workspaceService.patch("projects", project.id, { goalIds: project.goalIds.filter((goalId) => goalId !== id) })),
      ]);
    } catch (error) { set({ goals: previousGoals, projects: previousProjects, dataError: getErrorMessage(error) }); throw error; }
  },
  addProject: async (project) => {
    set((state) => ({ projects: [project, ...state.projects] }));
    try { await workspaceService.create("projects", project); } catch (error) { set((state) => ({ projects: state.projects.filter((item) => item.id !== project.id), dataError: getErrorMessage(error) })); throw error; }
  },
  updateProject: async (id, changes) => {
    const previous = get().projects;
    set((state) => ({ projects: state.projects.map((item) => item.id === id ? { ...item, ...changes } : item) }));
    try { await workspaceService.patch("projects", id, changes); } catch (error) { set({ projects: previous, dataError: getErrorMessage(error) }); throw error; }
  },
  deleteProject: async (id) => {
    const previousProjects = get().projects;
    const previousGoals = get().goals;
    const affectedGoals = previousGoals.filter((goal) => goal.projectId === id);
    set((state) => ({ projects: state.projects.filter((item) => item.id !== id), goals: state.goals.map((goal) => goal.projectId === id ? { ...goal, projectId: "" } : goal) }));
    try {
      await Promise.all([
        workspaceService.delete("projects", id),
        ...affectedGoals.map((goal) => workspaceService.patch("goals", goal.id, { projectId: "" })),
      ]);
    } catch (error) { set({ projects: previousProjects, goals: previousGoals, dataError: getErrorMessage(error) }); throw error; }
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
  addAutomation: async (automation) => {
    set((state) => ({ automations: [automation, ...state.automations] }));
    try { await workspaceService.create("automations", automation); } catch (error) { set((state) => ({ automations: state.automations.filter((item) => item.id !== automation.id), dataError: getErrorMessage(error) })); throw error; }
  },
  updateAutomation: async (id, changes) => {
    const previous = get().automations;
    set((state) => ({ automations: state.automations.map((item) => item.id === id ? { ...item, ...changes } : item) }));
    try { await workspaceService.patch("automations", id, changes); } catch (error) { set({ automations: previous, dataError: getErrorMessage(error) }); throw error; }
  },
  deleteAutomation: async (id) => {
    const previous = get().automations;
    set((state) => ({ automations: state.automations.filter((item) => item.id !== id) }));
    try { await workspaceService.delete("automations", id); } catch (error) { set({ automations: previous, dataError: getErrorMessage(error) }); throw error; }
  },
  addMission: (mission) => set((state) => ({ missions: [mission, ...state.missions.filter((item) => item.id !== mission.id)] })),
}));
