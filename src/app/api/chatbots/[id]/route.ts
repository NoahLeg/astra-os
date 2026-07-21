import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { deleteChatbot, getChatbot, listChatbotKnowledge, listConversations, updateChatbot } from "@/lib/server/chatbots";
import { hasWorkspaceAccess } from "@/lib/server/database";

const updateSchema = z.object({ name: z.string().trim().min(2).max(100).optional(), description: z.string().trim().max(500).optional(), model: z.string().trim().min(1).max(200).optional(), systemPrompt: z.string().trim().min(10).max(20_000).optional(), memoryEnabled: z.boolean().optional(), learningEnabled: z.boolean().optional(), globalLearningEnabled: z.boolean().optional(), webEnabled: z.boolean().optional(), status: z.enum(["active", "paused"]).optional() }).refine((value) => Object.keys(value).length > 0);
async function session(request: Request) { const user = await getAuthenticatedUser(request); return user && await hasWorkspaceAccess(user.id, "operator") ? user : null; }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await session(request); if (!user) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 }); const { id } = await params;
  try { await requireSubscriptionFeature(user.id, "chatbots"); const chatbot = await getChatbot(user.id, id); if (!chatbot || chatbot.isSystem) return NextResponse.json({ error: "Chatbot introuvable" }, { status: 404 }); const [knowledge, conversations] = await Promise.all([listChatbotKnowledge(user.id, id), listConversations(user.id, id)]); return NextResponse.json({ chatbot, knowledge, conversations }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Chargement impossible" }, { status: error instanceof BillingAccessError ? error.status : 503 }); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await session(request); if (!user) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 }); const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 }); const parsed = updateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Modification invalide" }, { status: 400 });
  try { await requireSubscriptionFeature(user.id, "chatbots"); return NextResponse.json({ chatbot: await updateChatbot(user.id, (await params).id, parsed.data) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Modification impossible" }, { status: error instanceof BillingAccessError ? error.status : 503 }); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await session(request); if (!user) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  try { await requireSubscriptionFeature(user.id, "chatbots"); await deleteChatbot(user.id, (await params).id); return NextResponse.json({ success: true }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Suppression impossible" }, { status: error instanceof BillingAccessError ? error.status : 503 }); }
}
