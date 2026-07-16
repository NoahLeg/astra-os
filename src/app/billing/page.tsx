import { Suspense } from "react";
import { BillingPage } from "@/components/billing/billing-page";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-[520px] w-full rounded-3xl" />}><BillingPage /></Suspense>;
}
