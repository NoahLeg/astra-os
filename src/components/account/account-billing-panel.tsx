"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarClock, CreditCard, ExternalLink, LoaderCircle, Zap } from "lucide-react";
import { toast } from "sonner";
import { InvoiceList } from "@/components/billing/invoice-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { billingService } from "@/services";
import type { BillingOverview } from "@/types";

export function AccountBillingPanel() {
  const [billing, setBilling] = useState<BillingOverview>();
  const [loading, setLoading] = useState(true);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    void billingService.load().then(setBilling).catch((error) => toast.error(error instanceof Error ? error.message : "Facturation indisponible")).finally(() => setLoading(false));
  }, []);

  const openPortal = async () => {
    setOpeningPortal(true);
    try {
      const result = await billingService.portal();
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Portail Stripe indisponible");
      setOpeningPortal(false);
    }
  };

  if (loading) return <Card><CardContent className="flex min-h-44 items-center justify-center"><LoaderCircle className="size-6 animate-spin text-indigo-500" /></CardContent></Card>;
  if (!billing) return null;
  const { subscription, plans, invoices } = billing;
  const plan = plans.find((item) => item.id === subscription.planId);
  const usagePercent = Math.min(100, subscription.apiLimit ? (subscription.apiUsage / subscription.apiLimit) * 100 : 0);
  const monthlyAmount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format((plan?.monthlyPriceCents ?? 0) / 100);

  return <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-[1fr_.8fr]"><Card className="border-indigo-500/20"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><CreditCard className="size-4 text-indigo-500" />Abonnement et mensualité</CardTitle><Badge className={subscription.status === "active" || subscription.status === "trialing" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}>{subscription.cancelAtPeriodEnd ? "Résiliation programmée" : subscription.status === "trialing" ? "Essai" : "Actif"}</Badge></div></CardHeader><CardContent><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm text-muted-foreground">Offre actuelle</p><p className="mt-1 text-2xl font-semibold">{subscription.planName}</p><p className="mt-1 text-sm text-muted-foreground">{monthlyAmount} / mois</p></div><div className="rounded-xl bg-muted/40 p-3 text-right"><p className="flex items-center justify-end gap-2 text-xs text-muted-foreground"><CalendarClock className="size-3.5" />Prochaine échéance</p><p className="mt-1 font-mono text-sm font-semibold">{subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR") : "Aucune"}</p></div></div><div className="mt-5 flex flex-wrap gap-2"><Button asChild><Link href="/billing">Comparer les offres</Link></Button>{subscription.managedByStripe ? <Button variant="outline" disabled={openingPortal} onClick={() => void openPortal()}>{openingPortal ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}Paiements et moyens de paiement</Button> : null}</div></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Zap className="size-4 text-violet-500" />Utilisation du mois</CardTitle></CardHeader><CardContent><div className="flex items-end justify-between"><div><p className="font-mono text-3xl font-semibold">{subscription.apiUsage.toLocaleString("fr-FR")}</p><p className="text-xs text-muted-foreground">appels consommés</p></div><p className="font-mono text-sm text-muted-foreground">/ {subscription.apiLimit.toLocaleString("fr-FR")}</p></div><Progress value={usagePercent} className="mt-4 h-2" /><p className="mt-3 text-xs text-muted-foreground">Réinitialisation le {new Date(subscription.usageResetAt).toLocaleDateString("fr-FR")}</p></CardContent></Card></div><Card><CardHeader><CardTitle>Historique des mensualités</CardTitle></CardHeader><CardContent><InvoiceList invoices={invoices} /></CardContent></Card></div>;
}
