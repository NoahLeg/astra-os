"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, CheckCircle2, Gauge, LoaderCircle, Send, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { billingService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { EnterpriseQuoteRequest } from "@/types";

const quoteSchema = z.object({
  contactName: z.string().trim().min(2, "Indiquez le nom du contact").max(100),
  contactEmail: z.email("Adresse email invalide"),
  companyName: z.string().trim().min(2, "Indiquez le nom de l’entreprise").max(120),
  seatCount: z.number().int().min(2, "Deux sièges minimum").max(10_000),
  estimatedMonthlyTokens: z.number().int().min(100_000, "Minimum 100 000 tokens").max(10_000_000_000),
  message: z.string().trim().max(2_000).optional(),
});

type QuoteForm = z.infer<typeof quoteSchema>;

export function EnterpriseQuoteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const account = useAppStore((state) => state.account);
  const [submittedQuote, setSubmittedQuote] = useState<EnterpriseQuoteRequest>();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<QuoteForm>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      contactName: account?.fullName ?? "",
      contactEmail: account?.email ?? "",
      companyName: account?.workspaceName ?? "",
      seatCount: 20,
      estimatedMonthlyTokens: 5_000_000,
      message: "",
    },
  });

  const submit = async (values: QuoteForm) => {
    try {
      const quote = await billingService.requestEnterpriseQuote(values);
      setSubmittedQuote(quote);
      toast.success("Demande de devis transmise");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi impossible");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Offre Entreprise sur devis" description="Décrivez le déploiement souhaité. La demande apparaîtra immédiatement dans la console Super Admin.">
      {submittedQuote ? (
        <div className="py-5 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500"><CheckCircle2 className="size-6" /></span>
          <h3 className="mt-4 font-display text-xl font-semibold">Demande enregistrée</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Votre demande pour {submittedQuote.seatCount} sièges est maintenant suivie par l’équipe commerciale.</p>
          <p className="mt-3 font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">Référence {submittedQuote.id}</p>
          <Button className="mt-6" onClick={onClose}>Fermer</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Contact principal<Input className="mt-2" autoComplete="name" {...register("contactName")} /></label>
            <label className="text-sm font-medium">Email professionnel<Input className="mt-2" type="email" autoComplete="email" {...register("contactEmail")} /></label>
          </div>
          {(errors.contactName || errors.contactEmail) ? <p className="text-xs text-rose-500">{errors.contactName?.message ?? errors.contactEmail?.message}</p> : null}
          <label className="text-sm font-medium">Entreprise<div className="relative mt-2"><Building2 className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" autoComplete="organization" {...register("companyName")} /></div></label>
          {errors.companyName ? <p className="text-xs text-rose-500">{errors.companyName.message}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Nombre de sièges<div className="relative mt-2"><Users className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" type="number" min={2} max={10000} {...register("seatCount", { valueAsNumber: true })} /></div></label>
            <label className="text-sm font-medium">Tokens IA estimés / mois<div className="relative mt-2"><Gauge className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" type="number" min={100000} step={100000} {...register("estimatedMonthlyTokens", { valueAsNumber: true })} /></div></label>
          </div>
          {(errors.seatCount || errors.estimatedMonthlyTokens) ? <p className="text-xs text-rose-500">{errors.seatCount?.message ?? errors.estimatedMonthlyTokens?.message}</p> : null}
          <label className="text-sm font-medium">Contexte et exigences<Textarea className="mt-2 min-h-24" placeholder="SSO, sécurité, volume, accompagnement, calendrier de déploiement…" {...register("message")} /></label>
          {errors.message ? <p className="text-xs text-rose-500">{errors.message.message}</p> : null}
          <div className="rounded-lg border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">Aucun paiement n’est déclenché. Le plan Entreprise sera activé par un Super Admin après validation du devis et du nombre de sièges.</div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
            Envoyer la demande
          </Button>
        </form>
      )}
    </Modal>
  );
}
