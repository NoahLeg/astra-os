export type Status = "active" | "paused" | "completed" | "pending" | "error" | "offline";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Priority = "low" | "medium" | "high";
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;
export type AccessLevel = "viewer" | "operator" | "admin";
export type AccountStatus = "active" | "suspended";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid";
export type FeatureKey = "assistant" | "chatbots" | "goals" | "memory" | "agents" | "connectors" | "automations" | "multi_agent" | "team_admin" | "collaboration";
export type AgentToolName =
  | "send_email"
  | "create_email_draft"
  | "organize_email"
  | "smart_organize_gmail"
  | "create_calendar_event"
  | "create_drive_file"
  | "create_google_doc"
  | "create_google_sheet"
  | "create_google_slides"
  | "find_google_contacts"
  | "create_google_task";
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
  id: string;
  name: string;
  description: string;
  monthlyPriceCents: number;
  monthlyTokenLimit: number;
  dailyTokenLimit: number;
  minuteRequestLimit: number;
  maxAgents: number;
  maxMembers: number;
  annualPriceCents?: number;
  currency?: string;
  maxAutomations?: number;
  storageLimitMb?: number;
  contextLimitTokens?: number;
  maxModels?: number;
  premiumModels?: boolean;
  connectorsEnabled?: boolean;
  toolsEnabled?: boolean;
  badges?: string[];
  includedFeatures?: string[];
  exclusiveFeatures?: string[];
  limits?: Record<string, number>;
  sortOrder?: number;
  active?: boolean;
  stripeMonthlyPriceId?: string;
  stripeAnnualPriceId?: string;
  features: FeatureKey[];
  highlighted?: boolean;
  quoteOnly?: boolean;
}

export interface WorkspaceSubscription {
  workspaceId: string;
  planId: SubscriptionPlan["id"];
  planName: string;
  status: SubscriptionStatus;
  inputTokensUsed: number;
  cachedInputTokensUsed: number;
  outputTokensUsed: number;
  totalTokensUsed: number;
  monthlyTokenLimit: number;
  dailyTokensUsed: number;
  dailyTokenLimit: number;
  minuteRequestLimit: number;
  totalCostNanoUsd: number;
  maxAgents: number;
  maxAutomations: number;
  maxModels: number;
  storageLimitMb: number;
  contextLimitTokens: number;
  premiumModels: boolean;
  connectorsEnabled: boolean;
  toolsEnabled: boolean;
  memberCount: number;
  maxMembers: number;
  usageResetAt: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  onboardingCompleted: boolean;
  managedByStripe: boolean;
  features: FeatureKey[];
  quoteOnly: boolean;
  stripeConfigured: boolean;
  stripeConfiguredPlans: SubscriptionPlan["id"][];
}

export type EnterpriseQuoteStatus = "pending" | "contacted" | "approved" | "declined";

export interface EnterpriseQuoteRequest {
  id: string;
  workspaceId: string;
  requestedBy: string;
  contactName: string;
  contactEmail: string;
  companyName: string;
  seatCount: number;
  estimatedMonthlyTokens: number;
  message?: string;
  status: EnterpriseQuoteStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  email: string;
  fullName: string;
  role: string;
  accessLevel: AccessLevel;
  status: AccountStatus;
  joinedAt: string;
  isOwner: boolean;
}

export interface TeamOverview {
  members: TeamMember[];
  memberCount: number;
  maxMembers: number;
  planId: SubscriptionPlan["id"];
}

export type TaskEntityType = "goal";

