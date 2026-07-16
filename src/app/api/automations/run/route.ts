import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildMemoryContext, createToolApproval, generateAgentTask } from "@/lib/server/agent-runtime";
import { getAvailableAgentTools } from "@/lib/server/agent-tools";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, consumeApiUsage, enforceAgentQuota, getWorkspaceSubscription } from "@/lib/server/billing";
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
    const [workspace, workspaceConfiguration, subscription] = await Promise.all([
      getWorkspaceData(user.id),
      getWorkspaceConfiguration(user.id),
      getWorkspaceSubscription(user.id),
    ]);
    enforceAgentQuota(subscription, workspace.agents);
    const automation = workspace.automations.find((item) => item.id === parsed.data.automationId);
    if (!automation) return NextResponse.json({ error: "Automatisation introuvable" }, { status: 404 });
    if (automation.status !== "active") return NextResponse.json({ error: "Activez cette automatisation avant de l'exécuter." }, { status: 409 });

    const requestedAgentNames = automation.nodes.filter((node) => node.type === "agent").map((node) => node.label.toLowerCase());
    const executor = workspace.agents.find((agent) => agent.id === automation.agentId)
      ?? workspace.agents.find((agent) => requestedAgentNames.some((name) => name.includes(agent.name.toLowerCase())))
      ?? workspace.agents.find((agent) => agent.id === "coordinateur");
    if (!executor) return NextResponse.json({ error: "Ajoutez un bloc Agent ou activez le Coordinateur." }, { status: 409 });
    if (!executor.enabled) return NextResponse.json({ error: `L'agent ${executor.name} doit être activé.` }, { status: 409 });
    const availableTools = getAvailableAgentTools(executor.id, workspace.connections);
    if (automation.preferredTool && automation.preferredTool !== "auto" && !availableTools.includes(automation.preferredTool)) {
      return NextResponse.json({ error: `L’outil ${automation.preferredTool} n’est pas autorisé pour ${executor.name} ou son connecteur n’est pas actif.` }, { status: 409 });
    }

    await consumeApiUsage(user.id, "automations", 1);
    const configuration = await getOpenAIConfiguration(user.id);
    const workflow = automation.nodes.map((node, index) => `${index + 1}. [${node.type}] ${node.label}`).join("\n");
    const taskResult = await generateAgentTask({
      userId: user.id,
      agent: executor,
      instruction: `Exécute la partie intellectuelle de cette automatisation et prépare un livrable concret.\nAutomatisation : ${automation.name}\nDescription : ${automation.description}\nConsigne configurée : ${automation.instruction || automation.actions.join(" ; ") || "Produire le résultat attendu"}\nOutil attendu : ${automation.preferredTool && automation.preferredTool !== "auto" ? automation.preferredTool : "choix automatique uniquement si nécessaire"}\nWorkflow :\n${workflow}`,
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
      lastResult: taskResult.result,
      lastConfidence: taskResult.confidence,
      lastStatus: approval ? "approval" as const : "completed" as const,
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
