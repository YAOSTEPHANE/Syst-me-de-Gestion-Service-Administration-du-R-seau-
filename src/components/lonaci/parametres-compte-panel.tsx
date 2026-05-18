"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getLonaciRoleLabel } from "@/lib/lonaci/constants";

interface MeUser {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: string;
  agenceId: string | null;
  needsPasswordChange?: boolean;
}

export default function ParametresComptePanel() {
  const searchParams = useSearchParams();
  const motDePasseObligatoire = searchParams.get("motDePasse") === "obligatoire";

  const [user, setUser] = useState<MeUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdInfo, setPwdInfo] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);

  async function loadMe() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { user: MeUser };
      setUser(data.user);
    } catch {
      setError("Session invalide ou compte introuvable.");
    }
  }

  useEffect(() => {
    void loadMe();
  }, []);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwdError(null);
    setPwdInfo(null);
    const np = newPassword.trim();
    if (np.length < 8) {
      setPwdError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (np !== confirmPassword.trim()) {
      setPwdError("La confirmation ne correspond pas.");
      return;
    }
    setPwdBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPassword,
          newPassword: np,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        throw new Error(body?.message ?? "Changement impossible");
      }
      setPwdInfo(body?.message ?? "Mot de passe mis à jour. Redirection vers la connexion…");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPwdBusy(false);
    }
  }

  if (error) {
    return <p className="text-sm text-rose-400">{error}</p>;
  }

  if (!user) {
    return <p className="text-sm text-slate-500">Chargement du profil…</p>;
  }

  const showRotation = Boolean(user.needsPasswordChange || motDePasseObligatoire);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Mon compte</h2>
      <p className="mt-1 text-sm text-slate-600">
        Consultation du profil. La gestion des autres utilisateurs et des e-mails SMTP est réservée au rôle{" "}
        <span className="text-amber-700">Chef(fe) de service</span>.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Politique de sécurité : le mot de passe doit être renouvelé au moins une fois par mois civil (référence UTC,
        à partir du 1er de chaque mois).
      </p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-600">Nom</dt>
          <dd className="text-slate-700">
            {user.prenom} {user.nom}
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">Email</dt>
          <dd className="font-mono text-slate-700">{user.email}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Rôle</dt>
          <dd className="text-slate-700">{getLonaciRoleLabel(user.role)}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Agence</dt>
          <dd className="text-slate-700">{user.agenceId ?? "—"}</dd>
        </div>
      </dl>

      {showRotation ? (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">Renouvellement du mot de passe requis</h3>
          <p className="mt-1 text-xs text-amber-950/80">
            Vous devez définir un nouveau mot de passe pour continuer à utiliser l’application (session fermée après
            validation).
          </p>
          <form onSubmit={onChangePassword} className="mt-3 grid max-w-md gap-2">
            <label className="grid gap-1">
              <span className="text-xs text-slate-700">Mot de passe actuel</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-slate-700">Nouveau mot de passe (min. 8 caractères)</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-slate-700">Confirmation</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
            {pwdError ? <p className="text-xs text-rose-700">{pwdError}</p> : null}
            {pwdInfo ? <p className="text-xs text-emerald-800">{pwdInfo}</p> : null}
            <button
              type="submit"
              disabled={pwdBusy}
              className="mt-1 w-fit rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {pwdBusy ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          Mot de passe à jour pour le mois civil en cours. Vous pouvez le modifier ici à tout moment en utilisant le
          formulaire ci-dessous si besoin.
        </p>
      )}

      {!showRotation ? (
        <form onSubmit={onChangePassword} className="mt-4 grid max-w-md gap-2 border-t border-slate-100 pt-4">
          <p className="text-xs font-medium text-slate-700">Changer le mot de passe (optionnel)</p>
          <label className="grid gap-1">
            <span className="text-xs text-slate-600">Mot de passe actuel</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-600">Nouveau mot de passe</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-600">Confirmation</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          {pwdError ? <p className="text-xs text-rose-700">{pwdError}</p> : null}
          {pwdInfo ? <p className="text-xs text-emerald-800">{pwdInfo}</p> : null}
          <button
            type="submit"
            disabled={
              pwdBusy ||
              !currentPassword.trim() ||
              newPassword.trim().length < 8 ||
              newPassword.trim() !== confirmPassword.trim()
            }
            className="w-fit rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {pwdBusy ? "…" : "Mettre à jour"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
