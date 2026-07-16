import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteWorkspaceSecret, getDecryptedIntegrationSecret } from "@/lib/server/admin-service";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceIdForUser, hasWorkspaceAccess, patchWorkspaceRecord } from "@/lib/server/database";
import { googleConnectionIds, revokeGoogleToken } from "@/lib/server/google-oauth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";

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
    await requireSubscriptionFeature(user.id, "connectors");
    const workspaceId = await getWorkspaceIdForUser(user.id);
    if (!workspaceId) throw new Error("Espace de travail introuvable");
    const credential = await getDecryptedIntegrationSecret({ workspaceId, provider: "Google OAuth", label: `oauth:${parsed.data.connectionId}`, actorUserId: user.id });
    if (credential) {
      await revokeGoogleToken(credential.secret);
      await deleteWorkspaceSecret({ workspaceId, secretId: credential.id, actorUserId: user.id });
    }
    await patchWorkspaceRecord("connections", parsed.data.connectionId, { status: "disconnected" }, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof BillingAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Déconnexion Google impossible" }, { status: 503 });
  }
}
