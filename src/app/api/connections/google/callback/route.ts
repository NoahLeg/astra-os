import { type NextRequest, NextResponse } from "next/server";
import { saveWorkspaceSecret } from "@/lib/server/admin-service";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceIdForUser, hasWorkspaceAccess, patchWorkspaceRecord } from "@/lib/server/database";
import { exchangeGoogleAuthorizationCode, isGoogleConnectionId } from "@/lib/server/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToConnections(request: NextRequest, parameters: Record<string, string>) {
  const url = new URL("/connections", request.url);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.delete("astra-google-oauth-state");
  return response;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.redirect(new URL("/login?next=/connections", request.url));
  if (!await hasWorkspaceAccess(user.id, "admin")) return redirectToConnections(request, { error: "Accès administrateur requis" });

  const state = request.nextUrl.searchParams.get("state") ?? "";
  const expectedState = request.cookies.get("astra-google-oauth-state")?.value;
  if (!state || !expectedState || state !== expectedState) return redirectToConnections(request, { error: "État OAuth Google invalide ou expiré." });

  const connectionId = state.split(".")[0];
  if (!isGoogleConnectionId(connectionId)) return redirectToConnections(request, { error: "Connecteur Google inconnu." });
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError || !code) return redirectToConnections(request, { error: oauthError === "access_denied" ? "Autorisation Google refusée." : "Google n’a pas renvoyé de code d’autorisation." });

  try {
    const workspaceId = await getWorkspaceIdForUser(user.id);
    if (!workspaceId) throw new Error("Aucun espace de travail associé à ce compte.");
    const token = await exchangeGoogleAuthorizationCode({ code, requestUrl: request.url });
    if (!token.refresh_token) throw new Error("Google n’a pas fourni de refresh token. Révoquez l’accès Astra dans votre compte Google puis reconnectez-vous.");

    await saveWorkspaceSecret({
      workspaceId,
      provider: "Google OAuth",
      label: `oauth:${connectionId}`,
      baseUrl: "https://oauth2.googleapis.com/token",
      secret: token.refresh_token,
      actorUserId: user.id,
    });
    await patchWorkspaceRecord("connections", connectionId, { status: "connected" }, user.id);
    return redirectToConnections(request, { connected: connectionId });
  } catch (error) {
    return redirectToConnections(request, { error: error instanceof Error ? error.message : "Connexion Google impossible." });
  }
}
