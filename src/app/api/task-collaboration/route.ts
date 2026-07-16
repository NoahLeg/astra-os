import { NextResponse } from "next/server";
import { z } from "zod";
import { listWorkspaceMembers, writeAdminAuditLog } from "@/lib/server/admin-service";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { BillingAccessError, requireSubscriptionFeature } from "@/lib/server/billing";
import { getAccountProfile, getUserWorkspaceContext, getWorkspaceData, isSupabaseDatabaseEnabled } from "@/lib/server/database";
import { addTaskComment, deleteTaskComment, listTaskCollaboratorIds, listTaskComments, setTaskCollaborators, type TaskCollaborationKey } from "@/lib/server/task-collaboration";
import type { TaskCollaborationOverview, TaskEntityType, TeamMember } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const keySchema = z.object({
  entityType: z.literal("goal"),
  entityId: z.string().trim().min(1).max(120),
  taskId: z.string().trim().min(1).max(120),
});

const actionSchema = z.discriminatedUnion("action", [
  keySchema.extend({ action: z.literal("set_collaborators"), userIds: z.array(z.string().trim().min(1).max(120)).max(100) }),
  keySchema.extend({ action: z.literal("add_comment"), body: z.string().trim().min(1).max(2_000) }),
  keySchema.extend({ action: z.literal("delete_comment"), commentId: z.uuid() }),
]);

async function getSession(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  const context = await getUserWorkspaceContext(user.id);
  if (!context || context.status !== "active") return null;
  const subscription = await requireSubscriptionFeature(user.id, "collaboration");
  return { user, context, subscription };
}

async function getTask(userId: string, entityType: TaskEntityType, entityId: string, taskId: string) {
  const workspace = await getWorkspaceData(userId);
  if (entityType === "goal") {
    const goal = workspace.goals.find((item) => item.id === entityId);
    const task = goal?.steps.flatMap((step) => step.tasks).find((item) => item.id === taskId);
    return task ?? null;
  }
  return null;
}

async function getAvailableMembers(session: NonNullable<Awaited<ReturnType<typeof getSession>>>): Promise<TeamMember[]> {
  if (isSupabaseDatabaseEnabled()) {
    return (await listWorkspaceMembers(session.context.workspaceId)).filter((member) => member.status === "active");
  }
  const profile = await getAccountProfile(session.user.id, session.user.email);
  return [{
    id: session.user.id,
    email: session.user.email,
    fullName: profile?.fullName ?? session.user.email.split("@")[0],
    role: "owner",
    accessLevel: "admin",
    status: "active",
    joinedAt: new Date().toISOString(),
    isOwner: true,
  }];
}

async function buildOverview(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  key: TaskCollaborationKey,
  taskTitle: string,
): Promise<TaskCollaborationOverview> {
  const [availableMembers, collaboratorIds, comments] = await Promise.all([
    getAvailableMembers(session),
    listTaskCollaboratorIds(key),
    listTaskComments(key),
  ]);
  const collaboratorSet = new Set(collaboratorIds);
  return {
    entityType: key.entityType,
    entityId: key.entityId,
    taskId: key.taskId,
    taskTitle,
    collaborators: availableMembers.filter((member) => collaboratorSet.has(member.id)),
    availableMembers,
    comments,
    updatedAt: new Date().toISOString(),
  };
}

function toKey(workspaceId: string, input: z.infer<typeof keySchema>): TaskCollaborationKey {
  return { workspaceId, entityType: input.entityType, entityId: input.entityId, taskId: input.taskId };
}

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    const url = new URL(request.url);
    const parsed = keySchema.safeParse({
      entityType: url.searchParams.get("entityType"),
      entityId: url.searchParams.get("entityId"),
      taskId: url.searchParams.get("taskId"),
    });
    if (!parsed.success) return NextResponse.json({ error: "Tâche invalide" }, { status: 400 });
    const task = await getTask(session.user.id, parsed.data.entityType, parsed.data.entityId, parsed.data.taskId);
    if (!task) return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });
    return NextResponse.json(await buildOverview(session, toKey(session.context.workspaceId, parsed.data), task.title));
  } catch (error) {
    const status = error instanceof BillingAccessError ? error.status : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Collaboration indisponible" }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    if (session.context.accessLevel === "viewer") return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Action invalide" }, { status: 400 });

    const task = await getTask(session.user.id, parsed.data.entityType, parsed.data.entityId, parsed.data.taskId);
    if (!task) return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });
    const key = toKey(session.context.workspaceId, parsed.data);

    if (parsed.data.action === "set_collaborators") {
      const members = await getAvailableMembers(session);
      const activeMemberIds = new Set(members.map((member) => member.id));
      const userIds = [...new Set(parsed.data.userIds)];
      if (userIds.some((userId) => !activeMemberIds.has(userId))) return NextResponse.json({ error: "Un membre sélectionné n’est plus actif dans cette entreprise." }, { status: 409 });
      await setTaskCollaborators(key, userIds, session.user.id);
      if (isSupabaseDatabaseEnabled()) await writeAdminAuditLog({ workspaceId: session.context.workspaceId, actorUserId: session.user.id, action: "task.collaborators_updated", targetType: "task", targetId: parsed.data.taskId, metadata: { entityId: parsed.data.entityId, userIds } });
    }

    if (parsed.data.action === "add_comment") {
      const profile = await getAccountProfile(session.user.id, session.user.email);
      await addTaskComment(key, { id: session.user.id, name: profile?.fullName ?? session.user.email.split("@")[0], email: session.user.email }, parsed.data.body);
      if (isSupabaseDatabaseEnabled()) await writeAdminAuditLog({ workspaceId: session.context.workspaceId, actorUserId: session.user.id, action: "task.comment_added", targetType: "task", targetId: parsed.data.taskId, metadata: { entityId: parsed.data.entityId } });
    }

    if (parsed.data.action === "delete_comment") {
      const commentId = parsed.data.commentId;
      const comments = await listTaskComments(key);
      const comment = comments.find((item) => item.id === commentId);
      if (!comment) return NextResponse.json({ error: "Commentaire introuvable" }, { status: 404 });
      if (comment.authorId !== session.user.id && session.context.accessLevel !== "admin") return NextResponse.json({ error: "Vous ne pouvez supprimer que vos propres commentaires." }, { status: 403 });
      await deleteTaskComment(key, commentId);
      if (isSupabaseDatabaseEnabled()) await writeAdminAuditLog({ workspaceId: session.context.workspaceId, actorUserId: session.user.id, action: "task.comment_deleted", targetType: "task", targetId: parsed.data.taskId, metadata: { entityId: parsed.data.entityId, commentId } });
    }

    return NextResponse.json(await buildOverview(session, key, task.title));
  } catch (error) {
    const status = error instanceof BillingAccessError ? error.status : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Collaboration indisponible" }, { status });
  }
}
