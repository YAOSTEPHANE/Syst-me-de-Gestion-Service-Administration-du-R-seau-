"use client";

import { type ReactNode, FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Fond + `<main>` identiques au rendu final pour éviter les erreurs d’hydratation avec `useSearchParams` + `Suspense`. */
function LoginShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative h-screen overflow-hidden bg-slate-950 px-4 py-5 text-slate-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(250,204,21,0.2),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.16),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 bg-size-[34px_34px] opacity-20 bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      {children}
    </main>
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
  const [formReady, setFormReady] = useState(false);

  useEffect(() => {
    setFormReady(true);
  }, []);

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
      const body = (await res.json().catch(() => null)) as { message?: string; resetToken?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Demande impossible");
      setInfo(
        body?.resetToken
          ? `Lien généré (SMTP inactif). Token: ${body.resetToken}`
          : body?.message ?? "Si le compte existe, un lien de réinitialisation a été envoyé.",
      );
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
      setInfo(body?.message ?? "Mot de passe réinitialisé. Vous pouvez vous connecter.");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setResetLoading(false);
    }
  }

  if (!formReady) {
    return (
      <LoginShell>
        <LoginFormPlaceholder />
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      <section className="relative mx-auto flex h-full w-full max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-white/15 bg-white/10 p-2 shadow-[0_30px_80px_rgba(2,6,23,0.65)] backdrop-blur-xl">
          <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="mb-5">
              <div>
                {/* Tolère les injections/extensions navigateur qui modifient parfois ce libellé avant hydratation */}
                <p suppressHydrationWarning className="text-[11px] uppercase tracking-[0.2em] text-amber-300">
                  LONACI
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-white">Connexion sécurisée</h1>
                <p className="text-sm text-slate-300">Accédez au tableau de bord métier.</p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Connexion</p>
              {/* suppressHydrationWarning sur champs: extensions (mots de passe, autofill) modifient id/htmlFor/autocomplete avant hydratation */}
              <div>
                <label
                  className="mb-1 block text-xs text-slate-300"
                  htmlFor="login-identifier"
                  suppressHydrationWarning
                >
                  Identifiant (email ou matricule)
                </label>
                <input
                  id="login-identifier"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-400 focus:border-amber-300/70 focus:bg-white/15"
                  placeholder="vous@lonaci.ci ou MAT1234"
                  autoComplete="username"
                  suppressHydrationWarning
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs text-slate-300"
                  htmlFor="login-password"
                  suppressHydrationWarning
                >
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-white/10 py-2 pr-10 pl-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-amber-300/70 focus:bg-white/15"
                    placeholder="********"
                    autoComplete="current-password"
                    suppressHydrationWarning
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? "Masquer" : "Afficher"}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg border border-amber-300/70 bg-linear-to-r from-amber-300 to-yellow-300 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:from-amber-200 hover:to-yellow-200 disabled:opacity-60"
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>
            </form>

            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setInfo(null);
                  setIsResetModalOpen(true);
                }}
                className="text-sm text-amber-200 underline underline-offset-2 transition hover:text-amber-100"
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
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Nouveau mot de passe (token)</p>
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
