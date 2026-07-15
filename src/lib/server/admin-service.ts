import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AccessLevel, AccountStatus } from "@/types";

export interface AdminAccount {
  id: string;
  email: string;
  fullName: string;
  role: string;
  accessLevel: AccessLevel;
  status: AccountStatus;
  createdAt: string;
  lastSignInAt?: string;
  emailConfirmed: boolean;
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

export interface AdminAuditLog {
  id: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
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

async function authAdminRequest<T>(pathName: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseUrl || !supabaseSecretKey) throw new Error("Supabase Auth Admin n’est pas configuré");
  const response = await fetch(`${supabaseUrl}/auth/v1/${pathName}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: supabaseSecretKey,
      Authorization: `Bearer ${supabaseSecretKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string; msg?: string; error_description?: string };
    throw new Error(payload.message ?? payload.msg ?? payload.error_description ?? `Supabase Auth ${response.status}`);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
  return response.json() as Promise<T>;
}

function normalizeAccessLevel(value?: string, role?: string): AccessLevel {
  if (value === "viewer" || value === "operator" || value === "admin") return value;
  if (role === "owner" || role === "admin") return "admin";
  if (role === "member") return "operator";
  return "viewer";
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
  const [workspaces, memberships, profiles, authUsers] = await Promise.all([
    adminRequest<Array<{ id: string; name: string; slug: string; created_at: string }>>("workspaces?select=id,name,slug,created_at&order=created_at.desc"),
    adminRequest<Array<{ workspace_id: string; user_id: string; role: string; access_level?: string; status?: string }>>("workspace_members?select=workspace_id,user_id,role,access_level,status"),
    adminRequest<Array<{ id: string; email: string; full_name: string; created_at: string }>>("profiles?select=id,email,full_name,created_at"),
    authAdminRequest<{ users?: Array<{ id: string; last_sign_in_at?: string; email_confirmed_at?: string }> }>("admin/users?page=1&per_page=1000").catch(() => ({ users: [] })),
  ]);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const authUsersById = new Map((authUsers.users ?? []).map((user) => [user.id, user]));
  return workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    createdAt: workspace.created_at,
    accounts: memberships.filter((membership) => membership.workspace_id === workspace.id).flatMap((membership) => {
      const profile = profilesById.get(membership.user_id);
      const authUser = authUsersById.get(membership.user_id);
      return profile ? [{ id: profile.id, email: profile.email, fullName: profile.full_name || profile.email.split("@")[0], role: membership.role, accessLevel: normalizeAccessLevel(membership.access_level, membership.role), status: membership.status === "suspended" ? "suspended" : "active", createdAt: profile.created_at, lastSignInAt: authUser?.last_sign_in_at, emailConfirmed: Boolean(authUser?.email_confirmed_at) }] : [];
    }),
  }));
}

export async function listWorkspaceAuditLogs(workspaceId: string): Promise<AdminAuditLog[]> {
  const rows = await adminRequest<Array<{ id: string; action: string; target_type: string; target_id?: string; metadata?: Record<string, unknown>; created_at: string }>>(
    `audit_logs?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id,action,target_type,target_id,metadata,created_at&order=created_at.desc&limit=100`,
  );
  return rows.map((row) => ({ id: row.id, action: row.action, targetType: row.target_type, targetId: row.target_id, metadata: row.metadata ?? {}, createdAt: row.created_at }));
}

export async function inviteWorkspaceMember(input: { workspaceId: string; email: string; fullName: string; accessLevel: AccessLevel; redirectTo: string; actorUserId: string }) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existingProfiles = await adminRequest<Array<{ id: string }>>(`profiles?email=eq.${encodeURIComponent(normalizedEmail)}&select=id&limit=1`);
  let userId: string | undefined = existingProfiles[0]?.id;
  if (!userId) {
    const response = await authAdminRequest<{ id?: string; user?: { id?: string } }>("invite", {
      method: "POST",
      body: JSON.stringify({ email: normalizedEmail, data: { full_name: input.fullName }, redirect_to: input.redirectTo }),
    });
    userId = response.user?.id ?? response.id;
  }
  if (!userId) throw new Error("Supabase n’a pas renvoyé le compte invité.");
  const existingMemberships = await adminRequest<Array<{ workspace_id: string }>>(`workspace_members?user_id=eq.${encodeURIComponent(userId)}&select=workspace_id`);
  if (existingMemberships.some((membership) => membership.workspace_id !== input.workspaceId)) {
    throw new Error("Ce compte appartient déjà à une autre entreprise. Utilisez une adresse dédiée ou ajoutez d’abord un sélecteur d’espace.");
  }
  await adminRequest("profiles?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: userId, email: normalizedEmail, full_name: input.fullName, updated_at: new Date().toISOString() }) });
  const role = input.accessLevel === "admin" ? "admin" : input.accessLevel === "operator" ? "member" : "viewer";
  await adminRequest("workspace_members?on_conflict=workspace_id,user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ workspace_id: input.workspaceId, user_id: userId, role, access_level: input.accessLevel, status: "active", invited_by: input.actorUserId, updated_at: new Date().toISOString() }) });
  await writeAuditLog({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "workspace_member.invited", targetType: "account", targetId: userId, metadata: { email: normalizedEmail, accessLevel: input.accessLevel } });
  return userId;
}

export async function updateWorkspaceMember(input: { workspaceId: string; userId: string; accessLevel?: AccessLevel; status?: AccountStatus; actorUserId: string }) {
  const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.accessLevel) {
    changes.access_level = input.accessLevel;
    changes.role = input.accessLevel === "admin" ? "admin" : input.accessLevel === "operator" ? "member" : "viewer";
  }
  if (input.status) changes.status = input.status;
  await adminRequest(`workspace_members?workspace_id=eq.${encodeURIComponent(input.workspaceId)}&user_id=eq.${encodeURIComponent(input.userId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(changes) });
  await writeAuditLog({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "workspace_member.updated", targetType: "account", targetId: input.userId, metadata: { accessLevel: input.accessLevel, status: input.status } });
}

export async function deleteManagedAccount(input: { workspaceId: string; userId: string; actorUserId: string }) {
  if (input.userId === input.actorUserId) throw new Error("Vous ne pouvez pas supprimer votre propre compte Super Admin.");
  await writeAuditLog({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "account.deleted", targetType: "account", targetId: input.userId });
  await authAdminRequest(`admin/users/${encodeURIComponent(input.userId)}`, { method: "DELETE" });
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
