"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, CircleAlert, CreditCard, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { featureLabels } from "@/config";
import { cn } from "@/lib/utils";
import { billingService } from "@/services";
import type { SubscriptionPlan, WorkspaceSubscription } from "@/types";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function SubscriptionOnboardingPage() {
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<WorkspaceSubscription>();
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<SubscriptionPlan["id"]>();

  const loadBilling = useCallback(async () => {
    const data = await billingService.load();
    setPlans(data.plans);
    setSubscription(data.subscription);
    return data.subscription;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await loadBilling();
        if (cancelled) return;
        if (searchParams.get("checkout") === "cancelled") toast.info("Paiement annulé. Vous pouvez choisir une autre offre ou rester en Free.");
        if (searchParams.get("checkout") === "success" && !current.onboardingCompleted) {
          toast.info("Paiement reçu. Vérification de l’abonnement en cours…");
          for (let attempt = 0; attempt < 4 && !cancelled; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1_500));
            const refreshed = await loadBilling();
            if (refreshed.onboardingCompleted) break;
          }
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Offres indisponibles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadBilling, searchParams]);

  const choosePlan = async (plan: SubscriptionPlan) => {
    setBusyPlan(plan.id);
    try {
      const result = await billingService.checkout(plan.id, "onboarding");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Choix de l’offre impossible");
      setBusyPlan(undefined);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-background"><LoaderCircle className="size-9 animate-spin text-indigo-500" /></main>;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white"><Sparkles className="size-5" /></span><div><p className="font-semibold">Astra OS</p><p className="text-xs text-muted-foreground">Configuration de votre espace</p></div></div><Badge className="bg-indigo-500/10 text-indigo-500">Étape 2 sur 2</Badge></div>
        <div className="mx-auto mt-12 max-w-2xl text-center"><p className="text-sm font-medium text-indigo-500">Choisissez votre niveau de puissance</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Votre espace est prêt. Quelle offre souhaitez-vous activer ?</h1><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Vous pouvez commencer gratuitement, ou activer immédiatement les agents, connecteurs et automatisations. Le changement reste possible ensuite depuis votre compte.</p></div>
        {subscription?.onboardingCompleted ? <div className="mx-auto mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><ShieldCheck className="size-5 shrink-0 text-emerald-500" /><p className="flex-1 text-sm">L’offre <strong>{subscription.planName}</strong> est active pour votre entreprise.</p><Button onClick={() => window.location.assign("/")}>Ouvrir Astra<ArrowRight className="size-4" /></Button></div> : null}
        {!subscription?.stripeConfigured ? <div className="mx-auto mt-6 flex max-w-2xl gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"><CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" /><p className="text-sm leading-6 text-muted-foreground">Le paiement Stripe n’est pas encore configuré. L’offre gratuite reste disponible immédiatement.</p></div> : null}
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const paid = plan.monthlyPriceCents > 0;
            const selected = subscription?.onboardingCompleted && subscription.planId === plan.id;
            return <Card key={plan.id} className={cn("relative overflow-hidden", plan.highlighted && "border-indigo-500/50 shadow-xl shadow-indigo-500/10", selected && "ring-2 ring-emerald-500/50")}>
              {plan.highlighted ? <div className="absolute right-0 top-0 rounded-bl-xl bg-indigo-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Recommandé</div> : null}
              <CardContent className="flex h-full flex-col p-6"><div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">{plan.name}</h2>{selected ? <Badge className="bg-emerald-500/10 text-emerald-500">Active</Badge> : null}</div><p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">{plan.description}</p></div><p className="mt-6"><span className="font-mono text-4xl font-semibold">{plan.monthlyPriceCents ? currency.format(plan.monthlyPriceCents / 100) : "0 €"}</span><span className="text-sm text-muted-foreground"> / mois</span></p><div className="mt-5 rounded-xl bg-muted/40 p-3"><p className="font-mono text-lg font-semibold">{plan.apiLimit.toLocaleString("fr-FR")}</p><p className="text-xs text-muted-foreground">appels / mois · {plan.dailyApiLimit}/jour · {plan.maxAgents || "Aucun"} agent{plan.maxAgents > 1 ? "s" : ""}</p></div><div className="mt-5 flex-1 space-y-2.5">{plan.features.map((feature) => <p key={feature} className="flex items-center gap-2 text-sm"><span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check className="size-3" /></span>{featureLabels[feature]}</p>)}</div><Button className="mt-7 w-full" variant={plan.highlighted ? "default" : "outline"} disabled={Boolean(busyPlan) || selected || (paid && !subscription?.stripeConfiguredPlans.includes(plan.id))} onClick={() => void choosePlan(plan)}>{busyPlan === plan.id ? <LoaderCircle className="size-4 animate-spin" /> : paid ? <CreditCard className="size-4" /> : <ArrowRight className="size-4" />}{selected ? "Offre active" : paid ? `Payer et activer ${plan.name}` : "Continuer gratuitement"}</Button></CardContent>
            </Card>;
          })}
        </div>
        <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">Paiements sécurisés par Stripe. Astra ne reçoit jamais vos coordonnées bancaires. Les abonnements payants sont résiliables depuis le portail de facturation.</p>
      </div>
    </main>
  );
}
