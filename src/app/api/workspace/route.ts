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

const memoryRecordSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(["fact", "project", "person", "decision", "document", "habit", "relation"]),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
  source: z.string().trim().min(1).max(300),
  createdAt: z.string().datetime({ offset: true }),
  confidence: z.number().min(0).max(100),
  relations: z.array(z.string().trim().min(1).max(200)).max(50),
  blocked: z.boolean(),
}).strict();

const automationNodeSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(["trigger", "condition", "agent", "action", "approval", "result"]),
  label: z.string().trim().min(1).max(500),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
}).strict();

const automationRecordSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(2_000),
  status: z.enum(["active", "paused", "completed", "pending", "error", "offline", "suggested"]),
  trigger: z.string().trim().min(1).max(500),
  conditions: z.array(z.string().max(500)).max(20),
  actions: z.array(z.string().trim().min(1).max(12_000)).min(1).max(20),
  tools: z.array(z.string().max(100)).max(30),
  autonomyLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  successRate: z.number().min(0).max(100),
  nodes: z.array(automationNodeSchema).min(4).max(30),
  lastRun: z.string().max(100).optional(), nextRun: z.string().max(100).optional(), runCount: z.number().int().min(0).optional(),
  agentId: z.string().max(80).optional(), instruction: z.string().trim().min(8).max(12_000).optional(),
  preferredTool: z.enum(["auto", "send_email", "create_email_draft", "organize_email", "smart_organize_gmail", "create_calendar_event", "create_drive_file"]).optional(),
  lastResult: z.string().max(20_000).optional(), lastConfidence: z.number().min(0).max(100).optional(),
  lastStatus: z.enum(["completed", "approval", "error", "cancelled"]).optional(),
  schedule: z.enum(["hourly", "daily", "weekly"]).optional(), timeZone: z.string().max(100).optional(),
  retryPolicy: z.object({ maximumAttempts: z.number().int().min(1).max(5), backoffSeconds: z.number().int().min(0).max(30) }).strict().optional(),
}).strict().superRefine((automation, context) => {
  if (new Set(automation.nodes.map((node) => node.id)).size !== automation.nodes.length) context.addIssue({ code: "custom", path: ["nodes"], message: "Les identifiants de blocs doivent être uniques." });
  for (const type of ["trigger", "agent", "action", "result"] as const) {
    if (!automation.nodes.some((node) => node.type === type)) context.addIssue({ code: "custom", path: ["nodes"], message: `Bloc ${type} requis.` });
    if (automation.nodes.filter((node) => node.type === type).length > 1) context.addIssue({ code: "custom", path: ["nodes"], message: `Un seul bloc ${type} est autorisé.` });
  }
  if (automation.nodes.filter((node) => node.type === "agent").length !== 1) context.addIssue({ code: "custom", path: ["nodes"], message: "Un seul bloc agent est autorisé." });
  if (automation.nodes.filter((node) => node.type === "approval").length > 1) context.addIssue({ code: "custom", path: ["nodes"], message: "Un seul bloc de validation est autorisé." });
  const positions = Object.fromEntries(automation.nodes.map((node, index) => [node.type, index]));
  if (!(positions.trigger < positions.agent && positions.agent < positions.action && positions.action < positions.result)) context.addIssue({ code: "custom", path: ["nodes"], message: "L’ordre requis est déclencheur, agent, action, résultat." });
});

function validateSpecializedMutation(mutation: z.infer<typeof mutationSchema>) {
  if (mutation.operation === "delete") return null;
  const value = mutation.operation === "create" ? mutation.record : mutation.changes;
  const schema = mutation.collection === "memories"
    ? mutation.operation === "create" ? memoryRecordSchema : memoryRecordSchema.omit({ id: true, createdAt: true }).partial().strict()
    : mutation.collection === "automations"
      ? mutation.operation === "create" ? automationRecordSchema : automationRecordSchema.safeExtend({}).partial().strict()
      : null;
  if (!schema) return null;
  const result = schema.safeParse(value);
  return result.success ? null : result.error.flatten();
}

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
  if (parsed.data.operation === "patch" && typeof parsed.data.changes.id === "string" && parsed.data.changes.id !== parsed.data.id) {
    return NextResponse.json({ error: "L’identifiant d’un enregistrement ne peut pas être modifié" }, { status: 400 });
  }
  const validationError = validateSpecializedMutation(parsed.data);
  if (validationError) return NextResponse.json({ error: "Données métier invalides", details: validationError }, { status: 400 });

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
