"use client";

import { useState } from "react";
import { CalendarClock, CheckCircle2, Contact, CreditCard, FileText, LoaderCircle, RefreshCw, RotateCcw, ShieldAlert, Users, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";
import { InvoiceList } from "@/components/billing/invoice-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { BillingOverview, EnterpriseQuoteRequest, EnterpriseQuoteStatus, SubscriptionPlan } from "@/types";

type AdminBillingPanelProps = {
  workspaceId: string;
  billing?: BillingOverview;
  enterpriseQuotes?: EnterpriseQuoteRequest[];
  onChanged: () => Promise<void>;
};

const quoteStatusLabels: Record<EnterpriseQuoteStatus, string> = {
  pending: "À traiter",
  contacted: "Contacté",
  approved: "Approuvé",
  declined: "Refusé",
};

export function AdminBillingPanel({ workspaceId, billing, enterpriseQuotes = [], onChanged }: AdminBillingPanelProps) {
  const [planId, setPlanId] = useState<SubscriptionPlan["id"]>(billing?.subscription.planId ?? "free");
  const [memberLimit, setMemberLimit] = useState(billing?.subscription.maxMembers ?? 50);
  const [busyAction, setBusyAction] = useState<string>();

  const runAction = async (payload: Record<string, unknown>, successFallback: string, busyKey = String(payload.action)) => {
    setBusyAction(busyKey);
    try {
      const response = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...payload }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Action de facturation impossible");
      await onChanged();
      toast.success(result.message ?? successFallback);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action de facturation impossible");
    } finally {
      setBusyAction(undefined);
    }
  };

  if (!billing) return <Card><CardContent className="flex min-h-56 items-center justify-center"><LoaderCircle className="size-6 animate-spin text-primary" /></CardContent></Card>;

  const { subscription, plans, invoices } = billing;
  const usagePercent = Math.min(100, subscription.monthlyTokenLimit ? (subscription.totalTokensUsed / subscription.monthlyTokenLimit) * 100 : 0);
  const targetPlan = plans.find((plan) => plan.id === planId);

  const changePlan = async () => {
    if (planId === subscription.planId && !subscription.cancelAtPeriodEnd) return;

    if (targetPlan?.quoteOnly && subscription.managedByStripe) {
      toast.error("Le contrat Stripe doit être terminé avant d’activer Entreprise manuellement.");
      return;
    }

    const warning = targetPlan?.quoteOnly
      ? "Le contrat Entreprise sera attribué manuellement sans prélèvement Stripe. Vous pourrez ensuite définir le nombre de sièges contractuels."
      : subscription.managedByStripe
        ? planId === "free" ? "Le passage à Free sera programmé à la fin de la période déjà payée." : "Stripe appliquera une proratisation sur le prochain cycle de facturation."
        : planId === "free" ? "L’offre gratuite sera appliquée immédiatement." : "Cette entreprise n’a pas d’abonnement Stripe. Le plan payant sera accordé manuellement sans prélèvement.";

    if (!window.confirm(`${warning}\n\nConfirmer le passage vers ${targetPlan?.name ?? planId} ?`)) return;
    await runAction({ action: "change_plan", planId }, "Offre mise à jour");
  };

  const changeQuoteStatus = async (quote: EnterpriseQuoteRequest, status: EnterpriseQuoteStatus) => {
    await runAction(
      { action: "update_quote_status", quoteId: quote.id, status },
      "Demande de devis mise à jour",
      `quote-${quote.id}-${status}`,
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="border-violet-500/20">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2"><CreditCard className="size-4 text-violet-500" />Contrôle de l’abonnement</CardTitle>
              <div className="flex gap-2">
                <Badge className={subscription.quoteOnly ? "bg-cyan-500/10 text-cyan-500" : subscription.managedByStripe ? "bg-indigo-500/10 text-indigo-500" : "bg-amber-500/10 text-amber-500"}>{subscription.quoteOnly ? "Contrat Entreprise" : subscription.managedByStripe ? "Géré par Stripe" : "Gestion manuelle"}</Badge>
                {subscription.cancelAtPeriodEnd ? <Badge className="bg-rose-500/10 text-rose-500">Résiliation programmée</Badge> : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Offre actuelle</p><p className="mt-1 text-xl font-semibold">{subscription.planName}</p></div>
              <div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Statut</p><p className="mt-1 font-mono text-sm font-semibold">{subscription.status}</p></div>
              <div className="rounded-xl bg-muted/40 p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3" />Membres</p><p className="mt-1 font-mono text-sm font-semibold">{subscription.memberCount} / {subscription.maxMembers}</p></div>
              <div className="rounded-xl bg-muted/40 p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3" />Fin de période</p><p className="mt-1 font-mono text-sm font-semibold">{subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR") : "—"}</p></div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="text-sm font-medium">
                Nouvelle offre
                <select value={planId} onChange={(event) => setPlanId(event.target.value as SubscriptionPlan["id"])} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm">
                  {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.quoteOnly ? "sur devis" : `${(plan.monthlyPriceCents / 100).toLocaleString("fr-FR")} € / mois`} · {plan.maxMembers} siège{plan.maxMembers > 1 ? "s" : ""}</option>)}
                </select>
              </label>
              <Button className="self-end" disabled={Boolean(busyAction) || (planId === subscription.planId && !subscription.cancelAtPeriodEnd)} onClick={() => void changePlan()}>
                {busyAction === "change_plan" ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Appliquer
              </Button>
            </div>

            {!subscription.managedByStripe ? (
              <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <p className="text-xs leading-5 text-muted-foreground">Une attribution manuelle donne les fonctionnalités du plan sans créer de paiement Stripe. Pour Entreprise, elle doit correspondre à un devis ou contrat validé.</p>
              </div>
            ) : null}

            {subscription.planId === "enterprise" ? (
              <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <p className="text-sm font-medium">Sièges contractuels</p>
                <p className="mt-1 text-xs text-muted-foreground">La limite ne peut pas être inférieure aux {subscription.memberCount} membres actifs.</p>
                <div className="mt-3 flex gap-2">
                  <Input type="number" min={Math.max(2, subscription.memberCount)} max={10_000} value={memberLimit} onChange={(event) => setMemberLimit(Number(event.target.value))} />
                  <Button variant="outline" disabled={Boolean(busyAction) || memberLimit < subscription.memberCount} onClick={() => void runAction({ action: "set_member_limit", maxMembers: memberLimit }, "Nombre de sièges mis à jour")}>{busyAction === "set_member_limit" ? <LoaderCircle className="size-4 animate-spin" /> : <Users className="size-4" />}Mettre à jour</Button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {subscription.cancelAtPeriodEnd && subscription.managedByStripe ? <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => void runAction({ action: "reactivate" }, "Abonnement réactivé")}>{busyAction === "reactivate" ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Annuler la résiliation</Button> : null}
              <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => { if (window.confirm("Remettre les tokens et le coût IA cumulés de cette entreprise à zéro ?")) void runAction({ action: "reset_usage" }, "Usage IA remis à zéro"); }}>{busyAction === "reset_usage" ? <LoaderCircle className="size-4 animate-spin" /> : <Zap className="size-4" />}Réinitialiser l’usage</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Consommation IA</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end justify-between"><p className="font-mono text-3xl font-semibold">{subscription.totalTokensUsed.toLocaleString("fr-FR")}</p><p className="font-mono text-sm text-muted-foreground">/ {subscription.monthlyTokenLimit.toLocaleString("fr-FR")} tokens</p></div>
            <Progress value={usagePercent} className="mt-4 h-2" />
            <p className="mt-3 text-xs text-muted-foreground">Réinitialisation automatique le {new Date(subscription.usageResetAt).toLocaleDateString("fr-FR")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4 text-cyan-500" />Demandes de devis Entreprise</CardTitle></CardHeader>
        <CardContent>
          {enterpriseQuotes.length ? (
            <div className="space-y-3">
              {enterpriseQuotes.map((quote) => (
                <div key={quote.id} className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{quote.companyName}</p><Badge className={quote.status === "approved" ? "bg-emerald-500/10 text-emerald-500" : quote.status === "declined" ? "bg-rose-500/10 text-rose-500" : quote.status === "contacted" ? "bg-indigo-500/10 text-indigo-500" : "bg-amber-500/10 text-amber-500"}>{quoteStatusLabels[quote.status]}</Badge></div>
                      <p className="mt-1 text-xs text-muted-foreground">{quote.contactName} · {quote.contactEmail}</p>
                      <p className="mt-3 text-sm"><strong>{quote.seatCount} sièges</strong> · {quote.estimatedMonthlyTokens.toLocaleString("fr-FR")} tokens IA estimés / mois</p>
                      {quote.message ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{quote.message}</p> : null}
                      <p className="mt-2 font-mono text-[10px] text-muted-foreground">{new Date(quote.createdAt).toLocaleString("fr-FR")} · {quote.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={Boolean(busyAction) || quote.status === "contacted"} onClick={() => void changeQuoteStatus(quote, "contacted")}><Contact className="size-3.5" />Contacté</Button>
                      <Button size="sm" variant="outline" disabled={Boolean(busyAction) || quote.status === "approved"} onClick={() => void changeQuoteStatus(quote, "approved")}><CheckCircle2 className="size-3.5 text-emerald-500" />Approuver</Button>
                      <Button size="sm" variant="ghost" disabled={Boolean(busyAction) || quote.status === "declined"} onClick={() => void changeQuoteStatus(quote, "declined")}><XCircle className="size-3.5 text-rose-500" />Refuser</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-sm text-muted-foreground">Aucune demande de devis pour cette entreprise.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mensualités et factures</CardTitle></CardHeader>
        <CardContent><InvoiceList invoices={invoices} emptyMessage="Aucune facture Stripe associée à cette entreprise." /></CardContent>
      </Card>
    </div>
  );
}
