"use client";

import { useMemo, useState } from "react";
import { CheckCheck, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ApprovalCard } from "./approval-card";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import type { ApprovalRequest } from "@/types";

async function executeApprovedTool(approvalId: string) {
  const response = await fetch("/api/agents/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvalId, confirmed: true }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "L'action n'a pas pu être exécutée.");
}

async function resolveApproval(approvalId: string, decision: "approved" | "rejected") {
  const response = await fetch("/api/approvals/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvalId, decision }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "La décision n'a pas pu être enregistrée.");
}

export function ApprovalsPage() {
  const { approvals, hydrateFromDatabase } = useAppStore();
  const [filter, setFilter] = useState("pending");
  const [busyId, setBusyId] = useState<string>();
  const visible = useMemo(() => approvals.filter((item) => filter === "all" || item.status === filter), [approvals, filter]);

  const persistResolution = async (approval: ApprovalRequest, status: "approved" | "rejected", skipConfirmation = false) => {
    if (status === "approved" && approval.toolCall) {
      if (!skipConfirmation && !window.confirm(`Autoriser puis exécuter réellement « ${approval.action} » ?`)) return;
      await executeApprovedTool(approval.id);
    } else {
      await resolveApproval(approval.id, status);
    }
  };

  const resolve = async (approval: ApprovalRequest, status: "approved" | "rejected") => {
    setBusyId(approval.id);
    try {
      await persistResolution(approval, status);
      await hydrateFromDatabase();
      toast.success(status === "approved" ? approval.toolCall ? "Action autorisée et exécutée" : "Action autorisée" : "Action refusée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Validation impossible");
    } finally {
      setBusyId(undefined);
    }
  };

  const approveLowRisk = async () => {
    const candidates = approvals.filter((item) => item.status === "pending" && item.risk === "low");
    if (!candidates.length) { toast.info("Aucune action à faible risque en attente."); return; }
    if (!window.confirm(`Autoriser et exécuter ${candidates.length} action(s) à faible risque ?`)) return;
    setBusyId("batch");
    try {
      for (const approval of candidates) await persistResolution(approval, "approved", true);
      await hydrateFromDatabase();
      toast.success(`${candidates.length} action(s) traitée(s)`);
    } catch (error) {
      await hydrateFromDatabase();
      toast.error(error instanceof Error ? error.message : "Validation groupée interrompue");
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Contrôle humain" title="Centre de validations" description="Examinez chaque action externe avant son exécution réelle par Gmail, Calendar ou Drive." actions={<Button variant="outline" disabled={Boolean(busyId)} onClick={() => void approveLowRisk()}>{busyId === "batch" ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}Autoriser les faibles risques</Button>} />
      <div className="flex flex-wrap items-center gap-2">{[
        { key: "pending", label: "En attente", count: approvals.filter((item) => item.status === "pending").length },
        { key: "approved", label: "Autorisées", count: approvals.filter((item) => item.status === "approved").length },
        { key: "rejected", label: "Refusées", count: approvals.filter((item) => item.status === "rejected").length },
        { key: "all", label: "Toutes", count: approvals.length },
      ].map((item) => <Button key={item.key} variant={filter === item.key ? "secondary" : "ghost"} size="sm" onClick={() => setFilter(item.key)}>{item.label}<Badge className="ml-1 bg-card text-muted-foreground">{item.count}</Badge></Button>)}</div>
      <div className="space-y-4">{visible.length ? visible.map((approval) => <ApprovalCard key={approval.id} approval={approval} busy={busyId === approval.id || busyId === "batch"} onResolve={(status) => resolve(approval, status)} />) : <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed text-center"><ShieldCheck className="size-8 text-emerald-500" /><h2 className="mt-4 font-medium">Aucune validation dans cette vue</h2><p className="mt-1 text-sm text-muted-foreground">Les nouvelles demandes d’outils apparaîtront ici.</p></div>}</div>
    </div>
  );
}
