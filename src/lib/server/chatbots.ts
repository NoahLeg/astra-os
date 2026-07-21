import "server-only";

import { randomUUID } from "node:crypto";
import { getAIUsageEventsByIds } from "@/lib/server/ai-usage";
import { getLocalDatabase, getWorkspaceIdForUser, isSupabaseDatabaseEnabled, serverDatabaseRequest } from "@/lib/server/database";
import type { Chatbot, ChatbotConversation, ChatbotKnowledge, ChatbotMessage } from "@/types";

interface ChatbotRow {
  id: string; workspace_id?: string; name: string; slug: string; description: string; provider: "openai"; model: string;
  system_prompt: string; memory_enabled: boolean | number; is_system: boolean | number; status: "active" | "paused"; created_at: string; updated_at: string;
}

interface KnowledgeRow {
  id: string; chatbot_id: string; title: string; content: string; source: string; blocked: boolean | number; created_at: string; updated_at: string;
}

interface ConversationRow {
  id: string; chatbot_id: string; title: string; last_message_at: string; created_at: string; updated_at: string;
}

interface MessageRow {
  id: string; conversation_id: string; usage_event_id?: string; role: "system" | "user" | "assistant"; content: string;
  status: "pending" | "completed" | "failed"; error_message?: string; created_at: string;
}

function ensureLocalChatbotSchema() {
  getLocalDatabase().exec(`
    CREATE TABLE IF NOT EXISTS chatbots (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT NOT NULL,
      provider TEXT NOT NULL, model TEXT NOT NULL, system_prompt TEXT NOT NULL, memory_enabled INTEGER NOT NULL,
      is_system INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chatbot_knowledge (
      id TEXT PRIMARY KEY, chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE, title TEXT NOT NULL,
      content TEXT NOT NULL, source TEXT NOT NULL, blocked INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chatbot_conversations (
      id TEXT PRIMARY KEY, chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE, user_id TEXT,
      title TEXT NOT NULL, last_message_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chatbot_messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
      usage_event_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL,
      error_message TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chatbot_knowledge_chatbot_idx ON chatbot_knowledge(chatbot_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS chatbot_conversations_chatbot_idx ON chatbot_conversations(chatbot_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS chatbot_messages_conversation_idx ON chatbot_messages(conversation_id, created_at ASC);
  `);
}

