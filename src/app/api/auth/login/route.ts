import { NextResponse } from "next/server";
import { z } from "zod";
import { applySessionCookies, signInWithPassword } from "@/lib/server/auth";
import { createTenantForUser } from "@/lib/server/database";
import { getWorkspaceSubscription } from "@/lib/server/billing";

const schema = z.object({ email: z.email(), password: z.string().min(8) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Email ou mot de passe invalide" }, { status: 400 });
  try {
    const session = await signInWithPassword(parsed.data.email, parsed.data.password);
    const metadata = session.user.user_metadata ?? {};
    const fullName = typeof metadata.full_name === "string" && metadata.full_name.trim() ? metadata.full_name : session.user.email.split("@")[0];
    const companyName = typeof metadata.company_name === "string" && metadata.company_name.trim() ? metadata.company_name : `Espace de ${fullName}`;
    await createTenantForUser({ id: session.user.id, email: session.user.email, fullName, companyName });
    const subscription = await getWorkspaceSubscription(session.user.id);
    const response = NextResponse.json({ user: session.user, onboardingCompleted: subscription.onboardingCompleted });
    applySessionCookies(response, session);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Connexion impossible" }, { status: 401 });
  }
}
