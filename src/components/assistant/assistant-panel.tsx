"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUp, CheckCircle2, LoaderCircle, X, Zap } from "lucide-react";
import { AstraMark } from "@/components/shared/astra-mark";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { assistantService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { AssistantMessage, ChatbotMessage } from "@/types";

const initialMessages: AssistantMessage[] = [{
  id: "welcome",
  role: "assistant",
  type: "text",
  content: "Bonjour. Je suis le Coordinateur Astra. Décrivez un objectif, demandez une analyse ou préparez une tâche pour un agent.",
  timestamp: "Maintenant",
}];

export function AssistantPanel() {
  const { assistantOpen, setAssistantOpen } = useAppStore();
  const [messages, setMessages] = useState(initialMessages);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [model, setModel] = useState("OpenAI");
  const [conversationId, setConversationId] = useState<string>();

  useEffect(() => {
    void assistantService.load().then((data) => {
      setConversationId(data.conversation.id);
      setModel(data.chatbot.model);
      if (data.messages.length) setMessages(data.messages.map((message: ChatbotMessage) => ({
        id: message.id,
        role: message.role,
        type: message.status === "failed" ? "error" : "text",
        content: message.content,
        timestamp: new Date(message.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }),
        usage: message.usage,
      })));
    }).catch(() => undefined);
  }, []);

  const send = async () => {
    if (!value.trim() || pending) return;
    const content = value.trim();
    setValue("");
    setPending(true);
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", type: "text", content, timestamp: "Maintenant" }]);

    try {
      const response = await assistantService.send(content, conversationId);
      setConversationId(response.conversation.id);
      setModel(response.model);
      setMessages((items) => [...items, {
        id: crypto.randomUUID(),
        role: "assistant",
        type: content.toLowerCase().includes("plan") ? "plan" : "text",
        content: response.content,
        timestamp: "Maintenant",
        usage: response.usage,
      }]);
    } catch (error) {
      setMessages((items) => [...items, {
        id: crypto.randomUUID(),
        role: "assistant",
        type: "error",
        content: error instanceof Error ? error.message : "Le Coordinateur est indisponible.",
        timestamp: "Maintenant",
      }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div
        className={cn("fixed inset-0 z-[60] bg-[#06070F]/55 backdrop-blur-sm transition-opacity", assistantOpen ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={() => setAssistantOpen(false)}
      />
      <aside
        className={cn("fixed inset-y-0 right-0 z-[70] flex w-full max-w-[440px] flex-col border-l bg-card shadow-[0_0_80px_-24px_rgba(5,6,20,.7)] transition-transform duration-300", assistantOpen ? "translate-x-0" : "translate-x-full")}
        aria-label="Assistant Coordinateur"
      >
        <div className="astra-space-panel flex h-[76px] shrink-0 items-center gap-3 rounded-none border-0 border-b px-5 shadow-none">
          <div className="astra-star-field" />
          <AstraMark className="relative size-9" />
          <div className="relative flex-1">
            <p className="font-display text-sm font-semibold text-white">Coordinateur Astra</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.08em] text-[#AFB2DE]">
              <span className="size-1.5 rounded-full bg-[#FF4FA3] shadow-[0_0_9px_rgba(255,79,163,.7)]" />
              Disponible · {model}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setAssistantOpen(false)} aria-label="Fermer" className="relative text-white hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </Button>
        </div>

        <div className="app-canvas scrollbar-none flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((message) => (
            <div key={message.id} className={cn("max-w-[92%]", message.role === "user" && "ml-auto")}>
              <div className={cn(
                "rounded-[10px] p-4 text-sm leading-6 shadow-sm",
                message.role === "user"
                  ? "rounded-br-[3px] bg-primary text-primary-foreground"
                  : message.type === "error"
                    ? "rounded-bl-[3px] border border-rose-500/30 bg-rose-500/5 text-rose-500"
                    : "rounded-bl-[3px] border bg-card",
              )}>
                {message.type === "plan" ? (
                  <div className="mb-2 flex items-center gap-2 font-display font-semibold text-primary"><Zap className="size-4" />Plan proposé</div>
                ) : null}
                {message.type === "warning" ? <AlertTriangle className="mb-2 size-4 text-amber-500" /> : null}
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.usage ? <p className="mt-3 border-t pt-2 font-mono text-[9px] uppercase tracking-[.06em] opacity-70">{message.usage.inputTokens.toLocaleString("fr-FR")} entrée · {message.usage.outputTokens.toLocaleString("fr-FR")} sortie · {message.usage.totalTokens.toLocaleString("fr-FR")} tokens{message.usage.pricingStatus === "exact" && message.usage.totalCostNanoUsd !== undefined ? ` · ${(message.usage.totalCostNanoUsd / 1_000_000_000).toLocaleString("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 6 })}` : ""}</p> : null}
              </div>
              <p className="mt-1 px-1 font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">{message.timestamp}</p>
            </div>
          ))}
          {pending ? (
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" />Le Coordinateur interroge OpenAI…
            </div>
          ) : null}
        </div>

        <div className="border-t bg-card p-4">
          <div className="relative">
            <Textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="Demandez une action, un plan ou une analyse…"
              className="min-h-24 pr-12"
            />
            <Button size="icon" className="absolute bottom-2 right-2 size-8" onClick={() => void send()} disabled={pending} aria-label="Envoyer">
              <ArrowUp className="size-4" />
            </Button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.05em] text-muted-foreground">
            <CheckCircle2 className="size-3 text-emerald-500" />Les actions sensibles demandent toujours votre validation.
          </p>
        </div>
      </aside>
    </>
  );
}
