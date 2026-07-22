import "server-only";

import { randomUUID } from "node:crypto";
import { getLocalDatabase, getWorkspaceIdForUser, isSupabaseDatabaseEnabled, serverDatabaseRequest } from "@/lib/server/database";
import type { ContextFile } from "@/types";

const BUCKET = "context-files";
export const MAX_CONTEXT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_MODEL_CONTEXT_BYTES = 8 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/markdown", "application/json", "text/html", "text/xml", "application/xml", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/rtf", "text/rtf", "application/vnd.oasis.opendocument.text",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf",
  txt: "text/plain", md: "text/markdown", json: "application/json", html: "text/html", xml: "application/xml", csv: "text/csv",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", rtf: "application/rtf", odt: "application/vnd.oasis.opendocument.text",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

interface ContextFileRow {
  id: string;
  chatbot_id?: string;
  scope: "workspace" | "chatbot";
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  status: "active" | "blocked";
  created_at: string;
}

function ensureLocalSchema() {
  getLocalDatabase().exec(`
    CREATE TABLE IF NOT EXISTS context_files (
      id TEXT PRIMARY KEY,
      chatbot_id TEXT,
      scope TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      content BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS context_files_chatbot_created_idx ON context_files(chatbot_id, created_at DESC);
  `);
}

function toContextFile(row: ContextFileRow): ContextFile {
  return {
    id: row.id,
    chatbotId: row.chatbot_id,
    scope: row.scope,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    createdAt: row.created_at,
  };
}

function sanitizeName(name: string) {
  const sanitized = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120);
  return sanitized || "document";
}

export function resolveContextFileMimeType(name: string, browserMimeType: string) {
  const normalized = browserMimeType.trim().toLowerCase().split(";")[0];
  if (allowedMimeTypes.has(normalized)) return normalized;
  const extension = name.toLowerCase().split(".").pop() ?? "";
  return mimeByExtension[extension];
}

export function validateContextFile(name: string, mimeType: string | undefined, size: number) {
  if (!name.trim() || name.length > 255) throw new Error("Nom de fichier invalide.");
  if (!mimeType || !allowedMimeTypes.has(mimeType)) throw new Error("Format non pris en charge. Utilisez une image, un PDF, un document, une présentation, un tableur ou un fichier texte.");
  if (size <= 0 || size > MAX_CONTEXT_FILE_BYTES) throw new Error("Le fichier doit peser moins de 4 Mo.");
}

function storageHeaders(contentType?: string) {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Clé serveur Supabase manquante.");
  return {
    apikey: key,
    ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

function storageUrl(path: string) {
  const baseUrl = process.env.SUPABASE_URL;
  if (!baseUrl) throw new Error("URL Supabase manquante.");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${encodedPath}`;
}

async function storageRequest(path: string, init: RequestInit) {
  const response = await fetch(storageUrl(path), { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Supabase Storage ${response.status}: ${await response.text()}`);
  return response;
}

async function listContextFileRows(userId: string, chatbotId: string) {
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    if (!workspaceId) throw new Error("Espace de travail introuvable.");
    const rows = await serverDatabaseRequest<ContextFileRow[]>(`context_files?workspace_id=eq.${encodeURIComponent(workspaceId)}&or=(scope.eq.workspace,chatbot_id.eq.${encodeURIComponent(chatbotId)})&select=id,chatbot_id,scope,name,mime_type,size_bytes,storage_path,status,created_at&order=created_at.desc`);
    return rows;
  }
  ensureLocalSchema();
  const rows = getLocalDatabase().prepare("SELECT id,chatbot_id,scope,name,mime_type,size_bytes,storage_path,status,created_at FROM context_files WHERE scope='workspace' OR chatbot_id=? ORDER BY created_at DESC").all(chatbotId) as unknown as ContextFileRow[];
  return rows;
}

export async function listContextFiles(userId: string, chatbotId: string) {
  return (await listContextFileRows(userId, chatbotId)).map(toContextFile);
}

