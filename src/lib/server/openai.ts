import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { openAIModels } from "@/config";
import { getWorkspaceProviderSecret } from "@/lib/server/admin-service";
import { authorizeAIRequest, recordAIUsage, recordFailedAIRequest } from "@/lib/server/ai-usage";
import { getWorkspaceConfiguration, getWorkspaceIdForUser } from "@/lib/server/database";
import type { AIUsageEvent, FeatureKey } from "@/types";

interface OpenAIResponsePayload {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

interface OpenAIErrorPayload {
  error?: { message?: string; code?: string; type?: string };
}

export interface OpenAIResponseResult {
  content: string;
  model: string;
  requestId?: string;
  usage?: AIUsageEvent;
}

export class OpenAIRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "OpenAIRequestError";
  }
}

function getResponseText(response: OpenAIResponsePayload) {
  if (response.output_text?.trim()) return response.output_text.trim();
  return response.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function getResponsesEndpoint(baseUrl?: string) {
  const endpoint = new URL(baseUrl?.trim() || "https://api.openai.com/v1");
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "api.openai.com") {
    throw new OpenAIRequestError("L’URL OpenAI doit utiliser https://api.openai.com afin de protéger la clé API.", 400);
  }
  endpoint.pathname = endpoint.pathname.replace(/\/$/, "");
  if (!endpoint.pathname.endsWith("/responses")) endpoint.pathname += "/responses";
  return endpoint.toString();
}

function translateOpenAIError(status: number, payload: OpenAIErrorPayload) {
  const rawMessage = payload.error?.message;
  if (status === 401) return "La clé OpenAI est invalide ou révoquée.";
  if (status === 429) return "Le quota OpenAI est atteint. Vérifiez la facturation et les limites du projet API.";
  if (status === 403) return "Le projet OpenAI n’autorise pas ce modèle ou cette opération.";
  if (status === 404) return "Le modèle OpenAI configuré n’est pas disponible pour cette clé.";
  return rawMessage || `OpenAI a renvoyé l’erreur ${status}.`;
}

async function retryUsagePersistence<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }
  throw lastError;
}

export async function getOpenAIConfiguration(userId: string) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) throw new OpenAIRequestError("Aucun espace de travail associé à ce compte.", 404);
  const storedCredential = await getWorkspaceProviderSecret({ workspaceId, provider: "openai", actorUserId: userId });
  const apiKey = storedCredential?.secret ?? process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenAIRequestError("Aucune clé OpenAI n’est configurée pour cette entreprise. Ajoutez-la dans la console Super Admin.", 409);
  }
  const workspaceConfiguration = await getWorkspaceConfiguration(userId);
  const supportedModels = new Set(openAIModels.map((model) => model.id));
  const workspaceModel = workspaceConfiguration?.settings.defaultModelId;
  const environmentModel = process.env.OPENAI_MODEL?.trim();
  return {
    apiKey,
    baseUrl: storedCredential?.baseUrl,
    model: workspaceModel && supportedModels.has(workspaceModel as typeof openAIModels[number]["id"])
      ? workspaceModel
      : environmentModel && supportedModels.has(environmentModel as typeof openAIModels[number]["id"])
        ? environmentModel
        : "gpt-5.4-mini",
    workspaceId,
  };
}

export async function createOpenAIResponse(input: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  instructions: string;
  prompt: string;
  maxOutputTokens?: number;
  text?: Record<string, unknown>;
  tracking?: { userId: string; workspaceId?: string; feature: FeatureKey; metadata?: Record<string, unknown> };
}) : Promise<OpenAIResponseResult> {
  const usageEventId = randomUUID();
  const maximumOutputTokens = input.maxOutputTokens ?? 900;
  if (input.tracking) {
    const estimatedInputTokens = input.instructions.length + input.prompt.length;
    await authorizeAIRequest(input.tracking.userId, input.tracking.feature, {
      id: usageEventId,
      provider: "openai",
      model: input.model,
      reservedTokens: Math.max(1, Math.min(250_000, estimatedInputTokens + maximumOutputTokens)),
    }, 1, input.tracking.workspaceId);
  }

  let response: Response;
  try {
    response = await fetch(getResponsesEndpoint(input.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        instructions: input.instructions,
        input: input.prompt,
        max_output_tokens: maximumOutputTokens,
        service_tier: "default",
        store: false,
        ...(input.tracking ? { safety_identifier: createHash("sha256").update(input.tracking.userId).digest("hex") } : {}),
        ...(input.text ? { text: input.text } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (input.tracking) {
      await recordFailedAIRequest({
        id: usageEventId,
        userId: input.tracking.userId,
        feature: input.tracking.feature,
        provider: "openai",
        model: input.model,
        workspaceId: input.tracking.workspaceId,
        errorMessage: error instanceof Error ? error.message : "Échec réseau OpenAI",
      });
    }
    throw new OpenAIRequestError(error instanceof Error && error.name === "TimeoutError" ? "OpenAI n’a pas répondu dans le délai prévu." : "OpenAI est temporairement inaccessible.", 503);
  }

  const requestId = response.headers.get("x-request-id") ?? undefined;
  const payload = await response.json().catch(() => ({})) as OpenAIResponsePayload & OpenAIErrorPayload;
  if (!response.ok) {
    const message = translateOpenAIError(response.status, payload);
    if (input.tracking) {
      await recordFailedAIRequest({
        id: usageEventId,
        userId: input.tracking.userId,
        feature: input.tracking.feature,
        provider: "openai",
        model: input.model,
        workspaceId: input.tracking.workspaceId,
        providerRequestId: requestId,
        errorMessage: message,
      });
    }
    throw new OpenAIRequestError(message, response.status);
  }

  const content = getResponseText(payload);
  if (!content) {
    const message = "OpenAI n’a renvoyé aucun texte exploitable.";
    if (input.tracking) {
      await recordFailedAIRequest({
        id: usageEventId,
        userId: input.tracking.userId,
        feature: input.tracking.feature,
        provider: "openai",
        model: payload.model ?? input.model,
        workspaceId: input.tracking.workspaceId,
        providerRequestId: payload.id ?? requestId,
        errorMessage: message,
      });
    }
    throw new OpenAIRequestError(message, 502);
  }

  const model = payload.model ?? input.model;
  let usage: AIUsageEvent | undefined;
  if (input.tracking) {
    const tracking = input.tracking;
    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;
    usage = await retryUsagePersistence(() => recordAIUsage({
      id: usageEventId,
      userId: tracking.userId,
      feature: tracking.feature,
      provider: "openai",
      model,
      providerRequestId: payload.id ?? requestId,
      workspaceId: tracking.workspaceId,
      usage: {
        inputTokens,
        cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens ?? 0,
        outputTokens,
        reasoningTokens: payload.usage?.output_tokens_details?.reasoning_tokens ?? 0,
        totalTokens: payload.usage?.total_tokens ?? inputTokens + outputTokens,
      },
      pricingUnavailable: !payload.usage,
      metadata: tracking.metadata,
    }));
  }
  return { content, model, requestId: payload.id ?? requestId, usage };
}