function toChatbot(row: ChatbotRow): Chatbot {
  return { id: row.id, name: row.name, slug: row.slug, description: row.description, provider: row.provider, model: row.model, systemPrompt: row.system_prompt, memoryEnabled: Boolean(row.memory_enabled), isSystem: Boolean(row.is_system), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toKnowledge(row: KnowledgeRow): ChatbotKnowledge {
  return { id: row.id, chatbotId: row.chatbot_id, title: row.title, content: row.content, source: row.source, blocked: Boolean(row.blocked), createdAt: row.created_at, updatedAt: row.updated_at };
}

function toConversation(row: ConversationRow): ChatbotConversation {
  return { id: row.id, chatbotId: row.chatbot_id, title: row.title, lastMessageAt: row.last_message_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toMessage(row: MessageRow, usage?: ChatbotMessage["usage"]): ChatbotMessage {
  return { id: row.id, conversationId: row.conversation_id, role: row.role, content: row.content, status: row.status, errorMessage: row.error_message, usageEventId: row.usage_event_id, usage, createdAt: row.created_at };
}

async function toMessages(userId: string, rows: MessageRow[]) {
  const usageEvents = await getAIUsageEventsByIds(userId, rows.flatMap((row) => row.usage_event_id ? [row.usage_event_id] : []));
  const usageById = new Map(usageEvents.map((usage) => [usage.id, usage]));
  return rows.map((row) => toMessage(row, row.usage_event_id ? usageById.get(row.usage_event_id) : undefined));
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "chatbot";
}

export async function listChatbots(userId: string, includeSystem = false) {
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    if (!workspaceId) throw new Error("Espace de travail introuvable.");
    const rows = await serverDatabaseRequest<ChatbotRow[]>(`chatbots?workspace_id=eq.${encodeURIComponent(workspaceId)}${includeSystem ? "" : "&is_system=eq.false"}&select=id,name,slug,description,provider,model,system_prompt,memory_enabled,is_system,status,created_at,updated_at&order=updated_at.desc`);
    return rows.map(toChatbot);
  }
  ensureLocalChatbotSchema();
  const rows = getLocalDatabase().prepare(`SELECT * FROM chatbots ${includeSystem ? "" : "WHERE is_system = 0"} ORDER BY updated_at DESC`).all() as unknown as ChatbotRow[];
  return rows.map(toChatbot);
}

export async function getChatbot(userId: string, chatbotId: string) {
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    if (!workspaceId) return undefined;
    const rows = await serverDatabaseRequest<ChatbotRow[]>(`chatbots?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(chatbotId)}&select=id,name,slug,description,provider,model,system_prompt,memory_enabled,is_system,status,created_at,updated_at&limit=1`);
    return rows[0] ? toChatbot(rows[0]) : undefined;
  }
  ensureLocalChatbotSchema();
  const row = getLocalDatabase().prepare("SELECT * FROM chatbots WHERE id = ?").get(chatbotId) as unknown as ChatbotRow | undefined;
  return row ? toChatbot(row) : undefined;
}

export async function createChatbot(userId: string, input: { name: string; description: string; model: string; systemPrompt: string; memoryEnabled: boolean; isSystem?: boolean; slug?: string }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
  const slug = input.isSystem ? baseSlug : `${baseSlug}-${id.slice(0, 6)}`;
  const row: ChatbotRow = { id, name: input.name, slug, description: input.description, provider: "openai", model: input.model, system_prompt: input.systemPrompt, memory_enabled: input.memoryEnabled, is_system: Boolean(input.isSystem), status: "active", created_at: now, updated_at: now };
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    if (!workspaceId) throw new Error("Espace de travail introuvable.");
    const rows = await serverDatabaseRequest<ChatbotRow[]>("chatbots", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...row, workspace_id: workspaceId, created_by: userId }) });
    if (!rows[0]) throw new Error("Le chatbot n'a pas pu être créé.");
    return toChatbot(rows[0]);
  }
  ensureLocalChatbotSchema();
  getLocalDatabase().prepare("INSERT INTO chatbots (id,name,slug,description,provider,model,system_prompt,memory_enabled,is_system,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, row.name, row.slug, row.description, row.provider, row.model, row.system_prompt, row.memory_enabled ? 1 : 0, row.is_system ? 1 : 0, row.status, now, now);
  return toChatbot(row);
}

