import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/layout/app-providers";
import { AppShell } from "@/components/layout/app-shell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Astra OS — Idée → Résultat", template: "%s | Astra OS" },
  description: "Un espace de travail intelligent qui coordonne vos objectifs, agents et automatisations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <AppProviders><AppShell>{children}</AppShell></AppProviders>
      </body>
    </html>
  );
}
