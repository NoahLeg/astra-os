import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildMemoryContext, createToolApproval, generateAgentTask } from "@/lib/server/agent-runtime";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, consumeApiUsage } from "@/lib/server/billing";
import { getWorkspaceConfiguration, getWorkspaceData, hasWorkspaceAccess, patchWorkspaceRecord, saveWorkspaceRecord } from "@/lib/server/database";
import { createOpenAIResponse, getOpenAIConfiguration, OpenAIRequestError } from "@/lib/server/openai";
import type { ActivityEvent, MissionAgentResult, MultiAgentMission } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({
  objective: z.string().trim().min(20).max(12_000),
  agentIds: z.array(z.string().trim().min(1).max(80)).min(2).max(5).refine((items) => new Set(items).size === items.length),
  autonomyLevel: z.union([z.literal(2), z.literal(3), z.literal(4)]),
});

const planResultSchema = z.object({
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(2_000),
  steps: z.array(z.object({ agentId: z.string(), instruction: z.string().min(5).max(4_000) })).min(2).max(5),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Sélectionnez 2 à 5 agents et décrivez précisément la mission." }, { status: 400 });

  const missionId = randomUUID();
  const createdAt = new Date().toISOString();
  let missionCreated = false;
  try {
    const [workspace, workspaceConfiguration] = await Promise.all([
      getWorkspaceData(user.id),
      getWorkspaceConfiguration(user.id),
    ]);
    const selectedAgents = parsed.data.agentIds.map((agentId) => workspace.agents.find((agent) => agent.id === agentId));
    if (selectedAgents.some((agent) => !agent)) return NextResponse.json({ error: "Un agent sélectionné est introuvable." }, { status: 404 });
    const agents = selectedAgents.filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));
    const disabledAgent = agents.find((agent) => !agent.enabled);
    if (disabledAgent) return NextResponse.json({ error: `Activez l'agent ${disabledAgent.name} avant de lancer la mission.` }, { status: 409 });

    await consumeApiUsage(user.id, "multi_agent", agents.length + 2);
    const configuration = await getOpenAIConfiguration(user.id);
    const initialMission: MultiAgentMission = {
      id: missionId,
      title: "Mission en préparation",
      objective: parsed.data.objective,
      summary: "Le Coordinateur construit le plan de délégation.",
      status: "active",
      progress: 5,
      autonomyLevel: parsed.data.autonomyLevel,
      agentIds: agents.map((agent) => agent.id),
      plan: [],
      results: [],
      approvalIds: [],
      createdAt,
    };
    await saveWorkspaceRecord("missions", initialMission, user.id);
    missionCreated = true;

    const allowedAgentIds = agents.map((agent) => agent.id);
    const plannerContent = await createOpenAIResponse({
      ...configuration,
      instructions: "Tu es le Coordinateur Astra. Construis une délégation concise en français. Chaque agent sélectionné doit recevoir exactement une instruction autonome, concrète et adaptée à son rôle. N'affirme aucune exécution.",
      prompt: `Objectif : ${parsed.data.objective}\nAgents disponibles :\n${agents.map((agent) => `- ${agent.id}: ${agent.name}, ${agent.role} — ${agent.description}`).join("\n")}`,
      maxOutputTokens: 1_500,
      text: {
        format: {
          type: "json_schema",
          name: "multi_agent_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "summary", "steps"],
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              steps: {
                type: "array",
                minItems: agents.length,
                maxItems: agents.length,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["agentId", "instruction"],
                  properties: {
                    agentId: { type: "string", enum: allowedAgentIds },
                    instruction: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    });
    const proposedPlan = planResultSchema.parse(JSON.parse(plannerContent));
    const instructionByAgent = new Map(proposedPlan.steps.map((step) => [step.agentId, step.instruction]));
    const plan = agents.map((agent) => ({
      agentId: agent.id,
      instruction: instructionByAgent.get(agent.id) ?? `Contribue à cet objectif selon ton rôle de ${agent.role} : ${parsed.data.objective}`,
    }));
    await patchWorkspaceRecord("missions", missionId, { title: proposedPlan.title, summary: proposedPlan.summary, plan, progress: 20 }, user.id);

    const memoryContext = buildMemoryContext(workspace, Boolean(workspaceConfiguration?.settings.memoryEnabled));
    const delegated = await Promise.all(plan.map(async (step) => {
      const agent = agents.find((item) => item.id === step.agentId)!;
      const startedAt = Date.now();
      try {
        const taskResult = await generateAgentTask({ userId: user.id, agent, instruction: step.instruction, workspace, memoryContext, configuration });
        const approval = createToolApproval({
          agent,
          instruction: step.instruction,
          result: taskResult,
          model: configuration.model,
          contextPrefix: `Mission ${proposedPlan.title}`,
        });
        const missionResult: MissionAgentResult = {
          agentId: agent.id,
          agentName: agent.name,
          instruction: step.instruction,
          result: taskResult.toolWarning ? `${taskResult.result}\n\nAvertissement outil : ${taskResult.toolWarning}` : taskResult.result,
          confidence: taskResult.confidence,
          status: approval ? "approval" : "completed",
          approvalId: approval?.id,
        };
        const activity: ActivityEvent = {
          id: randomUUID(),
          agent: agent.name,
          action: `Mission multi-agents : ${step.instruction.slice(0, 110)}`,
          status: approval ? "approval" : "completed",
          duration: Math.max(1, Math.round((Date.now() - startedAt) / 1_000)),
          confidence: taskResult.confidence,
          timestamp: new Date().toISOString(),
          details: missionResult.result,
          tool: approval?.toolCall?.tool ?? configuration.model,
        };
        await Promise.all([
          saveWorkspaceRecord("activities", activity, user.id),
          ...(approval ? [saveWorkspaceRecord("approvals", approval, user.id)] : []),
          patchWorkspaceRecord("agents", agent.id, approval ? {
            lastActivity: new Date().toISOString(),
            model: configuration.model,
          } : {
            tasksCompleted: agent.tasksCompleted + 1,
            successRate: Math.round(((agent.successRate * agent.tasksCompleted) + 100) / (agent.tasksCompleted + 1)),
            lastActivity: new Date().toISOString(),
            model: configuration.model,
          }, user.id),
        ]);
        return missionResult;
      } catch (error) {
        return {
          agentId: agent.id,
          agentName: agent.name,
          instruction: step.instruction,
          result: error instanceof Error ? error.message : "L'agent n'a pas répondu.",
          confidence: 0,
          status: "error" as const,
        };
      }
    }));
    const approvalIds = delegated.flatMap((result) => result.approvalId ? [result.approvalId] : []);
    await patchWorkspaceRecord("missions", missionId, { results: delegated, approvalIds, progress: 80 }, user.id);

    const synthesisInput = delegated.map((result) => `## ${result.agentName} (${result.status}, ${result.confidence} %)\n${result.result}`).join("\n\n").slice(0, 35_000);
    const finalResult = await createOpenAIResponse({
      ...configuration,
      instructions: "Tu es le Coordinateur Astra. Synthétise en français les contributions en un résultat exploitable. Distingue les résultats disponibles, les incertitudes et les actions externes encore en attente de validation. Ne prétends pas qu'une action en attente a été exécutée.",
      prompt: `Mission : ${proposedPlan.title}\nObjectif : ${parsed.data.objective}\n\nContributions :\n${synthesisInput}`,
      maxOutputTokens: 2_200,
    });
    const completedAt = new Date().toISOString();
    const completedMission: MultiAgentMission = {
      ...initialMission,
      title: proposedPlan.title,
      summary: proposedPlan.summary,
      plan,
      results: delegated,
      finalResult,
      approvalIds,
      progress: 100,
      status: "completed",
      completedAt,
    };
    const activity: ActivityEvent = {
      id: randomUUID(),
      agent: "Coordinateur",
      action: `Mission terminée : ${proposedPlan.title}`,
      status: approvalIds.length ? "approval" : "completed",
      duration: Math.max(1, Math.round((Date.now() - Date.parse(createdAt)) / 1_000)),
      confidence: delegated.length ? Math.round(delegated.reduce((sum, result) => sum + result.confidence, 0) / delegated.length) : 0,
      timestamp: completedAt,
      details: finalResult,
      tool: `Mission:${missionId}`,
    };
    await Promise.all([
      saveWorkspaceRecord("missions", completedMission, user.id),
      saveWorkspaceRecord("activities", activity, user.id),
    ]);
    return NextResponse.json({ mission: completedMission, model: configuration.model });
  } catch (error) {
    if (missionCreated) await patchWorkspaceRecord("missions", missionId, { status: "error", progress: 100, completedAt: new Date().toISOString(), summary: error instanceof Error ? error.message : "Mission interrompue" }, user.id).catch(() => null);
    if (error instanceof BillingAccessError || error instanceof OpenAIRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "La mission multi-agents a échoué." }, { status: 502 });
  }
}
