import { NextResponse } from "next/server";
import { models as fallbackModels } from "@/config";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { getWorkspaceSubscription } from "@/lib/server/billing";
import { hasWorkspaceAccess } from "@/lib/server/database";
import { listPlatformModels } from "@/lib/server/platform-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user || !await hasWorkspaceAccess(user.id, "viewer")) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  try {
    const [catalog, subscription] = await Promise.all([listPlatformModels(), getWorkspaceSubscription(user.id)]);
    const visible = catalog
      .filter((model) => model.enabled && model.userVisible && (!model.premium || subscription.premiumModels))
      .slice(0, subscription.maxModels);
    return NextResponse.json({ models: visible.map((model) => ({ id: model.modelId, name: model.displayName, provider: model.providerName, description: model.description, contextWindow: model.contextWindowTokens })) });
  } catch {
    return NextResponse.json({ models: fallbackModels.map((model) => ({ id: model.id, name: model.name, provider: model.provider, contextWindow: model.contextWindow })) });
  }
}
