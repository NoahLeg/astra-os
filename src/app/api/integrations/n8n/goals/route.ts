import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceIdForUser, hasWorkspaceAccess, saveWorkspaceRecord } from "@/lib/server/database";
import type { ActivityEvent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const requestSchema = z.object({
  goal: z.object({
    id: z.string().trim().min(1).max(100),
    projectId: z.string().trim().max(100),
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(12_000),
    status: z.string().trim().min(1).max(40),
    priority: z.string().trim().min(1).max(40),
    progress: z.number().min(0).max(100),
    createdAt: z.string().trim().max(100),
    dueDate: z.string().trim().max(100),
    autonomyLevel: z.number().int().min(0).max(4),
    agentIds: z.array(z.string().trim().min(1).max(100)).max(20),
    steps: z.array(z.unknown()).max(100),
    decisions: z.array(z.unknown()).max(100),
  }),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Objectif invalide" }, { status: 400 });

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) return NextResponse.json({ error: "N8N_WEBHOOK_URL n’est pas configurée côté serveur." }, { status: 503 });
  let target: URL;
  try {
    target = new URL(webhookUrl);
  } catch {
    return NextResponse.json({ error: "N8N_WEBHOOK_URL est invalide." }, { status: 503 });
  }
  if (target.protocol !== "https:" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Le webhook n8n doit utiliser HTTPS en production." }, { status: 503 });
  }

  const workspaceId = await getWorkspaceIdForUser(user.id);
  if (!workspaceId) return NextResponse.json({ error: "Espace de travail introuvable" }, { status: 404 });
  const eventId = randomUUID();
  const startedAt = Date.now();
  try {
    const response = await fetch(target, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Astra-OS/1.0",
        ...(process.env.N8N_WEBHOOK_BEARER_TOKEN ? { Authorization: `Bearer ${process.env.N8N_WEBHOOK_BEARER_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        event: "goal.created",
        eventId,
        occurredAt: new Date().toISOString(),
        workspaceId,
        actor: { id: user.id, email: user.email },
        goal: parsed.data.goal,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Le webhook n8n a répondu avec le statut ${response.status}.`);
    const activity: ActivityEvent = {
      id: eventId,
      agent: "Coordinateur",
      action: `Objectif transmis à n8n : ${parsed.data.goal.title}`,
      status: "completed",
      duration: Math.max(1, Math.round((Date.now() - startedAt) / 1_000)),
      confidence: 100,
      timestamp: new Date().toISOString(),
      details: "Le webhook serveur a accepté l’objectif.",
      tool: "n8n",
    };
    await saveWorkspaceRecord("activities", activity, user.id);
    return NextResponse.json({ queued: true, eventId, status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Le webhook n8n est indisponible.";
    const activity: ActivityEvent = {
      id: eventId,
      agent: "Coordinateur",
      action: `Échec de transmission n8n : ${parsed.data.goal.title}`,
      status: "error",
      duration: Math.max(1, Math.round((Date.now() - startedAt) / 1_000)),
      confidence: 100,
      timestamp: new Date().toISOString(),
      details: message,
      tool: "n8n",
    };
    await saveWorkspaceRecord("activities", activity, user.id).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
