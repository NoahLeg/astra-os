import "server-only";

import Stripe from "stripe";
import { getPlatformStripeSecrets } from "@/lib/server/platform-admin";

let cachedStripe: { key: string; client: Stripe } | undefined;

export async function getStripeClient() {
  const stored: { secretKey?: string; webhookSecret?: string } = await getPlatformStripeSecrets().catch(() => ({}));
  const secretKey = stored.secretKey ?? process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Aucune clé secrète Stripe n’est configurée.");
  if (!cachedStripe || cachedStripe.key !== secretKey) {
    cachedStripe = {
      key: secretKey,
      client: new Stripe(secretKey, {
        appInfo: { name: "Astra OS", version: "0.1.0" },
        typescript: true,
      }),
    };
  }
  return cachedStripe.client;
}

export async function getStripeWebhookSecret() {
  const stored: { secretKey?: string; webhookSecret?: string } = await getPlatformStripeSecrets().catch(() => ({}));
  return stored.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
}
