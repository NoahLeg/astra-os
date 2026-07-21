"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CircleAlert, CreditCard, ExternalLink, FileText, LoaderCircle, Sparkles, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { EnterpriseQuoteDialog } from "@/components/billing/enterprise-quote-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { featureLabels } from "@/config";
import { cn } from "@/lib/utils";
import { billingService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { AIUsageSummary, SubscriptionPlan, WorkspaceSubscription } from "@/types";

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 6 });

export function BillingPage() {
  const searchParams = useSearchParams();
  const setAccount = useAppStore((state) => state.setAccount);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<WorkspaceSubscription>();
  const [usage, setUsage] = useState<AIUsageSummary>();
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string>();
  const [quoteOpen, setQuoteOpen] = useState(false);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") toast.success("Paiement reçu. Stripe synchronise maintenant votre abonnement.");
    if (checkout === "cancelled") toast.info("Paiement annulé, aucun changement n’a été appliqué.");

    void billingService.load()
      .then((data) => {
        setPlans(data.plans);
        setSubscription(data.subscription);
        setUsage(data.usage);
        const currentAccount = useAppStore.getState().account;
        if (currentAccount) setAccount({ ...currentAccount, subscription: data.subscription });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Facturation indisponible"))
      .finally(() => setLoading(false));
  }, [searchParams, setAccount]);

  const choosePlan = async (plan: SubscriptionPlan) => {
    if (plan.quoteOnly) {
      setQuoteOpen(true);
      return;
    }

    setBusyPlan(plan.id);
    try {
      const result = plan.id === subscription?.planId && subscription.managedByStripe
        ? await billingService.portal()
        : await billingService.checkout(plan.id);
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

  if (loading) return <div className="flex min-h-80 items-center justify-center"><LoaderCircle className="size-8 animate-spin text-primary" /></div>;
  if (!subscription) return <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-sm text-rose-500">L’abonnement n’a pas pu être chargé.</div>;

  const usagePercent = Math.min(100, subscription.monthlyTokenLimit ? (subscription.totalTokensUsed / subscription.monthlyTokenLimit) * 100 : 0);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Facturation et limites"
        title="Abonnement"
        description="Choisissez les capacités disponibles pour votre entreprise et suivez les tokens et coûts réels des requêtes IA."
        actions={subscription.managedByStripe ? (
          <Button variant="outline" disabled={busyPlan === "portal"} onClick={() => void openPortal()}>
            {busyPlan === "portal" ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
            Gérer sur Stripe
          </Button>
        ) : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_.7fr]">
        <Card className="border-primary/20">
          <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="size-5 text-primary" />Utilisation mensuelle</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Offre actuelle</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-2xl font-semibold">{subscription.planName}</p>
                  <Badge className={subscription.status === "active" || subscription.status === "trialing" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}>{subscription.status === "trialing" ? "Essai" : subscription.status}</Badge>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="size-3.5" />{subscription.memberCount} membre{subscription.memberCount > 1 ? "s" : ""} sur {subscription.maxMembers} siège{subscription.maxMembers > 1 ? "s" : ""}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-3xl font-semibold">{subscription.totalTokensUsed.toLocaleString("fr-FR")}</p>
                <p className="text-xs text-muted-foreground">sur {subscription.monthlyTokenLimit.toLocaleString("fr-FR")} tokens</p>
              </div>
            </div>
            <Progress value={usagePercent} className="mt-5 h-2" />
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>{usagePercent.toFixed(1)} % utilisés</span>
              <span>Réinitialisation le {new Date(subscription.usageResetAt).toLocaleDateString("fr-FR")}</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-background/50 p-3"><p className="text-xs text-muted-foreground">Tokens d’entrée</p><p className="mt-1 font-mono font-semibold">{subscription.inputTokensUsed.toLocaleString("fr-FR")}</p><p className="text-[10px] text-muted-foreground">dont {subscription.cachedInputTokensUsed.toLocaleString("fr-FR")} en cache</p></div><div className="rounded-xl border bg-background/50 p-3"><p className="text-xs text-muted-foreground">Tokens de sortie</p><p className="mt-1 font-mono font-semibold">{subscription.outputTokensUsed.toLocaleString("fr-FR")}</p></div><div className="rounded-xl border bg-background/50 p-3"><p className="text-xs text-muted-foreground">Coût cumulé réel</p><p className="mt-1 font-mono font-semibold">{usd.format(subscription.totalCostNanoUsd / 1_000_000_000)}</p></div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="size-5 text-violet-500" />Paiement et contrats</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">Les offres standard sont facturées par Stripe. Le plan Entreprise est activé après validation d’un devis, avec un nombre de sièges et des quotas adaptés.</p>
            {!subscription.stripeConfigured ? (
              <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
                <p className="text-xs leading-5 text-muted-foreground">Stripe n’est pas configuré pour toutes les offres standard. La demande de devis Entreprise reste disponible.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {plans.map((plan) => {
          const current = plan.id === subscription.planId;
          const paid = !plan.quoteOnly && plan.monthlyPriceCents > 0;
          const standardPlanUnavailable = paid && !subscription.stripeConfiguredPlans.includes(plan.id);
          const currentButtonDisabled = current && !subscription.managedByStripe;

          return (
            <Card key={plan.id} className={cn("relative overflow-hidden", plan.highlighted && "border-primary/50 shadow-primary/10", current && "ring-2 ring-emerald-500/50", plan.quoteOnly && "border-cyan-500/30")}>
              {plan.highlighted ? <div className="absolute right-0 top-0 rounded-bl-xl bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">Recommandé</div> : null}
              {plan.quoteOnly ? <div className="absolute right-0 top-0 rounded-bl-xl bg-cyan-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-950">Sur mesure</div> : null}
              <CardContent className="flex h-full flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{plan.name}</h2>
                    <p className="mt-1 min-h-16 text-sm text-muted-foreground">{plan.description}</p>
                  </div>
                  {current ? <Badge className="bg-emerald-500/10 text-emerald-500">Actuelle</Badge> : null}
                </div>

                <p className="mt-5">
                  <span className="font-mono text-3xl font-semibold">{plan.quoteOnly ? "Sur devis" : plan.monthlyPriceCents ? currency.format(plan.monthlyPriceCents / 100) : "0 €"}</span>
                  {!plan.quoteOnly ? <span className="text-sm text-muted-foreground"> / mois</span> : null}
                </p>

                <div className="mt-5 rounded-xl bg-muted/40 p-3">
                  <p className="font-mono text-lg font-semibold">{plan.monthlyTokenLimit.toLocaleString("fr-FR")} tokens</p>
                  <p className="text-xs text-muted-foreground">{plan.dailyTokenLimit.toLocaleString("fr-FR")}/jour · {plan.minuteRequestLimit}/min · {plan.maxAgents || "Aucun"} agent{plan.maxAgents > 1 ? "s" : ""}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3" />Jusqu’à {plan.maxMembers} membre{plan.maxMembers > 1 ? "s" : ""}</p>
                </div>

                <div className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => <p key={feature} className="flex items-center gap-2 text-sm"><span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check className="size-3" /></span>{featureLabels[feature]}</p>)}
                </div>

                <Button
                  className="mt-6 w-full"
                  variant={current ? "outline" : plan.highlighted ? "default" : "secondary"}
                  disabled={busyPlan === plan.id || standardPlanUnavailable || currentButtonDisabled}
                  onClick={() => void choosePlan(plan)}
                >
                  {busyPlan === plan.id ? <LoaderCircle className="size-4 animate-spin" /> : plan.quoteOnly ? <FileText className="size-4" /> : current ? <CreditCard className="size-4" /> : <Sparkles className="size-4" />}
                  {current ? subscription.managedByStripe ? "Gérer l’abonnement" : plan.quoteOnly ? "Contrat actif" : "Offre actuelle" : plan.quoteOnly ? "Demander un devis" : paid ? `Choisir ${plan.name}` : "Continuer en Free"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card><CardHeader><CardTitle>Détail des requêtes IA</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="py-3">Date</th><th>Fonction</th><th>Modèle</th><th>Entrée</th><th>Sortie</th><th>Total</th><th className="text-right">Coût réel</th></tr></thead><tbody>{usage?.requests.length ? usage.requests.map((event) => <tr key={event.id} className="border-b last:border-0"><td className="py-3 text-xs">{new Date(event.createdAt).toLocaleString("fr-FR")}</td><td><Badge>{event.feature}</Badge></td><td className="font-mono text-xs">{event.model}</td><td className="font-mono">{event.inputTokens.toLocaleString("fr-FR")}</td><td className="font-mono">{event.outputTokens.toLocaleString("fr-FR")}</td><td className="font-mono font-semibold">{event.totalTokens.toLocaleString("fr-FR")}</td><td className="text-right font-mono">{event.pricingStatus === "exact" && event.totalCostNanoUsd !== undefined ? usd.format(event.totalCostNanoUsd / 1_000_000_000) : "Tarif non configuré"}</td></tr>) : <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Aucune requête IA enregistrée ce mois-ci.</td></tr>}</tbody></table></div>{usage?.unpricedRequestCount ? <p className="mt-3 text-xs text-amber-500">{usage.unpricedRequestCount} requête(s) utilisent un modèle sans tarif versionné. Ajoutez son prix dans model_pricing pour obtenir un coût exact.</p> : null}</CardContent></Card>

      {quoteOpen ? <EnterpriseQuoteDialog open onClose={() => setQuoteOpen(false)} /> : null}
    </div>
  );
}
