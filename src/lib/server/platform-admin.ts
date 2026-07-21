import "server-only";

import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { adminRequest, decryptSecret, encryptSecret, writeAdminAuditLog } from "@/lib/server/admin-service";
import type { FeatureKey, SubscriptionPlan } from "@/types";

export type ProviderKind = "openai" | "anthropic" | "openai_compatible";
export type VerificationStatus = "never" | "valid" | "invalid";

export interface PlatformAIProvider {
  id: string;
  slug: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  status: "active" | "inactive";
  notes: string;
  hasApiKey: boolean;
  secretHint?: string;
  createdAt: string;
  lastUsedAt?: string;
  lastVerifiedAt?: string;
  verificationStatus: VerificationStatus;
  lastError?: string;
}

export interface PlatformAIModel {
  id: string;
  providerId: string;
  providerSlug: string;
  providerName: string;
  modelId: string;
  displayName: string;
  description: string;
  enabled: boolean;
  userVisible: boolean;
  isDefault: boolean;
  premium: boolean;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  requestTokenLimit?: number;
  capabilities: string[];
  inputNanoUsdPerMillion: number;
  cachedInputNanoUsdPerMillion?: number;
  outputNanoUsdPerMillion: number;
  marginBasisPoints: number;
  sortOrder: number;
  source: string;
  lastSyncedAt?: string;
}

export interface PlatformOAuthIntegration {
  id: string;
  slug: string;
  provider: string;
  name: string;
  clientId: string;
  hasClientSecret: boolean;
  secretHint?: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
  status: "active" | "inactive";
  configuration: Record<string, unknown>;
  lastVerifiedAt?: string;
  verificationStatus: VerificationStatus;
  lastError?: string;
}

export interface PlatformStripeConfiguration {
  mode: "test" | "production";
  status: "active" | "inactive";
  publishableKey: string;
  hasSecretKey: boolean;
  secretKeyHint?: string;
  hasWebhookSecret: boolean;
  webhookSecretHint?: string;
  lastVerifiedAt?: string;
  verificationStatus: VerificationStatus;
  lastError?: string;
}

interface SecretRow {
  encrypted_value: string;
  encryption_iv: string;
  auth_tag: string;
  secret_hint: string;
}

async function getSecret(namespace: string, key: string) {
  const rows = await adminRequest<SecretRow[]>(`platform_secrets?namespace=eq.${encodeURIComponent(namespace)}&key=eq.${encodeURIComponent(key)}&select=encrypted_value,encryption_iv,auth_tag,secret_hint&limit=1`);
  const row = rows[0];
  return row ? { value: decryptSecret(row.encrypted_value, row.encryption_iv, row.auth_tag), hint: row.secret_hint } : undefined;
}

async function saveSecret(namespace: string, key: string, value: string, actorUserId: string) {
  const encrypted = encryptSecret(value.trim());
  await adminRequest("platform_secrets?on_conflict=namespace,key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ namespace, key, encrypted_value: encrypted.encryptedValue, encryption_iv: encrypted.encryptionIv, auth_tag: encrypted.authTag, secret_hint: encrypted.secretHint, created_by: actorUserId, updated_at: new Date().toISOString() }),
  });
}

