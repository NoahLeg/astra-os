import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteWorkspaceRecord, getUserWorkspaceContext, getWorkspaceData, patchWorkspaceRecord, saveWorkspaceRecord } from "@/lib/server/database";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, getWorkspaceSubscription, requireSubscriptionFeature } from "@/lib/server/billing";
import type { WorkspaceData } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const collectionSchema = z.enum(["goals", "projects", "agents", "memories", "automations", "approvals", "connections", "activities", "missions"]);
const mutationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), collection: collectionSchema, record: z.object({ id: z.string().min(1) }).passthrough() }),
  z.object({ operation: z.literal("patch"), collection: collectionSchema, id: z.string().min(1), changes: z.record(z.string(), z.unknown()) }),
  z.object({ operation: z.literal("delete"), collection: collectionSchema, id: z.string().min(1) }),
]);

function operatorCanMutate(mutation: z.infer<typeof mutationSchema>) {
  if (["goals", "projects", "memories", "automations", "missions"].includes(mutation.collection)) return true;
  if (mutation.operation !== "patch") return false;
  const keys = Object.keys(mutation.changes);
  if (mutation.collection === "agents") return keys.every((key) => key === "enabled" || key === "status");
  if (mutation.collection === "approvals") return keys.length > 0 && keys.every((key) => key === "status");
  return false;
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  try {
    const [data, context, subscription] = await Promise.all([getWorkspaceData(user.id), getUserWorkspaceContext(user.id), getWorkspaceSubscription(user.id)]);
    if (!context || context.status !== "active") return NextResponse.json({ error: "Accès suspendu" }, { status: 403 });
    const enabledAgents = data.agents.filter((agent) => agent.enabled);
    if (enabledAgents.length > subscription.maxAgents) {
      const allowedIds = new Set(enabledAgents.slice(0, subscription.maxAgents).map((agent) => agent.id));
      const disabledIds = enabledAgents.filter((agent) => !allowedIds.has(agent.id)).map((agent) => agent.id);
      data.agents = data.agents.map((agent) => disabledIds.includes(agent.id) ? { ...agent, enabled: false, status: "paused" } : agent);
      await Promise.all(disabledIds.map((id) => patchWorkspaceRecord("agents", id, { enabled: false, status: "paused" }, user.id)));
    }
    if (context.accessLevel === "viewer") {
      return NextResponse.json({ ...data, agents: [], memories: [], automations: [], approvals: [], connections: [], missions: [] });
    }
    const filtered = {
      ...data,
      agents: subscription.features.includes("agents") ? data.agents : [],
      memories: subscription.features.includes("memory") ? data.memories : [],
      automations: subscription.features.includes("automations") ? data.automations : [],
      approvals: subscription.features.includes("agents") ? data.approvals : [],
      connections: context.accessLevel === "admin" && subscription.features.includes("connectors") ? data.connections : [],
      missions: subscription.features.includes("multi_agent") ? data.missions : [],
    };
    return NextResponse.json(filtered);
  } catch {
    return NextResponse.json({ error: "La base de données est temporairement indisponible" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  }
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mutation invalide", details: parsed.error.flatten() }, { status: 400 });

  try {
    const context = await getUserWorkspaceContext(user.id);
    if (!context || context.status !== "active" || context.accessLevel === "viewer") return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
    if (context.accessLevel !== "admin" && !operatorCanMutate(parsed.data)) return NextResponse.json({ error: "Cette modification nécessite un accès administrateur" }, { status: 403 });
    const featureByCollection = { goals: "goals", projects: "goals", agents: "agents", memories: "memory", automations: "automations", approvals: "agents", connections: "connectors", missions: "multi_agent" } as const;
    const requiredFeature = featureByCollection[parsed.data.collection as keyof typeof featureByCollection];
    const subscription = requiredFeature ? await requireSubscriptionFeature(user.id, requiredFeature) : await getWorkspaceSubscription(user.id);
    if (parsed.data.collection === "agents" && parsed.data.operation === "patch" && parsed.data.changes.enabled === true) {
      const agentId = parsed.data.id;
      const workspace = await getWorkspaceData(user.id);
      const current = workspace.agents.find((agent) => agent.id === agentId);
      const enabledCount = workspace.agents.filter((agent) => agent.enabled && agent.id !== agentId).length;
      if (!current) return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
      if (!current.enabled && enabledCount >= subscription.maxAgents) return NextResponse.json({ error: `Votre offre autorise ${subscription.maxAgents} agent${subscription.maxAgents > 1 ? "s" : ""} actif${subscription.maxAgents > 1 ? "s" : ""}.` }, { status: 409 });
    }
    if (parsed.data.operation === "create") {
      await saveWorkspaceRecord(parsed.data.collection, parsed.data.record as unknown as WorkspaceData[typeof parsed.data.collection][number], user.id);
      return NextResponse.json(parsed.data.record, { status: 201 });
    }
    if (parsed.data.operation === "delete") {
      const deleted = await deleteWorkspaceRecord(parsed.data.collection, parsed.data.id, user.id);
      if (!deleted) return NextResponse.json({ error: "Enregistrement introuvable" }, { status: 404 });
      return NextResponse.json({ success: true });
    }
    const updated = await patchWorkspaceRecord(parsed.data.collection, parsed.data.id, parsed.data.changes, user.id);
    if (!updated) return NextResponse.json({ error: "Enregistrement introuvable" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof BillingAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "La modification n’a pas pu être enregistrée" }, { status: 503 });
  }
}
