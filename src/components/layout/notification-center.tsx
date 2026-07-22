"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Gauge, LoaderCircle, MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notificationService } from "@/services";
import type { AppNotification } from "@/types";

const notificationIcons = {
  approval: ShieldCheck,
  error: AlertTriangle,
  success: CheckCircle2,
  quota: Gauge,
  collaboration: MessageSquare,
};

const notificationTones = {
  approval: "bg-amber-500/10 text-amber-500",
  error: "bg-rose-500/10 text-rose-500",
  success: "bg-emerald-500/10 text-emerald-500",
  quota: "bg-violet-500/10 text-violet-500",
  collaboration: "bg-cyan-500/10 text-cyan-500",
};

function NotificationItem({ notification, onRead }: { notification: AppNotification; onRead: (id: string) => void }) {
  const Icon = notificationIcons[notification.category];

  return (
    <Link
      href={notification.href}
      onClick={() => onRead(notification.id)}
      className="group flex gap-3 border-b p-4 transition-colors hover:bg-muted/55 last:border-b-0"
    >
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${notificationTones[notification.category]}`}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="line-clamp-1 flex-1 text-sm font-medium">{notification.title}</span>
          {!notification.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#FF4FA3] shadow-[0_0_10px_rgba(255,79,163,.55)]" /> : null}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{notification.description}</span>
        <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">
          {new Date(notification.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
        </span>
      </span>
    </Link>
  );
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationService.list,
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: notificationService.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAllRead = useMutation({
    mutationFn: notificationService.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const unreadCount = query.data?.unreadCount ?? 0;

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} non lues` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative"
      >
        <Bell className="size-4" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-[#FF4FA3] px-1 font-mono text-[8px] font-bold leading-4 text-white">
            {Math.min(unreadCount, 99)}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="glass-strong fixed left-3 right-3 top-[4.25rem] z-[70] overflow-hidden rounded-[10px] border border-[var(--glass-border)] shadow-[var(--shadow-xl)] sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[390px]">
          <div className="flex items-center justify-between border-b border-[var(--glass-border)] p-4">
            <div>
              <p className="font-display font-semibold">Notifications</p>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">
                {unreadCount ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Vous êtes à jour"}
              </p>
            </div>
            {unreadCount ? (
              <Button variant="ghost" size="sm" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
                {markAllRead.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
                Tout lire
              </Button>
            ) : null}
          </div>
          <div className="max-h-[min(68vh,520px)] overflow-y-auto">
            {query.isLoading ? (
              <div className="flex items-center justify-center p-10"><LoaderCircle className="size-6 animate-spin text-primary" /></div>
            ) : query.isError ? (
              <div className="p-6 text-center text-sm text-rose-500">Impossible de charger les notifications.</div>
            ) : query.data?.notifications.length ? (
              query.data.notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={(id) => {
                    if (!notification.read) markRead.mutate(id);
                    setOpen(false);
                  }}
                />
              ))
            ) : (
              <div className="p-10 text-center">
                <Bell className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Aucune notification</p>
                <p className="mt-1 text-xs text-muted-foreground">Les validations et exécutions apparaîtront ici.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
