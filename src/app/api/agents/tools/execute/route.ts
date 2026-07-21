import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { agentToolCallSchema, executeAgentToolCall, getAvailableAgentTools } from "@/lib/server/agent-tools";
import { completeAutomationApproval } from "@/lib/server/automation-engine";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { getWorkspaceData, hasWorkspaceAccess, patchWorkspaceRecord, saveWorkspaceRecord } from "@/lib/server/database";
import { claimToolExecution, completeToolExecutionClaim, failToolExecutionClaim, getToolExecutionClaim } from "@/lib/server/tool-execution-claims";
import type { ActivityEvent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ approvalId: z.string().trim().min(1).max(100), confirmed: z.literal(true) });

function isRetrySafeFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return [
    "doivent être configurés",
    "connexion google",
    "connecteur",
    "session google a expiré",
    "permissions gmail",
    "permissions accordées",
    "limite temporaire",
    "too many requests",
    "rate limit",
    "invalid argument",
    "invalid request",
  ].some((fragment) => message.includes(fragment));
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirmation explicite requise" }, { status: 400 });

  try {
    await Promise.all([
      requireSubscriptionFeature(user.id, "agents"),
      requireSubscriptionFeature(user.id, "connectors"),
    ]);
    const workspace = await getWorkspaceData(user.id);
    const approval = workspace.approvals.find((item) => item.id === parsed.data.approvalId);
    if (!approval) return NextResponse.json({ error: "Validation introuvable" }, { status: 404 });
    if (approval.status !== "pending") {
      const existingClaim = await getToolExecutionClaim(user.id, approval.id);
      if (approval.status === "approved" && existingClaim?.status === "completed") {
        return NextResponse.json({ success: true, execution: existingClaim.response, idempotent: true });
      }
      const detail = existingClaim?.status === "running" ? " L’exécution est encore en cours." : existingClaim?.status === "failed" ? " Son état externe doit être vérifié manuellement." : "";
      return NextResponse.json({ error: `Cette validation a déjà été traitée.${detail}` }, { status: 409 });
    }
    const toolCall = agentToolCallSchema.parse(approval.toolCall);
    const agent = workspace.agents.find((item) => item.name === approval.agent);
    if (!agent || !agent.enabled) return NextResponse.json({ error: "L’agent demandeur n’est plus actif." }, { status: 409 });
    if (!getAvailableAgentTools(agent, workspace.connections).includes(toolCall.tool)) {
      return NextResponse.json({ error: "L’agent n’a plus la permission d’utiliser cet outil ou le connecteur est déconnecté." }, { status: 403 });
    }
    const claim = await claimToolExecution(user.id, approval.id, toolCall.tool);
    if (!claim.acquired) {
      if (claim.status === "completed") {
        return NextResponse.json({ success: true, execution: claim.response, idempotent: true });
      }
      const message = claim.status === "running"
        ? "Cette action est déjà en cours. Attendez son résultat avant de réessayer."
        : `Cette action a un état d’exécution incertain${claim.errorMessage ? ` : ${claim.errorMessage}` : "."} Vérifiez le service externe avant toute nouvelle tentative.`;
      return NextResponse.json({ error: message }, { status: 409 });
    }
    await patchWorkspaceRecord("approvals", approval.id, { status: "approved", executedAt: new Date().toISOString(), executionResult: "Exécution en cours" }, user.id);
    let execution: Awaited<ReturnType<typeof executeAgentToolCall>>;
    try {
      execution = await executeAgentToolCall(user.id, toolCall);
      await completeToolExecutionClaim(user.id, approval.id, { ...execution });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Échec de l’exécution";
      const retrySafe = isRetrySafeFailure(error);
      await Promise.all([
        failToolExecutionClaim(user.id, approval.id, message, retrySafe),
        patchWorkspaceRecord("approvals", approval.id, {
          status: "pending",
          executedAt: undefined,
          executionResult: retrySafe ? `Échec sans action externe : ${message}` : `État incertain : ${message}. Vérification manuelle requise avant toute relance.`,
        }, user.id),
      ]);
      throw error;
    }
    const executedAt = new Date().toISOString();
    const activity: ActivityEvent = {
      id: randomUUID(),
      agent: approval.agent,
      action: execution.summary,
      status: "completed",
      duration: Math.max(1, Math.round((Date.now() - startedAt) / 1_000)),
      confidence: approval.confidence,
      timestamp: executedAt,
      details: execution.details,
      tool: toolCall.tool,
    };
    await Promise.all([
      patchWorkspaceRecord("approvals", approval.id, { status: "approved", executedAt, executionResult: execution.summary }, user.id),
      saveWorkspaceRecord("activities", activity, user.id),
      completeAutomationApproval({ userId: user.id, approval, decision: "approved", execution }),
      ...(agent ? [patchWorkspaceRecord("agents", agent.id, {
        tasksCompleted: agent.tasksCompleted + 1,
        successRate: Math.round(((agent.successRate * agent.tasksCompleted) + 100) / (agent.tasksCompleted + 1)),
        lastActivity: executedAt,
      }, user.id)] : []),
    ]);
    return NextResponse.json({ success: true, execution, activity });
  } catch (error) {
    if (error instanceof BillingAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "L'outil n'a pas pu être exécuté." }, { status: 502 });
  }
}
