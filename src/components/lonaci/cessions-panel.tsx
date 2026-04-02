"use client";

import Link from "next/link";
import { captureByAliases, extractPdfText, normalizeDateToIso, normalizeNumericString } from "@/lib/lonaci/pdf-import";
import type { ChangeEvent } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";

type CessionStatus = "SAISIE_AGENT" | "CONTROLE_CHEF_SECTION" | "VALIDEE_CHEF_SERVICE" | "REJETEE";
type CessionKind = "CESSION" | "DELOCALISATION";

interface CessionItem {
  id: string;
  kind: CessionKind;
  concessionnaireId: string | null;
  reference: string;
  cedantId: string | null;
  beneficiaireId: string | null;
  produitCode: string | null;
  oldAdresse: string | null;
  oldAgenceId: string | null;
  newAdresse: string | null;
  newAgenceId: string | null;
  newGps: { lat: number; lng: number } | null;
  dateDemande: string;
  motif: string;
  statut: CessionStatus;
  commentaire: string | null;
  attachmentsCount: number;
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number; uploadedAt: string }>;
  createdAt: string;
  updatedAt: string;
}

interface ConcessionnaireOption {
  id: string;
  codePdv?: string;
  nomComplet?: string;
  raisonSociale?: string;
}

interface ProduitRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

interface AgenceRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

