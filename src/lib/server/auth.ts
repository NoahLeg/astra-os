import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

interface RawSignUpResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: AuthUser;
  session?: Partial<AuthSession> | null;
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

export const isAuthenticationEnabled = Boolean(supabaseUrl && publishableKey);

export function isSuperAdminEmail(email: string) {
  const allowedEmails = (process.env.SUPER_ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return allowedEmails.includes(email.toLowerCase());
}

export async function requireSuperAdmin(request: Request) {
  const user = await getAuthenticatedUser(request);
  return user && isSuperAdminEmail(user.email) ? user : null;
}

async function authRequest<T>(pathName: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  if (!supabaseUrl || !publishableKey) throw new Error("Supabase Auth n’est pas configuré");
  const response = await fetch(`${supabaseUrl}/auth/v1/${pathName}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { code?: string; msg?: string; message?: string; error_description?: string };
    const rawMessage = error.msg ?? error.message ?? error.error_description ?? "Authentification impossible";
    const normalized = `${error.code ?? ""} ${rawMessage}`.toLowerCase();

    if (normalized.includes("email rate limit") || normalized.includes("over_email_send_rate_limit")) {
      throw new Error("Trop d’e-mails de confirmation ont été envoyés. Attendez une heure ou désactivez temporairement Confirm Email dans Supabase pour vos tests.");
    }
    if (normalized.includes("email not confirmed") || normalized.includes("email_not_confirmed")) {
      throw new Error("Votre adresse email n’est pas encore confirmée. Ouvrez le lien reçu par email ou désactivez temporairement Confirm Email dans Supabase.");
    }
    if (normalized.includes("user already registered") || normalized.includes("user_already_exists")) {
      throw new Error("Un compte existe déjà avec cette adresse. Utilisez l’onglet Connexion.");
    }
    if (normalized.includes("invalid login credentials") || normalized.includes("invalid_credentials")) {
      throw new Error("Adresse email ou mot de passe incorrect.");
    }

    throw new Error(rawMessage);
  }
  return response.json() as Promise<T>;
}

export function signInWithPassword(email: string, password: string) {
  return authRequest<AuthSession>("token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function signUpWithPassword(email: string, password: string, metadata: Record<string, string>, redirectTo: string): Promise<AuthSession> {
  const payload = await authRequest<RawSignUpResponse>(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, { method: "POST", body: JSON.stringify({ email, password, data: metadata }) });
  const session = payload.session ?? payload;
  const user = session.user ?? payload.user ?? (payload.id ? { id: payload.id, email: payload.email ?? email, user_metadata: payload.user_metadata } : undefined);

  if (!user?.id) throw new Error("Supabase n’a pas renvoyé l’utilisateur créé.");

  return {
    access_token: session.access_token ?? "",
    refresh_token: session.refresh_token ?? "",
    expires_in: session.expires_in ?? 0,
    user,
  };
}

export function requestPasswordReset(email: string, redirectTo: string) {
  return authRequest<Record<string, never>>(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: "POST", body: JSON.stringify({ email }) });
}

export function updatePassword(accessToken: string, password: string) {
  return authRequest<{ user: AuthUser }>("user", { method: "PUT", body: JSON.stringify({ password }) }, accessToken);
}

export function updateUserMetadata(accessToken: string, data: Record<string, string>) {
  return authRequest<{ user: AuthUser }>("user", { method: "PUT", body: JSON.stringify({ data }) }, accessToken);
}

export function refreshSession(refreshToken: string) {
  return authRequest<AuthSession>("token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) });
}

export function createPkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function exchangeCodeForSession(code: string, verifier: string) {
  return authRequest<AuthSession>("token?grant_type=pkce", {
    method: "POST",
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
}

export function getUser(accessToken: string) {
  return authRequest<AuthUser>("user", { method: "GET" }, accessToken);
}

export async function signOut(accessToken: string | undefined) {
  if (!accessToken || !supabaseUrl || !publishableKey) return;
  const response = await fetch(`${supabaseUrl}/auth/v1/logout?scope=local`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("La session Supabase n'a pas pu être révoquée.");
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function getAuthenticatedUser(request: Request): Promise<AuthUser | null> {
  if (!isAuthenticationEnabled) return { id: "local", email: "demo@local.test" };
  const accessToken = readCookie(request, "astra-access-token");
  if (!accessToken) return null;
  try {
    return await getUser(decodeURIComponent(accessToken));
  } catch {
    return null;
  }
}

export function getRefreshToken(request: Request) {
  const token = readCookie(request, "astra-refresh-token");
  return token ? decodeURIComponent(token) : undefined;
}

export function getAccessToken(request: Request) {
  const token = readCookie(request, "astra-access-token");
  return token ? decodeURIComponent(token) : undefined;
}

export function applySessionCookies(response: NextResponse, session: AuthSession) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("astra-access-token", session.access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: session.expires_in, priority: "high" });
  response.cookies.set("astra-refresh-token", session.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, priority: "high" });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set("astra-access-token", "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set("astra-refresh-token", "", { httpOnly: true, path: "/", maxAge: 0 });
}