export async function updateChatbot(userId: string, chatbotId: string, changes: Partial<Pick<Chatbot, "name" | "description" | "model" | "systemPrompt" | "memoryEnabled" | "status">>) {
  const chatbot = await getChatbot(userId, chatbotId);
  if (!chatbot) throw new Error("Chatbot introuvable.");
  const payload = { ...(changes.name !== undefined ? { name: changes.name } : {}), ...(changes.description !== undefined ? { description: changes.description } : {}), ...(changes.model !== undefined ? { model: changes.model } : {}), ...(changes.systemPrompt !== undefined ? { system_prompt: changes.systemPrompt } : {}), ...(changes.memoryEnabled !== undefined ? { memory_enabled: changes.memoryEnabled } : {}), ...(changes.status !== undefined ? { status: changes.status } : {}), updated_at: new Date().toISOString() };
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    const rows = await serverDatabaseRequest<ChatbotRow[]>(`chatbots?workspace_id=eq.${encodeURIComponent(workspaceId!)}&id=eq.${encodeURIComponent(chatbotId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
    if (!rows[0]) throw new Error("Le chatbot n'a pas pu être modifié.");
    return toChatbot(rows[0]);
  }
  ensureLocalChatbotSchema();
  const updated = { ...chatbot, ...changes, updatedAt: payload.updated_at };
  getLocalDatabase().prepare("UPDATE chatbots SET name=?,description=?,model=?,system_prompt=?,memory_enabled=?,status=?,updated_at=? WHERE id=?").run(updated.name, updated.description, updated.model, updated.systemPrompt, updated.memoryEnabled ? 1 : 0, updated.status, updated.updatedAt, chatbotId);
  return updated;
}

export async function deleteChatbot(userId: string, chatbotId: string) {
  const chatbot = await getChatbot(userId, chatbotId);
  if (!chatbot) return false;
  if (chatbot.isSystem) throw new Error("Le Coordinateur système ne peut pas être supprimé.");
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    await serverDatabaseRequest(`chatbots?workspace_id=eq.${encodeURIComponent(workspaceId!)}&id=eq.${encodeURIComponent(chatbotId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return true;
  }
  ensureLocalChatbotSchema();
  return getLocalDatabase().prepare("DELETE FROM chatbots WHERE id = ?").run(chatbotId).changes > 0;
}

export async function ensureCoordinatorChatbot(userId: string) {
  const chatbots = await listChatbots(userId, true);
  const existing = chatbots.find((chatbot) => chatbot.slug === "astra-coordinateur");
  return existing ?? createChatbot(userId, { name: "Coordinateur Astra", slug: "astra-coordinateur", description: "Assistant central de l’espace de travail", model: process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini", systemPrompt: "Tu es Astra, le coordinateur IA de l’entreprise.", memoryEnabled: true, isSystem: true });
}

export async function listChatbotKnowledge(userId: string, chatbotId: string) {
  const chatbot = await getChatbot(userId, chatbotId);
  if (!chatbot) throw new Error("Chatbot introuvable.");
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    const rows = await serverDatabaseRequest<KnowledgeRow[]>(`chatbot_knowledge?workspace_id=eq.${encodeURIComponent(workspaceId!)}&chatbot_id=eq.${encodeURIComponent(chatbotId)}&select=id,chatbot_id,title,content,source,blocked,created_at,updated_at&order=updated_at.desc`);
    return rows.map(toKnowledge);
  }
  ensureLocalChatbotSchema();
  return (getLocalDatabase().prepare("SELECT * FROM chatbot_knowledge WHERE chatbot_id = ? ORDER BY updated_at DESC").all(chatbotId) as unknown as KnowledgeRow[]).map(toKnowledge);
}

export async function createChatbotKnowledge(userId: string, chatbotId: string, input: { title: string; content: string; source?: string }) {
  const chatbot = await getChatbot(userId, chatbotId);
  if (!chatbot) throw new Error("Chatbot introuvable.");
  const id = randomUUID(); const now = new Date().toISOString();
  const row: KnowledgeRow = { id, chatbot_id: chatbotId, title: input.title, content: input.content, source: input.source || "Saisie utilisateur", blocked: false, created_at: now, updated_at: now };
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    const rows = await serverDatabaseRequest<KnowledgeRow[]>("chatbot_knowledge", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...row, workspace_id: workspaceId }) });
    if (!rows[0]) throw new Error("La connaissance n'a pas pu être enregistrée.");
    return toKnowledge(rows[0]);
  }
  ensureLocalChatbotSchema();
  getLocalDatabase().prepare("INSERT INTO chatbot_knowledge (id,chatbot_id,title,content,source,blocked,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, chatbotId, row.title, row.content, row.source, 0, now, now);
  return toKnowledge(row);
}

