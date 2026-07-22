"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LiquidGlass } from "@dpawlikowski/liquid-glass/react";
import { AlertTriangle, ArrowUp, CheckCircle2, LoaderCircle, Sparkles, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { assistantService } from "@/services";
import { useAppStore } from "@/stores/app-store";
import type { AssistantMessage, ChatbotMessage } from "@/types";

const     initialMessages: AssistantMessage[] = [{
  id: "welcome",
  role: "assistant",
  type: "text",
  content: "Bonjour. Décrivez un objectif, demandez une analyse ou préparez une tâche pour un agent.",
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
        <LiquidGlass intensity="vivid" className="flex h-[76px] shrink-0 items-center gap-3 border-b border-border/60 px-5" style={{ "--lg-tint": "110 66 217", "--lg-opacity": "0.25", "--lg-blur": "14px", "--lg-saturate": "160%", "--lg-radius": "0", "--lg-border-opacity": "0.15" } as unknown as React.CSSProperties}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary"><Sparkles className="size-5" /></span>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold text-foreground">Assistant</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Disponible · {model}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setAssistantOpen(false)} aria-label="Fermer">
            <X className="size-4" />
          </Button>
        </LiquidGlass>

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
                <div className="markdown-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ children }) => (
                        <div className="my-3 overflow-x-auto rounded-xl border border-border/70">
                          <table className="w-full text-sm">{children}</table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="border-b border-border/70 bg-muted/50">{children}</thead>
                      ),
                      th: ({ children }) => (
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</th>
                      ),
                      td: ({ children }) => (
                        <td className="border-t border-border/50 px-4 py-2.5 text-sm">{children}</td>
                      ),
                      code: ({ className, children, ...props }) => {
                        const isInline = !className;
                        if (isInline) {
                          return <code className="rounded-md bg-muted/70 px-1.5 py-0.5 text-xs font-mono text-foreground" {...props}>{children}</code>;
                        }
                        return (
                          <div className="my-3 overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-4">
                            <code className="text-xs font-mono leading-6" {...props}>{children}</code>
                          </div>
                        );
                      },
                      pre: ({ children }) => <>{children}</>,
                      p: ({ children }) => <p className="whitespace-pre-wrap break-words last:mb-0 [&:not(:first-child)]:mt-3">{children}</p>,
                      ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
                      ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
                      li: ({ children }) => <li className="text-sm leading-6">{children}</li>,
                      h1: ({ children }) => <h1 className="mb-2 mt-4 text-lg font-semibold">{children}</h1>,
                      h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-semibold">{children}</h2>,
                      h3: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold">{children}</h3>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noreferrer" className="text-cyan-600 underline decoration-cyan-600/30 underline-offset-2 hover:decoration-cyan-600">{children}</a>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="my-3 border-l-2 border-primary/30 pl-4 text-muted-foreground italic">{children}</blockquote>
                      ),
                      hr: () => <hr className="my-4 border-border/60" />,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
                {message.usage ? <p className="mt-3 border-t pt-2 font-mono text-[9px] uppercase tracking-[.06em] opacity-70">{message.usage.inputTokens.toLocaleString("fr-FR")} entrée · {message.usage.outputTokens.toLocaleString("fr-FR")} sortie · {message.usage.totalTokens.toLocaleString("fr-FR")} tokens{message.usage.pricingStatus === "exact" && message.usage.totalCostNanoUsd !== undefined ? ` · ${(message.usage.totalCostNanoUsd / 1_000_000_000).toLocaleString("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 6 })}` : ""}</p> : null}
              </div>
              <p className="mt-1 px-1 font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">{message.timestamp}</p>
            </div>
          ))}
          {pending ? (
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" />L'assistant réfléchit…
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
