import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { activities, agents, approvals, automations, connections, goals, memoryItems, projects } from "@/mocks/data";
import type { WorkspaceData } from "@/types";

type Collection = keyof WorkspaceData;
type WorkspaceRecord = WorkspaceData[Collection][number];
type StoredRow = { workspace_id?: string; collection: Collection; payload: WorkspaceRecord };

const seedData: WorkspaceData = {
  goals,
  projects,
  agents,
  memories: memoryItems,
  automations,
  approvals,
  connections,
  activities,
};

const tenantSeedData: WorkspaceData = {
  goals: [],
  projects: [],
  agents: agents.map((agent) => ({ ...agent, status: "paused", enabled: false, tasksCompleted: 0, successRate: 0, estimatedCost: 0, lastActivity: "Jamais" })),
  memories: [],
  automations: [],
  approvals: [],
  connections: connections.map((connection) => ({ ...connection, status: "disconnected" })),
  activities: [],
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseSecretKey);

function emptyWorkspace(): WorkspaceData {
  return { goals: [], projects: [], agents: [], memories: [], automations: [], approvals: [], connections: [], activities: [] };
}

function flattenSeedData(workspaceId?: string, data: WorkspaceData = seedData) {
  return (Object.entries(data) as [Collection, WorkspaceRecord[]][]).flatMap(([collection, records]) => records.map((record) => ({
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    collection,
    id: record.id,
    payload: record,
  })));
}

function fromRows(rows: StoredRow[]): WorkspaceData {
  const data = emptyWorkspace();
  for (const row of rows) (data[row.collection] as WorkspaceRecord[]).push(row.payload);
  return data;
}

async function supabaseRequest<T>(pathName: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseUrl || !supabaseSecretKey) throw new Error("Configuration Supabase incomplète");
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
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
  return response.json() as Promise<T>;
}

async function seedSupabase(workspaceId: string) {
  await supabaseRequest("workspace_records?on_conflict=workspace_id,collection,id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(flattenSeedData(workspaceId, tenantSeedData)),
  });
}

let localDatabase: DatabaseSync | undefined;

function getLocalDatabase() {
  if (process.env.VERCEL) throw new Error("Supabase doit être configuré sur Vercel : le système de fichiers serverless n’est pas une base persistante.");
  if (localDatabase) return localDatabase;
  const databasePath = process.env.ASTRA_DB_PATH ?? path.join(process.cwd(), "data", "astra-os.sqlite");
  mkdirSync(path.dirname(databasePath), { recursive: true });
  localDatabase = new DatabaseSync(databasePath);
  localDatabase.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workspace_records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (collection, id)
    );
  `);
  const count = localDatabase.prepare("SELECT COUNT(*) AS count FROM workspace_records").get() as { count: number };
  if (count.count === 0) {
    const insert = localDatabase.prepare("INSERT INTO workspace_records (collection, id, payload) VALUES (?, ?, ?)");
    localDatabase.exec("BEGIN");
    try {
      for (const record of flattenSeedData()) insert.run(record.collection, record.id, JSON.stringify(record.payload));
      localDatabase.exec("COMMIT");
    } catch (error) {
      localDatabase.exec("ROLLBACK");
      throw error;
    }
  }
  return localDatabase;
}

export async function getWorkspaceIdForUser(userId: string) {
  const memberships = await supabaseRequest<Array<{ workspace_id: string }>>(`workspace_members?user_id=eq.${encodeURIComponent(userId)}&select=workspace_id&limit=1`);
  return memberships[0]?.workspace_id;
}

export async function createTenantForUser(user: { id: string; email: string; fullName: string; companyName: string }) {
  if (!useSupabase) return "local";
  const slug = `${user.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${user.id.slice(0, 6)}`;
  const workspaceId = await supabaseRequest<string>("rpc/create_company_workspace", {
    method: "POST",
    body: JSON.stringify({ p_user_id: user.id, p_email: user.email, p_full_name: user.fullName, p_company_name: user.companyName, p_slug: slug }),
  });
  await seedSupabase(workspaceId);
  return workspaceId;
}

export async function getWorkspaceData(userId = "local"): Promise<WorkspaceData> {
  if (useSupabase) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    if (!workspaceId) throw new Error("Aucun espace de travail associé à cet utilisateur");
    let rows = await supabaseRequest<StoredRow[]>(`workspace_records?workspace_id=eq.${workspaceId}&select=workspace_id,collection,payload&order=created_at.asc`);
    if (rows.length === 0) {
      await seedSupabase(workspaceId);
      rows = await supabaseRequest<StoredRow[]>(`workspace_records?workspace_id=eq.${workspaceId}&select=workspace_id,collection,payload&order=created_at.asc`);
    }
    return fromRows(rows);
  }
  const rows = getLocalDatabase().prepare("SELECT collection, payload FROM workspace_records ORDER BY rowid").all() as Array<{ collection: Collection; payload: string }>;
  return fromRows(rows.map((row) => ({ collection: row.collection, payload: JSON.parse(row.payload) as WorkspaceRecord })));
}

export async function saveWorkspaceRecord(collection: Collection, record: WorkspaceRecord, userId = "local") {
  if (useSupabase) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    if (!workspaceId) throw new Error("Espace de travail introuvable");
    await supabaseRequest("workspace_records?on_conflict=workspace_id,collection,id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ workspace_id: workspaceId, collection, id: record.id, payload: record, updated_at: new Date().toISOString() }),
    });
    return;
  }
  getLocalDatabase().prepare(`
    INSERT INTO workspace_records (collection, id, payload, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(collection, id) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
  `).run(collection, record.id, JSON.stringify(record));
}

export async function patchWorkspaceRecord(collection: Collection, id: string, changes: Record<string, unknown>, userId = "local") {
  let current: WorkspaceRecord | undefined;
  if (useSupabase) {
    const workspaceId = await getWorkspaceIdForUser(userId);
    if (!workspaceId) return null;
    const rows = await supabaseRequest<Array<{ payload: WorkspaceRecord }>>(`workspace_records?workspace_id=eq.${workspaceId}&collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}&select=payload&limit=1`);
    current = rows[0]?.payload;
  } else {
    const row = getLocalDatabase().prepare("SELECT payload FROM workspace_records WHERE collection = ? AND id = ?").get(collection, id) as { payload: string } | undefined;
    current = row ? JSON.parse(row.payload) as WorkspaceRecord : undefined;
  }
  if (!current) return null;
  const updated = { ...current, ...changes } as WorkspaceRecord;
  await saveWorkspaceRecord(collection, updated, userId);
  return updated;
}

export async function checkDatabaseHealth() {
  if (useSupabase) {
    await supabaseRequest("workspaces?select=id&limit=1");
    return { provider: "supabase" as const, status: "ready" as const };
  }
  getLocalDatabase().prepare("SELECT 1 AS healthy").get();
  return { provider: "sqlite" as const, status: "ready" as const };
}
