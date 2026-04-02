"use client";

import { captureByAliases, extractPdfText, normalizeDateToIso } from "@/lib/lonaci/pdf-import";
import type { ChangeEvent } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";

type ResiliationStatus = "DOSSIER_RECU" | "RESILIE";

interface ResiliationItem {
  id: string;
  concessionnaireId: string;
  produitCode: string;
  dateReception: string;
  motif: string;
  statut: ResiliationStatus;
  commentaire: string | null;
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number; uploadedAt: string }>;
}

interface ConcessionnaireItem {
  id: string;
  raisonSociale?: string;
  nomComplet?: string;
  codePdv?: string;
}

interface ProduitRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

async function downloadResiliationsExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = ["concessionnaireId", "produitCode", "dateReception", "motif", "commentaire"];
  const sample = {
    concessionnaireId: "ID_CONCESSIONNAIRE",
    produitCode: "LOTO",
    dateReception: new Date().toISOString(),
    motif: "Exemple import résiliation",
    commentaire: "",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "resiliations");
  XLSX.writeFile(wb, "modele-resiliations.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    concessionnaireId: (raw.concessionnaireId as string | null) ?? null,
    produitCode: (raw.produitCode as string | null)?.toUpperCase() ?? null,
    dateReception: (raw.dateReception as string | null) ?? null,
    motif: (raw.motif as string | null) ?? null,
    commentaire: (raw.commentaire as string | null) ?? null,
    statut: (raw.statut as string | null) ?? "DOSSIER_RECU",
    attachments: [],
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
      concessionnaireId: captureByAliases(source, ["concessionnaire id", "pdv id"], "[a-z0-9]{8,}"),
      produitCode: captureByAliases(source, ["code produit", "produit"], "[a-z0-9_ -]{2,20}")?.toUpperCase(),
      dateReception: normalizeDateToIso(
        captureByAliases(source, ["date reception", "date"], "[0-9/\\- :tTzZ.+]{8,40}"),
      ),
      motif: captureByAliases(source, ["motif"], "[^|;]{1,300}"),
      commentaire: captureByAliases(source, ["commentaire", "observations"], "[^|;]{1,300}"),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporté. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

export default function ResiliationsPanel() {
  const [items, setItems] = useState<ResiliationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [concessionnaires, setConcessionnaires] = useState<ConcessionnaireItem[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [refLoading, setRefLoading] = useState(true);

  const [concessionnaireId, setConcessionnaireId] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const [dateReception, setDateReception] = useState("");
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);
  const docsRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const [creating, setCreating] = useState(false);

  const [fStatus, setFStatus] = useState<ResiliationStatus | "">("");
  const [fConcessionnaireId, setFConcessionnaireId] = useState("");
  const [fProduitCode, setFProduitCode] = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
      if (fStatus) q.set("statut", fStatus);
      if (fConcessionnaireId) q.set("concessionnaireId", fConcessionnaireId);
      if (fProduitCode) q.set("produitCode", fProduitCode);
      if (fDateFrom) q.set("dateFrom", new Date(fDateFrom).toISOString());
      if (fDateTo) q.set("dateTo", new Date(fDateTo).toISOString());
      const res = await fetch(`/api/resiliations?${q}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Chargement impossible");
      const d = (await res.json()) as { items: ResiliationItem[]; total: number; page: number };
      setItems(d.items);
      setTotal(d.total);
      setPage(d.page);
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
    } finally {
      setLoading(false);
    }
  }, [fConcessionnaireId, fDateFrom, fDateTo, fProduitCode, fStatus, page, pageSize]);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [authRes, refRes, cRes] = await Promise.all([
          fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
          fetch("/api/referentials", { credentials: "include", cache: "no-store" }),
          fetch("/api/concessionnaires?page=1&pageSize=100&statut=ACTIF", { credentials: "include", cache: "no-store" }),
        ]);
        if (authRes.ok) {
          const auth = (await authRes.json()) as { user?: { role?: string } };
          setMeRole(auth.user?.role ?? null);
        }
        if (refRes.ok) {
          const refs = (await refRes.json()) as { produits: ProduitRef[] };
          setProduits((refs.produits ?? []).filter((p) => p.actif));
        }
        if (cRes.ok) {
          const c = (await cRes.json()) as { items: ConcessionnaireItem[] };
          setConcessionnaires(c.items ?? []);
        }
      } finally {
        setRefLoading(false);
      }
    })();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("concessionnaireId", concessionnaireId);
      form.set("produitCode", produitCode);
      form.set("dateReception", new Date(dateReception).toISOString());
      form.set("motif", motif);
      form.set("commentaire", commentaire);
      for (const f of documents) form.append("documents", f);
      const res = await fetch("/api/resiliations", { method: "POST", credentials: "include", body: form });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Création impossible");
      }
      setConcessionnaireId("");
      setProduitCode("");
      setDateReception("");
      setMotif("");
      setCommentaire("");
      setDocuments([]);
      setCreateOpen(false);
      setToast({ type: "success", message: "Dossier de résiliation créé (statut DOSSIER_REÇU)." });
      await load(1);
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setCreating(false);
    }
  }

  async function validateResiliation(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/resiliations/${encodeURIComponent(id)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "RESILIE" }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Validation impossible");
      }
      setToast({ type: "success", message: "Résiliation validée (statut RÉSILIÉ)." });
      await load(page);
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
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
      fd.set("collection", "resiliations");
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
        message: `Import résiliations terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s), ${data?.skippedInvalidRows ?? 0} ligne(s) invalide(s)${
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

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of concessionnaires) {
      m.set(c.id, (c.nomComplet || c.raisonSociale || c.codePdv || c.id).trim());
    }
    return m;
  }, [concessionnaires]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canValidate = meRole === "CHEF_SERVICE";
  function openCreate() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setDateReception(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
    );
    setCreateOpen(true);
  }
  function closeCreate() {
    if (creating) return;
    setCreateOpen(false);
    setConcessionnaireId("");
    setProduitCode("");
    setDateReception("");
    setMotif("");
    setCommentaire("");
    setDocuments([]);
  }
  const exportBase = `/api/resiliations/export?${new URLSearchParams({
    ...(fStatus ? { statut: fStatus } : {}),
    ...(fConcessionnaireId ? { concessionnaireId: fConcessionnaireId } : {}),
    ...(fProduitCode ? { produitCode: fProduitCode } : {}),
    ...(fDateFrom ? { dateFrom: new Date(fDateFrom).toISOString() } : {}),
    ...(fDateTo ? { dateTo: new Date(fDateTo).toISOString() } : {}),
  }).toString()}`;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-cyan-50/60 via-white to-rose-50/30 p-6 shadow-sm">
      <div className="pointer-events-none absolute -right-16 top-0 h-44 w-44 rounded-full bg-cyan-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-0 h-48 w-48 rounded-full bg-rose-200/20 blur-3xl" />
      <div className="relative mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-700">LONACI</p>
          <h2 className="text-2xl font-semibold text-slate-900">Résiliations</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center rounded-xl border border-cyan-600 bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700"
          >
            Créer demande de résiliation
          </button>
          <a
            href={`${exportBase}&format=csv`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-emerald-600 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            Export Excel (CSV)
          </a>
          <a
            href={`${exportBase}&format=pdf`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Export PDF (imprimable)
          </a>
          <button
            type="button"
            onClick={() => void downloadResiliationsExcelTemplate()}
            className="rounded-xl border border-emerald-600 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
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
            className="rounded-xl border border-cyan-600 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 shadow-sm transition hover:bg-cyan-100 disabled:opacity-60"
          >
            {importingFile ? "Import..." : "Importer fichier vers le tableau"}
          </button>
        </div>
      </div>

      {toast ? (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {toast.message}
        </div>
      ) : null}
      {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mb-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-5">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as ResiliationStatus | "")} className={inputClass}>
          <option value="">Tous statuts</option>
          <option value="DOSSIER_RECU">DOSSIER_RECU</option>
          <option value="RESILIE">RESILIE</option>
        </select>
        <select value={fConcessionnaireId} onChange={(e) => setFConcessionnaireId(e.target.value)} className={inputClass}>
          <option value="">Tous concessionnaires</option>
          {concessionnaires.map((c) => (
            <option key={c.id} value={c.id}>{(c.nomComplet || c.raisonSociale || c.codePdv || c.id).trim()}</option>
          ))}
        </select>
        <select value={fProduitCode} onChange={(e) => setFProduitCode(e.target.value)} className={inputClass}>
          <option value="">Tous produits</option>
          {produits.map((p) => (
            <option key={p.code} value={p.code}>{p.libelle}</option>
          ))}
        </select>
        <input type="date" value={fDateFrom} onChange={(e) => setFDateFrom(e.target.value)} className={inputClass} />
        <input type="date" value={fDateTo} onChange={(e) => setFDateTo(e.target.value)} className={inputClass} />
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-cyan-200 bg-cyan-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Total dossiers</p>
          <p className="mt-1 text-xl font-semibold text-cyan-900">{total}</p>
        </article>
        <article className="rounded-xl border border-rose-200 bg-rose-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Dossiers reçus</p>
          <p className="mt-1 text-xl font-semibold text-rose-900">{items.filter((row) => row.statut === "DOSSIER_RECU").length}</p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Résiliés</p>
          <p className="mt-1 text-xl font-semibold text-emerald-900">{items.filter((row) => row.statut === "RESILIE").length}</p>
        </article>
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs text-slate-600">
        <span>{total} entrée(s) · page {page}/{totalPages}</span>
        <button
          type="button"
          onClick={() => void load(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
        >
          Préc.
        </button>
        <button
          type="button"
          onClick={() => void load(page + 1)}
          disabled={page >= totalPages}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
        >
          Suiv.
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Concessionnaire</th>
                <th className="px-3 py-2.5">Produit</th>
                <th className="px-3 py-2.5">Date réception</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Documents</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 transition hover:bg-cyan-50/40">
                  <td className="px-3 py-2.5">{labelById.get(row.concessionnaireId) ?? row.concessionnaireId}</td>
                  <td className="px-3 py-2.5">{row.produitCode}</td>
                  <td className="px-3 py-2.5 text-xs">{new Date(row.dateReception).toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2.5">{row.statut}</td>
                  <td className="px-3 py-2.5">
                    {row.attachments.length ? row.attachments.map((a) => (
                      <div key={a.id}>
                        <a href={`/api/resiliations/${row.id}/attachments/${a.id}`} target="_blank" rel="noreferrer" className="text-xs underline text-slate-700">{a.filename}</a>
                      </div>
                    )) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {row.statut === "DOSSIER_RECU" && canValidate ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void validateResiliation(row.id)}
                        className="rounded-lg border border-rose-600 bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:border-rose-700 hover:bg-rose-700 disabled:opacity-60"
                      >
                        Valider (RÉSILIÉ)
                      </button>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">Aucune résiliation.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-resiliation-title">
          <button type="button" className="absolute inset-0 bg-slate-900/60" aria-label="Fermer" onClick={closeCreate} disabled={creating} />
          <div className="relative z-10 flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-rose-50 px-4 py-2">
              <div>
                <h3 id="create-resiliation-title" className="text-sm font-semibold text-slate-900">
                  Demande de résiliation
                </h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">Concessionnaire, produit, date de réception, motif, documents joints.</p>
              </div>
              <button type="button" onClick={closeCreate} disabled={creating} className="rounded-lg border border-slate-300 px-2 py-0.5 text-sm text-slate-600">×</button>
            </div>
            <form id="create-resiliation-form" noValidate onSubmit={onCreate} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="grid gap-3">
                <section className="grid gap-2 rounded-xl border border-cyan-200/70 bg-cyan-50/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Informations dossier</p>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Concessionnaire concerné *</span>
                  <select required value={concessionnaireId} onChange={(e) => setConcessionnaireId(e.target.value)} className={inputClass} disabled={refLoading}>
                    <option value="">{refLoading ? "Chargement..." : "Sélectionner"}</option>
                    {concessionnaires.map((c) => (
                      <option key={c.id} value={c.id}>{(c.nomComplet || c.raisonSociale || c.codePdv || c.id).trim()}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Produit concerné *</span>
                  <select required value={produitCode} onChange={(e) => setProduitCode(e.target.value)} className={inputClass} disabled={refLoading}>
                    <option value="">{refLoading ? "Chargement..." : "Sélectionner un produit"}</option>
                    {produits.map((p) => (
                      <option key={p.code} value={p.code}>{p.libelle}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Date de réception du dossier *</span>
                  <input required type="datetime-local" value={dateReception} onChange={(e) => setDateReception(e.target.value)} className={inputClass} />
                </label>
                </section>
                <section className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <label className="grid gap-1">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                      <path d="M14 2v5h5" />
                      <path d="M9 13h6" />
                      <path d="M9 17h6" />
                    </svg>
                    Documents joints
                  </span>
                  <input ref={docsRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setDocuments(Array.from(e.target.files ?? []))} />
                  <button
                    type="button"
                    onClick={() => docsRef.current?.click()}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm outline-none ring-cyan-500/20 focus:ring-2 focus:ring-cyan-500"
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                        <path d="M14 2v5h5" />
                      </svg>
                      <span className="truncate">
                        {documents.length ? `${documents.length} document(s) sélectionné(s)` : "Ajouter lettres/documents"}
                      </span>
                    </span>
                    <span className="shrink-0 text-slate-500">Parcourir</span>
                  </button>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Motif de résiliation *</span>
                  <textarea required rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} className={inputClass} />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Commentaire</span>
                  <textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className={inputClass} />
                </label>
                </section>
              </div>
            </form>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
              <button type="button" onClick={closeCreate} disabled={creating} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
                Annuler
              </button>
              <button
                type="submit"
                form="create-resiliation-form"
                disabled={creating}
                className="rounded-lg border border-cyan-600 bg-cyan-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700 disabled:opacity-60"
              >
                {creating ? "Enregistrement…" : "Créer dossier (DOSSIER_REÇU)"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
