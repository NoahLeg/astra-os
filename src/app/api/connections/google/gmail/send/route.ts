import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { executeAgentToolCall, sendEmailArgumentsSchema } from "@/lib/server/agent-tools";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { hasWorkspaceAccess, saveWorkspaceRecord } from "@/lib/server/database";
import type { ActivityEvent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendEmailSchema = sendEmailArgumentsSchema.extend({ confirmed: z.literal(true) });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const parsed = sendEmailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Message invalide" }, { status: 400 });

  try {
    await requireSubscriptionFeature(user.id, "connectors");
    const startedAt = Date.now();
    const execution = await executeAgentToolCall(user.id, {
      tool: "send_email",
      arguments: { to: parsed.data.to, subject: parsed.data.subject, body: parsed.data.body },
    });
    const activity: ActivityEvent = {
      id: randomUUID(),
      agent: "Email",
      action: execution.summary,
      status: "completed",
      duration: Math.max(1, Math.round((Date.now() - startedAt) / 1_000)),
      confidence: 100,
      timestamp: new Date().toISOString(),
      details: execution.details,
      tool: "Gmail",
    };
    await saveWorkspaceRecord("activities", activity, user.id);
    return NextResponse.json({ success: true, messageId: "externalId" in execution ? execution.externalId : undefined });
  } catch (error) {
    if (error instanceof BillingAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Envoi Gmail impossible" }, { status: 502 });
  }
}
