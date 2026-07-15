import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/server/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  clearSessionCookies(response);
  return response;
}
