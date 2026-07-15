import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { createOpenAIResponse, getOpenAIConfiguration, OpenAIRequestError } from "@/lib/server/openai";

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
    const configuration = await getOpenAIConfiguration(user.id);
    const content = await createOpenAIResponse({
      ...configuration,
      instructions: "Tu es Astra, le coordinateur IA d’un SaaS multi-agents. Réponds en français, de façon concise, concrète et transparente. N’affirme jamais avoir exécuté une action si elle n’a pas réellement été exécutée.",
      prompt: parsed.data.message,
    });
    return NextResponse.json({ content, model: configuration.model });
  } catch (error) {
    if (error instanceof OpenAIRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "Le Coordinateur est temporairement indisponible.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
