import "server-only";

import { getPlatformOAuthCredential } from "@/lib/server/platform-admin";

export const googleConnectionIds = ["gmail", "calendar", "drive", "docs", "sheets", "slides", "contacts", "tasks"] as const;
export type GoogleConnectionId = typeof googleConnectionIds[number];

const scopes: Record<GoogleConnectionId, string[]> = {
  gmail: ["openid", "email", "https://www.googleapis.com/auth/gmail.modify"],
  calendar: ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"],
  drive: ["openid", "email", "https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"],
  docs: ["openid", "email", "https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.readonly"],
  sheets: ["openid", "email", "https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"],
  slides: ["openid", "email", "https://www.googleapis.com/auth/presentations", "https://www.googleapis.com/auth/drive.readonly"],
  contacts: ["openid", "email", "https://www.googleapis.com/auth/contacts.readonly"],
  tasks: ["openid", "email", "https://www.googleapis.com/auth/tasks", "https://www.googleapis.com/auth/tasks.readonly"],
};

export const googleWorkspaceScopes = Array.from(new Set(googleConnectionIds.flatMap((connectionId) => scopes[connectionId])));

export function getMissingGoogleWorkspaceScopes(grantedScope?: string) {
  if (!grantedScope) return googleWorkspaceScopes.filter((scope) => scope.startsWith("https://"));
  const granted = new Set(grantedScope.split(/\s+/).filter(Boolean));
  return googleWorkspaceScopes.filter((scope) => scope.startsWith("https://") && !granted.has(scope));
}

async function getCredentials() {
  const stored = await getPlatformOAuthCredential("google-workspace").catch(() => undefined);
  const clientId = stored?.integration.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = stored?.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Configurez Google OAuth dans la console Super Admin.");
  return { clientId, clientSecret, redirectUri: stored?.integration.redirectUri };
}

export function isGoogleConnectionId(value: string): value is GoogleConnectionId {
  return googleConnectionIds.includes(value as GoogleConnectionId);
}

export async function getGoogleRedirectUri(requestUrl: string) {
  const credentials = await getCredentials();
  return credentials.redirectUri || process.env.GOOGLE_REDIRECT_URI?.trim() || `${new URL(requestUrl).origin}/api/connections/google/callback`;
}

export async function createGoogleAuthorizationUrl(input: { state: string; requestUrl: string; forceConsent: boolean }) {
  const { clientId } = await getCredentials();
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: await getGoogleRedirectUri(input.requestUrl),
    response_type: "code",
    scope: googleWorkspaceScopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    state: input.state,
  }).toString();
  if (input.forceConsent) authorizationUrl.searchParams.set("prompt", "consent");
  return authorizationUrl;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

async function tokenRequest(parameters: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error_description?: string; error?: string };
    throw new Error(error.error_description ?? error.error ?? "Google a refusé l’autorisation OAuth.");
  }
  return response.json() as Promise<GoogleTokenResponse>;
}

export async function exchangeGoogleAuthorizationCode(input: { code: string; requestUrl: string }) {
  const { clientId, clientSecret } = await getCredentials();
  return tokenRequest({ code: input.code, client_id: clientId, client_secret: clientSecret, redirect_uri: await getGoogleRedirectUri(input.requestUrl), grant_type: "authorization_code" });
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = await getCredentials();
  return tokenRequest({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" });
}

export async function revokeGoogleToken(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
}

export function getGoogleTestEndpoint(connectionId: GoogleConnectionId) {
  if (connectionId === "gmail") return "https://gmail.googleapis.com/gmail/v1/users/me/profile";
  if (connectionId === "calendar") return "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1";
  if (connectionId === "drive") return "https://www.googleapis.com/drive/v3/about?fields=user";
  if (connectionId === "docs") {
    return "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id,name)&q=mimeType%3D%27application%2Fvnd.google-apps.document%27";
  }
  if (connectionId === "sheets") {
    return "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id,name)&q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27";
  }
  if (connectionId === "slides") {
    return "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id,name)&q=mimeType%3D%27application%2Fvnd.google-apps.presentation%27";
  }
  if (connectionId === "contacts") return "https://people.googleapis.com/v1/people/me/connections?pageSize=1&personFields=names,emailAddresses";
  return "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1";
}
