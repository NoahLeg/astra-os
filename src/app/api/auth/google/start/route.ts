import { type NextRequest, NextResponse } from "next/server";
import { createPkcePair, isAuthenticationEnabled } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  if (!isAuthenticationEnabled || !process.env.SUPABASE_URL) {
    return NextResponse.redirect(new URL("/login?error=Supabase%20Auth%20n%E2%80%99est%20pas%20configur%C3%A9", request.url));
  }

  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const callback = new URL("/api/auth/callback", request.url);
  const { verifier, challenge } = createPkcePair();

  const authorizationUrl = new URL("/auth/v1/authorize", process.env.SUPABASE_URL);
  authorizationUrl.searchParams.set("provider", "google");
  authorizationUrl.searchParams.set("redirect_to", callback.toString());
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "s256");

  const response = NextResponse.redirect(authorizationUrl);
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("astra-auth-code-verifier", verifier, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/auth/callback",
    maxAge: 10 * 60,
  });
  response.cookies.set("astra-auth-next", next, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/auth/callback",
    maxAge: 10 * 60,
  });
  return response;
}
