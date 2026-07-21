import { NextResponse } from "next/server";
import { z } from "zod";
import { completeAutomationApproval } from "@/lib/server/automation-engine";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { getWorkspaceData, hasWorkspaceAccess, patchWorkspaceRecord } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  approvalId: z.string().trim().min(1).max(100),
  decision: z.enum(["approved", "rejected"]),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Décision invalide" }, { status: 400 });

  try {
    await requireSubscriptionFeature(user.id, "agents");
    const workspace = await getWorkspaceData(user.id);
    const approval = workspace.approvals.find((item) => item.id === parsed.data.approvalId);
    if (!approval) return NextResponse.json({ error: "Validation introuvable" }, { status: 404 });
    if (approval.status !== "pending") return NextResponse.json({ error: "Cette validation a déjà été traitée." }, { status: 409 });
    if (parsed.data.decision === "approved" && approval.toolCall) {
      return NextResponse.json({ error: "Cette action doit être exécutée par la route d'outil sécurisée." }, { status: 409 });
    }

    const resolvedAt = new Date().toISOString();
    await patchWorkspaceRecord("approvals", approval.id, {
      status: parsed.data.decision,
      executedAt: resolvedAt,
      executionResult: parsed.data.decision === "rejected" ? "Action refusée" : "Décision autorisée",
    }, user.id);
    const run = await completeAutomationApproval({ userId: user.id, approval, decision: parsed.data.decision });
    return NextResponse.json({ success: true, run });
  } catch (error) {
    if (error instanceof BillingAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Décision impossible" }, { status: 503 });
  }
}
