import "server-only";

import { randomUUID } from "node:crypto";
import { subscriptionPlans } from "@/config";
import { getWorkspaceIdForUser, isSupabaseDatabaseEnabled, serverDatabaseRequest } from "@/lib/server/database";
import { getStripeClient } from "@/lib/server/stripe";
import type { Agent, BillingInvoice, EnterpriseQuoteRequest, EnterpriseQuoteStatus, FeatureKey, SubscriptionPlan, SubscriptionStatus, WorkspaceSubscription } from "@/types";

interface SubscriptionRow {
  workspace_id: string;
  plan_id: SubscriptionPlan["id"];
  status: SubscriptionStatus;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  onboarding_completed_at?: string;
  api_usage: number;
  api_usage_reset_at: string;
  api_usage_daily: number;
  api_usage_day: string;
  member_limit_override?: number;
}

type WorkspaceBillingIdentifiers = Pick<
  SubscriptionRow,
  "stripe_customer_id" | "stripe_subscription_id" | "plan_id" | "status"
>;

export class BillingAccessError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "BillingAccessError";
  }
}

function planById(planId: string | undefined) {
  return subscriptionPlans.find((plan) => plan.id === planId) ?? subscriptionPlans[0];
}

function stripeConfiguredPlans(): SubscriptionPlan["id"][] {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return [];
  return [
    ...(process.env.STRIPE_PRICE_STARTER ? ["starter" as const] : []),
    ...(process.env.STRIPE_PRICE_PRO ? ["pro" as const] : []),
    ...(process.env.STRIPE_PRICE_BUSINESS ? ["business" as const] : []),
  ];
}

function toWorkspaceSubscription(row: SubscriptionRow, plan: SubscriptionPlan, memberCount: number): WorkspaceSubscription {
  const maxMembers = plan.id === "enterprise" ? row.member_limit_override ?? plan.maxMembers : plan.maxMembers;
  return {
    workspaceId: row.workspace_id,
    planId: plan.id,
    planName: plan.name,
    status: row.status,
    apiUsage: row.api_usage,
    apiLimit: plan.apiLimit,
    dailyApiUsage: row.api_usage_day === new Date().toISOString().slice(0, 10) ? row.api_usage_daily : 0,
    dailyApiLimit: plan.dailyApiLimit,
    minuteApiLimit: plan.minuteApiLimit,
    maxAgents: plan.maxAgents,
    memberCount,
    maxMembers,
    usageResetAt: row.api_usage_reset_at,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    onboardingCompleted: Boolean(row.onboarding_completed_at),
    managedByStripe: Boolean(row.stripe_customer_id && row.stripe_subscription_id),
    features: plan.features,
    quoteOnly: Boolean(plan.quoteOnly),
    stripeConfigured: stripeConfiguredPlans().length > 0,
    stripeConfiguredPlans: stripeConfiguredPlans(),
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
    dailyApiUsage: 0,
    dailyApiLimit: plan.dailyApiLimit,
    minuteApiLimit: plan.minuteApiLimit,
    maxAgents: plan.maxAgents,
    memberCount: 1,
    maxMembers: plan.maxMembers,
    usageResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
    cancelAtPeriodEnd: false,
    onboardingCompleted: true,
    managedByStripe: false,
    features: plan.features,
    quoteOnly: Boolean(plan.quoteOnly),
    stripeConfigured: stripeConfiguredPlans().length > 0,
    stripeConfiguredPlans: stripeConfiguredPlans(),
  };
}

export function getSubscriptionPlans() {
  return subscriptionPlans;
}

export async function getWorkspaceSubscriptionByWorkspaceId(workspaceId: string): Promise<WorkspaceSubscription> {
  if (!isSupabaseDatabaseEnabled() || workspaceId === "local") return localSubscription();
  let rows = await serverDatabaseRequest<SubscriptionRow[]>(
    `workspace_subscriptions?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=workspace_id,plan_id,status,stripe_customer_id,stripe_subscription_id,current_period_end,cancel_at_period_end,onboarding_completed_at,api_usage,api_usage_reset_at,api_usage_daily,api_usage_day,member_limit_override&limit=1`,
  );
  if (!rows[0]) {
    await serverDatabaseRequest("workspace_subscriptions?on_conflict=workspace_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ workspace_id: workspaceId, plan_id: "free", status: "active" }),
    });
    rows = await serverDatabaseRequest<SubscriptionRow[]>(
      `workspace_subscriptions?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=workspace_id,plan_id,status,stripe_customer_id,stripe_subscription_id,current_period_end,cancel_at_period_end,onboarding_completed_at,api_usage,api_usage_reset_at,api_usage_daily,api_usage_day,member_limit_override&limit=1`,
    );
  }
  const row = rows[0];
  if (!row) throw new BillingAccessError("Abonnement introuvable pour cet espace.", 404);
  const members = await serverDatabaseRequest<Array<{ user_id: string }>>(
    `workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.active&select=user_id`,
  );
  return toWorkspaceSubscription(row, planById(row.plan_id), members.length);
}

