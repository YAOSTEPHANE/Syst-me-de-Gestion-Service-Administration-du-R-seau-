"use client";

import { useEffect, useState } from "react";
import { getLonaciRoleLabel } from "@/lib/lonaci/constants";

interface MeUser {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: string;
  agenceId: string | null;
}

export default function ParametresComptePanel() {
  const [user, setUser] = useState<MeUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { user: MeUser };
        setUser(data.user);
      } catch {
        setError("Session invalide ou compte introuvable.");
      }
    })();
  }, []);

  if (error) {
    return <p className="text-sm text-rose-400">{error}</p>;
  }

  if (!user) {
    return <p className="text-sm text-slate-500">Chargement du profil…</p>;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Mon compte</h2>
      <p className="mt-1 text-sm text-slate-600">
        Consultation du profil. La gestion des utilisateurs et des emails SMTP est réservée au rôle{" "}
        <span className="text-amber-700">Chef(fe) de service</span>.
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
    </section>
  );
}
