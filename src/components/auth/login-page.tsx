"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Building2, CheckCircle2, Chrome, LoaderCircle, LockKeyhole } from "lucide-react";
import { AstraMark } from "@/components/shared/astra-mark";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  email: z.email("Saisissez une adresse email valide"),
  password: z.string().min(1, "Saisissez votre mot de passe"),
  fullName: z.string().optional(),
  companyName: z.string().optional(),
});

const signupPasswordSchema = z.string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre");

type FormValues = z.infer<typeof formSchema>;

function getSafeInternalPath(value: string | null, fallback = "/") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function LoginPage() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [serverError, setServerError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { email: "", password: "", fullName: "", companyName: "" } });

  const submit = async (values: FormValues) => {
    setServerError("");
    setConfirmationMessage("");
    if (mode === "signup" && (!values.fullName?.trim() || !values.companyName?.trim())) {
      setServerError("Votre nom et le nom de l’entreprise sont obligatoires.");
      return;
    }
    if (mode === "signup") {
      const passwordValidation = signupPasswordSchema.safeParse(values.password);
      if (!passwordValidation.success) {
        setError("password", { message: passwordValidation.error.issues[0]?.message ?? "Mot de passe invalide" });
        return;
      }
    }
    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "signup"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const result = await response.json().catch(() => ({})) as { error?: string; confirmationRequired?: boolean; onboardingCompleted?: boolean; landingPage?: string };
      if (!response.ok) {
        setServerError(result.error ?? "Le service d’authentification est indisponible. Redémarrez le serveur, puis réessayez.");
        return;
      }
      if (result.confirmationRequired) {
        setConfirmationMessage("Compte créé. Consultez votre email pour confirmer votre adresse, puis connectez-vous.");
        setMode("login");
        return;
      }
      const destination = getSafeInternalPath(searchParams.get("next"), getSafeInternalPath(result.landingPage ?? null));
      window.location.replace(result.onboardingCompleted ? destination : "/onboarding/subscription");
    } catch {
      setServerError("Impossible de joindre le serveur local. Vérifiez que npm run dev est toujours actif.");
    }
  };

  const googleSignInUrl = `/api/auth/google/start?next=${encodeURIComponent(getSafeInternalPath(searchParams.get("next")))}`;
  const switchMode = (nextMode: "login" | "signup") => {
    setMode(nextMode);
    setServerError("");
    setConfirmationMessage("");
  };

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.08fr_.92fr]">
      <section className="astra-space-panel relative hidden min-h-screen border-0 border-r border-white/10 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="astra-star-field" />
        <div className="relative flex items-center gap-3"><AstraMark className="size-9" /><div><p className="font-display text-lg font-bold">Astra OS</p><p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#9DA6FF]">AI Operating System</p></div></div>
        <div className="relative grid items-center gap-8 2xl:grid-cols-[1fr_260px]">
          <div className="max-w-xl">
            <span className="astra-live-badge">Orchestration sécurisée</span>
            <p className="astra-eyebrow mt-5 text-[#9DA6FF]">Idée → Résultat</p>
            <h1 className="mt-4 max-w-[15ch] font-display text-4xl font-semibold leading-[1.08] xl:text-5xl">Reliez vos <span className="astra-accent-word">agents IA</span> au reste de votre entreprise.</h1>
            <p className="mt-5 max-w-lg leading-7 text-[#AFB2DE]">Coordonnez objectifs, outils, validations et automatisations dans un espace unique, traçable et isolé pour chaque organisation.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">{["Données isolées par entreprise", "Validation humaine intégrée", "Agents limités par permissions", "Historique et décisions traçables"].map((item) => <GlassPanel key={item} className="flex items-center gap-2 text-sm text-[#D5D7F3]" tintOpacity={0.1}><CheckCircle2 className="size-4 text-[#8C9AFF]" />{item}</GlassPanel>)}</div>
          </div>
          <div className="hidden 2xl:flex items-center justify-center h-full"><AstraMark className="size-24 text-muted-foreground/30" /></div>
        </div>
        <p className="relative font-mono text-[10px] text-[#777BA8]">Authentification Supabase · Sessions HTTP-only · Secrets chiffrés</p>
      </section>

      <section className="app-canvas flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><AstraMark className="size-9" /><span className="font-display font-bold">Astra OS</span></div>
          <div className="mb-7"><p className="astra-eyebrow">{mode === "login" ? "Bon retour" : "Créer votre espace"}</p><h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">{mode === "login" ? "Connectez-vous à Astra" : "Lancez votre entreprise sur Astra"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === "login" ? "Retrouvez vos objectifs, vos agents et vos automatisations." : "Un espace de données indépendant sera créé pour votre organisation."}</p></div>

          <div className="mb-6 grid grid-cols-2 rounded-lg border bg-muted p-1"><button type="button" onClick={() => switchMode("login")} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${mode === "login" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Connexion</button><button type="button" onClick={() => switchMode("signup")} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${mode === "signup" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Créer un compte</button></div>
          <GlassButton className="mb-5 w-full" href={googleSignInUrl}><Chrome className="size-4" />Continuer avec Google</GlassButton>
          <div className="mb-5 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>ou avec votre email</span><span className="h-px flex-1 bg-border" /></div>

          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            {mode === "signup" ? <><label className="block text-sm font-medium">Nom complet<Input autoComplete="name" placeholder="Paul Martin" className="mt-2" {...register("fullName")} /></label><label className="block text-sm font-medium">Entreprise<div className="relative mt-2"><Building2 className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input autoComplete="organization" placeholder="Acme Conseil" className="pl-9" {...register("companyName")} /></div></label></> : null}
            <label className="block text-sm font-medium">Email<Input type="email" autoComplete="email" placeholder="vous@entreprise.fr" className="mt-2" {...register("email")} />{errors.email ? <span className="mt-1 block text-xs text-rose-500">{errors.email.message}</span> : null}</label>
            <label className="block text-sm font-medium">Mot de passe<div className="relative mt-2"><LockKeyhole className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Votre mot de passe" : "8 caractères minimum"} className="pl-9" {...register("password")} /></div>{errors.password ? <span className="mt-1 block text-xs text-rose-500">{errors.password.message}</span> : null}</label>
            {serverError ? <div role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-500">{serverError}</div> : null}
            {confirmationMessage ? <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-600">{confirmationMessage}</div> : null}
            <GlassButton className="h-11 w-full" disabled={isSubmitting} onClick={handleSubmit(submit)}>{isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <>{mode === "login" ? "Se connecter" : "Créer mon espace"}<ArrowRight className="size-4" /></>}</GlassButton>
          </form>
          {mode === "login" ? <p className="mt-4 text-center"><a href="/forgot-password" className="text-sm font-medium text-primary hover:underline">Mot de passe oublié ?</a></p> : null}
          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">En continuant, vous acceptez les conditions d’utilisation et la politique de confidentialité de votre organisation.</p>
        </div>
      </section>
    </main>
  );
}
