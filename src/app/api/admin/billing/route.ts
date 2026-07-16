import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/server/admin-service";
import { requireSuperAdmin } from "@/lib/server/auth";
import { getStripePriceId, getWorkspaceBillingIdentifiers, getWorkspaceSubscriptionByWorkspaceId, resetWorkspaceApiUsage, updateWorkspaceSubscriptionFromStripe } from "@/lib/server/billing";
import { getStripeClient } from "@/lib/server/stripe";
import type { SubscriptionPlan, SubscriptionStatus } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ workspaceId: z.uuid(), action: z.literal("change_plan"), planId: z.enum(["free", "starter", "pro", "business"]) }),
  z.object({ workspaceId: z.uuid(), action: z.literal("reactivate") }),
  z.object({ workspaceId: z.uuid(), action: z.literal("reset_usage") }),
]);

function normalizeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled" || status === "incomplete" || status === "unpaid") return status;
  return "incomplete";
}

function stripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id;
}

async function saveStripeSubscription(workspaceId: string, planId: SubscriptionPlan["id"], subscription: Stripe.Subscription) {
  const periodEnd = subscription.items.data[0]?.current_period_end;
  await updateWorkspaceSubscriptionFromStripe({
    workspaceId,
    planId,
    status: normalizeStatus(subscription.status),
    customerId: stripeId(subscription.customer),
    subscriptionId: subscription.id,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1_000).toISOString() : undefined,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    onboardingCompleted: true,
  });
}

export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: "Accès Super Admin requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Action de facturation invalide" }, { status: 400 });

  try {
    const subscription = await getWorkspaceSubscriptionByWorkspaceId(parsed.data.workspaceId);
    const identifiers = await getWorkspaceBillingIdentifiers(parsed.data.workspaceId);

    if (parsed.data.action === "reset_usage") {
      await resetWorkspaceApiUsage(parsed.data.workspaceId);
      await writeAdminAuditLog({ workspaceId: parsed.data.workspaceId, actorUserId: admin.id, action: "subscription.usage_reset", targetType: "workspace_subscription", targetId: parsed.data.workspaceId });
      return NextResponse.json({ message: "Quota API remis à zéro." });
    }

    if (parsed.data.action === "reactivate") {
      if (!identifiers.stripe_subscription_id) return NextResponse.json({ error: "Aucun abonnement Stripe à réactiver." }, { status: 409 });
      const updated = await getStripeClient().subscriptions.update(identifiers.stripe_subscription_id, { cancel_at_period_end: false });
      await saveStripeSubscription(parsed.data.workspaceId, subscription.planId, updated);
      await writeAdminAuditLog({ workspaceId: parsed.data.workspaceId, actorUserId: admin.id, action: "subscription.reactivated", targetType: "workspace_subscription", targetId: parsed.data.workspaceId });
      return NextResponse.json({ message: "Résiliation annulée et abonnement réactivé." });
    }

    const targetPlan = parsed.data.planId;
    if (identifiers.stripe_subscription_id) {
      const stripe = getStripeClient();
      if (targetPlan === "free") {
        const updated = await stripe.subscriptions.update(identifiers.stripe_subscription_id, { cancel_at_period_end: true });
        await saveStripeSubscription(parsed.data.workspaceId, subscription.planId, updated);
        await writeAdminAuditLog({ workspaceId: parsed.data.workspaceId, actorUserId: admin.id, action: "subscription.downgrade_scheduled", targetType: "workspace_subscription", targetId: parsed.data.workspaceId, metadata: { from: subscription.planId, to: "free" } });
        return NextResponse.json({ message: "Passage à Free programmé à la fin de la période payée." });
      }
      const priceId = getStripePriceId(targetPlan);
      if (!priceId) return NextResponse.json({ error: `Le prix Stripe ${targetPlan.toUpperCase()} n’est pas configuré.` }, { status: 503 });
      const current = await stripe.subscriptions.retrieve(identifiers.stripe_subscription_id);
      const item = current.items.data[0];
      if (!item) return NextResponse.json({ error: "La ligne d’abonnement Stripe est introuvable." }, { status: 409 });
      const updated = await stripe.subscriptions.update(current.id, {
        items: [{ id: item.id, price: priceId }],
        cancel_at_period_end: false,
        proration_behavior: "create_prorations",
        metadata: { ...current.metadata, workspaceId: parsed.data.workspaceId, planId: targetPlan },
      });
      await saveStripeSubscription(parsed.data.workspaceId, targetPlan, updated);
      await writeAdminAuditLog({ workspaceId: parsed.data.workspaceId, actorUserId: admin.id, action: "subscription.plan_changed", targetType: "workspace_subscription", targetId: parsed.data.workspaceId, metadata: { from: subscription.planId, to: targetPlan, source: "stripe" } });
      return NextResponse.json({ message: `Offre Stripe changée vers ${targetPlan}. La proratisation sera appliquée.` });
    }

    await updateWorkspaceSubscriptionFromStripe({ workspaceId: parsed.data.workspaceId, planId: targetPlan, status: "active", customerId: identifiers.stripe_customer_id, onboardingCompleted: true });
    await writeAdminAuditLog({ workspaceId: parsed.data.workspaceId, actorUserId: admin.id, action: "subscription.plan_changed", targetType: "workspace_subscription", targetId: parsed.data.workspaceId, metadata: { from: subscription.planId, to: targetPlan, source: "manual_override" } });
    return NextResponse.json({ message: `Offre ${targetPlan} attribuée manuellement, sans prélèvement Stripe.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gestion de l’abonnement impossible" }, { status: 502 });
  }
}
