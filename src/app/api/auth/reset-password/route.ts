import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessToken, updatePassword } from "@/lib/server/auth";

const schema = z.object({ password: z.string().min(8).max(128).regex(/[A-Z]/).regex(/[0-9]/) });

export async function POST(request: Request) {
  const accessToken = getAccessToken(request);
  if (!accessToken) return NextResponse.json({ error: "Session de récupération expirée" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Utilisez au moins 8 caractères, une majuscule et un chiffre" }, { status: 400 });
  try {
    await updatePassword(accessToken, parsed.data.password);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Modification impossible" }, { status: 400 });
  }
}
