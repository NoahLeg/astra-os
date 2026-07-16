import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { agentToolCatalog, getAvailableAgentTools, parseToolArguments } from "@/lib/server/agent-tools";
import { createOpenAIResponse } from "@/lib/server/openai";
import type { Agent, AgentToolCall, AgentToolName, ApprovalRequest, WorkspaceData } from "@/types";

const modelResultSchema = z.object({
  result: z.string().min(1),
  confidence: z.number().int().min(0).max(100),
  wantsTool: z.boolean(),
  tool: z.enum(["none", "send_email", "create_calendar_event", "create_drive_file"]),
  toolReason: z.string(),
  toolArgumentsJson: z.string(),
});

export interface AgentTaskResult {
  result: string;
  confidence: number;
  toolCall?: AgentToolCall;
  toolReason?: string;
  toolWarning?: string;
}

export function buildMemoryContext(workspace: WorkspaceData, memoryEnabled: boolean, maximumItems = 20) {
  if (!memoryEnabled) return "Mémoire désactivée par l'administrateur.";
  return workspace.memories
    .filter((memory) => !memory.blocked)
    .slice(0, maximumItems)
    .map((memory) => `- ${memory.title}: ${memory.content}`)
    .join("\n")
    .slice(0, 8_000) || "Aucun élément actif.";
}

export async function generateAgentTask(input: {
  agent: Agent;
  instruction: string;
  workspace: WorkspaceData;
  memoryContext: string;
  configuration: { apiKey: string; baseUrl?: string; model: string };
}) : Promise<AgentTaskResult> {
  const availableTools = getAvailableAgentTools(input.agent.id, input.workspace.connections);
  const toolGuide = availableTools.length
    ? availableTools.map((tool) => `${tool}: ${agentToolCatalog[tool].description} Arguments JSON : ${agentToolCatalog[tool].argumentsExample}`).join("\n")
    : "Aucun outil externe connecté pour cet agent.";
  const content = await createOpenAIResponse({
    ...input.configuration,
    instructions: `Tu es l'agent ${input.agent.name}, spécialiste de ${input.agent.role}. ${input.agent.description}
Réponds en français. Produis d'abord un livrable concret. Tu peux ensuite proposer au maximum une action externe parmi les outils réellement disponibles ci-dessous. Ne prétends jamais l'avoir exécutée : elle sera soumise à validation humaine et exécutée par le serveur seulement après autorisation.
Outils disponibles :
${toolGuide}
Si aucun outil n'est nécessaire ou disponible, mets wantsTool=false, tool="none", toolReason="" et toolArgumentsJson="". Si tu proposes un outil, utilise exactement son identifiant et fournis uniquement un objet JSON conforme dans toolArgumentsJson.
Mémoire autorisée de cette entreprise :
${input.memoryContext}`,
    prompt: input.instruction,
    maxOutputTokens: 1_800,
    text: {
      format: {
        type: "json_schema",
        name: "agent_task_result",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["result", "confidence", "wantsTool", "tool", "toolReason", "toolArgumentsJson"],
          properties: {
            result: { type: "string" },
            confidence: { type: "integer", minimum: 0, maximum: 100 },
            wantsTool: { type: "boolean" },
            tool: { type: "string", enum: ["none", "send_email", "create_calendar_event", "create_drive_file"] },
            toolReason: { type: "string" },
            toolArgumentsJson: { type: "string" },
          },
        },
      },
    },
  });
  const result = modelResultSchema.parse(JSON.parse(content));
  if (!result.wantsTool || result.tool === "none") return { result: result.result, confidence: result.confidence };
  if (!availableTools.includes(result.tool as AgentToolName)) {
    return { result: result.result, confidence: result.confidence, toolWarning: "L'outil proposé n'est pas autorisé ou le connecteur n'est pas actif." };
  }
  try {
    return {
      result: result.result,
      confidence: result.confidence,
      toolCall: parseToolArguments(result.tool as AgentToolName, result.toolArgumentsJson),
      toolReason: result.toolReason,
    };
  } catch (error) {
    return { result: result.result, confidence: result.confidence, toolWarning: error instanceof Error ? error.message : "Arguments d'outil invalides." };
  }
}

export function createToolApproval(input: {
  agent: Agent;
  instruction: string;
  result: AgentTaskResult;
  model: string;
  contextPrefix?: string;
}) : ApprovalRequest | undefined {
  if (!input.result.toolCall) return undefined;
  const metadata = agentToolCatalog[input.result.toolCall.tool];
  return {
    id: randomUUID(),
    action: metadata.label,
    context: `${input.contextPrefix ? `${input.contextPrefix} — ` : ""}${input.instruction}`,
    agent: input.agent.name,
    impact: metadata.impact,
    risk: metadata.risk,
    confidence: input.result.confidence,
    explanation: input.result.toolReason || "L'agent estime que cette action est la prochaine étape utile.",
    status: "pending",
    createdAt: new Date().toISOString(),
    dataUsed: metadata.dataUsed,
    model: input.model,
    toolCall: input.result.toolCall,
  };
}
