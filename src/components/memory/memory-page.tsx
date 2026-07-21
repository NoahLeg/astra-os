"use client";

import { useState } from "react";
import { BrainCircuit, Edit3, Eye, EyeOff, GitBranch, Network, Plus, Sparkles, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { ConfidenceIndicator } from "@/components/shared/indicators";
import { Modal } from "@/components/shared/modal";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type { MemoryItem } from "@/types";

const filters: Array<{ key: MemoryItem["type"] | "all"; label: string }> = [
  { key: "all", label: "Tout" }, { key: "fact", label: "Faits" }, { key: "project", label: "Projets" }, { key: "person", label: "Personnes" },
  { key: "decision", label: "Décisions" }, { key: "document", label: "Documents" }, { key: "habit", label: "Habitudes" }, { key: "relation", label: "Relations" },
];

const emptyDraft: Omit<MemoryItem, "id" | "createdAt" | "blocked"> = { type: "fact", title: "", content: "", source: "Ajout manuel", confidence: 100, relations: [] };

export function MemoryPage() {
  const { memories, addMemory, updateMemory, toggleMemoryBlock, deleteMemory } = useAppStore();
  const [view, setView] = useState<"graph" | "table">("graph");
  const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("all");
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState<string | null>(null);
  const filtered = memories.filter((item) => filter === "all" || item.type === filter);
  const learned = memories.filter((item) => !item.blocked && (item.type === "habit" || item.type === "decision")).slice(0, 4);

  const openEdit = (item: MemoryItem) => {
    setEditing(item);
    setDraft({ type: item.type, title: item.title, content: item.content, source: item.source, confidence: item.confidence, relations: item.relations });
  };

  const saveDraft = async () => {
    if (!draft.title.trim() || !draft.content.trim()) { toast.error("Le titre et le contenu sont obligatoires."); return; }
    setBusy("save");
    try {
      if (editing) {
        await updateMemory(editing.id, draft);
        toast.success("Mémoire mise à jour dans la base");
      } else {
        await addMemory({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), blocked: false, ...draft });
        toast.success("Nouvel élément mémorisé");
      }
      setEditing(null);
      setCreating(false);
      setDraft(emptyDraft);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La mémoire n’a pas pu être enregistrée.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (item: MemoryItem) => {
    if (!window.confirm(`Supprimer définitivement « ${item.title} » de la mémoire ?`)) return;
    setBusy(item.id);
    try {
      await deleteMemory(item.id);
      toast.success("Élément supprimé de la mémoire");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible.");
    } finally {
      setBusy(null);
    }
  };

  const toggleBlocked = async (item: MemoryItem) => {
    setBusy(item.id);
    try {
      await toggleMemoryBlock(item.id);
      toast.success(item.blocked ? "Utilisation réactivée" : "Utilisation interdite");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Modification impossible.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Contexte durable" title="Mémoire" description="Comprenez, corrigez et contrôlez les informations réellement stockées et utilisées par les agents." actions={<div className="flex flex-wrap gap-2"><div className="flex rounded-xl border p-1"><Button variant={view === "graph" ? "secondary" : "ghost"} size="sm" onClick={() => setView("graph")}><Network className="size-4" />Graphe</Button><Button variant={view === "table" ? "secondary" : "ghost"} size="sm" onClick={() => setView("table")}><Table2 className="size-4" />Tableau</Button></div><Button onClick={() => { setDraft(emptyDraft); setCreating(true); }}><Plus className="size-4" />Ajouter</Button></div>} />

      <Card className="overflow-hidden"><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-indigo-500" />Ce que l’IA peut utiliser sur votre manière de travailler</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{learned.length ? learned.map((item) => <button key={item.id} onClick={() => openEdit(item)} className="rounded-xl border bg-background p-4 text-left hover:border-indigo-500/40"><p className="text-xs font-medium text-indigo-500">{item.title}</p><p className="mt-2 line-clamp-2 text-sm leading-6">{item.content}</p></button>) : <p className="col-span-full py-5 text-center text-sm text-muted-foreground">Aucune habitude active. Ajoutez ou autorisez des éléments pour contextualiser les agents.</p>}</CardContent></Card>

      <div className="scrollbar-none flex gap-2 overflow-x-auto">{filters.map((item) => <Button key={item.key} variant={filter === item.key ? "secondary" : "ghost"} size="sm" onClick={() => setFilter(item.key)}>{item.label}</Button>)}</div>

      {view === "graph" ? <KnowledgeGraph items={filtered} onSelect={openEdit} /> : <Card><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr><th className="p-4">Mémoire</th><th>Type</th><th>Source</th><th>Confiance</th><th>Relations</th><th className="pr-4 text-right">Actions</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className={cn("border-b last:border-0", item.blocked && "opacity-50")}><td className="max-w-sm p-4"><p className="font-medium">{item.title}</p><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.content}</p></td><td><Badge className="bg-muted text-muted-foreground">{item.type}</Badge></td><td className="text-xs text-muted-foreground">{item.source}</td><td><ConfidenceIndicator value={item.confidence} compact /></td><td className="text-xs text-muted-foreground">{item.relations.join(", ") || "—"}</td><td className="pr-4"><div className="flex justify-end"><Button variant="ghost" size="icon" disabled={Boolean(busy)} onClick={() => openEdit(item)} aria-label={`Modifier ${item.title}`}><Edit3 className="size-4" /></Button><Button variant="ghost" size="icon" disabled={Boolean(busy)} onClick={() => void toggleBlocked(item)} aria-label={item.blocked ? "Autoriser l’utilisation" : "Interdire l’utilisation"}>{item.blocked ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</Button><Button variant="ghost" size="icon" disabled={Boolean(busy)} onClick={() => void remove(item)} aria-label={`Supprimer ${item.title}`}><Trash2 className="size-4 text-rose-500" /></Button></div></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Aucun élément dans cette catégorie.</p>}</CardContent></Card>}

      <Modal open={creating || Boolean(editing)} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? "Modifier la mémoire" : "Ajouter à la mémoire"} description="Les éléments actifs sont fournis au coordinateur et aux agents lorsqu’ils sont pertinents.">
        <MemoryForm draft={draft} onChange={setDraft} />
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" disabled={Boolean(busy)} onClick={() => { setCreating(false); setEditing(null); }}>Annuler</Button><Button disabled={Boolean(busy)} onClick={() => void saveDraft()}>{busy === "save" ? "Enregistrement…" : "Enregistrer"}</Button></div>
      </Modal>
    </div>
  );
}

function MemoryForm({ draft, onChange }: { draft: typeof emptyDraft; onChange: (draft: typeof emptyDraft) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Type<select className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm" value={draft.type} onChange={(event) => onChange({ ...draft, type: event.target.value as MemoryItem["type"] })}>{filters.filter((item) => item.key !== "all").map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label className="text-sm font-medium">Confiance (%)<Input className="mt-2" type="number" min={0} max={100} value={draft.confidence} onChange={(event) => onChange({ ...draft, confidence: Number(event.target.value) })} /></label><label className="text-sm font-medium sm:col-span-2">Titre<Input className="mt-2" value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} /></label><label className="text-sm font-medium sm:col-span-2">Contenu<Textarea className="mt-2 min-h-32" value={draft.content} onChange={(event) => onChange({ ...draft, content: event.target.value })} /></label><label className="text-sm font-medium">Source<Input className="mt-2" value={draft.source} onChange={(event) => onChange({ ...draft, source: event.target.value })} /></label><label className="text-sm font-medium">Relations<Input className="mt-2" value={draft.relations.join(", ")} onChange={(event) => onChange({ ...draft, relations: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Projet, personne, agent" /></label></div>;
}

function KnowledgeGraph({ items, onSelect }: { items: MemoryItem[]; onSelect: (item: MemoryItem) => void }) {
  const positions = ["left-[8%] top-[15%]", "right-[8%] top-[14%]", "left-[10%] bottom-[14%]", "right-[10%] bottom-[16%]", "left-[42%] top-[7%]", "left-[43%] bottom-[7%]"];
  const visibleItems = items.slice(0, 6);
  return <><Card className="soft-grid sm:hidden"><CardContent className="p-3"><div className="mb-3 flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-card p-3"><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10"><BrainCircuit className="size-5 text-indigo-500" /></span><div><p className="text-sm font-medium">Votre contexte</p><p className="text-xs text-muted-foreground">{visibleItems.length} relations visibles</p></div></div><div className="grid gap-2">{visibleItems.map((item) => <button key={item.id} onClick={() => onSelect(item)} className={cn("rounded-xl border bg-card p-3 text-left", item.blocked && "opacity-40")}><div className="flex items-center gap-2"><GitBranch className="size-3.5 text-cyan-500" /><Badge className="bg-muted text-muted-foreground">{item.type}</Badge></div><p className="mt-2 text-xs font-medium">{item.title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{item.content}</p></button>)}</div></CardContent></Card><Card className="relative hidden min-h-[520px] overflow-hidden soft-grid sm:block"><CardContent className="relative min-h-[520px] p-6"><svg className="absolute inset-0 h-full w-full opacity-30" aria-hidden="true"><line x1="50%" y1="50%" x2="20%" y2="25%" stroke="#6366f1" /><line x1="50%" y1="50%" x2="78%" y2="22%" stroke="#06b6d4" /><line x1="50%" y1="50%" x2="25%" y2="78%" stroke="#8b5cf6" /><line x1="50%" y1="50%" x2="76%" y2="76%" stroke="#10b981" /></svg><div className="absolute left-1/2 top-1/2 z-10 flex size-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-indigo-500/40 bg-card shadow-2xl shadow-indigo-500/20"><BrainCircuit className="size-6 text-indigo-500" /><span className="mt-1 text-xs font-medium">Votre contexte</span></div>{visibleItems.map((item, index) => <button key={item.id} onClick={() => onSelect(item)} className={cn("absolute z-10 max-w-[180px] rounded-2xl border bg-card p-3 text-left shadow-lg transition hover:scale-105 hover:border-indigo-500/50", positions[index], item.blocked && "opacity-40")}><div className="flex items-center gap-2"><GitBranch className="size-3.5 text-cyan-500" /><Badge className="bg-muted text-muted-foreground">{item.type}</Badge></div><p className="mt-2 text-xs font-medium">{item.title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{item.content}</p></button>)}</CardContent></Card></>;
}
