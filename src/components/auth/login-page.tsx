"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Building2, CheckCircle2, LoaderCircle, LockKeyhole, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  email: z.email("Saisissez une adresse email valide"),
  password: z.string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
    .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
  fullName: z.string().optional(),
  companyName: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function LoginPage() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [serverError, setServerError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { email: "", password: "", fullName: "", companyName: "" } });

  const submit = async (values: FormValues) => {
    setServerError("");
    setConfirmationMessage("");
    if (mode === "signup" && (!values.fullName?.trim() || !values.companyName?.trim())) {
      setServerError("Votre nom et le nom de l’entreprise sont obligatoires.");
      return;
    }
    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "signup"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const result = await response.json().catch(() => ({})) as { error?: string; confirmationRequired?: boolean; onboardingCompleted?: boolean };
      if (!response.ok) {
        setServerError(result.error ?? "Le service d’authentification est indisponible. Redémarrez le serveur, puis réessayez.");
        return;
      }
      if (result.confirmationRequired) {
        setConfirmationMessage("Compte créé. Consultez votre email pour confirmer votre adresse, puis connectez-vous.");
        setMode("login");
        return;
      }
      const destination = searchParams.get("next");
      window.location.replace(result.onboardingCompleted ? (destination?.startsWith("/") ? destination : "/") : "/onboarding/subscription");
    } catch {
      setServerError("Impossible de joindre le serveur local. Vérifiez que npm run dev est toujours actif.");
    }
  };

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden border-r bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 dot-grid opacity-30" /><div className="absolute -left-32 top-24 size-96 rounded-full bg-indigo-500/20 blur-3xl" /><div className="absolute bottom-0 right-0 size-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400"><Sparkles className="size-5" /></span><div><p className="font-semibold">Astra OS</p><p className="text-xs text-slate-400">AI Operating System</p></div></div>
        <div className="relative max-w-xl"><p className="text-sm font-medium text-indigo-300">IDÉE → RÉSULTAT</p><h1 className="mt-4 text-4xl font-semibold leading-tight">Un espace intelligent et privé pour chaque entreprise.</h1><p className="mt-5 max-w-lg leading-7 text-slate-400">Coordonnez vos objectifs, agents, validations et automatisations sans mélanger les données de vos organisations.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{["Données isolées par entreprise", "Validation humaine intégrée", "Agents limités par permissions", "Historique et décisions traçables"].map((item) => <div key={item} className="flex items-center gap-2 text-sm text-slate-300"><CheckCircle2 className="size-4 text-emerald-400" />{item}</div>)}</div></div>
        <p className="relative text-xs text-slate-500">Authentification sécurisée par Supabase · Sessions HTTP-only</p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10"><div className="w-full max-w-md"><div className="mb-8 flex items-center gap-3 lg:hidden"><span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white"><Sparkles className="size-5" /></span><span className="font-semibold">Astra OS</span></div><div className="mb-7"><p className="text-sm font-medium text-indigo-500">{mode === "login" ? "Bon retour" : "Créer votre espace"}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{mode === "login" ? "Connectez-vous à Astra" : "Lancez votre entreprise sur Astra"}</h2><p className="mt-2 text-sm text-muted-foreground">{mode === "login" ? "Accédez à votre espace de travail et à vos agents." : "Un espace de données indépendant sera créé pour votre organisation."}</p></div>
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1"><button type="button" onClick={() => { setMode("login"); setServerError(""); }} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Connexion</button><button type="button" onClick={() => { setMode("signup"); setServerError(""); }} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "signup" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Créer un compte</button></div>
        <form onSubmit={handleSubmit(submit)} className="space-y-4">{mode === "signup" && <><label className="block text-sm font-medium">Nom complet<Input autoComplete="name" placeholder="Paul Martin" className="mt-2" {...register("fullName")} /></label><label className="block text-sm font-medium">Entreprise<div className="relative mt-2"><Building2 className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input autoComplete="organization" placeholder="Acme Conseil" className="pl-9" {...register("companyName")} /></div></label></>}<label className="block text-sm font-medium">Email<Input type="email" autoComplete="email" placeholder="vous@entreprise.fr" className="mt-2" {...register("email")} />{errors.email && <span className="mt-1 block text-xs text-rose-500">{errors.email.message}</span>}</label><label className="block text-sm font-medium">Mot de passe<div className="relative mt-2"><LockKeyhole className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="8 caractères minimum" className="pl-9" {...register("password")} /></div>{errors.password && <span className="mt-1 block text-xs text-rose-500">{errors.password.message}</span>}</label>{serverError && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-500">{serverError}</div>}{confirmationMessage && <div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-600">{confirmationMessage}</div>}<Button type="submit" className="h-11 w-full" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <>{mode === "login" ? "Se connecter" : "Créer mon espace"}<ArrowRight className="size-4" /></>}</Button></form>
        {mode === "login" && <p className="mt-4 text-center"><a href="/forgot-password" className="text-sm font-medium text-indigo-500 hover:underline">Mot de passe oublié ?</a></p>}
        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">En continuant, vous acceptez les conditions d’utilisation et la politique de confidentialité de votre organisation.</p>
      </div></section>
    </main>
  );
}
