export type Status = "active" | "paused" | "completed" | "pending" | "error" | "offline";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Priority = "low" | "medium" | "high";
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;
export type AccessLevel = "viewer" | "operator" | "admin";
export type AccountStatus = "active" | "suspended";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  preferredTheme: "dark" | "light" | "system";
}

export interface AccountProfile {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string;
  phone: string;
  timezone: string;
  accessLevel: AccessLevel;
  status: AccountStatus;
  workspaceId: string;
  workspaceName: string;
}

export interface WorkspaceSettings {
  locale: "fr" | "en";
  compactMode: boolean;
  enabledModelIds: string[];
  defaultModelId: string;
  defaultAutonomy: AutonomyLevel;
  telemetryEnabled: boolean;
  allowMemoryLearning: boolean;
  memoryEnabled: boolean;
  memoryApprovalRequired: boolean;
  auditLogging: boolean;
  sessionTimeoutMinutes: number;
  monthlyBudget: number;
  budgetAlertPercent: number;
  blockOnBudgetLimit: boolean;
  notificationEmail: boolean;
  notificationApprovals: boolean;
  notificationErrors: boolean;
  weeklyDigest: boolean;
  dataRetentionDays: number;
  exportFormat: "json" | "csv";
}

export interface AIModel {
  id: string;
  name: string;
  provider: "OpenAI" | "Anthropic" | "Google" | "Local";
  contextWindow: string;
  enabled: boolean;
}

export interface Permission {
  resource: string;
  actions: Array<"read" | "create" | "update" | "delete" | "send" | "publish" | "purchase" | "schedule">;
  requiresApproval: boolean;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: Status;
  enabled: boolean;
  permissions: Permission[];
  tasksCompleted: number;
  successRate: number;
  model: string;
  estimatedCost: number;
  lastActivity: string;
  tools: string[];
  color: string;
  icon: string;
}

export interface AgentExecution {
  result: string;
  confidence: number;
  model: string;
  activity: ActivityEvent;
}

export interface GoalAnalysis {
  summary: string;
  confidence: number;
  dueDate: string | null;
  agentIds: string[];
  steps: string[];
  model: string;
}

export interface Task {
  id: string;
  title: string;
  status: Status;
  assignee: string;
  dueDate: string;
  confidence: number;
  dependencies?: string[];
}

export interface GoalStep {
  id: string;
  title: string;
  description: string;
  status: Status;
  dueDate: string;
  agentIds: string[];
  toolIds: string[];
  risk: RiskLevel;
  confidence: number;
  tasks: Task[];
  dependencies?: string[];
}

export interface Decision {
  id: string;
  title: string;
  rationale: string;
  confidence: number;
  agent: string;
  model: string;
  date: string;
  reversible: boolean;
}

export interface Goal {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  progress: number;
  createdAt: string;
  dueDate: string;
  autonomyLevel: AutonomyLevel;
  agentIds: string[];
  steps: GoalStep[];
  decisions: Decision[];
}

export interface Project {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  progress: number;
  dueDate: string;
  goalIds: string[];
  agentIds: string[];
  documentCount: number;
  nextAction: string;
  members: string[];
}

export interface MemoryItem {
  id: string;
  type: "fact" | "project" | "person" | "decision" | "document" | "habit" | "relation";
  title: string;
  content: string;
  source: string;
  createdAt: string;
  confidence: number;
  relations: string[];
  blocked: boolean;
}

export interface AutomationNode {
  id: string;
  type: "trigger" | "condition" | "agent" | "action" | "approval" | "result";
  label: string;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  status: Status | "suggested";
  trigger: string;
  conditions: string[];
  actions: string[];
  tools: string[];
  autonomyLevel: AutonomyLevel;
  lastRun?: string;
  nextRun?: string;
  successRate: number;
  runCount?: number;
  nodes: AutomationNode[];
}

export interface Connection {
  id: string;
  name: string;
  description: string;
  status: "connected" | "disconnected" | "attention";
  permissions: string[];
  icon: string;
  category: "productivity" | "communication" | "development" | "custom";
}

export interface ApprovalRequest {
  id: string;
  action: string;
  context: string;
  agent: string;
  impact: string;
  risk: RiskLevel;
  confidence: number;
  explanation: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  dataUsed: string[];
  model: string;
}

export interface ToolExecution {
  id: string;
  tool: string;
  input: string;
  output?: string;
  duration: number;
  status: Status;
}

export interface ActivityEvent {
  id: string;
  agent: string;
  action: string;
  status: Status | "approval";
  duration: number;
  confidence: number;
  timestamp: string;
  details: string;
  tool?: string;
}

export interface WorkspaceData {
  goals: Goal[];
  projects: Project[];
  agents: Agent[];
  memories: MemoryItem[];
  automations: Automation[];
  approvals: ApprovalRequest[];
  connections: Connection[];
  activities: ActivityEvent[];
}

export interface AutomationExecution {
  result: string;
  confidence: number;
  model: string;
  activity: ActivityEvent;
  automation: Automation;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant" | "system";
  type: "text" | "plan" | "approval" | "tool" | "error" | "warning" | "progress" | "automation";
  content: string;
  timestamp: string;
  actions?: string[];
}
