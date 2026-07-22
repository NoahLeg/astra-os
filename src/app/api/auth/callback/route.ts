import { type NextRequest, NextResponse } from "next/server";
import { applySessionCookies, exchangeCodeForSession } from "@/lib/server/auth";
import { getWorkspaceSubscription } from "@/lib/server/billing";
import { createTenantForUser, getAccountProfile } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNext(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

function redirectToLogin(request: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.url));
  response.cookies.delete("astra-auth-code-verifier");
  response.cookies.delete("astra-auth-next");
  return response;
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error_description") ?? request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const verifier = request.cookies.get("astra-auth-code-verifier")?.value;
  const next = safeNext(request.cookies.get("astra-auth-next")?.value);
  if (error || !code || !verifier) return redirectToLogin(request, error ?? "La session de connexion a expiré. Réessayez.");

  try {
    const session = await exchangeCodeForSession(code, verifier);
    const metadata = session.user.user_metadata ?? {};
    const fullName = typeof metadata.full_name === "string" && metadata.full_name.trim()
      ? metadata.full_name.trim()
      : typeof metadata.name === "string" && metadata.name.trim()
        ? metadata.name.trim()
        : session.user.email.split("@")[0];
    const companyName = typeof metadata.company_name === "string" && metadata.company_name.trim()
      ? metadata.company_name.trim()
      : `Espace de ${fullName}`;
    await createTenantForUser({ id: session.user.id, email: session.user.email, fullName, companyName });
    const [profile, subscription] = await Promise.all([
      getAccountProfile(session.user.id, session.user.email),
      getWorkspaceSubscription(session.user.id),
    ]);
    const destination = subscription.onboardingCompleted
      ? next ?? profile?.preferences.landingPage ?? "/"
      : "/onboarding/subscription";
    const response = NextResponse.redirect(new URL(destination, request.url));
    applySessionCookies(response, session);
    response.cookies.delete("astra-auth-code-verifier");
    response.cookies.delete("astra-auth-next");
    return response;
  } catch {
    return redirectToLogin(request, "La session Google n’a pas pu être validée. Réessayez la connexion.");
  }
}
