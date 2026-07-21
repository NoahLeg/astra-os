"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, CircleAlert, CreditCard, FileText, LoaderCircle, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { EnterpriseQuoteDialog } from "@/components/billing/enterprise-quote-dialog";
import { AstraMark } from "@/components/shared/astra-mark";
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
  const [quoteOpen, setQuoteOpen] = useState(false);

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

    return () => {
      cancelled = true;
    };
  }, [loadBilling, searchParams]);

  const choosePlan = async (plan: SubscriptionPlan) => {
    if (plan.quoteOnly) {
      setQuoteOpen(true);
      return;
    }

    setBusyPlan(plan.id);
    try {
      const result = await billingService.checkout(plan.id, "onboarding");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Choix de l’offre impossible");
      setBusyPlan(undefined);
    }
  };

  if (loading) {
    return <main className="app-canvas flex min-h-screen items-center justify-center bg-background"><LoaderCircle className="size-9 animate-spin text-primary" /></main>;
  }

  return (
    <main className="app-canvas min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AstraMark className="size-9" />
            <div>
              <p className="font-display font-semibold">Astra OS</p>
              <p className="font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">Configuration de votre espace</p>
            </div>
          </div>
          <Badge className="border-primary/20 bg-primary/10 text-primary">Étape 2 sur 2</Badge>
        </header>

        <section className="astra-space-panel mt-8 rounded-[12px] border p-7 text-center sm:p-10">
          <div className="astra-star-field" />
          <div className="relative mx-auto max-w-2xl">
            <span className="astra-live-badge">Activation de l’espace</span>
            <p className="astra-eyebrow mt-5 justify-center text-[#9DA6FF]">Une puissance adaptée à votre équipe</p>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">Votre espace est prêt. Choisissez votre niveau d’autonomie.</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#AFB2DE]">Commencez gratuitement, activez une offre standard avec Stripe ou demandez un contrat Entreprise multi-membres.</p>
          </div>
        </section>

        {subscription?.onboardingCompleted ? (
          <div className="mx-auto mt-6 flex max-w-xl flex-col gap-3 rounded-[10px] border border-emerald-500/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center">
            <ShieldCheck className="size-5 shrink-0 text-emerald-500" />
            <p className="flex-1 text-sm">L’offre <strong>{subscription.planName}</strong> est active pour votre entreprise.</p>
            <Button onClick={() => window.location.assign("/")}>Ouvrir Astra<ArrowRight className="size-4" /></Button>
          </div>
        ) : null}

        {!subscription?.stripeConfigured ? (
          <div className="mx-auto mt-6 flex max-w-2xl gap-3 rounded-[10px] border border-amber-500/20 bg-amber-500/5 p-4">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <p className="text-sm leading-6 text-muted-foreground">Stripe n’est pas encore configuré pour toutes les offres standard. Free et la demande de devis Entreprise restent disponibles.</p>
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {plans.map((plan) => {
            const paid = !plan.quoteOnly && plan.monthlyPriceCents > 0;
            const selected = subscription?.onboardingCompleted && subscription.planId === plan.id;
            const standardPlanUnavailable = paid && !subscription?.stripeConfiguredPlans.includes(plan.id);

            return (
              <Card key={plan.id} className={cn("astra-metric-card relative overflow-hidden", plan.highlighted && "border-primary/50 shadow-[0_18px_50px_-30px_rgba(58,76,224,.7)]", selected && "ring-2 ring-emerald-500/50", plan.quoteOnly && "border-cyan-500/30")}>
                {plan.highlighted ? <div className="absolute right-0 top-0 rounded-bl-lg bg-[#FF4FA3] px-3 py-1 font-mono text-[9px] font-medium uppercase tracking-[.1em] text-white">Recommandé</div> : null}
                {plan.quoteOnly ? <div className="absolute right-0 top-0 rounded-bl-lg bg-cyan-500 px-3 py-1 font-mono text-[9px] font-medium uppercase tracking-[.1em] text-slate-950">Sur mesure</div> : null}
                <CardContent className="flex h-full flex-col p-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-xl font-semibold">{plan.name}</h2>
                      {selected ? <Badge className="bg-emerald-500/10 text-emerald-500">Active</Badge> : null}
                    </div>
                    <p className="mt-2 min-h-16 text-sm leading-5 text-muted-foreground">{plan.description}</p>
                  </div>

                  <p className="mt-6">
                    <span className="font-mono text-3xl font-semibold">{plan.quoteOnly ? "Sur devis" : plan.monthlyPriceCents ? currency.format(plan.monthlyPriceCents / 100) : "0 €"}</span>
                    {!plan.quoteOnly ? <span className="text-sm text-muted-foreground"> / mois</span> : null}
                  </p>

                  <div className="mt-5 rounded-lg border bg-muted/35 p-3">
                    <p className="font-mono text-lg font-semibold">{plan.monthlyTokenLimit.toLocaleString("fr-FR")} tokens</p>
                    <p className="text-xs text-muted-foreground">{plan.dailyTokenLimit.toLocaleString("fr-FR")}/jour · {plan.maxAgents || "Aucun"} agent{plan.maxAgents > 1 ? "s" : ""}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3" />{plan.maxMembers} siège{plan.maxMembers > 1 ? "s" : ""} inclus</p>
                  </div>

                  <div className="mt-5 flex-1 space-y-2.5">
                    {plan.features.map((feature) => <p key={feature} className="flex items-center gap-2 text-sm"><span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check className="size-3" /></span>{featureLabels[feature]}</p>)}
                  </div>

                  <Button
                    className="mt-7 w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                    disabled={Boolean(busyPlan) || selected || standardPlanUnavailable}
                    onClick={() => void choosePlan(plan)}
                  >
                    {busyPlan === plan.id ? <LoaderCircle className="size-4 animate-spin" /> : plan.quoteOnly ? <FileText className="size-4" /> : paid ? <CreditCard className="size-4" /> : <ArrowRight className="size-4" />}
                    {selected ? "Offre active" : plan.quoteOnly ? "Demander un devis" : paid ? `Payer et activer ${plan.name}` : "Continuer gratuitement"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="mt-8 text-center font-mono text-[9px] uppercase leading-5 tracking-[.06em] text-muted-foreground">Paiements standard sécurisés par Stripe · Contrats Entreprise validés manuellement · Quotas et sièges contrôlés côté serveur</p>
      </div>

      {quoteOpen ? <EnterpriseQuoteDialog open onClose={() => setQuoteOpen(false)} /> : null}
    </main>
  );
}
