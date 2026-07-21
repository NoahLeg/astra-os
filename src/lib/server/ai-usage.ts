import "server-only";

import { randomUUID } from "node:crypto";
import { ensureLocalDatabaseColumn, getLocalDatabase, getWorkspaceIdForUser, isSupabaseDatabaseEnabled, serverDatabaseRequest } from "@/lib/server/database";
import type { AIUsageEvent, AIUsageSummary, FeatureKey } from "@/types";

const NANO_USD_PER_USD = 1_000_000_000;
const TOKENS_PER_PRICE_UNIT = 1_000_000;

interface ModelPricingRow {
  provider: string;
  model_pattern: string;
  input_nano_usd_per_million: number | string;
  cached_input_nano_usd_per_million?: number | string | null;
  output_nano_usd_per_million: number | string;
  long_context_threshold_tokens?: number | string | null;
  long_context_input_multiplier: number | string;
  long_context_output_multiplier: number | string;
}

interface PricingDefinition {
  provider: string;
  modelPattern: string;
  inputRate: bigint;
  cachedInputRate?: bigint;
  outputRate: bigint;
  longContextThreshold?: number;
  longContextInputMultiplier: string;
  longContextOutputMultiplier: string;
}

interface UsageRow {
  id: string;
  feature: FeatureKey;
  provider: string;
  model: string;
  provider_request_id?: string;
  input_tokens: number | string;
  cached_input_tokens: number | string;
  output_tokens: number | string;
  reasoning_tokens: number | string;
  total_tokens: number | string;
  input_cost_nano_usd?: number | string | null;
  cached_input_cost_nano_usd?: number | string | null;
  output_cost_nano_usd?: number | string | null;
  total_cost_nano_usd?: number | string | null;
  pricing_status: "exact" | "unpriced";
  created_at: string;
}

export interface ProviderTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface UsageCost {
  inputCostNanoUsd?: number;
  cachedInputCostNanoUsd?: number;
  outputCostNanoUsd?: number;
  totalCostNanoUsd?: number;
  pricingStatus: "exact" | "unpriced";
}

const fallbackPricing: PricingDefinition[] = [
  { provider: "openai", modelPattern: "gpt-5.4-pro", inputRate: 30_000_000_000n, outputRate: 180_000_000_000n, longContextThreshold: 272_000, longContextInputMultiplier: "2", longContextOutputMultiplier: "1.5" },
  { provider: "openai", modelPattern: "gpt-5.4-mini", inputRate: 750_000_000n, cachedInputRate: 75_000_000n, outputRate: 4_500_000_000n, longContextInputMultiplier: "1", longContextOutputMultiplier: "1" },
  { provider: "openai", modelPattern: "gpt-5.4-nano", inputRate: 200_000_000n, cachedInputRate: 20_000_000n, outputRate: 1_250_000_000n, longContextInputMultiplier: "1", longContextOutputMultiplier: "1" },
  { provider: "openai", modelPattern: "gpt-5.4", inputRate: 2_500_000_000n, cachedInputRate: 250_000_000n, outputRate: 15_000_000_000n, longContextThreshold: 272_000, longContextInputMultiplier: "2", longContextOutputMultiplier: "1.5" },
  { provider: "openai", modelPattern: "gpt-5.5", inputRate: 5_000_000_000n, cachedInputRate: 500_000_000n, outputRate: 30_000_000_000n, longContextThreshold: 272_000, longContextInputMultiplier: "2", longContextOutputMultiplier: "1.5" },
];

function asNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asBigInt(value: number | string | null | undefined) {
  if (value === null || value === undefined) return undefined;
  try { return BigInt(String(value)); } catch { return undefined; }
}

function mapPricing(row: ModelPricingRow): PricingDefinition | undefined {
  const inputRate = asBigInt(row.input_nano_usd_per_million);
  const outputRate = asBigInt(row.output_nano_usd_per_million);
  if (inputRate === undefined || outputRate === undefined) return undefined;
  return {
    provider: row.provider,
    modelPattern: row.model_pattern,
    inputRate,
    cachedInputRate: asBigInt(row.cached_input_nano_usd_per_million),
    outputRate,
    longContextThreshold: asNumber(row.long_context_threshold_tokens),
    longContextInputMultiplier: String(row.long_context_input_multiplier || 1),
    longContextOutputMultiplier: String(row.long_context_output_multiplier || 1),
  };
}