export async function getWorkspaceSubscription(userId: string) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) throw new BillingAccessError("Espace de travail introuvable.", 404);
  return getWorkspaceSubscriptionByWorkspaceId(workspaceId);
}

export async function getWorkspaceBillingIdentifiers(workspaceId: string): Promise<Partial<WorkspaceBillingIdentifiers>> {
  if (!isSupabaseDatabaseEnabled()) return {};
  const rows = await serverDatabaseRequest<WorkspaceBillingIdentifiers[]>(
    `workspace_subscriptions?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=stripe_customer_id,stripe_subscription_id,plan_id,status&limit=1`,
  );
  return rows[0] ?? {};
}

export async function listWorkspaceInvoices(workspaceId: string): Promise<BillingInvoice[]> {
  const identifiers = await getWorkspaceBillingIdentifiers(workspaceId);
  if (!identifiers.stripe_customer_id || !process.env.STRIPE_SECRET_KEY) return [];
  const invoices = await getStripeClient().invoices.list({ customer: identifiers.stripe_customer_id, limit: 12 });
  return invoices.data.map((invoice) => ({
    id: invoice.id,
    number: invoice.number ?? undefined,
    status: invoice.status ?? "draft",
    amountDueCents: invoice.amount_due,
    amountPaidCents: invoice.amount_paid,
    currency: invoice.currency,
    createdAt: new Date(invoice.created * 1_000).toISOString(),
    periodStart: invoice.period_start ? new Date(invoice.period_start * 1_000).toISOString() : undefined,
    periodEnd: invoice.period_end ? new Date(invoice.period_end * 1_000).toISOString() : undefined,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? undefined,
    invoicePdfUrl: invoice.invoice_pdf ?? undefined,
  }));
}

export async function resetWorkspaceApiUsage(workspaceId: string) {
  await serverDatabaseRequest(`workspace_subscriptions?workspace_id=eq.${encodeURIComponent(workspaceId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ api_usage: 0, api_usage_reset_at: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(), api_usage_daily: 0, api_usage_day: new Date().toISOString().slice(0, 10), api_usage_minute: 0, api_usage_minute_started_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
}

export async function updateWorkspaceMemberLimit(workspaceId: string, maxMembers: number) {
  const subscription = await getWorkspaceSubscriptionByWorkspaceId(workspaceId);
  if (subscription.planId !== "enterprise") throw new BillingAccessError("La limite contractuelle de sièges est réservée à l’offre Entreprise.", 409);
  if (maxMembers < subscription.memberCount) throw new BillingAccessError(`Cette entreprise compte déjà ${subscription.memberCount} membre${subscription.memberCount > 1 ? "s" : ""} actif${subscription.memberCount > 1 ? "s" : ""}.`, 409);
  await serverDatabaseRequest(`workspace_subscriptions?workspace_id=eq.${encodeURIComponent(workspaceId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ member_limit_override: maxMembers, updated_at: new Date().toISOString() }),
  });
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

export function enforceAgentQuota(subscription: WorkspaceSubscription, agents: Agent[]) {
  const enabledCount = agents.filter((agent) => agent.enabled).length;
  if (enabledCount > subscription.maxAgents) {
    throw new BillingAccessError(`Votre offre autorise ${subscription.maxAgents} agent${subscription.maxAgents > 1 ? "s" : ""} actif${subscription.maxAgents > 1 ? "s" : ""}. Désactivez les agents excédentaires.`, 409);
  }
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
    if (message.includes("API_DAILY_QUOTA_EXCEEDED")) throw new BillingAccessError("Votre limite quotidienne d’utilisation de l’API est atteinte. Elle sera réinitialisée demain.", 429);
    if (message.includes("API_RATE_LIMIT_EXCEEDED")) throw new BillingAccessError("Trop d’appels ont été lancés en une minute. Patientez quelques instants.", 429);
    if (message.includes("SUBSCRIPTION_INACTIVE")) throw new BillingAccessError("L'abonnement de cette entreprise n'est pas actif.", 402);
    throw error;
  }
  return getWorkspaceSubscriptionByWorkspaceId(subscription.workspaceId);
}

