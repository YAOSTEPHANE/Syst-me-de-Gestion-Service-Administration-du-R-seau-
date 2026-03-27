"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";

type DossierStatus =
  | "BROUILLON"
  | "SOUMIS"
  | "VALIDE_N1"
  | "VALIDE_N2"
  | "FINALISE"
  | "REJETE";

type TransitionAction =
  | "SUBMIT"
  | "VALIDATE_N1"
  | "VALIDATE_N2"
  | "FINALIZE"
  | "REJECT"
  | "RETURN_PREVIOUS";

interface DossierItem {
  id: string;
  reference: string;
  status: DossierStatus;
  type: string;
  concessionnaireId: string;
  updatedAt: string;
}

interface DossierListResponse {
  items: DossierItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface DossierDetailItem {
  id: string;
  reference: string;
  status: DossierStatus;
  type: string;
  concessionnaireId: string;
  agenceId: string | null;
  payload: unknown;
  history: Array<{ status: DossierStatus; actedByUserId: string; actedAt: string; comment: string | null }>;
  createdAt: string;
  updatedAt: string;
}

type SortField = "updatedAt" | "reference" | "status";
type SortOrder = "asc" | "desc";

async function fetchDossiers(status?: DossierStatus): Promise<DossierListResponse> {
  const search = new URLSearchParams({ page: "1", pageSize: "50" });
  if (status) {
    search.set("status", status);
  }
  const response = await fetch(`/api/dossiers?${search.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les dossiers");
  }
  return response.json();
}

function actionsForStatus(status: DossierStatus): TransitionAction[] {
  switch (status) {
    case "BROUILLON":
      return ["SUBMIT"];
    case "SOUMIS":
      return ["VALIDATE_N1", "REJECT", "RETURN_PREVIOUS"];
    case "VALIDE_N1":
      return ["VALIDATE_N2", "REJECT", "RETURN_PREVIOUS"];
    case "VALIDE_N2":
      return ["FINALIZE", "REJECT", "RETURN_PREVIOUS"];
    case "REJETE":
      // Autorise une resoumission après rejet.
      return ["SUBMIT"];
    default:
      return [];
  }
}

function actionLabel(action: TransitionAction): string {
  switch (action) {
    case "SUBMIT":
      return "Soumettre";
    case "VALIDATE_N1":
      return "Validation N1";
    case "VALIDATE_N2":
      return "Validation N2";
    case "FINALIZE":
      return "Finaliser";
    case "REJECT":
      return "Rejeter (retour brouillon)";
    case "RETURN_PREVIOUS":
      return "Retourner pour correction";
  }
}

function statusLabel(status: DossierStatus): string {
  switch (status) {
    case "BROUILLON":
      return "Brouillon";
    case "SOUMIS":
      return "Soumis";
    case "VALIDE_N1":
      return "Validé N1";
    case "VALIDE_N2":
      return "Validé N2";
    case "FINALISE":
      return "Finalisé";
    case "REJETE":
      return "Rejeté";
  }
}

function statusBadgeClass(status: DossierStatus): string {
  switch (status) {
    case "BROUILLON":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "SOUMIS":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "VALIDE_N1":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "VALIDE_N2":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "FINALISE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "REJETE":
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

function confirmMessage(action: TransitionAction): string | null {
  if (action === "FINALIZE") {
    return "Confirmer la finalisation du dossier ? Cette action crée le contrat actif.";
  }
  return null;
}

export default function DossiersPanel() {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<DossierStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [items, setItems] = useState<DossierItem[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);
  const referenceFilter = searchParams.get("reference")?.trim() ?? "";
  const [search, setSearch] = useState(referenceFilter);
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [highlightedDossierId, setHighlightedDossierId] = useState<string | null>(null);
  const fieldClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

  async function load() {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDossiers(statusFilter === "ALL" ? undefined : statusFilter);
      setItems(data.items);
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur de chargement");
      setError(message);
      setToast({
        type: "error",
        message,
      });
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }

  async function transition(id: string, action: TransitionAction, comment?: string | null) {
    const message = confirmMessage(action);
    if (message && !window.confirm(message)) {
      return;
    }

    setActionBusyId(id);
    try {
      const body: { action: TransitionAction; comment?: string | null } = { action };
      if (comment !== undefined) body.comment = comment;

      const response = await fetch(`/api/dossiers/${id}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? "Transition impossible");
      }
      await load();
      setToast({ type: "success", message: "Transition effectuée avec succès." });
      return true;
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur de transition");
      setError(message);
      setToast({ type: "error", message });
      return false;
    } finally {
      setActionBusyId(null);
    }
  }

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionAction, setDecisionAction] = useState<TransitionAction | null>(null);
  const [decisionDossierId, setDecisionDossierId] = useState<string | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<DossierDetailItem | null>(null);

  async function openDetail(id: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailItem(null);
    try {
      const res = await fetch(`/api/dossiers/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Détail dossier indisponible");
      }
      const body = (await res.json()) as { dossier: DossierDetailItem };
      setDetailItem(body.dossier);
    } catch (err) {
      setToast({
        type: "error",
        message: friendlyErrorMessage(
          err instanceof Error ? err.message : "Erreur de chargement du détail",
        ),
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  function openDecision(id: string, action: TransitionAction) {
    setDecisionDossierId(id);
    setDecisionAction(action);
    setDecisionComment("");
    setDecisionOpen(true);
  }

  function closeDecision() {
    setDecisionOpen(false);
    setDecisionDossierId(null);
    setDecisionAction(null);
    setDecisionComment("");
  }

  async function submitDecision() {
    if (!decisionDossierId || !decisionAction) return;
    const trimmed = decisionComment.trim();
    if (!trimmed) {
      setToast({ type: "error", message: "Motif/commentaire obligatoire." });
      return;
    }

    const ok = await transition(decisionDossierId, decisionAction, trimmed);
    if (ok) closeDecision();
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && !loadInFlightRef.current) {
        void load();
      }
    }, 10000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (referenceFilter) {
      setSearch(referenceFilter);
    }
  }, [referenceFilter]);

  const concessionnaireFilter = searchParams.get("concessionnaireId") ?? "";

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byConcessionnaire = concessionnaireFilter
      ? items.filter((item) => item.concessionnaireId === concessionnaireFilter)
      : items;
    const bySearch = query
      ? byConcessionnaire.filter(
          (item) =>
            item.reference.toLowerCase().includes(query) ||
            item.status.toLowerCase().includes(query) ||
            item.type.toLowerCase().includes(query) ||
            item.concessionnaireId.toLowerCase().includes(query),
        )
      : byConcessionnaire;
    return [...bySearch].sort((a, b) => {
      let compare = 0;
      if (sortField === "updatedAt") {
        compare = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (sortField === "reference") {
        compare = a.reference.localeCompare(b.reference);
      } else {
        compare = a.status.localeCompare(b.status);
      }
      return sortOrder === "asc" ? compare : -compare;
    });
  }, [concessionnaireFilter, items, search, sortField, sortOrder]);

  const total = useMemo(() => filteredItems.length, [filteredItems]);

  useEffect(() => {
    if (!referenceFilter || loading || filteredItems.length === 0) return;
    const target = filteredItems.find((item) => item.reference === referenceFilter);
    if (!target) return;
    const cell = document.getElementById(`dossier-${target.id}`);
    if (!cell) return;
    cell.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedDossierId(target.id);
    const timeout = window.setTimeout(() => setHighlightedDossierId(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [referenceFilter, filteredItems, loading]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-700">LONACI</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Dossiers workflow</h2>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Recherche ref/statut/type/concessionnaire"
            className={`w-full lg:w-72 ${fieldClass}`}
          />
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            aria-label="Champ de tri dossiers"
            className={fieldClass}
          >
            <option value="updatedAt">Tri: date MAJ</option>
            <option value="reference">Tri: référence</option>
            <option value="status">Tri: statut</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            aria-label="Ordre de tri dossiers"
            className={fieldClass}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DossierStatus | "ALL")}
            aria-label="Filtrer les dossiers par statut"
            className={fieldClass}
          >
            <option value="ALL">Tous</option>
            <option value="BROUILLON">BROUILLON</option>
            <option value="SOUMIS">SOUMIS</option>
            <option value="VALIDE_N1">VALIDE_N1</option>
            <option value="VALIDE_N2">VALIDE_N2</option>
            <option value="FINALISE">FINALISE</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center rounded-xl border border-cyan-600 bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700"
          >
            Actualiser
          </button>
        </div>
      </div>

      <p className="mb-4 text-xs text-slate-500">{total} dossier(s) affiché(s)</p>
      {concessionnaireFilter ? (
        <p className="mb-4 text-xs text-emerald-700">
          Filtre concessionnaire actif: {concessionnaireFilter}
        </p>
      ) : null}
      {referenceFilter ? (
        <p className="mb-4 text-xs text-emerald-700">Filtre référence actif: {referenceFilter}</p>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Chargement...</p> : null}
      {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
      {toast ? (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs opacity-80 hover:opacity-100"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Référence</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Concessionnaire</th>
                <th className="px-3 py-2.5">MAJ</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-slate-100 transition hover:bg-cyan-50/40 ${
                    highlightedDossierId === item.id ? "bg-emerald-50" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 font-mono text-xs" id={`dossier-${item.id}`}>
                    {item.reference}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{item.type}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    <Link
                      href={`/contrats?concessionnaireId=${encodeURIComponent(item.concessionnaireId)}`}
                      className="text-cyan-700 hover:text-cyan-800"
                    >
                      {item.concessionnaireId}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{new Date(item.updatedAt).toLocaleString()}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      {actionsForStatus(item.status).map((action) => (
                        <button
                          key={action}
                          type="button"
                          disabled={actionBusyId === item.id}
                          onClick={() => {
                            if (action === "REJECT" || action === "RETURN_PREVIOUS") {
                              openDecision(item.id, action);
                              return;
                            }
                            void transition(item.id, action);
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          {actionLabel(action)}
                        </button>
                      ))}
                      {actionsForStatus(item.status).length === 0 ? (
                        <span className="text-xs text-slate-400">Aucune action</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void openDetail(item.id)}
                        className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-700 shadow-sm transition hover:bg-indigo-50"
                      >
                        Détail
                      </button>
                      <a
                        href={`/api/contrats/${encodeURIComponent(item.id)}/export`}
                        className="rounded-lg border border-emerald-600 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 shadow-sm transition hover:bg-emerald-50"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        PDF récap.
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredItems.length ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={6}>
                    Aucun dossier trouvé.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {decisionOpen && decisionDossierId && decisionAction ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="decision-dossier-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Fermer"
            disabled={actionBusyId === decisionDossierId}
            onClick={closeDecision}
          />
          <div className="relative z-10 flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-3 py-1.5">
              <div>
                <h3
                  id="decision-dossier-title"
                  className="text-sm font-semibold text-slate-900"
                >
                    {decisionAction === "REJECT"
                      ? "Rejet du dossier (retour brouillon)"
                      : "Retour pour correction"}
                </h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                    {decisionAction === "REJECT"
                      ? "Motif/commentaire obligatoire. Le dossier repassera à l’étape Brouillon."
                      : "Motif/commentaire requis pour cette action."}
                </p>
              </div>
              <button
                type="button"
                disabled={actionBusyId === decisionDossierId}
                onClick={closeDecision}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-700">Motif / commentaire</span>
                <textarea
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder="Texte libre…"
                  rows={3}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] leading-4 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400"
                />
              </label>

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={actionBusyId === decisionDossierId || !decisionComment.trim()}
                  onClick={() => void submitDecision()}
                  className="rounded-lg border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === decisionDossierId}
                  onClick={closeDecision}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {detailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dossier-detail-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Fermer"
            onClick={() => setDetailOpen(false)}
          />
          <div className="relative z-10 flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-2">
              <div>
                <h3 id="dossier-detail-title" className="text-sm font-semibold text-slate-900">
                  Détail dossier
                </h3>
                <p className="text-xs text-slate-600">Consultation complète et historique des transitions.</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded-lg border border-slate-300 px-2 py-0.5 text-sm text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {detailLoading ? <p className="text-sm text-slate-500">Chargement du détail...</p> : null}
              {!detailLoading && detailItem ? (
                <div className="space-y-3">
                  <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                    <p className="text-xs text-slate-700"><span className="font-semibold">Référence:</span> {detailItem.reference}</p>
                    <p className="text-xs text-slate-700"><span className="font-semibold">Statut:</span> {statusLabel(detailItem.status)}</p>
                    <p className="text-xs text-slate-700"><span className="font-semibold">Type:</span> {detailItem.type}</p>
                    <p className="text-xs text-slate-700"><span className="font-semibold">Concessionnaire:</span> {detailItem.concessionnaireId}</p>
                    <p className="text-xs text-slate-700"><span className="font-semibold">Créé le:</span> {new Date(detailItem.createdAt).toLocaleString("fr-FR")}</p>
                    <p className="text-xs text-slate-700"><span className="font-semibold">Mis à jour:</span> {new Date(detailItem.updatedAt).toLocaleString("fr-FR")}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Payload</p>
                    <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                      {JSON.stringify(detailItem.payload ?? {}, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Historique</p>
                    {detailItem.history.length ? (
                      <ul className="space-y-1 text-xs text-slate-700">
                        {detailItem.history.map((h, idx) => (
                          <li key={`${h.actedAt}-${idx}`} className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                            <span className="font-medium">{statusLabel(h.status)}</span> - {new Date(h.actedAt).toLocaleString("fr-FR")} - {h.comment ?? "Sans commentaire"}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-500">Aucun historique.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