function matchesModel(model: string, pattern: string) {
  return model === pattern || model.startsWith(`${pattern}-`);
}

async function getPricing(provider: string, model: string) {
  let definitions = fallbackPricing;
  if (isSupabaseDatabaseEnabled()) {
    try {
      const rows = await serverDatabaseRequest<ModelPricingRow[]>(
        `model_pricing?provider=eq.${encodeURIComponent(provider)}&active=eq.true&effective_from=lte.${encodeURIComponent(new Date().toISOString())}&or=(effective_until.is.null,effective_until.gt.${encodeURIComponent(new Date().toISOString())})&select=provider,model_pattern,input_nano_usd_per_million,cached_input_nano_usd_per_million,output_nano_usd_per_million,long_context_threshold_tokens,long_context_input_multiplier,long_context_output_multiplier&order=effective_from.desc`,
      );
      const mapped = rows.map(mapPricing).filter((item): item is PricingDefinition => Boolean(item));
      if (mapped.length) definitions = mapped;
    } catch (error) {
      console.error("[ai-usage] Impossible de charger le catalogue tarifaire, catalogue embarqué utilisé.", error);
    }
  }
  return definitions
    .filter((item) => item.provider === provider && matchesModel(model, item.modelPattern))
    .sort((left, right) => right.modelPattern.length - left.modelPattern.length)[0];
}

function multiplierRatio(multiplier: string) {
  const normalized = /^\d+(?:\.\d+)?$/.test(multiplier) ? multiplier : "1";
  const [integer, decimals = ""] = normalized.split(".");
  const denominator = 10n ** BigInt(decimals.length);
  return { numerator: BigInt(`${integer}${decimals}`), denominator };
}

function priceTokens(tokens: number, rate: bigint, multiplier: string) {
  const ratio = multiplierRatio(multiplier);
  const divisor = BigInt(TOKENS_PER_PRICE_UNIT) * ratio.denominator;
  const numerator = BigInt(tokens) * rate * ratio.numerator;
  return Number((numerator + divisor / 2n) / divisor);
}

export async function calculateUsageCost(provider: string, model: string, usage: ProviderTokenUsage): Promise<UsageCost> {
  const pricing = await getPricing(provider, model);
  if (!pricing) return { pricingStatus: "unpriced" };
  const cachedInputTokens = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const regularInputTokens = Math.max(0, usage.inputTokens - cachedInputTokens);
  const longContext = Boolean(pricing.longContextThreshold && usage.inputTokens > pricing.longContextThreshold);
  const inputMultiplier = longContext ? pricing.longContextInputMultiplier : "1";
  const outputMultiplier = longContext ? pricing.longContextOutputMultiplier : "1";
  const inputCostNanoUsd = priceTokens(regularInputTokens, pricing.inputRate, inputMultiplier);
  const cachedInputCostNanoUsd = priceTokens(cachedInputTokens, pricing.cachedInputRate ?? pricing.inputRate, inputMultiplier);
  const outputCostNanoUsd = priceTokens(usage.outputTokens, pricing.outputRate, outputMultiplier);
  return {
    inputCostNanoUsd,
    cachedInputCostNanoUsd,
    outputCostNanoUsd,
    totalCostNanoUsd: inputCostNanoUsd + cachedInputCostNanoUsd + outputCostNanoUsd,
    pricingStatus: "exact",
  };
}

function ensureLocalUsageSchema() {
  getLocalDatabase().exec(`
    CREATE TABLE IF NOT EXISTS ai_usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      feature TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      provider_request_id TEXT,
      input_tokens INTEGER NOT NULL,
      cached_input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      reasoning_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      input_cost_nano_usd INTEGER,
      cached_input_cost_nano_usd INTEGER,
      output_cost_nano_usd INTEGER,
      total_cost_nano_usd INTEGER,
      pricing_status TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      error_message TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx ON ai_usage_events(created_at DESC);
  `);
  ensureLocalDatabaseColumn("ai_usage_events", "input_cost_nano_usd", "INTEGER");
  ensureLocalDatabaseColumn("ai_usage_events", "cached_input_cost_nano_usd", "INTEGER");
  ensureLocalDatabaseColumn("ai_usage_events", "output_cost_nano_usd", "INTEGER");
  ensureLocalDatabaseColumn("ai_usage_events", "total_cost_nano_usd", "INTEGER");
}