async function downloadCessionsExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = [
    "kind",
    "concessionnaireId",
    "cedantId",
    "beneficiaireId",
    "produitCode",
    "oldAdresse",
    "oldAgenceId",
    "newAdresse",
    "newAgenceId",
    "newGpsLat",
    "newGpsLng",
    "dateDemande",
    "motif",
    "commentaire",
  ];
  const sample = {
    kind: "CESSION",
    concessionnaireId: "",
    cedantId: "ID_CEDANT",
    beneficiaireId: "ID_BENEFICIAIRE",
    produitCode: "LOTO",
    oldAdresse: "",
    oldAgenceId: "",
    newAdresse: "",
    newAgenceId: "",
    newGpsLat: "",
    newGpsLng: "",
    dateDemande: new Date().toISOString(),
    motif: "Exemple import cession",
    commentaire: "",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "cessions");
  XLSX.writeFile(wb, "modele-cessions.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    kind: ((raw.kind as string | null) ?? "CESSION").toUpperCase(),
    concessionnaireId: (raw.concessionnaireId as string | null) ?? null,
    cedantId: (raw.cedantId as string | null) ?? null,
    beneficiaireId: (raw.beneficiaireId as string | null) ?? null,
    produitCode: (raw.produitCode as string | null)?.toUpperCase() ?? null,
    oldAdresse: (raw.oldAdresse as string | null) ?? null,
    oldAgenceId: (raw.oldAgenceId as string | null) ?? null,
    newAdresse: (raw.newAdresse as string | null) ?? null,
    newAgenceId: (raw.newAgenceId as string | null) ?? null,
    newGps:
      raw.newGpsLat != null && raw.newGpsLng != null
        ? {
            lat: normalizeNumericString(String(raw.newGpsLat)) ?? null,
            lng: normalizeNumericString(String(raw.newGpsLng)) ?? null,
          }
        : null,
    dateDemande: (raw.dateDemande as string | null) ?? null,
    motif: (raw.motif as string | null) ?? null,
    commentaire: (raw.commentaire as string | null) ?? null,
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
      kind: captureByAliases(source, ["type", "kind", "operation"], "(cession|delocalisation|délocalisation)")?.toUpperCase() ?? "CESSION",
      concessionnaireId: captureByAliases(source, ["concessionnaire id", "pdv id"], "[a-z0-9]{8,}"),
      cedantId: captureByAliases(source, ["cedant id", "cédant id"], "[a-z0-9]{8,}"),
      beneficiaireId: captureByAliases(source, ["beneficiaire id", "bénéficiaire id"], "[a-z0-9]{8,}"),
      produitCode: captureByAliases(source, ["produit", "code produit"], "[a-z0-9_ -]{2,20}")?.toUpperCase(),
      oldAdresse: captureByAliases(source, ["ancienne adresse", "old adresse"], "[^|;]{1,200}"),
      oldAgenceId: captureByAliases(source, ["ancienne agence id", "old agence id"], "[a-z0-9]{8,}"),
      newAdresse: captureByAliases(source, ["nouvelle adresse", "new adresse"], "[^|;]{1,200}"),
      newAgenceId: captureByAliases(source, ["nouvelle agence id", "new agence id"], "[a-z0-9]{8,}"),
      newGpsLat: captureByAliases(source, ["latitude", "lat"], "[-0-9.,]{3,20}"),
      newGpsLng: captureByAliases(source, ["longitude", "lng"], "[-0-9.,]{3,20}"),
      dateDemande: normalizeDateToIso(
        captureByAliases(source, ["date demande", "date"], "[0-9/\\- :tTzZ.+]{8,40}"),
      ),
      motif: captureByAliases(source, ["motif"], "[^|;]{1,300}"),
      commentaire: captureByAliases(source, ["commentaire", "observations"], "[^|;]{1,300}"),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporté. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

function statusLabel(status: CessionStatus) {
  switch (status) {
    case "SAISIE_AGENT":
      return "Saisie agent";
    case "CONTROLE_CHEF_SECTION":
      return "Contrôle chef section";
    case "VALIDEE_CHEF_SERVICE":
      return "Validée chef service";
    case "REJETEE":
      return "Rejetée";
  }
}

export default function CessionsPanel() {
  const [items, setItems] = useState<CessionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [kind, setKind] = useState<CessionKind>("CESSION");

  const [concessionnaireId, setConcessionnaireId] = useState("");
  const [cedantId, setCedantId] = useState("");
  const [beneficiaireId, setBeneficiaireId] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const [oldAdresse, setOldAdresse] = useState("");
  const [oldAgenceId, setOldAgenceId] = useState("");
  const [newAdresse, setNewAdresse] = useState("");
  const [newAgenceId, setNewAgenceId] = useState("");
  const [newGpsLat, setNewGpsLat] = useState("");
  const [newGpsLng, setNewGpsLng] = useState("");
  const [dateDemande, setDateDemande] = useState("");
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);
  const docsInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importingFile, setImportingFile] = useState(false);

  const [concessionnaires, setConcessionnaires] = useState<ConcessionnaireOption[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] leading-4 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400";

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
      params.set("kind", kind);
      const res = await fetch(`/api/cessions?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as { items: CessionItem[]; total: number; page: number };
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
    } finally {
      setLoading(false);
    }
  }, [kind, page, pageSize]);

  useEffect(() => {
    void load(1);
    void (async () => {
      try {
        const r = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { user?: { role?: string } };
        setMeRole(d.user?.role ?? null);
      } catch {
        setMeRole(null);
      }
    })();
  }, [load]);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    setRefLoading(true);
    setRefError(null);
    void (async () => {
      try {
        const [refRes, cedRes] = await Promise.all([
          fetch("/api/referentials", { credentials: "include", cache: "no-store" }),
          fetch("/api/concessionnaires?page=1&pageSize=100&statut=ACTIF", { credentials: "include", cache: "no-store" }),
        ]);
        if (!refRes.ok || !cedRes.ok) throw new Error("Référentiels indisponibles");
        const refs = (await refRes.json()) as { produits: ProduitRef[]; agences: AgenceRef[] };
        const c = (await cedRes.json()) as { items: ConcessionnaireOption[] };
        if (!cancelled) {
          setProduits((refs.produits ?? []).filter((p) => p.actif));
          setAgences((refs.agences ?? []).filter((a) => a.actif));
          setConcessionnaires(c.items ?? []);
        }
      } catch (e) {
        if (!cancelled) setRefError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
      } finally {
        if (!cancelled) setRefLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  function openCreate() {
    setCreateOpen(true);
    setCreateError(null);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setDateDemande(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`);
  }

  function closeCreate() {
    setCreateOpen(false);
    setConcessionnaireId("");
    setCedantId("");
    setBeneficiaireId("");
    setProduitCode("");
    setOldAdresse("");
    setOldAgenceId("");
    setNewAdresse("");
    setNewAgenceId("");
    setNewGpsLat("");
    setNewGpsLng("");
    setMotif("");
    setCommentaire("");
    setDocuments([]);
    setCreateError(null);
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("concessionnaireId", concessionnaireId);
      form.set("cedantId", cedantId);
      form.set("beneficiaireId", beneficiaireId);
      form.set("produitCode", produitCode);
      form.set("oldAdresse", oldAdresse);
      form.set("oldAgenceId", oldAgenceId);
      form.set("newAdresse", newAdresse);
      form.set("newAgenceId", newAgenceId);
      form.set("newGpsLat", newGpsLat);
      form.set("newGpsLng", newGpsLng);
      form.set("dateDemande", new Date(dateDemande).toISOString());
      form.set("motif", motif);
      form.set("commentaire", commentaire);
      for (const f of documents) form.append("documents", f);
      const res = await fetch("/api/cessions", { method: "POST", credentials: "include", body: form });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Création impossible");
      }
      closeCreate();
      setToast({
        type: "success",
        message: kind === "CESSION" ? "Demande de cession créée." : "Demande de délocalisation créée.",
      });
      await load(1);
    } catch (e) {
      setCreateError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
    } finally {
      setCreating(false);
    }
  }

  async function transition(id: string, target: CessionStatus) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/cessions/${encodeURIComponent(id)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Transition impossible");
      }
      setToast({ type: "success", message: "Transition appliquée." });
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
      fd.set("collection", "cessions");
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
        message: `Import cessions terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s), ${data?.skippedInvalidRows ?? 0} ligne(s) invalide(s)${
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
  const canControl = meRole === "CHEF_SECTION" || meRole === "CHEF_SERVICE";
  const canValidate = meRole === "CHEF_SERVICE";

  const concLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of concessionnaires) {
      map.set(c.id, (c.nomComplet || c.raisonSociale || c.codePdv || c.id).trim());
    }
    return map;
  }, [concessionnaires]);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-6 shadow-sm">
      <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-indigo-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-0 h-44 w-44 rounded-full bg-cyan-200/25 blur-3xl" />
      <div className="relative mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-indigo-700">LONACI</p>
          <h2 className="text-2xl font-semibold text-slate-900">Cessions & délocalisations</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as CessionKind);
              void load(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
            aria-label="Type d'opération"
          >
            <option value="CESSION">Cession</option>
            <option value="DELOCALISATION">Délocalisation</option>
          </select>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:border-indigo-700 hover:bg-indigo-700"
          >
            {kind === "CESSION" ? "Créer demande de cession" : "Créer demande de délocalisation"}
          </button>
          <button
            type="button"
            onClick={() => void downloadCessionsExcelTemplate()}
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
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} className="text-xs underline">
              Fermer
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Total dossiers</p>
          <p className="mt-1 text-xl font-semibold text-indigo-900">{total}</p>
        </article>
        <article className="rounded-xl border border-sky-200 bg-sky-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Page active</p>
          <p className="mt-1 text-xl font-semibold text-sky-900">
            {page} <span className="text-sm font-medium text-sky-700">/ {totalPages}</span>
          </p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Type sélectionné</p>
          <p className="mt-1 text-xl font-semibold text-emerald-900">{kind === "CESSION" ? "Cession" : "Délocalisation"}</p>
        </article>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <button type="button" disabled={page <= 1} onClick={() => void load(page - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">
          Préc.
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => void load(page + 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">
          Suiv.
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Réf</th>
                {kind === "CESSION" ? (
                  <>
                    <th className="px-3 py-2.5">Cédant</th>
                    <th className="px-3 py-2.5">Bénéficiaire</th>
                    <th className="px-3 py-2.5">Produit</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-2.5">Concessionnaire</th>
                    <th className="px-3 py-2.5">Ancienne agence</th>
                    <th className="px-3 py-2.5">Nouvelle agence</th>
                  </>
                )}
                <th className="px-3 py-2.5">Date demande</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Docs</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-mono text-xs">{row.reference}</td>
                  {row.kind === "CESSION" ? (
                    <>
                      <td className="px-3 py-2.5">{concLabelById.get(row.cedantId ?? "") ?? row.cedantId}</td>
                      <td className="px-3 py-2.5">{concLabelById.get(row.beneficiaireId ?? "") ?? row.beneficiaireId}</td>
                      <td className="px-3 py-2.5">{row.produitCode}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5">{concLabelById.get(row.concessionnaireId ?? "") ?? row.concessionnaireId}</td>
                      <td className="px-3 py-2.5">{row.oldAgenceId ?? "—"}</td>
                      <td className="px-3 py-2.5">{row.newAgenceId ?? "—"}</td>
                    </>
                  )}
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">{new Date(row.dateDemande).toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2.5">{statusLabel(row.statut)}</td>
                  <td className="px-3 py-2.5">
                    {row.attachments.length ? (
                      <div className="flex flex-col gap-1">
                        {row.attachments.map((a) => (
                          <a
                            key={a.id}
                            href={`/api/cessions/${row.id}/attachments/${a.id}`}
                            className="text-xs underline text-slate-700"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {a.filename}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {row.statut === "SAISIE_AGENT" && canControl ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void transition(row.id, "CONTROLE_CHEF_SECTION")}
                        className="rounded-lg border border-sky-600 bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                      >
                        Contrôler
                      </button>
                    ) : row.statut === "CONTROLE_CHEF_SECTION" && canValidate ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void transition(row.id, "VALIDEE_CHEF_SERVICE")}
                        className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                      >
                        Valider + transférer
                      </button>
                    ) : row.statut !== "VALIDEE_CHEF_SERVICE" && canControl ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void transition(row.id, "REJETEE")}
                        className="rounded-lg border border-rose-600 bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                      >
                        Rejeter
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                    {kind === "CESSION" ? "Aucune demande de cession." : "Aucune demande de délocalisation."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-cession-title">
          <button type="button" className="absolute inset-0 bg-slate-900/60" aria-label="Fermer" onClick={closeCreate} disabled={creating} />
          <div className="relative z-10 flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 px-4 py-2">
              <div>
                <h3 id="create-cession-title" className="text-sm font-semibold text-slate-900">
                  {kind === "CESSION" ? "Demande de cession" : "Demande de délocalisation"}
                </h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                  {kind === "CESSION"
                    ? "Cédant, bénéficiaire, produit, motif, documents joints."
                    : "Concessionnaire, ancienne/nouvelle agence, nouvelles coordonnées GPS, motif."}
                </p>
              </div>
              <button type="button" onClick={closeCreate} disabled={creating} className="rounded-lg border border-slate-300 px-2 py-0.5 text-sm text-slate-600">×</button>
            </div>
            <form id="create-cession-form" noValidate onSubmit={onCreate} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {createError ? <p className="mb-2 text-xs text-rose-700">{createError}</p> : null}
              {refError ? <p className="mb-2 text-xs text-rose-700">{refError}</p> : null}

              <div className="grid gap-3">
                {kind === "CESSION" ? (
                  <section className="grid gap-2 rounded-xl border border-indigo-200/70 bg-indigo-50/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Informations cession</p>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Concessionnaire cédant *</span>
                      <select required value={cedantId} onChange={(e) => setCedantId(e.target.value)} className={inputClass} disabled={refLoading}>
                        <option value="">{refLoading ? "Chargement…" : "Sélectionner"}</option>
                        {concessionnaires.map((c) => (
                          <option key={c.id} value={c.id}>{(c.nomComplet || c.raisonSociale || c.codePdv || c.id).trim()}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Concessionnaire bénéficiaire *</span>
                      <select required value={beneficiaireId} onChange={(e) => setBeneficiaireId(e.target.value)} className={inputClass} disabled={refLoading}>
                        <option value="">{refLoading ? "Chargement…" : "Sélectionner"}</option>
                        {concessionnaires.map((c) => (
                          <option key={c.id} value={c.id}>{(c.nomComplet || c.raisonSociale || c.codePdv || c.id).trim()}</option>
                        ))}
                      </select>
                      <span className="text-[11px] text-slate-500">
                        Bénéficiaire absent ? <Link href="/concessionnaires" className="underline">Créer un concessionnaire</Link>.
                      </span>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Produit concerné *</span>
                      <select required value={produitCode} onChange={(e) => setProduitCode(e.target.value)} className={inputClass} disabled={refLoading}>
                        <option value="">{refLoading ? "Chargement…" : "Sélectionner un produit"}</option>
                        {produits.map((p) => (
                          <option key={p.code} value={p.code}>{p.libelle}</option>
                        ))}
                      </select>
                    </label>
                  </section>
                ) : (
                  <section className="grid gap-2 rounded-xl border border-cyan-200/70 bg-cyan-50/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Informations délocalisation</p>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Concessionnaire concerné *</span>
                      <select required value={concessionnaireId} onChange={(e) => setConcessionnaireId(e.target.value)} className={inputClass} disabled={refLoading}>
                        <option value="">{refLoading ? "Chargement…" : "Sélectionner"}</option>
                        {concessionnaires.map((c) => (
                          <option key={c.id} value={c.id}>{(c.nomComplet || c.raisonSociale || c.codePdv || c.id).trim()}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Ancienne adresse / agence *</span>
                      <input required value={oldAdresse} onChange={(e) => setOldAdresse(e.target.value)} className={inputClass} placeholder="Adresse actuelle" />
                      <select required value={oldAgenceId} onChange={(e) => setOldAgenceId(e.target.value)} className={inputClass} disabled={refLoading}>
                        <option value="">Sélectionner l&apos;agence actuelle</option>
                        {agences.map((a) => (
                          <option key={a.id} value={a.id}>{a.libelle}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Nouvelle adresse / agence *</span>
                      <input required value={newAdresse} onChange={(e) => setNewAdresse(e.target.value)} className={inputClass} placeholder="Nouvelle adresse" />
                      <select required value={newAgenceId} onChange={(e) => setNewAgenceId(e.target.value)} className={inputClass} disabled={refLoading}>
                        <option value="">{refLoading ? "Chargement…" : "Sélectionner la nouvelle agence"}</option>
                        {agences.map((a) => (
                          <option key={a.id} value={a.id}>{a.libelle}</option>
                        ))}
                      </select>
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-700">Latitude GPS *</span>
                        <input required type="number" step="any" value={newGpsLat} onChange={(e) => setNewGpsLat(e.target.value)} className={inputClass} />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-700">Longitude GPS *</span>
                        <input required type="number" step="any" value={newGpsLng} onChange={(e) => setNewGpsLng(e.target.value)} className={inputClass} />
                      </label>
                    </div>
                  </section>
                )}
                <section className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Date de la demande *</span>
                  <input required type="datetime-local" value={dateDemande} onChange={(e) => setDateDemande(e.target.value)} className={inputClass} />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">
                    {kind === "CESSION" ? "Motif de la cession *" : "Motif de la délocalisation *"}
                  </span>
                  <textarea required rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} className={inputClass} />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Commentaire</span>
                  <textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className={inputClass} />
                </label>
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
                    Documents joints
                  </span>
                  <input
                    ref={docsInputRef}
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => setDocuments(Array.from(e.target.files ?? []))}
                  />
                  <button
                    type="button"
                    onClick={() => docsInputRef.current?.click()}
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
                      <span className="truncate">
                        {documents.length ? `${documents.length} document(s) sélectionné(s)` : "Ajouter des documents (PDF/JPG/PNG/WebP)"}
                      </span>
                    </span>
                    <span className="text-slate-500">Parcourir</span>
                  </button>
                </label>
                </section>
              </div>
            </form>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
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
                form="create-cession-form"
                disabled={creating}
                className="rounded-lg border border-indigo-600 bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:border-indigo-700 hover:bg-indigo-700 disabled:opacity-60"
              >
                {creating ? "Enregistrement…" : "Soumettre (AGENT)"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

