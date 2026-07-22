import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildMemoryContext, createToolApproval, generateAgentTask } from "@/lib/server/agent-runtime";
import { agentToolCatalog, executeAgentToolCall, getAvailableAgentTools } from "@/lib/server/agent-tools";
import { enforceAgentQuota, getWorkspaceSubscription } from "@/lib/server/billing";
import { ensureLocalDatabaseColumn, getLocalDatabase, getWorkspaceConfiguration, getWorkspaceData, getWorkspaceIdForUser, isSupabaseDatabaseEnabled, patchWorkspaceRecord, saveWorkspaceRecord, serverDatabaseRequest } from "@/lib/server/database";
import { getOpenAIConfiguration, OpenAIRequestError } from "@/lib/server/openai";
import type { ActivityEvent, AIUsageEvent, ApprovalRequest, Automation, AutomationRun, AutomationRunStep } from "@/types";

const automationSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().min(2).max(160), description: z.string().max(2_000), status: z.literal("active"),
  trigger: z.string().min(1).max(500), conditions: z.array(z.string().max(500)).max(20), actions: z.array(z.string().max(1_000)).max(20),
  tools: z.array(z.string().max(100)).max(30).default([]), successRate: z.number().min(0).max(100).default(0),
  autonomyLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), nodes: z.array(z.object({ id: z.string().min(1).max(100), type: z.enum(["trigger", "condition", "agent", "action", "approval", "result"]), label: z.string().min(1).max(500), config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional() })).min(2).max(30),
  agentId: z.string().max(80).optional(), instruction: z.string().max(12_000).optional(), preferredTool: z.enum(["auto", "send_email", "create_email_draft", "organize_email", "smart_organize_gmail", "create_calendar_event", "create_drive_file"]).optional(),
  retryPolicy: z.object({ maximumAttempts: z.number().int().min(1).max(5), backoffSeconds: z.number().int().min(0).max(30) }).optional(),
}).passthrough().superRefine((automation, context) => {
  const nodeIds = new Set(automation.nodes.map((node) => node.id));
  if (nodeIds.size !== automation.nodes.length) context.addIssue({ code: "custom", path: ["nodes"], message: "Les identifiants de blocs doivent être uniques." });
  for (const requiredType of ["trigger", "agent", "action", "result"] as const) {
    if (!automation.nodes.some((node) => node.type === requiredType)) context.addIssue({ code: "custom", path: ["nodes"], message: `Le workflow doit contenir un bloc ${requiredType}.` });
    if (automation.nodes.filter((node) => node.type === requiredType).length > 1) context.addIssue({ code: "custom", path: ["nodes"], message: `Le workflow ne peut contenir qu’un bloc ${requiredType}.` });
  }
  if (automation.nodes.filter((node) => node.type === "agent").length !== 1) context.addIssue({ code: "custom", path: ["nodes"], message: "Une automatisation doit avoir exactement un agent d'exécution." });
  if (automation.nodes.filter((node) => node.type === "approval").length > 1) context.addIssue({ code: "custom", path: ["nodes"], message: "Un seul bloc de validation humaine est autorisé." });
  const positions = Object.fromEntries(automation.nodes.map((node, index) => [node.type, index]));
  if (!(positions.trigger < positions.agent && positions.agent < positions.action && positions.action < positions.result)) context.addIssue({ code: "custom", path: ["nodes"], message: "L’ordre requis est déclencheur, agent, action, résultat." });
});

interface RunRow { id: string; automation_id: string; trigger_type: AutomationRun["triggerType"]; status: AutomationRun["status"]; attempt: number; output?: { result?: string } | string; error_code?: string; error_message?: string; input_tokens: number | string; output_tokens: number | string; total_tokens: number | string; total_cost_nano_usd: number | string; approval_id?: string; action_node_id?: string; started_at?: string; completed_at?: string; created_at: string; }
interface StepRow { id: string; node_id: string; node_type: AutomationRunStep["nodeType"]; position: number; status: AutomationRunStep["status"]; output?: Record<string, unknown> | string; error_code?: string; error_message?: string; started_at?: string; completed_at?: string; }

