import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceData, patchWorkspaceRecord, saveWorkspaceRecord } from "@/lib/server/database";
import { getAuthenticatedUser } from "@/lib/server/auth";
import type { WorkspaceData } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const collectionSchema = z.enum(["goals", "projects", "agents", "memories", "automations", "approvals", "connections", "activities"]);
const mutationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), collection: collectionSchema, record: z.object({ id: z.string().min(1) }).passthrough() }),
  z.object({ operation: z.literal("patch"), collection: collectionSchema, id: z.string().min(1), changes: z.record(z.string(), z.unknown()) }),
]);

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  try {
    return NextResponse.json(await getWorkspaceData(user.id));
  } catch {
    return NextResponse.json({ error: "La base de données est temporairement indisponible" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  }
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mutation invalide", details: parsed.error.flatten() }, { status: 400 });

  try {
    if (parsed.data.operation === "create") {
      await saveWorkspaceRecord(parsed.data.collection, parsed.data.record as unknown as WorkspaceData[typeof parsed.data.collection][number], user.id);
      return NextResponse.json(parsed.data.record, { status: 201 });
    }
    const updated = await patchWorkspaceRecord(parsed.data.collection, parsed.data.id, parsed.data.changes, user.id);
    if (!updated) return NextResponse.json({ error: "Enregistrement introuvable" }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "La modification n’a pas pu être enregistrée" }, { status: 503 });
  }
}
