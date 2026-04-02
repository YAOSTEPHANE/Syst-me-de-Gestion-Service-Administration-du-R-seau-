"use client";

import { captureByAliases, extractPdfText, normalizeDateToIso } from "@/lib/lonaci/pdf-import";
import type { ChangeEvent } from "react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";

type DemandeType = "ATTESTATION_REVENU" | "DOMICILIATION_PRODUIT";
type DemandeStatut = "DEMANDE_RECUE" | "TRANSMIS" | "FINALISE";

interface DemandeItem {
  id: string;
  type: DemandeType;
  concessionnaireId: string | null;
  produitCode: string | null;
  dateDemande: string;
  statut: DemandeStatut;
  observations: string | null;
  createdAt: string;
  updatedAt: string;
}

function statutBadgeClass(statut: DemandeStatut): string {
  if (statut === "DEMANDE_RECUE") return "border-amber-200 bg-amber-50 text-amber-900";
  if (statut === "TRANSMIS") return "border-sky-200 bg-sky-50 text-sky-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function typeBadgeClass(type: DemandeType): string {
  return type === "ATTESTATION_REVENU"
    ? "border-violet-200 bg-violet-50 text-violet-900"
    : "border-cyan-200 bg-cyan-50 text-cyan-900";
}

async function downloadAttestationsExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = ["type", "concessionnaireId", "produitCode", "dateDemande", "observations"];
  const sample = {
    type: "ATTESTATION_REVENU",
    concessionnaireId: "ID_CONCESSIONNAIRE",
    produitCode: "LOTO",
    dateDemande: new Date().toISOString(),
    observations: "Exemple import attestation/domiciliation",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "attestations_domiciliation");
  XLSX.writeFile(wb, "modele-attestations-domiciliation.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    type: ((raw.type as string | null) ?? "ATTESTATION_REVENU").toUpperCase(),
    concessionnaireId: (raw.concessionnaireId as string | null) ?? null,
    produitCode: (raw.produitCode as string | null)?.toUpperCase() ?? null,
    dateDemande: (raw.dateDemande as string | null) ?? null,
    observations: (raw.observations as string | null) ?? null,
    statut: (raw.statut as string | null) ?? "DEMANDE_RECUE",
  });
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".csv")) return file;
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const { readWorkbookFromArrayBuffer, sheetToJsonFirstSheet } = await import(
      "@/lib/spreadsheet/safe-xlsx-read",
    );
    const wb = await readWorkbookFromArrayBuffer(await file.arrayBuffer());
    const rows = await sheetToJsonFirstSheet<Record<string, unknown>>(wb);
    const json = JSON.stringify(rows.map((r) => sanitize(r)));
    return new File([json], file.name.replace(/\.(xlsx|xls)$/i, ".json"), { type: "application/json" });
  }
  if (lower.endsWith(".pdf")) {
    const source = await extractPdfText(file, 8);
    const row = sanitize({
      type:
        captureByAliases(source, ["type", "demande type"], "(attestation_revenu|domiciliation_produit)")?.toUpperCase() ??
        "ATTESTATION_REVENU",
      concessionnaireId: captureByAliases(source, ["concessionnaire id", "pdv id"], "[a-z0-9]{8,}"),
      produitCode: captureByAliases(source, ["code produit", "produit"], "[a-z0-9_ -]{2,20}")?.toUpperCase(),
      dateDemande: normalizeDateToIso(
        captureByAliases(source, ["date demande", "date"], "[0-9/\\- :tTzZ.+]{8,40}"),
      ),
      observations: captureByAliases(source, ["observations", "commentaire"], "[^|;]{1,300}"),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporté. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

export default function AttestationsDomiciliationPanel() {
  const [items, setItems] = useState<DemandeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const [filterType, setFilterType] = useState<"" | DemandeType>("");
  const [filterConcessionnaireId, setFilterConcessionnaireId] = useState("");
  const [filterStatut, setFilterStatut] = useState<"" | DemandeStatut>("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [produits, setProduits] = useState<Array<{ code: string; libelle: string; actif: boolean }>>([]);
  const [referentialsLoading, setReferentialsLoading] = useState(false);
  const [referentialsError, setReferentialsError] = useState<string | null>(null);

  const [type, setType] = useState<DemandeType>("ATTESTATION_REVENU");
  const [concessionnaireId, setConcessionnaireId] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const [dateDemande, setDateDemande] = useState("");
  const [observations, setObservations] = useState("");
  const [creating, setCreating] = useState(false);

  const [concessionnaires, setConcessionnaires] = useState<Array<{ id: string; codePdv: string; label: string }>>(
    [],
  );
  const [concessionnairesLoading, setConcessionnairesLoading] = useState(false);
  const [concessionnairesError, setConcessionnairesError] = useState<string | null>(null);

  async function load(nextPage = page) {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
      if (filterType) params.set("type", filterType);
      if (filterConcessionnaireId.trim()) params.set("concessionnaireId", filterConcessionnaireId.trim());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterDateFrom) params.set("dateFrom", new Date(`${filterDateFrom}T00:00:00`).toISOString());
      if (filterDateTo) params.set("dateTo", new Date(`${filterDateTo}T23:59:59.999`).toISOString());

      const res = await fetch(`/api/attestations-domiciliation?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as { items: DemandeItem[]; total: number; page: number };
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (e) {
      setListError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterConcessionnaireId, filterStatut, filterDateFrom, filterDateTo]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const payload = {
        type,
        concessionnaireId: concessionnaireId.trim() ? concessionnaireId.trim() : null,
        produitCode: produitCode.trim() ? produitCode.trim().toUpperCase() : null,
        dateDemande: new Date(dateDemande).toISOString(),
        observations: observations.trim() ? observations.trim() : null,
      };
      const res = await fetch("/api/attestations-domiciliation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Création impossible");
      }
      closeCreate();
      setToast({ type: "success", message: "Demande enregistrée (statut DEMANDE_RECUE)." });
      await load(1);
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setCreateError(message);
      setToast({ type: "error", message });
    } finally {
      setCreating(false);
    }
  }

  async function transition(id: string, target: "TRANSMIS" | "FINALISE") {
    setBusyId(id);
    setListError(null);
    try {
      const res = await fetch(`/api/attestations-domiciliation/${encodeURIComponent(id)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Transition impossible");
      }
      await load(page);
      setToast({ type: "success", message: "Transition effectuée." });
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setListError(message);
      setToast({ type: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  async function onImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const source = e.target.files?.[0];
    if (!source) return;
    setImportingFile(true);
    try {
      const file = await normalizeImportFileForApi(source);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("collection", "attestations_domiciliation");
      fd.set("mode", "insert");
      const res = await fetch("/api/import-data", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | {
            message?: string;
            inserted?: number;
            skippedExistingDuplicates?: number;
            skippedInvalidRows?: number;
            invalidRows?: Array<{ index: number; reason: string }>;
          }
        | null;
      if (!res.ok) throw new Error(data?.message ?? "Import impossible");
      await load(1);
      window.dispatchEvent(new Event("lonaci:data-imported"));
      setToast({
        type: "success",
        message: `Import attestations/domiciliation terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s), ${data?.skippedInvalidRows ?? 0} ligne(s) invalide(s)${
          data?.invalidRows?.[0] ? ` (ex: ligne ${data.invalidRows[0].index} - ${data.invalidRows[0].reason})` : ""
        }.`,
      });
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Import impossible");
      setToast({ type: "error", message });
    } finally {
      setImportingFile(false);
      e.target.value = "";
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filterType) params.set("type", filterType);
    if (filterConcessionnaireId.trim()) params.set("concessionnaireId", filterConcessionnaireId.trim());
    if (filterStatut) params.set("statut", filterStatut);
    if (filterDateFrom) params.set("dateFrom", new Date(`${filterDateFrom}T00:00:00`).toISOString());
    if (filterDateTo) params.set("dateTo", new Date(`${filterDateTo}T23:59:59.999`).toISOString());
    return params.toString();
  }, [filterType, filterConcessionnaireId, filterStatut, filterDateFrom, filterDateTo]);

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";
  const inputClassXs =
    "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";
  const stats = useMemo(() => {
    const demandeRecue = items.filter((i) => i.statut === "DEMANDE_RECUE").length;
    const transmis = items.filter((i) => i.statut === "TRANSMIS").length;
    const finalise = items.filter((i) => i.statut === "FINALISE").length;
    return { demandeRecue, transmis, finalise };
  }, [items]);

  function resetCreateFields() {
    setType("ATTESTATION_REVENU");
    setConcessionnaireId("");
    setProduitCode("");
    setDateDemande("");
    setObservations("");
    setConcessionnaires([]);
    setConcessionnairesError(null);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreateError(null);
    setCreating(false);
    resetCreateFields();
  }

  useEffect(() => {
    if (!createOpen) return;
    setCreateError(null);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const d = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    setDateDemande(`${y}-${m}-${d}T${hh}:${mm}`);
    // focus date for fast entry
    setTimeout(() => dateInputRef.current?.focus(), 0);
  }, [createOpen]);

  useEffect(() => {
    if (!createOpen) return;
    if (produits.length) return;

    let cancelled = false;
    setReferentialsLoading(true);
    setReferentialsError(null);
    void (async () => {
      try {
        const res = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Référentiels indisponibles");
        const data = (await res.json()) as { produits?: Array<{ code: string; libelle: string; actif: boolean }> };
        const next = (data.produits ?? []).slice().sort((a, b) => a.code.localeCompare(b.code, "fr"));
        if (!cancelled) setProduits(next);
      } catch (e) {
        if (!cancelled) setReferentialsError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
      } finally {
        if (!cancelled) setReferentialsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [createOpen, produits.length]);

  useEffect(() => {
    if (!createOpen) return;

    let cancelled = false;
    setConcessionnairesLoading(true);
    setConcessionnairesError(null);

    void (async () => {
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "100", statut: "ACTIF" });
        const res = await fetch(`/api/concessionnaires?${params}`, { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Concessionnaires indisponibles");
        const data = (await res.json()) as {
          items?: Array<{ id: string; codePdv?: string; nomComplet?: string; raisonSociale?: string }>;
        };
        const next = (data.items ?? [])
          .map((c) => {
            const label = (c.nomComplet || c.raisonSociale || c.codePdv || "").trim();
            return { id: c.id, codePdv: c.codePdv ?? "", label };
          })
          .filter((c) => c.id && c.label);
        next.sort((a, b) => a.label.localeCompare(b.label, "fr"));
        if (!cancelled) setConcessionnaires(next);
      } catch (e) {
        if (!cancelled) setConcessionnairesError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
      } finally {
        if (!cancelled) setConcessionnairesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  return (
    <section className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-indigo-50 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-cyan-200/45 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 left-20 h-40 w-40 rounded-full bg-indigo-200/30 blur-2xl" />
        <div className="relative mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex rounded-full border border-cyan-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
            LONACI
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Attestations & domiciliation</h2>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <a
            href={`/api/attestations-domiciliation/export?format=excel&${exportQuery}`}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Export Excel
          </a>
          <a
            href={`/api/attestations-domiciliation/export?format=pdf&${exportQuery}`}
            className="inline-flex items-center justify-center rounded-xl border border-rose-300 bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
          >
            Export PDF
          </a>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400 bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:border-cyan-600 hover:bg-cyan-600 disabled:opacity-60"
          >
            <span className="text-lg font-light leading-none">+</span>
            Nouvelle demande
          </button>
          <button
            type="button"
            onClick={() => void downloadAttestationsExcelTemplate()}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-600 bg-white px-3 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            Télécharger modèle Excel
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".json,.csv,.xlsx,.xls,.pdf"
            className="hidden"
            onChange={(e) => void onImportFileChange(e)}
          />
          <button
            type="button"
            onClick={() => importFileInputRef.current?.click()}
            disabled={importingFile}
            className="inline-flex items-center justify-center rounded-xl border border-cyan-500 bg-cyan-50 px-3 py-2.5 text-sm font-semibold text-cyan-800 shadow-sm transition hover:bg-cyan-100 disabled:opacity-60"
          >
            {importingFile ? "Import..." : "Importer fichier vers le tableau"}
          </button>
        </div>
      </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Demande reçue</p>
            <p className="mt-1 text-3xl font-bold text-amber-900">{stats.demandeRecue}</p>
          </article>
          <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Transmis</p>
            <p className="mt-1 text-3xl font-bold text-sky-900">{stats.transmis}</p>
          </article>
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Finalisés</p>
            <p className="mt-1 text-3xl font-bold text-emerald-900">{stats.finalise}</p>
          </article>
          <article className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Volume visible</p>
            <p className="mt-1 text-3xl font-bold text-indigo-900">{total}</p>
          </article>
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-5">
        <select
          aria-label="Filtre type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as "" | DemandeType)}
          className={inputClassXs}
        >
          <option value="">Tous types</option>
          <option value="ATTESTATION_REVENU">ATTESTATION_REVENU</option>
          <option value="DOMICILIATION_PRODUIT">DOMICILIATION_PRODUIT</option>
        </select>
        <input
          aria-label="Filtre concessionnaire"
          value={filterConcessionnaireId}
          onChange={(e) => setFilterConcessionnaireId(e.target.value)}
          placeholder="Concessionnaire (id)"
          className={inputClassXs}
        />
        <select
          aria-label="Filtre statut"
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value as "" | DemandeStatut)}
          className={inputClassXs}
        >
          <option value="">Tous statuts</option>
          <option value="DEMANDE_RECUE">DEMANDE_RECUE</option>
          <option value="TRANSMIS">TRANSMIS</option>
          <option value="FINALISE">FINALISE</option>
        </select>
        <input
          aria-label="Date début"
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className={inputClassXs}
        />
        <input
          aria-label="Date fin"
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className={inputClassXs}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>
          {total} entrée(s) · page {page}/{totalPages}
        </span>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => void load(page - 1)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Précédent
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => void load(page + 1)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Suivant
        </button>
      </div>

      {toast ? (
        <div
          className={`fixed left-1/2 top-4 z-[100] w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 rounded-lg border px-3 py-2.5 text-sm shadow-lg ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
          role="status"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 font-medium">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="shrink-0 text-xs underline opacity-80 hover:opacity-100"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {listError ? <p className="text-sm text-rose-700">{listError}</p> : null}
      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Produit</th>
                <th className="px-3 py-2.5">Concessionnaire</th>
                <th className="px-3 py-2.5">Date demande</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Observations</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-cyan-50/30">
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${typeBadgeClass(row.type)}`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{row.produitCode ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">{row.concessionnaireId ?? "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                    {new Date(row.dateDemande).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statutBadgeClass(row.statut)}`}>
                      {row.statut}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[22rem] truncate text-xs text-slate-700">
                    {row.observations ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {row.statut === "DEMANDE_RECUE" ? (
                      <button
                        disabled={busyId === row.id}
                        onClick={() => void transition(row.id, "TRANSMIS")}
                        className="inline-flex items-center justify-center rounded-lg border border-cyan-600 bg-cyan-600 px-3 py-1.5 text-[11px] font-semibold leading-tight text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700 disabled:opacity-60"
                      >
                        {busyId === row.id ? "..." : "Transmettre"}
                      </button>
                    ) : row.statut === "TRANSMIS" ? (
                      <button
                        disabled={busyId === row.id}
                        onClick={() => void transition(row.id, "FINALISE")}
                        className="inline-flex items-center justify-center rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold leading-tight text-white shadow-sm transition hover:border-emerald-700 hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busyId === row.id ? "..." : "Finaliser"}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                    Aucune entrée.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60"
            aria-label="Fermer"
            onClick={closeCreate}
            disabled={creating}
          />
          <div className="relative z-10 flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-indigo-50 px-4 py-2.5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Nouvelle demande</h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">Statut initial: DEMANDE_RECUE.</p>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={closeCreate}
                className="rounded-lg border border-slate-300 px-2 py-0.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <form noValidate onSubmit={onCreate} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {createError ? (
                  <div
                    className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
                    role="alert"
                  >
                    {createError}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">Type *</span>
                    <select required value={type} onChange={(e) => setType(e.target.value as DemandeType)} className={inputClass}>
                      <option value="ATTESTATION_REVENU">ATTESTATION_REVENU</option>
                      <option value="DOMICILIATION_PRODUIT">DOMICILIATION_PRODUIT</option>
                    </select>
                  </label>

                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">Concessionnaire concerné</span>
                    <select
                      value={concessionnaireId}
                      onChange={(e) => setConcessionnaireId(e.target.value)}
                      className={inputClass}
                      disabled={concessionnairesLoading}
                    >
                      <option value="">
                        {concessionnairesLoading ? "Chargement des concessionnaires…" : "Aucun concessionnaire"}
                      </option>
                      {concessionnaires.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {concessionnairesError ? (
                      <span className="text-[11px] leading-4 text-rose-700">{concessionnairesError}</span>
                    ) : null}
                  </label>

                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">Produit concerné</span>
                    <select
                      value={produitCode}
                      onChange={(e) => setProduitCode(e.target.value)}
                      className={inputClass}
                      disabled={referentialsLoading}
                    >
                      <option value="">{referentialsLoading ? "Chargement des référentiels…" : "Aucun produit"}</option>
                      {produits
                        .filter((p) => p.actif)
                        .map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.code} — {p.libelle}
                          </option>
                        ))}
                    </select>
                    {referentialsError ? <span className="text-[11px] leading-4 text-rose-700">{referentialsError}</span> : null}
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Date de la demande *</span>
                    <input
                      ref={dateInputRef}
                      required
                      type="datetime-local"
                      value={dateDemande}
                      onChange={(e) => setDateDemande(e.target.value)}
                      className={inputClass}
                    />
                  </label>

                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">Observations</span>
                    <textarea
                      value={observations}
                      onChange={(e) => setObservations(e.target.value)}
                      rows={3}
                      className={inputClass}
                      placeholder="Zone observations (optionnel)"
                    />
                  </label>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
                <button
                  type="button"
                  onClick={closeCreate}
                  disabled={creating}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg border border-cyan-600 bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700 disabled:opacity-60"
                >
                  {creating ? "Enregistrement…" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

