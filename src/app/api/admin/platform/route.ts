import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/server/auth";
import {
  deletePlatformModel, deletePlatformOAuth, deletePlatformPlan, deletePlatformProvider,
  getPlatformAdminOverview, savePlatformModel, savePlatformOAuth, savePlatformPlan,
  savePlatformProvider, savePlatformStripe, syncPlatformModels, testPlatformOAuth,
  testPlatformProvider, testPlatformStripe,
} from "@/lib/server/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const status = z.enum(["active", "inactive"]);
const optionalPositive = z.number().int().positive().optional();
const feature = z.enum(["assistant", "chatbots", "goals", "memory", "agents", "connectors", "automations", "multi_agent", "team_admin", "collaboration"]);

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_provider"), id: z.uuid().optional(), slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,49}$/), name: z.string().trim().min(2).max(100), kind: z.enum(["openai", "anthropic", "openai_compatible"]), baseUrl: z.union([z.url(), z.literal("")]).optional(), status, notes: z.string().max(2000).optional(), apiKey: z.string().max(10000).optional() }),
  z.object({ action: z.literal("delete_provider"), id: z.uuid() }),
  z.object({ action: z.literal("test_provider"), id: z.uuid() }),
  z.object({ action: z.literal("sync_models"), providerId: z.uuid() }),
  z.object({ action: z.literal("save_model"), id: z.uuid().optional(), providerId: z.uuid(), modelId: z.string().trim().min(1).max(200), displayName: z.string().trim().min(1).max(200), description: z.string().max(1000), enabled: z.boolean(), userVisible: z.boolean(), isDefault: z.boolean(), premium: z.boolean(), contextWindowTokens: optionalPositive, maxOutputTokens: optionalPositive, requestTokenLimit: optionalPositive, capabilities: z.array(z.string().trim().min(1).max(30)).max(20), inputNanoUsdPerMillion: z.number().int().nonnegative(), cachedInputNanoUsdPerMillion: z.number().int().nonnegative().optional(), outputNanoUsdPerMillion: z.number().int().nonnegative(), marginBasisPoints: z.number().int().min(0).max(100000), sortOrder: z.number().int().min(0).max(10000) }),
  z.object({ action: z.literal("delete_model"), id: z.uuid() }),
  z.object({ action: z.literal("save_oauth"), id: z.uuid().optional(), slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,49}$/), provider: z.string().trim().min(2).max(60), name: z.string().trim().min(2).max(100), clientId: z.string().trim().max(500), clientSecret: z.string().max(10000).optional(), authorizationUrl: z.union([z.url(), z.literal("")]), tokenUrl: z.union([z.url(), z.literal("")]), redirectUri: z.union([z.url(), z.literal("")]), scopes: z.array(z.string().trim().min(1).max(300)).max(100), status, configuration: z.record(z.string(), z.unknown()).default({}) }),
  z.object({ action: z.literal("delete_oauth"), id: z.uuid() }),
  z.object({ action: z.literal("test_oauth"), id: z.uuid() }),
  z.object({ action: z.literal("save_stripe"), mode: z.enum(["test", "production"]), status, publishableKey: z.string().trim().max(500), secretKey: z.string().max(1000).optional(), webhookSecret: z.string().max(1000).optional() }),
  z.object({ action: z.literal("test_stripe") }),
  z.object({ action: z.literal("save_plan"), id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,39}$/), name: z.string().trim().min(2).max(100), description: z.string().trim().min(2).max(1000), monthlyPriceCents: z.number().int().nonnegative(), annualPriceCents: z.number().int().nonnegative(), currency: z.string().trim().regex(/^[a-zA-Z]{3}$/), monthlyTokenLimit: z.number().int().positive(), dailyTokenLimit: z.number().int().positive(), minuteRequestLimit: z.number().int().positive(), maxAgents: z.number().int().nonnegative(), maxMembers: z.number().int().positive(), maxAutomations: z.number().int().nonnegative(), storageLimitMb: z.number().int().positive(), contextLimitTokens: z.number().int().positive(), maxModels: z.number().int().positive(), premiumModels: z.boolean(), connectorsEnabled: z.boolean(), toolsEnabled: z.boolean(), features: z.array(feature), badges: z.array(z.string().trim().min(1).max(80)).max(20), includedFeatures: z.array(z.string().trim().min(1).max(200)).max(50), exclusiveFeatures: z.array(z.string().trim().min(1).max(200)).max(50), limits: z.record(z.string(), z.number().nonnegative()), highlighted: z.boolean(), quoteOnly: z.boolean(), sortOrder: z.number().int().min(0).max(10000), active: z.boolean(), stripeMonthlyPriceId: z.string().trim().max(300).optional(), stripeAnnualPriceId: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("delete_plan"), id: z.string().trim().min(2).max(40) }),
]);

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: "Accès Super Admin requis" }, { status: 403 });
  try { return NextResponse.json(await getPlatformAdminOverview()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Configuration indisponible" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: "Accès Super Admin requis" }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Configuration invalide" }, { status: 400 });
  const data = parsed.data;
  try {
    if (data.action === "save_provider") await savePlatformProvider({ ...data, actorUserId: admin.id });
    else if (data.action === "delete_provider") await deletePlatformProvider(data.id, admin.id);
    else if (data.action === "test_provider") return NextResponse.json({ success: true, ...(await testPlatformProvider(data.id, admin.id)) });
    else if (data.action === "sync_models") return NextResponse.json({ success: true, count: await syncPlatformModels(data.providerId, admin.id) });
    else if (data.action === "save_model") await savePlatformModel({ ...data, id: data.id ?? randomUUID(), actorUserId: admin.id });
    else if (data.action === "delete_model") await deletePlatformModel(data.id, admin.id);
    else if (data.action === "save_oauth") await savePlatformOAuth({ ...data, id: data.id ?? randomUUID(), actorUserId: admin.id });
    else if (data.action === "delete_oauth") await deletePlatformOAuth(data.id, admin.id);
    else if (data.action === "test_oauth") { await testPlatformOAuth(data.id, admin.id); return NextResponse.json({ success: true }); }
    else if (data.action === "save_stripe") await savePlatformStripe({ ...data, actorUserId: admin.id });
    else if (data.action === "test_stripe") return NextResponse.json({ success: true, accountId: await testPlatformStripe(admin.id) });
    else if (data.action === "save_plan") await savePlatformPlan(data, admin.id);
    else if (data.action === "delete_plan") await deletePlatformPlan(data.id, admin.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action impossible" }, { status: 502 });
  }
}
