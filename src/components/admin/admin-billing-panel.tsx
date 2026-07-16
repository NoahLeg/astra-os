"use client";

import { useState } from "react";
import { CalendarClock, CreditCard, LoaderCircle, RefreshCw, RotateCcw, ShieldAlert, Zap } from "lucide-react";
import { toast } from "sonner";
import { InvoiceList } from "@/components/billing/invoice-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { BillingOverview, SubscriptionPlan } from "@/types";

export function AdminBillingPanel({ workspaceId, billing, onChanged }: { workspaceId: string; billing?: BillingOverview; onChanged: () => Promise<void> }) {
  const [planId, setPlanId] = useState<SubscriptionPlan["id"]>(billing?.subscription.planId ?? "starter");
  const [busyAction, setBusyAction] = useState<string>();

  const runAction = async (payload: Record<string, unknown>, successFallback: string) => {
    setBusyAction(String(payload.action));
    try {
      const response = await fetch("/api/admin/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...payload }) });
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

  if (!billing) return <Card><CardContent className="flex min-h-56 items-center justify-center"><LoaderCircle className="size-6 animate-spin text-indigo-500" /></CardContent></Card>;
  const { subscription, plans, invoices } = billing;
  const usagePercent = Math.min(100, (subscription.apiUsage / subscription.apiLimit) * 100);

  const changePlan = async () => {
    if (planId === subscription.planId && !subscription.cancelAtPeriodEnd) return;
    const target = plans.find((plan) => plan.id === planId);
    const warning = subscription.managedByStripe
      ? planId === "starter" ? "Le passage à Starter sera programmé à la fin de la période déjà payée." : "Stripe appliquera une proratisation sur le prochain cycle de facturation."
      : planId === "starter" ? "L’offre gratuite sera appliquée immédiatement." : "Cette entreprise n’a pas d’abonnement Stripe. Le plan payant sera accordé manuellement sans prélèvement.";
    if (!window.confirm(`${warning}\n\nConfirmer le passage vers ${target?.name ?? planId} ?`)) return;
    await runAction({ action: "change_plan", planId }, "Offre mise à jour");
  };

  return <div className="space-y-5"><div className="grid gap-5 xl:grid-cols-[1fr_380px]"><Card className="border-violet-500/20"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><CreditCard className="size-4 text-violet-500" />Contrôle de l’abonnement</CardTitle><div className="flex gap-2"><Badge className={subscription.managedByStripe ? "bg-indigo-500/10 text-indigo-500" : "bg-amber-500/10 text-amber-500"}>{subscription.managedByStripe ? "Géré par Stripe" : "Gestion manuelle"}</Badge>{subscription.cancelAtPeriodEnd ? <Badge className="bg-rose-500/10 text-rose-500">Résiliation programmée</Badge> : null}</div></div></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Offre actuelle</p><p className="mt-1 text-xl font-semibold">{subscription.planName}</p></div><div className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Statut</p><p className="mt-1 font-mono text-sm font-semibold">{subscription.status}</p></div><div className="rounded-xl bg-muted/40 p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3" />Fin de période</p><p className="mt-1 font-mono text-sm font-semibold">{subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR") : "—"}</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]"><label className="text-sm font-medium">Nouvelle offre<select value={planId} onChange={(event) => setPlanId(event.target.value as SubscriptionPlan["id"])} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm">{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {(plan.monthlyPriceCents / 100).toLocaleString("fr-FR")} € / mois</option>)}</select></label><Button className="self-end" disabled={Boolean(busyAction) || (planId === subscription.planId && !subscription.cancelAtPeriodEnd)} onClick={() => void changePlan()}>{busyAction === "change_plan" ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Appliquer</Button></div>{!subscription.managedByStripe ? <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" /><p className="text-xs leading-5 text-muted-foreground">Une attribution manuelle donne les fonctionnalités du plan sans créer de paiement Stripe. Utilisez-la seulement pour un geste commercial, un partenaire ou un compte interne.</p></div> : null}<div className="mt-4 flex flex-wrap gap-2">{subscription.cancelAtPeriodEnd && subscription.managedByStripe ? <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => void runAction({ action: "reactivate" }, "Abonnement réactivé")}>{busyAction === "reactivate" ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Annuler la résiliation</Button> : null}<Button variant="outline" disabled={Boolean(busyAction)} onClick={() => { if (window.confirm("Remettre le compteur API de cette entreprise à zéro ?")) void runAction({ action: "reset_usage" }, "Quota remis à zéro"); }}>{busyAction === "reset_usage" ? <LoaderCircle className="size-4 animate-spin" /> : <Zap className="size-4" />}Réinitialiser le quota</Button></div></CardContent></Card><Card><CardHeader><CardTitle>Consommation API</CardTitle></CardHeader><CardContent><div className="flex items-end justify-between"><p className="font-mono text-3xl font-semibold">{subscription.apiUsage.toLocaleString("fr-FR")}</p><p className="font-mono text-sm text-muted-foreground">/ {subscription.apiLimit.toLocaleString("fr-FR")}</p></div><Progress value={usagePercent} className="mt-4 h-2" /><p className="mt-3 text-xs text-muted-foreground">Réinitialisation automatique le {new Date(subscription.usageResetAt).toLocaleDateString("fr-FR")}</p></CardContent></Card></div><Card><CardHeader><CardTitle>Mensualités et factures</CardTitle></CardHeader><CardContent><InvoiceList invoices={invoices} emptyMessage="Aucune facture Stripe associée à cette entreprise." /></CardContent></Card></div>;
}
