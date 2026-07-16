import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceBillingIdentifiers, getWorkspaceSubscription } from "@/lib/server/billing";
import { hasWorkspaceAccess } from "@/lib/server/database";
import { getStripeClient } from "@/lib/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "admin")) return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  try {
    const subscription = await getWorkspaceSubscription(user.id);
    const identifiers = await getWorkspaceBillingIdentifiers(subscription.workspaceId);
    if (!identifiers.stripe_customer_id) return NextResponse.json({ error: "Aucun compte de facturation Stripe n'est encore associé à cet espace." }, { status: 409 });
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: identifiers.stripe_customer_id,
      return_url: `${new URL(request.url).origin}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Portail Stripe indisponible" }, { status: 502 });
  }
}
