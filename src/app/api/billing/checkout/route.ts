import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getStripePriceId, getSubscriptionPlans, getWorkspaceBillingIdentifiers, getWorkspaceSubscription, updateWorkspaceSubscriptionFromStripe } from "@/lib/server/billing";
import { hasWorkspaceAccess } from "@/lib/server/database";
import { getStripeClient } from "@/lib/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  planId: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,39}$/),
  returnTo: z.enum(["billing", "onboarding"]).default("billing"),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "admin")) return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Offre invalide" }, { status: 400 });
  if (parsed.data.planId === "enterprise") return NextResponse.json({ error: "L’offre Entreprise est disponible uniquement sur devis." }, { status: 400 });

  try {
    const subscription = await getWorkspaceSubscription(user.id);
    const targetPlan = (await getSubscriptionPlans()).find((plan) => plan.id === parsed.data.planId);
    if (targetPlan && subscription.memberCount > targetPlan.maxMembers) {
      return NextResponse.json({ error: `Cette offre autorise ${targetPlan.maxMembers} siège${targetPlan.maxMembers > 1 ? "s" : ""}. Suspendez d’abord les membres excédentaires.` }, { status: 409 });
    }
    const identifiers = await getWorkspaceBillingIdentifiers(subscription.workspaceId);
    const returnPath = parsed.data.returnTo === "onboarding" ? "/onboarding/subscription" : "/billing";
    const returnUrl = `${new URL(request.url).origin}${returnPath}`;
    if (identifiers.stripe_customer_id && identifiers.stripe_subscription_id) {
      const stripe = await getStripeClient();
      const portal = await stripe.billingPortal.sessions.create({ customer: identifiers.stripe_customer_id, return_url: returnUrl });
      return NextResponse.json({ url: portal.url });
    }
    if (parsed.data.planId === "free") {
      await updateWorkspaceSubscriptionFromStripe({ workspaceId: subscription.workspaceId, planId: "free", status: "active", onboardingCompleted: true });
      return NextResponse.json({ url: `${returnUrl}?checkout=success` });
    }
    const stripe = await getStripeClient();
    const priceId = await getStripePriceId(parsed.data.planId);
    if (!priceId) return NextResponse.json({ error: `Le prix Stripe ${parsed.data.planId.toUpperCase()} n'est pas configuré sur Vercel.` }, { status: 503 });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnUrl}?checkout=success`,
      cancel_url: `${returnUrl}?checkout=cancelled`,
      allow_promotion_codes: true,
      client_reference_id: subscription.workspaceId,
      ...(identifiers.stripe_customer_id ? { customer: identifiers.stripe_customer_id } : { customer_email: user.email }),
      metadata: { workspaceId: subscription.workspaceId, planId: parsed.data.planId },
      subscription_data: { metadata: { workspaceId: subscription.workspaceId, planId: parsed.data.planId } },
    });
    if (!session.url) throw new Error("Stripe n'a pas renvoyé d'URL de paiement.");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Création du paiement impossible" }, { status: 502 });
  }
}
