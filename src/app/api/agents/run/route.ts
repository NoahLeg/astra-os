import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceData, patchWorkspaceRecord, saveWorkspaceRecord } from "@/lib/server/database";
import { createOpenAIResponse, getOpenAIConfiguration, OpenAIRequestError } from "@/lib/server/openai";
import type { ActivityEvent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  agentId: z.string().trim().min(1).max(80),
  instruction: z.string().trim().min(5).max(12_000),
});
const resultSchema = z.object({ result: z.string().min(1), confidence: z.number().int().min(0).max(100) });

export async function POST(request: Request) {
  const startedAt = Date.now();
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Instruction invalide" }, { status: 400 });

  try {
    const workspace = await getWorkspaceData(user.id);
    const agent = workspace.agents.find((item) => item.id === parsed.data.agentId);
    if (!agent) return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
    if (!agent.enabled) return NextResponse.json({ error: "Activez cet agent avant de lui confier une tâche." }, { status: 409 });

    const configuration = await getOpenAIConfiguration(user.id);
    const content = await createOpenAIResponse({
      ...configuration,
      instructions: `Tu es l’agent ${agent.name}, spécialiste de ${agent.role}. ${agent.description} Réponds en français. Produis uniquement un résultat que tu peux réellement générer avec le modèle. Ne prétends jamais avoir utilisé un outil externe. Outils autorisés ou prévus : ${agent.tools.join(", ") || "aucun"}.`,
      prompt: parsed.data.instruction,
      maxOutputTokens: 1_500,
      text: {
        format: {
          type: "json_schema",
          name: "agent_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["result", "confidence"],
            properties: {
              result: { type: "string" },
              confidence: { type: "integer", minimum: 0, maximum: 100 },
            },
          },
        },
      },
    });
    const result = resultSchema.parse(JSON.parse(content));
    const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const activity: ActivityEvent = {
      id: randomUUID(),
      agent: agent.name,
      action: parsed.data.instruction.slice(0, 140),
      status: "completed",
      duration,
      confidence: result.confidence,
      timestamp: new Date().toISOString(),
      details: result.result,
      tool: configuration.model,
    };
    await Promise.all([
      saveWorkspaceRecord("activities", activity, user.id),
      patchWorkspaceRecord("agents", agent.id, {
        tasksCompleted: agent.tasksCompleted + 1,
        successRate: Math.round(((agent.successRate * agent.tasksCompleted) + 100) / (agent.tasksCompleted + 1)),
        lastActivity: new Date().toISOString(),
        model: configuration.model,
      }, user.id),
    ]);
    return NextResponse.json({ ...result, model: configuration.model, activity });
  } catch (error) {
    if (error instanceof OpenAIRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "L’agent n’a pas pu terminer la tâche." }, { status: 502 });
  }
}
