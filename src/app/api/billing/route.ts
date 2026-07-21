import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getSubscriptionPlans, getWorkspaceSubscription, listWorkspaceInvoices } from "@/lib/server/billing";
import { hasWorkspaceAccess } from "@/lib/server/database";
import { getAIUsageSummary } from "@/lib/server/ai-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "admin")) return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  try {
    const subscription = await getWorkspaceSubscription(user.id);
    const [invoices, usage] = await Promise.all([
      listWorkspaceInvoices(subscription.workspaceId),
      getAIUsageSummary(user.id),
    ]);
    return NextResponse.json({ plans: getSubscriptionPlans(), subscription, invoices, usage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Abonnement indisponible" }, { status: 503 });
  }
}