export function getStripePriceId(planId: SubscriptionPlan["id"]) {
  if (planId === "starter") return process.env.STRIPE_PRICE_STARTER;
  if (planId === "pro") return process.env.STRIPE_PRICE_PRO;
  if (planId === "business") return process.env.STRIPE_PRICE_BUSINESS;
  return undefined;
}

export function getPlanIdFromStripePrice(priceId: string | undefined) {
  if (priceId && priceId === process.env.STRIPE_PRICE_STARTER) return "starter" as const;
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

async function suspendMembersAbovePlanLimit(workspaceId: string, plan: SubscriptionPlan) {
  if (!isSupabaseDatabaseEnabled()) return;
  const members = await serverDatabaseRequest<Array<{ user_id: string; role: string; created_at: string }>>(
    `workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.active&select=user_id,role,created_at&order=created_at.asc`,
  );
  if (members.length <= plan.maxMembers) return;

  const orderedMembers = [...members].sort((left, right) => {
    if (left.role === "owner") return -1;
    if (right.role === "owner") return 1;
    return left.created_at.localeCompare(right.created_at);
  });
  const suspendedUserIds = orderedMembers.slice(plan.maxMembers).map((member) => member.user_id);
  if (!suspendedUserIds.length) return;

  await serverDatabaseRequest(
    `workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=in.(${suspendedUserIds.join(",")})`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "suspended", updated_at: new Date().toISOString() }),
    },
  );
  await serverDatabaseRequest("audit_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      workspace_id: workspaceId,
      actor_user_id: null,
      action: "subscription.excess_members_suspended",
      target_type: "workspace_subscription",
      target_id: workspaceId,
      metadata: { planId: plan.id, maxMembers: plan.maxMembers, suspendedUserIds },
    }),
  });
}

export async function updateWorkspaceSubscriptionFromStripe(input: {
  workspaceId: string;
  planId: SubscriptionPlan["id"];
  status: SubscriptionStatus;
  customerId?: string;
  subscriptionId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  onboardingCompleted?: boolean;
}) {
  const targetPlan = planById(input.planId);
  await suspendMembersAbovePlanLimit(input.workspaceId, targetPlan);
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
      ...(input.planId === "enterprise" ? {} : { member_limit_override: null }),
      ...(input.onboardingCompleted ? { onboarding_completed_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    }),
  });
}

type EnterpriseQuoteInput = {
  workspaceId: string;
  requestedBy: string;
  contactName: string;
  contactEmail: string;
  companyName: string;
  seatCount: number;
  estimatedMonthlyCalls: number;
  message?: string;
};

type EnterpriseQuoteRow = {
  id: string;
  workspace_id: string;
  requested_by: string;
  contact_name: string;
  contact_email: string;
  company_name: string;
  seat_count: number;
  estimated_monthly_calls: number;
  message?: string;
  status: EnterpriseQuoteStatus;
  created_at: string;
  updated_at: string;
};

function toEnterpriseQuote(row: EnterpriseQuoteRow): EnterpriseQuoteRequest {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    requestedBy: row.requested_by,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    companyName: row.company_name,
    seatCount: row.seat_count,
    estimatedMonthlyCalls: row.estimated_monthly_calls,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createEnterpriseQuoteRequest(input: EnterpriseQuoteInput): Promise<EnterpriseQuoteRequest> {
  if (!isSupabaseDatabaseEnabled()) {
    const now = new Date().toISOString();
    return { id: randomUUID(), ...input, status: "pending", createdAt: now, updatedAt: now };
  }
  const rows = await serverDatabaseRequest<EnterpriseQuoteRow[]>("enterprise_quote_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      workspace_id: input.workspaceId,
      requested_by: input.requestedBy,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      company_name: input.companyName,
      seat_count: input.seatCount,
      estimated_monthly_calls: input.estimatedMonthlyCalls,
      message: input.message || null,
    }),
  });
  if (!rows[0]) throw new Error("La demande de devis n’a pas pu être enregistrée.");
  return toEnterpriseQuote(rows[0]);
}

export async function listEnterpriseQuoteRequests(workspaceId: string): Promise<EnterpriseQuoteRequest[]> {
  if (!isSupabaseDatabaseEnabled()) return [];
  const rows = await serverDatabaseRequest<EnterpriseQuoteRow[]>(
    `enterprise_quote_requests?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id,workspace_id,requested_by,contact_name,contact_email,company_name,seat_count,estimated_monthly_calls,message,status,created_at,updated_at&order=created_at.desc`,
  );
  return rows.map(toEnterpriseQuote);
}

export async function updateEnterpriseQuoteStatus(workspaceId: string, quoteId: string, status: EnterpriseQuoteStatus) {
  await serverDatabaseRequest(`enterprise_quote_requests?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(quoteId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
}
