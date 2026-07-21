import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildMemoryContext, createToolApproval, generateAgentTask } from "@/lib/server/agent-runtime";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, enforceAgentQuota, getWorkspaceSubscription } from "@/lib/server/billing";
import { getWorkspaceConfiguration, getWorkspaceData, hasWorkspaceAccess, patchWorkspaceRecord, saveWorkspaceRecord } from "@/lib/server/database";
import { getOpenAIConfiguration, OpenAIRequestError } from "@/lib/server/openai";
import type { ActivityEvent, Goal, Project, WorkItemAgentRun } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  entityType: z.enum(["goal", "project"]),
  entityId: z.string().trim().min(1).max(100),
  agentId: z.string().trim().min(1).max(80),
  instruction: z.string().trim().min(8).max(12_000),
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tâche ou ressource invalide" }, { status: 400 });

  try {
    const [workspace, workspaceConfiguration, subscription] = await Promise.all([
      getWorkspaceData(user.id),
      getWorkspaceConfiguration(user.id),
      getWorkspaceSubscription(user.id),
    ]);
    enforceAgentQuota(subscription, workspace.agents);
    const collection = parsed.data.entityType === "goal" ? "goals" : "projects";
    const entity = collection === "goals"
      ? workspace.goals.find((item) => item.id === parsed.data.entityId)
      : workspace.projects.find((item) => item.id === parsed.data.entityId);
    if (!entity) return NextResponse.json({ error: parsed.data.entityType === "goal" ? "Objectif introuvable" : "Projet introuvable" }, { status: 404 });
    const agent = workspace.agents.find((item) => item.id === parsed.data.agentId);
    if (!agent) return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
    if (!agent.enabled) return NextResponse.json({ error: `Activez l’agent ${agent.name} avant de lancer cette tâche.` }, { status: 409 });

    const configuration = await getOpenAIConfiguration(user.id);
    const entityLabel = parsed.data.entityType === "goal" ? "Objectif" : "Projet";
    const taskResult = await generateAgentTask({
      userId: user.id,
      agent,
      instruction: `${entityLabel} : ${entity.title}\nContexte : ${entity.description}\n\nMission confiée : ${parsed.data.instruction}`,
      workspace,
      memoryContext: buildMemoryContext(workspace, Boolean(workspaceConfiguration?.settings.memoryEnabled), parsed.data.instruction),
      configuration,
      feature: "agents",
    });
    const approval = createToolApproval({
      agent,
      instruction: parsed.data.instruction,
      result: taskResult,
      model: taskResult.usage?.model ?? configuration.model,
      contextPrefix: `${entityLabel} « ${entity.title} »`,
    });
    const run: WorkItemAgentRun = {
      id: randomUUID(),
      agentId: agent.id,
      agentName: agent.name,
      instruction: parsed.data.instruction,
      result: taskResult.result,
      confidence: taskResult.confidence,
      model: taskResult.usage?.model ?? configuration.model,
      status: approval ? "approval" : "completed",
      createdAt: new Date().toISOString(),
      approvalId: approval?.id,
    };
    const previousRuns = entity.agentRuns ?? [];
    const sharedChanges = {
      agentIds: Array.from(new Set([...entity.agentIds, agent.id])),
      agentRuns: [...previousRuns, run].slice(-20),
    };
    const entityChanges: Partial<Goal> | Partial<Project> = collection === "projects"
      ? { ...sharedChanges, nextAction: approval ? `Valider : ${approval.action}` : `Consulter le résultat de ${agent.name}` }
      : sharedChanges;
    const activity: ActivityEvent = {
      id: randomUUID(),
      agent: agent.name,
      action: `${entityLabel} — ${parsed.data.instruction.slice(0, 120)}`,
      status: approval ? "approval" : "completed",
      duration: Math.max(1, Math.round((Date.now() - startedAt) / 1_000)),
      confidence: taskResult.confidence,
      timestamp: new Date().toISOString(),
      details: taskResult.toolWarning ? `${taskResult.result}\n\nAvertissement outil : ${taskResult.toolWarning}` : taskResult.result,
      tool: `${entityLabel}:${entity.id}`,
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
      patchWorkspaceRecord(collection, entity.id, entityChanges, user.id),
      patchWorkspaceRecord("agents", agent.id, agentChanges, user.id),
      saveWorkspaceRecord("activities", activity, user.id),
      ...(approval ? [saveWorkspaceRecord("approvals", approval, user.id)] : []),
    ]);
    return NextResponse.json({
      entityType: parsed.data.entityType,
      entityId: entity.id,
      run,
      result: taskResult.result,
      confidence: taskResult.confidence,
      model: configuration.model,
      activity,
      approval,
      usage: taskResult.usage,
    });
  } catch (error) {
    if (error instanceof BillingAccessError || error instanceof OpenAIRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "L’agent n’a pas pu traiter cette ressource." }, { status: 502 });
  }
}