async function deleteNamespaceSecrets(namespace: string) {
  await adminRequest(`platform_secrets?namespace=eq.${encodeURIComponent(namespace)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

function mapPlan(row: Record<string, unknown>): SubscriptionPlan {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    monthlyPriceCents: Number(row.monthly_price_cents),
    annualPriceCents: Number(row.annual_price_cents ?? 0),
    currency: String(row.currency ?? "eur"),
    monthlyTokenLimit: Number(row.monthly_token_limit),
    dailyTokenLimit: Number(row.daily_token_limit),
    minuteRequestLimit: Number(row.minute_api_limit),
    maxAgents: Number(row.max_agents),
    maxMembers: Number(row.max_members),
    maxAutomations: Number(row.max_automations ?? 0),
    storageLimitMb: Number(row.storage_limit_mb ?? 0),
    contextLimitTokens: Number(row.context_limit_tokens ?? 0),
    maxModels: Number(row.max_models ?? 1),
    premiumModels: Boolean(row.premium_models),
    connectorsEnabled: Boolean(row.connectors_enabled),
    toolsEnabled: Boolean(row.tools_enabled),
    features: (row.features ?? []) as FeatureKey[],
    badges: (row.badges ?? []) as string[],
    includedFeatures: (row.included_features ?? []) as string[],
    exclusiveFeatures: (row.exclusive_features ?? []) as string[],
    limits: (row.limits ?? {}) as Record<string, number>,
    highlighted: Boolean(row.highlighted),
    quoteOnly: Boolean(row.quote_only),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active),
    stripeMonthlyPriceId: row.stripe_monthly_price_id ? String(row.stripe_monthly_price_id) : undefined,
    stripeAnnualPriceId: row.stripe_annual_price_id ? String(row.stripe_annual_price_id) : undefined,
  };
}

export async function listPlatformPlans(includeInactive = true) {
  const rows = await adminRequest<Record<string, unknown>[]>(`subscription_plans?${includeInactive ? "" : "active=eq.true&"}select=*&order=sort_order.asc`);
  return rows.map(mapPlan);
}

export async function listPlatformProviders(): Promise<PlatformAIProvider[]> {
  const [providers, secrets] = await Promise.all([
    adminRequest<Array<Record<string, unknown>>>("platform_ai_providers?select=*&order=created_at.asc"),
    adminRequest<Array<{ namespace: string; secret_hint: string }>>("platform_secrets?key=eq.api_key&select=namespace,secret_hint"),
  ]);
  const hints = new Map(secrets.map((secret) => [secret.namespace, secret.secret_hint]));
  return providers.map((row) => {
    const hint = hints.get(`ai_provider:${row.slug}`);
    return {
      id: String(row.id), slug: String(row.slug), name: String(row.name), kind: row.kind as ProviderKind,
      baseUrl: row.base_url ? String(row.base_url) : undefined, status: row.status as "active" | "inactive",
      notes: String(row.notes ?? ""), hasApiKey: Boolean(hint), secretHint: hint, createdAt: String(row.created_at),
      lastUsedAt: row.last_used_at ? String(row.last_used_at) : undefined,
      lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : undefined,
      verificationStatus: row.last_verification_status as VerificationStatus,
      lastError: row.last_error ? String(row.last_error) : undefined,
    };
  });
}

export async function listPlatformModels(): Promise<PlatformAIModel[]> {
  const [models, providers] = await Promise.all([
    adminRequest<Array<Record<string, unknown>>>("platform_ai_models?select=*&order=sort_order.asc,display_name.asc"),
    adminRequest<Array<{ id: string; slug: string; name: string }>>("platform_ai_providers?select=id,slug,name"),
  ]);
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  return models.map((row) => {
    const provider = providerById.get(String(row.provider_id));
    return {
      id: String(row.id), providerId: String(row.provider_id), providerSlug: provider?.slug ?? "unknown", providerName: provider?.name ?? "Inconnu",
      modelId: String(row.model_id), displayName: String(row.display_name), description: String(row.description ?? ""),
      enabled: Boolean(row.enabled), userVisible: Boolean(row.user_visible), isDefault: Boolean(row.is_default), premium: Boolean(row.premium),
      contextWindowTokens: row.context_window_tokens ? Number(row.context_window_tokens) : undefined,
      maxOutputTokens: row.max_output_tokens ? Number(row.max_output_tokens) : undefined,
      requestTokenLimit: row.request_token_limit ? Number(row.request_token_limit) : undefined,
      capabilities: (row.capabilities ?? []) as string[], inputNanoUsdPerMillion: Number(row.input_nano_usd_per_million),
      cachedInputNanoUsdPerMillion: row.cached_input_nano_usd_per_million === null ? undefined : Number(row.cached_input_nano_usd_per_million),
      outputNanoUsdPerMillion: Number(row.output_nano_usd_per_million), marginBasisPoints: Number(row.margin_basis_points),
      sortOrder: Number(row.sort_order), source: String(row.source), lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : undefined,
    };
  });
}

export async function listPlatformOAuth(): Promise<PlatformOAuthIntegration[]> {
  const [rows, secrets] = await Promise.all([
    adminRequest<Array<Record<string, unknown>>>("platform_oauth_integrations?select=*&order=name.asc"),
    adminRequest<Array<{ namespace: string; secret_hint: string }>>("platform_secrets?key=eq.client_secret&select=namespace,secret_hint"),
  ]);
  const hints = new Map(secrets.map((secret) => [secret.namespace, secret.secret_hint]));
  return rows.map((row) => {
    const hint = hints.get(`oauth:${row.slug}`);
    return {
      id: String(row.id), slug: String(row.slug), provider: String(row.provider), name: String(row.name), clientId: String(row.client_id ?? ""),
      hasClientSecret: Boolean(hint), secretHint: hint, authorizationUrl: String(row.authorization_url ?? ""), tokenUrl: String(row.token_url ?? ""),
      redirectUri: String(row.redirect_uri ?? ""), scopes: (row.scopes ?? []) as string[], status: row.status as "active" | "inactive",
      configuration: (row.configuration ?? {}) as Record<string, unknown>, lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : undefined,
      verificationStatus: row.last_verification_status as VerificationStatus, lastError: row.last_error ? String(row.last_error) : undefined,
    };
  });
}

export async function getPlatformStripeConfiguration(): Promise<PlatformStripeConfiguration> {
  const [rows, secretKey, webhookSecret] = await Promise.all([
    adminRequest<Array<Record<string, unknown>>>("platform_payment_configurations?provider=eq.stripe&select=*&limit=1"),
    getSecret("payments:stripe", "secret_key"), getSecret("payments:stripe", "webhook_secret"),
  ]);
  const row = rows[0] ?? {};
  return {
    mode: row.mode === "production" ? "production" : "test", status: row.status === "active" ? "active" : "inactive",
    publishableKey: String(row.publishable_key ?? ""), hasSecretKey: Boolean(secretKey), secretKeyHint: secretKey?.hint,
    hasWebhookSecret: Boolean(webhookSecret), webhookSecretHint: webhookSecret?.hint,
    lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : undefined,
    verificationStatus: (row.last_verification_status as VerificationStatus) ?? "never", lastError: row.last_error ? String(row.last_error) : undefined,
  };
}

export async function getPlatformAdminOverview() {
  const [providers, models, oauth, stripe, plans] = await Promise.all([listPlatformProviders(), listPlatformModels(), listPlatformOAuth(), getPlatformStripeConfiguration(), listPlatformPlans()]);
  return { providers, models, oauth, stripe, plans };
}

export async function savePlatformProvider(input: { id?: string; slug: string; name: string; kind: ProviderKind; baseUrl?: string; status: "active" | "inactive"; notes?: string; apiKey?: string; actorUserId: string }) {
  const id = input.id ?? randomUUID();
  await adminRequest("platform_ai_providers?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id, slug: input.slug, name: input.name, kind: input.kind, base_url: input.baseUrl || null, status: input.status, notes: input.notes ?? "", created_by: input.actorUserId, updated_at: new Date().toISOString() }) });
  if (input.apiKey?.trim()) await saveSecret(`ai_provider:${input.slug}`, "api_key", input.apiKey, input.actorUserId);
  await writeAdminAuditLog({ actorUserId: input.actorUserId, action: "platform.ai_provider.saved", targetType: "ai_provider", targetId: id, metadata: { slug: input.slug, kind: input.kind, status: input.status } });
  return id;
}

export async function deletePlatformProvider(id: string, actorUserId: string) {
  const rows = await adminRequest<Array<{ slug: string }>>(`platform_ai_providers?id=eq.${encodeURIComponent(id)}&select=slug&limit=1`);
  if (!rows[0]) return;
  await adminRequest(`platform_ai_providers?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await deleteNamespaceSecrets(`ai_provider:${rows[0].slug}`);
  await writeAdminAuditLog({ actorUserId, action: "platform.ai_provider.deleted", targetType: "ai_provider", targetId: id });
}

async function providerCredential(provider: PlatformAIProvider) {
  const secret = await getSecret(`ai_provider:${provider.slug}`, "api_key");
  if (!secret) throw new Error(`Aucune clé API n’est configurée pour ${provider.name}.`);
  return secret.value;
}

function providerModelsUrl(provider: PlatformAIProvider) {
  const base = (provider.baseUrl || (provider.kind === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1")).replace(/\/$/, "");
  return `${base}${provider.kind === "anthropic" ? "/v1/models" : "/models"}`;
}

async function fetchProviderModels(provider: PlatformAIProvider) {
  const apiKey = await providerCredential(provider);
  const response = await fetch(providerModelsUrl(provider), {
    headers: provider.kind === "anthropic" ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${apiKey}` },
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as { data?: Array<{ id: string; display_name?: string; created_at?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `${provider.name} a répondu ${response.status}.`);
  return (payload.data ?? []).filter((model) => model.id).map((model) => ({ id: model.id, name: model.display_name || model.id }));
}

export async function testPlatformProvider(id: string, actorUserId: string) {
  const providers = await listPlatformProviders();
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error("Fournisseur introuvable.");
  try {
    const models = await fetchProviderModels(provider);
    await adminRequest(`platform_ai_providers?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_verified_at: new Date().toISOString(), last_verification_status: "valid", last_error: null, updated_at: new Date().toISOString() }) });
    await writeAdminAuditLog({ actorUserId, action: "platform.ai_provider.verified", targetType: "ai_provider", targetId: id, metadata: { modelCount: models.length } });
    return { modelCount: models.length };
  } catch (error) {
    await adminRequest(`platform_ai_providers?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_verified_at: new Date().toISOString(), last_verification_status: "invalid", last_error: error instanceof Error ? error.message.slice(0, 1000) : "Erreur inconnue", updated_at: new Date().toISOString() }) });
    throw error;
  }
}

export async function syncPlatformModels(providerId: string, actorUserId: string) {
  const provider = (await listPlatformProviders()).find((item) => item.id === providerId);
  if (!provider) throw new Error("Fournisseur introuvable.");
  const models = await fetchProviderModels(provider);
  if (models.length) await adminRequest("platform_ai_models?on_conflict=provider_id,model_id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(models.map((model, index) => ({ provider_id: providerId, model_id: model.id, display_name: model.name, source: "provider_sync", last_synced_at: new Date().toISOString(), sort_order: index, updated_at: new Date().toISOString() }))),
  });
  await writeAdminAuditLog({ actorUserId, action: "platform.ai_models.synced", targetType: "ai_provider", targetId: providerId, metadata: { count: models.length } });
  return models.length;
}

export async function savePlatformModel(input: Omit<PlatformAIModel, "providerSlug" | "providerName" | "source" | "lastSyncedAt"> & { actorUserId: string }) {
  if (input.isDefault) await adminRequest("platform_ai_models?is_default=eq.true", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_default: false, updated_at: new Date().toISOString() }) });
  await adminRequest("platform_ai_models?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: input.id, provider_id: input.providerId, model_id: input.modelId, display_name: input.displayName, description: input.description, enabled: input.enabled, user_visible: input.userVisible, is_default: input.isDefault, premium: input.premium, context_window_tokens: input.contextWindowTokens ?? null, max_output_tokens: input.maxOutputTokens ?? null, request_token_limit: input.requestTokenLimit ?? null, capabilities: input.capabilities, input_nano_usd_per_million: input.inputNanoUsdPerMillion, cached_input_nano_usd_per_million: input.cachedInputNanoUsdPerMillion ?? null, output_nano_usd_per_million: input.outputNanoUsdPerMillion, margin_basis_points: input.marginBasisPoints, sort_order: input.sortOrder, updated_at: new Date().toISOString() }) });
  const providers = await adminRequest<Array<{ slug: string }>>(`platform_ai_providers?id=eq.${encodeURIComponent(input.providerId)}&select=slug&limit=1`);
  const provider = providers[0];
  if (provider) {
    await adminRequest(`model_pricing?provider=eq.${encodeURIComponent(provider.slug)}&model_pattern=eq.${encodeURIComponent(input.modelId)}&active=eq.true`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ active: false, effective_until: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    await adminRequest("model_pricing", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ provider: provider.slug, model_pattern: input.modelId, display_name: input.displayName, input_nano_usd_per_million: input.inputNanoUsdPerMillion, cached_input_nano_usd_per_million: input.cachedInputNanoUsdPerMillion ?? null, output_nano_usd_per_million: input.outputNanoUsdPerMillion, margin_basis_points: input.marginBasisPoints, active: input.enabled }) });
  }
  await writeAdminAuditLog({ actorUserId: input.actorUserId, action: "platform.ai_model.saved", targetType: "ai_model", targetId: input.id, metadata: { modelId: input.modelId } });
}

export async function deletePlatformModel(id: string, actorUserId: string) {
  await adminRequest(`platform_ai_models?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await writeAdminAuditLog({ actorUserId, action: "platform.ai_model.deleted", targetType: "ai_model", targetId: id });
}

export async function savePlatformOAuth(input: Omit<PlatformOAuthIntegration, "hasClientSecret" | "secretHint" | "lastVerifiedAt" | "verificationStatus" | "lastError"> & { clientSecret?: string; actorUserId: string }) {
  await adminRequest("platform_oauth_integrations?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: input.id, slug: input.slug, provider: input.provider, name: input.name, client_id: input.clientId, authorization_url: input.authorizationUrl, token_url: input.tokenUrl, redirect_uri: input.redirectUri, scopes: input.scopes, status: input.status, configuration: input.configuration, updated_at: new Date().toISOString() }) });
  if (input.clientSecret?.trim()) await saveSecret(`oauth:${input.slug}`, "client_secret", input.clientSecret, input.actorUserId);
  await writeAdminAuditLog({ actorUserId: input.actorUserId, action: "platform.oauth.saved", targetType: "oauth_integration", targetId: input.id, metadata: { slug: input.slug } });
}

export async function deletePlatformOAuth(id: string, actorUserId: string) {
  const rows = await adminRequest<Array<{ slug: string }>>(`platform_oauth_integrations?id=eq.${encodeURIComponent(id)}&select=slug&limit=1`);
  await adminRequest(`platform_oauth_integrations?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (rows[0]) await deleteNamespaceSecrets(`oauth:${rows[0].slug}`);
  await writeAdminAuditLog({ actorUserId, action: "platform.oauth.deleted", targetType: "oauth_integration", targetId: id });
}

export async function testPlatformOAuth(id: string, actorUserId: string) {
  const integration = (await listPlatformOAuth()).find((item) => item.id === id);
  if (!integration) throw new Error("Intégration OAuth introuvable.");
  let errorMessage: string | undefined;
  try {
    if (!integration.clientId || !integration.hasClientSecret || !integration.redirectUri || !integration.authorizationUrl || !integration.tokenUrl) throw new Error("Client ID, Client Secret, Redirect URI et endpoints sont obligatoires.");
    new URL(integration.redirectUri); new URL(integration.authorizationUrl); new URL(integration.tokenUrl);
    const response = await fetch(integration.authorizationUrl, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (response.status >= 500) throw new Error(`L’endpoint d’autorisation répond ${response.status}.`);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Configuration invalide";
  }
  await adminRequest(`platform_oauth_integrations?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_verified_at: new Date().toISOString(), last_verification_status: errorMessage ? "invalid" : "valid", last_error: errorMessage ?? null, updated_at: new Date().toISOString() }) });
  if (errorMessage) throw new Error(errorMessage);
  await writeAdminAuditLog({ actorUserId, action: "platform.oauth.verified", targetType: "oauth_integration", targetId: id });
}

