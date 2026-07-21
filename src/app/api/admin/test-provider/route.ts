import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceProviderSecret } from "@/lib/server/admin-service";
import { requireSuperAdmin } from "@/lib/server/auth";
import { createOpenAIResponse, OpenAIRequestError } from "@/lib/server/openai";

const schema = z.object({ workspaceId: z.uuid(), provider: z.literal("OpenAI") });

export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: "Accès Super Admin requis" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Test non pris en charge" }, { status: 400 });
  try {
    const credential = await getWorkspaceProviderSecret({ workspaceId: parsed.data.workspaceId, provider: "openai", actorUserId: admin.id });
    if (!credential) return NextResponse.json({ error: "Aucune clé OpenAI trouvée pour cette entreprise." }, { status: 404 });
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
    const response = await createOpenAIResponse({ apiKey: credential.secret, baseUrl: credential.baseUrl, model, instructions: "Réponds uniquement par OK.", prompt: "Test de connexion Astra.", maxOutputTokens: 20, tracking: { userId: admin.id, workspaceId: parsed.data.workspaceId, feature: "assistant", metadata: { source: "super_admin_provider_test" } } });
    return NextResponse.json({ success: true, model, usage: response.usage });
  } catch (error) {
    const status = error instanceof OpenAIRequestError ? error.status : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Test OpenAI impossible" }, { status });
  }
}
