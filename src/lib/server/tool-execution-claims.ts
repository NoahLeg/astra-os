import "server-only";

import { randomUUID } from "node:crypto";
import { getLocalDatabase, getWorkspaceIdForUser, isSupabaseDatabaseEnabled, serverDatabaseRequest } from "@/lib/server/database";
import type { AgentToolName } from "@/types";

interface ClaimRow {
  id: string;
  approval_id: string;
  tool: AgentToolName;
  status: "running" | "completed" | "failed";
  response?: Record<string, unknown> | string;
  error_message?: string;
}

function ensureLocalSchema() {
  getLocalDatabase().exec(`
    CREATE TABLE IF NOT EXISTS tool_execution_claims (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL UNIQUE,
      tool TEXT NOT NULL,
      status TEXT NOT NULL,
      response TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function parseResponse(value: ClaimRow["response"]) {
  if (!value) return undefined;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return undefined; }
}

export async function getToolExecutionClaim(userId: string, approvalId: string) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) return undefined;
  let existing: ClaimRow | undefined;
  if (isSupabaseDatabaseEnabled()) {
    const rows = await serverDatabaseRequest<ClaimRow[]>(`tool_execution_claims?workspace_id=eq.${encodeURIComponent(workspaceId)}&approval_id=eq.${encodeURIComponent(approvalId)}&select=id,approval_id,tool,status,response,error_message&limit=1`);
    existing = rows[0];
  } else {
    ensureLocalSchema();
    existing = getLocalDatabase().prepare("SELECT id,approval_id,tool,status,response,error_message FROM tool_execution_claims WHERE approval_id=?").get(approvalId) as unknown as ClaimRow | undefined;
  }
  return existing ? { id: existing.id, status: existing.status, response: parseResponse(existing.response), errorMessage: existing.error_message } : undefined;
}

export async function claimToolExecution(userId: string, approvalId: string, tool: AgentToolName) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) throw new Error("Espace de travail introuvable.");
  const id = randomUUID();
  const now = new Date().toISOString();
  if (isSupabaseDatabaseEnabled()) {
    const inserted = await serverDatabaseRequest<ClaimRow[]>("tool_execution_claims?on_conflict=workspace_id,approval_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ id, workspace_id: workspaceId, approval_id: approvalId, tool, status: "running", created_at: now, updated_at: now }),
    });
    if (inserted[0]) return { acquired: true as const, id: inserted[0].id };
    const existing = await getToolExecutionClaim(userId, approvalId);
    if (!existing) throw new Error("Le verrou d'exécution n'a pas pu être créé.");
    return { acquired: false as const, ...existing };
  }

  ensureLocalSchema();
  const result = getLocalDatabase().prepare("INSERT OR IGNORE INTO tool_execution_claims (id,approval_id,tool,status,created_at,updated_at) VALUES (?,?,?,'running',?,?)").run(id, approvalId, tool, now, now);
  if (result.changes > 0) return { acquired: true as const, id };
  const existing = await getToolExecutionClaim(userId, approvalId);
  if (!existing) throw new Error("Le verrou d'exécution n'a pas pu être créé.");
  return { acquired: false as const, ...existing };
}

export async function completeToolExecutionClaim(userId: string, approvalId: string, response: Record<string, unknown>) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) throw new Error("Espace de travail introuvable.");
  const updatedAt = new Date().toISOString();
  if (isSupabaseDatabaseEnabled()) {
    await serverDatabaseRequest(`tool_execution_claims?workspace_id=eq.${encodeURIComponent(workspaceId)}&approval_id=eq.${encodeURIComponent(approvalId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "completed", response, error_message: null, updated_at: updatedAt }),
    });
    return;
  }
  ensureLocalSchema();
  getLocalDatabase().prepare("UPDATE tool_execution_claims SET status='completed',response=?,error_message=NULL,updated_at=? WHERE approval_id=?").run(JSON.stringify(response), updatedAt, approvalId);
}

export async function failToolExecutionClaim(userId: string, approvalId: string, errorMessage: string, retrySafe: boolean) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) return;
  if (isSupabaseDatabaseEnabled()) {
    if (retrySafe) {
      await serverDatabaseRequest(`tool_execution_claims?workspace_id=eq.${encodeURIComponent(workspaceId)}&approval_id=eq.${encodeURIComponent(approvalId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    } else {
      await serverDatabaseRequest(`tool_execution_claims?workspace_id=eq.${encodeURIComponent(workspaceId)}&approval_id=eq.${encodeURIComponent(approvalId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "failed", error_message: errorMessage.slice(0, 2_000), updated_at: new Date().toISOString() }) });
    }
    return;
  }
  ensureLocalSchema();
  if (retrySafe) getLocalDatabase().prepare("DELETE FROM tool_execution_claims WHERE approval_id=?").run(approvalId);
  else getLocalDatabase().prepare("UPDATE tool_execution_claims SET status='failed',error_message=?,updated_at=? WHERE approval_id=?").run(errorMessage.slice(0, 2_000), new Date().toISOString(), approvalId);
}
