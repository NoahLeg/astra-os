import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getGoogleAccessToken } from "@/lib/server/google-credentials";
import type { GoogleConnectionId } from "@/lib/server/google-oauth";
import type { Agent, AgentToolCall, AgentToolName, Connection, Permission, RiskLevel } from "@/types";

const safeHeader = z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value), "Les retours à la ligne sont interdits.");
const dateTime = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), "Date ISO invalide.");
const gmailMessageId = z.string().trim().regex(/^[A-Za-z0-9_-]{5,200}$/, "Identifiant Gmail invalide.");

export const sendEmailArgumentsSchema = z.object({
  to: z.string().trim().email().max(320).refine((value) => !/[\r\n]/.test(value)),
  subject: safeHeader,
  body: z.string().trim().min(1).max(20_000),
});

export const createEmailDraftArgumentsSchema = sendEmailArgumentsSchema;

export const organizeEmailArgumentsSchema = z.object({
  messageIds: z.array(gmailMessageId).min(1).max(1_000),
  action: z.enum(["archive", "mark_read", "mark_unread", "star", "unstar", "label"]),
  labelName: safeHeader.optional(),
}).superRefine((value, context) => {
  if (value.action === "label" && !value.labelName) context.addIssue({ code: "custom", path: ["labelName"], message: "Un nom de libellé est requis." });
});

const smartGmailOperationSchema = z.object({
  messageIds: z.array(gmailMessageId).min(1).max(1_000),
  category: z.enum(["invoice", "order", "bank", "social", "github", "newsletter", "work", "personal", "promotion", "spam", "other"]),
  labelPath: z.string().trim().min(7).max(160).regex(/^Astra\/[A-Za-zÀ-ÿ0-9 _'’.-]+(?:\/[A-Za-zÀ-ÿ0-9 _'’.-]+)*$/, "Le libellé doit utiliser une hiérarchie sous Astra/."),
  archive: z.boolean(),
  markRead: z.boolean(),
  markImportant: z.boolean(),
  spam: z.boolean(),
  trash: z.boolean(),
  reason: z.string().trim().min(3).max(500),
  confidence: z.number().int().min(0).max(100),
}).superRefine((value, context) => {
  if (value.spam && value.trash) context.addIssue({ code: "custom", path: ["spam"], message: "Un message ne peut pas être envoyé simultanément dans les spams et la corbeille." });
  if ((value.spam || value.trash) && value.confidence < 85) context.addIssue({ code: "custom", path: ["confidence"], message: "Une confiance d'au moins 85 % est requise pour les spams ou la corbeille." });
});

