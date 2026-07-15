import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/server/database";
import { isAuthenticationEnabled } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await checkDatabaseHealth();
    return NextResponse.json({ status: "healthy", database, authentication: isAuthenticationEnabled ? "configured" : "local", timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "unhealthy", timestamp: new Date().toISOString() }, { status: 503 });
  }
}
