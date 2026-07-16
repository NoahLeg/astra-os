import { Suspense } from "react";
import { SubscriptionOnboardingPage } from "@/components/billing/subscription-onboarding-page";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return <Suspense fallback={<main className="min-h-screen bg-background p-8"><Skeleton className="mx-auto h-[680px] max-w-6xl rounded-3xl" /></main>}><SubscriptionOnboardingPage /></Suspense>;
}
