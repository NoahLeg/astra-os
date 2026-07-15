import { NextResponse } from "next/server";
import { z } from "zod";
import { applySessionCookies, getUser } from "@/lib/server/auth";

const schema = z.object({ accessToken: z.string().min(20), refreshToken: z.string().min(20), expiresIn: z.coerce.number().int().positive().max(86_400) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Session invalide" }, { status: 400 });
  try {
    const user = await getUser(parsed.data.accessToken);
    const response = NextResponse.json({ user });
    applySessionCookies(response, { access_token: parsed.data.accessToken, refresh_token: parsed.data.refreshToken, expires_in: parsed.data.expiresIn, user });
    return response;
  } catch {
    return NextResponse.json({ error: "Le lien a expiré ou est invalide" }, { status: 401 });
  }
}
