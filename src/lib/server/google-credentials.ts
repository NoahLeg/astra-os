import "server-only";

import { getDecryptedIntegrationSecret, saveWorkspaceSecret } from "@/lib/server/admin-service";
import { getWorkspaceIdForUser } from "@/lib/server/database";
import { refreshGoogleAccessToken, type GoogleConnectionId } from "@/lib/server/google-oauth";

export const GOOGLE_WORKSPACE_SECRET_LABEL = "oauth:google-workspace";

export interface StoredGoogleCredential {
  id: string;
  label: string;
  refreshToken: string;
  workspaceId: string;
}

export async function getStoredGoogleCredential(input: {
  workspaceId: string;
  actorUserId: string;
  connectionId?: GoogleConnectionId;
}): Promise<StoredGoogleCredential | null> {
  const labels = [GOOGLE_WORKSPACE_SECRET_LABEL, ...(input.connectionId ? [`oauth:${input.connectionId}`] : [])];
  for (const label of labels) {
    const credential = await getDecryptedIntegrationSecret({
      workspaceId: input.workspaceId,
      provider: "Google OAuth",
      label,
      actorUserId: input.actorUserId,
    });
    if (credential) return { id: credential.id, label, refreshToken: credential.secret, workspaceId: input.workspaceId };
  }
  return null;
}

export async function saveGoogleWorkspaceCredential(input: {
  workspaceId: string;
  actorUserId: string;
  refreshToken: string;
}) {
  await saveWorkspaceSecret({
    workspaceId: input.workspaceId,
    provider: "Google OAuth",
    label: GOOGLE_WORKSPACE_SECRET_LABEL,
    baseUrl: "https://oauth2.googleapis.com/token",
    secret: input.refreshToken,
    actorUserId: input.actorUserId,
  });
}

export async function getGoogleAccessToken(userId: string, connectionId: GoogleConnectionId) {
  const workspaceId = await getWorkspaceIdForUser(userId);
  if (!workspaceId) throw new Error("Espace de travail introuvable.");
  const credential = await getStoredGoogleCredential({ workspaceId, actorUserId: userId, connectionId });
  if (!credential) throw new Error(`Le connecteur ${connectionId} doit être autorisé avant l’exécution.`);
  const token = await refreshGoogleAccessToken(credential.refreshToken);
  if (token.refresh_token && token.refresh_token !== credential.refreshToken) {
    await saveGoogleWorkspaceCredential({ workspaceId, actorUserId: userId, refreshToken: token.refresh_token });
  }
  return token.access_token;
}