export const smartOrganizeGmailArgumentsSchema = z.object({
  operations: z.array(smartGmailOperationSchema).min(1).max(50),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  for (const operation of value.operations) {
    for (const messageId of operation.messageIds) {
      if (seen.has(messageId)) context.addIssue({ code: "custom", path: ["operations"], message: `Le message ${messageId} apparaît dans plusieurs opérations.` });
      seen.add(messageId);
    }
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
  z.object({ tool: z.literal("smart_organize_gmail"), arguments: smartOrganizeGmailArgumentsSchema }),
  z.object({ tool: z.literal("create_calendar_event"), arguments: createCalendarEventArgumentsSchema }),
  z.object({ tool: z.literal("create_drive_file"), arguments: createDriveFileArgumentsSchema }),
]);

type PermissionAction = Permission["actions"][number];

export const agentToolCatalog: Record<AgentToolName, {
  label: string;
  description: string;
  connectionId: GoogleConnectionId;
  risk: RiskLevel;
  impact: string;
  dataUsed: string[];
  argumentsExample: string;
  requiredActions: PermissionAction[];
}> = {
  send_email: {
    label: "Envoyer un e-mail avec Gmail",
    description: "Envoie réellement un message depuis la boîte Gmail connectée.",
    connectionId: "gmail", risk: "medium", impact: "Communication externe envoyée au destinataire",
    dataUsed: ["Brouillon généré", "Adresse du destinataire", "Connexion Gmail"],
    argumentsExample: '{"to":"contact@entreprise.fr","subject":"Objet","body":"Message"}', requiredActions: ["send"],
  },
  create_email_draft: {
    label: "Créer un brouillon Gmail", description: "Crée un brouillon Gmail sans l’envoyer.",
    connectionId: "gmail", risk: "low", impact: "Brouillon ajouté à Gmail",
    dataUsed: ["Contenu généré", "Adresse du destinataire", "Connexion Gmail"],
    argumentsExample: '{"to":"contact@entreprise.fr","subject":"Objet","body":"Message"}', requiredActions: ["create"],
  },
  organize_email: {
    label: "Classer des e-mails Gmail", description: "Applique une action simple à une sélection précise d’e-mails.",
    connectionId: "gmail", risk: "medium", impact: "Organisation de messages existants dans Gmail",
    dataUsed: ["Identifiants des messages", "Libellés Gmail", "Connexion Gmail"],
    argumentsExample: '{"messageIds":["18f0abc123"],"action":"label","labelName":"Astra/Travail/Prospects"}', requiredActions: ["read", "update"],
  },
  smart_organize_gmail: {
    label: "Organiser intelligemment la boîte Gmail",
    description: "Classe individuellement plusieurs e-mails, crée des libellés hiérarchiques, archive, marque comme lu ou important et peut proposer spam ou corbeille avec validation.",
    connectionId: "gmail", risk: "medium", impact: "Plan multi-actions appliqué aux messages Gmail sélectionnés",
    dataUsed: ["Contenu et métadonnées des messages", "Libellés Gmail", "Connexion Gmail"],
    argumentsExample: '{"operations":[{"messageIds":["18f0abc123"],"category":"invoice","labelPath":"Astra/Finance/Factures","archive":true,"markRead":true,"markImportant":false,"spam":false,"trash":false,"reason":"Facture fournisseur","confidence":96}]}',
    requiredActions: ["read", "update"],
  },
  create_calendar_event: {
    label: "Créer un événement Google Calendar", description: "Ajoute un événement réel et peut notifier les participants.",
    connectionId: "calendar", risk: "medium", impact: "Événement ajouté au calendrier",
    dataUsed: ["Titre", "Horaires", "Participants", "Connexion Google Calendar"],
    argumentsExample: '{"title":"Réunion","description":"Ordre du jour","startAt":"2026-08-01T10:00:00+02:00","endAt":"2026-08-01T10:30:00+02:00","attendees":[],"timeZone":"Europe/Paris"}', requiredActions: ["schedule"],
  },
  create_drive_file: {
    label: "Créer un fichier Google Drive", description: "Crée un fichier texte ou Markdown dans le Drive connecté.",
    connectionId: "drive", risk: "low", impact: "Nouveau fichier créé dans Google Drive",
    dataUsed: ["Nom du fichier", "Contenu généré", "Connexion Google Drive"],
    argumentsExample: '{"name":"proposition-commerciale.md","content":"# Proposition","mimeType":"text/markdown"}', requiredActions: ["create"],
  },
};

const agentToolPermissions: Record<string, AgentToolName[]> = {
  coordinateur: ["send_email", "create_email_draft", "organize_email", "smart_organize_gmail", "create_calendar_event", "create_drive_file"],
  email: ["send_email", "create_email_draft", "organize_email", "smart_organize_gmail"],
  calendrier: ["create_calendar_event"],
  documents: ["create_drive_file"],
};

function hasConfiguredPermission(agent: Agent, tool: AgentToolName) {
  const permissions = agent.permissions ?? [];
  const connectionId = agentToolCatalog[tool].connectionId;
  const relevant = permissions.filter((permission) => {
    const resource = permission.resource.toLowerCase();
    return resource === "espace de travail" || resource.includes(connectionId) || (connectionId === "gmail" && resource.includes("email")) || resource.includes("google");
  });
  return relevant.some((permission) => agentToolCatalog[tool].requiredActions.every((action) => permission.actions.includes(action)));
}

export function getAvailableAgentTools(agentOrId: Agent | string, connections: Connection[]) {
  const agentId = typeof agentOrId === "string" ? agentOrId : agentOrId.id;
  const connectedIds = new Set(connections.filter((connection) => connection.status === "connected").map((connection) => connection.id));
  return (agentToolPermissions[agentId] ?? []).filter((tool) => connectedIds.has(agentToolCatalog[tool].connectionId)
    && (typeof agentOrId === "string" || hasConfiguredPermission(agentOrId, tool)));
}

export function parseToolArguments(tool: AgentToolName, rawArguments: string): AgentToolCall {
  let value: unknown;
  try { value = JSON.parse(rawArguments); } catch { throw new Error("Les arguments proposés pour l'outil ne sont pas un JSON valide."); }
  if (tool === "send_email") return { tool, arguments: sendEmailArgumentsSchema.parse(value) };
  if (tool === "create_email_draft") return { tool, arguments: createEmailDraftArgumentsSchema.parse(value) };
  if (tool === "organize_email") return { tool, arguments: organizeEmailArgumentsSchema.parse(value) };
  if (tool === "smart_organize_gmail") return { tool, arguments: smartOrganizeGmailArgumentsSchema.parse(value) };
  if (tool === "create_calendar_event") return { tool, arguments: createCalendarEventArgumentsSchema.parse(value) };
  return { tool, arguments: createDriveFileArgumentsSchema.parse(value) };
}

function encodeSubject(subject: string) { return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`; }

function createRawMessage(input: z.infer<typeof sendEmailArgumentsSchema>) {
  const normalizedBody = input.body.replace(/\r?\n/g, "\r\n");
  const message = [`To: ${input.to}`, `Subject: ${encodeSubject(input.subject)}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", Buffer.from(normalizedBody, "utf8").toString("base64")].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

async function readGoogleError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null;
  const reason = payload?.error?.errors?.[0]?.reason;
  if (response.status === 401) return "La session Google a expiré. Reconnectez le connecteur Gmail pour renouveler l’accès.";
  if (response.status === 403 && reason === "insufficientPermissions") return "Les permissions Gmail accordées sont insuffisantes. Reconnectez Google en acceptant les accès demandés.";
  if (response.status === 403) return "Google a refusé cette opération. Vérifiez les scopes OAuth et les règles de votre organisation.";
  if (response.status === 429) return "La limite temporaire de l’API Gmail est atteinte. L’automatisation pourra être relancée.";
  return payload?.error?.message ?? `Google a refusé l'opération (${response.status}).`;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessageSnapshot {
  id: string;
  threadId?: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  labels: string[];
}

function normalizeMailboxText(value: string | undefined, maximumLength: number) {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function decodeBase64Url(value: string | undefined) {
  if (!value) return "";
  try { return Buffer.from(value, "base64url").toString("utf8"); } catch { return ""; }
}

function stripHtml(value: string) {
  return value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function extractMessageBody(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  const plainChildren = (part.parts ?? []).map(extractMessageBody).filter(Boolean);
  if (plainChildren.length) return plainChildren.join("\n");
  if (part.mimeType === "text/html" && part.body?.data) return stripHtml(decodeBase64Url(part.body.data));
  return "";
}

function buildMailboxQuery(instruction: string) {
  const normalized = instruction.toLowerCase();
  const filters = ["newer_than:60d"];
  if (/non[ -]?lu|unread/.test(normalized)) filters.push("is:unread");
  if (/important|prioritaire/.test(normalized)) filters.push("is:important");
  if (/étoil|star/.test(normalized)) filters.push("is:starred");
  if (!/envoy|sent|brouillon|draft/.test(normalized)) filters.push("in:inbox");
  return filters.join(" ");
}

export function shouldInspectMailbox(agentId: string, instruction: string) {
  return (agentId === "email" || agentId === "coordinateur") && /(e-?mail|gmail|courriel|bo[iî]te|inbox|message|relance|brouillon|prospect|tri|class|facture|newsletter|promotion)/i.test(instruction);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) results.push(...await Promise.all(items.slice(index, index + concurrency).map(mapper)));
  return results;
}

export async function getGmailMailboxSnapshot(userId: string, instruction: string, maximumResults = 20) {
  const accessToken = await getGoogleAccessToken(userId, "gmail");
  const query = buildMailboxQuery(instruction);
  const [labelsResponse, listResponse] = await Promise.all([
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) }),
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ maxResults: String(Math.min(Math.max(maximumResults, 1), 50)), q: query })}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) }),
  ]);
  if (!labelsResponse.ok) throw new Error(await readGoogleError(labelsResponse));
  if (!listResponse.ok) throw new Error(await readGoogleError(listResponse));
  const labelsPayload = await labelsResponse.json() as { labels?: Array<{ id: string; name: string }> };
  const labelNames = new Map((labelsPayload.labels ?? []).map((label) => [label.id, label.name]));
  const listed = await listResponse.json() as { messages?: Array<{ id: string }> };
  const messages = await mapWithConcurrency<{ id: string }, GmailMessageSnapshot | null>(listed.messages ?? [], 5, async ({ id }) => {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    const message = await response.json() as { id: string; threadId?: string; snippet?: string; labelIds?: string[]; payload?: GmailPart & { headers?: Array<{ name: string; value: string }> } };
    const headers = new Map((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
    return {
      id: message.id, threadId: message.threadId,
      from: normalizeMailboxText(headers.get("from"), 240), to: normalizeMailboxText(headers.get("to"), 240),
      subject: normalizeMailboxText(headers.get("subject"), 300) || "Sans objet", date: normalizeMailboxText(headers.get("date"), 120),
      snippet: normalizeMailboxText(message.snippet, 400), body: normalizeMailboxText(extractMessageBody(message.payload), 1_600),
      labels: (message.labelIds ?? []).map((labelId) => labelNames.get(labelId) ?? labelId),
    } satisfies GmailMessageSnapshot;
  });
  const validMessages = messages.filter((message): message is GmailMessageSnapshot => message !== null);
  return {
    query, messages: validMessages,
    context: validMessages.length ? validMessages.map((message) => `- ID=${message.id} | De=${message.from || "Inconnu"} | À=${message.to || "Inconnu"} | Objet=${message.subject} | Date=${message.date || "Inconnue"} | Labels=${message.labels.join(",")} | Extrait=${message.snippet} | Contenu=${message.body || "Non disponible"}`).join("\n") : "Aucun message ne correspond à la recherche limitée.",
  };
}

async function listGmailLabels(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(await readGoogleError(response));
  const payload = await response.json() as { labels?: Array<{ id: string; name: string }> };
  return new Map((payload.labels ?? []).map((label) => [label.name.toLocaleLowerCase("fr"), label.id]));
}

async function createGmailLabel(accessToken: string, labelName: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: labelName, labelListVisibility: "labelShow", messageListVisibility: "show" }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(await readGoogleError(response));
  const created = await response.json() as { id?: string };
  if (!created.id) throw new Error("Google n’a pas renvoyé le libellé créé.");
  return created.id;
}

