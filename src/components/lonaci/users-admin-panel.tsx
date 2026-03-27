"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LONACI_ROLES, LONACI_ROLE_LABELS, getLonaciRoleLabel, getLonaciRoleProfile } from "@/lib/lonaci/constants";

interface AdminUser {
  id: string;
  email: string;
  matricule: string | null;
  nom: string;
  prenom: string;
  role: string;
  agenceId: string | null;
  agencesAutorisees: string[];
  modulesAutorises: string[];
  produitsAutorises: string[];
  actif: boolean;
  derniereConnexion: string | null;
}

interface AuthLogItem {
  id: string;
  email: string;
  status: "SUCCESS" | "FAILED";
  ipAddress: string | null;
  attemptedAt: string;
  reason?: string;
}

interface AgenceRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

const ROLE_OPTIONS = [...LONACI_ROLES];

const AGENCE_CODES_HELP: Array<{ code: string; libelle: string }> = [
  { code: "YOPOUGON_1", libelle: "Yopougon 1" },
  { code: "YOPOUGON_2", libelle: "Yopougon 2" },
  { code: "ABOBO", libelle: "Abobo" },
  { code: "BIETRY", libelle: "Biétry" },
  { code: "KORHOGO", libelle: "Korhogo" },
  { code: "YAMOUSSOUKRO", libelle: "Yamoussoukro" },
  { code: "COCODY_ANGRE", libelle: "Cocody Angré" },
  { code: "PLATEAU", libelle: "Plateau" },
];

