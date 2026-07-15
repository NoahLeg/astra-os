import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/server/auth";

const schema = z.object({ email: z.email() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });
  try {
    await requestPasswordReset(parsed.data.email, `${new URL(request.url).origin}/auth/callback?next=/reset-password`);
  } catch {
    // Une réponse identique empêche l’énumération des comptes existants.
  }
  return NextResponse.json({ message: "Si ce compte existe, un email de récupération vient d’être envoyé." });
}
