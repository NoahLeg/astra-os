import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDecryptedIntegrationSecret } from "@/lib/server/admin-service";
import { getWorkspaceIdForUser } from "@/lib/server/database";
import { refreshGoogleAccessToken, type GoogleConnectionId } from "@/lib/server/google-oauth";
import type { AgentToolCall, AgentToolName, Connection, RiskLevel } from "@/types";

const safeHeader = z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value), "Les retours à la ligne sont interdits.");
const dateTime = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), "Date ISO invalide.");

export const sendEmailArgumentsSchema = z.object({
  to: z.string().trim().email().max(320).refine((value) => !/[\r\n]/.test(value)),
  subject: safeHeader,
  body: z.string().trim().min(1).max(20_000),
});

export const createCalendarEventArgumentsSchema = z.object({
  title: safeHeader,
  description: z.string().trim().max(8_000).optional(),
  startAt: dateTime,
  endAt: dateTime,
  attendees: z.array(z.string().trim().email().max(320)).max(20).default([]),
  timeZone: z.string().trim().min(1).max(80).default("Europe/Paris"),
}).refine((value) => Date.parse(value.endAt) > Date.parse(value.startAt), { message: "La fin doit être postérieure au début.", path: ["endAt"] });

export const createDriveFileArgumentsSchema = z.object({
  name: z.string().trim().min(1).max(180).refine((value) => !/[\0\\/]/.test(value), "Nom de fichier invalide."),
  content: z.string().min(1).max(100_000),
  mimeType: z.enum(["text/plain", "text/markdown"]).default("text/markdown"),
});

export const agentToolCallSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("send_email"), arguments: sendEmailArgumentsSchema }),
  z.object({ tool: z.literal("create_calendar_event"), arguments: createCalendarEventArgumentsSchema }),
  z.object({ tool: z.literal("create_drive_file"), arguments: createDriveFileArgumentsSchema }),
]);

export const agentToolCatalog: Record<AgentToolName, {
  label: string;
  description: string;
  connectionId: GoogleConnectionId;
  risk: RiskLevel;
  impact: string;
  dataUsed: string[];
  argumentsExample: string;
}> = {
  send_email: {
    label: "Envoyer un e-mail avec Gmail",
    description: "Envoie réellement un message depuis la boîte Gmail connectée.",
    connectionId: "gmail",
    risk: "medium",
    impact: "Communication externe envoyée au destinataire",
    dataUsed: ["Brouillon généré", "Adresse du destinataire", "Connexion Gmail"],
    argumentsExample: '{"to":"contact@entreprise.fr","subject":"Objet","body":"Message"}',
  },
  create_calendar_event: {
    label: "Créer un événement Google Calendar",
    description: "Ajoute un événement réel et peut notifier les participants.",
    connectionId: "calendar",
    risk: "medium",
    impact: "Événement ajouté au calendrier et invitations éventuellement envoyées",
    dataUsed: ["Titre", "Horaires", "Participants", "Connexion Google Calendar"],
    argumentsExample: '{"title":"Réunion","description":"Ordre du jour","startAt":"2026-08-01T10:00:00+02:00","endAt":"2026-08-01T10:30:00+02:00","attendees":[],"timeZone":"Europe/Paris"}',
  },
  create_drive_file: {
    label: "Créer un fichier Google Drive",
    description: "Crée un fichier texte ou Markdown dans le Drive connecté.",
    connectionId: "drive",
    risk: "low",
    impact: "Nouveau fichier créé dans Google Drive",
    dataUsed: ["Nom du fichier", "Contenu généré", "Connexion Google Drive"],
    argumentsExample: '{"name":"proposition-commerciale.md","content":"# Proposition","mimeType":"text/markdown"}',
  },
};

const agentToolPermissions: Record<string, AgentToolName[]> = {
  coordinateur: ["send_email", "create_calendar_event", "create_drive_file"],
  email: ["send_email"],
  calendrier: ["create_calendar_event"],
  documents: ["create_drive_file"],
};

