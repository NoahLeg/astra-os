import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { findWorkspaceIdByStripeSubscriptionId, getPlanIdFromStripePrice, updateWorkspaceSubscriptionFromStripe } from "@/lib/server/billing";
import { getStripeClient } from "@/lib/server/stripe";
import type { SubscriptionPlan, SubscriptionStatus } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id;
}

function normalizeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled" || status === "incomplete" || status === "unpaid") return status;
  return "incomplete";
}

async function syncSubscription(subscription: Stripe.Subscription, fallback?: { workspaceId?: string; planId?: SubscriptionPlan["id"] }) {
  const workspaceId = subscription.metadata.workspaceId || fallback?.workspaceId || await findWorkspaceIdByStripeSubscriptionId(subscription.id);
  const priceId = subscription.items.data[0]?.price.id;
  const planId = (subscription.metadata.planId as SubscriptionPlan["id"] | undefined) || fallback?.planId || getPlanIdFromStripePrice(priceId);
  if (!workspaceId || !planId) throw new Error("Métadonnées Stripe incomplètes : workspaceId ou planId manquant.");
  const periodEnd = subscription.items.data[0]?.current_period_end;
  await updateWorkspaceSubscriptionFromStripe({
    workspaceId,
    planId,
    status: normalizeStatus(subscription.status),
    customerId: stripeId(subscription.customer),
    subscriptionId: subscription.id,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1_000).toISOString() : undefined,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!webhookSecret || !signature) return NextResponse.json({ error: "Webhook Stripe non configuré" }, { status: 503 });
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Signature Stripe invalide" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = stripeId(session.subscription);
      if (subscriptionId) {
        const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
        await syncSubscription(subscription, {
          workspaceId: session.metadata?.workspaceId || session.client_reference_id || undefined,
          planId: session.metadata?.planId as SubscriptionPlan["id"] | undefined,
        });
      }
    }
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Synchronisation Stripe impossible" }, { status: 500 });
  }
}
