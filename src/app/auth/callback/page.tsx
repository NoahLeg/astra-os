import { Suspense } from "react";
import { AuthCallback } from "@/components/auth/auth-callback";

export default function Page() {
  return <Suspense><AuthCallback /></Suspense>;
}
