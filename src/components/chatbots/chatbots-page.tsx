"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, BrainCircuit, LoaderCircle, MessageSquareText, Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/modal";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { openAIModels } from "@/config";
import { chatbotService } from "@/services";
import type { Chatbot, ChatbotConversation, ChatbotKnowledge, ChatbotMessage } from "@/types";

const emptyDraft = { name: "", description: "", model: "gpt-5.4-mini", systemPrompt: "Tu es un assistant expert. Réponds en français avec précision et transparence.", memoryEnabled: true };

export function ChatbotsPage() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [knowledge, setKnowledge] = useState<ChatbotKnowledge[]>([]);
  const [conversations, setConversations] = useState<ChatbotConversation[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatbotMessage[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [createOpen, setCreateOpen] = useState(false);
  const [knowledgeDraft, setKnowledgeDraft] = useState({ title: "", content: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const selected = useMemo(() => chatbots.find((item) => item.id === selectedId), [chatbots, selectedId]);

  const refreshList = async () => {
    const items = await chatbotService.list(); setChatbots(items); setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id);
  };

  useEffect(() => {
    let cancelled = false;
    void chatbotService.list()
      .then((items) => {
        if (cancelled) return;
        setChatbots(items);
        setSelectedId(items[0]?.id);
      })
      .catch((error) => { if (!cancelled) toast.error(error instanceof Error ? error.message : "Chargement impossible"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void chatbotService.detail(selectedId)
      .then(async (data) => {
        const currentConversation = data.conversations[0];
        const history = currentConversation ? await chatbotService.messages(selectedId, currentConversation.id) : [];
        return { ...data, currentConversation, history };
      })
      .then((data) => {
        if (cancelled) return;
        setKnowledge(data.knowledge);
        setConversations(data.conversations);
        setConversationId(data.currentConversation?.id);
        setMessages(data.history);
      })
      .catch((error) => { if (!cancelled) toast.error(error instanceof Error ? error.message : "Détail indisponible"); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const create = async () => { setBusy("create"); try { const chatbot = await chatbotService.create(draft); setChatbots((items) => [chatbot, ...items]); setSelectedId(chatbot.id); setCreateOpen(false); setDraft(emptyDraft); toast.success("Chatbot créé"); } catch (error) { toast.error(error instanceof Error ? error.message : "Création impossible"); } finally { setBusy(undefined); } };
  const save = async () => { if (!selected) return; setBusy("save"); try { const updated = await chatbotService.update(selected.id, { name: selected.name, description: selected.description, model: selected.model, systemPrompt: selected.systemPrompt, memoryEnabled: selected.memoryEnabled, status: selected.status }); setChatbots((items) => items.map((item) => item.id === updated.id ? updated : item)); toast.success("Configuration enregistrée"); } catch (error) { toast.error(error instanceof Error ? error.message : "Enregistrement impossible"); } finally { setBusy(undefined); } };
  const remove = async () => { if (!selected || !window.confirm(`Supprimer définitivement « ${selected.name} » et son historique ?`)) return; setBusy("delete"); try { await chatbotService.delete(selected.id); await refreshList(); toast.success("Chatbot supprimé"); } catch (error) { toast.error(error instanceof Error ? error.message : "Suppression impossible"); } finally { setBusy(undefined); } };
  const addKnowledge = async () => { if (!selected || !knowledgeDraft.title.trim() || !knowledgeDraft.content.trim()) return; setBusy("knowledge"); try { const item = await chatbotService.addKnowledge(selected.id, knowledgeDraft); setKnowledge((items) => [item, ...items]); setKnowledgeDraft({ title: "", content: "" }); toast.success("Connaissance ajoutée"); } catch (error) { toast.error(error instanceof Error ? error.message : "Ajout impossible"); } finally { setBusy(undefined); } };
  const removeKnowledge = async (id: string) => { if (!selected) return; try { await chatbotService.deleteKnowledge(selected.id, id); setKnowledge((items) => items.filter((item) => item.id !== id)); } catch (error) { toast.error(error instanceof Error ? error.message : "Suppression impossible"); } };
  const newConversation = async () => {
    if (!selected || busy) return;
    setBusy("conversation");
    try {
      const conversation = await chatbotService.createConversation(selected.id);
      setConversations((items) => [conversation, ...items]);
      setConversationId(conversation.id);
      setMessages([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible");
    } finally {
      setBusy(undefined);
    }
  };
  const switchConversation = async (id: string) => {
    if (!id) { await newConversation(); return; }
    if (!selected || busy) return;
    setBusy("conversation");
    try {
      const history = await chatbotService.messages(selected.id, id);
      setConversationId(id);
      setMessages(history);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Historique indisponible");
    } finally {
      setBusy(undefined);
    }
  };
  const send = async () => {
    if (!selected || !message.trim() || busy === "send") return;
    const content = message.trim();
    const currentConversationId = conversationId;
    setMessage("");
    setBusy("send");
    const optimistic: ChatbotMessage = { id: crypto.randomUUID(), conversationId: currentConversationId ?? "pending", role: "user", content, status: "completed", createdAt: new Date().toISOString() };
    setMessages((items) => [...items, optimistic]);
    try {
      const result = await chatbotService.send(selected.id, content, currentConversationId);
      setConversationId(result.conversation.id);
      setMessages((items) => [...items, result.message]);
      setConversations((items) => items.some((item) => item.id === result.conversation.id)
        ? items.map((item) => item.id === result.conversation.id ? result.conversation : item)
        : [result.conversation, ...items]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Réponse impossible";
      setMessages((items) => [...items, { id: crypto.randomUUID(), conversationId: currentConversationId ?? "pending", role: "assistant", content: errorMessage, status: "failed", errorMessage, createdAt: new Date().toISOString() }]);
      toast.error(errorMessage);
    } finally {
      setBusy(undefined);
    }
  };

  if (loading) return <div className="flex min-h-80 items-center justify-center"><LoaderCircle className="size-8 animate-spin text-primary" /></div>;
  return <div className="space-y-7">
    <PageHeader eyebrow="Assistants spécialisés" title="Chatbots personnalisés" description="Créez des assistants persistants avec leur propre modèle, prompt système, historique et base de connaissances." actions={<Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />Nouveau chatbot</Button>} />
    <div className="grid min-h-[680px] gap-4 xl:grid-cols-[260px_1fr_360px]">
      <Card><CardHeader><CardTitle className="text-sm">Vos chatbots</CardTitle></CardHeader><CardContent className="space-y-2">{chatbots.length ? chatbots.map((chatbot) => <button key={chatbot.id} onClick={() => setSelectedId(chatbot.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === chatbot.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}><div className="flex items-center gap-2"><Bot className="size-4 text-primary" /><span className="truncate text-sm font-medium">{chatbot.name}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{chatbot.model}</p></button>) : <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">Créez votre premier assistant.</p>}</CardContent></Card>
      <Card className="flex min-h-[520px] flex-col"><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="flex items-center gap-2"><MessageSquareText className="size-5 text-primary" />Conversation</CardTitle><p className="mt-1 text-xs text-muted-foreground">Historique conservé après redémarrage</p></div>{selected ? <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void newConversation()}><Plus className="size-3" />Nouvelle</Button> : null}</CardHeader><CardContent className="flex flex-1 flex-col gap-4">{selected ? <><select value={conversationId ?? ""} disabled={Boolean(busy)} onChange={(event) => void switchConversation(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="">Nouvelle conversation</option>{conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}</select><div className="flex-1 space-y-3 overflow-y-auto rounded-xl border bg-muted/10 p-4">{messages.length ? messages.map((item) => <div key={item.id} className={`max-w-[88%] rounded-xl p-3 text-sm leading-6 ${item.role === "user" ? "ml-auto bg-primary text-primary-foreground" : item.status === "failed" ? "border border-rose-500/30 bg-rose-500/5" : "border bg-card"}`}><p className="whitespace-pre-wrap">{item.content}</p>{item.usage ? <p className="mt-2 font-mono text-[9px] opacity-70">{item.usage.totalTokens.toLocaleString("fr-FR")} tokens{item.usage.pricingStatus === "exact" && item.usage.totalCostNanoUsd !== undefined ? ` · ${(item.usage.totalCostNanoUsd / 1_000_000_000).toLocaleString("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 6 })}` : ""}</p> : null}</div>) : <div className="flex h-full min-h-60 items-center justify-center text-center text-sm text-muted-foreground">Posez une première question à {selected.name}.</div>}</div><div className="flex gap-2"><Textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Votre message…" className="min-h-20" /><Button size="icon" className="mt-auto" disabled={busy === "send"} onClick={() => void send()}>{busy === "send" ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}</Button></div></> : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Sélectionnez ou créez un chatbot.</div>}</CardContent></Card>
      <div className="space-y-4">{selected ? <><Card><CardHeader><CardTitle className="text-sm">Configuration</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={selected.name} onChange={(event) => setChatbots((items) => items.map((item) => item.id === selected.id ? { ...item, name: event.target.value } : item))} aria-label="Nom" /><Input value={selected.description} onChange={(event) => setChatbots((items) => items.map((item) => item.id === selected.id ? { ...item, description: event.target.value } : item))} aria-label="Description" /><select value={selected.model} onChange={(event) => setChatbots((items) => items.map((item) => item.id === selected.id ? { ...item, model: event.target.value } : item))} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">{openAIModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select><Textarea value={selected.systemPrompt} onChange={(event) => setChatbots((items) => items.map((item) => item.id === selected.id ? { ...item, systemPrompt: event.target.value } : item))} className="min-h-28" aria-label="Prompt système" /><label className="flex items-center justify-between text-sm"><span>Mémoire entreprise</span><input type="checkbox" checked={selected.memoryEnabled} onChange={(event) => setChatbots((items) => items.map((item) => item.id === selected.id ? { ...item, memoryEnabled: event.target.checked } : item))} /></label><div className="flex gap-2"><Button className="flex-1" onClick={() => void save()} disabled={busy === "save"}><Save className="size-4" />Enregistrer</Button><Button variant="outline" size="icon" onClick={() => void remove()} aria-label="Supprimer"><Trash2 className="size-4 text-rose-500" /></Button></div></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><BrainCircuit className="size-4 text-cyan-500" />Connaissances <Badge>{knowledge.length}</Badge></CardTitle></CardHeader><CardContent className="space-y-3"><Input placeholder="Titre" value={knowledgeDraft.title} onChange={(event) => setKnowledgeDraft((value) => ({ ...value, title: event.target.value }))} /><Textarea placeholder="Information, procédure ou référence…" value={knowledgeDraft.content} onChange={(event) => setKnowledgeDraft((value) => ({ ...value, content: event.target.value }))} /><Button variant="outline" className="w-full" onClick={() => void addKnowledge()} disabled={busy === "knowledge"}><Plus className="size-4" />Ajouter</Button><div className="max-h-48 space-y-2 overflow-y-auto">{knowledge.map((item) => <div key={item.id} className="flex gap-2 rounded-lg border p-2"><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{item.title}</p><p className="line-clamp-2 text-[11px] text-muted-foreground">{item.content}</p></div><button onClick={() => void removeKnowledge(item.id)} aria-label={`Supprimer ${item.title}`}><Trash2 className="size-3 text-muted-foreground" /></button></div>)}</div></CardContent></Card></> : null}</div>
    </div>
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Créer un chatbot" description="Le prompt et les connaissances restent isolés dans votre entreprise."><div className="space-y-4"><Input placeholder="Nom" value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /><Input placeholder="Description" value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /><select value={draft.model} onChange={(event) => setDraft((value) => ({ ...value, model: event.target.value }))} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">{openAIModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select><Textarea value={draft.systemPrompt} onChange={(event) => setDraft((value) => ({ ...value, systemPrompt: event.target.value }))} className="min-h-32" /><Button className="w-full" disabled={busy === "create" || draft.name.trim().length < 2} onClick={() => void create()}>{busy === "create" ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Créer</Button></div></Modal>
  </div>;
}