async function resolveGmailLabelHierarchy(accessToken: string, labelName: string, labels: Map<string, string>) {
  const segments = labelName.split("/");
  let current = "";
  let finalId = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    const key = current.toLocaleLowerCase("fr");
    finalId = labels.get(key) ?? await createGmailLabel(accessToken, current);
    labels.set(key, finalId);
  }
  return finalId;
}

async function batchModify(accessToken: string, ids: string[], addLabelIds: string[], removeLabelIds: string[]) {
  for (let index = 0; index < ids.length; index += 1_000) {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(index, index + 1_000), addLabelIds, removeLabelIds }), cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(await readGoogleError(response));
  }
}

async function trashMessages(accessToken: string, ids: string[]) {
  await mapWithConcurrency([...new Set(ids)], 5, async (messageId) => {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(await readGoogleError(response));
  });
}

async function executeSmartGmailPlan(accessToken: string, call: Extract<AgentToolCall, { tool: "smart_organize_gmail" }>) {
  const labels = await listGmailLabels(accessToken);
  const grouped = new Map<string, { ids: string[]; add: string[]; remove: string[]; reasons: string[] }>();
  const messagesToTrash: string[] = [];
  for (const operation of call.arguments.operations) {
    const labelId = await resolveGmailLabelHierarchy(accessToken, operation.labelPath, labels);
    const add = [labelId, ...(operation.markImportant ? ["IMPORTANT"] : []), ...(operation.spam ? ["SPAM"] : [])];
    const remove = [...(operation.archive || operation.spam || operation.trash ? ["INBOX"] : []), ...(operation.markRead ? ["UNREAD"] : [])];
    if (operation.trash) messagesToTrash.push(...operation.messageIds);
    const key = JSON.stringify({ add: [...new Set(add)].sort(), remove: [...new Set(remove)].sort() });
    const group = grouped.get(key) ?? { ids: [], add: [...new Set(add)], remove: [...new Set(remove)], reasons: [] };
    group.ids.push(...operation.messageIds);
    group.reasons.push(`${operation.labelPath}: ${operation.reason}`);
    grouped.set(key, group);
  }
  for (const group of grouped.values()) await batchModify(accessToken, [...new Set(group.ids)], group.add, group.remove);
  if (messagesToTrash.length) await trashMessages(accessToken, messagesToTrash);
  const total = new Set(call.arguments.operations.flatMap((operation) => operation.messageIds)).size;
  const archived = call.arguments.operations.filter((operation) => operation.archive).reduce((sum, operation) => sum + operation.messageIds.length, 0);
  const important = call.arguments.operations.filter((operation) => operation.markImportant).reduce((sum, operation) => sum + operation.messageIds.length, 0);
  const spam = call.arguments.operations.filter((operation) => operation.spam).reduce((sum, operation) => sum + operation.messageIds.length, 0);
  const trashed = call.arguments.operations.filter((operation) => operation.trash).reduce((sum, operation) => sum + operation.messageIds.length, 0);
  return { summary: `${total} e-mail(s) organisés dans ${call.arguments.operations.length} catégorie(s)`, details: `Archivés : ${archived} · Importants : ${important} · Spams : ${spam} · Corbeille : ${trashed}\n${call.arguments.operations.map((operation) => `${operation.labelPath} (${operation.messageIds.length}) — ${operation.reason}`).join("\n")}` };
}

