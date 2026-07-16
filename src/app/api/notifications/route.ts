import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceSubscription } from "@/lib/server/billing";
import { getAccountProfile, getWorkspaceData, updateAccountProfile } from "@/lib/server/database";
import { buildNotifications } from "@/lib/server/notifications";
import { listTaskCollaborationNotifications } from "@/lib/server/task-collaboration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark_read"), id: z.string().trim().min(1).max(160) }),
  z.object({ action: z.literal("mark_all_read") }),
]);

async function loadNotificationData(userId: string, email: string) {
  const [workspace, subscription, profile] = await Promise.all([
    getWorkspaceData(userId),
    getWorkspaceSubscription(userId),
    getAccountProfile(userId, email),
  ]);
  if (!profile) throw new Error("Profil introuvable");
  const baseNotifications = buildNotifications(workspace, subscription, profile.preferences.readNotificationIds);
  const collaborationNotifications = subscription.features.includes("collaboration")
    ? await listTaskCollaborationNotifications(subscription.workspaceId, userId, workspace)
    : [];
  const readIds = new Set(profile.preferences.readNotificationIds);
  const notifications = [...baseNotifications, ...collaborationNotifications.map((notification) => ({ ...notification, read: readIds.has(notification.id) }))]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 80);
  return { workspace, subscription, profile, notifications };
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  try {
    const { notifications } = await loadNotificationData(user.id, user.email);
    return NextResponse.json({ notifications, unreadCount: notifications.filter((notification) => !notification.read).length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Notifications indisponibles" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Action de notification invalide" }, { status: 400 });

  try {
    const { profile, notifications } = await loadNotificationData(user.id, user.email);
    const readIds = new Set(profile.preferences.readNotificationIds);
    if (parsed.data.action === "mark_read") readIds.add(parsed.data.id);
    else notifications.forEach((notification) => readIds.add(notification.id));
    const boundedReadIds = Array.from(readIds).slice(-500);
    await updateAccountProfile(user.id, {
      fullName: profile.fullName,
      jobTitle: profile.jobTitle,
      phone: profile.phone,
      timezone: profile.timezone,
      preferences: { ...profile.preferences, readNotificationIds: boundedReadIds },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mise à jour impossible" }, { status: 503 });
  }
}
