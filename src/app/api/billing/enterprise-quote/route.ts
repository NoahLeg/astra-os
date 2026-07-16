import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { createEnterpriseQuoteRequest, listEnterpriseQuoteRequests } from "@/lib/server/billing";
import { getUserWorkspaceContext } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const quoteSchema = z.object({
  contactName: z.string().trim().min(2).max(100),
  contactEmail: z.email(),
  companyName: z.string().trim().min(2).max(120),
  seatCount: z.number().int().min(2).max(10_000),
  estimatedMonthlyCalls: z.number().int().min(1_000).max(10_000_000),
  message: z.string().trim().max(2_000).optional(),
});

async function getAdminContext(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  const context = await getUserWorkspaceContext(user.id);
  if (!context || context.status !== "active" || context.accessLevel !== "admin") return null;
  return { user, context };
}

export async function GET(request: Request) {
  const session = await getAdminContext(request);
  if (!session) return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  try {
    return NextResponse.json({ quotes: await listEnterpriseQuoteRequests(session.context.workspaceId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Demandes indisponibles" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getAdminContext(request);
  if (!session) return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Demande invalide" }, { status: 400 });
  try {
    const quote = await createEnterpriseQuoteRequest({
      ...parsed.data,
      workspaceId: session.context.workspaceId,
      requestedBy: session.user.id,
    });
    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enregistrement impossible" }, { status: 503 });
  }
}
