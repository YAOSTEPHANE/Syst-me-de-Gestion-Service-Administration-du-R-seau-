"use client";

import { Badge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { Surface } from "@/components/lonaci/ui/surface";
import { getLonaciRoleLabel } from "@/lib/lonaci/constants";
import { notify } from "@/lib/toast";
import { KeyRound, LockKeyhole, Mail, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

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
      notify.error(err, "Changement du mot de passe impossible.");
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
  const inputClassName =
    "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20";

  return (
    <div className="space-y-4">
      <Surface padding="lg" className="border-slate-200 bg-[#f7f9fc]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#102a43] text-orange-300 shadow-sm">
              <UserRound size={23} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-700">Profil connecté</p>
              <p className="truncate text-lg font-bold text-[#102a43]">
                {user.prenom} {user.nom}
              </p>
            </div>
          </div>
          <Badge tone="brand" className="w-fit">
            <ShieldCheck size={14} aria-hidden="true" />
            {getLonaciRoleLabel(user.role)}
          </Badge>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Mail size={15} aria-hidden="true" className="text-orange-600" />
              Adresse e-mail
            </dt>
            <dd className="mt-1 break-all text-sm font-semibold text-[#102a43]">{user.email}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <MapPin size={15} aria-hidden="true" className="text-orange-600" />
              Agence
            </dt>
            <dd className="mt-1 text-sm font-semibold text-[#102a43]">{user.agenceId ?? "—"}</dd>
          </div>
        </dl>

        <div className="mt-4 flex gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs leading-5 text-orange-950">
          <LockKeyhole size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-orange-700" />
          <p>
            La gestion des autres utilisateurs et des e-mails SMTP est réservée au rôle Chef(fe) de service. Le mot
            de passe doit être renouvelé au moins une fois par mois civil (référence UTC).
          </p>
        </div>
      </Surface>

      <Surface
        padding="lg"
        elevated={showRotation}
        className={showRotation ? "border-orange-300 bg-orange-50/60" : "border-slate-200 bg-white"}
      >
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-[#102a43]">
              <KeyRound size={19} aria-hidden="true" className="text-orange-600" />
              {showRotation ? "Renouvellement requis" : "Sécurité du compte"}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {showRotation
                ? "Définissez un nouveau mot de passe pour continuer à utiliser l’application."
                : "Votre mot de passe est à jour. Vous pouvez le modifier à tout moment."}
            </p>
          </div>
          <Badge tone={showRotation ? "warning" : "success"} className="w-fit">
            {showRotation ? "Action requise" : "À jour"}
          </Badge>
        </div>

        <form onSubmit={onChangePassword} className="mt-5 grid max-w-xl gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-slate-700">Mot de passe actuel</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required={showRotation}
              className={inputClassName}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Nouveau mot de passe</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required={showRotation}
                minLength={8}
                aria-describedby="password-requirements"
                className={inputClassName}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Confirmation</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required={showRotation}
                minLength={8}
                className={inputClassName}
              />
            </label>
          </div>
          <p id="password-requirements" className="text-xs text-slate-500">
            Utilisez au minimum 8 caractères.
          </p>

          <div aria-live="polite">
            {pwdError ? <p className="text-xs font-medium text-rose-700">{pwdError}</p> : null}
            {pwdInfo ? <p className="text-xs font-medium text-emerald-800">{pwdInfo}</p> : null}
          </div>
          <Button
            type="submit"
            variant={showRotation ? "primary" : "secondary"}
            leadingIcon={ShieldCheck}
            loading={pwdBusy}
            disabled={
              !showRotation &&
              (!currentPassword.trim() ||
                newPassword.trim().length < 8 ||
                newPassword.trim() !== confirmPassword.trim())
            }
            className="w-full justify-center sm:w-fit"
          >
            {showRotation ? "Enregistrer le nouveau mot de passe" : "Mettre à jour"}
          </Button>
        </form>
      </Surface>
    </div>
  );
}
