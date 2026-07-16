import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceIdForUser, hasWorkspaceAccess, patchWorkspaceRecord } from "@/lib/server/database";
import { exchangeGoogleAuthorizationCode, googleConnectionIds, isGoogleConnectionId } from "@/lib/server/google-oauth";
import { requireSubscriptionFeature } from "@/lib/server/billing";
import { getStoredGoogleCredential, saveGoogleWorkspaceCredential } from "@/lib/server/google-credentials";

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
    await requireSubscriptionFeature(user.id, "connectors");
    const workspaceId = await getWorkspaceIdForUser(user.id);
    if (!workspaceId) throw new Error("Aucun espace de travail associé à ce compte.");
    const existingCredential = await getStoredGoogleCredential({ workspaceId, actorUserId: user.id, connectionId });
    const token = await exchangeGoogleAuthorizationCode({ code, requestUrl: request.url });
    const refreshToken = token.refresh_token ?? existingCredential?.refreshToken;
    if (!refreshToken) throw new Error("Google n’a pas fourni de jeton persistant. Révoquez l’accès Astra dans votre compte Google puis reconnectez-vous.");

    await saveGoogleWorkspaceCredential({
      workspaceId,
      actorUserId: user.id,
      refreshToken,
    });
    await Promise.all(googleConnectionIds.map((id) => patchWorkspaceRecord("connections", id, { status: "connected" }, user.id)));
    return redirectToConnections(request, { connected: "google-workspace" });
  } catch (error) {
    return redirectToConnections(request, { error: error instanceof Error ? error.message : "Connexion Google impossible." });
  }
}
