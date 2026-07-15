import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/server/auth";
import { deleteWorkspaceSecret, listAdminWorkspaces, listWorkspaceSecrets, saveWorkspaceSecret } from "@/lib/server/admin-service";

const secretSchema = z.object({ workspaceId: z.uuid(), provider: z.string().trim().min(2).max(50), label: z.string().trim().min(2).max(80), baseUrl: z.union([z.url(), z.literal("")]).optional(), secret: z.string().min(8).max(10_000) });

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: "Accès Super Admin requis" }, { status: 403 });
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (workspaceId) return NextResponse.json({ secrets: await listWorkspaceSecrets(workspaceId) });
    return NextResponse.json({ workspaces: await listAdminWorkspaces() });
  } catch {
    return NextResponse.json({ error: "Console d’administration indisponible" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: "Accès Super Admin requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = secretSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Configuration invalide" }, { status: 400 });
  try {
    await saveWorkspaceSecret({ ...parsed.data, actorUserId: admin.id });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enregistrement impossible" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: "Accès Super Admin requis" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const parsed = z.object({ workspaceId: z.uuid(), secretId: z.uuid() }).safeParse({ workspaceId: searchParams.get("workspaceId"), secretId: searchParams.get("secretId") });
  if (!parsed.success) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  try {
    await deleteWorkspaceSecret({ ...parsed.data, actorUserId: admin.id });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Suppression impossible" }, { status: 503 });
  }
}