export interface TaskCollaborationComment {
  id: string;
  authorId?: string;
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCollaborationOverview {
  entityType: TaskEntityType;
  entityId: string;
  taskId: string;
  taskTitle: string;
  collaborators: TeamMember[];
  availableMembers: TeamMember[];
  comments: TaskCollaborationComment[];
  updatedAt: string;
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
  usage: AIUsageSummary;
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
  usage?: AIUsageEvent;
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

export interface SmartGmailOperation {
  messageIds: string[];
  category: "invoice" | "order" | "bank" | "social" | "github" | "newsletter" | "work" | "personal" | "promotion" | "spam" | "other";
  labelPath: string;
  archive: boolean;
  markRead: boolean;
  markImportant: boolean;
  spam: boolean;
  trash: boolean;
  reason: string;
  confidence: number;
}

export interface SmartOrganizeGmailToolCall {
  tool: "smart_organize_gmail";
  arguments: {
    operations: SmartGmailOperation[];
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

export interface CreateGoogleDocToolCall {
  tool: "create_google_doc";
  arguments: { title: string; content: string };
}

export interface CreateGoogleSheetToolCall {
  tool: "create_google_sheet";
  arguments: { title: string; headers: string[]; rows: string[][] };
}

export interface CreateGoogleSlidesToolCall {
  tool: "create_google_slides";
  arguments: { title: string; slides: Array<{ title: string; body?: string }> };
}

export interface FindGoogleContactsToolCall {
  tool: "find_google_contacts";
  arguments: { query: string; maximumResults?: number };
}

export interface CreateGoogleTaskToolCall {
  tool: "create_google_task";
  arguments: { title: string; notes?: string; dueAt?: string };
}

export type AgentToolCall =
  | SendEmailToolCall
  | CreateEmailDraftToolCall
  | OrganizeEmailToolCall
  | SmartOrganizeGmailToolCall
  | CreateCalendarEventToolCall
  | CreateDriveFileToolCall
  | CreateGoogleDocToolCall
  | CreateGoogleSheetToolCall
  | CreateGoogleSlidesToolCall
  | FindGoogleContactsToolCall
  | CreateGoogleTaskToolCall;

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  category: "approval" | "error" | "success" | "quota" | "collaboration";
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
  config?: Record<string, string | number | boolean | string[]>;
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
  lastStatus?: "completed" | "approval" | "error" | "cancelled";
  schedule?: string;
  timeZone?: string;
  retryPolicy?: { maximumAttempts: number; backoffSeconds: number };
}

export type AutomationRunStatus = "pending" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";

export interface AutomationRunStep {
  id: string;
  nodeId: string;
  nodeType: AutomationNode["type"];
  position: number;
  status: AutomationRunStatus | "skipped";
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  triggerType: "manual" | "schedule" | "webhook";
  status: AutomationRunStatus;
  attempt: number;
  result?: string;
  errorCode?: string;
  errorMessage?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostNanoUsd: number;
  approvalId?: string;
  actionNodeId?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  steps: AutomationRunStep[];
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
  automationId?: string;
  automationRunId?: string;
  automationNodeId?: string;
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
  run: AutomationRun;
  usage?: AIUsageEvent;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant" | "system";
  type: "text" | "plan" | "approval" | "tool" | "error" | "warning" | "progress" | "automation";
  content: string;
  timestamp: string;
  actions?: string[];
  usage?: AIUsageEvent;
}

export interface AIUsageEvent {
  id: string;
  feature: FeatureKey;
  provider: string;
  model: string;
  providerRequestId?: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  inputCostNanoUsd?: number;
  cachedInputCostNanoUsd?: number;
  outputCostNanoUsd?: number;
  totalCostNanoUsd?: number;
  pricingStatus: "exact" | "unpriced";
  createdAt: string;
}

export interface AIUsageSummary {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostNanoUsd: number;
  unpricedRequestCount: number;
  requests: AIUsageEvent[];
  byModel: Array<{ model: string; inputTokens: number; outputTokens: number; totalTokens: number; totalCostNanoUsd: number; requestCount: number }>;
}

export interface ChatbotKnowledge {
  id: string;
  chatbotId: string;
  title: string;
  content: string;
  source: string;
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotConversation {
  id: string;
  chatbotId: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotCitation {
  url: string;
  title: string;
}

export interface ContextFile {
  id: string;
  chatbotId?: string;
  scope: "workspace" | "chatbot";
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: "active" | "blocked";
  createdAt: string;
}

export interface ChatbotMessage {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant";
  content: string;
  status: "pending" | "completed" | "failed";
  errorMessage?: string;
  usageEventId?: string;
  citations?: ChatbotCitation[];
  createdAt: string;
  usage?: AIUsageEvent;
}

export interface Chatbot {
  id: string;
  name: string;
  slug: string;
  description: string;
  provider: string;
  model: string;
  systemPrompt: string;
  memoryEnabled: boolean;
  learningEnabled: boolean;
  globalLearningEnabled: boolean;
  webEnabled: boolean;
  isSystem: boolean;
  status: "active" | "paused";
  createdAt: string;
  updatedAt: string;
  knowledge?: ChatbotKnowledge[];
  conversations?: ChatbotConversation[];
}
