import { NextResponse } from "next/server";
import { z } from "zod";
import { openAIModels } from "@/config";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceConfiguration, hasWorkspaceAccess, updateWorkspaceConfiguration } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  locale: z.enum(["fr", "en"]),
  compactMode: z.boolean(),
  enabledModelIds: z.array(z.enum(openAIModels.map((model) => model.id) as [typeof openAIModels[number]["id"], ...Array<typeof openAIModels[number]["id"]>])).min(1).max(openAIModels.length),
  defaultModelId: z.enum(openAIModels.map((model) => model.id) as [typeof openAIModels[number]["id"], ...Array<typeof openAIModels[number]["id"]>]),
  defaultAutonomy: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  telemetryEnabled: z.boolean(),
  allowMemoryLearning: z.boolean(),
  memoryEnabled: z.boolean(),
  memoryApprovalRequired: z.boolean(),
  auditLogging: z.boolean(),
  sessionTimeoutMinutes: z.number().int().min(15).max(43_200),
  monthlyBudget: z.number().min(0).max(1_000_000),
  budgetAlertPercent: z.number().int().min(1).max(100),
  blockOnBudgetLimit: z.boolean(),
  notificationEmail: z.boolean(),
  notificationApprovals: z.boolean(),
  notificationErrors: z.boolean(),
  weeklyDigest: z.boolean(),
  dataRetentionDays: z.number().int().min(1).max(3_650),
  exportFormat: z.enum(["json", "csv"]),
}).refine((settings) => settings.enabledModelIds.includes(settings.defaultModelId), { path: ["defaultModelId"], message: "Le modèle par défaut doit être activé." });

const updateSchema = z.object({
  workspaceName: z.string().trim().min(2).max(100),
  settings: settingsSchema,
});

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  if (!await hasWorkspaceAccess(user.id, "admin")) return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const configuration = await getWorkspaceConfiguration(user.id);
  if (!configuration) return NextResponse.json({ error: "Espace introuvable" }, { status: 404 });
  return NextResponse.json(configuration);
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Paramètres invalides" }, { status: 400 });
  try {
    return NextResponse.json(await updateWorkspaceConfiguration(user.id, parsed.data.workspaceName, parsed.data.settings));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enregistrement impossible" }, { status: 403 });
  }
}
