import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/server/auth";
import { deleteManagedAccount, inviteWorkspaceMember, updateWorkspaceMember } from "@/lib/server/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accessLevel = z.enum(["viewer", "operator", "admin"]);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), workspaceId: z.uuid(), email: z.email(), fullName: z.string().trim().min(2).max(100), accessLevel }),
  z.object({ action: z.literal("update_access"), workspaceId: z.uuid(), userId: z.uuid(), accessLevel }),
  z.object({ action: z.literal("update_status"), workspaceId: z.uuid(), userId: z.uuid(), status: z.enum(["active", "suspended"]) }),
  z.object({ action: z.literal("delete_account"), workspaceId: z.uuid(), userId: z.uuid() }),
]);

export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: "Accès Super Admin requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Action invalide" }, { status: 400 });
  try {
    if (parsed.data.action === "invite") {
      const redirectTo = new URL("/auth/callback?next=/reset-password", request.url).toString();
      const userId = await inviteWorkspaceMember({ ...parsed.data, redirectTo, actorUserId: admin.id });
      return NextResponse.json({ success: true, userId }, { status: 201 });
    }
    if (parsed.data.action === "update_access") await updateWorkspaceMember({ workspaceId: parsed.data.workspaceId, userId: parsed.data.userId, accessLevel: parsed.data.accessLevel, actorUserId: admin.id });
    if (parsed.data.action === "update_status") await updateWorkspaceMember({ workspaceId: parsed.data.workspaceId, userId: parsed.data.userId, status: parsed.data.status, actorUserId: admin.id });
    if (parsed.data.action === "delete_account") await deleteManagedAccount({ workspaceId: parsed.data.workspaceId, userId: parsed.data.userId, actorUserId: admin.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Action impossible" }, { status: 503 });
  }
}
