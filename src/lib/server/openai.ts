import "server-only";

import { getWorkspaceProviderSecret } from "@/lib/server/admin-service";
import { getWorkspaceIdForUser } from "@/lib/server/database";

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}

interface OpenAIErrorPayload {
  error?: { message?: string; code?: string; type?: string };
}

export class OpenAIRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "OpenAIRequestError";
  }
}

function getResponseText(response: OpenAIResponse) {
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

export async function getOpenAIConfiguration(userId: string) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) throw new OpenAIRequestError("Aucun espace de travail associé à ce compte.", 404);
  const storedCredential = await getWorkspaceProviderSecret({ workspaceId, provider: "openai", actorUserId: userId });
  const apiKey = storedCredential?.secret ?? process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenAIRequestError("Aucune clé OpenAI n’est configurée pour cette entreprise. Ajoutez-la dans la console Super Admin.", 409);
  }
  return {
    apiKey,
    baseUrl: storedCredential?.baseUrl,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini",
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
}) {
  const response = await fetch(getResponsesEndpoint(input.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      instructions: input.instructions,
      input: input.prompt,
      max_output_tokens: input.maxOutputTokens ?? 900,
      ...(input.text ? { text: input.text } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });

  const payload = await response.json().catch(() => ({})) as OpenAIResponse & OpenAIErrorPayload;
  if (!response.ok) throw new OpenAIRequestError(translateOpenAIError(response.status, payload), response.status);
  const content = getResponseText(payload);
  if (!content) throw new OpenAIRequestError("OpenAI n’a renvoyé aucun texte exploitable.", 502);
  return content;
}
