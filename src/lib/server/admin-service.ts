import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface AdminAccount {
  id: string;
  email: string;
  fullName: string;
  role: string;
  createdAt: string;
}

export interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  accounts: AdminAccount[];
}

export interface AdminSecret {
  id: string;
  workspaceId: string;
  provider: string;
  label: string;
  baseUrl?: string;
  maskedValue: string;
  updatedAt: string;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

async function adminRequest<T>(pathName: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseUrl || !supabaseSecretKey) throw new Error("Supabase Admin n’est pas configuré");
  const response = await fetch(`${supabaseUrl}/rest/v1/${pathName}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: supabaseSecretKey,
      ...(supabaseSecretKey.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${supabaseSecretKey}` }),
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Administration Supabase ${response.status}: ${await response.text()}`);
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
  return response.json() as Promise<T>;
}

function getEncryptionKey() {
  const encodedKey = process.env.SECRETS_ENCRYPTION_KEY;
  if (!encodedKey) throw new Error("SECRETS_ENCRYPTION_KEY est manquante");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("SECRETS_ENCRYPTION_KEY doit contenir exactement 32 octets encodés en base64");
  return key;
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { encryptedValue: encrypted.toString("base64"), encryptionIv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), secretHint: value.slice(-4).padStart(8, "•") };
}

function decryptSecret(encryptedValue: string, encryptionIv: string, authTag: string) {
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(encryptionIv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]).toString("utf8");
}

export async function listAdminWorkspaces(): Promise<AdminWorkspace[]> {
  const [workspaces, memberships, profiles] = await Promise.all([
    adminRequest<Array<{ id: string; name: string; slug: string; created_at: string }>>("workspaces?select=id,name,slug,created_at&order=created_at.desc"),
    adminRequest<Array<{ workspace_id: string; user_id: string; role: string }>>("workspace_members?select=workspace_id,user_id,role"),
    adminRequest<Array<{ id: string; email: string; full_name: string; created_at: string }>>("profiles?select=id,email,full_name,created_at"),
  ]);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  return workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    createdAt: workspace.created_at,
    accounts: memberships.filter((membership) => membership.workspace_id === workspace.id).flatMap((membership) => {
      const profile = profilesById.get(membership.user_id);
      return profile ? [{ id: profile.id, email: profile.email, fullName: profile.full_name, role: membership.role, createdAt: profile.created_at }] : [];
    }),
  }));
}

export async function listWorkspaceSecrets(workspaceId: string): Promise<AdminSecret[]> {
  const rows = await adminRequest<Array<{ id: string; workspace_id: string; provider: string; label: string; base_url?: string; secret_hint: string; updated_at: string }>>(`integration_secrets?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id,workspace_id,provider,label,base_url,secret_hint,updated_at&order=updated_at.desc`);
  return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id, provider: row.provider, label: row.label, baseUrl: row.base_url, maskedValue: row.secret_hint, updatedAt: row.updated_at }));
}

export async function saveWorkspaceSecret(input: { workspaceId: string; provider: string; label: string; baseUrl?: string; secret: string; actorUserId: string }) {
  const encrypted = encryptSecret(input.secret);
  const rows = await adminRequest<Array<{ id: string }>>("integration_secrets?on_conflict=workspace_id,provider,label", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ workspace_id: input.workspaceId, provider: input.provider, label: input.label, base_url: input.baseUrl || null, encrypted_value: encrypted.encryptedValue, encryption_iv: encrypted.encryptionIv, auth_tag: encrypted.authTag, secret_hint: encrypted.secretHint, created_by: input.actorUserId, updated_at: new Date().toISOString() }),
  });
  await writeAuditLog({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "integration_secret.saved", targetType: "integration_secret", targetId: rows[0]?.id, metadata: { provider: input.provider, label: input.label, baseUrl: input.baseUrl } });
}

export async function deleteWorkspaceSecret(input: { workspaceId: string; secretId: string; actorUserId: string }) {
  await adminRequest(`integration_secrets?workspace_id=eq.${encodeURIComponent(input.workspaceId)}&id=eq.${encodeURIComponent(input.secretId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await writeAuditLog({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "integration_secret.deleted", targetType: "integration_secret", targetId: input.secretId });
}

export async function getDecryptedIntegrationSecret(input: { workspaceId: string; provider: string; label: string; actorUserId: string }) {
  const rows = await adminRequest<Array<{ id: string; encrypted_value: string; encryption_iv: string; auth_tag: string; base_url?: string }>>(`integration_secrets?workspace_id=eq.${encodeURIComponent(input.workspaceId)}&provider=eq.${encodeURIComponent(input.provider)}&label=eq.${encodeURIComponent(input.label)}&select=id,encrypted_value,encryption_iv,auth_tag,base_url&limit=1`);
  const row = rows[0];
  if (!row) return null;
  await writeAuditLog({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "integration_secret.accessed", targetType: "integration_secret", targetId: row.id, metadata: { provider: input.provider, label: input.label } });
  return { id: row.id, secret: decryptSecret(row.encrypted_value, row.encryption_iv, row.auth_tag), baseUrl: row.base_url };
}

export async function getWorkspaceProviderSecret(input: { workspaceId: string; provider: string; actorUserId: string }) {
  const rows = await adminRequest<Array<{ id: string; provider: string; label: string; encrypted_value: string; encryption_iv: string; auth_tag: string; base_url?: string }>>(`integration_secrets?workspace_id=eq.${encodeURIComponent(input.workspaceId)}&select=id,provider,label,encrypted_value,encryption_iv,auth_tag,base_url&order=updated_at.desc`);
  const expectedProvider = input.provider.trim().toLowerCase();
  const row = rows.find((item) => {
    const descriptor = `${item.provider} ${item.label}`.toLowerCase();
    return descriptor.includes(expectedProvider) || (expectedProvider === "openai" && descriptor.includes("gpt"));
  });
  if (!row) return null;
  await writeAuditLog({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "integration_secret.accessed", targetType: "integration_secret", targetId: row.id, metadata: { provider: row.provider, label: row.label } });
  return { secret: decryptSecret(row.encrypted_value, row.encryption_iv, row.auth_tag), baseUrl: row.base_url };
}

async function writeAuditLog(input: { workspaceId?: string; actorUserId: string; action: string; targetType: string; targetId?: string; metadata?: Record<string, unknown> }) {
  await adminRequest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ workspace_id: input.workspaceId, actor_user_id: input.actorUserId, action: input.action, target_type: input.targetType, target_id: input.targetId, metadata: input.metadata ?? {} }) });
}
