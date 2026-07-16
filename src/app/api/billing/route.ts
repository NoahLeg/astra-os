import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getSubscriptionPlans, getWorkspaceSubscription } from "@/lib/server/billing";
import { hasWorkspaceAccess } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "admin")) return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  try {
    return NextResponse.json({ plans: getSubscriptionPlans(), subscription: await getWorkspaceSubscription(user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Abonnement indisponible" }, { status: 503 });
  }
}
