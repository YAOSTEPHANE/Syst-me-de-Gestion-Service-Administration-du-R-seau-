"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("resetToken") ?? "";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Connexion impossible");
      }
      router.replace("/dashboard");
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-700">LONACI</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Connexion</h1>
        <p className="mt-1 text-sm text-slate-600">Accédez au tableau de bord métier.</p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-600">Identifiant (email ou matricule)</label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500"
              placeholder="vous@lonaci.ci ou MAT1234"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Mot de passe</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500"
              placeholder="********"
            />
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {info ? <p className="text-sm text-emerald-600">{info}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg border border-amber-600 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <form onSubmit={onRequestReset} className="mt-4 space-y-2 border-t border-slate-200 pt-4">
          <p className="text-xs font-medium text-slate-600">Réinitialiser le mot de passe</p>
          <input
            type="text"
            value={forgotIdentifier}
            onChange={(e) => setForgotIdentifier(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500"
            placeholder="Email ou matricule"
          />
          <button
            type="submit"
            disabled={forgotLoading}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {forgotLoading ? "Demande..." : "Demander un lien de reset"}
          </button>
        </form>

        {resetToken ? (
          <form onSubmit={onResetWithToken} className="mt-4 space-y-2 border-t border-slate-200 pt-4">
            <p className="text-xs font-medium text-slate-600">Nouveau mot de passe (token)</p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500"
              placeholder="Nouveau mot de passe"
            />
            <button
              type="submit"
              disabled={resetLoading}
              className="w-full rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              {resetLoading ? "Validation..." : "Valider la réinitialisation"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-sm text-slate-600">Chargement...</main>}>
      <LoginPageContent />
    </Suspense>
  );
}