export async function savePlatformStripe(input: { mode: "test" | "production"; status: "active" | "inactive"; publishableKey: string; secretKey?: string; webhookSecret?: string; actorUserId: string }) {
  await adminRequest("platform_payment_configurations?on_conflict=provider", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ provider: "stripe", mode: input.mode, status: input.status, publishable_key: input.publishableKey, updated_at: new Date().toISOString() }) });
  if (input.secretKey?.trim()) await saveSecret("payments:stripe", "secret_key", input.secretKey, input.actorUserId);
  if (input.webhookSecret?.trim()) await saveSecret("payments:stripe", "webhook_secret", input.webhookSecret, input.actorUserId);
  await writeAdminAuditLog({ actorUserId: input.actorUserId, action: "platform.stripe.saved", targetType: "payment_configuration", targetId: "stripe", metadata: { mode: input.mode, status: input.status } });
}

export async function getPlatformStripeSecrets() {
  const [secretKey, webhookSecret] = await Promise.all([getSecret("payments:stripe", "secret_key"), getSecret("payments:stripe", "webhook_secret")]);
  return { secretKey: secretKey?.value, webhookSecret: webhookSecret?.value };
}

export async function testPlatformStripe(actorUserId: string) {
  const secrets = await getPlatformStripeSecrets();
  if (!secrets.secretKey) throw new Error("Clé secrète Stripe manquante.");
  try {
    const stripe = new Stripe(secrets.secretKey, { typescript: true, appInfo: { name: "Astra OS", version: "0.1.0" } });
    const balance = await stripe.balance.retrieve();
    await adminRequest("platform_payment_configurations?provider=eq.stripe", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_verified_at: new Date().toISOString(), last_verification_status: "valid", last_error: null, updated_at: new Date().toISOString() }) });
    await writeAdminAuditLog({ actorUserId, action: "platform.stripe.verified", targetType: "payment_configuration", targetId: "stripe", metadata: { livemode: balance.livemode } });
    return balance.livemode ? "mode_live" : "mode_test";
  } catch (error) {
    await adminRequest("platform_payment_configurations?provider=eq.stripe", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_verified_at: new Date().toISOString(), last_verification_status: "invalid", last_error: error instanceof Error ? error.message.slice(0, 1000) : "Erreur Stripe", updated_at: new Date().toISOString() }) });
    throw error;
  }
}

