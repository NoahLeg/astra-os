"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, MessageSquare, RefreshCw, Send, Trash2, UserRoundPlus, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Modal } from "@/components/shared/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/input";
import { taskCollaborationService } from "@/services";
import type { AccessLevel, TaskEntityType } from "@/types";

const commentSchema = z.object({ body: z.string().trim().min(1, "Écrivez un message").max(2_000, "Message limité à 2 000 caractères") });
type CommentForm = z.infer<typeof commentSchema>;

type TaskCollaborationDialogProps = {
  entityType: TaskEntityType;
  entityId: string;
  taskId: string;
  taskTitle: string;
  canEdit: boolean;
  currentUserId?: string;
  accessLevel?: AccessLevel;
};

export function TaskCollaborationDialog({ entityType, entityId, taskId, taskTitle, canEdit, currentUserId, accessLevel }: TaskCollaborationDialogProps) {
  const [open, setOpen] = useState(false);
  const [draftCollaboratorIds, setDraftCollaboratorIds] = useState<string[]>();
  const queryClient = useQueryClient();
  const queryKey = ["task-collaboration", entityType, entityId, taskId] as const;
  const collaborationKey = { entityType, entityId, taskId } as const;
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CommentForm>({
    resolver: zodResolver(commentSchema),
    defaultValues: { body: "" },
  });

  const collaborationQuery = useQuery({
    queryKey,
    queryFn: () => taskCollaborationService.load(collaborationKey),
    enabled: open,
    refetchInterval: open ? 5_000 : false,
  });

  const collaboratorMutation = useMutation({
    mutationFn: (userIds: string[]) => taskCollaborationService.setCollaborators(collaborationKey, userIds),
    onSuccess: (overview) => {
      queryClient.setQueryData(queryKey, overview);
      setDraftCollaboratorIds(undefined);
      toast.success("Équipe de la tâche mise à jour");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Affectation impossible"),
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => taskCollaborationService.addComment(collaborationKey, body),
    onSuccess: (overview) => {
      queryClient.setQueryData(queryKey, overview);
      reset();
      toast.success("Message publié");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Publication impossible"),
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => taskCollaborationService.deleteComment(collaborationKey, commentId),
    onSuccess: (overview) => {
      queryClient.setQueryData(queryKey, overview);
      toast.success("Message supprimé");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Suppression impossible"),
  });

  const overview = collaborationQuery.data;
  const selectedIds = draftCollaboratorIds ?? overview?.collaborators.map((member) => member.id) ?? [];
  const toggleMember = (userId: string) => {
    if (!canEdit) return;
    setDraftCollaboratorIds((current) => {
      const source = current ?? overview?.collaborators.map((member) => member.id) ?? [];
      return source.includes(userId) ? source.filter((id) => id !== userId) : [...source, userId];
    });
  };

  const close = () => {
    setOpen(false);
    setDraftCollaboratorIds(undefined);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Users className="size-3.5" />Collaborer</Button>
      <Modal open={open} onClose={close} title="Travail collaboratif" description={taskTitle}>
        {collaborationQuery.isLoading ? (
          <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-44" /><Skeleton className="h-28" /></div>
        ) : collaborationQuery.isError ? (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-500">
            <p>{collaborationQuery.error instanceof Error ? collaborationQuery.error.message : "Collaboration indisponible"}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => void collaborationQuery.refetch()}><RefreshCw className="size-3.5" />Réessayer</Button>
          </div>
        ) : overview ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span><p className="text-xs font-medium">Synchronisation automatique toutes les 5 secondes</p></div>
              <Badge className="bg-primary/10 text-primary">{overview.collaborators.length} coéquipier{overview.collaborators.length > 1 ? "s" : ""}</Badge>
            </div>

            <section aria-labelledby={`collaborators-${taskId}`}>
              <div className="flex items-center justify-between gap-3">
                <div><h3 id={`collaborators-${taskId}`} className="flex items-center gap-2 text-sm font-semibold"><UserRoundPlus className="size-4 text-primary" />Co-affectation</h3><p className="mt-1 text-xs text-muted-foreground">Plusieurs membres peuvent suivre et exécuter la même tâche.</p></div>
                {canEdit ? <Button size="sm" disabled={collaboratorMutation.isPending || draftCollaboratorIds === undefined} onClick={() => collaboratorMutation.mutate(selectedIds)}>{collaboratorMutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Enregistrer</Button> : null}
              </div>
              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-lg border p-2">
                {overview.availableMembers.map((member) => {
                  const selected = selectedIds.includes(member.id);
                  return (
                    <label key={member.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2.5 hover:bg-muted/60">
                      <input type="checkbox" checked={selected} disabled={!canEdit} onChange={() => toggleMember(member.id)} className="size-4 accent-primary" />
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-[10px] font-semibold">{member.fullName.slice(0, 2).toUpperCase()}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{member.fullName}</span><span className="block truncate text-xs text-muted-foreground">{member.email}</span></span>
                      <Badge className="bg-muted text-muted-foreground">{member.accessLevel === "admin" ? "Admin" : member.accessLevel === "operator" ? "Opérateur" : "Lecture"}</Badge>
                    </label>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby={`discussion-${taskId}`}>
              <div className="flex items-center justify-between gap-3"><div><h3 id={`discussion-${taskId}`} className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4 text-cyan-500" />Fil de discussion</h3><p className="mt-1 text-xs text-muted-foreground">Les messages restent liés à cette tâche et sont horodatés.</p></div><span className="font-mono text-[10px] text-muted-foreground">{overview.comments.length} message{overview.comments.length > 1 ? "s" : ""}</span></div>
              <div className="mt-3 max-h-72 space-y-3 overflow-y-auto rounded-lg border bg-background p-3" aria-live="polite">
                {overview.comments.length ? overview.comments.map((comment) => {
                  const canDelete = comment.authorId === currentUserId || accessLevel === "admin";
                  return (
                    <article key={comment.id} className="group flex gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-[10px] font-semibold text-primary">{comment.authorName.slice(0, 2).toUpperCase()}</span>
                      <div className="min-w-0 flex-1 rounded-lg bg-muted/45 p-3">
                        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{comment.authorName}</p><p className="font-mono text-[9px] text-muted-foreground">{new Date(comment.createdAt).toLocaleString("fr-FR")}</p></div>{canDelete && canEdit ? <Button variant="ghost" size="icon" className="size-7 opacity-70 sm:opacity-0 sm:group-hover:opacity-100" disabled={deleteMutation.isPending} aria-label={`Supprimer le message de ${comment.authorName}`} onClick={() => { if (window.confirm("Supprimer ce message ?")) deleteMutation.mutate(comment.id); }}><Trash2 className="size-3.5 text-rose-500" /></Button> : null}</div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{comment.body}</p>
                      </div>
                    </article>
                  );
                }) : <p className="py-8 text-center text-sm text-muted-foreground">Commencez la discussion sur cette tâche.</p>}
              </div>
              {canEdit ? (
                <form onSubmit={handleSubmit((values) => commentMutation.mutate(values.body))} className="mt-3">
                  <Textarea {...register("body")} placeholder="Partager une mise à jour, poser une question ou signaler un blocage…" className="min-h-20" />
                  <div className="mt-2 flex items-center justify-between gap-3">{errors.body ? <p className="text-xs text-rose-500">{errors.body.message}</p> : <p className="text-xs text-muted-foreground">Texte brut uniquement · 2 000 caractères maximum</p>}<Button type="submit" size="sm" disabled={commentMutation.isPending}>{commentMutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}Publier</Button></div>
                </form>
              ) : null}
            </section>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
