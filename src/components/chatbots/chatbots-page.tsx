"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, BrainCircuit, ExternalLink, FileText, Globe2, LoaderCircle, MessageSquareText, Paperclip, Plus, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/modal";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { openAIModels as fallbackOpenAIModels } from "@/config";
import { chatbotService } from "@/services";
import type { Chatbot, ChatbotConversation, ChatbotKnowledge, ChatbotMessage, ContextFile } from "@/types";

const emptyDraft = {
  name: "",
  description: "",
  model: "gpt-5.4-mini",
  systemPrompt: "Tu es un assistant expert. Réponds en français avec précision et transparence.",
  memoryEnabled: true,
  learningEnabled: true,
  globalLearningEnabled: false,
  webEnabled: false,
};

export function ChatbotsPage() {
  const [openAIModels, setOpenAIModels] = useState<Array<{ id: string; name: string; description?: string; provider?: string }>>([...fallbackOpenAIModels]);
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [knowledge, setKnowledge] = useState<ChatbotKnowledge[]>([]);
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [fileScope, setFileScope] = useState<ContextFile["scope"]>("chatbot");
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
    const items = await chatbotService.list();
    setChatbots(items);
    setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id);
  };

  useEffect(() => {
    let cancelled = false;
    void chatbotService.list()
      .then((items) => {
        if (!cancelled) {
          setChatbots(items);
          setSelectedId(items[0]?.id);
        }
      })
      .catch((error) => { if (!cancelled) toast.error(error instanceof Error ? error.message : "Chargement impossible"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void chatbotService.availableModels().then(setOpenAIModels).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void chatbotService.detail(selectedId)
      .then(async (data) => {
        const currentConversation = data.conversations[0];
        const [history, files] = await Promise.all([
          currentConversation ? chatbotService.messages(selectedId, currentConversation.id) : [],
          chatbotService.files(selectedId),
        ]);
        return { ...data, currentConversation, history, files };
      })
      .then((data) => {
        if (cancelled) return;
        setKnowledge(data.knowledge);
        setContextFiles(data.files);
        setConversations(data.conversations);
        setConversationId(data.currentConversation?.id);
        setMessages(data.history);
      })
      .catch((error) => { if (!cancelled) toast.error(error instanceof Error ? error.message : "Détail indisponible"); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const updateSelected = <Key extends keyof Chatbot>(key: Key, value: Chatbot[Key]) => {
    if (!selected) return;
    setChatbots((items) => items.map((item) => item.id === selected.id ? { ...item, [key]: value } : item));
  };

  const create = async () => {
    setBusy("create");
    try {
      const chatbot = await chatbotService.create(draft);
      setChatbots((items) => [chatbot, ...items]);
      setSelectedId(chatbot.id);
      setCreateOpen(false);
      setDraft(emptyDraft);
      toast.success("Chatbot créé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible");
    } finally {
      setBusy(undefined);
    }
  };

  const save = async () => {
    if (!selected) return;
    setBusy("save");
    try {
      const updated = await chatbotService.update(selected.id, {
        name: selected.name,
        description: selected.description,
        model: selected.model,
        systemPrompt: selected.systemPrompt,
        memoryEnabled: selected.memoryEnabled,
        learningEnabled: selected.learningEnabled,
        globalLearningEnabled: selected.globalLearningEnabled,
        webEnabled: selected.webEnabled,
        status: selected.status,
      });
      setChatbots((items) => items.map((item) => item.id === updated.id ? updated : item));
      toast.success("Configuration enregistrée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm(`Supprimer définitivement « ${selected.name} » et son historique ?`)) return;
    setBusy("delete");
    try {
      await chatbotService.delete(selected.id);
      await refreshList();
      toast.success("Chatbot supprimé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setBusy(undefined);
    }
  };

  const addKnowledge = async () => {
    if (!selected || !knowledgeDraft.title.trim() || !knowledgeDraft.content.trim()) return;
    setBusy("knowledge");
    try {
      const item = await chatbotService.addKnowledge(selected.id, knowledgeDraft);
      setKnowledge((items) => [item, ...items]);
      setKnowledgeDraft({ title: "", content: "" });
      toast.success("Connaissance ajoutée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ajout impossible");
    } finally {
      setBusy(undefined);
    }
  };

  const toggleKnowledge = async (item: ChatbotKnowledge) => {
    if (!selected) return;
    try {
      const updated = await chatbotService.updateKnowledge(selected.id, item.id, !item.blocked);
      setKnowledge((items) => items.map((knowledgeItem) => knowledgeItem.id === updated.id ? updated : knowledgeItem));
      toast.success(updated.blocked ? "Connaissance suspendue" : "Connaissance autorisée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Modification impossible");
    }
  };

  const removeKnowledge = async (id: string) => {
    if (!selected) return;
    try {
      await chatbotService.deleteKnowledge(selected.id, id);
      setKnowledge((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  const uploadContextFile = async (file?: File) => {
    if (!selected || !file) return;
    setBusy("file");
    try {
      const created = await chatbotService.uploadFile(selected.id, file, fileScope);
      setContextFiles((items) => [created, ...items]);
      toast.success(fileScope === "workspace" ? "Fichier partagé avec l’entreprise" : "Fichier ajouté au chatbot");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible");
    } finally {
      setBusy(undefined);
    }
  };

  const removeContextFile = async (file: ContextFile) => {
    if (!selected || !window.confirm(`Supprimer « ${file.name} » du contexte ?`)) return;
    try {
      await chatbotService.deleteFile(selected.id, file.id);
      setContextFiles((items) => items.filter((item) => item.id !== file.id));
      toast.success("Fichier supprimé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

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
    if (!id) return void newConversation();
    if (!selected || busy) return;
    setBusy("conversation");
    try {
      setMessages(await chatbotService.messages(selected.id, id));
      setConversationId(id);
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
    setMessages((items) => [...items, { id: crypto.randomUUID(), conversationId: currentConversationId ?? "pending", role: "user", content, status: "completed", createdAt: new Date().toISOString() }]);
    try {
      const result = await chatbotService.send(selected.id, content, currentConversationId);
      setConversationId(result.conversation.id);
      setMessages((items) => [...items, result.message]);
      setConversations((items) => items.some((item) => item.id === result.conversation.id)
        ? items.map((item) => item.id === result.conversation.id ? result.conversation : item)
        : [result.conversation, ...items]);
      if (result.learningScheduled) toast.message("Le contexte sera enrichi en arrière-plan.");
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
    <PageHeader eyebrow="Assistants spécialisés" title="Chatbots personnalisés" description="Créez des assistants persistants qui peuvent apprendre de vos échanges et consulter le web sous votre contrôle." actions={<Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />Nouveau chatbot</Button>} />
    <div className="grid min-h-[680px] gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      <Card><CardHeader><CardTitle className="text-sm">Vos chatbots</CardTitle></CardHeader><CardContent className="space-y-2">{chatbots.length ? chatbots.map((chatbot) => <button key={chatbot.id} onClick={() => setSelectedId(chatbot.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === chatbot.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}><div className="flex items-center gap-2"><Bot className="size-4 text-primary" /><span className="truncate text-sm font-medium">{chatbot.name}</span></div><div className="mt-2 flex gap-1">{chatbot.memoryEnabled && <Badge className="text-[9px]">Contexte</Badge>}{chatbot.webEnabled && <Badge className="bg-cyan-500/10 text-[9px] text-cyan-500">Web</Badge>}</div></button>) : <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">Créez votre premier assistant.</p>}</CardContent></Card>
      <Card className="flex min-h-[520px] min-w-0 flex-col"><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="flex items-center gap-2"><MessageSquareText className="size-5 text-primary" />Conversation</CardTitle><p className="mt-1 text-xs text-muted-foreground">Historique et sources conservés</p></div>{selected && <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void newConversation()}><Plus className="size-3" />Nouvelle</Button>}</CardHeader><CardContent className="flex flex-1 flex-col gap-4">{selected ? <><select value={conversationId ?? ""} disabled={Boolean(busy)} onChange={(event) => void switchConversation(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="">Nouvelle conversation</option>{conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}</select><div className="flex-1 space-y-3 overflow-y-auto rounded-xl border bg-muted/10 p-3 sm:p-4">{messages.length ? messages.map((item) => <div key={item.id} className={`max-w-[92%] rounded-xl p-3 text-sm leading-6 sm:max-w-[88%] ${item.role === "user" ? "ml-auto bg-primary text-primary-foreground" : item.status === "failed" ? "border border-rose-500/30 bg-rose-500/5" : "border bg-card"}`}><p className="whitespace-pre-wrap break-words">{item.content}</p>{item.citations?.length ? <div className="mt-3 flex flex-wrap gap-2">{item.citations.map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-lg border bg-background px-2 py-1 text-[10px] text-cyan-600 hover:border-cyan-500"><ExternalLink className="size-3 shrink-0" /><span className="truncate">{citation.title}</span></a>)}</div> : null}{item.usage ? <p className="mt-2 font-mono text-[9px] opacity-70">{item.usage.totalTokens.toLocaleString("fr-FR")} tokens{item.usage.pricingStatus === "exact" && item.usage.totalCostNanoUsd !== undefined ? ` · ${(item.usage.totalCostNanoUsd / 1_000_000_000).toLocaleString("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 6 })}` : ""}</p> : null}</div>) : <div className="flex h-full min-h-60 items-center justify-center text-center text-sm text-muted-foreground">Posez une première question à {selected.name}.</div>}</div><div className="flex gap-2"><Textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Votre message…" className="min-h-20" /><Button size="icon" className="mt-auto shrink-0" disabled={busy === "send"} onClick={() => void send()}>{busy === "send" ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}</Button></div></> : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Sélectionnez ou créez un chatbot.</div>}</CardContent></Card>
      <div className="space-y-4">{selected && <><Card><CardHeader><CardTitle className="text-sm">Configuration</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={selected.name} onChange={(event) => updateSelected("name", event.target.value)} aria-label="Nom" /><Input value={selected.description} onChange={(event) => updateSelected("description", event.target.value)} aria-label="Description" /><select value={selected.model} onChange={(event) => updateSelected("model", event.target.value)} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">{openAIModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select><Textarea value={selected.systemPrompt} onChange={(event) => updateSelected("systemPrompt", event.target.value)} className="min-h-28" aria-label="Prompt système" /><CapabilityToggle icon={<BrainCircuit className="size-4 text-violet-500" />} title="Utiliser le contexte" description="Injecte la mémoire de l’entreprise et les connaissances de ce chatbot." checked={selected.memoryEnabled} onChange={(checked) => { updateSelected("memoryEnabled", checked); if (!checked) updateSelected("learningEnabled", false); }} /><CapabilityToggle icon={<Sparkles className="size-4 text-amber-500" />} title="Apprendre des échanges" description="Extrait des faits durables pour enrichir les prochaines conversations." checked={selected.learningEnabled} disabled={!selected.memoryEnabled} onChange={(checked) => updateSelected("learningEnabled", checked)} /><CapabilityToggle icon={<Globe2 className="size-4 text-cyan-500" />} title="Accès au web" description="Autorise les recherches internet avec sources cliquables." checked={selected.webEnabled} onChange={(checked) => updateSelected("webEnabled", checked)} /><div className="flex gap-2"><Button className="flex-1" onClick={() => void save()} disabled={busy === "save"}><Save className="size-4" />Enregistrer</Button><Button variant="outline" size="icon" onClick={() => void remove()} aria-label="Supprimer"><Trash2 className="size-4 text-rose-500" /></Button></div></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><BrainCircuit className="size-4 text-cyan-500" />Connaissances <Badge>{knowledge.length}</Badge></CardTitle></CardHeader><CardContent className="space-y-3"><Input placeholder="Titre" value={knowledgeDraft.title} onChange={(event) => setKnowledgeDraft((value) => ({ ...value, title: event.target.value }))} /><Textarea placeholder="Information, procédure ou référence…" value={knowledgeDraft.content} onChange={(event) => setKnowledgeDraft((value) => ({ ...value, content: event.target.value }))} /><Button variant="outline" className="w-full" onClick={() => void addKnowledge()} disabled={busy === "knowledge"}><Plus className="size-4" />Ajouter</Button><div className="max-h-64 space-y-2 overflow-y-auto">{knowledge.map((item) => <div key={item.id} className={`rounded-lg border p-2 ${item.blocked ? "border-amber-500/30 bg-amber-500/5" : ""}`}><div className="flex gap-2"><div className="min-w-0 flex-1"><div className="flex items-center gap-1"><p className="truncate text-xs font-medium">{item.title}</p>{item.source === "Apprentissage conversationnel" && <Sparkles className="size-3 text-amber-500" />}</div><p className="line-clamp-2 text-[11px] text-muted-foreground">{item.content}</p></div><button onClick={() => void removeKnowledge(item.id)} aria-label={`Supprimer ${item.title}`}><Trash2 className="size-3 text-muted-foreground" /></button></div><button onClick={() => void toggleKnowledge(item)} className="mt-2 text-[10px] font-medium text-primary">{item.blocked ? "Autoriser cette connaissance" : "Suspendre l’utilisation"}</button></div>)}</div></CardContent></Card></>}</div>
      {selected && <ContextFilesPanel chatbot={selected} files={contextFiles} scope={fileScope} busy={busy === "file"} onScopeChange={setFileScope} onGlobalLearningChange={(checked) => updateSelected("globalLearningEnabled", checked)} onUpload={uploadContextFile} onDelete={removeContextFile} />}
    </div>
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Créer un chatbot" description="Choisissez précisément les données et outils que cet assistant pourra utiliser."><div className="space-y-4"><Input placeholder="Nom" value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /><Input placeholder="Description" value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /><select value={draft.model} onChange={(event) => setDraft((value) => ({ ...value, model: event.target.value }))} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">{openAIModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select><Textarea value={draft.systemPrompt} onChange={(event) => setDraft((value) => ({ ...value, systemPrompt: event.target.value }))} className="min-h-32" /><CapabilityToggle icon={<BrainCircuit className="size-4 text-violet-500" />} title="Utiliser le contexte" description="Le chatbot consulte la mémoire autorisée et ses connaissances." checked={draft.memoryEnabled} onChange={(checked) => setDraft((value) => ({ ...value, memoryEnabled: checked, learningEnabled: checked ? value.learningEnabled : false }))} /><CapabilityToggle icon={<Sparkles className="size-4 text-amber-500" />} title="Faire grandir le contexte" description="Les faits durables des discussions sont mémorisés." checked={draft.learningEnabled} disabled={!draft.memoryEnabled} onChange={(checked) => setDraft((value) => ({ ...value, learningEnabled: checked }))} /><CapabilityToggle icon={<Globe2 className="size-4 text-cyan-500" />} title="Connecter au web" description="Le chatbot peut chercher des informations actuelles sur internet." checked={draft.webEnabled} onChange={(checked) => setDraft((value) => ({ ...value, webEnabled: checked }))} /><Button className="w-full" disabled={busy === "create" || draft.name.trim().length < 2} onClick={() => void create()}>{busy === "create" ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Créer</Button></div></Modal>
  </div>;
}

function CapabilityToggle({ icon, title, description, checked, disabled, onChange }: { icon: React.ReactNode; title: string; description: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className={`flex items-start gap-3 rounded-xl border p-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}><span className="mt-0.5">{icon}</span><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{title}</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{description}</span></span><input type="checkbox" className="mt-1 size-4 accent-primary" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function ContextFilesPanel({ chatbot, files, scope, busy, onScopeChange, onGlobalLearningChange, onUpload, onDelete }: {
  chatbot: Chatbot;
  files: ContextFile[];
  scope: ContextFile["scope"];
  busy: boolean;
  onScopeChange: (scope: ContextFile["scope"]) => void;
  onGlobalLearningChange: (checked: boolean) => void;
  onUpload: (file?: File) => void;
  onDelete: (file: ContextFile) => void;
}) {
  return <Card className="xl:col-start-3">
    <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Paperclip className="size-4 text-violet-500" />Fichiers de contexte <Badge>{files.length}</Badge></CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <CapabilityToggle icon={<Sparkles className="size-4 text-emerald-500" />} title="Enrichir la mémoire globale" description="Les faits durables appris dans le chat deviennent accessibles à l’entreprise." checked={chatbot.globalLearningEnabled} disabled={!chatbot.learningEnabled} onChange={onGlobalLearningChange} />
      <div className="grid grid-cols-2 gap-2">
        <select value={scope} onChange={(event) => onScopeChange(event.target.value as ContextFile["scope"])} className="h-10 rounded-xl border bg-background px-3 text-xs" aria-label="Portée du fichier">
          <option value="chatbot">Ce chatbot</option>
          <option value="workspace">Toute l’entreprise</option>
        </select>
        <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-background px-3 text-xs font-medium hover:bg-muted">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Paperclip className="size-4" />}Importer
          <input type="file" className="sr-only" disabled={busy || !chatbot.memoryEnabled} accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.txt,.md,.json,.html,.xml,.csv,.doc,.docx,.rtf,.odt,.ppt,.pptx,.xls,.xlsx" onChange={(event) => { onUpload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        </label>
      </div>
      <p className="text-[10px] leading-4 text-muted-foreground">Images, PDF, documents et tableurs, 4 Mo maximum. Jusqu’à trois fichiers pertinents sont analysés par réponse.</p>
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {files.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-lg border p-2">
          <FileText className="size-4 shrink-0 text-cyan-500" />
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{file.name}</p><p className="text-[10px] text-muted-foreground">{file.scope === "workspace" ? "Entreprise" : "Chatbot"} · {(file.sizeBytes / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} Ko</p></div>
          <button onClick={() => onDelete(file)} aria-label={`Supprimer ${file.name}`}><Trash2 className="size-3 text-muted-foreground hover:text-rose-500" /></button>
        </div>)}
        {!files.length && <p className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">Aucun fichier de contexte.</p>}
      </div>
    </CardContent>
  </Card>;
}
