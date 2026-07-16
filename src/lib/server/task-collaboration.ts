import "server-only";

import { randomUUID } from "node:crypto";
import { getLocalDatabase, isSupabaseDatabaseEnabled, serverDatabaseRequest } from "@/lib/server/database";
import type { AppNotification, TaskCollaborationComment, TaskEntityType, WorkspaceData } from "@/types";

export type TaskCollaborationKey = {
  workspaceId: string;
  entityType: TaskEntityType;
  entityId: string;
  taskId: string;
};

type CommentRow = {
  id: string;
  author_id?: string;
  author_name: string;
  author_email: string;
  body: string;
  created_at: string;
  updated_at: string;
};

function collaborationFilters(key: TaskCollaborationKey) {
  return `workspace_id=eq.${encodeURIComponent(key.workspaceId)}&entity_type=eq.${encodeURIComponent(key.entityType)}&entity_id=eq.${encodeURIComponent(key.entityId)}&task_id=eq.${encodeURIComponent(key.taskId)}`;
}

function toComment(row: CommentRow): TaskCollaborationComment {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTaskCollaboratorIds(key: TaskCollaborationKey) {
  if (isSupabaseDatabaseEnabled()) {
    const rows = await serverDatabaseRequest<Array<{ user_id: string }>>(
      `task_collaborators?${collaborationFilters(key)}&select=user_id&order=created_at.asc`,
    );
    return rows.map((row) => row.user_id);
  }

  const rows = getLocalDatabase().prepare(
    "SELECT user_id FROM task_collaborators WHERE entity_type = ? AND entity_id = ? AND task_id = ? ORDER BY created_at ASC",
  ).all(key.entityType, key.entityId, key.taskId) as Array<{ user_id: string }>;
  return rows.map((row) => row.user_id);
}

export async function setTaskCollaborators(key: TaskCollaborationKey, userIds: string[], assignedBy: string) {
  const uniqueUserIds = [...new Set(userIds)];
  if (isSupabaseDatabaseEnabled()) {
    const existingUserIds = await listTaskCollaboratorIds(key);
    const existing = new Set(existingUserIds);
    const requested = new Set(uniqueUserIds);
    const additions = uniqueUserIds.filter((userId) => !existing.has(userId));
    const removals = existingUserIds.filter((userId) => !requested.has(userId));

    if (additions.length) {
      await serverDatabaseRequest("task_collaborators?on_conflict=workspace_id,entity_type,entity_id,task_id,user_id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(additions.map((userId) => ({
          workspace_id: key.workspaceId,
          entity_type: key.entityType,
          entity_id: key.entityId,
          task_id: key.taskId,
          user_id: userId,
          assigned_by: assignedBy,
        }))),
      });
    }
    if (removals.length) {
      await serverDatabaseRequest(`task_collaborators?${collaborationFilters(key)}&user_id=in.(${removals.join(",")})`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
    }
    return;
  }

  const database = getLocalDatabase();
  const remove = database.prepare("DELETE FROM task_collaborators WHERE entity_type = ? AND entity_id = ? AND task_id = ?");
  const insert = database.prepare("INSERT INTO task_collaborators (entity_type, entity_id, task_id, user_id, assigned_by) VALUES (?, ?, ?, ?, ?)");
  database.exec("BEGIN");
  try {
    remove.run(key.entityType, key.entityId, key.taskId);
    uniqueUserIds.forEach((userId) => insert.run(key.entityType, key.entityId, key.taskId, userId, assignedBy));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function listTaskComments(key: TaskCollaborationKey): Promise<TaskCollaborationComment[]> {
  if (isSupabaseDatabaseEnabled()) {
    const rows = await serverDatabaseRequest<CommentRow[]>(
      `task_comments?${collaborationFilters(key)}&select=id,author_id,author_name,author_email,body,created_at,updated_at&order=created_at.asc`,
    );
    return rows.map(toComment);
  }

  const rows = getLocalDatabase().prepare(
    "SELECT id, author_id, author_name, author_email, body, created_at, updated_at FROM task_comments WHERE entity_type = ? AND entity_id = ? AND task_id = ? ORDER BY created_at ASC",
  ).all(key.entityType, key.entityId, key.taskId) as CommentRow[];
  return rows.map(toComment);
}

export async function addTaskComment(key: TaskCollaborationKey, author: { id: string; name: string; email: string }, body: string) {
  const now = new Date().toISOString();
  const comment: TaskCollaborationComment = {
    id: randomUUID(),
    authorId: author.id,
    authorName: author.name,
    authorEmail: author.email,
    body,
    createdAt: now,
    updatedAt: now,
  };

  if (isSupabaseDatabaseEnabled()) {
    await serverDatabaseRequest("task_comments", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: comment.id,
        workspace_id: key.workspaceId,
        entity_type: key.entityType,
        entity_id: key.entityId,
        task_id: key.taskId,
        author_id: author.id,
        author_name: author.name,
        author_email: author.email,
        body,
        created_at: now,
        updated_at: now,
      }),
    });
    return comment;
  }

  getLocalDatabase().prepare(
    "INSERT INTO task_comments (id, entity_type, entity_id, task_id, author_id, author_name, author_email, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(comment.id, key.entityType, key.entityId, key.taskId, author.id, author.name, author.email, body, now, now);
  return comment;
}

