import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  if (pathname === "/login" || pathname === "/forgot-password" || pathname === "/api/health" || pathname.startsWith("/auth/") || pathname.startsWith("/api/auth")) return NextResponse.next();
  const hasSession = request.cookies.has("astra-access-token") || request.cookies.has("astra-refresh-token");
  if (hasSession) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
