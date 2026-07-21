import { NextResponse } from "next/server";
import { executeAutomation } from "@/lib/server/automation-engine";
import { isSupabaseDatabaseEnabled, serverDatabaseRequest } from "@/lib/server/database";
import type { Automation } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RecordRow = { workspace_id: string; payload: Automation };
type MemberRow = { user_id: string };

function scheduleKey(automation: Automation, now: Date) {
  if (automation.schedule === "hourly") return `schedule:${now.toISOString().slice(0, 13)}`;
  if (automation.schedule === "weekly") {
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((now.getTime() - firstDay.getTime()) / 86_400_000) + firstDay.getUTCDay() + 1) / 7);
    return `schedule:${now.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return `schedule:${now.toISOString().slice(0, 10)}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!isSupabaseDatabaseEnabled()) return NextResponse.json({ processed: 0, results: [], mode: "local-disabled" });
  const now = new Date();
  const records = await serverDatabaseRequest<RecordRow[]>("workspace_records?collection=eq.automations&select=workspace_id,payload&limit=500");
  const due = records.filter(({ payload }) => payload.status === "active" && ["hourly", "daily", "weekly"].includes(payload.schedule ?? "") && (!payload.nextRun || Date.parse(payload.nextRun) <= now.getTime())).slice(0, 10);
  const results: Array<{ automationId: string; status: string; error?: string }> = [];
  for (const { workspace_id: workspaceId, payload } of due) {
    try {
      const members = await serverDatabaseRequest<MemberRow[]>(`workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.active&role=in.(owner,admin)&select=user_id&order=created_at.asc&limit=1`);
      const userId = members[0]?.user_id; if (!userId) throw new Error("Aucun administrateur actif pour cette entreprise.");
      const run = await executeAutomation({ userId, automationId: payload.id, triggerType: "schedule", idempotencyKey: scheduleKey(payload, now) });
      results.push({ automationId: payload.id, status: "run" in run ? run.run.status : run.status });
    } catch (error) { results.push({ automationId: payload.id, status: "failed", error: error instanceof Error ? error.message : "Erreur inconnue" }); }
  }
  return NextResponse.json({ processed: results.length, results });
}
