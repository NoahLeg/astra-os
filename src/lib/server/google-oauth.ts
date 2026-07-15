import "server-only";

export const googleConnectionIds = ["gmail", "calendar", "drive"] as const;
export type GoogleConnectionId = typeof googleConnectionIds[number];

const scopes: Record<GoogleConnectionId, string[]> = {
  gmail: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
  ],
  calendar: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  drive: [
    "openid",
    "email",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive.file",
  ],
};

function getCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET doivent être configurés côté serveur.");
  return { clientId, clientSecret };
}

export function isGoogleConnectionId(value: string): value is GoogleConnectionId {
  return googleConnectionIds.includes(value as GoogleConnectionId);
}

export function getGoogleRedirectUri(requestUrl: string) {
  return process.env.GOOGLE_REDIRECT_URI?.trim() || `${new URL(requestUrl).origin}/api/connections/google/callback`;
}

export function createGoogleAuthorizationUrl(input: { connectionId: GoogleConnectionId; state: string; requestUrl: string }) {
  const { clientId } = getCredentials();
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleRedirectUri(input.requestUrl),
    response_type: "code",
    scope: scopes[input.connectionId].join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: input.state,
  }).toString();
  return authorizationUrl;
}

interface GoogleTokenResponse {
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

export function exchangeGoogleAuthorizationCode(input: { code: string; requestUrl: string }) {
  const { clientId, clientSecret } = getCredentials();
  return tokenRequest({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getGoogleRedirectUri(input.requestUrl),
    grant_type: "authorization_code",
  });
}

export function refreshGoogleAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getCredentials();
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
}

export async function revokeGoogleToken(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export function getGoogleTestEndpoint(connectionId: GoogleConnectionId) {
  if (connectionId === "gmail") return "https://gmail.googleapis.com/gmail/v1/users/me/profile";
  if (connectionId === "calendar") return "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1";
  return "https://www.googleapis.com/drive/v3/about?fields=user";
}
