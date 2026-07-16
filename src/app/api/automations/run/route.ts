import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildMemoryContext, createToolApproval, generateAgentTask } from "@/lib/server/agent-runtime";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, consumeApiUsage } from "@/lib/server/billing";
import { getWorkspaceConfiguration, getWorkspaceData, hasWorkspaceAccess, patchWorkspaceRecord, saveWorkspaceRecord } from "@/lib/server/database";
import { getOpenAIConfiguration, OpenAIRequestError } from "@/lib/server/openai";
import type { ActivityEvent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ automationId: z.string().trim().min(1).max(100) });

export async function POST(request: Request) {
  const startedAt = Date.now();
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Automatisation invalide" }, { status: 400 });

  try {
    const [workspace, workspaceConfiguration] = await Promise.all([
      getWorkspaceData(user.id),
      getWorkspaceConfiguration(user.id),
    ]);
    const automation = workspace.automations.find((item) => item.id === parsed.data.automationId);
    if (!automation) return NextResponse.json({ error: "Automatisation introuvable" }, { status: 404 });
    if (automation.status !== "active") return NextResponse.json({ error: "Activez cette automatisation avant de l'exécuter." }, { status: 409 });

    const requestedAgentNames = automation.nodes.filter((node) => node.type === "agent").map((node) => node.label.toLowerCase());
    const selectedAgents = workspace.agents.filter((agent) => requestedAgentNames.some((name) => name.includes(agent.name.toLowerCase())));
    const executor = selectedAgents[0] ?? workspace.agents.find((agent) => agent.id === "coordinateur");
    if (!executor) return NextResponse.json({ error: "Ajoutez un bloc Agent ou activez le Coordinateur." }, { status: 409 });
    if (!executor.enabled) return NextResponse.json({ error: `L'agent ${executor.name} doit être activé.` }, { status: 409 });

    await consumeApiUsage(user.id, "automations", 1);
    const configuration = await getOpenAIConfiguration(user.id);
    const workflow = automation.nodes.map((node, index) => `${index + 1}. [${node.type}] ${node.label}`).join("\n");
    const taskResult = await generateAgentTask({
      agent: executor,
      instruction: `Exécute la partie intellectuelle de cette automatisation et propose l'action externe suivante si un connecteur compatible est disponible.\nAutomatisation : ${automation.name}\nDescription : ${automation.description}\nWorkflow :\n${workflow}`,
      workspace,
      memoryContext: buildMemoryContext(workspace, Boolean(workspaceConfiguration?.settings.memoryEnabled), 15),
      configuration,
    });
    const approval = createToolApproval({
      agent: executor,
      instruction: `Exécution du workflow ${automation.name}`,
      result: taskResult,
      model: configuration.model,
      contextPrefix: "Automatisation",
    });
    const runCount = (automation.runCount ?? 0) + 1;
    const updatedAutomation = {
      ...automation,
      runCount,
      lastRun: new Date().toISOString(),
      successRate: Math.round(((automation.successRate * Math.max(0, runCount - 1)) + 100) / runCount),
    };
    const activity: ActivityEvent = {
      id: randomUUID(),
      agent: executor.name,
      action: `Automatisation exécutée : ${automation.name}`,
      status: approval ? "approval" : "completed",
      duration: Math.max(1, Math.round((Date.now() - startedAt) / 1_000)),
      confidence: taskResult.confidence,
      timestamp: new Date().toISOString(),
      details: taskResult.toolWarning ? `${taskResult.result}\n\nAvertissement outil : ${taskResult.toolWarning}` : taskResult.result,
      tool: `Automation:${automation.id}`,
    };
    await Promise.all([
      patchWorkspaceRecord("automations", automation.id, updatedAutomation, user.id),
      saveWorkspaceRecord("activities", activity, user.id),
      ...(approval ? [saveWorkspaceRecord("approvals", approval, user.id)] : []),
    ]);
    return NextResponse.json({ result: taskResult.result, confidence: taskResult.confidence, model: configuration.model, activity, automation: updatedAutomation, approval });
  } catch (error) {
    if (error instanceof BillingAccessError || error instanceof OpenAIRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Exécution impossible" }, { status: 502 });
  }
}
