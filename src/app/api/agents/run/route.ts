import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createToolApproval, buildMemoryContext, generateAgentTask } from "@/lib/server/agent-runtime";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, consumeApiUsage, enforceAgentQuota, getWorkspaceSubscription } from "@/lib/server/billing";
import { getWorkspaceConfiguration, getWorkspaceData, hasWorkspaceAccess, patchWorkspaceRecord, saveWorkspaceRecord } from "@/lib/server/database";
import { getOpenAIConfiguration, OpenAIRequestError } from "@/lib/server/openai";
import type { ActivityEvent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  agentId: z.string().trim().min(1).max(80),
  instruction: z.string().trim().min(5).max(12_000),
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Instruction invalide" }, { status: 400 });

  try {
    const [workspace, workspaceConfiguration, subscription] = await Promise.all([
      getWorkspaceData(user.id),
      getWorkspaceConfiguration(user.id),
      getWorkspaceSubscription(user.id),
    ]);
    enforceAgentQuota(subscription, workspace.agents);
    const agent = workspace.agents.find((item) => item.id === parsed.data.agentId);
    if (!agent) return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
    if (!agent.enabled) return NextResponse.json({ error: "Activez cet agent avant de lui confier une tâche." }, { status: 409 });

    await consumeApiUsage(user.id, "agents", 1);
    const configuration = await getOpenAIConfiguration(user.id);
    const taskResult = await generateAgentTask({
      userId: user.id,
      agent,
      instruction: parsed.data.instruction,
      workspace,
      memoryContext: buildMemoryContext(workspace, Boolean(workspaceConfiguration?.settings.memoryEnabled)),
      configuration,
    });
    const approval = createToolApproval({ agent, instruction: parsed.data.instruction, result: taskResult, model: configuration.model });
    const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1_000));
    const details = taskResult.toolWarning ? `${taskResult.result}\n\nAvertissement outil : ${taskResult.toolWarning}` : taskResult.result;
    const activity: ActivityEvent = {
      id: randomUUID(),
      agent: agent.name,
      action: parsed.data.instruction.slice(0, 140),
      status: approval ? "approval" : "completed",
      duration,
      confidence: taskResult.confidence,
      timestamp: new Date().toISOString(),
      details,
      tool: approval ? approval.toolCall?.tool : configuration.model,
    };
    const agentChanges = approval
      ? { lastActivity: new Date().toISOString(), model: configuration.model }
      : {
          tasksCompleted: agent.tasksCompleted + 1,
          successRate: Math.round(((agent.successRate * agent.tasksCompleted) + 100) / (agent.tasksCompleted + 1)),
          lastActivity: new Date().toISOString(),
          model: configuration.model,
        };
    await Promise.all([
      saveWorkspaceRecord("activities", activity, user.id),
      patchWorkspaceRecord("agents", agent.id, agentChanges, user.id),
      ...(approval ? [saveWorkspaceRecord("approvals", approval, user.id)] : []),
    ]);
    return NextResponse.json({ result: taskResult.result, confidence: taskResult.confidence, model: configuration.model, activity, approval });
  } catch (error) {
    if (error instanceof BillingAccessError || error instanceof OpenAIRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "L'agent n'a pas pu terminer la tâche." }, { status: 502 });
  }
}
