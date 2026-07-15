import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDecryptedIntegrationSecret } from "@/lib/server/admin-service";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceIdForUser, hasWorkspaceAccess, saveWorkspaceRecord } from "@/lib/server/database";
import { refreshGoogleAccessToken } from "@/lib/server/google-oauth";
import type { ActivityEvent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headerValue = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\r\n]/.test(value), "Les retours à la ligne ne sont pas autorisés.");

const sendEmailSchema = z.object({
  to: z
    .string()
    .trim()
    .email("Adresse e-mail invalide.")
    .max(320)
    .refine((value) => !/[\r\n]/.test(value), "Adresse e-mail invalide."),
  subject: headerValue,
  body: z.string().trim().min(1, "Le message est requis.").max(20_000),
  confirmed: z.literal(true),
});

function encodeSubject(subject: string) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function createRawMessage({ to, subject, body }: z.infer<typeof sendEmailSchema>) {
  const normalizedBody = body.replace(/\r?\n/g, "\r\n");
  const message = [
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(normalizedBody, "utf8").toString("base64"),
  ].join("\r\n");

  return Buffer.from(message, "utf8").toString("base64url");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine non autorisée" }, { status: 403 });
  }

  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  if (!await hasWorkspaceAccess(user.id, "operator")) return NextResponse.json({ error: "Accès opérateur requis" }, { status: 403 });

  const parsed = sendEmailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Message invalide" }, { status: 400 });
  }

  try {
    const workspaceId = await getWorkspaceIdForUser(user.id);
    if (!workspaceId) {
      return NextResponse.json({ error: "Espace de travail introuvable" }, { status: 404 });
    }

    const credential = await getDecryptedIntegrationSecret({
      workspaceId,
      provider: "Google OAuth",
      label: "oauth:gmail",
      actorUserId: user.id,
    });
    if (!credential) {
      return NextResponse.json(
        { error: "Connectez Gmail avant d’envoyer un e-mail." },
        { status: 409 },
      );
    }

    const startedAt = Date.now();
    const tokens = await refreshGoogleAccessToken(credential.secret);
    const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: createRawMessage(parsed.data) }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!gmailResponse.ok) {
      const details = await gmailResponse.json().catch(() => null) as { error?: { message?: string } } | null;
      const error = details?.error?.message ?? "Google a refusé l’envoi du message.";
      const reconnectRequired = gmailResponse.status === 401 || gmailResponse.status === 403;
      return NextResponse.json(
        {
          error: reconnectRequired
            ? "Gmail doit être reconnecté afin d’autoriser l’envoi d’e-mails."
            : error,
        },
        { status: gmailResponse.status >= 400 && gmailResponse.status < 500 ? gmailResponse.status : 502 },
      );
    }

    const gmailMessage = await gmailResponse.json() as { id?: string; threadId?: string };
    const activity: ActivityEvent = {
      id: randomUUID(),
      agent: "Email",
      action: `E-mail envoyé à ${parsed.data.to}`,
      status: "completed",
      duration: Date.now() - startedAt,
      confidence: 100,
      timestamp: new Date().toISOString(),
      details: `Objet : ${parsed.data.subject}`,
      tool: "Gmail",
    };
    await saveWorkspaceRecord("activities", activity, user.id);

    return NextResponse.json({ success: true, messageId: gmailMessage.id, threadId: gmailMessage.threadId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Envoi Gmail impossible" },
      { status: 502 },
    );
  }
}
