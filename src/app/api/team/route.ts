import { NextResponse } from "next/server";
import { z } from "zod";
import { inviteWorkspaceMember, listWorkspaceMembers, removeWorkspaceMember, updateWorkspaceMember } from "@/lib/server/admin-service";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, getWorkspaceSubscriptionByWorkspaceId, requireSubscriptionFeature } from "@/lib/server/billing";
import { getUserWorkspaceContext, isSupabaseDatabaseEnabled } from "@/lib/server/database";
import type { TeamOverview } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accessLevel = z.enum(["viewer", "operator", "admin"]);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), email: z.email(), fullName: z.string().trim().min(2).max(100), accessLevel }),
  z.object({ action: z.literal("update_access"), userId: z.uuid(), accessLevel }),
  z.object({ action: z.literal("update_status"), userId: z.uuid(), status: z.enum(["active", "suspended"]) }),
  z.object({ action: z.literal("remove"), userId: z.uuid() }),
]);

async function getTeamContext(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  const context = await getUserWorkspaceContext(user.id);
  if (!context || context.status !== "active" || context.accessLevel !== "admin") return null;
  const subscription = await requireSubscriptionFeature(user.id, "team_admin");
  return { user, context, subscription };
}

async function buildOverview(workspaceId: string): Promise<TeamOverview> {
  const [subscription, members] = await Promise.all([
    getWorkspaceSubscriptionByWorkspaceId(workspaceId),
    listWorkspaceMembers(workspaceId),
  ]);
  return { members, memberCount: subscription.memberCount, maxMembers: subscription.maxMembers, planId: subscription.planId };
}

export async function GET(request: Request) {
  try {
    const session = await getTeamContext(request);
    if (!session) return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
    if (!isSupabaseDatabaseEnabled()) {
      return NextResponse.json({
        members: [{ id: session.user.id, email: session.user.email, fullName: "Utilisateur local", role: "owner", accessLevel: "admin", status: "active", joinedAt: new Date().toISOString(), isOwner: true }],
        memberCount: 1,
        maxMembers: session.subscription.maxMembers,
        planId: session.subscription.planId,
      } satisfies TeamOverview);
    }
    return NextResponse.json({
      members: await listWorkspaceMembers(session.context.workspaceId),
      memberCount: session.subscription.memberCount,
      maxMembers: session.subscription.maxMembers,
      planId: session.subscription.planId,
    } satisfies TeamOverview);
  } catch (error) {
    const status = error instanceof BillingAccessError ? error.status : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Équipe indisponible" }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getTeamContext(request);
    if (!session) return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
    if (!isSupabaseDatabaseEnabled()) return NextResponse.json({ error: "Supabase est requis pour inviter des membres." }, { status: 503 });
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Action invalide" }, { status: 400 });

    if (parsed.data.action === "invite") {
      const redirectTo = new URL("/auth/callback?next=/reset-password", request.url).toString();
      await inviteWorkspaceMember({ ...parsed.data, workspaceId: session.context.workspaceId, redirectTo, actorUserId: session.user.id });
    }
    if (parsed.data.action === "update_access") await updateWorkspaceMember({ workspaceId: session.context.workspaceId, userId: parsed.data.userId, accessLevel: parsed.data.accessLevel, actorUserId: session.user.id });
    if (parsed.data.action === "update_status") await updateWorkspaceMember({ workspaceId: session.context.workspaceId, userId: parsed.data.userId, status: parsed.data.status, actorUserId: session.user.id });
    if (parsed.data.action === "remove") await removeWorkspaceMember({ workspaceId: session.context.workspaceId, userId: parsed.data.userId, actorUserId: session.user.id });

    return NextResponse.json(await buildOverview(session.context.workspaceId));
  } catch (error) {
    const status = error instanceof BillingAccessError ? error.status : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action impossible" }, { status });
  }
}
