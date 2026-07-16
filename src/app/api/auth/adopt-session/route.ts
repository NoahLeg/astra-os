import { NextResponse } from "next/server";
import { z } from "zod";
import { applySessionCookies, getUser } from "@/lib/server/auth";
import { createTenantForUser, getAccountProfile } from "@/lib/server/database";
import { getWorkspaceSubscription } from "@/lib/server/billing";

const schema = z.object({
  accessToken: z.string().trim().min(1).max(16_384),
  refreshToken: z.string().trim().min(1).max(16_384),
  expiresIn: z.coerce.number().int().positive().max(31_536_000).default(3_600),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Session invalide" }, { status: 400 });
  try {
    const user = await getUser(parsed.data.accessToken);
    const metadata = user.user_metadata ?? {};
    const fullName = typeof metadata.full_name === "string" && metadata.full_name.trim()
      ? metadata.full_name.trim()
      : typeof metadata.name === "string" && metadata.name.trim()
        ? metadata.name.trim()
        : user.email.split("@")[0];
    const companyName = typeof metadata.company_name === "string" && metadata.company_name.trim()
      ? metadata.company_name.trim()
      : `Espace de ${fullName}`;
    await createTenantForUser({ id: user.id, email: user.email, fullName, companyName });
    const [profile, subscription] = await Promise.all([
      getAccountProfile(user.id, user.email),
      getWorkspaceSubscription(user.id),
    ]);
    const response = NextResponse.json({
      user,
      onboardingCompleted: subscription.onboardingCompleted,
      landingPage: profile?.preferences.landingPage ?? "/",
    });
    applySessionCookies(response, {
      access_token: parsed.data.accessToken,
      refresh_token: parsed.data.refreshToken,
      expires_in: Math.min(parsed.data.expiresIn, 86_400),
      user,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Le lien a expiré ou est invalide" }, { status: 401 });
  }
}
