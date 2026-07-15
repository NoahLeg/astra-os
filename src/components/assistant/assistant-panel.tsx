"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUp, CheckCircle2, LoaderCircle, Sparkles, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { assistantService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { AssistantMessage } from "@/types";

const initialMessages: AssistantMessage[] = [{ id: "welcome", role: "assistant", type: "text", content: "Bonjour. Je suis le Coordinateur Astra. Décrivez un objectif, demandez une analyse ou préparez une tâche pour un agent.", timestamp: "Maintenant" }];

export function AssistantPanel() {
  const { assistantOpen, setAssistantOpen } = useAppStore();
  const [messages, setMessages] = useState(initialMessages);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [model, setModel] = useState("OpenAI");
  const send = async () => {
    if (!value.trim() || pending) return;
    const content = value.trim();
    setValue("");
    setPending(true);
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", type: "text", content, timestamp: "Maintenant" }]);
    try {
      const response = await assistantService.send(content);
      setModel(response.model);
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", type: content.toLowerCase().includes("plan") ? "plan" : "text", content: response.content, timestamp: "Maintenant" }]);
    } catch (error) {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", type: "error", content: error instanceof Error ? error.message : "Le Coordinateur est indisponible.", timestamp: "Maintenant" }]);
    } finally {
      setPending(false);
    }
  };
  return <><div className={cn("fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm transition-opacity", assistantOpen ? "opacity-100" : "pointer-events-none opacity-0")} onClick={() => setAssistantOpen(false)} /><aside className={cn("fixed inset-y-0 right-0 z-[70] flex w-full max-w-[440px] flex-col border-l bg-card shadow-2xl transition-transform duration-300", assistantOpen ? "translate-x-0" : "translate-x-full")} aria-label="Assistant Coordinateur"><div className="flex h-16 items-center gap-3 border-b px-5"><span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white"><Sparkles className="size-4" /></span><div className="flex-1"><p className="text-sm font-semibold">Coordinateur</p><p className="flex items-center gap-1.5 text-[11px] text-emerald-500"><span className="size-1.5 rounded-full bg-emerald-500" />Disponible · {model}</p></div><Button variant="ghost" size="icon" onClick={() => setAssistantOpen(false)} aria-label="Fermer"><X className="size-4" /></Button></div><div className="scrollbar-none flex-1 space-y-4 overflow-y-auto p-5">{messages.map((message) => <div key={message.id} className={cn("max-w-[92%]", message.role === "user" && "ml-auto")}><div className={cn("rounded-2xl p-4 text-sm leading-6", message.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : message.type === "error" ? "rounded-bl-md border border-rose-500/30 bg-rose-500/5 text-rose-500" : "rounded-bl-md border bg-background")}>{message.type === "plan" && <div className="mb-2 flex items-center gap-2 font-medium text-indigo-500"><Zap className="size-4" />Plan proposé</div>}{message.type === "warning" && <AlertTriangle className="mb-2 size-4 text-amber-500" />}<p className="whitespace-pre-wrap">{message.content}</p></div><p className="mt-1 px-1 text-[10px] text-muted-foreground">{message.timestamp}</p></div>)}{pending && <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Le Coordinateur interroge OpenAI…</div>}</div><div className="border-t p-4"><div className="relative"><Textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Demandez une action, un plan ou une analyse…" className="min-h-24 pr-12" /><Button size="icon" className="absolute bottom-2 right-2 size-8" onClick={() => void send()} disabled={pending} aria-label="Envoyer"><ArrowUp className="size-4" /></Button></div><p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><CheckCircle2 className="size-3 text-emerald-500" />Les actions sensibles demanderont toujours votre validation.</p></div></aside></>;
}
