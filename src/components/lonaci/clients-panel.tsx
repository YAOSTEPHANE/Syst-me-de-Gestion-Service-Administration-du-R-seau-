"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CLIENT_CODE_PREFIX,
  CLIENT_STATUT_LABELS,
  CLIENT_STATUTS,
  type ClientStatut,
} from "@/lib/lonaci/client-constants";
import type { AgenceZoneGeographique } from "@/lib/lonaci/types";
import { OTHER_PRODUCT_CODE } from "@/lib/lonaci/produit-constants";
import ProduitSelectedPiecesChecklist from "@/components/lonaci/produit-selected-pieces-checklist";

type ListItem = {
  id: string;
  code: string;
  raisonSociale: string;
  nomComplet: string | null;
  cniNumero: string | null;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
  statut: string;
  updatedAt: string;
};

type AgenceRef = {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  zoneGeographique?: AgenceZoneGeographique;
};

type ProduitRef = {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  documentsChecklist?: Array<{ id: string; libelle: string; obligatoire?: boolean }>;
};

type ClientDetail = {
  id: string;
  code: string;
  raisonSociale: string;
  nomComplet: string | null;
  cniNumero: string | null;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
  statut: string;
  notes: string | null;
};

function libelleZoneGeographique(z: AgenceZoneGeographique | undefined): string {
  if (!z) return "";
  return z === "ABIDJAN" ? "Abidjan" : "Intérieur";
}

function libelleAgenceAvecZone(a: AgenceRef): string {
  const zone = libelleZoneGeographique(a.zoneGeographique);
  const base = `${a.code} — ${a.libelle}`;
  return zone ? `${base} (${zone})` : base;
}

const STATUT_TOKENS: Record<string, string> = {
  ACTIF: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INACTIF: "border-slate-300 bg-slate-100 text-slate-700",
};

