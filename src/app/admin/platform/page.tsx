import type { Metadata } from "next";
import { PlatformAdminPage } from "@/components/admin/platform-admin-page";

export const metadata: Metadata = { title: "Configuration plateforme" };

export default function Page() {
  return <PlatformAdminPage />;
}