function ensureLocalSchema() { getLocalDatabase().exec(`
  CREATE TABLE IF NOT EXISTS automation_runs (id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, initiated_by TEXT, trigger_type TEXT NOT NULL, idempotency_key TEXT NOT NULL, status TEXT NOT NULL, attempt INTEGER NOT NULL, input TEXT NOT NULL, output TEXT, error_code TEXT, error_message TEXT, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, total_tokens INTEGER NOT NULL DEFAULT 0, total_cost_nano_usd INTEGER NOT NULL DEFAULT 0, approval_id TEXT, action_node_id TEXT, started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(automation_id,idempotency_key));
  CREATE TABLE IF NOT EXISTS automation_run_steps (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, node_id TEXT NOT NULL, node_type TEXT NOT NULL, position INTEGER NOT NULL, status TEXT NOT NULL, input TEXT NOT NULL, output TEXT, error_code TEXT, error_message TEXT, started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(run_id,node_id));
  CREATE INDEX IF NOT EXISTS automation_runs_automation_idx ON automation_runs(automation_id,created_at DESC);
  CREATE INDEX IF NOT EXISTS automation_steps_run_idx ON automation_run_steps(run_id,position);
`); ensureLocalDatabaseColumn("automation_runs", "total_cost_nano_usd", "INTEGER NOT NULL DEFAULT 0"); ensureLocalDatabaseColumn("automation_runs", "approval_id", "TEXT"); ensureLocalDatabaseColumn("automation_runs", "action_node_id", "TEXT"); }

function mapStep(row: StepRow): AutomationRunStep { const output = typeof row.output === "string" ? JSON.parse(row.output || "null") as Record<string, unknown> | null : row.output; return { id: row.id, nodeId: row.node_id, nodeType: row.node_type, position: row.position, status: row.status, output: output ?? undefined, errorCode: row.error_code, errorMessage: row.error_message, startedAt: row.started_at, completedAt: row.completed_at }; }
async function getSteps(runId: string, workspaceId?: string) { if (isSupabaseDatabaseEnabled()) return (await serverDatabaseRequest<StepRow[]>(`automation_run_steps?workspace_id=eq.${encodeURIComponent(workspaceId!)}&run_id=eq.${encodeURIComponent(runId)}&select=id,node_id,node_type,position,status,output,error_code,error_message,started_at,completed_at&order=position.asc`)).map(mapStep); ensureLocalSchema(); return (getLocalDatabase().prepare("SELECT id,node_id,node_type,position,status,output,error_code,error_message,started_at,completed_at FROM automation_run_steps WHERE run_id=? ORDER BY position").all(runId) as unknown as StepRow[]).map(mapStep); }
async function mapRun(row: RunRow, workspaceId?: string): Promise<AutomationRun> { const output = typeof row.output === "string" ? JSON.parse(row.output || "null") as { result?: string } | null : row.output; return { id: row.id, automationId: row.automation_id, triggerType: row.trigger_type, status: row.status, attempt: row.attempt, result: output?.result, errorCode: row.error_code, errorMessage: row.error_message, inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens), totalTokens: Number(row.total_tokens), totalCostNanoUsd: Number(row.total_cost_nano_usd), approvalId: row.approval_id, actionNodeId: row.action_node_id, startedAt: row.started_at, completedAt: row.completed_at, createdAt: row.created_at, steps: await getSteps(row.id, workspaceId) }; }

