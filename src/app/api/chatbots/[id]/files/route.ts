import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { getChatbot } from "@/lib/server/chatbots";
import { createContextFile, deleteContextFile, listContextFiles, resolveContextFileMimeType } from "@/lib/server/context-files";
import { hasWorkspaceAccess } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(request: Request, chatbotId: string) {
  const user = await getAuthenticatedUser(request);
  if (!user || !await hasWorkspaceAccess(user.id, "operator")) return { error: NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 }) };
  await requireSubscriptionFeature(user.id, "chatbots");
  const chatbot = await getChatbot(user.id, chatbotId);
  if (!chatbot || chatbot.isSystem) return { error: NextResponse.json({ error: "Chatbot introuvable" }, { status: 404 }) };
  return { user };
}

function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const chatbotId = (await params).id;
    const access = await authorize(request, chatbotId);
    if (access.error) return access.error;
    return NextResponse.json({ files: await listContextFiles(access.user!.id, chatbotId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Fichiers indisponibles" }, { status: error instanceof BillingAccessError ? error.status : 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(request)) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  try {
    const chatbotId = (await params).id;
    const access = await authorize(request, chatbotId);
    if (access.error) return access.error;
    const form = await request.formData();
    const file = form.get("file");
    const scope = z.enum(["workspace", "chatbot"]).safeParse(form.get("scope"));
    if (!(file instanceof File) || !scope.success) return NextResponse.json({ error: "Fichier ou portée invalide" }, { status: 400 });
    const created = await createContextFile(access.user!.id, chatbotId, {
      name: file.name,
      mimeType: resolveContextFileMimeType(file.name, file.type) ?? "",
      bytes: new Uint8Array(await file.arrayBuffer()),
      scope: scope.data,
    });
    return NextResponse.json({ file: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import impossible" }, { status: error instanceof BillingAccessError ? error.status : 503 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(request)) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  try {
    const chatbotId = (await params).id;
    const access = await authorize(request, chatbotId);
    if (access.error) return access.error;
    const fileId = new URL(request.url).searchParams.get("fileId");
    if (!fileId || !z.string().uuid().safeParse(fileId).success) return NextResponse.json({ error: "Fichier invalide" }, { status: 400 });
    const deleted = await deleteContextFile(access.user!.id, chatbotId, fileId);
    return deleted ? NextResponse.json({ success: true }) : NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Suppression impossible" }, { status: error instanceof BillingAccessError ? error.status : 503 });
  }
}
