import { NextResponse } from "next/server";
import { z } from "zod";
import { openAIModels } from "@/config";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { createChatbot, listChatbots } from "@/lib/server/chatbots";
import { hasWorkspaceAccess } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2).max(100), description: z.string().trim().max(500),
  model: z.enum(openAIModels.map((model) => model.id) as [string, ...string[]]),
  systemPrompt: z.string().trim().min(10).max(20_000), memoryEnabled: z.boolean(),
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
  try { await requireSubscriptionFeature(user.id, "chatbots"); return NextResponse.json({ chatbot: await createChatbot(user.id, parsed.data) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Création impossible" }, { status: error instanceof BillingAccessError ? error.status : 503 }); }
}
