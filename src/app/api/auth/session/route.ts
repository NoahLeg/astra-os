import { NextResponse } from "next/server";
import { applySessionCookies, getAuthenticatedUser, getRefreshToken, isAuthenticationEnabled, isSuperAdminEmail, refreshSession } from "@/lib/server/auth";

export async function GET(request: Request) {
  if (!isAuthenticationEnabled) return NextResponse.json({ user: { id: "local", email: "demo@local.test" }, mode: "local" });
  const user = await getAuthenticatedUser(request);
  if (user) return NextResponse.json({ user, isAdmin: isSuperAdminEmail(user.email) });
  const refreshToken = getRefreshToken(request);
  if (!refreshToken) return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  try {
    const session = await refreshSession(refreshToken);
    const response = NextResponse.json({ user: session.user, isAdmin: isSuperAdminEmail(session.user.email) });
    applySessionCookies(response, session);
    return response;
  } catch {
    return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  }
}
