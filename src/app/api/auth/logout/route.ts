import { NextResponse } from "next/server";
import { clearSessionCookies, getAccessToken, signOut } from "@/lib/server/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  await signOut(getAccessToken(request)).catch(() => undefined);
  clearSessionCookies(response);
  return response;
}
