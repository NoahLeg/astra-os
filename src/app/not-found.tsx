import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NotFound() { return <div className="flex min-h-[70vh] flex-col items-center justify-center text-center"><span className="rounded-2xl bg-indigo-500/10 p-4 text-indigo-500"><Compass className="size-7" /></span><h1 className="mt-5 text-2xl font-semibold">Espace introuvable</h1><p className="mt-2 text-sm text-muted-foreground">La ressource demandée n’existe pas ou n’est plus accessible.</p><Link href="/"><Button className="mt-5">Retour au tableau de bord</Button></Link></div>; }