export function getAvailableAgentTools(agentId: string, connections: Connection[]) {
  const connectedIds = new Set(connections.filter((connection) => connection.status === "connected").map((connection) => connection.id));
  return (agentToolPermissions[agentId] ?? []).filter((tool) => connectedIds.has(agentToolCatalog[tool].connectionId));
}

export function parseToolArguments(tool: AgentToolName, rawArguments: string): AgentToolCall {
  let value: unknown;
  try {
    value = JSON.parse(rawArguments);
  } catch {
    throw new Error("Les arguments proposés pour l'outil ne sont pas un JSON valide.");
  }
  if (tool === "send_email") return { tool, arguments: sendEmailArgumentsSchema.parse(value) };
  if (tool === "create_calendar_event") return { tool, arguments: createCalendarEventArgumentsSchema.parse(value) };
  return { tool, arguments: createDriveFileArgumentsSchema.parse(value) };
}

function encodeSubject(subject: string) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function createRawMessage(input: z.infer<typeof sendEmailArgumentsSchema>) {
  const normalizedBody = input.body.replace(/\r?\n/g, "\r\n");
  const message = [
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(normalizedBody, "utf8").toString("base64"),
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

async function getGoogleAccessToken(userId: string, connectionId: GoogleConnectionId) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) throw new Error("Espace de travail introuvable.");
  const credential = await getDecryptedIntegrationSecret({
    workspaceId,
    provider: "Google OAuth",
    label: `oauth:${connectionId}`,
    actorUserId: userId,
  });
  if (!credential) throw new Error(`Le connecteur ${connectionId} doit être autorisé avant l'exécution.`);
  const token = await refreshGoogleAccessToken(credential.secret);
  return token.access_token;
}

async function readGoogleError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (response.status === 401 || response.status === 403) return "Le connecteur Google doit être reconnecté ou ses permissions doivent être élargies.";
  return payload?.error?.message ?? `Google a refusé l'opération (${response.status}).`;
}

export async function executeAgentToolCall(userId: string, call: AgentToolCall) {
  const metadata = agentToolCatalog[call.tool];
  const accessToken = await getGoogleAccessToken(userId, metadata.connectionId);

  if (call.tool === "send_email") {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: createRawMessage(call.arguments) }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(await readGoogleError(response));
    const message = await response.json() as { id?: string; threadId?: string };
    return { summary: `E-mail envoyé à ${call.arguments.to}`, externalId: message.id, details: `Objet : ${call.arguments.subject}` };
  }

  if (call.tool === "create_calendar_event") {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=${call.arguments.attendees.length ? "all" : "none"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: call.arguments.title,
        description: call.arguments.description,
        start: { dateTime: call.arguments.startAt, timeZone: call.arguments.timeZone },
        end: { dateTime: call.arguments.endAt, timeZone: call.arguments.timeZone },
        attendees: call.arguments.attendees.map((email) => ({ email })),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(await readGoogleError(response));
    const event = await response.json() as { id?: string; htmlLink?: string };
    return { summary: `Événement « ${call.arguments.title} » créé`, externalId: event.id, url: event.htmlLink, details: `${call.arguments.startAt} → ${call.arguments.endAt}` };
  }

  const boundary = `astra_${randomUUID().replaceAll("-", "")}`;
  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name: call.arguments.name, mimeType: call.arguments.mimeType }),
    `--${boundary}`,
    `Content-Type: ${call.arguments.mimeType}; charset=UTF-8`,
    "",
    call.arguments.content,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipartBody,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(await readGoogleError(response));
  const file = await response.json() as { id?: string; name?: string; webViewLink?: string };
  return { summary: `Fichier « ${file.name ?? call.arguments.name} » créé dans Drive`, externalId: file.id, url: file.webViewLink, details: call.arguments.mimeType };
}
