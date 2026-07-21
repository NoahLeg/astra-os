import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { createChatbotKnowledge, deleteChatbotKnowledge, updateChatbotKnowledge } from "@/lib/server/chatbots";
import { hasWorkspaceAccess } from "@/lib/server/database";

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(2).max(100_000),
  source: z.string().trim().max(200).optional(),
});
const updateSchema = z.object({ knowledgeId: z.string().uuid(), blocked: z.boolean() });

async function session(request: Request) {
  const user = await getAuthenticatedUser(request);
  return user && await hasWorkspaceAccess(user.id, "operator") ? user : null;
}

function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await session(request);
  if (!user) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  if (!checkOrigin(request)) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Connaissance invalide" }, { status: 400 });
  try {
    await requireSubscriptionFeature(user.id, "chatbots");
    return NextResponse.json({ knowledge: await createChatbotKnowledge(user.id, (await params).id, parsed.data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ajout impossible" }, { status: error instanceof BillingAccessError ? error.status : 503 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await session(request);
  if (!user) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  if (!checkOrigin(request)) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Modification invalide" }, { status: 400 });
  try {
    await requireSubscriptionFeature(user.id, "chatbots");
    const knowledge = await updateChatbotKnowledge(user.id, (await params).id, parsed.data.knowledgeId, { blocked: parsed.data.blocked });
    return NextResponse.json({ knowledge });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Modification impossible" }, { status: error instanceof BillingAccessError ? error.status : 503 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await session(request);
  if (!user) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  if (!checkOrigin(request)) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const knowledgeId = new URL(request.url).searchParams.get("knowledgeId");
  if (!knowledgeId) return NextResponse.json({ error: "Identifiant requis" }, { status: 400 });
  try {
    await requireSubscriptionFeature(user.id, "chatbots");
    await deleteChatbotKnowledge(user.id, (await params).id, knowledgeId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Suppression impossible" }, { status: error instanceof BillingAccessError ? error.status : 503 });
  }
}
