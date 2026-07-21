"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, Suspense, useState } from "react";

import { LonaciBrand } from "@/components/lonaci/ui/brand";
import { notify } from "@/lib/toast";

import styles from "./login.module.css";

/** Fond + `<main>` identiques au rendu final pour éviter les erreurs d’hydratation avec `useSearchParams` + `Suspense`. */
function LoginShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b18] px-4 py-6 text-slate-100 sm:px-7 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_8%,rgba(29,78,216,0.22),transparent_34%),radial-gradient(circle_at_92%_85%,rgba(245,158,11,0.15),transparent_32%),linear-gradient(135deg,#050b18_0%,#081427_48%,#07101e_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-size-[42px_42px] opacity-[0.14] bg-[linear-gradient(to_right,rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.16)_1px,transparent_1px)] mask-[linear-gradient(to_bottom,black,transparent_90%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full border border-blue-400/10 bg-blue-400/5 blur-3xl" />
      {children}
    </main>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "[&_.lonaci-ui-brand__wordmark_small]:text-xs" : ""}>
      <LonaciBrand inverse />
    </div>
  );
}

function SecurityIcon() {
  return <ShieldCheck className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />;
}

function FestiveLotteryBalls({ compact = false }: { compact?: boolean }) {
  const balls = [
    { number: "2", colorClass: styles.blue },
    { number: "0", colorClass: styles.silver },
    { number: "2", colorClass: styles.orange },
    { number: "6", colorClass: styles.green },
  ];

  return (
    <div
      className={`${styles.lotteryBalls} ${compact ? styles.compact : ""}`}
      aria-hidden="true"
    >
      {balls.map((ball, index) => (
        <div
          key={`${ball.number}-${index}`}
          className={`${styles.lotteryBall} ${ball.colorClass}`}
        >
          <span className={styles.number}>{ball.number}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Squelette sans `<input>` : évite les extensions (gestionnaires de mots de passe) qui
 * modifient id/htmlFor/autocomplete avant hydratation et provoquent un mismatch.
 */
function LoginFormPlaceholder() {
  return (
    <section className="relative mx-auto flex h-full w-full max-w-md items-center justify-center">
      <div className="w-full rounded-3xl border border-white/15 bg-white/10 p-2 shadow-[0_30px_80px_rgba(2,6,23,0.65)] backdrop-blur-xl">
        <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300">LONACI</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">Connexion sécurisée</h1>
            <p className="text-sm text-slate-300">Accédez au tableau de bord métier.</p>
          </div>
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4" aria-hidden="true">
            <div className="h-3 w-20 rounded bg-white/10" />
            <div className="h-10 rounded-lg bg-white/10" />
            <div className="h-10 rounded-lg bg-white/10" />
            <div className="h-10 rounded-lg bg-amber-300/25" />
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">Préparation du formulaire…</p>
        </div>
      </div>
    </section>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("resetToken") ?? "";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(Boolean(resetToken));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = (await res.json().catch(() => null)) as
        | { message?: string; user?: { needsPasswordChange?: boolean } }
        | null;
      if (!res.ok) {
        throw new Error(data?.message ?? "Connexion impossible");
      }
      notify.success("Connexion réussie.");
      if (data?.user?.needsPasswordChange) {
        router.replace("/parametres?motDePasse=obligatoire");
      } else {
        router.replace("/dashboard");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  async function onRequestReset(e: FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/reset-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Demande impossible");
      const message = body?.message ?? "Si le compte existe, un lien de réinitialisation a été envoyé.";
      setInfo(null);
      notify.info(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setForgotLoading(false);
    }
  }

  async function onResetWithToken(e: FormEvent) {
    e.preventDefault();
    if (!resetToken) return;
    setResetLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Réinitialisation impossible");
      setInfo(null);
      notify.success(body?.message ?? "Mot de passe réinitialisé. Vous pouvez vous connecter.");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <LoginShell>
      <section className="relative mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-stretch overflow-hidden rounded-4xl border border-white/10 bg-white/5.5 shadow-[0_40px_120px_rgba(0,0,0,0.48)] backdrop-blur-2xl lg:grid-cols-[1.08fr_0.92fr]">
        <aside className="relative hidden overflow-hidden border-r border-white/10 p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full border border-amber-300/15 bg-amber-300/6" />
          <div className="pointer-events-none absolute right-12 bottom-12 h-52 w-52 rounded-full border border-blue-300/10" />

          <BrandMark />

          <div className="relative max-w-xl py-12">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-300/15 bg-blue-300/[0.07] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
              Plateforme opérationnelle
            </div>
            <h2 className="max-w-lg text-4xl leading-[1.08] font-semibold tracking-[-0.035em] text-white xl:text-5xl">
              Pilotez le réseau avec{" "}
              <span className="mt-1 block bg-linear-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-transparent">
                précision et confiance.
              </span>
            </h2>
            <p className="mt-6 max-w-lg text-[15px] leading-7 text-slate-300">
              Un environnement unifié pour gérer les dossiers, les validations et le suivi du réseau commercial LONACI.
            </p>

            <div className="mt-5">
              <FestiveLotteryBalls />
            </div>

            <div className="mt-4 grid max-w-lg grid-cols-3 gap-3">
              {[
                ["Temps réel", "Suivi centralisé"],
                ["Sécurisé", "Accès par rôle"],
                ["Traçable", "Journal d’audit"],
              ].map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/4.5 p-3.5">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">{description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative border-t border-white/10 pt-5 text-[11px] text-slate-500">
            <span>© 2026 LONACI</span>
          </div>
        </aside>

        <div className="flex items-center justify-center p-4 sm:p-8 lg:p-10 xl:p-14">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <BrandMark compact />
              <FestiveLotteryBalls compact />
            </div>

            <div className="mb-7">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">
                Espace collaborateurs
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.025em] text-white">Heureux de vous revoir</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Connectez-vous avec vos identifiants professionnels.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              {/* suppressHydrationWarning sur champs: extensions (mots de passe, autofill) modifient id/htmlFor/autocomplete avant hydratation */}
              <div>
                <label
                  className="mb-2 block text-xs font-medium text-slate-300"
                  htmlFor="login-identifier"
                  suppressHydrationWarning
                >
                  Identifiant (email ou matricule)
                </label>
                <div className="group relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-4 h-4.5 w-4.5 -translate-y-1/2 text-slate-500 transition group-focus-within:text-orange-300" strokeWidth={1.7} aria-hidden="true" />
                  <input
                    id="login-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/5.5 pr-4 pl-12 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-amber-300/60 focus:bg-white/8 focus:ring-4 focus:ring-amber-300/[0.07]"
                    placeholder="vous@lonaci.ci ou MAT1234"
                    autoComplete="username"
                    suppressHydrationWarning
                  />
                </div>
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-medium text-slate-300"
                  htmlFor="login-password"
                  suppressHydrationWarning
                >
                  Mot de passe
                </label>
                <div className="group relative">
                  <LockKeyhole className="pointer-events-none absolute top-1/2 left-4 h-4.5 w-4.5 -translate-y-1/2 text-slate-500 transition group-focus-within:text-orange-300" strokeWidth={1.7} aria-hidden="true" />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 w-full rounded-xl border border-white/10 bg-white/5.5 pr-20 pl-12 text-sm text-white outline-none transition placeholder:text-slate-600 hover:border-white/20 focus:border-amber-300/60 focus:bg-white/8 focus:ring-4 focus:ring-amber-300/[0.07]"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    suppressHydrationWarning
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 transition hover:bg-white/8 hover:text-white"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="group relative h-12 w-full overflow-hidden rounded-xl border border-amber-200/50 bg-linear-to-r from-amber-300 via-yellow-300 to-amber-400 px-4 text-sm font-bold text-slate-950 shadow-[0_14px_34px_rgba(245,158,11,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(245,158,11,0.3)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-60"
              >
                <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <span className="relative inline-flex items-center gap-2">
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                      Connexion…
                    </>
                  ) : (
                    <>
                      Se connecter
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </>
                  )}
                </span>
              </button>
            </form>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setInfo(null);
                  setIsResetModalOpen(true);
                }}
                className="text-xs font-medium text-slate-400 transition hover:text-amber-200"
              >
                Mot de passe oublié ?
              </button>
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
            ) : null}
            {info ? (
              <p className="mt-4 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {info}
              </p>
            ) : null}

            <div className="mt-8 flex items-center justify-center gap-2 border-t border-white/8 pt-5 text-[11px] text-slate-500">
              <SecurityIcon />
              <span>Connexion chiffrée · Accès strictement réservé</span>
            </div>
          </div>
        </div>
      </section>

      {isResetModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/75"
            aria-label="Fermer"
            onClick={() => {
              if (forgotLoading || resetLoading) return;
              setIsResetModalOpen(false);
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-slate-900/95 p-4 shadow-2xl backdrop-blur">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-sky-200">Assistance</p>
                <h2 className="text-lg font-semibold text-white">Réinitialiser le mot de passe</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                disabled={forgotLoading || resetLoading}
                className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-60"
              >
                Fermer
              </button>
            </div>

            <form onSubmit={onRequestReset} className="space-y-2.5 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Demander un lien</p>
              <input
                type="text"
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-400 focus:border-sky-300/70 focus:bg-white/15"
                placeholder="Email ou matricule"
              />
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/15 disabled:opacity-60"
              >
                {forgotLoading ? "Demande..." : "Demander un lien"}
              </button>
            </form>

            {resetToken ? (
              <form onSubmit={onResetWithToken} className="mt-3 space-y-2.5 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Nouveau mot de passe</p>
                <div suppressHydrationWarning>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                    className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-400 focus:border-emerald-300/70 focus:bg-white/15"
                    placeholder="Nouveau mot de passe"
                  />
                </div>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full rounded-lg border border-emerald-300/60 bg-emerald-300/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/20 disabled:opacity-60"
                >
                  {resetLoading ? "Validation..." : "Valider la réinitialisation"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </LoginShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <LoginShell>
          <LoginFormPlaceholder />
        </LoginShell>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