export async function updateChatbotKnowledge(userId: string, chatbotId: string, knowledgeId: string, changes: Partial<Pick<ChatbotKnowledge, "title" | "content" | "source" | "blocked">>) {
  const items = await listChatbotKnowledge(userId, chatbotId); const current = items.find((item) => item.id === knowledgeId);
  if (!current) throw new Error("Connaissance introuvable.");
  const updated = { ...current, ...changes, updatedAt: new Date().toISOString() };
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    await serverDatabaseRequest(`chatbot_knowledge?workspace_id=eq.${encodeURIComponent(workspaceId!)}&chatbot_id=eq.${encodeURIComponent(chatbotId)}&id=eq.${encodeURIComponent(knowledgeId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ title: updated.title, content: updated.content, source: updated.source, blocked: updated.blocked, updated_at: updated.updatedAt }) });
  } else {
    ensureLocalChatbotSchema(); getLocalDatabase().prepare("UPDATE chatbot_knowledge SET title=?,content=?,source=?,blocked=?,updated_at=? WHERE id=? AND chatbot_id=?").run(updated.title, updated.content, updated.source, updated.blocked ? 1 : 0, updated.updatedAt, knowledgeId, chatbotId);
  }
  return updated;
}

export async function deleteChatbotKnowledge(userId: string, chatbotId: string, knowledgeId: string) {
  const chatbot = await getChatbot(userId, chatbotId); if (!chatbot) throw new Error("Chatbot introuvable.");
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    await serverDatabaseRequest(`chatbot_knowledge?workspace_id=eq.${encodeURIComponent(workspaceId!)}&chatbot_id=eq.${encodeURIComponent(chatbotId)}&id=eq.${encodeURIComponent(knowledgeId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); return true;
  }
  ensureLocalChatbotSchema(); return getLocalDatabase().prepare("DELETE FROM chatbot_knowledge WHERE id = ? AND chatbot_id = ?").run(knowledgeId, chatbotId).changes > 0;
}

export async function listConversations(userId: string, chatbotId: string) {
  const chatbot = await getChatbot(userId, chatbotId); if (!chatbot) throw new Error("Chatbot introuvable.");
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    const rows = await serverDatabaseRequest<ConversationRow[]>(`chatbot_conversations?workspace_id=eq.${encodeURIComponent(workspaceId!)}&chatbot_id=eq.${encodeURIComponent(chatbotId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,chatbot_id,title,last_message_at,created_at,updated_at&order=last_message_at.desc`);
    return rows.map(toConversation);
  }
  ensureLocalChatbotSchema(); return (getLocalDatabase().prepare("SELECT * FROM chatbot_conversations WHERE chatbot_id = ? AND user_id = ? ORDER BY last_message_at DESC").all(chatbotId, userId) as unknown as ConversationRow[]).map(toConversation);
}

export async function createConversation(userId: string, chatbotId: string, title = "Nouvelle conversation") {
  const chatbot = await getChatbot(userId, chatbotId); if (!chatbot) throw new Error("Chatbot introuvable.");
  const id = randomUUID(); const now = new Date().toISOString();
  const row: ConversationRow = { id, chatbot_id: chatbotId, title, last_message_at: now, created_at: now, updated_at: now };
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    const rows = await serverDatabaseRequest<ConversationRow[]>("chatbot_conversations", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...row, workspace_id: workspaceId, user_id: userId }) });
    if (!rows[0]) throw new Error("La conversation n'a pas pu être créée."); return toConversation(rows[0]);
  }
  ensureLocalChatbotSchema(); getLocalDatabase().prepare("INSERT INTO chatbot_conversations (id,chatbot_id,user_id,title,last_message_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(id, chatbotId, userId, title, now, now, now); return toConversation(row);
}

export async function getConversationMessages(userId: string, chatbotId: string, conversationId: string) {
  const conversations = await listConversations(userId, chatbotId); if (!conversations.some((item) => item.id === conversationId)) throw new Error("Conversation introuvable.");
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    const rows = await serverDatabaseRequest<MessageRow[]>(`chatbot_messages?workspace_id=eq.${encodeURIComponent(workspaceId!)}&conversation_id=eq.${encodeURIComponent(conversationId)}&select=id,conversation_id,usage_event_id,role,content,status,error_message,created_at&order=created_at.asc`);
    return toMessages(userId, rows);
  }
  ensureLocalChatbotSchema(); return toMessages(userId, getLocalDatabase().prepare("SELECT * FROM chatbot_messages WHERE conversation_id = ? ORDER BY created_at ASC").all(conversationId) as unknown as MessageRow[]);
}

