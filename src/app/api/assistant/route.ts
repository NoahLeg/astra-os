import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { createOpenAIResponse, getOpenAIConfiguration, OpenAIRequestError } from "@/lib/server/openai";
import { getWorkspaceConfiguration, getWorkspaceData } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ message: z.string().trim().min(1).max(12_000) });

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message invalide" }, { status: 400 });

  try {
    const [configuration, workspace, workspaceConfiguration] = await Promise.all([
      getOpenAIConfiguration(user.id),
      getWorkspaceData(user.id),
      getWorkspaceConfiguration(user.id),
    ]);
    const memoryContext = workspaceConfiguration?.settings.memoryEnabled
      ? workspace.memories.filter((memory) => !memory.blocked).slice(0, 20).map((memory) => `- ${memory.title}: ${memory.content}`).join("\n").slice(0, 8_000)
      : "Mémoire désactivée par l’administrateur.";
    const content = await createOpenAIResponse({
      ...configuration,
      instructions: `Tu es Astra, le coordinateur IA d’un SaaS multi-agents. Réponds en français, de façon concise, concrète et transparente. N’affirme jamais avoir exécuté une action si elle n’a pas réellement été exécutée. Utilise uniquement les éléments de mémoire suivants lorsqu’ils sont pertinents :\n${memoryContext || "Aucun élément actif."}`,
      prompt: parsed.data.message,
    });
    return NextResponse.json({ content, model: configuration.model });
  } catch (error) {
    if (error instanceof OpenAIRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Le Coordinateur est temporairement indisponible.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
