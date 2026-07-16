export type Status = "active" | "paused" | "completed" | "pending" | "error" | "offline";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Priority = "low" | "medium" | "high";
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;
export type AccessLevel = "viewer" | "operator" | "admin";
export type AccountStatus = "active" | "suspended";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid";
export type FeatureKey = "assistant" | "goals" | "memory" | "agents" | "connectors" | "automations" | "multi_agent" | "team_admin";
export type AgentToolName = "send_email" | "create_email_draft" | "organize_email" | "create_calendar_event" | "create_drive_file";
export type AccentColor = "indigo" | "cyan" | "violet" | "emerald" | "rose";
export type InterfaceDensity = "comfortable" | "compact";

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
  preferences: AccountPreferences;
}

export interface AccountPreferences {
  theme: "dark" | "light" | "system";
  accentColor: AccentColor;
  density: InterfaceDensity;
  reducedMotion: boolean;
  landingPage: "/" | "/goals" | "/projects" | "/activity";
  readNotificationIds: string[];
}

export interface SubscriptionPlan {
  id: "free" | "starter" | "pro" | "business";
  name: string;
  description: string;
  monthlyPriceCents: number;
  apiLimit: number;
  dailyApiLimit: number;
  minuteApiLimit: number;
  maxAgents: number;
  features: FeatureKey[];
  highlighted?: boolean;
}

export interface WorkspaceSubscription {
  workspaceId: string;
  planId: SubscriptionPlan["id"];
  planName: string;
  status: SubscriptionStatus;
  apiUsage: number;
  apiLimit: number;
  dailyApiUsage: number;
  dailyApiLimit: number;
  minuteApiLimit: number;
  maxAgents: number;
  usageResetAt: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  onboardingCompleted: boolean;
  managedByStripe: boolean;
  features: FeatureKey[];
  stripeConfigured: boolean;
  stripeConfiguredPlans: SubscriptionPlan["id"][];
}

export interface BillingInvoice {
  id: string;
  number?: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  createdAt: string;
  periodStart?: string;
  periodEnd?: string;
  hostedInvoiceUrl?: string;
  invoicePdfUrl?: string;
}

export interface BillingOverview {
  plans: SubscriptionPlan[];
  subscription: WorkspaceSubscription;
  invoices: BillingInvoice[];
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
  approval?: ApprovalRequest;
}

export interface WorkItemAgentRun {
  id: string;
  agentId: string;
  agentName: string;
  instruction: string;
  result: string;
  confidence: number;
  model: string;
  status: "completed" | "approval";
  createdAt: string;
  approvalId?: string;
}

export interface WorkItemExecution extends AgentExecution {
  entityType: "goal" | "project";
  entityId: string;
  run: WorkItemAgentRun;
}

export interface SendEmailToolCall {
  tool: "send_email";
  arguments: { to: string; subject: string; body: string };
}

export interface CreateEmailDraftToolCall {
  tool: "create_email_draft";
  arguments: { to: string; subject: string; body: string };
}

export interface OrganizeEmailToolCall {
  tool: "organize_email";
  arguments: {
    messageIds: string[];
    action: "archive" | "mark_read" | "mark_unread" | "star" | "unstar" | "label";
    labelName?: string;
  };
}

export interface CreateCalendarEventToolCall {
  tool: "create_calendar_event";
  arguments: { title: string; description?: string; startAt: string; endAt: string; attendees: string[]; timeZone: string };
}

export interface CreateDriveFileToolCall {
  tool: "create_drive_file";
  arguments: { name: string; content: string; mimeType: "text/plain" | "text/markdown" };
}

export type AgentToolCall = SendEmailToolCall | CreateEmailDraftToolCall | OrganizeEmailToolCall | CreateCalendarEventToolCall | CreateDriveFileToolCall;

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  category: "approval" | "error" | "success" | "quota";
  createdAt: string;
  href: string;
  read: boolean;
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
  agentRuns?: WorkItemAgentRun[];
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
  agentRuns?: WorkItemAgentRun[];
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
  agentId?: string;
  instruction?: string;
  preferredTool?: AgentToolName | "auto";
  lastResult?: string;
  lastConfidence?: number;
  lastStatus?: "completed" | "approval" | "error";
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
  toolCall?: AgentToolCall;
  executedAt?: string;
  executionResult?: string;
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

export interface MissionAgentResult {
  agentId: string;
  agentName: string;
  instruction: string;
  result: string;
  confidence: number;
  status: "completed" | "approval" | "error";
  approvalId?: string;
}

export interface MultiAgentMission {
  id: string;
  title: string;
  objective: string;
  summary: string;
  status: "active" | "completed" | "error";
  progress: number;
  autonomyLevel: AutonomyLevel;
  agentIds: string[];
  plan: Array<{ agentId: string; instruction: string }>;
  results: MissionAgentResult[];
  finalResult?: string;
  approvalIds: string[];
  createdAt: string;
  completedAt?: string;
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
  missions: MultiAgentMission[];
}

export interface MissionExecution {
  mission: MultiAgentMission;
  model: string;
}

export interface AutomationExecution {
  result: string;
  confidence: number;
  model: string;
  activity: ActivityEvent;
  automation: Automation;
  approval?: ApprovalRequest;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant" | "system";
  type: "text" | "plan" | "approval" | "tool" | "error" | "warning" | "progress" | "automation";
  content: string;
  timestamp: string;
  actions?: string[];
}