export async function createChatbotMessage(userId: string, conversationId: string, input: { id?: string; role: ChatbotMessage["role"]; content: string; status?: ChatbotMessage["status"] }) {
  const id = input.id ?? randomUUID(); const now = new Date().toISOString();
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId); if (!workspaceId) throw new Error("Espace de travail introuvable.");
    const rows = await serverDatabaseRequest<MessageRow[]>("chatbot_messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id, workspace_id: workspaceId, conversation_id: conversationId, role: input.role, content: input.content, status: input.status ?? "completed", created_at: now }) });
    if (!rows[0]) throw new Error("Le message n'a pas pu être enregistré."); return toMessage(rows[0]);
  }
  ensureLocalChatbotSchema(); getLocalDatabase().prepare("INSERT INTO chatbot_messages (id,conversation_id,role,content,status,created_at) VALUES (?,?,?,?,?,?)").run(id, conversationId, input.role, input.content, input.status ?? "completed", now); return { id, conversationId, role: input.role, content: input.content, status: input.status ?? "completed", createdAt: now };
}

export async function updateChatbotMessage(userId: string, messageId: string, changes: { content?: string; status?: ChatbotMessage["status"]; errorMessage?: string | null; usageEventId?: string }) {
  const payload = { ...(changes.content !== undefined ? { content: changes.content } : {}), ...(changes.status !== undefined ? { status: changes.status } : {}), ...(changes.errorMessage !== undefined ? { error_message: changes.errorMessage } : {}), ...(changes.usageEventId !== undefined ? { usage_event_id: changes.usageEventId } : {}) };
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId); const rows = await serverDatabaseRequest<MessageRow[]>(`chatbot_messages?workspace_id=eq.${encodeURIComponent(workspaceId!)}&id=eq.${encodeURIComponent(messageId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
    if (!rows[0]) throw new Error("Le message n'a pas pu être mis à jour."); return toMessage(rows[0]);
  }
  ensureLocalChatbotSchema();
  const current = getLocalDatabase().prepare("SELECT * FROM chatbot_messages WHERE id = ?").get(messageId) as unknown as MessageRow | undefined; if (!current) throw new Error("Message introuvable.");
  const updated = { ...current, content: changes.content ?? current.content, status: changes.status ?? current.status, error_message: changes.errorMessage === undefined ? current.error_message : changes.errorMessage ?? undefined, usage_event_id: changes.usageEventId ?? current.usage_event_id };
  getLocalDatabase().prepare("UPDATE chatbot_messages SET content=?,status=?,error_message=?,usage_event_id=? WHERE id=?").run(updated.content, updated.status, updated.error_message ?? null, updated.usage_event_id ?? null, messageId); return toMessage(updated);
}

export async function touchConversation(userId: string, conversationId: string, title?: string) {
  const now = new Date().toISOString();
  if (isSupabaseDatabaseEnabled()) {
    const workspaceId = await getWorkspaceIdForUser(userId); await serverDatabaseRequest(`chatbot_conversations?workspace_id=eq.${encodeURIComponent(workspaceId!)}&id=eq.${encodeURIComponent(conversationId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_message_at: now, updated_at: now, ...(title ? { title } : {}) }) }); return;
  }
  ensureLocalChatbotSchema(); if (title) getLocalDatabase().prepare("UPDATE chatbot_conversations SET title=?,last_message_at=?,updated_at=? WHERE id=?").run(title, now, now, conversationId); else getLocalDatabase().prepare("UPDATE chatbot_conversations SET last_message_at=?,updated_at=? WHERE id=?").run(now, now, conversationId);
}

function normalizeTerms(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? []; }

export function buildKnowledgeContext(items: ChatbotKnowledge[], query: string, maximumItems = 12) {
  const terms = new Set(normalizeTerms(query));
  return items.filter((item) => !item.blocked).map((item) => {
    const text = new Set(normalizeTerms(`${item.title} ${item.content}`));
    return { item, score: [...terms].filter((term) => text.has(term)).length * 20 + (new Date(item.updatedAt).getTime() / 1e13) };
  }).sort((left, right) => right.score - left.score).slice(0, maximumItems).map(({ item }) => `- [${item.source}] ${item.title}: ${item.content}`).join("\n").slice(0, 16_000) || "Aucune connaissance personnelle pertinente.";
}