export default function UsersAdminPanel() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIF" | "INACTIF">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdminUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createMatricule, setCreateMatricule] = useState("");
  const [createNom, setCreateNom] = useState("");
  const [createPrenom, setCreatePrenom] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("AGENT");
  const [createAgenceId, setCreateAgenceId] = useState("");
  const [createProduits, setCreateProduits] = useState("");
  const [createAgencesAutorisees, setCreateAgencesAutorisees] = useState("");
  const [createModulesAutorises, setCreateModulesAutorises] = useState("");
  const [authLogs, setAuthLogs] = useState<AuthLogItem[]>([]);
  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [rowMenuOpenId, setRowMenuOpenId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [editNom, setEditNom] = useState("");
  const [editPrenom, setEditPrenom] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editMatricule, setEditMatricule] = useState("");
  const [editRole, setEditRole] = useState("AGENT");
  const [editAgenceId, setEditAgenceId] = useState("");
  const [editAgencesAutorisees, setEditAgencesAutorisees] = useState("");
  const [editModulesAutorises, setEditModulesAutorises] = useState("");
  const [editProduitsAutorises, setEditProduitsAutorises] = useState("");
  const [editActif, setEditActif] = useState(true);

  const searchParams = useSearchParams();
  const createRoleProfile = getLonaciRoleProfile(createRole);
  const editRoleProfile = getLonaciRoleProfile(editRole);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?status=${statusFilter}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement utilisateurs impossible");
      }
      const data = (await res.json()) as { users: AdminUser[] };
      setItems(data.users);

      const logsRes = await fetch("/api/admin/auth-logs?page=1&pageSize=10", {
        credentials: "include",
        cache: "no-store",
      });
      if (logsRes.ok) {
        const logsData = (await logsRes.json()) as { logs: AuthLogItem[] };
        setAuthLogs(logsData.logs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/referentials", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { agences: AgenceRef[] };
        setAgences(data.agences ?? []);
      } catch {
        // Ne bloque pas l'écran admin : on peut saisir des ObjectId Mongo manuellement.
      }
    })();
  }, []);

  useEffect(() => {
    const v = searchParams.get("createUser");
    if (v === "1" || v === "true") {
      setCreateOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!rowMenuOpenId) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest?.("[data-user-menu-wrap]")) return;
      setRowMenuOpenId(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRowMenuOpenId(null);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [rowMenuOpenId]);

  async function toggleActive(u: AdminUser) {
    setBusyId(u.id);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !u.actif }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        throw new Error(body?.message ?? "Mise à jour impossible");
      }
      await load();
      setToast({ type: "success", message: !u.actif ? "Compte réactivé." : "Compte désactivé." });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  async function adminResetPassword(userId: string) {
    setBusyId(userId);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; resetToken?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? "Reset impossible");
      await load();
      setToast({
        type: "success",
        message: body?.resetToken
          ? `Token reset généré (SMTP off): ${body.resetToken}`
          : body?.message ?? "Lien de reset envoyé.",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  function splitCsv(v: string) {
    return v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function joinCsv(arr: string[]) {
    return (arr ?? []).join(", ");
  }

  function isMongoObjectIdLike(s: string) {
    return /^[a-f0-9]{24}$/i.test(s.trim());
  }

  function resolveAgenceIdToken(tokenRaw: string): string | null {
    const token = tokenRaw.trim();
    if (!token) return null;
    if (isMongoObjectIdLike(token)) return token;
    // Si c'est un code, on mappe sur l'id Mongo via le référentiel.
    if (!agences.length) return null;
    const codeNormalized = token.toUpperCase();
    const match = agences.find((a) => a.code.toUpperCase() === codeNormalized);
    return match?.id ?? null;
  }

  function mapTokensCsvToAgenceIds(csv: string): { ids: string[]; unknown: string[] } {
    const tokens = splitCsv(csv);
    const ids: string[] = [];
    const unknown: string[] = [];
    for (const t of tokens) {
      const id = resolveAgenceIdToken(t);
      if (id) ids.push(id);
      else unknown.push(t);
    }
    return { ids, unknown };
  }

  function openEdit(u: AdminUser) {
    setEditTarget(u);
    setEditNom(u.nom ?? "");
    setEditPrenom(u.prenom ?? "");
    setEditEmail(u.email ?? "");
    setEditMatricule(u.matricule ?? "");
    setEditRole(u.role ?? "AGENT");
    setEditAgenceId(u.agenceId ?? "");
    setEditAgencesAutorisees(joinCsv(u.agencesAutorisees ?? []));
    setEditModulesAutorises(joinCsv(u.modulesAutorises ?? []));
    setEditProduitsAutorises(joinCsv(u.produitsAutorises ?? []));
    setEditActif(u.actif);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editTarget) return;
    setBusyId(editTarget.id);
    setToast(null);
    setError(null);
    try {
      const agenceIdResolved = editAgenceId.trim()
        ? resolveAgenceIdToken(editAgenceId.trim())
        : null;
      if (editAgenceId.trim() && !agenceIdResolved) {
        throw new Error(
          "Agence ID invalide : fournis un ObjectId (24 hex) ou un code existant (ex: YOPOUGON_1).",
        );
      }

      const { ids: agencesAutoriseesResolved, unknown } = mapTokensCsvToAgenceIds(editAgencesAutorisees);
      if (unknown.length > 0) {
        throw new Error(`Codes/agences inconnus dans “Agences autorisées” : ${unknown.join(", ")}`);
      }

      const res = await fetch(`/api/admin/users/${editTarget.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editEmail.trim(),
          matricule: editMatricule.trim() ? editMatricule.trim().toUpperCase() : null,
          nom: editNom.trim(),
          prenom: editPrenom.trim(),
          role: editRole,
          agenceId: agenceIdResolved,
          agencesAutorisees: agencesAutoriseesResolved,
          modulesAutorises: splitCsv(editModulesAutorises),
          produitsAutorises: splitCsv(editProduitsAutorises),
          actif: editActif,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Mise à jour impossible");
      await load();
      setEditOpen(false);
      setEditTarget(null);
      setToast({ type: "success", message: "Compte mis à jour." });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  async function createAccount() {
    setBusyId("create");
    setToast(null);
    try {
      const splitCsv = (v: string) =>
        v
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);

      const agenceIdResolved = createAgenceId.trim() ? resolveAgenceIdToken(createAgenceId.trim()) : null;
      if (createAgenceId.trim() && !agenceIdResolved) {
        throw new Error(
          "Agence ID invalide : fournis un ObjectId (24 hex) ou un code existant (ex: YOPOUGON_1).",
        );
      }

      const { ids: agencesAutoriseesResolved, unknown } = mapTokensCsvToAgenceIds(createAgencesAutorisees);
      if (unknown.length > 0) {
        throw new Error(`Codes/agences inconnus dans “Agences autorisées” : ${unknown.join(", ")}`);
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createEmail,
          matricule: createMatricule || undefined,
          password: createPassword,
          nom: createNom,
          prenom: createPrenom,
          role: createRole,
          agenceId: agenceIdResolved,
          produitsAutorises: splitCsv(createProduits),
          agencesAutorisees: agencesAutoriseesResolved,
          modulesAutorises: splitCsv(createModulesAutorises),
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Création impossible");
      setCreateOpen(false);
      setCreateEmail("");
      setCreateMatricule("");
      setCreateNom("");
      setCreatePrenom("");
      setCreatePassword("");
      setCreateRole("AGENT");
      setCreateAgenceId("");
      setCreateProduits("");
      setCreateAgencesAutorisees("");
      setCreateModulesAutorises("");
      await load();
      setToast({ type: "success", message: "Compte utilisateur créé." });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  async function forceLogout(userId: string) {
    setBusyId(userId);
    setToast(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/force-logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Action impossible");
      }
      await load();
      setConfirmTarget(null);
      setToast({ type: "success", message: "Déconnexion forcée effectuée avec succès." });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 md:p-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-300">Administration</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Utilisateurs</h2>
          <p className="mt-1 text-sm text-slate-600">
            Gestion des comptes et déconnexion forcée de session active.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 xl:w-auto">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-cyan-600 bg-cyan-50 px-3 py-2 text-sm text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
          >
            Rafraîchir
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            Créer un compte
          </button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIF" | "INACTIF")}
            aria-label="Filtrer par statut"
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
          >
            <option value="ALL">Tous</option>
            <option value="ACTIF">Actifs</option>
            <option value="INACTIF">Inactifs</option>
          </select>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-600">Chargement...</p> : null}
      {toast ? (
        <p
          className={`mb-3 text-sm ${
            toast.type === "success" ? "text-emerald-300" : "text-rose-300"
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}

      {!loading ? (
        <div className="overflow-visible rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-3">Utilisateur</th>
                  <th className="px-3 py-3">Rôle</th>
                  <th className="px-3 py-3">Agence</th>
                  <th className="px-3 py-3">Statut</th>
                  <th className="px-3 py-3">Dernière connexion</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {items.map((u) => (
                  <tr key={u.id} className="border-t border-slate-200 bg-white hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <div className="font-medium">{u.prenom} {u.nom}</div>
                      <div className="text-xs text-slate-600">{u.email}</div>
                      {u.matricule ? <div className="text-[11px] text-slate-500">Matricule: {u.matricule}</div> : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{getLonaciRoleLabel(u.role)}</div>
                      {getLonaciRoleProfile(u.role)?.responsabilite ? (
                        <div className="text-[11px] text-slate-500">{getLonaciRoleProfile(u.role)?.responsabilite}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">{u.agenceId ?? "—"}</td>
                    <td className="px-3 py-3">{u.actif ? "ACTIF" : "INACTIF"}</td>
                    <td className="px-3 py-3">
                      {u.derniereConnexion ? new Date(u.derniereConnexion).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="relative inline-block" data-user-menu-wrap>
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => setRowMenuOpenId((prev) => (prev === u.id ? null : u.id))}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          aria-haspopup="menu"
                          aria-label={`Actions pour ${u.prenom} ${u.nom}`}
                        >
                          {busyId === u.id ? "..." : "Actions"}
                        </button>

                        {rowMenuOpenId === u.id ? (
                          <div
                            role="menu"
                            aria-label="Actions utilisateur"
                            className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg z-50"
                          >
                            <div className="px-3 py-2 text-xs text-slate-500">Utilisateur</div>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setRowMenuOpenId(null);
                                setConfirmTarget(u);
                              }}
                              disabled={busyId === u.id}
                              className="w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                            >
                              Forcer déconnexion
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setRowMenuOpenId(null);
                                void toggleActive(u);
                              }}
                              disabled={busyId === u.id}
                              className="w-full px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            >
                              {u.actif ? "Désactiver" : "Réactiver"}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setRowMenuOpenId(null);
                                void adminResetPassword(u.id);
                              }}
                              disabled={busyId === u.id}
                              className="w-full px-3 py-2 text-left text-sm text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                            >
                              Reset MDP
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setRowMenuOpenId(null);
                                openEdit(u);
                              }}
                              disabled={busyId === u.id}
                              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Modifier
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-5 text-center text-slate-500">
                      Aucun utilisateur.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {confirmTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-600/20 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.16em] text-rose-600">Confirmation</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Forcer la déconnexion ?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Cette action invalidera la session active de{" "}
              <span className="font-medium text-slate-900">
                {confirmTarget.prenom} {confirmTarget.nom}
              </span>{" "}
              ({confirmTarget.email}).
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={busyId === confirmTarget.id}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void forceLogout(confirmTarget.id)}
                disabled={busyId === confirmTarget.id}
                className="rounded-lg border border-rose-600 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                {busyId === confirmTarget.id ? "Déconnexion..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen && editTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-600/20 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-700">Modification</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {editTarget.prenom} {editTarget.nom}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEditTarget(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Prénom</span>
                <input
                  value={editPrenom}
                  onChange={(e) => setEditPrenom(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Nom</span>
                <input
                  value={editNom}
                  onChange={(e) => setEditNom(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Email</span>
                <input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Matricule (optionnel)</span>
                <input
                  value={editMatricule}
                  onChange={(e) => setEditMatricule(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Rôle</span>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {LONACI_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                {editRoleProfile ? (
                  <span className="text-[11px] text-slate-500">
                    {editRoleProfile.designation} — {editRoleProfile.responsabilite}
                  </span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Agence ID (optionnel)</span>
                <input
                  value={editAgenceId}
                  onChange={(e) => setEditAgenceId(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="ex: YOPOUGON_1 (ou ObjectId 24 hex)"
                />
                <span className="text-[11px] text-slate-500">
                  Codes possibles : {AGENCE_CODES_HELP.map((x) => x.code).join(", ")}
                </span>
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Actif</span>
                <select
                  value={editActif ? "true" : "false"}
                  onChange={(e) => setEditActif(e.target.value === "true")}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="true">ACTIF</option>
                  <option value="false">INACTIF</option>
                </select>
              </label>

              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Agences autorisées (CSV)</span>
                <input
                  value={editAgencesAutorisees}
                  onChange={(e) => setEditAgencesAutorisees(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="ex: YOPOUGON_1, ABOBO"
                />
                <span className="text-[11px] text-slate-500">
                  Les codes sont convertis en ids Mongo automatiquement.
                </span>
              </label>

              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Modules autorisés (CSV)</span>
                <input
                  value={editModulesAutorises}
                  onChange={(e) => setEditModulesAutorises(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="moduleA, moduleB"
                />
              </label>

              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Produits autorisés (CSV)</span>
                <input
                  value={editProduitsAutorises}
                  onChange={(e) => setEditProduitsAutorises(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="LOTO_EDITEC, PMU_PLR"
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEditTarget(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busyId === editTarget.id}
                onClick={() => void saveEdit()}
                className="rounded-lg border border-cyan-600 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-100 disabled:opacity-50"
              >
                {busyId === editTarget.id ? "Sauvegarde..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-100 px-3 py-2">
          <h3 className="text-sm font-semibold text-slate-900">Journal de connexion</h3>
          <p className="text-xs text-slate-600">Date, heure, IP et statut (succès/échec)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2">Date/heure</th>
                <th className="px-3 py-2">Compte</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Détail</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {authLogs.map((log) => (
                <tr key={log.id} className="border-t border-slate-200 bg-white">
                  <td className="px-3 py-2">{new Date(log.attemptedAt).toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2">{log.email}</td>
                  <td className="px-3 py-2">{log.ipAddress ?? "—"}</td>
                  <td className="px-3 py-2">{log.status === "SUCCESS" ? "Succès" : "Échec"}</td>
                  <td className="px-3 py-2">{log.reason ?? "—"}</td>
                </tr>
              ))}
              {!authLogs.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                    Aucun log de connexion.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-600/20 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Nouveau compte utilisateur</h3>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <input value={createPrenom} onChange={(e) => setCreatePrenom(e.target.value)} placeholder="Prénom" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
              <input value={createNom} onChange={(e) => setCreateNom(e.target.value)} placeholder="Nom" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
              <input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="Email" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2" />
              <input value={createMatricule} onChange={(e) => setCreateMatricule(e.target.value)} placeholder="Matricule (optionnel)" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
              <input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Mot de passe initial" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
              <select
                aria-label="Rôle du compte"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {LONACI_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              {createRoleProfile ? (
                <p className="text-[11px] text-slate-500 md:col-span-2">
                  {createRoleProfile.designation} — {createRoleProfile.responsabilite}
                </p>
              ) : null}
              <input value={createAgenceId} onChange={(e) => setCreateAgenceId(e.target.value)} placeholder="Agence de rattachement (ex: YOPOUGON_1 ou ObjectId 24 hex)" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
              <input value={createProduits} onChange={(e) => setCreateProduits(e.target.value)} placeholder="Produits autorisés CSV" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2" />
              <input value={createAgencesAutorisees} onChange={(e) => setCreateAgencesAutorisees(e.target.value)} placeholder="Agences autorisées CSV (ex: YOPOUGON_1, ABOBO)" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2" />
              <input value={createModulesAutorises} onChange={(e) => setCreateModulesAutorises(e.target.value)} placeholder="Modules autorisés CSV" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Annuler
              </button>
              <button
                type="button"
                disabled={busyId === "create"}
                onClick={() => void createAccount()}
                className="rounded border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                {busyId === "create" ? "Création..." : "Créer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

