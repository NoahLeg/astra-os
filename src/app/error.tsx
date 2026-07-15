"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="flex min-h-[70vh] flex-col items-center justify-center text-center"><span className="mb-4 rounded-2xl bg-rose-500/10 p-4 text-rose-500"><AlertTriangle className="size-7" /></span><h1 className="text-xl font-semibold">Une erreur inattendue est survenue</h1><p className="mt-2 max-w-md text-sm text-muted-foreground">{error.message || "Le système n’a pas pu terminer cette opération."}</p><Button className="mt-5" onClick={reset}>Réessayer</Button></div>; }
