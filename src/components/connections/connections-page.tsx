"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, FlaskConical, Info, KeyRound, LoaderCircle, PlugZap, RefreshCcw, Send, Settings2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Modal } from "@/components/shared/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { useAppStore } from "@/stores/app-store";
import type { Connection } from "@/types";

const googleConnectionIds = new Set(["gmail", "calendar", "drive"]);

async function connectionRequest(path: string, connectionId: string) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Le connecteur n’a pas répondu correctement.");
}

export function ConnectionsPage() {
  const searchParams = useSearchParams();
  const connections = useAppStore((state) => state.connections);
  const hydrateFromDatabase = useAppStore((state) => state.hydrateFromDatabase);
  const [selected, setSelected] = useState<Connection | null>(null);
  const [busyId, setBusyId] = useState<string>();
  const [emailDraft, setEmailDraft] = useState({ to: "", subject: "", body: "" });
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      toast.success("Google Workspace est autorisé durablement pour Gmail, Calendar et Drive.");
      void hydrateFromDatabase();
    }
    if (error) toast.error(error);
    if (connected || error) window.history.replaceState({}, "", "/connections");
  }, [hydrateFromDatabase, searchParams]);

  const connect = (connection: Connection) => {
    if (googleConnectionIds.has(connection.id)) {
      window.location.assign(`/api/connections/google/start?connectionId=${encodeURIComponent(connection.id)}`);
      return;
    }
    setSelected(connection);
  };

  const disconnect = async (connection: Connection) => {
    setBusyId(connection.id);
    try {
      await connectionRequest("/api/connections/google/disconnect", connection.id);
      await hydrateFromDatabase();
      toast.success("Google Workspace a été déconnecté et tous ses jetons ont été révoqués.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Déconnexion impossible");
    } finally {
      setBusyId(undefined);
    }
  };

  const testConnection = async (connection: Connection) => {
    setBusyId(connection.id);
    try {
      await connectionRequest("/api/connections/google/test", connection.id);
      toast.success(`${connection.name} répond correctement.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test impossible");
    } finally {
      setBusyId(undefined);
    }
  };

  const sendGmailMessage = async () => {
    if (!selected || selected.id !== "gmail") return;

    if (!window.confirm(`Envoyer cet e-mail à ${emailDraft.to} ? Cette action est réelle.`)) return;

    setIsSendingEmail(true);
    try {
      const response = await fetch("/api/connections/google/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...emailDraft, confirmed: true }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "L’e-mail n’a pas pu être envoyé.");

      setEmailDraft({ to: "", subject: "", body: "" });
      await hydrateFromDatabase();
      toast.success("E-mail envoyé depuis Gmail.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi Gmail impossible");
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Écosystème"
        title="Connexions"
        description="Reliez Astra à vos outils avec de vraies autorisations OAuth, révocables et journalisées."
      />

      <div className="flex flex-col gap-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500"><KeyRound className="size-5" /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">Une seule autorisation Google Workspace</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Le refresh token est chiffré côté serveur et réutilisé par les agents et automatisations. Vous ne vous reconnectez que si Google révoque l’accès ou si vous cliquez sur Réautoriser.</p></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connections.map((connection) => {
          const isGoogle = googleConnectionIds.has(connection.id);
          const isConnected = isGoogle && connection.status === "connected";
          const isBusy = busyId === connection.id;
          return (
            <Card key={connection.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                    <DynamicIcon name={connection.icon} className="size-5 text-indigo-500" />
                  </span>
                  <Badge className={isConnected ? "bg-emerald-500/10 text-emerald-500" : isGoogle ? "bg-muted text-muted-foreground" : "bg-amber-500/10 text-amber-500"}>
                    {isConnected ? "Connecté" : isGoogle ? "Non connecté" : "Configuration requise"}
                  </Badge>
                </div>
                <h2 className="mt-4 font-semibold">{connection.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{connection.description}</p>
                <div className="mt-4 min-h-16 rounded-xl bg-muted/40 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Permissions demandées</p>
                  <p className="mt-2 text-xs">{connection.permissions.join(" · ")}</p>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  {isConnected ? (
                    <>
                      <Button variant="outline" className="flex-1" onClick={() => setSelected(connection)}>
                        <Settings2 className="size-4" />Gérer
                      </Button>
                      <Button variant="ghost" size="icon" disabled={isBusy} onClick={() => void disconnect(connection)} aria-label={`Déconnecter ${connection.name}`}>
                        {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                      </Button>
                    </>
                  ) : (
                    <Button className="w-full" onClick={() => connect(connection)}>
                      <PlugZap className="size-4" />{isGoogle ? "Autoriser avec Google" : "Voir la configuration"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Configurer ${selected.name}` : "Configurer la connexion"}
        description="Aucun secret n’est envoyé ou conservé dans le navigateur."
      >
        {selected && googleConnectionIds.has(selected.id) && selected.status === "connected" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border bg-background p-4">
              <CheckCircle2 className="size-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">Autorisation OAuth active</p>
                <p className="text-xs text-muted-foreground">Le jeton persistant est chiffré dans l’espace de votre entreprise et reste disponible hors connexion.</p>
              </div>
            </div>
            <div className="rounded-xl bg-muted/40 p-4 text-sm">
              {selected.permissions.map((permission) => <p key={permission} className="py-1">✓ {permission}</p>)}
            </div>
            {selected.id === "gmail" ? (
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-medium">Envoyer un e-mail</p>
                  <p className="mt-1 text-xs text-muted-foreground">Un message réel sera envoyé uniquement après votre confirmation.</p>
                </div>
                <div className="grid gap-3">
                  <Input
                    type="email"
                    value={emailDraft.to}
                    onChange={(event) => setEmailDraft((draft) => ({ ...draft, to: event.target.value }))}
                    placeholder="destinataire@entreprise.fr"
                    aria-label="Destinataire"
                  />
                  <Input
                    value={emailDraft.subject}
                    onChange={(event) => setEmailDraft((draft) => ({ ...draft, subject: event.target.value }))}
                    placeholder="Objet de l’e-mail"
                    aria-label="Objet"
                  />
                  <Textarea
                    value={emailDraft.body}
                    onChange={(event) => setEmailDraft((draft) => ({ ...draft, body: event.target.value }))}
                    placeholder="Rédigez votre message…"
                    aria-label="Message"
                    rows={5}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={isSendingEmail || !emailDraft.to || !emailDraft.subject || !emailDraft.body}
                  onClick={() => void sendGmailMessage()}
                >
                  {isSendingEmail ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Envoyer avec Gmail
                </Button>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => window.location.assign(`/api/connections/google/start?connectionId=${encodeURIComponent(selected.id)}&force=1`)}><RefreshCcw className="size-4" />Réautoriser</Button>
              <Button variant="outline" disabled={busyId === selected.id} onClick={() => void testConnection(selected)}>
                {busyId === selected.id ? <LoaderCircle className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
                Tester réellement
              </Button>
              <Button onClick={() => setSelected(null)}>Fermer</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
              <Info className="mt-0.5 size-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium">Ce connecteur n’est pas encore activé côté serveur.</p>
                <p className="mt-1 text-muted-foreground">Il n’est plus simulé. Ajoutez ses identifiants OAuth et son callback serveur avant de permettre la connexion.</p>
              </div>
            </div>
            <div className="flex justify-end border-t pt-4"><Button onClick={() => setSelected(null)}>Fermer</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
