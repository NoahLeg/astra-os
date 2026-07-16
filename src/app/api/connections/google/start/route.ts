import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceIdForUser, hasWorkspaceAccess } from "@/lib/server/database";
import { createGoogleAuthorizationUrl, isGoogleConnectionId } from "@/lib/server/google-oauth";
import { requireSubscriptionFeature } from "@/lib/server/billing";
import { GOOGLE_WORKSPACE_SECRET_LABEL, getStoredGoogleCredential } from "@/lib/server/google-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.redirect(new URL("/login?next=/connections", request.url));
  if (!await hasWorkspaceAccess(user.id, "admin")) return NextResponse.redirect(new URL("/connections?error=Accès administrateur requis", request.url));

  const connectionId = request.nextUrl.searchParams.get("connectionId") ?? "";
  if (!isGoogleConnectionId(connectionId)) return NextResponse.redirect(new URL("/connections?error=unsupported_google_connection", request.url));

  try {
    await requireSubscriptionFeature(user.id, "connectors");
    const workspaceId = await getWorkspaceIdForUser(user.id);
    if (!workspaceId) throw new Error("Aucun espace de travail associé à ce compte.");
    const existingCredential = await getStoredGoogleCredential({ workspaceId, actorUserId: user.id, connectionId });
    const state = `${connectionId}.${randomUUID()}`;
    const response = NextResponse.redirect(createGoogleAuthorizationUrl({
      state,
      requestUrl: request.url,
      forceConsent: existingCredential?.label !== GOOGLE_WORKSPACE_SECRET_LABEL || request.nextUrl.searchParams.get("force") === "1",
    }));
    response.cookies.set("astra-google-oauth-state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/connections/google/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Configuration Google OAuth incomplète";
    return NextResponse.redirect(new URL(`/connections?error=${encodeURIComponent(message)}`, request.url));
  }
}
