import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessToken, getAuthenticatedUser, updateUserMetadata } from "@/lib/server/auth";
import { getAccountProfile, updateAccountProfile } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  jobTitle: z.string().trim().max(100),
  phone: z.string().trim().max(30),
  timezone: z.string().trim().min(2).max(80),
});

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const profile = await getAccountProfile(user.id, user.email);
  if (!profile) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Profil invalide" }, { status: 400 });
  try {
    const profile = await updateAccountProfile(user.id, parsed.data);
    const accessToken = getAccessToken(request);
    if (accessToken) await updateUserMetadata(accessToken, { full_name: parsed.data.fullName });
    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mise à jour impossible" }, { status: 503 });
  }
}
