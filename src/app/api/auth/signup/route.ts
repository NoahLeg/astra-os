import { NextResponse } from "next/server";
import { z } from "zod";
import { applySessionCookies, signUpWithPassword } from "@/lib/server/auth";
import { createTenantForUser } from "@/lib/server/database";

const schema = z.object({
  fullName: z.string().trim().min(2).max(80),
  companyName: z.string().trim().min(2).max(100),
  email: z.email(),
  password: z.string().min(8).max(128).regex(/[A-Z]/, "Une majuscule est requise").regex(/[0-9]/, "Un chiffre est requis"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Informations invalides" }, { status: 400 });
  try {
    const session = await signUpWithPassword(parsed.data.email, parsed.data.password, { full_name: parsed.data.fullName, company_name: parsed.data.companyName }, `${new URL(request.url).origin}/auth/callback`);
    await createTenantForUser({ id: session.user.id, email: parsed.data.email, fullName: parsed.data.fullName, companyName: parsed.data.companyName });
    const response = NextResponse.json({ user: session.user, confirmationRequired: !session.access_token });
    if (session.access_token) applySessionCookies(response, session);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Inscription impossible" }, { status: 400 });
  }
}