export default function ClientsPanel() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [filterAgence, setFilterAgence] = useState("");
  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [produitsAutorises, setProduitsAutorises] = useState<string[]>([]);
  const [meRole, setMeRole] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingClientCode, setEditingClientCode] = useState<string | null>(null);
  /** Affiché après création : identifiant unique auto-généré par le système. */
  const [createdClient, setCreatedClient] = useState<{
    id: string;
    code: string;
    nomComplet: string;
  } | null>(null);
  const [form, setForm] = useState({
    nomComplet: "",
    raisonSociale: "",
    cniNumero: "",
    nomContact: "",
    email: "",
    telephone: "",
    adresse: "",
    ville: "",
    codePostal: "",
    agenceId: "",
    statut: "ACTIF" as ClientStatut,
    notes: "",
  });

  const agencesActives = useMemo(() => agences.filter((a) => a.actif), [agences]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canDeactivate = meRole === "ASSIST_CDS" || meRole === "CHEF_SERVICE";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterAgence) params.set("agenceId", filterAgence);
      const res = await fetch(`/api/clients?${params}`, { credentials: "include", cache: "no-store" });
      // #region agent log
      fetch("http://127.0.0.1:27772/ingest/4bb0b21c-00fd-438b-b24a-787fe0e18287", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "669066" },
        body: JSON.stringify({
          sessionId: "669066",
          hypothesisId: "H3",
          location: "clients-panel.tsx:load",
          message: "clients panel fetch /api/clients response meta",
          data: { ok: res.ok, status: res.status },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement impossible");
      }
      const data = (await res.json()) as { items: ListItem[]; total: number };
      // #region agent log
      fetch("http://127.0.0.1:27772/ingest/4bb0b21c-00fd-438b-b24a-787fe0e18287", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "669066" },
        body: JSON.stringify({
          sessionId: "669066",
          hypothesisId: "H3",
          location: "clients-panel.tsx:load",
          message: "clients panel parsed JSON",
          data: {
            total: data.total ?? null,
            itemsLen: Array.isArray(data.items) ? data.items.length : null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      // #region agent log
      fetch("http://127.0.0.1:27772/ingest/4bb0b21c-00fd-438b-b24a-787fe0e18287", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "669066" },
        body: JSON.stringify({
          sessionId: "669066",
          hypothesisId: "H3",
          location: "clients-panel.tsx:load",
          message: "clients panel load error",
          data: { err: e instanceof Error ? e.message : String(e) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setError(e instanceof Error ? e.message : "Impossible de charger les clients.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, filterStatut, filterAgence]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [refRes, meRes] = await Promise.all([
          fetch("/api/referentials", { credentials: "include", cache: "no-store" }),
          fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
        ]);
        if (refRes.ok) {
          const data = (await refRes.json()) as { agences: AgenceRef[]; produits: ProduitRef[] };
          setAgences(data.agences ?? []);
          setProduits((data.produits ?? []).filter((p) => p.actif));
        }
        if (meRes.ok) {
          const me = (await meRes.json()) as { user: { role: string } };
          setMeRole(me.user?.role ?? "");
        }
      } catch {
        // silencieux : filtres agence restent vides
      }
    })();
  }, []);

  function resetForm() {
    setForm({
      nomComplet: "",
      raisonSociale: "",
      cniNumero: "",
      nomContact: "",
      email: "",
      telephone: "",
      adresse: "",
      ville: "",
      codePostal: "",
      agenceId: "",
      statut: "ACTIF",
      notes: "",
    });
    setEditingId(null);
    setEditingClientCode(null);
    setCreatedClient(null);
    setProduitsAutorises([]);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  async function openEdit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${id}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { client: ClientDetail };
      const c = data.client;
      setEditingId(c.id);
      setEditingClientCode(c.code);
      setForm({
        nomComplet: c.nomComplet ?? c.raisonSociale,
        raisonSociale:
          c.nomComplet && c.raisonSociale !== c.nomComplet ? c.raisonSociale : "",
        cniNumero: c.cniNumero ?? "",
        nomContact: c.nomContact ?? "",
        email: c.email ?? "",
        telephone: c.telephone ?? "",
        adresse: c.adresse ?? "",
        ville: c.ville ?? "",
        codePostal: c.codePostal ?? "",
        agenceId: c.agenceId ?? "",
        statut: (CLIENT_STATUTS as readonly string[]).includes(c.statut) ? (c.statut as ClientStatut) : "ACTIF",
        notes: c.notes ?? "",
      });
      setProduitsAutorises([...(c.produitsAutorises ?? [])]);
      setModalOpen(true);
    } catch {
      setError("Impossible de charger la fiche client.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nomComplet.trim()) return;
    setBusyId(editingId ?? "new");
    setError(null);
    try {
      if (editingId) {
        const res = await fetch(`/api/clients/${editingId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nomComplet: form.nomComplet.trim(),
            raisonSociale: form.raisonSociale.trim() || form.nomComplet.trim(),
            cniNumero: form.cniNumero.trim() || null,
            nomContact: form.nomContact.trim() || null,
            email: form.email.trim() || null,
            telephone: form.telephone.trim() || null,
            adresse: form.adresse.trim() || null,
            ville: form.ville.trim() || null,
            codePostal: form.codePostal.trim() || null,
            agenceId: form.agenceId.trim() || null,
            statut: form.statut,
            notes: form.notes.trim() || null,
            produitsAutorises,
          }),
        });
        if (!res.ok) throw new Error();
      } else {
        if (!form.agenceId.trim()) {
          setError("Sélectionnez une agence de rattachement selon votre zone.");
          setBusyId(null);
          return;
        }
        const res = await fetch("/api/clients", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nomComplet: form.nomComplet.trim(),
            raisonSociale: form.raisonSociale.trim() || null,
            cniNumero: form.cniNumero.trim() || null,
            nomContact: form.nomContact.trim() || null,
            email: form.email.trim() || null,
            telephone: form.telephone.trim() || null,
            adresse: form.adresse.trim() || null,
            ville: form.ville.trim() || null,
            codePostal: form.codePostal.trim() || null,
            agenceId: form.agenceId.trim(),
            statut: form.statut,
            notes: form.notes.trim() || null,
            produitsAutorises,
          }),
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { client: ClientDetail };
        setCreatedClient({
          id: data.client.id,
          code: data.client.code,
          nomComplet: data.client.nomComplet?.trim() || data.client.raisonSociale,
        });
        await load();
        return;
      }
      setModalOpen(false);
      resetForm();
      await load();
    } catch {
      setError(editingId ? "Enregistrement impossible." : "Création impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function deactivate(id: string, code: string) {
    if (!window.confirm(`Désactiver le client ${code} ?`)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError("Désactivation impossible.");
    } finally {
      setBusyId(null);
    }
  }

  function agenceLabel(agenceId: string | null) {
    if (!agenceId) return "—";
    const ag = agences.find((a) => a.id === agenceId);
    return ag ? libelleAgenceAvecZone(ag) : agenceId;
  }

  function displayNomPrincipal(row: ListItem): string {
    return row.nomComplet?.trim() || row.raisonSociale;
  }

  function formatProduitsCell(codes: string[]): string {
    if (!codes.length) return "—";
    return codes
      .map((c) => {
        const p = produits.find((pr) => pr.code === c);
        return p ? p.code : c;
      })
      .join(", ");
  }

  const produitsAutorisesFields = (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Produits</p>
      <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
        <p className="mb-1 text-xs font-medium text-slate-700">Produits autorisés</p>
        <p className="mb-2 text-[11px] text-slate-600">
          Limite les produits proposés lors de la création de cautions pour ce client. Laissez vide pour
          autoriser tout le référentiel actif.
        </p>
        {produits.length === 0 ? (
          <p className="text-xs text-amber-800">
            Aucun produit actif chargé. Vérifiez le référentiel{" "}
            <span className="font-medium">Administration → Produits</span>, puis rouvrez ce formulaire.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {produits.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={produitsAutorises.includes(p.code)}
                  onChange={(e) =>
                    setProduitsAutorises((curr) =>
                      e.target.checked ? [...curr, p.code] : curr.filter((code) => code !== p.code),
                    )
                  }
                />
                <span>
                  {p.code} <span className="text-slate-500">({p.libelle})</span>
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs text-slate-800">
              <input
                type="checkbox"
                checked={produitsAutorises.includes(OTHER_PRODUCT_CODE)}
                onChange={(e) =>
                  setProduitsAutorises((curr) =>
                    e.target.checked
                      ? [...curr, OTHER_PRODUCT_CODE]
                      : curr.filter((code) => code !== OTHER_PRODUCT_CODE),
                  )
                }
              />
              <span>{OTHER_PRODUCT_CODE}</span>
            </label>
          </div>
        )}
        <ProduitSelectedPiecesChecklist
          selectedProduitCodes={produitsAutorises}
          produits={produits}
          className="mt-3"
        />
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Clients</h2>
            <p className="mt-1 text-sm text-slate-600">
              Référentiel des comptes clients et tiers (distinct des concessionnaires PDV). À la création, le
              système attribue un identifiant unique auto-généré ({CLIENT_CODE_PREFIX}-000001, etc.) — à communiquer au
              client pour les cautions et le suivi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreate()}
            className="rounded-lg border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Nouveau client
          </button>
        </div>
      </header>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Nom, raison sociale, CNI, code, téléphone…"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
          <select
            value={filterStatut}
            aria-label="Filtrer par statut"
            onChange={(e) => {
              setPage(1);
              setFilterStatut(e.target.value);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Tous les statuts</option>
            {CLIENT_STATUTS.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUT_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={filterAgence}
            aria-label="Filtrer par agence"
            onChange={(e) => {
              setPage(1);
              setFilterAgence(e.target.value);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Toutes les agences</option>
            {agencesActives.map((a) => (
              <option key={a.id} value={a.id}>
                {libelleAgenceAvecZone(a)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setQ("");
              setFilterStatut("");
              setFilterAgence("");
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Réinitialiser filtres
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">{total} client(s)</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              Préc.
            </button>
            <span className="text-xs text-slate-500">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              Suiv.
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3">Nom complet</th>
                <th className="py-2 pr-3">CNI</th>
                <th className="py-2 pr-3">Contact</th>
                <th className="py-2 pr-3">Agence (zone)</th>
                <th className="py-2 pr-3">Produits</th>
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    Chargement…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    Aucun client pour ces filtres.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-800">{row.code}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      <div>{displayNomPrincipal(row)}</div>
                      {row.nomComplet && row.raisonSociale !== row.nomComplet ? (
                        <div className="text-xs font-normal text-slate-500">{row.raisonSociale}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">{row.cniNumero ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-700">
                      <div className="text-xs text-slate-500">
                        {[row.telephone, row.email].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{agenceLabel(row.agenceId)}</td>
                    <td className="py-2 pr-3 text-xs text-slate-700" title={formatProduitsCell(row.produitsAutorises ?? [])}>
                      {formatProduitsCell(row.produitsAutorises ?? [])}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUT_TOKENS[row.statut] ?? STATUT_TOKENS.INACTIF}`}
                      >
                        {CLIENT_STATUT_LABELS[row.statut as ClientStatut] ?? row.statut}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void openEdit(row.id)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800 hover:border-cyan-500 hover:bg-cyan-50/70 disabled:opacity-50"
                        >
                          Modifier
                        </button>
                        {canDeactivate ? (
                          <button
                            type="button"
                            disabled={busyId === row.id || row.statut === "INACTIF"}
                            onClick={() => void deactivate(row.id, row.code)}
                            className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-40"
                          >
                            Désactiver
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="clients-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            {createdClient ? (
              <div className="space-y-4">
                <h3 id="clients-modal-title" className="text-base font-semibold text-emerald-900">
                  Client enregistré
                </h3>
                <p className="text-sm text-slate-600">
                  Le compte de <strong className="text-slate-900">{createdClient.nomComplet}</strong> a été créé.
                  Communiquez-lui son identifiant unique ci-dessous (recherche cautions, suivi dossier).
                </p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Identifiant client (auto-généré)
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tracking-wide text-emerald-950">
                    {createdClient.code}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  Référence technique interne :{" "}
                  <span className="font-mono text-slate-700">{createdClient.id}</span>
                </p>
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(createdClient.code).then(
                        () => setError(null),
                        () => setError("Copie du code impossible."),
                      );
                    }}
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Copier le code
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h3 id="clients-modal-title" className="text-base font-semibold text-slate-900">
                  {editingId ? "Modifier le client" : "Nouveau client"}
                </h3>
                <form onSubmit={(e) => void saveClient(e)} className="mt-4 space-y-3">
                  {editingId && editingClientCode ? (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
                        Identifiant client
                      </p>
                      <p className="mt-0.5 font-mono text-lg font-semibold text-indigo-950">{editingClientCode}</p>
                      <p className="mt-1 text-xs text-slate-600">Attribué automatiquement à la création — non modifiable.</p>
                    </div>
                  ) : null}
                  {editingId ? (
                meRole === "CHEF_SERVICE" ? (
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      Agence de rattachement <span className="text-slate-500">(zone)</span>
                    </span>
                    <select
                      required
                      aria-label="Agence de rattachement selon la zone"
                      value={form.agenceId}
                      onChange={(e) => setForm((f) => ({ ...f, agenceId: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {agencesActives.map((a) => (
                        <option key={a.id} value={a.id}>
                          {libelleAgenceAvecZone(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Agence de rattachement (zone)
                    </div>
                    <p className="mt-0.5 text-slate-800">{agenceLabel(form.agenceId) || "—"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Seul le rôle Chef(fe) de service peut modifier l’agence.
                    </p>
                  </div>
                )
              ) : null}
              {produitsAutorisesFields}
              {!editingId ? (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Fiche complète — nouveau client
                  </p>
                  <p className="text-xs text-slate-600">
                    L’identifiant unique ({CLIENT_CODE_PREFIX}-000001, …) est attribué automatiquement par le
                    système à l’enregistrement ; communiquez-le au client après création.
                  </p>
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      Agence de rattachement <span className="text-slate-500">(selon votre zone)</span> *
                    </span>
                    <select
                      required
                      aria-label="Agence de rattachement selon la zone"
                      value={form.agenceId}
                      onChange={(e) => setForm((f) => ({ ...f, agenceId: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">— Choisir une agence —</option>
                      {agencesActives.map((a) => (
                        <option key={a.id} value={a.id}>
                          {libelleAgenceAvecZone(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Nom complet *</span>
                    <input
                      required
                      value={form.nomComplet}
                      onChange={(e) => setForm((f) => ({ ...f, nomComplet: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      autoComplete="name"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Raison sociale / dénomination (optionnel)</span>
                    <input
                      value={form.raisonSociale}
                      onChange={(e) => setForm((f) => ({ ...f, raisonSociale: e.target.value }))}
                      placeholder="Si personne morale ou enseigne distincte du nom"
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Numéro de CNI</span>
                    <input
                      value={form.cniNumero}
                      onChange={(e) => setForm((f) => ({ ...f, cniNumero: e.target.value }))}
                      placeholder="Carte nationale d’identité"
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                      autoComplete="off"
                    />
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Coordonnées de contact
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="text-slate-600">Téléphone</span>
                        <input
                          value={form.telephone}
                          onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="tel"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-slate-600">E-mail</span>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="email"
                        />
                      </label>
                    </div>
                  </div>
                  <label className="block text-sm">
                    <span className="text-slate-600">Autre interlocuteur (optionnel)</span>
                    <input
                      value={form.nomContact}
                      onChange={(e) => setForm((f) => ({ ...f, nomContact: e.target.value }))}
                      placeholder="Nom d’une personne à joindre si différente du client"
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Adresse</span>
                    <input
                      value={form.adresse}
                      onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-slate-600">Ville</span>
                      <input
                        value={form.ville}
                        onChange={(e) => setForm((f) => ({ ...f, ville: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-600">Code postal</span>
                      <input
                        value={form.codePostal}
                        onChange={(e) => setForm((f) => ({ ...f, codePostal: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block text-sm">
                    <span className="text-slate-600">Notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={3}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              ) : (
                <>
                  <label className="block text-sm">
                    <span className="text-slate-600">Nom complet *</span>
                    <input
                      required
                      value={form.nomComplet}
                      onChange={(e) => setForm((f) => ({ ...f, nomComplet: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      autoComplete="name"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Numéro de CNI</span>
                    <input
                      value={form.cniNumero}
                      onChange={(e) => setForm((f) => ({ ...f, cniNumero: e.target.value }))}
                      placeholder="Carte nationale d’identité"
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                      autoComplete="off"
                    />
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Coordonnées de contact
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="text-slate-600">Téléphone</span>
                        <input
                          value={form.telephone}
                          onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="tel"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-slate-600">E-mail</span>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="email"
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}
              {editingId ? (
                <label className="block text-sm">
                  <span className="text-slate-600">Statut</span>
                  <select
                    value={form.statut}
                    aria-label="Statut du client"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, statut: e.target.value as ClientStatut }))
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  >
                    {CLIENT_STATUTS.map((s) => (
                      <option key={s} value={s}>
                        {CLIENT_STATUT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={Boolean(busyId)}
                  className="rounded border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busyId ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </form>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