export async function executeAgentToolCall(userId: string, call: AgentToolCall) {
  const metadata = agentToolCatalog[call.tool];
  const accessToken = await getGoogleAccessToken(userId, metadata.connectionId);
  if (call.tool === "send_email" || call.tool === "create_email_draft") {
    const isDraft = call.tool === "create_email_draft";
    const response = await fetch(isDraft ? "https://gmail.googleapis.com/gmail/v1/users/me/drafts" : "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(isDraft ? { message: { raw: createRawMessage(call.arguments) } } : { raw: createRawMessage(call.arguments) }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(await readGoogleError(response));
    const message = await response.json() as { id?: string; message?: { id?: string } };
    return isDraft ? { summary: `Brouillon Gmail créé pour ${call.arguments.to}`, externalId: message.id ?? message.message?.id, details: `Objet : ${call.arguments.subject}` } : { summary: `E-mail envoyé à ${call.arguments.to}`, externalId: message.id, details: `Objet : ${call.arguments.subject}` };
  }
  if (call.tool === "organize_email") {
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];
    if (call.arguments.action === "archive") removeLabelIds.push("INBOX");
    if (call.arguments.action === "mark_read") removeLabelIds.push("UNREAD");
    if (call.arguments.action === "mark_unread") addLabelIds.push("UNREAD");
    if (call.arguments.action === "star") addLabelIds.push("STARRED");
    if (call.arguments.action === "unstar") removeLabelIds.push("STARRED");
    if (call.arguments.action === "label" && call.arguments.labelName) addLabelIds.push(await resolveGmailLabelHierarchy(accessToken, call.arguments.labelName, await listGmailLabels(accessToken)));
    await batchModify(accessToken, call.arguments.messageIds, addLabelIds, removeLabelIds);
    return { summary: `${call.arguments.messageIds.length} e-mail(s) classés`, details: `${call.arguments.action}${call.arguments.labelName ? ` · ${call.arguments.labelName}` : ""}` };
  }
  if (call.tool === "smart_organize_gmail") return executeSmartGmailPlan(accessToken, call);
  if (call.tool === "create_calendar_event") {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=${call.arguments.attendees.length ? "all" : "none"}`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ summary: call.arguments.title, description: call.arguments.description, start: { dateTime: call.arguments.startAt, timeZone: call.arguments.timeZone }, end: { dateTime: call.arguments.endAt, timeZone: call.arguments.timeZone }, attendees: call.arguments.attendees.map((email) => ({ email })) }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(await readGoogleError(response));
    const event = await response.json() as { id?: string; htmlLink?: string };
    return { summary: `Événement « ${call.arguments.title} » créé`, externalId: event.id, url: event.htmlLink, details: `${call.arguments.startAt} → ${call.arguments.endAt}` };
  }
  const boundary = `astra_${randomUUID().replaceAll("-", "")}`;
  const multipartBody = [`--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify({ name: call.arguments.name, mimeType: call.arguments.mimeType }), `--${boundary}`, `Content-Type: ${call.arguments.mimeType}; charset=UTF-8`, "", call.arguments.content, `--${boundary}--`, ""].join("\r\n");
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipartBody, cache: "no-store", signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(await readGoogleError(response));
  const file = await response.json() as { id?: string; name?: string; webViewLink?: string };
  return { summary: `Fichier « ${file.name ?? call.arguments.name} » créé dans Drive`, externalId: file.id, url: file.webViewLink, details: call.arguments.mimeType };
}
