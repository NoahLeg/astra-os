import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/layout/app-providers";
import { AppShell } from "@/components/layout/app-shell";
import { GlassControlPanel } from "@/components/ui/glass-control-panel";

const displayFont = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const bodyFont = IBM_Plex_Sans({ variable: "--font-ibm-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const monoFont = IBM_Plex_Mono({ variable: "--font-ibm-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Astra OS — Idée → Résultat", template: "%s | Astra OS" },
  description: "Un espace de travail intelligent qui coordonne vos objectifs, agents et automatisations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning className={`dark ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
      <body className="antialiased">
        <AppProviders>
          <AppShell>{children}</AppShell>
          <GlassControlPanel />
          <svg className="glass-filter-svg" aria-hidden="true">
            <defs>
              <filter id="glass-refraction">
                <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="2" />
                <feDisplacementMap in="SourceGraphic" scale="4" xChannelSelector="R" yChannelSelector="G" />
                <feGaussianBlur stdDeviation="0.5" />
              </filter>
            </defs>
          </svg>
        </AppProviders>
      </body>
    </html>
  );
}