async function createRun(input: { workspaceId: string; automation: Automation; userId: string; triggerType: AutomationRun["triggerType"]; idempotencyKey: string }) {
  const id = randomUUID(); const now = new Date().toISOString();
  if (isSupabaseDatabaseEnabled()) {
    const rows = await serverDatabaseRequest<RunRow[]>("automation_runs?on_conflict=workspace_id,automation_id,idempotency_key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ id, workspace_id: input.workspaceId, automation_id: input.automation.id, initiated_by: input.userId, trigger_type: input.triggerType, idempotency_key: input.idempotencyKey, status: "pending", input: { automationName: input.automation.name }, created_at: now, updated_at: now }) });
    if (rows[0]) return { row: rows[0], created: true };
    const existing = await serverDatabaseRequest<RunRow[]>(`automation_runs?workspace_id=eq.${encodeURIComponent(input.workspaceId)}&automation_id=eq.${encodeURIComponent(input.automation.id)}&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&select=*&limit=1`); if (!existing[0]) throw new Error("L'exécution n'a pas pu être créée."); return { row: existing[0], created: false };
  }
  ensureLocalSchema(); const result = getLocalDatabase().prepare("INSERT OR IGNORE INTO automation_runs (id,automation_id,initiated_by,trigger_type,idempotency_key,status,attempt,input,created_at,updated_at) VALUES (?,?,?,?,?,'pending',1,?,?,?)").run(id,input.automation.id,input.userId,input.triggerType,input.idempotencyKey,JSON.stringify({ automationName: input.automation.name }),now,now); const row = getLocalDatabase().prepare("SELECT * FROM automation_runs WHERE automation_id=? AND idempotency_key=?").get(input.automation.id,input.idempotencyKey) as unknown as RunRow; return { row, created: result.changes > 0 };
}

async function createSteps(workspaceId: string, runId: string, nodes: Automation["nodes"]) { const now = new Date().toISOString(); const rows = nodes.map((node, position) => ({ id: randomUUID(), workspace_id: workspaceId, run_id: runId, node_id: node.id, node_type: node.type, position, status: "pending", input: node.config ?? {}, created_at: now, updated_at: now })); if (isSupabaseDatabaseEnabled()) { await serverDatabaseRequest("automation_run_steps?on_conflict=run_id,node_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(rows) }); return; } ensureLocalSchema(); const statement = getLocalDatabase().prepare("INSERT OR IGNORE INTO automation_run_steps (id,run_id,node_id,node_type,position,status,input,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?,?)"); for (const row of rows) statement.run(row.id,runId,row.node_id,row.node_type,row.position,JSON.stringify(row.input),now,now); }
async function patchRun(workspaceId: string, runId: string, changes: Record<string, unknown>) { const updated_at = new Date().toISOString(); if (isSupabaseDatabaseEnabled()) { await serverDatabaseRequest(`automation_runs?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(runId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...changes, updated_at }) }); return; } ensureLocalSchema(); const current = getLocalDatabase().prepare("SELECT * FROM automation_runs WHERE id=?").get(runId) as Record<string, unknown>; const next: Record<string, unknown> = { ...current, ...changes, updated_at }; getLocalDatabase().prepare("UPDATE automation_runs SET status=?,attempt=?,output=?,error_code=?,error_message=?,input_tokens=?,output_tokens=?,total_tokens=?,total_cost_nano_usd=?,approval_id=?,action_node_id=?,started_at=?,completed_at=?,updated_at=? WHERE id=?").run(next.status,next.attempt,typeof next.output === "string" ? next.output : JSON.stringify(next.output ?? null),next.error_code ?? null,next.error_message ?? null,next.input_tokens ?? 0,next.output_tokens ?? 0,next.total_tokens ?? 0,next.total_cost_nano_usd ?? 0,next.approval_id ?? null,next.action_node_id ?? null,next.started_at ?? null,next.completed_at ?? null,updated_at,runId); }
async function patchStep(workspaceId: string, runId: string, nodeId: string, changes: Record<string, unknown>) { const updated_at = new Date().toISOString(); if (isSupabaseDatabaseEnabled()) { await serverDatabaseRequest(`automation_run_steps?workspace_id=eq.${encodeURIComponent(workspaceId)}&run_id=eq.${encodeURIComponent(runId)}&node_id=eq.${encodeURIComponent(nodeId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...changes, updated_at }) }); return; } ensureLocalSchema(); const current = getLocalDatabase().prepare("SELECT * FROM automation_run_steps WHERE run_id=? AND node_id=?").get(runId,nodeId) as Record<string, unknown>; const next: Record<string, unknown> = { ...current, ...changes }; getLocalDatabase().prepare("UPDATE automation_run_steps SET status=?,output=?,error_code=?,error_message=?,started_at=?,completed_at=?,updated_at=? WHERE run_id=? AND node_id=?").run(next.status,typeof next.output === "string" ? next.output : JSON.stringify(next.output ?? null),next.error_code ?? null,next.error_message ?? null,next.started_at ?? null,next.completed_at ?? null,updated_at,runId,nodeId); }
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function nextSchedule(automation: Automation) { const current = new Date(); if (automation.schedule === "hourly") current.setUTCHours(current.getUTCHours() + 1); else if (automation.schedule === "weekly") current.setUTCDate(current.getUTCDate() + 7); else if (automation.schedule === "daily") current.setUTCDate(current.getUTCDate() + 1); else return undefined; return current.toISOString(); }

export async function executeAutomation(input: { userId: string; automationId: string; triggerType?: AutomationRun["triggerType"]; idempotencyKey?: string }) {
  const startedAt = Date.now(); const triggerType = input.triggerType ?? "manual"; const workspaceId = await getWorkspaceIdForUser(input.userId); if (!workspaceId) throw new Error("Espace de travail introuvable.");
  const [workspace, settings, subscription] = await Promise.all([getWorkspaceData(input.userId), getWorkspaceConfiguration(input.userId), getWorkspaceSubscription(input.userId)]); enforceAgentQuota(subscription, workspace.agents);
  const rawAutomation = workspace.automations.find((item) => item.id === input.automationId); if (!rawAutomation) throw new Error("Automatisation introuvable."); const automation = automationSchema.parse(rawAutomation) as Automation;
  const executor = workspace.agents.find((agent) => agent.id === automation.agentId) ?? workspace.agents.find((agent) => agent.id === "coordinateur"); if (!executor?.enabled) throw new Error("L'agent d'exécution doit être actif.");
  const tools = getAvailableAgentTools(executor, workspace.connections); if (automation.preferredTool && automation.preferredTool !== "auto" && !tools.includes(automation.preferredTool)) throw new Error(`L'outil ${automation.preferredTool} n'est pas autorisé ou son connecteur est déconnecté.`);
  const key = input.idempotencyKey ?? `${triggerType}:${randomUUID()}`; const createdRun = await createRun({ workspaceId, automation, userId: input.userId, triggerType, idempotencyKey: key }); if (!createdRun.created) return mapRun(createdRun.row, workspaceId);
  await createSteps(workspaceId, createdRun.row.id, automation.nodes); const startedAtIso = new Date().toISOString(); await patchRun(workspaceId, createdRun.row.id, { status: "running", started_at: startedAtIso });
  let resultText = ""; let approval: ApprovalRequest | undefined; let executionSummary: string | undefined; let usage: AIUsageEvent | undefined; let attempts = 0; let shouldExecute = true; let conditionReason = ""; let currentNodeId: string | undefined;
  try {
    for (const node of automation.nodes) {
      currentNodeId = node.id;
      await patchStep(workspaceId, createdRun.row.id, node.id, { status: "running", started_at: new Date().toISOString() });
      if (node.type === "agent") {
        const configuration = await getOpenAIConfiguration(input.userId); const maximumAttempts = automation.retryPolicy?.maximumAttempts ?? 3;
        while (attempts < maximumAttempts) { attempts += 1; try { const task = await generateAgentTask({ userId: input.userId, agent: executor, instruction: automation.instruction || automation.actions.join(" ; ") || automation.description, conditions: automation.conditions, preferredTool: automation.preferredTool, workspace, memoryContext: buildMemoryContext(workspace, Boolean(settings?.settings.memoryEnabled), automation.instruction || automation.description, 15), configuration, feature: "automations" }); resultText = task.result; usage = task.usage; shouldExecute = task.shouldExecute; conditionReason = task.conditionReason ?? ""; if (shouldExecute && automation.preferredTool && automation.preferredTool !== "auto" && task.toolCall?.tool !== automation.preferredTool) throw new Error(`L'agent n'a pas produit l'outil imposé ${automation.preferredTool}. ${task.toolWarning ?? "Vérifiez la consigne et les permissions."}`); const preparedApproval = shouldExecute ? createToolApproval({ agent: executor, instruction: `Automatisation ${automation.name}`, result: task, model: task.usage?.model ?? configuration.model, contextPrefix: "Automatisation" }) : undefined; approval = preparedApproval ? { ...preparedApproval, automationId: automation.id, automationRunId: createdRun.row.id } : undefined; break; } catch (error) { const retryable = error instanceof OpenAIRequestError ? [429,502,503].includes(error.status) : error instanceof SyntaxError || error instanceof z.ZodError; if (!retryable || attempts >= maximumAttempts) throw error; await pause((automation.retryPolicy?.backoffSeconds ?? 1) * attempts * 1_000); } }
        await patchStep(workspaceId, createdRun.row.id, node.id, { status: "completed", output: { result: resultText, confidence: approval?.confidence, shouldExecute, conditionReason }, completed_at: new Date().toISOString() }); currentNodeId = undefined; continue;
      }
      if (node.type === "action" && approval?.toolCall) {
        const metadata = agentToolCatalog[approval.toolCall.tool]; const sensitive = metadata.risk !== "low" || approval.toolCall.tool === "send_email" || (approval.toolCall.tool === "smart_organize_gmail" && approval.toolCall.arguments.operations.some((operation) => operation.spam || operation.trash)); const mustApprove = sensitive || automation.autonomyLevel < 3 || automation.nodes.some((item) => item.type === "approval");
        if (mustApprove) { approval = { ...approval, automationNodeId: node.id }; await saveWorkspaceRecord("approvals", approval, input.userId); await patchStep(workspaceId, createdRun.row.id, node.id, { status: "waiting_approval", output: { approvalId: approval.id }, completed_at: new Date().toISOString() }); await patchRun(workspaceId, createdRun.row.id, { status: "waiting_approval", approval_id: approval.id, action_node_id: node.id, attempt: attempts, output: { result: resultText, approvalId: approval.id }, input_tokens: usage?.inputTokens ?? 0, output_tokens: usage?.outputTokens ?? 0, total_tokens: usage?.totalTokens ?? 0, total_cost_nano_usd: usage?.totalCostNanoUsd ?? 0 }); currentNodeId = undefined; break; }
        const execution = await executeAgentToolCall(input.userId, approval.toolCall); executionSummary = execution.summary; await patchStep(workspaceId, createdRun.row.id, node.id, { status: "completed", output: execution, completed_at: new Date().toISOString() }); currentNodeId = undefined; continue;
      }
      if (node.type === "action" && shouldExecute && !approval?.toolCall) {
        throw new Error("L'agent n'a proposé aucun outil exécutable pour cette action. Précisez l'action attendue ou activez le connecteur requis.");
      }
      const skipped = !shouldExecute && ["condition", "action", "approval"].includes(node.type) || (["action", "approval"].includes(node.type) && !approval?.toolCall);
      await patchStep(workspaceId, createdRun.row.id, node.id, { status: skipped ? "skipped" : "completed", output: node.type === "condition" ? { shouldExecute, reason: conditionReason } : node.type === "result" ? { result: resultText, executionSummary } : {}, completed_at: new Date().toISOString() }); currentNodeId = undefined;
    }
    const waiting = approval?.toolCall
      ? automation.autonomyLevel < 3 || automation.nodes.some((node) => node.type === "approval") || agentToolCatalog[approval.toolCall.tool].risk !== "low"
      : false;
    const finalStatus = waiting ? "waiting_approval" : "completed"; const completedAt = finalStatus === "completed" ? new Date().toISOString() : undefined;
    await patchRun(workspaceId, createdRun.row.id, { status: finalStatus, attempt: Math.max(1,attempts), output: { result: resultText, executionSummary, approvalId: waiting ? approval?.id : undefined }, input_tokens: usage?.inputTokens ?? 0, output_tokens: usage?.outputTokens ?? 0, total_tokens: usage?.totalTokens ?? 0, total_cost_nano_usd: usage?.totalCostNanoUsd ?? 0, completed_at: completedAt });
    const runCount = (automation.runCount ?? 0) + 1; const completedSuccessRate = Math.round(((automation.successRate * Math.max(0,runCount-1)) + 100) / runCount); const updatedAutomation = { ...automation, runCount, lastRun: new Date().toISOString(), nextRun: nextSchedule(automation), successRate: waiting ? automation.successRate : completedSuccessRate, lastResult: executionSummary ? `${resultText}\n\n${executionSummary}` : resultText, lastConfidence: approval?.confidence ?? 90, lastStatus: waiting ? "approval" as const : "completed" as const };
    const activity: ActivityEvent = { id: randomUUID(), agent: executor.name, action: `Automatisation : ${automation.name}`, status: waiting ? "approval" : "completed", duration: Math.max(1,Math.round((Date.now()-startedAt)/1000)), confidence: approval?.confidence ?? 90, timestamp: new Date().toISOString(), details: updatedAutomation.lastResult || "Exécution terminée", tool: `Automation:${automation.id}` };
    await Promise.all([patchWorkspaceRecord("automations", automation.id, updatedAutomation, input.userId), saveWorkspaceRecord("activities", activity, input.userId)]); return { run: await mapRun({ ...createdRun.row, status: finalStatus, attempt: Math.max(1,attempts), output: { result: resultText }, input_tokens: usage?.inputTokens ?? 0, output_tokens: usage?.outputTokens ?? 0, total_tokens: usage?.totalTokens ?? 0, total_cost_nano_usd: usage?.totalCostNanoUsd ?? 0, approval_id: waiting ? approval?.id : undefined, action_node_id: waiting ? approval?.automationNodeId : undefined, completed_at: completedAt } as RunRow, workspaceId), result: resultText, confidence: approval?.confidence ?? 90, model: usage?.model ?? executor.model, activity, automation: updatedAutomation, approval: waiting ? approval : undefined, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Échec de l'automatisation"; const code = error instanceof z.ZodError ? "INVALID_AUTOMATION" : error instanceof OpenAIRequestError ? `OPENAI_${error.status}` : "EXECUTION_FAILED"; const failedAt = new Date().toISOString();
    if (currentNodeId) await patchStep(workspaceId, createdRun.row.id, currentNodeId, { status: "failed", error_code: code, error_message: message, completed_at: failedAt });
    await patchRun(workspaceId, createdRun.row.id, { status: "failed", attempt: Math.max(1,attempts), error_code: code, error_message: message, completed_at: failedAt });
    const runCount = (automation.runCount ?? 0)+1;
    await Promise.all([
      patchWorkspaceRecord("automations", automation.id, { runCount, lastRun: failedAt, lastStatus: "error", lastResult: message, successRate: Math.round((automation.successRate*Math.max(0,runCount-1))/runCount) }, input.userId),
      saveWorkspaceRecord("activities", { id: randomUUID(), agent: executor.name, action: `Automatisation échouée : ${automation.name}`, status: "error", duration: Math.max(1,Math.round((Date.now()-startedAt)/1000)), confidence: 0, timestamp: failedAt, details: `${code} — ${message}`, tool: `Automation:${automation.id}` } satisfies ActivityEvent, input.userId),
    ]);
    throw error;
  }
}

export async function completeAutomationApproval(input: {
  userId: string;
  approval: ApprovalRequest;
  decision: "approved" | "rejected";
  execution?: { summary: string; details: string; externalId?: string; url?: string };
}) {
  if (!input.approval.automationId || !input.approval.automationRunId) return null;
  const workspaceId = await getWorkspaceIdForUser(input.userId);
  if (!workspaceId) throw new Error("Espace de travail introuvable.");
  const workspace = await getWorkspaceData(input.userId);
  const automation = workspace.automations.find((item) => item.id === input.approval.automationId);
  if (!automation) throw new Error("L'automatisation liée à cette validation n'existe plus.");
  const run = (await listAutomationRuns(input.userId, automation.id)).find((item) => item.id === input.approval.automationRunId);
  if (!run) throw new Error("L'exécution liée à cette validation est introuvable.");
  if (run.status !== "waiting_approval") return run;

  const completedAt = new Date().toISOString();
  const totalRuns = Math.max(1, automation.runCount ?? 1);
  const priorSuccesses = (automation.successRate / 100) * Math.max(0, totalRuns - 1);
  const approved = input.decision === "approved";
  if (approved && input.approval.toolCall && !input.execution) throw new Error("Le résultat de l'outil est requis pour terminer l'automatisation.");
  const executionSummary = input.execution?.summary;
  const result = [run.result, approved ? executionSummary : "Action refusée par un utilisateur."].filter(Boolean).join("\n\n");

  const stepUpdates = automation.nodes.flatMap((node) => {
    if (node.id === input.approval.automationNodeId || node.type === "approval") {
      return [patchStep(workspaceId, run.id, node.id, {
        status: approved ? "completed" : "skipped",
        output: approved ? input.execution : { reason: "Validation refusée" },
        completed_at: completedAt,
      })];
    }
    if (node.type === "result") {
      return [patchStep(workspaceId, run.id, node.id, {
        status: approved ? "completed" : "skipped",
        output: { result, decision: input.decision },
        completed_at: completedAt,
      })];
    }
    return [];
  });

  const status = approved ? "completed" as const : "cancelled" as const;
  const successRate = Math.round(((priorSuccesses + (approved ? 1 : 0)) / totalRuns) * 100);
  const activity: ActivityEvent = {
    id: randomUUID(),
    agent: input.approval.agent,
    action: `${automation.name} — ${approved ? "action autorisée" : "action refusée"}`,
    status: "completed",
    duration: 0,
    confidence: input.approval.confidence,
    timestamp: completedAt,
    details: result,
    tool: `Automation:${automation.id}`,
  };

  await Promise.all([
    ...stepUpdates,
    patchRun(workspaceId, run.id, {
      status,
      output: { result, approvalId: input.approval.id, execution: input.execution, decision: input.decision },
      completed_at: completedAt,
    }),
    patchWorkspaceRecord("automations", automation.id, {
      successRate,
      lastResult: result,
      lastStatus: approved ? "completed" : "cancelled",
      lastRun: completedAt,
    }, input.userId),
    saveWorkspaceRecord("activities", activity, input.userId),
  ]);
  return { ...run, status, result, completedAt } satisfies AutomationRun;
}

export async function listAutomationRuns(userId: string, automationId?: string) { const workspaceId = await getWorkspaceIdForUser(userId); if (!workspaceId) throw new Error("Espace de travail introuvable."); let rows: RunRow[]; if (isSupabaseDatabaseEnabled()) rows = await serverDatabaseRequest<RunRow[]>(`automation_runs?workspace_id=eq.${encodeURIComponent(workspaceId)}${automationId ? `&automation_id=eq.${encodeURIComponent(automationId)}` : ""}&select=*&order=created_at.desc&limit=100`); else { ensureLocalSchema(); rows = (automationId ? getLocalDatabase().prepare("SELECT * FROM automation_runs WHERE automation_id=? ORDER BY created_at DESC LIMIT 100").all(automationId) : getLocalDatabase().prepare("SELECT * FROM automation_runs ORDER BY created_at DESC LIMIT 100").all()) as unknown as RunRow[]; } return Promise.all(rows.map((row) => mapRun(row, workspaceId))); }
