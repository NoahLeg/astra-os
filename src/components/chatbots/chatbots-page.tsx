"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LiquidGlass } from "@dpawlikowski/liquid-glass/react";
import {
  Bot,
  BrainCircuit,
  Clock3,
  ExternalLink,
  FileText,
  Globe2,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Plus,
  Save,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/shared/modal";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { openAIModels as fallbackOpenAIModels } from "@/config";
import { chatbotService } from "@/services";
import type {
  Chatbot,
  ChatbotConversation,
  ChatbotKnowledge,
  ChatbotMessage,
  ContextFile,
} from "@/types";

type ChatbotTab = "chat" | "history" | "knowledge" | "files" | "settings";

const emptyDraft = {
  name: "",
  description: "",
  model: "gpt-5.4-mini",
  systemPrompt: "Tu es un assistant expert. Reponds en francais avec precision et transparence.",
  memoryEnabled: true,
  learningEnabled: true,
  globalLearningEnabled: false,
  webEnabled: false,
};

const chatbotTabs: Array<{
  id: ChatbotTab;
  label: string;
  icon: typeof MessageSquareText;
  description: string;
}> = [
  { id: "chat", label: "Discussion", icon: MessageSquareText, description: "Conversation en direct" },
  { id: "history", label: "Conversations", icon: Clock3, description: "Sessions et historique" },
  { id: "knowledge", label: "Connaissances", icon: BrainCircuit, description: "Memoire du bot" },
  { id: "files", label: "Fichiers", icon: Paperclip, description: "Documents et contexte" },
  { id: "settings", label: "Configuration", icon: Settings2, description: "Modele et permissions" },
];

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
  const [tab, setTab] = useState<ChatbotTab>("chat");

  const selected = useMemo(() => chatbots.find((item) => item.id === selectedId), [chatbots, selectedId]);
  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversations, conversationId],
  );

  const refreshList = async () => {
    const items = await chatbotService.list();
    setChatbots(items);
    setSelectedId((current) => (current && items.some((item) => item.id === current) ? current : items[0]?.id));
  };

  useEffect(() => {
    let cancelled = false;
    void chatbotService
      .list()
      .then((items) => {
        if (!cancelled) {
          setChatbots(items);
          setSelectedId(items[0]?.id);
        }
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Chargement impossible");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void chatbotService.availableModels().then(setOpenAIModels).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void chatbotService
      .detail(selectedId)
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
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Detail indisponible");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selected) {
      setTab("chat");
    }
  }, [selected]);

  const updateSelected = <Key extends keyof Chatbot>(key: Key, value: Chatbot[Key]) => {
    if (!selected) return;
    setChatbots((items) => items.map((item) => (item.id === selected.id ? { ...item, [key]: value } : item)));
  };

  const create = async () => {
    setBusy("create");
    try {
      const chatbot = await chatbotService.create(draft);
      setChatbots((items) => [chatbot, ...items]);
      setSelectedId(chatbot.id);
      setTab("chat");
      setCreateOpen(false);
      setDraft(emptyDraft);
      toast.success("Chatbot cree");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation impossible");
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
      setChatbots((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      toast.success("Configuration enregistree");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm(`Supprimer definitivement "${selected.name}" et son historique ?`)) return;
    setBusy("delete");
    try {
      await chatbotService.delete(selected.id);
      await refreshList();
      setTab("chat");
      toast.success("Chatbot supprime");
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
      toast.success("Connaissance ajoutee");
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
      setKnowledge((items) => items.map((knowledgeItem) => (knowledgeItem.id === updated.id ? updated : knowledgeItem)));
      toast.success(updated.blocked ? "Connaissance suspendue" : "Connaissance autorisee");
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
      toast.success(fileScope === "workspace" ? "Fichier partage avec l'entreprise" : "Fichier ajoute au chatbot");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible");
    } finally {
      setBusy(undefined);
    }
  };

  const removeContextFile = async (file: ContextFile) => {
    if (!selected || !window.confirm(`Supprimer "${file.name}" du contexte ?`)) return;
    try {
      await chatbotService.deleteFile(selected.id, file.id);
      setContextFiles((items) => items.filter((item) => item.id !== file.id));
      toast.success("Fichier supprime");
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
      setTab("chat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation impossible");
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
      setTab("chat");
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
    setMessages((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        conversationId: currentConversationId ?? "pending",
        role: "user",
        content,
        status: "completed",
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      const result = await chatbotService.send(selected.id, content, currentConversationId);
      setConversationId(result.conversation.id);
      setMessages((items) => [...items, result.message]);
      setConversations((items) =>
        items.some((item) => item.id === result.conversation.id)
          ? items.map((item) => (item.id === result.conversation.id ? result.conversation : item))
          : [result.conversation, ...items],
      );
      if (result.learningScheduled) toast.message("Le contexte sera enrichi en arriere-plan.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Reponse impossible";
      setMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          conversationId: currentConversationId ?? "pending",
          role: "assistant",
          content: errorMessage,
          status: "failed",
          errorMessage,
          createdAt: new Date().toISOString(),
        },
      ]);
      toast.error(errorMessage);
    } finally {
      setBusy(undefined);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <LoaderCircle className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Chatbots"
        title="Mes chatbots"
        description="Gérez vos assistants conversationnels, leur contexte et leurs conversations."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Nouveau chatbot
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)_minmax(280px,0.8fr)]">
        <LiquidGlass intensity="subtle" className="rounded-[28px] border border-border/60 p-5 sm:p-6" style={{ "--lg-tint": "58 76 224", "--lg-opacity": "0.15", "--lg-blur": "8px", "--lg-radius": "28px", "--lg-border-opacity": "0.1" } as unknown as React.CSSProperties}>
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-background/70 text-primary shadow-sm">
              <WandSparkles className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Chatbot</p>
              <p className="mt-1 text-xs text-muted-foreground">Discutez, enrichissez le contexte et pilotez chaque assistant.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge className="border-border/60 bg-background/50">Chat persistant</Badge>
            <Badge className="border-border/60 bg-background/50">Memoire controlee</Badge>
            <Badge className="border-border/60 bg-background/50">Sources web</Badge>
          </div>
        </LiquidGlass>

        <LiquidGlass intensity="subtle" as="div" className="rounded-[24px] border border-border/60 p-5" style={{ "--lg-tint": "58 76 224", "--lg-opacity": "0.12", "--lg-blur": "8px", "--lg-radius": "24px", "--lg-border-opacity": "0.08" } as unknown as React.CSSProperties}>
          <div className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-medium text-primary">Assistants actifs</div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{chatbots.filter((item) => item.status === "active").length}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Chatbots disponibles dans cet espace</p>
        </LiquidGlass>
        <LiquidGlass intensity="subtle" as="div" className="rounded-[24px] border border-border/60 p-5" style={{ "--lg-tint": "110 66 217", "--lg-opacity": "0.12", "--lg-blur": "8px", "--lg-radius": "24px", "--lg-border-opacity": "0.08" } as unknown as React.CSSProperties}>
          <div className="inline-flex rounded-full border border-violet-500/20 bg-violet-500/5 px-2.5 py-1 text-[10px] font-medium text-violet-500">Conversations</div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{conversations.length}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Sessions sauvegardees pour le chatbot courant</p>
        </LiquidGlass>
      </div>

      <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
        <LiquidGlass intensity="subtle" as="div" className="rounded-[10px] border border-border/60" style={{ "--lg-tint": "15 18 35", "--lg-opacity": "0.25", "--lg-blur": "8px", "--lg-radius": "10px", "--lg-border-opacity": "0.1" } as unknown as React.CSSProperties}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Bibliotheque d'assistants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
              <p className="text-xs font-medium text-foreground">Espace assistants</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                Selectionnez un assistant, ouvrez sa discussion ou ajustez son contexte sans quitter la page.
              </p>
            </div>

            <div className="space-y-2">
              {chatbots.length ? (
                chatbots.map((chatbot) => (
                  <button
                    key={chatbot.id}
                    onClick={() => setSelectedId(chatbot.id)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      selectedId === chatbot.id
                        ? "border-primary/40 bg-primary/10 shadow-sm shadow-primary/10"
                        : "border-border/70 bg-background/40 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 inline-flex size-9 items-center justify-center rounded-xl ${
                          selectedId === chatbot.id ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                        }`}
                      >
                        <Bot className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{chatbot.name}</span>
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                            {chatbot.status}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {chatbot.description || "Assistant configurable pour vos workflows et connaissances metier."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {chatbot.memoryEnabled ? (
                            <Badge className="border-violet-500/20 bg-violet-500/10 text-[10px] text-violet-600">Contexte</Badge>
                          ) : null}
                          {chatbot.learningEnabled ? (
                            <Badge className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-600">Apprend</Badge>
                          ) : null}
                          {chatbot.webEnabled ? <Badge className="bg-cyan-500/10 text-[10px] text-cyan-600">Web</Badge> : null}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
                  Creez votre premier assistant.
                </p>
              )}
            </div>
          </CardContent>
        </LiquidGlass>

        <div className="space-y-4">
          <LiquidGlass intensity="subtle" as="div" className="overflow-hidden rounded-[10px] border border-border/60" style={{ "--lg-tint": "15 18 35", "--lg-opacity": "0.25", "--lg-blur": "10px", "--lg-radius": "10px", "--lg-border-opacity": "0.1" } as unknown as React.CSSProperties}>
            <CardContent className="p-0">
              {selected ? (
                <>
                  <div className="relative border-b border-border/60 px-4 py-4 sm:px-6">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_34%)]" />
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="relative min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Bot className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <h2 className="truncate text-xl font-semibold">{selected.name}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {selected.description || "Assistant specialise et configurable pour vos flux de travail."}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 font-medium text-foreground/80">
                            {selected.model}
                          </span>
                          <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-muted-foreground">
                            {messages.length} message{messages.length > 1 ? "s" : ""}
                          </span>
                          {selected.memoryEnabled ? (
                            <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-violet-600">
                              Contexte actif
                            </span>
                          ) : null}
                          {selected.webEnabled ? (
                            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-600">
                              Web autorise
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="relative flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void newConversation()}>
                          <Plus className="size-3" />
                          Nouvelle discussion
                        </Button>
                        <Button size="sm" onClick={() => void save()} disabled={busy === "save"}>
                          {busy === "save" ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                          Enregistrer
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="scrollbar-none flex gap-2 overflow-x-auto border-b border-border/60 bg-background/35 px-3 py-3 sm:px-5">
                    {chatbotTabs.map((item) => (
                      <Button
                        key={item.id}
                        variant={tab === item.id ? "secondary" : "ghost"}
                        className="shrink-0 rounded-xl"
                        onClick={() => setTab(item.id)}
                      >
                        <item.icon className="size-4" />
                        {item.label}
                      </Button>
                    ))}
                  </div>

                  <div className="px-3 py-3 sm:px-5 sm:py-5">
                    <div className="mb-4 rounded-2xl border border-border/70 bg-background/55 px-4 py-3">
                      <p className="text-sm font-medium">{chatbotTabs.find((item) => item.id === tab)?.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {chatbotTabs.find((item) => item.id === tab)?.description}
                      </p>
                    </div>

                    {tab === "chat" ? (
                      <ChatPanel
                        selected={selected}
                        selectedConversation={selectedConversation}
                        conversations={conversations}
                        conversationId={conversationId}
                        busy={busy}
                        messages={messages}
                        message={message}
                        setMessage={setMessage}
                        onSwitchConversation={switchConversation}
                        onSend={send}
                      />
                    ) : null}

                    {tab === "history" ? (
                      <HistoryPanel
                        conversations={conversations}
                        conversationId={conversationId}
                        busy={busy}
                        onSwitchConversation={switchConversation}
                        onNewConversation={newConversation}
                      />
                    ) : null}

                    {tab === "knowledge" ? (
                      <KnowledgePanel
                        busy={busy}
                        knowledge={knowledge}
                        knowledgeDraft={knowledgeDraft}
                        setKnowledgeDraft={setKnowledgeDraft}
                        onAddKnowledge={addKnowledge}
                        onToggleKnowledge={toggleKnowledge}
                        onRemoveKnowledge={removeKnowledge}
                      />
                    ) : null}

                    {tab === "files" ? (
                      <ContextFilesPanel
                        chatbot={selected}
                        files={contextFiles}
                        scope={fileScope}
                        busy={busy === "file"}
                        onScopeChange={setFileScope}
                        onGlobalLearningChange={(checked) => updateSelected("globalLearningEnabled", checked)}
                        onUpload={uploadContextFile}
                        onDelete={removeContextFile}
                      />
                    ) : null}

                    {tab === "settings" ? (
                      <SettingsPanel
                        selected={selected}
                        openAIModels={openAIModels}
                        onUpdateSelected={updateSelected}
                        onSave={save}
                        onRemove={remove}
                        busy={busy}
                      />
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="flex min-h-[620px] flex-col items-center justify-center px-6 text-center">
                  <span className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <MessageSquareText className="size-7" />
                  </span>
                  <h2 className="text-lg font-semibold">Selectionnez un chatbot</h2>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    La page adopte maintenant une logique plus proche d'un vrai produit IA, avec sous-menu, discussions et configuration separes.
                  </p>
                </div>
              )}
            </CardContent>
          </LiquidGlass>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Creer un chatbot"
        description="Choisissez precisement les donnees et outils que cet assistant pourra utiliser."
      >
        <div className="space-y-4">
          <Input placeholder="Nom" value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} />
          <Input placeholder="Description" value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} />
          <select value={draft.model} onChange={(event) => setDraft((value) => ({ ...value, model: event.target.value }))} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">
            {openAIModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          <Textarea value={draft.systemPrompt} onChange={(event) => setDraft((value) => ({ ...value, systemPrompt: event.target.value }))} className="min-h-32" />
          <CapabilityToggle
            icon={<BrainCircuit className="size-4 text-violet-500" />}
            title="Utiliser le contexte"
            description="Le chatbot consulte la memoire autorisee et ses connaissances."
            checked={draft.memoryEnabled}
            onChange={(checked) => setDraft((value) => ({ ...value, memoryEnabled: checked, learningEnabled: checked ? value.learningEnabled : false }))}
          />
          <CapabilityToggle
            icon={<Sparkles className="size-4 text-amber-500" />}
            title="Faire grandir le contexte"
            description="Les faits durables des discussions sont memorises."
            checked={draft.learningEnabled}
            disabled={!draft.memoryEnabled}
            onChange={(checked) => setDraft((value) => ({ ...value, learningEnabled: checked }))}
          />
          <CapabilityToggle
            icon={<Globe2 className="size-4 text-cyan-500" />}
            title="Connecter au web"
            description="Le chatbot peut chercher des informations actuelles sur internet."
            checked={draft.webEnabled}
            onChange={(checked) => setDraft((value) => ({ ...value, webEnabled: checked }))}
          />
          <Button className="w-full" disabled={busy === "create" || draft.name.trim().length < 2} onClick={() => void create()}>
            {busy === "create" ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Creer
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function ChatPanel({
  selected,
  selectedConversation,
  conversations,
  conversationId,
  busy,
  messages,
  message,
  setMessage,
  onSwitchConversation,
  onSend,
}: {
  selected: Chatbot;
  selectedConversation?: ChatbotConversation;
  conversations: ChatbotConversation[];
  conversationId?: string;
  busy?: string;
  messages: ChatbotMessage[];
  message: string;
  setMessage: (value: string) => void;
  onSwitchConversation: (id: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <select
          value={conversationId ?? ""}
          disabled={Boolean(busy)}
          onChange={(event) => void onSwitchConversation(event.target.value)}
          className="h-11 rounded-2xl border border-border/70 bg-background/80 px-3 text-sm shadow-sm"
        >
          <option value="">Nouvelle conversation</option>
          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title}
            </option>
          ))}
        </select>
        <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-2.5 text-xs">
          <p className="font-medium text-foreground/90">{selectedConversation?.title || "Nouvelle discussion"}</p>
          <p className="mt-1 text-muted-foreground">
            Les messages restent visibles dans une zone compacte et scrollable.
          </p>
        </div>
      </div>

      <LiquidGlass intensity="subtle" as="div" className="flex h-[520px] flex-col overflow-hidden rounded-[28px] border border-border/60" style={{ "--lg-tint": "15 18 35", "--lg-opacity": "0.2", "--lg-blur": "8px", "--lg-saturate": "140%", "--lg-radius": "28px", "--lg-border-opacity": "0.1" } as unknown as React.CSSProperties}>
          <div className="border-b border-border/60 px-4 py-3 text-[11px] text-muted-foreground sm:px-5">
            {selected.systemPrompt
              ? "Le systeme conserve le ton, le contexte et les outils autorises pour cette session."
              : "Ajoutez un prompt systeme pour cadrer la personnalite et les regles du chatbot."}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            {messages.length ? (
              messages.map((item) => (
                <div key={item.id} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[95%] rounded-[24px] px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[88%] ${
                      item.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : item.status === "failed"
                          ? "border border-rose-500/30 bg-rose-500/5"
                          : "border border-border/70 bg-card/90"
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] opacity-70">
                      {item.role === "user" ? (
                        "Vous"
                      ) : (
                        <>
                          <WandSparkles className="size-3" />
                          Assistant
                        </>
                      )}
                    </div>

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
                        {item.content}
                      </ReactMarkdown>
                    </div>

                    {item.citations?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.citations.map((citation) => (
                          <a
                            key={citation.url}
                            href={citation.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/85 px-2.5 py-1 text-[10px] text-cyan-600 transition hover:border-cyan-500"
                          >
                            <ExternalLink className="size-3 shrink-0" />
                            <span className="truncate">{citation.title}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}

                    {item.usage ? (
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] opacity-75">
                        <span className="rounded-full border border-current/10 px-2 py-1">
                          {item.usage.totalTokens.toLocaleString("fr-FR")} tokens
                        </span>
                        {item.usage.pricingStatus === "exact" && item.usage.totalCostNanoUsd !== undefined ? (
                          <span className="rounded-full border border-current/10 px-2 py-1">
                            {(item.usage.totalCostNanoUsd / 1_000_000_000).toLocaleString("fr-FR", {
                              style: "currency",
                              currency: "USD",
                              maximumFractionDigits: 6,
                            })}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex h-full min-h-60 flex-col items-center justify-center text-center">
                <span className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <MessageSquareText className="size-7" />
                </span>
                <p className="text-sm font-medium">Posez une premiere question a {selected.name}.</p>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  L'interface se rapproche maintenant d'un produit conversationnel moderne, avec un centre de discussion principal et un sous-menu distinct.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-border/60 bg-background/90 p-3 sm:p-4">
            <div className="rounded-[24px] border border-border/70 bg-background/90 p-2 shadow-sm">
              <div className="flex gap-2">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder="Ecrivez votre demande, votre brief ou votre instruction..."
                  className="min-h-[88px] border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0"
                />
                <Button size="icon" className="mt-auto size-11 shrink-0 rounded-2xl" disabled={busy === "send"} onClick={onSend}>
                  {busy === "send" ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-1 pt-2 text-[11px] text-muted-foreground">
                <span>Entree pour envoyer, Maj + Entree pour une nouvelle ligne.</span>
                <span>{selected.learningEnabled ? "Les faits utiles peuvent enrichir le contexte." : "L'apprentissage est actuellement desactive."}</span>
              </div>
            </div>
          </div>
      </LiquidGlass>
    </div>
  );
}

function HistoryPanel({
  conversations,
  conversationId,
  busy,
  onSwitchConversation,
  onNewConversation,
}: {
  conversations: ChatbotConversation[];
  conversationId?: string;
  busy?: string;
  onSwitchConversation: (id: string) => void;
  onNewConversation: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/55 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Conversations enregistrees</p>
          <p className="mt-1 text-xs text-muted-foreground">Reprenez une session precise en un clic.</p>
        </div>
        <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={onNewConversation}>
          <Plus className="size-3" />
          Nouvelle
        </Button>
      </div>

      <div className="grid gap-3">
        {conversations.length ? (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => void onSwitchConversation(conversation.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                conversation.id === conversationId
                  ? "border-primary/40 bg-primary/10"
                  : "border-border/70 bg-background/45 hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{conversation.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Derniere mise a jour le {new Date(conversation.updatedAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <Clock3 className="size-4 shrink-0 text-muted-foreground" />
              </div>
            </button>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aucune conversation enregistree pour le moment.
          </p>
        )}
      </div>
    </div>
  );
}

function KnowledgePanel({
  busy,
  knowledge,
  knowledgeDraft,
  setKnowledgeDraft,
  onAddKnowledge,
  onToggleKnowledge,
  onRemoveKnowledge,
}: {
  busy?: string;
  knowledge: ChatbotKnowledge[];
  knowledgeDraft: { title: string; content: string };
  setKnowledgeDraft: React.Dispatch<React.SetStateAction<{ title: string; content: string }>>;
  onAddKnowledge: () => void;
  onToggleKnowledge: (item: ChatbotKnowledge) => void;
  onRemoveKnowledge: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="border-border/70 bg-card/60">
        <CardHeader>
          <CardTitle className="text-sm">Bibliotheque de connaissances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {knowledge.length ? (
              knowledge.map((item) => (
                <div key={item.id} className={`rounded-xl border p-3 ${item.blocked ? "border-amber-500/30 bg-amber-500/5" : "border-border/70 bg-background/40"}`}>
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        {item.source === "Apprentissage conversationnel" ? <Sparkles className="size-3 text-amber-500" /> : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.content}</p>
                    </div>
                    <button onClick={() => onRemoveKnowledge(item.id)} aria-label={`Supprimer ${item.title}`}>
                      <Trash2 className="size-3 text-muted-foreground" />
                    </button>
                  </div>
                  <button onClick={() => onToggleKnowledge(item)} className="mt-3 text-[11px] font-medium text-primary">
                    {item.blocked ? "Autoriser cette connaissance" : "Suspendre l'utilisation"}
                  </button>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Aucune connaissance ajoutee.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/60">
        <CardHeader>
          <CardTitle className="text-sm">Ajouter une connaissance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Titre" value={knowledgeDraft.title} onChange={(event) => setKnowledgeDraft((value) => ({ ...value, title: event.target.value }))} />
          <Textarea placeholder="Information, procedure ou reference..." value={knowledgeDraft.content} onChange={(event) => setKnowledgeDraft((value) => ({ ...value, content: event.target.value }))} className="min-h-40" />
          <Button variant="outline" className="w-full" onClick={onAddKnowledge} disabled={busy === "knowledge"}>
            <Plus className="size-4" />
            Ajouter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsPanel({
  selected,
  openAIModels,
  onUpdateSelected,
  onSave,
  onRemove,
  busy,
}: {
  selected: Chatbot;
  openAIModels: Array<{ id: string; name: string; description?: string; provider?: string }>;
  onUpdateSelected: <Key extends keyof Chatbot>(key: Key, value: Chatbot[Key]) => void;
  onSave: () => void;
  onRemove: () => void;
  busy?: string;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="border-border/70 bg-card/60">
        <CardHeader>
          <CardTitle className="text-sm">Configuration du chatbot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={selected.name} onChange={(event) => onUpdateSelected("name", event.target.value)} aria-label="Nom" />
          <Input value={selected.description} onChange={(event) => onUpdateSelected("description", event.target.value)} aria-label="Description" />
          <select value={selected.model} onChange={(event) => onUpdateSelected("model", event.target.value)} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">
            {openAIModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          <Textarea value={selected.systemPrompt} onChange={(event) => onUpdateSelected("systemPrompt", event.target.value)} className="min-h-36" aria-label="Prompt systeme" />
          <CapabilityToggle
            icon={<BrainCircuit className="size-4 text-violet-500" />}
            title="Utiliser le contexte"
            description="Injecte la memoire de l'entreprise et les connaissances de ce chatbot."
            checked={selected.memoryEnabled}
            onChange={(checked) => {
              onUpdateSelected("memoryEnabled", checked);
              if (!checked) onUpdateSelected("learningEnabled", false);
            }}
          />
          <CapabilityToggle
            icon={<Sparkles className="size-4 text-amber-500" />}
            title="Apprendre des echanges"
            description="Extrait des faits durables pour enrichir les prochaines conversations."
            checked={selected.learningEnabled}
            disabled={!selected.memoryEnabled}
            onChange={(checked) => onUpdateSelected("learningEnabled", checked)}
          />
          <CapabilityToggle
            icon={<Globe2 className="size-4 text-cyan-500" />}
            title="Acces au web"
            description="Autorise les recherches internet avec sources cliquables."
            checked={selected.webEnabled}
            onChange={(checked) => onUpdateSelected("webEnabled", checked)}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/60">
        <CardHeader>
          <CardTitle className="text-sm">Actions rapides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
            <p className="text-sm font-medium">Sauvegarder les reglages</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Enregistrez le modele, le prompt systeme et les permissions de ce chatbot.
            </p>
            <Button className="mt-4 w-full" onClick={onSave} disabled={busy === "save"}>
              {busy === "save" ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              Enregistrer
            </Button>
          </div>

          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
            <p className="text-sm font-medium text-rose-500">Supprimer le chatbot</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Cette action supprime egalement l'historique et le contexte associe.
            </p>
            <Button variant="outline" className="mt-4 w-full" onClick={onRemove} disabled={busy === "delete"}>
              <Trash2 className="size-4 text-rose-500" />
              Supprimer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CapabilityToggle({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border p-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{title}</span>
        <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1 size-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function ContextFilesPanel({
  chatbot,
  files,
  scope,
  busy,
  onScopeChange,
  onGlobalLearningChange,
  onUpload,
  onDelete,
}: {
  chatbot: Chatbot;
  files: ContextFile[];
  scope: ContextFile["scope"];
  busy: boolean;
  onScopeChange: (scope: ContextFile["scope"]) => void;
  onGlobalLearningChange: (checked: boolean) => void;
  onUpload: (file?: File) => void;
  onDelete: (file: ContextFile) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="border-border/70 bg-card/60">
        <CardHeader>
          <CardTitle className="text-sm">Parametres de contexte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CapabilityToggle
            icon={<Sparkles className="size-4 text-emerald-500" />}
            title="Enrichir la memoire globale"
            description="Les faits durables appris dans le chat deviennent accessibles a l'entreprise."
            checked={chatbot.globalLearningEnabled}
            disabled={!chatbot.learningEnabled}
            onChange={onGlobalLearningChange}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={scope}
              onChange={(event) => onScopeChange(event.target.value as ContextFile["scope"])}
              className="h-10 rounded-xl border bg-background px-3 text-xs"
              aria-label="Portee du fichier"
            >
              <option value="chatbot">Ce chatbot</option>
              <option value="workspace">Toute l'entreprise</option>
            </select>
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-background px-3 text-xs font-medium hover:bg-muted">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
              Importer
              <input
                type="file"
                className="sr-only"
                disabled={busy || !chatbot.memoryEnabled}
                accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.txt,.md,.json,.html,.xml,.csv,.doc,.docx,.rtf,.odt,.ppt,.pptx,.xls,.xlsx"
                onChange={(event) => {
                  onUpload(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">
            Images, PDF, documents et tableurs, 4 Mo maximum. Jusqu'a trois fichiers pertinents sont analyses par reponse.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Paperclip className="size-4 text-violet-500" />
            Fichiers de contexte <Badge>{files.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {files.length ? (
              files.map((file) => (
                <div key={file.id} className="flex items-center gap-2 rounded-lg border p-3">
                  <FileText className="size-4 shrink-0 text-cyan-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {file.scope === "workspace" ? "Entreprise" : "Chatbot"} -{" "}
                      {(file.sizeBytes / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} Ko
                    </p>
                  </div>
                  <button onClick={() => onDelete(file)} aria-label={`Supprimer ${file.name}`}>
                    <Trash2 className="size-3 text-muted-foreground hover:text-rose-500" />
                  </button>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-center text-[11px] text-muted-foreground">
                Aucun fichier de contexte.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
