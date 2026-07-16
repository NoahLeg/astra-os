"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function Modal({ open, onClose, title, description, children }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#06070F]/70 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="max-h-[94vh] w-full max-w-xl overflow-auto rounded-t-[14px] border bg-card shadow-[0_28px_90px_-28px_rgba(5,6,20,.75)] sm:max-h-[90vh] sm:rounded-[10px]">
        <div className="glass sticky top-0 z-10 flex items-start justify-between gap-3 border-b p-4 sm:p-5">
          <div className="min-w-0">
            <p className="astra-eyebrow">Astra OS</p>
            <h2 className="mt-1 font-display text-lg font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Fermer">
            <X className="size-4" />
          </Button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
