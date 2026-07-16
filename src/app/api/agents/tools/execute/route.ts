import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { agentToolCallSchema, executeAgentToolCall } from "@/lib/server/agent-tools";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { getWorkspaceData, hasWorkspaceAccess, patchWorkspaceRecord, saveWorkspaceRecord } from "@/lib/server/database";
import type { ActivityEvent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ approvalId: z.string().trim().min(1).max(100), confirmed: z.literal(true) });

export async function POST(request: Request) {
  const startedAt = Date.now();
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirmation explicite requise" }, { status: 400 });

  try {
    await Promise.all([
      requireSubscriptionFeature(user.id, "agents"),
      requireSubscriptionFeature(user.id, "connectors"),
    ]);
    const workspace = await getWorkspaceData(user.id);
    const approval = workspace.approvals.find((item) => item.id === parsed.data.approvalId);
    if (!approval) return NextResponse.json({ error: "Validation introuvable" }, { status: 404 });
    if (approval.status !== "pending") return NextResponse.json({ error: "Cette validation a déjà été traitée." }, { status: 409 });
    const toolCall = agentToolCallSchema.parse(approval.toolCall);
    const execution = await executeAgentToolCall(user.id, toolCall);
    const executedAt = new Date().toISOString();
    const activity: ActivityEvent = {
      id: randomUUID(),
      agent: approval.agent,
      action: execution.summary,
      status: "completed",
      duration: Math.max(1, Math.round((Date.now() - startedAt) / 1_000)),
      confidence: approval.confidence,
      timestamp: executedAt,
      details: execution.details,
      tool: toolCall.tool,
    };
    const agent = workspace.agents.find((item) => item.name === approval.agent);
    await Promise.all([
      patchWorkspaceRecord("approvals", approval.id, { status: "approved", executedAt, executionResult: execution.summary }, user.id),
      saveWorkspaceRecord("activities", activity, user.id),
      ...(agent ? [patchWorkspaceRecord("agents", agent.id, {
        tasksCompleted: agent.tasksCompleted + 1,
        successRate: Math.round(((agent.successRate * agent.tasksCompleted) + 100) / (agent.tasksCompleted + 1)),
        lastActivity: executedAt,
      }, user.id)] : []),
    ]);
    return NextResponse.json({ success: true, execution, activity });
  } catch (error) {
    if (error instanceof BillingAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "L'outil n'a pas pu être exécuté." }, { status: 502 });
  }
}
