import { NextResponse } from "next/server";
import { applySessionCookies, getAuthenticatedUser, getRefreshToken, isAuthenticationEnabled, isSuperAdminEmail, refreshSession } from "@/lib/server/auth";
import { getAccountProfile } from "@/lib/server/database";

export async function GET(request: Request) {
  if (!isAuthenticationEnabled) return NextResponse.json({ user: { id: "local", email: "demo@local.test" }, account: await getAccountProfile("local", "demo@local.test"), mode: "local" });
  const user = await getAuthenticatedUser(request);
  if (user) {
    const account = await getAccountProfile(user.id, user.email);
    if (!account || account.status === "suspended") return NextResponse.json({ error: "Ce compte est suspendu ou n’a plus accès à un espace." }, { status: 403 });
    return NextResponse.json({ user, account, isAdmin: isSuperAdminEmail(user.email) });
  }
  const refreshToken = getRefreshToken(request);
  if (!refreshToken) return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  try {
    const session = await refreshSession(refreshToken);
    const account = await getAccountProfile(session.user.id, session.user.email);
    if (!account || account.status === "suspended") return NextResponse.json({ error: "Ce compte est suspendu ou n’a plus accès à un espace." }, { status: 403 });
    const response = NextResponse.json({ user: session.user, account, isAdmin: isSuperAdminEmail(session.user.email) });
    applySessionCookies(response, session);
    return response;
  } catch {
    return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  }
}
