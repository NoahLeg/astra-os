import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getWorkspaceProviderSecret } from "@/lib/server/admin-service";
import { authorizeAIRequest, recordAIUsage, recordFailedAIRequest } from "@/lib/server/ai-usage";
import { getWorkspaceConfiguration, getWorkspaceIdForUser } from "@/lib/server/database";
import { getPlatformModel, getPlatformProviderCredential, type ProviderKind } from "@/lib/server/platform-admin";
import type { AIUsageEvent, FeatureKey } from "@/types";

interface OpenAIResponsePayload {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ type?: string; url?: string; title?: string }>;
    }>;
  }>;
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

interface AnthropicPayload {
  id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
  error?: { message?: string };
}

export interface OpenAIResponseResult {
  content: string;
  model: string;
  requestId?: string;
  usage?: AIUsageEvent;
  citations: Array<{ url: string; title: string }>;
  webSearchUsed: boolean;
}

export interface OpenAIContextFile {
  name: string;
  mimeType: string;
  dataBase64: string;
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

function getResponseCitations(response: OpenAIResponsePayload) {
  const citations = response.output
    ?.flatMap((item) => item.content ?? [])
    .flatMap((item) => item.annotations ?? [])
    .filter((item) => item.type === "url_citation" && item.url)
    .map((item) => ({ url: item.url!, title: item.title?.trim() || new URL(item.url!).hostname })) ?? [];
  return [...new Map(citations.map((citation) => [citation.url, citation])).values()].slice(0, 12);
}

function getResponsesEndpoint(baseUrl?: string, allowCustom = false) {
  const endpoint = new URL(baseUrl?.trim() || "https://api.openai.com/v1");
  if (endpoint.protocol !== "https:" || (!allowCustom && endpoint.hostname !== "api.openai.com")) {
    throw new OpenAIRequestError("L’URL OpenAI doit utiliser https://api.openai.com afin de protéger la clé API.", 400);
  }
  endpoint.pathname = endpoint.pathname.replace(/\/$/, "");
  if (!endpoint.pathname.endsWith("/responses")) endpoint.pathname += "/responses";
  return endpoint.toString();
}

function getAnthropicEndpoint(baseUrl?: string) {
  const endpoint = new URL(baseUrl?.trim() || "https://api.anthropic.com");
  if (endpoint.protocol !== "https:") throw new OpenAIRequestError("L’URL Anthropic doit utiliser HTTPS.", 400);
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/v1/messages`.replace(/\/v1\/v1\//, "/v1/");
  return endpoint.toString();
}

async function createAnthropicResponse(input: Parameters<typeof createOpenAIResponse>[0], usageEventId: string, maximumOutputTokens: number): Promise<OpenAIResponseResult> {
  let response: Response;
  const supportedFiles = (input.files ?? []).filter((file) => file.mimeType.startsWith("image/") || file.mimeType === "application/pdf");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt }];
  for (const file of supportedFiles) {
    content.push(file.mimeType.startsWith("image/")
      ? { type: "image", source: { type: "base64", media_type: file.mimeType, data: file.dataBase64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.dataBase64 }, title: file.name });
  }
  try {
    response = await fetch(getAnthropicEndpoint(input.baseUrl), {
      method: "POST",
      headers: { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: input.model, system: input.instructions, messages: [{ role: "user", content }], max_tokens: maximumOutputTokens }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (input.tracking) await recordFailedAIRequest({ id: usageEventId, userId: input.tracking.userId, feature: input.tracking.feature, provider: "anthropic", model: input.model, workspaceId: input.tracking.workspaceId, errorMessage: error instanceof Error ? error.message : "Échec réseau Anthropic" });
    throw new OpenAIRequestError("Anthropic est temporairement inaccessible.", 503);
  }
  const requestId = response.headers.get("request-id") ?? undefined;
  const payload = await response.json().catch(() => ({})) as AnthropicPayload;
  if (!response.ok) {
    const message = payload.error?.message ?? `Anthropic a renvoyé l’erreur ${response.status}.`;
    if (input.tracking) await recordFailedAIRequest({ id: usageEventId, userId: input.tracking.userId, feature: input.tracking.feature, provider: "anthropic", model: input.model, workspaceId: input.tracking.workspaceId, providerRequestId: requestId, errorMessage: message });
    throw new OpenAIRequestError(message, response.status);
  }
  const responseContent = payload.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n").trim();
  if (!responseContent) throw new OpenAIRequestError("Anthropic n’a renvoyé aucun texte exploitable.", 502);
  let usage: AIUsageEvent | undefined;
  if (input.tracking) {
    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;
    usage = await retryUsagePersistence(() => recordAIUsage({
      id: usageEventId, userId: input.tracking!.userId, feature: input.tracking!.feature, provider: "anthropic",
      model: payload.model ?? input.model, providerRequestId: payload.id ?? requestId, workspaceId: input.tracking!.workspaceId,
      usage: { inputTokens, cachedInputTokens: payload.usage?.cache_read_input_tokens ?? 0, outputTokens, reasoningTokens: 0, totalTokens: inputTokens + outputTokens },
      pricingUnavailable: !payload.usage, metadata: { ...input.tracking!.metadata, unsupportedContextFiles: (input.files?.length ?? 0) - supportedFiles.length },
    }));
  }
  return { content: responseContent, model: payload.model ?? input.model, requestId: payload.id ?? requestId, usage, citations: [], webSearchUsed: false };
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

export async function getOpenAIConfiguration(userId: string, requestedModel?: string) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) throw new OpenAIRequestError("Aucun espace de travail associé à ce compte.", 404);
  const workspaceConfiguration = await getWorkspaceConfiguration(userId);
  const model = requestedModel ?? workspaceConfiguration?.settings.defaultModelId ?? process.env.OPENAI_MODEL?.trim() ?? "gpt-5.4-mini";
  const platformModel = await getPlatformModel(model).catch(() => undefined);
  const provider = platformModel?.providerSlug === "anthropic" ? "anthropic" : platformModel?.providerSlug ? "openai_compatible" : "openai";
  const providerSlug = platformModel?.providerSlug ?? "openai";
  const [storedCredential, platformCredential] = await Promise.all([
    getWorkspaceProviderSecret({ workspaceId, provider: providerSlug, actorUserId: userId }),
    getPlatformProviderCredential(providerSlug).catch(() => undefined),
  ]);
  const environmentKey = provider === "anthropic" ? process.env.ANTHROPIC_API_KEY?.trim() : process.env.OPENAI_API_KEY?.trim();
  const apiKey = storedCredential?.secret ?? platformCredential?.secret ?? environmentKey;
  if (!apiKey) {
    throw new OpenAIRequestError("Aucune clé OpenAI n’est configurée pour cette entreprise. Ajoutez-la dans la console Super Admin.", 409);
  }
  return {
    apiKey,
    baseUrl: storedCredential?.baseUrl ?? platformCredential?.provider.baseUrl,
    model,
    provider: provider as ProviderKind,
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
  webSearch?: boolean;
  provider?: ProviderKind;
  files?: OpenAIContextFile[];
  tracking?: { userId: string; workspaceId?: string; feature: FeatureKey; metadata?: Record<string, unknown> };
}) : Promise<OpenAIResponseResult> {
  const usageEventId = randomUUID();
  const maximumOutputTokens = input.maxOutputTokens ?? 900;
  if (input.tracking) {
    const estimatedFileTokens = (input.files ?? []).reduce((total, file) => total + Math.ceil(file.dataBase64.length * 0.75 / 4), 0);
    const estimatedInputTokens = Math.ceil((input.instructions.length + input.prompt.length) / 4) + estimatedFileTokens;
    await authorizeAIRequest(input.tracking.userId, input.tracking.feature, {
      id: usageEventId,
      provider: input.provider ?? "openai",
      model: input.model,
      reservedTokens: Math.max(1, Math.min(250_000, estimatedInputTokens + maximumOutputTokens)),
    }, 1, input.tracking.workspaceId);
  }

  if (input.provider === "anthropic") return createAnthropicResponse(input, usageEventId, maximumOutputTokens);

  let response: Response;
  try {
    response = await fetch(getResponsesEndpoint(input.baseUrl, input.provider === "openai_compatible"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        instructions: input.instructions,
        input: input.files?.length ? [{
          role: "user",
          content: [
            { type: "input_text", text: input.prompt },
            ...input.files.map((file) => file.mimeType.startsWith("image/")
              ? { type: "input_image", image_url: `data:${file.mimeType};base64,${file.dataBase64}`, detail: "auto" }
              : { type: "input_file", filename: file.name, file_data: `data:${file.mimeType};base64,${file.dataBase64}` }),
          ],
        }] : input.prompt,
        max_output_tokens: maximumOutputTokens,
        service_tier: "default",
        store: false,
        ...(input.tracking ? { safety_identifier: createHash("sha256").update(input.tracking.userId).digest("hex") } : {}),
        ...(input.text ? { text: input.text } : {}),
        ...(input.webSearch ? {
          tools: [{ type: "web_search", external_web_access: true }],
          tool_choice: "required",
          include: ["web_search_call.action.sources"],
        } : {}),
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
        provider: input.provider ?? "openai",
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
        provider: input.provider ?? "openai",
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
        provider: input.provider ?? "openai",
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
      provider: input.provider ?? "openai",
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
  return {
    content,
    model,
    requestId: payload.id ?? requestId,
    usage,
    citations: getResponseCitations(payload),
    webSearchUsed: Boolean(payload.output?.some((item) => item.type === "web_search_call")),
  };
}
