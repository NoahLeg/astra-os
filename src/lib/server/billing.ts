import "server-only";

import { subscriptionPlans } from "@/config";
import { getWorkspaceIdForUser, isSupabaseDatabaseEnabled, serverDatabaseRequest } from "@/lib/server/database";
import type { FeatureKey, SubscriptionPlan, SubscriptionStatus, WorkspaceSubscription } from "@/types";

interface SubscriptionRow {
  workspace_id: string;
  plan_id: SubscriptionPlan["id"];
  status: SubscriptionStatus;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  api_usage: number;
  api_usage_reset_at: string;
}

export class BillingAccessError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "BillingAccessError";
  }
}

function planById(planId: string | undefined) {
  return subscriptionPlans.find((plan) => plan.id === planId) ?? subscriptionPlans[0];
}

function stripeConfiguredForPaidPlans() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_PRICE_PRO && process.env.STRIPE_PRICE_BUSINESS);
}

function toWorkspaceSubscription(row: SubscriptionRow, plan: SubscriptionPlan): WorkspaceSubscription {
  return {
    workspaceId: row.workspace_id,
    planId: plan.id,
    planName: plan.name,
    status: row.status,
    apiUsage: row.api_usage,
    apiLimit: plan.apiLimit,
    usageResetAt: row.api_usage_reset_at,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    features: plan.features,
    stripeConfigured: stripeConfiguredForPaidPlans(),
  };
}

function localSubscription(): WorkspaceSubscription {
  const plan = planById("business");
  return {
    workspaceId: "local",
    planId: plan.id,
    planName: plan.name,
    status: "active",
    apiUsage: 0,
    apiLimit: plan.apiLimit,
    usageResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
    cancelAtPeriodEnd: false,
    features: plan.features,
    stripeConfigured: stripeConfiguredForPaidPlans(),
  };
}

export function getSubscriptionPlans() {
  return subscriptionPlans;
}

export async function getWorkspaceSubscriptionByWorkspaceId(workspaceId: string): Promise<WorkspaceSubscription> {
  if (!isSupabaseDatabaseEnabled() || workspaceId === "local") return localSubscription();
  let rows = await serverDatabaseRequest<SubscriptionRow[]>(
    `workspace_subscriptions?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=workspace_id,plan_id,status,stripe_customer_id,stripe_subscription_id,current_period_end,cancel_at_period_end,api_usage,api_usage_reset_at&limit=1`,
  );
  if (!rows[0]) {
    await serverDatabaseRequest("workspace_subscriptions?on_conflict=workspace_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ workspace_id: workspaceId, plan_id: "starter", status: "active" }),
    });
    rows = await serverDatabaseRequest<SubscriptionRow[]>(
      `workspace_subscriptions?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=workspace_id,plan_id,status,stripe_customer_id,stripe_subscription_id,current_period_end,cancel_at_period_end,api_usage,api_usage_reset_at&limit=1`,
    );
  }
  const row = rows[0];
  if (!row) throw new BillingAccessError("Abonnement introuvable pour cet espace.", 404);
  return toWorkspaceSubscription(row, planById(row.plan_id));
}

export async function getWorkspaceSubscription(userId: string) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) throw new BillingAccessError("Espace de travail introuvable.", 404);
  return getWorkspaceSubscriptionByWorkspaceId(workspaceId);
}

export async function getWorkspaceBillingIdentifiers(workspaceId: string) {
  if (!isSupabaseDatabaseEnabled()) return {};
  const rows = await serverDatabaseRequest<Array<Pick<SubscriptionRow, "stripe_customer_id" | "stripe_subscription_id" | "plan_id" | "status">>>(
    `workspace_subscriptions?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=stripe_customer_id,stripe_subscription_id,plan_id,status&limit=1`,
  );
  return rows[0] ?? {};
}

export async function requireSubscriptionFeature(userId: string, feature: FeatureKey) {
  const subscription = await getWorkspaceSubscription(userId);
  if (!(["active", "trialing"] as SubscriptionStatus[]).includes(subscription.status)) {
    throw new BillingAccessError("L'abonnement de cette entreprise n'est pas actif.", 402);
  }
  if (!subscription.features.includes(feature)) {
    throw new BillingAccessError(`La fonctionnalité « ${feature} » nécessite un abonnement supérieur.`, 402);
  }
  return subscription;
}

export async function consumeApiUsage(userId: string, feature: FeatureKey, units = 1) {
  const subscription = await requireSubscriptionFeature(userId, feature);
  if (!isSupabaseDatabaseEnabled()) return subscription;
  try {
    await serverDatabaseRequest("rpc/consume_workspace_api_usage", {
      method: "POST",
      body: JSON.stringify({ p_workspace_id: subscription.workspaceId, p_units: units }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quota API indisponible";
    if (message.includes("API_QUOTA_EXCEEDED")) throw new BillingAccessError("Votre limite mensuelle d'utilisation de l'API est atteinte.", 429);
    if (message.includes("SUBSCRIPTION_INACTIVE")) throw new BillingAccessError("L'abonnement de cette entreprise n'est pas actif.", 402);
    throw error;
  }
  return getWorkspaceSubscriptionByWorkspaceId(subscription.workspaceId);
}

export function getStripePriceId(planId: SubscriptionPlan["id"]) {
  if (planId === "pro") return process.env.STRIPE_PRICE_PRO;
  if (planId === "business") return process.env.STRIPE_PRICE_BUSINESS;
  return undefined;
}

export function getPlanIdFromStripePrice(priceId: string | undefined) {
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return "pro" as const;
  if (priceId && priceId === process.env.STRIPE_PRICE_BUSINESS) return "business" as const;
  return undefined;
}

export async function findWorkspaceIdByStripeSubscriptionId(subscriptionId: string) {
  const rows = await serverDatabaseRequest<Array<{ workspace_id: string }>>(
    `workspace_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=workspace_id&limit=1`,
  );
  return rows[0]?.workspace_id;
}

export async function updateWorkspaceSubscriptionFromStripe(input: {
  workspaceId: string;
  planId: SubscriptionPlan["id"];
  status: SubscriptionStatus;
  customerId?: string;
  subscriptionId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}) {
  await serverDatabaseRequest("workspace_subscriptions?on_conflict=workspace_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      workspace_id: input.workspaceId,
      plan_id: input.planId,
      status: input.status,
      stripe_customer_id: input.customerId ?? null,
      stripe_subscription_id: input.subscriptionId ?? null,
      current_period_end: input.currentPeriodEnd ?? null,
      cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
      updated_at: new Date().toISOString(),
    }),
  });
}
