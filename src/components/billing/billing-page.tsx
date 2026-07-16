"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CircleAlert, CreditCard, ExternalLink, LoaderCircle, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { featureLabels } from "@/config";
import { cn } from "@/lib/utils";
import { billingService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { SubscriptionPlan, WorkspaceSubscription } from "@/types";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function BillingPage() {
  const searchParams = useSearchParams();
  const setAccount = useAppStore((state) => state.setAccount);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<WorkspaceSubscription>();
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string>();

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") toast.success("Paiement reçu. Stripe synchronise maintenant votre abonnement.");
    if (checkout === "cancelled") toast.info("Paiement annulé, aucun changement n'a été appliqué.");
    void billingService.load().then((data) => {
      setPlans(data.plans);
      setSubscription(data.subscription);
      const currentAccount = useAppStore.getState().account;
      if (currentAccount) setAccount({ ...currentAccount, subscription: data.subscription });
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Facturation indisponible")).finally(() => setLoading(false));
  }, [searchParams, setAccount]);

  const openCheckout = async (plan: SubscriptionPlan) => {
    setBusyPlan(plan.id);
    try {
      const result = plan.id === subscription?.planId && plan.id !== "starter" ? await billingService.portal() : await billingService.checkout(plan.id);
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stripe est indisponible");
      setBusyPlan(undefined);
    }
  };

  const openPortal = async () => {
    setBusyPlan("portal");
    try {
      const result = await billingService.portal();
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Portail indisponible");
      setBusyPlan(undefined);
    }
  };

  if (loading) return <div className="flex min-h-80 items-center justify-center"><LoaderCircle className="size-8 animate-spin text-indigo-500" /></div>;
  if (!subscription) return <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 text-sm text-rose-500">L'abonnement n'a pas pu être chargé.</div>;
  const usagePercent = Math.min(100, (subscription.apiUsage / subscription.apiLimit) * 100);
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Facturation et limites" title="Abonnement" description="Choisissez les capacités disponibles pour votre entreprise et suivez la consommation réelle des appels IA." actions={subscription.planId !== "starter" ? <Button variant="outline" disabled={busyPlan === "portal"} onClick={() => void openPortal()}>{busyPlan === "portal" ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}Gérer sur Stripe</Button> : undefined} />
      <div className="grid gap-4 lg:grid-cols-[1fr_.7fr]">
        <Card className="border-indigo-500/20"><CardHeader><CardTitle className="flex items-center gap-2"><Zap className="size-5 text-indigo-500" />Utilisation mensuelle</CardTitle></CardHeader><CardContent><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted-foreground">Offre actuelle</p><div className="mt-1 flex items-center gap-2"><p className="text-2xl font-semibold">{subscription.planName}</p><Badge className={subscription.status === "active" || subscription.status === "trialing" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}>{subscription.status === "trialing" ? "Essai" : subscription.status}</Badge></div></div><div className="text-right"><p className="font-mono text-3xl font-semibold">{subscription.apiUsage.toLocaleString("fr-FR")}</p><p className="text-xs text-muted-foreground">sur {subscription.apiLimit.toLocaleString("fr-FR")} appels API</p></div></div><Progress value={usagePercent} className="mt-5 h-2" /><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{usagePercent.toFixed(1)} % utilisés</span><span>Réinitialisation le {new Date(subscription.usageResetAt).toLocaleDateString("fr-FR")}</span></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="size-5 text-violet-500" />Sécurité de paiement</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">Astra ne collecte ni ne stocke les numéros de carte. Le paiement, les factures et les changements d'offre sont hébergés par Stripe.</p>{!subscription.stripeConfigured ? <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" /><p className="text-xs leading-5 text-muted-foreground">Ajoutez les variables Stripe dans Vercel pour activer les boutons payants. Les droits d'essai restent utilisables.</p></div> : null}</CardContent></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">{plans.map((plan) => { const current = plan.id === subscription.planId; const paid = plan.id !== "starter"; return <Card key={plan.id} className={cn("relative overflow-hidden", plan.highlighted && "border-indigo-500/50 shadow-indigo-500/10", current && "ring-2 ring-emerald-500/50")}>{plan.highlighted ? <div className="absolute right-0 top-0 rounded-bl-xl bg-indigo-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Recommandé</div> : null}<CardContent className="p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">{plan.name}</h2><p className="mt-1 text-sm text-muted-foreground">{plan.description}</p></div>{current ? <Badge className="bg-emerald-500/10 text-emerald-500">Actuelle</Badge> : null}</div><p className="mt-6"><span className="font-mono text-4xl font-semibold">{plan.monthlyPriceCents ? currency.format(plan.monthlyPriceCents / 100) : "0 €"}</span><span className="text-sm text-muted-foreground"> / mois</span></p><div className="mt-5 rounded-xl bg-muted/40 p-3"><p className="font-mono text-lg font-semibold">{plan.apiLimit.toLocaleString("fr-FR")}</p><p className="text-xs text-muted-foreground">appels API par mois · {plan.maxAgents || "Aucun"} agent{plan.maxAgents > 1 ? "s" : ""}</p></div><div className="mt-5 space-y-2.5">{plan.features.map((feature) => <p key={feature} className="flex items-center gap-2 text-sm"><span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check className="size-3" /></span>{featureLabels[feature]}</p>)}</div><Button className="mt-6 w-full" variant={current ? "outline" : plan.highlighted ? "default" : "secondary"} disabled={busyPlan === plan.id || (!subscription.stripeConfigured && paid) || (current && plan.id === "starter")} onClick={() => void openCheckout(plan)}>{busyPlan === plan.id ? <LoaderCircle className="size-4 animate-spin" /> : current ? <CreditCard className="size-4" /> : <Sparkles className="size-4" />}{current ? plan.id === "starter" ? "Offre actuelle" : "Gérer l'abonnement" : paid ? `Choisir ${plan.name}` : "Starter gratuit"}</Button></CardContent></Card>; })}</div>
    </div>
  );
}
