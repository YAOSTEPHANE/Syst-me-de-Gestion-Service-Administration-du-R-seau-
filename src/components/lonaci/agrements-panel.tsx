"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { captureByAliases, extractPdfText, normalizeDateToIso } from "@/lib/lonaci/pdf-import";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";

type AgrementStatus = "RECU" | "CONTROLE" | "TRANSMIS" | "FINALISE";
interface AgrementItem {
  id: string;
  reference: string;
  produitCode: string;
  dateReception: string;
  referenceOfficielle: string;
  agenceId: string | null;
  statut: AgrementStatus;
  observations: string | null;
  hasDocument: boolean;
  createdAt: string;
  updatedAt: string;
}

function statusPillClass(status: AgrementStatus): string {
  switch (status) {
    case "RECU":
      return "bg-amber-50 text-amber-900";
    case "CONTROLE":
      return "bg-sky-50 text-sky-900";
    case "TRANSMIS":
      return "bg-violet-50 text-violet-900";
    case "FINALISE":
      return "bg-emerald-50 text-emerald-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

async function downloadAgrementsExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = [
    "produitCode",
    "dateReception",
    "referenceOfficielle",
    "agenceId",
    "concessionnaireId",
    "observations",
    "documentPdfName",
  ];
  const sample = {
    produitCode: "LOTO",
    dateReception: new Date().toISOString(),
    referenceOfficielle: "AGR-2026-001",
    agenceId: "ID_AGENCE",
    concessionnaireId: "ID_CONCESSIONNAIRE",
    observations: "Exemple import agrement",
    documentPdfName: "obligatoire-via-formulaire.pdf",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "agrements");
  XLSX.writeFile(wb, "modele-agrements.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    produitCode: (raw.produitCode as string | null) ?? null,
    dateReception: (raw.dateReception as string | null) ?? null,
    referenceOfficielle: (raw.referenceOfficielle as string | null) ?? null,
    agenceId: (raw.agenceId as string | null) ?? null,
    concessionnaireId: (raw.concessionnaireId as string | null) ?? null,
    observations: (raw.observations as string | null) ?? null,
  });
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".csv")) return file;
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    if (!firstSheet) throw new Error("Fichier Excel vide.");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null });
    const json = JSON.stringify(rows.map((r) => sanitize(r)));
    return new File([json], file.name.replace(/\.(xlsx|xls)$/i, ".json"), { type: "application/json" });
  }
  if (lower.endsWith(".pdf")) {
    const source = await extractPdfText(file, 8);
    const row = sanitize({
      produitCode:
        captureByAliases(source, ["code produit", "produit"], "[a-z0-9_ -]{2,20}")?.toUpperCase() ?? null,
      dateReception: normalizeDateToIso(
        captureByAliases(source, ["date reception", "date agrement", "date"], "[0-9/\\- :tTzZ.+]{8,40}"),
      ),
      referenceOfficielle: captureByAliases(
        source,
        ["reference officielle", "numero officielle", "num agrement"],
        "[a-z0-9\\-_/]{3,80}",
      ),
      agenceId: captureByAliases(source, ["agence id", "id agence"], "[a-z0-9]{8,}"),
      concessionnaireId: captureByAliases(source, ["concessionnaire id", "pdv id", "id pdv"], "[a-z0-9]{8,}"),
      observations: captureByAliases(source, ["observations", "commentaires", "commentaire"], "[^|;]{1,300}"),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporte. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

export default function AgrementsPanel() {
  const [items, setItems] = useState<AgrementItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importingFile, setImportingFile] = useState(false);

  const [filterAgence, setFilterAgence] = useState("");
  const [filterProduit, setFilterProduit] = useState("");
  const [filterStatut, setFilterStatut] = useState<"" | AgrementStatus>("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [produits, setProduits] = useState<Array<{ code: string; libelle: string; actif: boolean }>>([]);
  const [agences, setAgences] = useState<Array<{ id: string; code: string; libelle: string; actif: boolean }>>([]);
  const [referentialsLoading, setReferentialsLoading] = useState(false);
  const [referentialsError, setReferentialsError] = useState<string | null>(null);

  const [produitCode, setProduitCode] = useState("");
  const [dateReception, setDateReception] = useState("");
  const [referenceOfficielle, setReferenceOfficielle] = useState("");
  const [agenceId, setAgenceId] = useState("");
  const [concessionnaireId, setConcessionnaireId] = useState("");
  const [observations, setObservations] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
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
      if (filterAgence.trim()) params.set("agenceId", filterAgence.trim());
      if (filterProduit.trim()) params.set("produitCode", filterProduit.trim().toUpperCase());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterDateFrom) params.set("dateFrom", new Date(`${filterDateFrom}T00:00:00`).toISOString());
      if (filterDateTo) params.set("dateTo", new Date(`${filterDateTo}T23:59:59.999`).toISOString());
      const res = await fetch(`/api/agrements?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as {
        items: AgrementItem[];
        total: number;
        page: number;
      };
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
  }, [filterAgence, filterProduit, filterStatut, filterDateFrom, filterDateTo]);

  useEffect(() => {
    const onDataImported = () => {
      void load(1);
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAgence, filterProduit, filterStatut, filterDateFrom, filterDateTo]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pdfFile) {
      const message = "Document PDF obligatoire.";
      setCreateError(message);
      setToast({ type: "error", message });
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const form = new FormData();
      form.set("produitCode", produitCode.trim().toUpperCase());
      form.set("dateReception", new Date(dateReception).toISOString());
      form.set("referenceOfficielle", referenceOfficielle.trim());
      form.set("agenceId", agenceId.trim());
      form.set("concessionnaireId", concessionnaireId.trim());
      form.set("observations", observations.trim());
      form.set("document", pdfFile);
      const res = await fetch("/api/agrements", { method: "POST", credentials: "include", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Création impossible");
      }
      setProduitCode("");
      setDateReception("");
      setReferenceOfficielle("");
      setAgenceId("");
      setConcessionnaireId("");
      setObservations("");
      setPdfFile(null);
      setCreateOpen(false);
      setToast({ type: "success", message: "Agrément enregistré (statut RECU)." });
      await load(1);
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setCreateError(message);
      setToast({ type: "error", message });
    } finally {
      setCreating(false);
    }
  }

  async function onImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const source = e.target.files?.[0];
    if (!source) return;
    setImportingFile(true);
    setCreateError(null);
    try {
      const file = await normalizeImportFileForApi(source);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("collection", "agreements");
      fd.set("mode", "insert");
      const res = await fetch("/api/import-data", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { message?: string; inserted?: number; skippedExistingDuplicates?: number }
        | null;
      if (!res.ok) throw new Error(data?.message ?? "Import impossible");
      await load(1);
      window.dispatchEvent(new Event("lonaci:data-imported"));
      setToast({
        type: "success",
        message: `Import agréments terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s).`,
      });
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Import impossible");
      setCreateError(message);
      setToast({ type: "error", message });
    } finally {
      setImportingFile(false);
      e.target.value = "";
    }
  }

  async function transition(id: string, target: "CONTROLE" | "TRANSMIS" | "FINALISE") {
    setBusyId(id);
    setListError(null);
    try {
      const res = await fetch(`/api/agrements/${encodeURIComponent(id)}/transition`, {
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filterAgence.trim()) params.set("agenceId", filterAgence.trim());
    if (filterProduit.trim()) params.set("produitCode", filterProduit.trim().toUpperCase());
    if (filterStatut) params.set("statut", filterStatut);
    if (filterDateFrom) params.set("dateFrom", new Date(`${filterDateFrom}T00:00:00`).toISOString());
    if (filterDateTo) params.set("dateTo", new Date(`${filterDateTo}T23:59:59.999`).toISOString());
    return params.toString();
  }, [filterAgence, filterProduit, filterStatut, filterDateFrom, filterDateTo]);

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] leading-4 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400";
  const inputClassXs =
    "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400";

  function resetCreateFields() {
    setProduitCode("");
    setDateReception("");
    setReferenceOfficielle("");
    setAgenceId("");
    setConcessionnaireId("");
    setObservations("");
    setPdfFile(null);
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
    // Pré-remplit la date à "maintenant" pour accélérer la saisie.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const d = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    setDateReception(`${y}-${m}-${d}T${hh}:${mm}`);
  }, [createOpen]);

  useEffect(() => {
    if (!createOpen) return;
    if (produits.length || agences.length) return;

    let cancelled = false;
    setReferentialsLoading(true);
    setReferentialsError(null);
    void (async () => {
      try {
        const res = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Référentiels indisponibles");
        const data = (await res.json()) as {
          agences?: Array<{ id: string; code: string; libelle: string; actif: boolean }>;
          produits?: Array<{ code: string; libelle: string; actif: boolean }>;
        };
        const next = (data.produits ?? []).slice().sort((a, b) => a.code.localeCompare(b.code, "fr"));
        const nextAgences = (data.agences ?? [])
          .slice()
          .sort((a, b) => a.code.localeCompare(b.code, "fr"));
        if (!cancelled) {
          setProduits(next);
          setAgences(nextAgences);
        }
      } catch (e) {
        if (!cancelled) setReferentialsError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
      } finally {
        if (!cancelled) setReferentialsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  useEffect(() => {
    if (!createOpen) return;

    let cancelled = false;
    setConcessionnairesLoading(true);
    setConcessionnairesError(null);

    void (async () => {
      try {
        // /api/concessionnaires limite pageSize à 100 (validation Zod)
        const params = new URLSearchParams({ page: "1", pageSize: "100", statut: "ACTIF" });
        if (agenceId.trim()) params.set("agenceId", agenceId.trim());
        if (produitCode.trim()) params.set("produitCode", produitCode.trim().toUpperCase());

        const res = await fetch(`/api/concessionnaires?${params}`, { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Concessionnaires indisponibles");
        const data = (await res.json()) as {
          items?: Array<{ id: string; codePdv?: string; nomComplet?: string; raisonSociale?: string }>;
        };
        const items = (data.items ?? [])
          .map((c) => {
            const label = (c.nomComplet || c.raisonSociale || c.codePdv || "").trim();
            return { id: c.id, codePdv: c.codePdv ?? "", label };
          })
          .filter((c) => c.id && c.label);
        items.sort((a, b) => a.label.localeCompare(b.label, "fr"));
        if (!cancelled) setConcessionnaires(items);
      } catch (e) {
        if (!cancelled) setConcessionnairesError(e instanceof Error ? e.message : "Erreur");
      } finally {
        if (!cancelled) setConcessionnairesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [createOpen, agenceId, produitCode]);

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="relative overflow-hidden rounded-3xl border border-indigo-200 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-indigo-300/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-24 h-44 w-44 rounded-full bg-cyan-300/20 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-100">
              Référentiel
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Agréments</h2>
            <p className="mt-1 text-sm text-indigo-100/90">Contrôles, validation et archivage des agréments produits.</p>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <a
            href={`/api/agrements/export?format=excel&${exportQuery}`}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Excel
          </a>
          <a
            href={`/api/agrements/export?format=pdf&${exportQuery}`}
            className="inline-flex items-center justify-center rounded-xl border border-rose-300 bg-rose-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
          >
            PDF
          </a>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-indigo-200 hover:bg-indigo-400 disabled:opacity-60"
          >
            <span className="text-lg font-light leading-none">+</span>
            Créer agrément
          </button>
        </div>
        </div>
      </header>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/40 p-3 sm:grid-cols-5">
        <input aria-label="Filtre agence" value={filterAgence} onChange={(e) => setFilterAgence(e.target.value)} placeholder="Agence" className={inputClassXs} />
        <input aria-label="Filtre produit" value={filterProduit} onChange={(e) => setFilterProduit(e.target.value)} placeholder="Produit" className={inputClassXs} />
        <select aria-label="Filtre statut" value={filterStatut} onChange={(e) => setFilterStatut(e.target.value as "" | AgrementStatus)} className={inputClassXs}>
          <option value="">Tous statuts</option>
          <option value="RECU">RECU</option>
          <option value="CONTROLE">CONTROLE</option>
          <option value="TRANSMIS">TRANSMIS</option>
          <option value="FINALISE">FINALISE</option>
        </select>
        <input aria-label="Date début" type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className={inputClassXs} />
        <input aria-label="Date fin" type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className={inputClassXs} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>
          {total} entrée(s) · page {page}/{totalPages}
        </span>
        <button type="button" disabled={page <= 1} onClick={() => void load(page - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40">
          Précédent
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => void load(page + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40">
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
      {listError ? <p className="mb-3 text-sm text-rose-700">{listError}</p> : null}
      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Réf</th>
                <th className="px-3 py-2.5">Produit</th>
                <th className="px-3 py-2.5">Date réception</th>
                <th className="px-3 py-2.5">Réf officielle</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Document</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 transition-colors hover:bg-indigo-50/40">
                  <td className="px-3 py-2.5 font-mono text-xs">{row.reference}</td>
                  <td className="px-3 py-2.5">{row.produitCode}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">{new Date(row.dateReception).toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2.5">{row.referenceOfficielle}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPillClass(row.statut)}`}>
                      {row.statut}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.hasDocument ? (
                      <a
                        href={`/api/agrements/${row.id}/document`}
                        className="text-xs font-medium underline underline-offset-2 text-slate-700 hover:text-slate-900"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {row.statut === "RECU" ? (
                      <button
                        disabled={busyId === row.id}
                        onClick={() => void transition(row.id, "CONTROLE")}
                        className="inline-flex items-center justify-center rounded-lg border border-sky-600 bg-sky-600 px-3 py-1.5 text-[11px] font-semibold leading-tight text-white shadow-sm transition hover:border-sky-700 hover:bg-sky-700 disabled:opacity-60"
                      >
                        {busyId === row.id ? "..." : "Contrôler"}
                      </button>
                    ) : row.statut === "CONTROLE" ? (
                      <button
                        disabled={busyId === row.id}
                        onClick={() => void transition(row.id, "TRANSMIS")}
                        className="inline-flex items-center justify-center rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold leading-tight text-white shadow-sm transition hover:border-indigo-700 hover:bg-indigo-700 disabled:opacity-60"
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
        </div>
      )}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-agrement-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60"
            aria-label="Fermer"
            onClick={closeCreate}
            disabled={creating}
          />
          <div className="relative z-10 flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="relative flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 px-5 py-4">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-indigo-200/40 blur-2xl" />
              <div>
                <p className="mb-1 inline-flex rounded-full border border-indigo-300 bg-indigo-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-900">
                  Workflow agréments
                </p>
                <h3 id="create-agrement-title" className="text-lg font-semibold text-slate-900">
                  Créer agrément
                </h3>
                <p className="mt-1 text-xs leading-4 text-slate-600">Saisie des informations et chargement du document PDF.</p>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={closeCreate}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <form noValidate onSubmit={onCreate} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 via-white to-white px-5 py-4">
                {createError ? (
                  <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
                    {createError}
                  </div>
                ) : null}

                <div className="grid gap-3">
                  <section className="rounded-2xl border border-indigo-200/80 bg-white p-4 shadow-sm">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
                      Paramètres de l’agrément
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 md:col-span-3 xl:col-span-4">
                    <span className="text-xs font-medium text-slate-700">Produit concerné *</span>
                    <select
                      required
                      value={produitCode}
                      onChange={(e) => setProduitCode(e.target.value)}
                      className={inputClass}
                      disabled={referentialsLoading}
                    >
                      <option value="" disabled>
                        {referentialsLoading ? "Chargement des référentiels…" : "Sélectionner un produit"}
                      </option>
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
                    <span className="text-xs font-medium text-slate-700">Date de réception *</span>
                    <input
                      required
                      type="datetime-local"
                      value={dateReception}
                      onChange={(e) => setDateReception(e.target.value)}
                      className={inputClass}
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Référence officielle *</span>
                    <input
                      required
                      value={referenceOfficielle}
                      onChange={(e) => setReferenceOfficielle(e.target.value)}
                      className={inputClass}
                      placeholder="Référence officielle"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Agence concernée</span>
                    <select
                      value={agenceId}
                      onChange={(e) => setAgenceId(e.target.value)}
                      className={inputClass}
                      disabled={referentialsLoading}
                    >
                      <option value="">{referentialsLoading ? "Chargement des référentiels…" : "Aucune agence"}</option>
                      {agences
                        .filter((a) => a.actif && a.id)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.libelle}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Concessionnaire</span>
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
                    </div>
                  </section>

                  <section className="rounded-2xl border border-cyan-200/80 bg-white p-4 shadow-sm">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-cyan-800">
                      Document et notes
                    </p>
                    <div className="grid gap-3">
                  <label className="grid gap-1">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5 text-slate-500"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                        <path d="M14 2v5h5" />
                        <path d="M9 13h6" />
                        <path d="M9 17h6" />
                      </svg>
                      Document PDF *
                    </span>
                    <input
                      ref={pdfInputRef}
                      required
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                      className="sr-only"
                    />
                    <button
                      type="button"
                      onClick={() => pdfInputRef.current?.click()}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-left text-[11px] leading-4 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5 shrink-0 text-slate-500"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                          <path d="M14 2v5h5" />
                        </svg>
                        <span className="truncate">{pdfFile ? pdfFile.name : "Choisir un fichier PDF"}</span>
                      </span>
                      <span className="shrink-0 text-slate-500">Parcourir</span>
                    </button>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Observations</span>
                    <textarea
                      value={observations}
                      onChange={(e) => setObservations(e.target.value)}
                      rows={2}
                      className={inputClass}
                      placeholder="Notes internes (optionnel)"
                    />
                  </label>
                    </div>
                  </section>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".json,.csv,.xlsx,.xls,.pdf"
                  className="sr-only"
                  onChange={(e) => void onImportFileChange(e)}
                />
                <button
                  type="button"
                  disabled={importingFile}
                  onClick={() => importFileInputRef.current?.click()}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60"
                >
                  {importingFile ? "Import..." : "Importer fichier vers le tableau"}
                </button>
                <button
                  type="button"
                  onClick={() => void downloadAgrementsExcelTemplate()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Télécharger le modèle Excel
                </button>
                <button
                  type="button"
                  onClick={closeCreate}
                  disabled={creating}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-indigo-700 hover:bg-indigo-700 disabled:opacity-60"
                >
                  {creating ? "Enregistrement…" : "Créer agrément"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