export async function deleteTaskComment(key: TaskCollaborationKey, commentId: string) {
  if (isSupabaseDatabaseEnabled()) {
    await serverDatabaseRequest(`task_comments?${collaborationFilters(key)}&id=eq.${encodeURIComponent(commentId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return;
  }

  getLocalDatabase().prepare(
    "DELETE FROM task_comments WHERE id = ? AND entity_type = ? AND entity_id = ? AND task_id = ?",
  ).run(commentId, key.entityType, key.entityId, key.taskId);
}

export async function listTaskCollaborationNotifications(workspaceId: string, userId: string, workspace: WorkspaceData): Promise<AppNotification[]> {
  if (!isSupabaseDatabaseEnabled()) return [];
  const [assignments, comments] = await Promise.all([
    serverDatabaseRequest<Array<{ entity_id: string; task_id: string; assigned_by?: string; created_at: string }>>(
      `task_collaborators?workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(userId)}&select=entity_id,task_id,assigned_by,created_at&order=created_at.desc&limit=50`,
    ),
    serverDatabaseRequest<Array<{ id: string; entity_id: string; task_id: string; author_id?: string; author_name: string; body: string; created_at: string }>>(
      `task_comments?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id,entity_id,task_id,author_id,author_name,body,created_at&order=created_at.desc&limit=100`,
    ),
  ]);

  const assignedTaskKeys = new Set(assignments.map((assignment) => `${assignment.entity_id}:${assignment.task_id}`));
  const taskTitle = (entityId: string, taskId: string) => workspace.goals.find((goal) => goal.id === entityId)?.steps.flatMap((step) => step.tasks).find((task) => task.id === taskId)?.title ?? "Tâche collaborative";
  const assignmentNotifications = assignments
    .filter((assignment) => assignment.assigned_by !== userId)
    .map((assignment) => ({
      id: `task-assignment-${assignment.entity_id.slice(0, 40)}-${assignment.task_id.slice(0, 40)}-${Date.parse(assignment.created_at)}`,
      title: `Vous êtes affecté à « ${taskTitle(assignment.entity_id, assignment.task_id)} »`,
      description: "Un membre de votre entreprise vous a ajouté à cette tâche collaborative.",
      category: "collaboration" as const,
      createdAt: assignment.created_at,
      href: `/goals/${assignment.entity_id}?tab=tasks#task-${assignment.task_id}`,
      read: false,
    }));
  const commentNotifications = comments
    .filter((comment) => comment.author_id !== userId && assignedTaskKeys.has(`${comment.entity_id}:${comment.task_id}`))
    .map((comment) => ({
      id: `task-comment-${comment.id}`,
      title: `${comment.author_name} a commenté « ${taskTitle(comment.entity_id, comment.task_id)} »`,
      description: comment.body,
      category: "collaboration" as const,
      createdAt: comment.created_at,
      href: `/goals/${comment.entity_id}?tab=tasks#task-${comment.task_id}`,
      read: false,
    }));

  return [...assignmentNotifications, ...commentNotifications].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 50);
}
