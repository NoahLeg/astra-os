import "server-only";

import type { AppNotification, WorkspaceData, WorkspaceSubscription } from "@/types";

function normalizeDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

export function buildNotifications(
  workspace: WorkspaceData,
  subscription: WorkspaceSubscription,
  readNotificationIds: string[],
) {
  const readIds = new Set(readNotificationIds);
  const notifications: AppNotification[] = [];

  for (const approval of workspace.approvals.filter((item) => item.status === "pending")) {
    const id = `approval:${approval.id}`;
    notifications.push({
      id,
      title: approval.action,
      description: `${approval.agent} attend votre autorisation · Risque ${approval.risk}`,
      category: "approval",
      createdAt: normalizeDate(approval.createdAt),
      href: "/approvals",
      read: readIds.has(id),
    });
  }

  for (const activity of workspace.activities.filter((item) => item.status === "error").slice(-8)) {
    const id = `activity-error:${activity.id}`;
    notifications.push({
      id,
      title: `Échec — ${activity.agent}`,
      description: activity.action,
      category: "error",
      createdAt: normalizeDate(activity.timestamp),
      href: "/activity",
      read: readIds.has(id),
    });
  }

  for (const activity of workspace.activities.filter((item) => item.status === "completed").slice(-5)) {
    const id = `activity-completed:${activity.id}`;
    notifications.push({
      id,
      title: `Terminé par ${activity.agent}`,
      description: activity.action,
      category: "success",
      createdAt: normalizeDate(activity.timestamp),
      href: "/activity",
      read: readIds.has(id),
    });
  }

  const usageRatio = subscription.apiLimit > 0 ? subscription.apiUsage / subscription.apiLimit : 0;
  if (usageRatio >= 0.8) {
    const id = `quota:${subscription.usageResetAt}`;
    notifications.push({
      id,
      title: usageRatio >= 1 ? "Quota API atteint" : "Quota API bientôt atteint",
      description: `${subscription.apiUsage.toLocaleString("fr-FR")} / ${subscription.apiLimit.toLocaleString("fr-FR")} appels utilisés ce mois-ci`,
      category: "quota",
      createdAt: new Date().toISOString(),
      href: "/billing",
      read: readIds.has(id),
    });
  }

  return notifications.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 30);
}