export async function savePlatformPlan(plan: SubscriptionPlan, actorUserId: string) {
  await adminRequest("subscription_plans?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: plan.id, name: plan.name, description: plan.description, monthly_price_cents: plan.monthlyPriceCents, annual_price_cents: plan.annualPriceCents ?? 0, currency: plan.currency ?? "eur", monthly_token_limit: plan.monthlyTokenLimit, daily_token_limit: plan.dailyTokenLimit, minute_api_limit: plan.minuteRequestLimit, api_limit: plan.monthlyTokenLimit, max_agents: plan.maxAgents, max_members: plan.maxMembers, max_automations: plan.maxAutomations ?? 0, storage_limit_mb: plan.storageLimitMb ?? 100, context_limit_tokens: plan.contextLimitTokens ?? 32000, max_models: plan.maxModels ?? 1, premium_models: plan.premiumModels ?? false, connectors_enabled: plan.connectorsEnabled ?? false, tools_enabled: plan.toolsEnabled ?? false, features: plan.features, badges: plan.badges ?? [], included_features: plan.includedFeatures ?? [], exclusive_features: plan.exclusiveFeatures ?? [], limits: plan.limits ?? {}, highlighted: plan.highlighted ?? false, quote_only: plan.quoteOnly ?? false, sort_order: plan.sortOrder ?? 0, active: plan.active ?? true, stripe_monthly_price_id: plan.stripeMonthlyPriceId || null, stripe_annual_price_id: plan.stripeAnnualPriceId || null, updated_at: new Date().toISOString() }) });
  await writeAdminAuditLog({ actorUserId, action: "platform.subscription_plan.saved", targetType: "subscription_plan", targetId: plan.id });
}

export async function deletePlatformPlan(id: string, actorUserId: string) {
  if (id === "free") throw new Error("Le plan Free est obligatoire et ne peut pas être supprimé.");
  await adminRequest(`subscription_plans?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await writeAdminAuditLog({ actorUserId, action: "platform.subscription_plan.deleted", targetType: "subscription_plan", targetId: id });
}

export async function getPlatformProviderCredential(providerSlug: string) {
  const providers = await listPlatformProviders();
  const provider = providers.find((item) => item.slug === providerSlug && item.status === "active");
  if (!provider) return undefined;
  const secret = await getSecret(`ai_provider:${provider.slug}`, "api_key");
  if (!secret) return undefined;
  await adminRequest(`platform_ai_providers?id=eq.${encodeURIComponent(provider.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_used_at: new Date().toISOString() }) }).catch(() => undefined);
  return { provider, secret: secret.value };
}

export async function getPlatformOAuthCredential(slug: string) {
  const integration = (await listPlatformOAuth()).find((item) => item.slug === slug && item.status === "active");
  if (!integration) return undefined;
  const secret = await getSecret(`oauth:${slug}`, "client_secret");
  return secret ? { integration, clientSecret: secret.value } : undefined;
}

export async function getPlatformModel(modelId: string) {
  return (await listPlatformModels()).find((model) => model.modelId === modelId && model.enabled && model.userVisible);
}
