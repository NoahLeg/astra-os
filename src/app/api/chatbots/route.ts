import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { createChatbot, listChatbots } from "@/lib/server/chatbots";
import { getWorkspaceConfiguration, hasWorkspaceAccess } from "@/lib/server/database";
import { listPlatformModels } from "@/lib/server/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2).max(100), description: z.string().trim().max(500),
  model: z.string().trim().min(1).max(200),
  systemPrompt: z.string().trim().min(10).max(20_000), memoryEnabled: z.boolean(),
  learningEnabled: z.boolean(), globalLearningEnabled: z.boolean(), webEnabled: z.boolean(),
});

async function getSession(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user || !await hasWorkspaceAccess(user.id, "operator")) return null;
  return user;
}

export async function GET(request: Request) {
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  try { await requireSubscriptionFeature(user.id, "chatbots"); return NextResponse.json({ chatbots: await listChatbots(user.id) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Chatbots indisponibles" }, { status: error instanceof BillingAccessError ? error.status : 503 }); }
}

export async function POST(request: Request) {
  const user = await getSession(request); if (!user) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Configuration invalide" }, { status: 400 });
  try {
    const [subscription, workspaceConfiguration, models] = await Promise.all([
      requireSubscriptionFeature(user.id, "chatbots"),
      getWorkspaceConfiguration(user.id),
      listPlatformModels(),
    ]);
    const model = models.find((item) => item.modelId === parsed.data.model);
    const allowed = model?.enabled && model.userVisible && (!model.premium || subscription.premiumModels) && workspaceConfiguration?.settings.enabledModelIds.includes(model.modelId);
    if (!allowed) return NextResponse.json({ error: "Le modèle sélectionné n'est pas activé ou n'est pas inclus dans votre offre." }, { status: 409 });
    return NextResponse.json({ chatbot: await createChatbot(user.id, { ...parsed.data, provider: model?.providerSlug }) }, { status: 201 });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Création impossible" }, { status: error instanceof BillingAccessError ? error.status : 503 }); }
}
