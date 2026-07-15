import type { Metadata } from "next";
import { ForgotPasswordPage } from "@/components/auth/forgot-password-page";

export const metadata: Metadata = { title: "Mot de passe oublié" };
export default function Page() { return <ForgotPasswordPage />; }
