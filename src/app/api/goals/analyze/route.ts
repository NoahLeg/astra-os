import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { hasWorkspaceAccess } from "@/lib/server/database";
import { createOpenAIResponse, getOpenAIConfiguration, OpenAIRequestError } from "@/lib/server/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ objective: z.string().trim().min(10).max(12_000) });
const analysisSchema = z.object({
  summary: z.string().min(1),
  confidence: z.number().int().min(0).max(100),
  dueDate: z.string().nullable(),
  agentIds: z.array(z.enum(["coordinateur", "email", "calendrier", "documents", "navigateur", "developpement", "recherche", "crm", "communication", "analyse"])).max(6),
  steps: z.array(z.string().min(1)).min(1).max(8),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Décrivez l’objectif avec au moins 10 caractères." }, { status: 400 });

  try {
    const configuration = await getOpenAIConfiguration(user.id);
    const content = await createOpenAIResponse({
      ...configuration,
      instructions: "Analyse un objectif professionnel en français. N’invente aucune donnée déjà exécutée. Donne un résumé fidèle, une confiance prudente, une échéance ISO uniquement si elle est explicite, les agents utiles et des étapes concrètes.",
      prompt: parsed.data.objective,
      maxOutputTokens: 1_200,
      text: {
        format: {
          type: "json_schema",
          name: "goal_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "confidence", "dueDate", "agentIds", "steps"],
            properties: {
              summary: { type: "string" },
              confidence: { type: "integer", minimum: 0, maximum: 100 },
              dueDate: { type: ["string", "null"] },
              agentIds: { type: "array", items: { type: "string", enum: ["coordinateur", "email", "calendrier", "documents", "navigateur", "developpement", "recherche", "crm", "communication", "analyse"] }, maxItems: 6 },
              steps: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
            },
          },
        },
      },
    });
    const analysis = analysisSchema.parse(JSON.parse(content));
    return NextResponse.json({ ...analysis, model: configuration.model });
  } catch (error) {
    if (error instanceof OpenAIRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analyse impossible" }, { status: 502 });
  }
}