function mapUsageRow(row: UsageRow): AIUsageEvent {
  return {
    id: row.id,
    feature: row.feature,
    provider: row.provider,
    model: row.model,
    providerRequestId: row.provider_request_id,
    inputTokens: asNumber(row.input_tokens) ?? 0,
    cachedInputTokens: asNumber(row.cached_input_tokens) ?? 0,
    outputTokens: asNumber(row.output_tokens) ?? 0,
    reasoningTokens: asNumber(row.reasoning_tokens) ?? 0,
    totalTokens: asNumber(row.total_tokens) ?? 0,
    inputCostNanoUsd: asNumber(row.input_cost_nano_usd),
    cachedInputCostNanoUsd: asNumber(row.cached_input_cost_nano_usd),
    outputCostNanoUsd: asNumber(row.output_cost_nano_usd),
    totalCostNanoUsd: asNumber(row.total_cost_nano_usd),
    pricingStatus: row.pricing_status,
    createdAt: row.created_at,
  };
}

export async function authorizeAIRequest(userId: string, feature: FeatureKey, reservation: {
  id: string;
  provider: string;
  model: string;
  reservedTokens: number;
}, requests = 1, workspaceId?: string) {
  const { BillingAccessError, getWorkspaceSubscriptionByWorkspaceId, requireSubscriptionFeature } = await import("@/lib/server/billing");
  const subscription = workspaceId
    ? await getWorkspaceSubscriptionByWorkspaceId(workspaceId)
    : await requireSubscriptionFeature(userId, feature);
  if (workspaceId && !["active", "trialing"].includes(subscription.status)) throw new BillingAccessError("L'abonnement de cette entreprise n'est pas actif.", 402);
  if (workspaceId && !subscription.features.includes(feature)) throw new BillingAccessError(`La fonctionnalité « ${feature} » nécessite un abonnement supérieur.`, 402);
  if (!isSupabaseDatabaseEnabled()) return subscription;
  try {
    await serverDatabaseRequest("rpc/authorize_workspace_ai_request", {
      method: "POST",
      body: JSON.stringify({
        p_id: reservation.id,
        p_workspace_id: subscription.workspaceId,
        p_user_id: userId,
        p_feature: feature,
        p_provider: reservation.provider,
        p_model: reservation.model,
        p_reserved_tokens: reservation.reservedTokens,
        p_requests: requests,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quota IA indisponible";
    if (message.includes("TOKEN_QUOTA_EXCEEDED")) throw new BillingAccessError("Votre quota mensuel de tokens est atteint.", 429);
    if (message.includes("TOKEN_DAILY_QUOTA_EXCEEDED")) throw new BillingAccessError("Votre quota quotidien de tokens est atteint.", 429);
    if (message.includes("API_RATE_LIMIT_EXCEEDED")) throw new BillingAccessError("Trop de requêtes IA ont été lancées en une minute.", 429);
    if (message.includes("BUDGET_LIMIT_EXCEEDED")) throw new BillingAccessError("Le budget IA mensuel de cette entreprise est atteint.", 402);
    if (message.includes("SUBSCRIPTION_INACTIVE")) throw new BillingAccessError("L'abonnement de cette entreprise n'est pas actif.", 402);
    throw error;
  }
  return subscription;
}

export async function recordAIUsage(input: {
  id?: string;
  userId: string;
  feature: FeatureKey;
  provider: string;
  model: string;
  providerRequestId?: string;
  usage: ProviderTokenUsage;
  pricingUnavailable?: boolean;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}) {
  const id = input.id ?? randomUUID();
  const cost: UsageCost = input.pricingUnavailable
    ? { pricingStatus: "unpriced" }
    : await calculateUsageCost(input.provider, input.model, input.usage);
  const createdAt = new Date().toISOString();
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = input.workspaceId ?? await getWorkspaceIdForUser(input.userId);
    if (!workspaceId) throw new Error("Espace de travail introuvable pour enregistrer l'utilisation IA.");
    const rows = await serverDatabaseRequest<UsageRow[]>("rpc/record_workspace_ai_usage", {
      method: "POST",
      body: JSON.stringify({
        p_id: id,
        p_workspace_id: workspaceId,
        p_user_id: input.userId,
        p_feature: input.feature,
        p_provider: input.provider,
        p_model: input.model,
        p_provider_request_id: input.providerRequestId ?? null,
        p_input_tokens: input.usage.inputTokens,
        p_cached_input_tokens: input.usage.cachedInputTokens,
        p_output_tokens: input.usage.outputTokens,
        p_reasoning_tokens: input.usage.reasoningTokens,
        p_total_tokens: input.usage.totalTokens,
        p_input_cost_nano_usd: cost.inputCostNanoUsd ?? null,
        p_cached_input_cost_nano_usd: cost.cachedInputCostNanoUsd ?? null,
        p_output_cost_nano_usd: cost.outputCostNanoUsd ?? null,
        p_total_cost_nano_usd: cost.totalCostNanoUsd ?? null,
        p_pricing_status: cost.pricingStatus,
        p_metadata: input.metadata ?? {},
      }),
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("L'utilisation IA n'a pas pu être enregistrée.");
    return mapUsageRow(row);
  }

  ensureLocalUsageSchema();
  getLocalDatabase().prepare(`
    INSERT OR IGNORE INTO ai_usage_events (
      id, user_id, feature, provider, model, provider_request_id,
      input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens,
      input_cost_nano_usd, cached_input_cost_nano_usd, output_cost_nano_usd,
      total_cost_nano_usd, pricing_status, metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.userId, input.feature, input.provider, input.model, input.providerRequestId ?? null,
    input.usage.inputTokens, input.usage.cachedInputTokens, input.usage.outputTokens, input.usage.reasoningTokens, input.usage.totalTokens,
    cost.inputCostNanoUsd ?? null, cost.cachedInputCostNanoUsd ?? null, cost.outputCostNanoUsd ?? null,
    cost.totalCostNanoUsd ?? null, cost.pricingStatus, JSON.stringify(input.metadata ?? {}), createdAt,
  );
  return {
    id,
    feature: input.feature,
    provider: input.provider,
    model: input.model,
    providerRequestId: input.providerRequestId,
    ...input.usage,
    ...cost,
    createdAt,
  } satisfies AIUsageEvent;
}

export async function recordFailedAIRequest(input: {
  id: string;
  userId: string;
  feature: FeatureKey;
  provider: string;
  model: string;
  providerRequestId?: string;
  errorMessage: string;
  workspaceId?: string;
}) {
  try {
    if (isSupabaseDatabaseEnabled()) {
      const workspaceId = input.workspaceId ?? await getWorkspaceIdForUser(input.userId);
      if (!workspaceId) return;
      try {
        await serverDatabaseRequest("rpc/release_workspace_ai_reservation", {
          method: "POST",
          body: JSON.stringify({ p_id: input.id, p_workspace_id: workspaceId }),
        });
      } catch (error) {
        console.error("[ai-usage] La réservation de tokens sera libérée automatiquement à expiration.", error);
      }
      await serverDatabaseRequest("ai_usage_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: input.id,
          workspace_id: workspaceId,
          user_id: input.userId,
          feature: input.feature,
          provider: input.provider,
          model: input.model,
          provider_request_id: input.providerRequestId ?? null,
          status: "failed",
          pricing_status: "unpriced",
          error_message: input.errorMessage.slice(0, 2_000),
        }),
      });
      return;
    }
    ensureLocalUsageSchema();
    getLocalDatabase().prepare(`
      INSERT OR IGNORE INTO ai_usage_events (
        id, user_id, feature, provider, model, provider_request_id, input_tokens, cached_input_tokens,
        output_tokens, reasoning_tokens, total_tokens, pricing_status, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'unpriced', 'failed', ?)
    `).run(input.id, input.userId, input.feature, input.provider, input.model, input.providerRequestId ?? null, input.errorMessage.slice(0, 2_000));
  } catch (error) {
    console.error("[ai-usage] Échec de journalisation d'une requête IA en erreur.", error);
  }
}

export async function getAIUsageSummary(userId: string, maximumRequests = 50): Promise<AIUsageSummary> {
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  let rows: UsageRow[];
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    if (!workspaceId) throw new Error("Espace de travail introuvable.");
    rows = await serverDatabaseRequest<UsageRow[]>(
      `ai_usage_events?workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.completed&created_at=gte.${encodeURIComponent(periodStart.toISOString())}&select=id,feature,provider,model,provider_request_id,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,total_tokens,input_cost_nano_usd,cached_input_cost_nano_usd,output_cost_nano_usd,total_cost_nano_usd,pricing_status,created_at&order=created_at.desc&limit=10000`,
    );
  } else {
    ensureLocalUsageSchema();
    rows = getLocalDatabase().prepare(`
      SELECT id, feature, provider, model, provider_request_id, input_tokens, cached_input_tokens,
        output_tokens, reasoning_tokens, total_tokens, input_cost_nano_usd, cached_input_cost_nano_usd,
        output_cost_nano_usd, total_cost_nano_usd, pricing_status, created_at
      FROM ai_usage_events WHERE status = 'completed' AND created_at >= ? ORDER BY created_at DESC LIMIT 10000
    `).all(periodStart.toISOString()) as unknown as UsageRow[];
  }
  const events = rows.map(mapUsageRow);
  const byModelMap = new Map<string, AIUsageSummary["byModel"][number]>();
  for (const event of events) {
    const aggregate = byModelMap.get(event.model) ?? { model: event.model, inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCostNanoUsd: 0, requestCount: 0 };
    aggregate.inputTokens += event.inputTokens;
    aggregate.outputTokens += event.outputTokens;
    aggregate.totalTokens += event.totalTokens;
    aggregate.totalCostNanoUsd += event.totalCostNanoUsd ?? 0;
    aggregate.requestCount += 1;
    byModelMap.set(event.model, aggregate);
  }
  return {
    inputTokens: events.reduce((sum, event) => sum + event.inputTokens, 0),
    cachedInputTokens: events.reduce((sum, event) => sum + event.cachedInputTokens, 0),
    outputTokens: events.reduce((sum, event) => sum + event.outputTokens, 0),
    totalTokens: events.reduce((sum, event) => sum + event.totalTokens, 0),
    totalCostNanoUsd: events.reduce((sum, event) => sum + (event.totalCostNanoUsd ?? 0), 0),
    unpricedRequestCount: events.filter((event) => event.pricingStatus === "unpriced").length,
    requests: events.slice(0, Math.max(1, Math.min(maximumRequests, 100))),
    byModel: [...byModelMap.values()].sort((left, right) => right.totalCostNanoUsd - left.totalCostNanoUsd),
  };
}

export async function getAIUsageEventsByIds(userId: string, ids: string[]) {
  const uniqueIds = [...new Set(ids)].slice(0, 100);
  if (!uniqueIds.length) return [];
  let rows: UsageRow[];
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    if (!workspaceId) return [];
    rows = await serverDatabaseRequest<UsageRow[]>(
      `ai_usage_events?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=in.(${uniqueIds.map(encodeURIComponent).join(",")})&status=eq.completed&select=id,feature,provider,model,provider_request_id,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,total_tokens,input_cost_nano_usd,cached_input_cost_nano_usd,output_cost_nano_usd,total_cost_nano_usd,pricing_status,created_at`,
    );
  } else {
    ensureLocalUsageSchema();
    const statement = getLocalDatabase().prepare(`
      SELECT id, feature, provider, model, provider_request_id, input_tokens, cached_input_tokens,
        output_tokens, reasoning_tokens, total_tokens, input_cost_nano_usd, cached_input_cost_nano_usd,
        output_cost_nano_usd, total_cost_nano_usd, pricing_status, created_at
      FROM ai_usage_events WHERE id = ? AND status = 'completed'
    `);
    rows = uniqueIds.flatMap((id) => {
      const row = statement.get(id) as unknown as UsageRow | undefined;
      return row ? [row] : [];
    });
  }
  return rows.map(mapUsageRow);
}

export function nanoUsdToUsd(nanoUsd: number) {
  return nanoUsd / NANO_USD_PER_USD;
}
