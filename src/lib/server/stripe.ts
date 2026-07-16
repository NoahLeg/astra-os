import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | undefined;

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY n'est pas configurée côté serveur.");
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      appInfo: { name: "Astra OS", version: "0.1.0" },
      typescript: true,
    });
  }
  return stripeClient;
}
