import type { Metadata } from "next";
import { ResetPasswordPage } from "@/components/auth/reset-password-page";

export const metadata: Metadata = { title: "Nouveau mot de passe" };
export default function Page() { return <ResetPasswordPage />; }
