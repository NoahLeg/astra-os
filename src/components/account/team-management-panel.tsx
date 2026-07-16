"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Crown, LoaderCircle, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { accessLevels } from "@/config";
import { teamService } from "@/services";
import type { AccessLevel, TeamOverview } from "@/types";

const invitationSchema = z.object({
  fullName: z.string().trim().min(2, "Nom trop court").max(100),
  email: z.email("Adresse email invalide"),
  accessLevel: z.enum(["viewer", "operator", "admin"]),
});

type InvitationForm = z.infer<typeof invitationSchema>;

export function TeamManagementPanel() {
  const [team, setTeam] = useState<TeamOverview>();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InvitationForm>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { fullName: "", email: "", accessLevel: "operator" },
  });

  useEffect(() => {
    void teamService.load().then(setTeam).catch((error) => toast.error(error instanceof Error ? error.message : "Équipe indisponible")).finally(() => setLoading(false));
  }, []);

  const invite = async (values: InvitationForm) => {
    try {
      setTeam(await teamService.invite(values));
      reset();
      toast.success("Invitation envoyée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invitation impossible");
    }
  };

  const runMemberAction = async (memberId: string, action: () => Promise<TeamOverview>, successMessage: string) => {
    setBusyId(memberId);
    try {
      setTeam(await action());
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible");
    } finally {
      setBusyId(undefined);
    }
  };

  if (loading) return <Card><CardContent className="flex min-h-52 items-center justify-center"><LoaderCircle className="size-6 animate-spin text-primary" /></CardContent></Card>;
  if (!team) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">La gestion d’équipe est indisponible.</CardContent></Card>;

  const isFull = team.memberCount >= team.maxMembers;
  const usagePercent = Math.min(100, (team.memberCount / team.maxMembers) * 100);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2"><Users className="size-4 text-primary" />Membres de l’entreprise</CardTitle>
            <Badge className="bg-primary/10 text-primary">{team.memberCount} / {team.maxMembers} sièges</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={usagePercent} className="mb-5 h-2" />
          <div className="space-y-3">
            {team.members.map((member) => (
              <div key={member.id} className="rounded-[10px] border bg-background p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-xs font-semibold">{member.fullName.slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{member.fullName}</p>
                      {member.isOwner ? <Badge className="bg-amber-500/10 text-amber-500"><Crown className="size-3" />Propriétaire</Badge> : null}
                      <Badge className={member.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}>{member.status === "active" ? "Actif" : "Suspendu"}</Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <select
                    aria-label={`Niveau d’accès de ${member.fullName}`}
                    value={member.accessLevel}
                    disabled={member.isOwner || busyId === member.id}
                    onChange={(event) => void runMemberAction(member.id, () => teamService.updateAccess(member.id, event.target.value as AccessLevel), "Niveau d’accès mis à jour")}
                    className="h-9 rounded-lg border bg-background px-3 text-xs"
                  >
                    {accessLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
                  </select>
                  {!member.isOwner ? (
                    <>
                      <Button variant="outline" size="sm" disabled={busyId === member.id} onClick={() => void runMemberAction(member.id, () => teamService.updateStatus(member.id, member.status === "active" ? "suspended" : "active"), member.status === "active" ? "Membre suspendu" : "Membre réactivé")}>{member.status === "active" ? "Suspendre" : "Réactiver"}</Button>
                      <Button variant="ghost" size="icon" disabled={busyId === member.id} aria-label={`Retirer ${member.fullName}`} onClick={() => { if (window.confirm(`Retirer ${member.fullName} de cette entreprise ?`)) void runMemberAction(member.id, () => teamService.remove(member.id), "Membre retiré"); }}><Trash2 className="size-4 text-rose-500" /></Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-4" />Inviter un membre</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(invite)} className="space-y-3">
              <label className="text-sm font-medium">Nom complet<Input className="mt-2" {...register("fullName")} /></label>
              <label className="text-sm font-medium">Email professionnel<Input className="mt-2" type="email" {...register("email")} /></label>
              <label className="text-sm font-medium">Niveau d’accès<select className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm" {...register("accessLevel")}>{accessLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
              {(errors.fullName || errors.email || errors.accessLevel) ? <p className="text-xs text-rose-500">{errors.fullName?.message ?? errors.email?.message ?? errors.accessLevel?.message}</p> : null}
              {isFull ? <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-600">Tous les sièges sont utilisés. Augmentez la limite contractuelle depuis la console Super Admin.</p> : null}
              <Button type="submit" className="w-full" disabled={isSubmitting || isFull}>{isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <UserPlus className="size-4" />}Envoyer l’invitation</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-500" />Accès partagé</CardTitle></CardHeader>
          <CardContent><p className="text-sm leading-6 text-muted-foreground">Chaque membre actif bénéficie des fonctionnalités du plan <strong className="text-foreground">{team.planId === "enterprise" ? "Entreprise" : "Business"}</strong>, selon son niveau Lecture, Opérateur ou Administrateur.</p></CardContent>
        </Card>
      </div>
    </div>
  );
}
