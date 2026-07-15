import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginPage } from "@/components/auth/login-page";

export const metadata: Metadata = { title: "Connexion", description: "Connectez-vous à votre espace Astra OS." };

export default function Page() {
  return <Suspense><LoginPage /></Suspense>;
}
