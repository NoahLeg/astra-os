import { type NextRequest, NextResponse } from "next/server";
import { isAuthenticationEnabled } from "@/lib/server/auth";

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
  const callback = new URL("/auth/callback", request.url);
  callback.searchParams.set("next", next);

  const authorizationUrl = new URL("/auth/v1/authorize", process.env.SUPABASE_URL);
  authorizationUrl.searchParams.set("provider", "google");
  authorizationUrl.searchParams.set("redirect_to", callback.toString());
  return NextResponse.redirect(authorizationUrl);
}
