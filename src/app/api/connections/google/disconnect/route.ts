import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteWorkspaceSecret, getDecryptedIntegrationSecret } from "@/lib/server/admin-service";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceIdForUser, hasWorkspaceAccess, patchWorkspaceRecord } from "@/lib/server/database";
import { googleConnectionIds, revokeGoogleToken } from "@/lib/server/google-oauth";
import { GOOGLE_WORKSPACE_SECRET_LABEL } from "@/lib/server/google-credentials";

const schema = z.object({ connectionId: z.enum(googleConnectionIds) });

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "admin")) return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Connecteur Google invalide" }, { status: 400 });

  try {
    const workspaceId = await getWorkspaceIdForUser(user.id);
    if (!workspaceId) throw new Error("Espace de travail introuvable");
    const labels = [GOOGLE_WORKSPACE_SECRET_LABEL, ...googleConnectionIds.map((connectionId) => `oauth:${connectionId}`)];
    const credentials: Array<{ id: string; secret: string }> = [];
    for (const label of labels) {
      const credential = await getDecryptedIntegrationSecret({ workspaceId, provider: "Google OAuth", label, actorUserId: user.id });
      if (credential && !credentials.some((item) => item.id === credential.id)) credentials.push(credential);
    }
    for (const credential of credentials) {
      await revokeGoogleToken(credential.secret).catch(() => undefined);
      await deleteWorkspaceSecret({ workspaceId, secretId: credential.id, actorUserId: user.id });
    }
    await Promise.all(googleConnectionIds.map((connectionId) => patchWorkspaceRecord("connections", connectionId, { status: "disconnected" }, user.id)));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Déconnexion Google impossible" }, { status: 503 });
  }
}