export async function createContextFile(userId: string, chatbotId: string, input: { name: string; mimeType: string; bytes: Uint8Array; scope: "workspace" | "chatbot" }) {
  validateContextFile(input.name, input.mimeType, input.bytes.byteLength);
  const id = randomUUID();
  const now = new Date().toISOString();
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) throw new Error("Espace de travail introuvable.");
  const { getWorkspaceSubscriptionByWorkspaceId } = await import("@/lib/server/billing");
  const subscription = await getWorkspaceSubscriptionByWorkspaceId(workspaceId);
  const storageLimitBytes = subscription.storageLimitMb * 1024 * 1024;
  if (isSupabaseDatabaseEnabled()) {
    const rows = await serverDatabaseRequest<Array<{ size_bytes: number | string }>>(
      `context_files?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=size_bytes`,
    );
    const usedBytes = rows.reduce((total, row) => total + Number(row.size_bytes || 0), 0);
    if (usedBytes + input.bytes.byteLength > storageLimitBytes) {
      throw new Error(`La limite de stockage de votre offre (${subscription.storageLimitMb} Mo) serait dépassée.`);
    }
  } else {
    ensureLocalSchema();
    const row = getLocalDatabase().prepare("SELECT COALESCE(SUM(size_bytes), 0) AS total FROM context_files").get() as { total: number };
    if (Number(row.total) + input.bytes.byteLength > storageLimitBytes) {
      throw new Error(`La limite de stockage de votre offre (${subscription.storageLimitMb} Mo) serait dépassée.`);
    }
  }
  const target = input.scope === "workspace" ? "shared" : chatbotId;
  const storagePath = `${workspaceId}/${target}/${id}-${sanitizeName(input.name)}`;
  const row: ContextFileRow = { id, chatbot_id: input.scope === "chatbot" ? chatbotId : undefined, scope: input.scope, name: input.name, mime_type: input.mimeType, size_bytes: input.bytes.byteLength, storage_path: storagePath, status: "active", created_at: now };

  if (isSupabaseDatabaseEnabled()) {
    await storageRequest(storagePath, { method: "POST", headers: { ...storageHeaders(input.mimeType), "x-upsert": "false" }, body: Buffer.from(input.bytes) });
    try {
      const rows = await serverDatabaseRequest<ContextFileRow[]>("context_files", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...row, workspace_id: workspaceId, created_by: userId, updated_at: now }) });
      if (!rows[0]) throw new Error("Le fichier n'a pas pu être référencé.");
      return toContextFile(rows[0]);
    } catch (error) {
      await storageRequest(storagePath, { method: "DELETE", headers: storageHeaders() }).catch(() => undefined);
      throw error;
    }
  }

  ensureLocalSchema();
  getLocalDatabase().prepare("INSERT INTO context_files (id,chatbot_id,scope,name,mime_type,size_bytes,storage_path,status,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id, row.chatbot_id ?? null, row.scope, row.name, row.mime_type, row.size_bytes, storagePath, row.status, Buffer.from(input.bytes), now, now);
  return toContextFile(row);
}

export async function deleteContextFile(userId: string, chatbotId: string, fileId: string) {
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    if (!workspaceId) throw new Error("Espace de travail introuvable.");
    const rows = await serverDatabaseRequest<ContextFileRow[]>(`context_files?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(fileId)}&or=(scope.eq.workspace,chatbot_id.eq.${encodeURIComponent(chatbotId)})&select=id,storage_path&limit=1`);
    if (!rows[0]) return false;
    await storageRequest(rows[0].storage_path, { method: "DELETE", headers: storageHeaders() });
    await serverDatabaseRequest(`context_files?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(fileId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return true;
  }
  ensureLocalSchema();
  return getLocalDatabase().prepare("DELETE FROM context_files WHERE id=? AND (scope='workspace' OR chatbot_id=?)").run(fileId, chatbotId).changes > 0;
}

async function readContextFile(row: ContextFileRow) {
  if (isSupabaseDatabaseEnabled()) {
    const response = await storageRequest(row.storage_path, { method: "GET", headers: storageHeaders() });
    return Buffer.from(await response.arrayBuffer());
  }
  ensureLocalSchema();
  const stored = getLocalDatabase().prepare("SELECT content FROM context_files WHERE id=?").get(row.id) as { content: Uint8Array } | undefined;
  if (!stored) throw new Error("Fichier de contexte introuvable.");
  return Buffer.from(stored.content);
}

function terms(value: string) {
  return new Set(value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

export async function loadContextFilesForModel(userId: string, chatbotId: string, query: string) {
  const files = await listContextFileRows(userId, chatbotId);
  const { getWorkspaceSubscription } = await import("@/lib/server/billing");
  const subscription = await getWorkspaceSubscription(userId);
  const contextBudgetBytes = Math.max(1, Math.floor(subscription.contextLimitTokens * 4 / 0.75));
  const maximumContextBytes = Math.min(MAX_MODEL_CONTEXT_BYTES, contextBudgetBytes);
  const queryTerms = terms(query);
  const ranked = files.filter((file) => file.status === "active").map((file) => ({
    file,
    score: [...terms(file.name)].filter((term) => queryTerms.has(term)).length * 20 + (file.scope === "chatbot" ? 3 : 0) + new Date(file.created_at).getTime() / 1e13,
  })).sort((left, right) => right.score - left.score);
  const selected: ContextFileRow[] = [];
  let totalBytes = 0;
  for (const { file } of ranked) {
    if (selected.length >= 3 || totalBytes + Number(file.size_bytes) > maximumContextBytes) continue;
    selected.push(file);
    totalBytes += Number(file.size_bytes);
  }
  return Promise.all(selected.map(async (file) => ({
    name: file.name,
    mimeType: file.mime_type,
    dataBase64: (await readContextFile(file)).toString("base64"),
  })));
}
