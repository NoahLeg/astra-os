import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceConfiguration, getWorkspaceData, hasWorkspaceAccess, patchWorkspaceRecord, saveWorkspaceRecord } from "@/lib/server/database";
import { createOpenAIResponse, getOpenAIConfiguration, OpenAIRequestError } from "@/lib/server/openai";
import type { ActivityEvent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ automationId: z.string().trim().min(1).max(100) });
const resultSchema = z.object({ result: z.string().min(1), confidence: z.number().int().min(0).max(100) });

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
    const [workspace, workspaceConfiguration, configuration] = await Promise.all([
      getWorkspaceData(user.id),
      getWorkspaceConfiguration(user.id),
      getOpenAIConfiguration(user.id),
    ]);
    const automation = workspace.automations.find((item) => item.id === parsed.data.automationId);
    if (!automation) return NextResponse.json({ error: "Automatisation introuvable" }, { status: 404 });
    if (automation.status !== "active") return NextResponse.json({ error: "Activez cette automatisation avant de l’exécuter." }, { status: 409 });

    const requestedAgentNames = automation.nodes.filter((node) => node.type === "agent").map((node) => node.label.toLowerCase());
    const selectedAgents = workspace.agents.filter((agent) => requestedAgentNames.some((name) => name.includes(agent.name.toLowerCase())));
    const disabledAgent = selectedAgents.find((agent) => !agent.enabled);
    if (disabledAgent) return NextResponse.json({ error: `L’agent ${disabledAgent.name} doit être activé.` }, { status: 409 });

    const memoryContext = workspaceConfiguration?.settings.memoryEnabled
      ? workspace.memories.filter((memory) => !memory.blocked).slice(0, 15).map((memory) => `- ${memory.title}: ${memory.content}`).join("\n").slice(0, 6_000)
      : "Mémoire désactivée.";
    const workflow = automation.nodes.map((node, index) => `${index + 1}. [${node.type}] ${node.label}`).join("\n");
    const content = await createOpenAIResponse({
      ...configuration,
      instructions: `Tu exécutes un workflow Astra en français. Simule uniquement les étapes intellectuelles réalisables par le modèle. N’affirme jamais avoir envoyé, supprimé, publié, acheté ou modifié un service externe. Lorsqu’une étape nécessite une action externe ou une validation humaine, produis précisément le livrable à valider et indique clairement l’action en attente. Mémoire autorisée :\n${memoryContext || "Aucune mémoire active."}`,
      prompt: `Automatisation : ${automation.name}\nDescription : ${automation.description}\nWorkflow :\n${workflow}\nProduis le résultat concret de cette exécution.`,
      maxOutputTokens: 1_800,
      text: { format: { type: "json_schema", name: "automation_result", strict: true, schema: { type: "object", additionalProperties: false, required: ["result", "confidence"], properties: { result: { type: "string" }, confidence: { type: "integer", minimum: 0, maximum: 100 } } } } },
    });
    const result = resultSchema.parse(JSON.parse(content));
    const runCount = (automation.runCount ?? 0) + 1;
    const updatedAutomation = {
      ...automation,
      runCount,
      lastRun: new Date().toISOString(),
      successRate: Math.round(((automation.successRate * Math.max(0, runCount - 1)) + 100) / runCount),
    };
    const activity: ActivityEvent = {
      id: randomUUID(),
      agent: selectedAgents.map((agent) => agent.name).join(", ") || "Coordinateur",
      action: `Automatisation exécutée : ${automation.name}`,
      status: "completed",
      duration: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      confidence: result.confidence,
      timestamp: new Date().toISOString(),
      details: result.result,
      tool: `Automation:${automation.id}`,
    };
    await Promise.all([
      patchWorkspaceRecord("automations", automation.id, updatedAutomation, user.id),
      saveWorkspaceRecord("activities", activity, user.id),
    ]);
    return NextResponse.json({ ...result, model: configuration.model, activity, automation: updatedAutomation });
  } catch (error) {
    if (error instanceof OpenAIRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Exécution impossible" }, { status: 502 });
  }
}
