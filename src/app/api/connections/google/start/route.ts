import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { createGoogleAuthorizationUrl, isGoogleConnectionId } from "@/lib/server/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.redirect(new URL("/login?next=/connections", request.url));

  const connectionId = request.nextUrl.searchParams.get("connectionId") ?? "";
  if (!isGoogleConnectionId(connectionId)) return NextResponse.redirect(new URL("/connections?error=unsupported_google_connection", request.url));

  try {
    const state = `${connectionId}.${randomUUID()}`;
    const response = NextResponse.redirect(createGoogleAuthorizationUrl({ connectionId, state, requestUrl: request.url }));
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
