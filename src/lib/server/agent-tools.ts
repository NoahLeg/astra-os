import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getGoogleAccessToken } from "@/lib/server/google-credentials";
import type { GoogleConnectionId } from "@/lib/server/google-oauth";
import type { AgentToolCall, AgentToolName, Connection, RiskLevel } from "@/types";

const safeHeader = z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value), "Les retours à la ligne sont interdits.");
const dateTime = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), "Date ISO invalide.");

export const sendEmailArgumentsSchema = z.object({
  to: z.string().trim().email().max(320).refine((value) => !/[\r\n]/.test(value)),
  subject: safeHeader,
  body: z.string().trim().min(1).max(20_000),
});

export const createEmailDraftArgumentsSchema = sendEmailArgumentsSchema;

export const organizeEmailArgumentsSchema = z.object({
  messageIds: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  action: z.enum(["archive", "mark_read", "mark_unread", "star", "unstar", "label"]),
  labelName: safeHeader.optional(),
}).superRefine((value, context) => {
  if (value.action === "label" && !value.labelName) {
    context.addIssue({ code: "custom", path: ["labelName"], message: "Un nom de libellé est requis." });
  }
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
  z.object({ tool: z.literal("create_email_draft"), arguments: createEmailDraftArgumentsSchema }),
  z.object({ tool: z.literal("organize_email"), arguments: organizeEmailArgumentsSchema }),
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
  create_email_draft: {
    label: "Créer un brouillon Gmail",
    description: "Crée un brouillon dans la boîte Gmail connectée sans l’envoyer.",
    connectionId: "gmail",
    risk: "low",
    impact: "Brouillon ajouté à Gmail, modifiable ou supprimable avant envoi",
    dataUsed: ["Contenu généré", "Adresse du destinataire", "Connexion Gmail"],
    argumentsExample: '{"to":"contact@entreprise.fr","subject":"Objet","body":"Message"}',
  },
  organize_email: {
    label: "Classer des e-mails Gmail",
    description: "Archive, marque comme lu ou non lu, ajoute une étoile ou applique un libellé à une sélection précise.",
    connectionId: "gmail",
    risk: "medium",
    impact: "Organisation de messages existants dans la boîte Gmail",
    dataUsed: ["Identifiants des messages analysés", "Libellés Gmail", "Connexion Gmail"],
    argumentsExample: '{"messageIds":["18f0abc123"],"action":"label","labelName":"Prospects prioritaires"}',
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
  coordinateur: ["send_email", "create_email_draft", "organize_email", "create_calendar_event", "create_drive_file"],
  email: ["send_email", "create_email_draft", "organize_email"],
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
  if (tool === "create_email_draft") return { tool, arguments: createEmailDraftArgumentsSchema.parse(value) };
  if (tool === "organize_email") return { tool, arguments: organizeEmailArgumentsSchema.parse(value) };
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

async function readGoogleError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (response.status === 401 || response.status === 403) return "Le connecteur Google doit être reconnecté ou ses permissions doivent être élargies.";
  return payload?.error?.message ?? `Google a refusé l'opération (${response.status}).`;
}

interface GmailMessageSnapshot {
  id: string;
  threadId: string | undefined;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  labelIds: string[];
}

function normalizeMailboxText(value: string | undefined, maximumLength: number) {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function buildMailboxQuery(instruction: string) {
  const normalized = instruction.toLowerCase();
  const filters = ["newer_than:30d"];
  if (/non[ -]?lu|unread/.test(normalized)) filters.push("is:unread");
  if (/important|prioritaire/.test(normalized)) filters.push("is:important");
  if (/étoil|star/.test(normalized)) filters.push("is:starred");
  if (!/envoy|sent|brouillon|draft/.test(normalized)) filters.push("in:inbox");
  return filters.join(" ");
}

export function shouldInspectMailbox(agentId: string, instruction: string) {
  return (agentId === "email" || agentId === "coordinateur") && /(e-?mail|gmail|courriel|bo[iî]te|inbox|message|relance|brouillon|prospect)/i.test(instruction);
}

export async function getGmailMailboxSnapshot(userId: string, instruction: string, maximumResults = 15) {
  const accessToken = await getGoogleAccessToken(userId, "gmail");
  const query = buildMailboxQuery(instruction);
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(Math.min(Math.max(maximumResults, 1), 20)));
  listUrl.searchParams.set("q", query);
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!listResponse.ok) throw new Error(await readGoogleError(listResponse));
  const listed = await listResponse.json() as { messages?: Array<{ id: string }> };
  const messages = await Promise.all((listed.messages ?? []).map(async ({ id }) => {
    const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
    detailUrl.searchParams.set("format", "metadata");
    for (const header of ["From", "Subject", "Date"]) detailUrl.searchParams.append("metadataHeaders", header);
    const response = await fetch(detailUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const message = await response.json() as {
      id: string;
      threadId?: string;
      snippet?: string;
      labelIds?: string[];
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const headers = new Map((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
    return {
      id: message.id,
      threadId: message.threadId,
      from: normalizeMailboxText(headers.get("from"), 240),
      subject: normalizeMailboxText(headers.get("subject"), 300) || "Sans objet",
      date: normalizeMailboxText(headers.get("date"), 120),
      snippet: normalizeMailboxText(message.snippet, 360),
      labelIds: message.labelIds ?? [],
    } satisfies GmailMessageSnapshot;
  }));
  const validMessages = messages.filter((message): message is GmailMessageSnapshot => Boolean(message));
  return {
    query,
    messages: validMessages,
    context: validMessages.length
      ? validMessages.map((message) => `- ID=${message.id} | De=${message.from || "Inconnu"} | Objet=${message.subject} | Date=${message.date || "Inconnue"} | Labels=${message.labelIds.join(",")} | Extrait=${message.snippet}`).join("\n")
      : "Aucun message ne correspond à la recherche limitée.",
  };
}

async function resolveGmailLabelId(accessToken: string, labelName: string) {
  const listResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!listResponse.ok) throw new Error(await readGoogleError(listResponse));
  const labels = await listResponse.json() as { labels?: Array<{ id: string; name: string }> };
  const existing = labels.labels?.find((label) => label.name.localeCompare(labelName, undefined, { sensitivity: "accent" }) === 0);
  if (existing) return existing.id;
  const createResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: labelName, labelListVisibility: "labelShow", messageListVisibility: "show" }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!createResponse.ok) throw new Error(await readGoogleError(createResponse));
  const created = await createResponse.json() as { id?: string };
  if (!created.id) throw new Error("Google n’a pas renvoyé le libellé créé.");
  return created.id;
}

export async function executeAgentToolCall(userId: string, call: AgentToolCall) {
  const metadata = agentToolCatalog[call.tool];
  const accessToken = await getGoogleAccessToken(userId, metadata.connectionId);

  if (call.tool === "send_email" || call.tool === "create_email_draft") {
    const isDraft = call.tool === "create_email_draft";
    const response = await fetch(isDraft ? "https://gmail.googleapis.com/gmail/v1/users/me/drafts" : "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(isDraft ? { message: { raw: createRawMessage(call.arguments) } } : { raw: createRawMessage(call.arguments) }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(await readGoogleError(response));
    const message = await response.json() as { id?: string; message?: { id?: string } };
    return isDraft
      ? { summary: `Brouillon Gmail créé pour ${call.arguments.to}`, externalId: message.id ?? message.message?.id, details: `Objet : ${call.arguments.subject}` }
      : { summary: `E-mail envoyé à ${call.arguments.to}`, externalId: message.id, details: `Objet : ${call.arguments.subject}` };
  }

  if (call.tool === "organize_email") {
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];
    if (call.arguments.action === "archive") removeLabelIds.push("INBOX");
    if (call.arguments.action === "mark_read") removeLabelIds.push("UNREAD");
    if (call.arguments.action === "mark_unread") addLabelIds.push("UNREAD");
    if (call.arguments.action === "star") addLabelIds.push("STARRED");
    if (call.arguments.action === "unstar") removeLabelIds.push("STARRED");
    if (call.arguments.action === "label" && call.arguments.labelName) addLabelIds.push(await resolveGmailLabelId(accessToken, call.arguments.labelName));
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: call.arguments.messageIds, addLabelIds, removeLabelIds }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(await readGoogleError(response));
    const actionLabels: Record<typeof call.arguments.action, string> = {
      archive: "archivé(s)",
      mark_read: "marqué(s) comme lu(s)",
      mark_unread: "marqué(s) comme non lu(s)",
      star: "ajouté(s) aux favoris",
      unstar: "retiré(s) des favoris",
      label: `classé(s) dans « ${call.arguments.labelName} »`,
    };
    return {
      summary: `${call.arguments.messageIds.length} e-mail(s) ${actionLabels[call.arguments.action]}`,
      details: `Identifiants : ${call.arguments.messageIds.join(", ")}`,
    };
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
