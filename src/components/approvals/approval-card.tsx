"use client";

import { Bot, Check, Database, LoaderCircle, RotateCcw, ShieldAlert, Wrench, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfidenceIndicator, RiskBadge } from "@/components/shared/indicators";
import type { ApprovalRequest } from "@/types";

function toolPreview(approval: ApprovalRequest) {
  if (!approval.toolCall) return null;
  if (approval.toolCall.tool === "send_email") {
    return `À : ${approval.toolCall.arguments.to}\nObjet : ${approval.toolCall.arguments.subject}\n\n${approval.toolCall.arguments.body}`;
  }
  if (approval.toolCall.tool === "create_calendar_event") {
    const input = approval.toolCall.arguments;
    return `${input.title}\n${input.startAt} → ${input.endAt}\nParticipants : ${input.attendees.join(", ") || "aucun"}`;
  }
  return `${approval.toolCall.arguments.name} (${approval.toolCall.arguments.mimeType})\n\n${approval.toolCall.arguments.content}`;
}

export function ApprovalCard({
  approval,
  busy,
  onResolve,
}: {
  approval: ApprovalRequest;
  busy?: boolean;
  onResolve: (status: "approved" | "rejected") => void | Promise<void>;
}) {
  const preview = toolPreview(approval);
  return (
    <Card className={approval.status !== "pending" ? "opacity-60" : ""}>
      <CardContent className="p-5">
        <div className="flex flex-col gap-5 xl:flex-row">
          <div className="flex min-w-0 flex-1 gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><ShieldAlert className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{approval.action}</h2>
                {approval.toolCall ? <Badge className="bg-cyan-500/10 text-cyan-500"><Wrench className="size-3" />Action réelle</Badge> : null}
                {approval.status !== "pending" ? <Badge className={approval.status === "approved" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}>{approval.status === "approved" ? "Autorisée" : "Refusée"}</Badge> : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{approval.context}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/40 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Agent</p><p className="mt-1 flex items-center gap-1.5 text-xs font-medium"><Bot className="size-3" />{approval.agent}</p></div>
                <div className="rounded-xl bg-muted/40 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Impact</p><p className="mt-1 text-xs font-medium">{approval.impact}</p></div>
                <div className="rounded-xl bg-muted/40 p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Modèle</p><p className="mt-1 text-xs font-medium">{approval.model}</p></div>
              </div>
              {preview ? <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4"><p className="text-xs font-medium">Prévisualisation de l'action</p><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5 text-muted-foreground">{preview}</pre></div> : null}
              <div className="mt-4 rounded-xl border bg-background p-4"><p className="text-xs font-medium">Pourquoi cette action ?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{approval.explanation}</p><p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground"><Database className="size-3" />Données utilisées : {approval.dataUsed.join(", ")}</p>{approval.executionResult ? <p className="mt-2 text-xs font-medium text-emerald-500">{approval.executionResult}</p> : null}</div>
            </div>
          </div>
          <div className="flex shrink-0 flex-row items-center justify-between gap-4 border-t pt-4 xl:w-52 xl:flex-col xl:items-stretch xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
            <div className="flex items-center justify-between gap-3"><RiskBadge risk={approval.risk} /><ConfidenceIndicator value={approval.confidence} /></div>
            {approval.status === "pending" ? <div className="flex flex-wrap gap-2 xl:mt-auto"><Button className="flex-1" disabled={busy} onClick={() => void onResolve("approved")}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}Autoriser</Button><Button variant="outline" className="flex-1" disabled={busy} onClick={() => void onResolve("rejected")}><X className="size-4" />Refuser</Button></div> : <Button variant="ghost" size="sm" disabled><RotateCcw className="size-3" />Traitée</Button>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
