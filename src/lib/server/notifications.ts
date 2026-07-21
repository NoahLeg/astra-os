import "server-only";

import type { AppNotification, WorkspaceData, WorkspaceSettings, WorkspaceSubscription } from "@/types";

function normalizeDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

export function buildNotifications(
  workspace: WorkspaceData,
  subscription: WorkspaceSubscription,
  readNotificationIds: string[],
  settings?: WorkspaceSettings,
) {
  const readIds = new Set(readNotificationIds);
  const notifications: AppNotification[] = [];

  for (const approval of (settings?.notificationApprovals === false ? [] : workspace.approvals.filter((item) => item.status === "pending"))) {
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

  for (const activity of (settings?.notificationErrors === false ? [] : workspace.activities.filter((item) => item.status === "error").slice(-8))) {
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

  const usageRatio = subscription.monthlyTokenLimit > 0 ? subscription.totalTokensUsed / subscription.monthlyTokenLimit : 0;
  if (usageRatio >= 0.8) {
    const id = `quota:${subscription.usageResetAt}`;
    notifications.push({
      id,
      title: usageRatio >= 1 ? "Quota de tokens atteint" : "Quota de tokens bientôt atteint",
      description: `${subscription.totalTokensUsed.toLocaleString("fr-FR")} / ${subscription.monthlyTokenLimit.toLocaleString("fr-FR")} tokens utilisés ce mois-ci`,
      category: "quota",
      createdAt: new Date().toISOString(),
      href: "/billing",
      read: readIds.has(id),
    });
  }

  const monthlyBudget = settings?.monthlyBudget ?? 0;
  const currentCostUsd = subscription.totalCostNanoUsd / 1_000_000_000;
  const budgetAlertRatio = (settings?.budgetAlertPercent ?? 80) / 100;
  const budgetRatio = monthlyBudget > 0 ? currentCostUsd / monthlyBudget : 0;
  if (budgetRatio >= budgetAlertRatio) {
    const id = `budget:${subscription.usageResetAt}:${settings?.budgetAlertPercent ?? 80}`;
    notifications.push({
      id,
      title: budgetRatio >= 1 ? "Budget IA atteint" : "Budget IA bientôt atteint",
      description: `${currentCostUsd.toLocaleString("fr-FR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 })} / ${monthlyBudget.toLocaleString("fr-FR", { style: "currency", currency: "USD" })} ce mois-ci`,
      category: "quota",
      createdAt: new Date().toISOString(),
      href: "/billing",
      read: readIds.has(id),
    });
  }

  return notifications.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 30);
}
