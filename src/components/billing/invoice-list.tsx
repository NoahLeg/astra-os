import { Download, ExternalLink, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BillingInvoice } from "@/types";

const statusLabels: Record<BillingInvoice["status"], string> = {
  draft: "Brouillon",
  open: "À payer",
  paid: "Payée",
  void: "Annulée",
  uncollectible: "Impayée",
};

export function InvoiceList({ invoices, emptyMessage = "Aucune mensualité facturée pour le moment." }: { invoices: BillingInvoice[]; emptyMessage?: string }) {
  if (!invoices.length) return <div className="rounded-xl border border-dashed p-8 text-center"><ReceiptText className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p></div>;
  return <div className="space-y-2">{invoices.map((invoice) => {
    const displayedAmount = invoice.status === "paid" ? invoice.amountPaidCents : invoice.amountDueCents;
    const amount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: invoice.currency.toUpperCase() }).format(displayedAmount / 100);
    return <div key={invoice.id} className="flex flex-col gap-3 rounded-xl border bg-background p-3 sm:flex-row sm:items-center"><div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500"><ReceiptText className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-medium">{invoice.number ?? invoice.id}</p><Badge className={invoice.status === "paid" ? "bg-emerald-500/10 text-emerald-500" : invoice.status === "open" ? "bg-amber-500/10 text-amber-500" : "bg-muted text-muted-foreground"}>{statusLabels[invoice.status]}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{new Date(invoice.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</p></div><p className="font-mono text-sm font-semibold">{amount}</p><div className="flex gap-1">{invoice.hostedInvoiceUrl ? <Button asChild variant="ghost" size="icon"><a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" aria-label="Ouvrir la facture"><ExternalLink className="size-4" /></a></Button> : null}{invoice.invoicePdfUrl ? <Button asChild variant="ghost" size="icon"><a href={invoice.invoicePdfUrl} target="_blank" rel="noreferrer" aria-label="Télécharger la facture PDF"><Download className="size-4" /></a></Button> : null}</div></div>;
  })}</div>;
}
