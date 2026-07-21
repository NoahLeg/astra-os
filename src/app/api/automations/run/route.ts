import { NextResponse } from "next/server";
import { z } from "zod";
import { executeAutomation, listAutomationRuns } from "@/lib/server/automation-engine";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { hasWorkspaceAccess } from "@/lib/server/database";
import { OpenAIRequestError } from "@/lib/server/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({ automationId: z.string().trim().min(1).max(100), idempotencyKey: z.string().trim().min(8).max(200).optional() });

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request); if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  try { await requireSubscriptionFeature(user.id, "automations"); return NextResponse.json({ runs: await listAutomationRuns(user.id, new URL(request.url).searchParams.get("automationId") ?? undefined) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Journaux indisponibles" }, { status: error instanceof BillingAccessError ? error.status : 503 }); }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request); if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Automatisation invalide" }, { status: 400 });
  try { await requireSubscriptionFeature(user.id, "automations"); return NextResponse.json(await executeAutomation({ userId: user.id, automationId: parsed.data.automationId, triggerType: "manual", idempotencyKey: parsed.data.idempotencyKey })); }
  catch (error) { if (error instanceof BillingAccessError || error instanceof OpenAIRequestError) return NextResponse.json({ error: error.message }, { status: error.status }); if (error instanceof z.ZodError) return NextResponse.json({ error: `Configuration invalide : ${error.issues[0]?.message}` }, { status: 400 }); return NextResponse.json({ error: error instanceof Error ? error.message : "Exécution impossible" }, { status: 502 }); }
}
