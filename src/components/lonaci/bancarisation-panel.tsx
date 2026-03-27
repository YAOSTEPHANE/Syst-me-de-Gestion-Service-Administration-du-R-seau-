"use client";

import Link from "next/link";
import { captureByAliases, extractPdfText, normalizeDateToIso } from "@/lib/lonaci/pdf-import";
import type { ChangeEvent } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";

type Banc = "NON_BANCARISE" | "EN_COURS" | "BANCARISE";
type RequestStatus = "SOUMIS" | "VALIDE" | "REJETE";

interface ConcRow {
  id: string;
  codePdv: string;
  nomComplet: string;
  statutBancarisation: Banc;
  agenceId: string | null;
  produitsAutorises: string[];
}
interface RefAgence {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}
interface RefProduit {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}
interface ReqRow {
  id: string;
  concessionnaireId: string;
  statutActuel: Banc;
  nouveauStatut: Banc;
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  dateEffet: string;
  status: RequestStatus;
  validationComment: string | null;
  justificatif: { url: string; filename: string };
  createdAt: string;
}
interface CounterRow {
  agenceId: string | null;
  agenceLabel: string;
  produitCode: string;
  NON_BANCARISE: number;
  EN_COURS: number;
  BANCARISE: number;
}

type Decision = "VALIDER" | "REJETER";

const STATUS_TOKENS = {
  NON_BANCARISE: {
    badge: "bg-rose-100 text-rose-950 ring-1 ring-rose-400",
    card: "border-rose-200 bg-linear-to-br from-rose-50 to-white",
    value: "text-rose-800",
  },
  EN_COURS: {
    badge: "bg-amber-100 text-amber-950 ring-1 ring-amber-400",
    card: "border-amber-200 bg-linear-to-br from-amber-50 to-white",
    value: "text-amber-800",
  },
  BANCARISE: {
    badge: "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-400",
    card: "border-emerald-200 bg-linear-to-br from-emerald-50 to-white",
    value: "text-emerald-800",
  },
} as const;

const REQUEST_STATUS_TOKENS = {
  SOUMIS: "bg-indigo-100 text-indigo-950 ring-1 ring-indigo-400",
  VALIDE: "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-400",
  REJETE: "bg-rose-100 text-rose-950 ring-1 ring-rose-400",
} as const;

async function downloadBancarisationExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = [
    "concessionnaireId",
    "agenceId",
    "produitCode",
    "statutActuel",
    "nouveauStatut",
    "compteBancaire",
    "banqueEtablissement",
    "dateEffet",
    "status",
    "validationComment",
  ];
  const sample = {
    concessionnaireId: "ID_CONCESSIONNAIRE",
    agenceId: "ID_AGENCE",
    produitCode: "LOTO",
    statutActuel: "NON_BANCARISE",
    nouveauStatut: "EN_COURS",
    compteBancaire: "",
    banqueEtablissement: "",
    dateEffet: new Date().toISOString(),
    status: "SOUMIS",
    validationComment: "",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "bancarisation_requests");
  XLSX.writeFile(wb, "modele-bancarisation.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    concessionnaireId: (raw.concessionnaireId as string | null) ?? null,
    agenceId: (raw.agenceId as string | null) ?? null,
    produitCode: (raw.produitCode as string | null)?.toUpperCase() ?? null,
    statutActuel: (raw.statutActuel as string | null) ?? "NON_BANCARISE",
    nouveauStatut: (raw.nouveauStatut as string | null) ?? "EN_COURS",
    compteBancaire: (raw.compteBancaire as string | null) ?? null,
    banqueEtablissement: (raw.banqueEtablissement as string | null) ?? null,
    dateEffet: (raw.dateEffet as string | null) ?? null,
    status: (raw.status as string | null) ?? "SOUMIS",
    validationComment: (raw.validationComment as string | null) ?? null,
    justificatif: { url: "#", filename: "import-manuel" },
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
      concessionnaireId: captureByAliases(source, ["concessionnaire id", "pdv id"], "[a-z0-9]{8,}"),
      agenceId: captureByAliases(source, ["agence id"], "[a-z0-9]{8,}"),
      produitCode: captureByAliases(source, ["produit", "code produit"], "[a-z0-9_ -]{2,20}")?.toUpperCase(),
      statutActuel: captureByAliases(source, ["statut actuel"], "(non_bancarise|en_cours|bancarise)")?.toUpperCase(),
      nouveauStatut: captureByAliases(source, ["nouveau statut", "statut cible"], "(non_bancarise|en_cours|bancarise)")?.toUpperCase(),
      compteBancaire: captureByAliases(source, ["compte bancaire", "rib", "iban"], "[^|;]{4,120}"),
      banqueEtablissement: captureByAliases(source, ["banque", "etablissement"], "[^|;]{2,120}"),
      dateEffet: normalizeDateToIso(captureByAliases(source, ["date effet", "date"], "[0-9/\\- :tTzZ.+]{8,40}")),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporté. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

function statutBancBadge(statut: Banc) {
  return STATUS_TOKENS[statut].badge;
}

function requestStatusBadge(status: RequestStatus) {
  return REQUEST_STATUS_TOKENS[status];
}

export default function BancarisationPanel() {
  const [filter, setFilter] = useState<Banc | "">("");
  const [requestTab, setRequestTab] = useState<RequestStatus>("SOUMIS");
  const [items, setItems] = useState<ConcRow[]>([]);
  const [total, setTotal] = useState(0);
  const [refsAgences, setRefsAgences] = useState<RefAgence[]>([]);
  const [refsProduits, setRefsProduits] = useState<RefProduit[]>([]);
  const [requests, setRequests] = useState<ReqRow[]>([]);
  const [counters, setCounters] = useState<CounterRow[]>([]);
  const [userRole, setUserRole] = useState<string>("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<ReqRow | null>(null);
  const [decision, setDecision] = useState<Decision>("VALIDER");
  const [decisionComment, setDecisionComment] = useState("");
  const [decisionAck, setDecisionAck] = useState(false);

  const [concessionnaireId, setConcessionnaireId] = useState("");
  const [nouveauStatut, setNouveauStatut] = useState<Banc>("EN_COURS");
  const [compteBancaire, setCompteBancaire] = useState("");
  const [banqueEtablissement, setBanqueEtablissement] = useState("");
  const [dateEffet, setDateEffet] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const b = useMemo(() => {
    const acc = { NON_BANCARISE: 0, EN_COURS: 0, BANCARISE: 0 };
    for (const c of counters) {
      acc.NON_BANCARISE += c.NON_BANCARISE;
      acc.EN_COURS += c.EN_COURS;
      acc.BANCARISE += c.BANCARISE;
    }
    return acc;
  }, [counters]);

  const requestCounters = useMemo(() => {
    const c = { SOUMIS: 0, VALIDE: 0, REJETE: 0 };
    for (const r of requests) c[r.status] += 1;
    return c;
  }, [requests]);

  const tauxBancarisation = useMemo(() => {
    const totalGlobal = b.NON_BANCARISE + b.EN_COURS + b.BANCARISE;
    if (totalGlobal <= 0) return 0;
    return Math.round((b.BANCARISE / totalGlobal) * 100);
  }, [b]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (filter) params.set("statutBancarisation", filter);
      const [listRes, refsRes, reqRes, meRes] = await Promise.all([
        fetch(`/api/concessionnaires?${params}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/referentials", { credentials: "include", cache: "no-store" }),
        fetch(`/api/bancarisation?page=1&pageSize=50&status=${requestTab}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
      ]);
      if (!listRes.ok || !refsRes.ok || !reqRes.ok || !meRes.ok) throw new Error();
      const listData = (await listRes.json()) as { items: ConcRow[]; total: number };
      const refsData = (await refsRes.json()) as { agences: RefAgence[]; produits: RefProduit[] };
      const reqData = (await reqRes.json()) as {
        items: ReqRow[];
        counters: CounterRow[];
        allStatusCounts?: { SOUMIS: number; VALIDE: number; REJETE: number };
      };
      const meData = (await meRes.json()) as { user: { role: string } };
      setItems(listData.items);
      setTotal(listData.total);
      setRefsAgences(refsData.agences);
      setRefsProduits(refsData.produits);
      setRequests(reqData.items);
      setCounters(reqData.counters);
      setUserRole(meData.user.role);
    } catch {
      setError("Impossible de charger les concessionnaires.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, requestTab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setToast(null);
    try {
      if (!file) throw new Error("Document justificatif obligatoire.");
      if (nouveauStatut === "BANCARISE" && !compteBancaire.trim()) {
        throw new Error("Le numero de compte bancaire est obligatoire pour BANCARISE.");
      }
      const form = new FormData();
      form.set("concessionnaireId", concessionnaireId);
      form.set("nouveauStatut", nouveauStatut);
      form.set("compteBancaire", compteBancaire.trim());
      form.set("banqueEtablissement", banqueEtablissement.trim());
      form.set("dateEffet", new Date(dateEffet).toISOString());
      form.set("produitCode", produitCode);
      form.set("file", file);
      const res = await fetch("/api/bancarisation", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Creation impossible");
      }
      setToast({ type: "success", message: "Demande soumise pour validation Chef(fe) de service." });
      setCreateOpen(false);
      setConcessionnaireId("");
      setCompteBancaire("");
      setBanqueEtablissement("");
      setDateEffet("");
      setFile(null);
      await load();
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setSubmitting(false);
    }
  }

  async function decideRequest(id: string, action: Decision) {
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`/api/bancarisation/${encodeURIComponent(id)}/validate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: action,
          comment: decisionComment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Decision impossible");
      }
      setToast({
        type: "success",
        message: action === "VALIDER" ? "Demande validée." : "Demande rejetée.",
      });
      setDecisionTarget(null);
      setDecisionComment("");
      setDecisionAck(false);
      await load();
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setValidating(false);
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
      fd.set("collection", "bancarisation_requests");
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
      await load();
      window.dispatchEvent(new Event("lonaci:data-imported"));
      setToast({
        type: "success",
        message: `Import bancarisation terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s), ${data?.skippedInvalidRows ?? 0} ligne(s) invalide(s)${
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

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-linear-to-br from-white via-slate-50 to-white p-5 shadow-sm">
        <div className="pointer-events-none absolute -top-24 right-0 h-52 w-52 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-12 h-40 w-40 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Bancarisation</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Pilotage opérationnel, validation et export des statuts bancaires.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-linear-to-r from-amber-600 to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Nouvelle demande
            </button>
            <button
              type="button"
              onClick={() => {
                void window.open(
                  `/api/bancarisation/export?format=excel${
                    filter ? `&statutBancarisation=${filter}` : ""
                  }`,
                  "_blank",
                );
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
            >
              Export Excel
            </button>
            <button
              type="button"
              onClick={() => {
                void window.open(
                  `/api/bancarisation/export?format=pdf${
                    filter ? `&statutBancarisation=${filter}` : ""
                  }`,
                  "_blank",
                );
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={() => void downloadBancarisationExcelTemplate()}
              className="rounded-xl border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Modèle Excel
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
              className="rounded-xl border border-cyan-600 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:opacity-60"
            >
              {importingFile ? "Import..." : "Importer fichier vers le tableau"}
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`rounded-2xl border p-3 ${STATUS_TOKENS.NON_BANCARISE.card}`}>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Non bancarisés</p>
            <p className={`mt-1 text-2xl font-semibold ${STATUS_TOKENS.NON_BANCARISE.value}`}>{b.NON_BANCARISE}</p>
          </div>
          <div className={`rounded-2xl border p-3 ${STATUS_TOKENS.EN_COURS.card}`}>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">En cours</p>
            <p className={`mt-1 text-2xl font-semibold ${STATUS_TOKENS.EN_COURS.value}`}>{b.EN_COURS}</p>
          </div>
          <div className={`rounded-2xl border p-3 ${STATUS_TOKENS.BANCARISE.card}`}>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Bancarisés</p>
            <p className={`mt-1 text-2xl font-semibold ${STATUS_TOKENS.BANCARISE.value}`}>{b.BANCARISE}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Taux</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{tauxBancarisation}%</p>
            <div className="mt-2 h-2 rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-linear-to-r from-cyan-400 to-emerald-400"
                style={{ width: `${Math.min(100, Math.max(0, tauxBancarisation))}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Filtrer :</span>
        {(
          [
            ["", "Tous"],
            ["NON_BANCARISE", "Non bancarisés"],
            ["EN_COURS", "En cours"],
            ["BANCARISE", "Bancarisés"],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val || "all"}
            type="button"
            onClick={() => {
              setPage(1);
              setFilter(val);
            }}
            className={`rounded-xl border px-3 py-1.5 text-xs transition ${
              filter === val
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {toast ? (
        <div
          className={`rounded px-3 py-2 text-sm ${
            toast.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Compteurs par agence et produit</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-3">Agence</th>
                <th className="pb-2 pr-3">Produit</th>
                <th className="pb-2 pr-3">NON_BANCARISÉ</th>
                <th className="pb-2 pr-3">EN_COURS</th>
                <th className="pb-2">BANCARISÉ</th>
              </tr>
            </thead>
            <tbody>
              {counters.slice(0, 120).map((c, i) => (
                <tr
                  key={`${c.agenceId ?? "na"}-${c.produitCode}-${i}`}
                  className="border-b border-slate-100 transition hover:bg-slate-50"
                >
                  <td className="py-1.5 pr-3 text-slate-700">{c.agenceLabel}</td>
                  <td className="py-1.5 pr-3 font-mono text-cyan-300">{c.produitCode}</td>
                  <td className="py-1.5 pr-3 font-semibold text-rose-700">{c.NON_BANCARISE}</td>
                  <td className="py-1.5 pr-3 font-semibold text-amber-700">{c.EN_COURS}</td>
                  <td className="py-1.5 font-semibold text-emerald-700">{c.BANCARISE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Validation et transfert (Chef(fe) de service)</h3>
          <div className="flex flex-wrap gap-2">
            {(["SOUMIS", "VALIDE", "REJETE"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setRequestTab(s)}
                className={`rounded-xl border px-2.5 py-1 text-xs transition ${
                  requestTab === s
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {s} ({requestCounters[s]})
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Concessionnaire</th>
                <th className="pb-2 pr-3">Demande</th>
                <th className="pb-2 pr-3">Justificatif</th>
                <th className="pb-2 pr-3">Commentaire</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                  <td className="py-1.5 pr-3">{new Date(r.createdAt).toLocaleString("fr-FR")}</td>
                  <td className="py-1.5 pr-3 font-mono">{r.concessionnaireId.slice(0, 8)}…</td>
                  <td className="py-1.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statutBancBadge(r.statutActuel)}`}>
                      {r.statutActuel}
                    </span>
                    <span className="px-2 text-slate-500">→</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statutBancBadge(r.nouveauStatut)}`}>
                      {r.nouveauStatut}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <a
                      href={r.justificatif.url}
                      target="_blank"
                      className="text-sky-400 hover:underline"
                    >
                      {r.justificatif.filename || "Ouvrir"}
                    </a>
                  </td>
                  <td className="py-1.5 pr-3 text-slate-400">{r.validationComment || "—"}</td>
                  <td className="py-1.5">
                    {userRole === "CHEF_SERVICE" && r.status === "SOUMIS" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDecision("VALIDER");
                            setDecisionComment("");
                            setDecisionAck(false);
                            setDecisionTarget(r);
                          }}
                          className="rounded-xl bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500"
                        >
                          Valider
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDecision("REJETER");
                            setDecisionComment("");
                            setDecisionAck(false);
                            setDecisionTarget(r);
                          }}
                          className="rounded-xl bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-500"
                        >
                          Rejeter
                        </button>
                      </div>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${requestStatusBadge(r.status)}`}>
                        {r.status === "SOUMIS" ? "Réservé Chef(fe) de service" : r.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!requests.length ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={6}>
                    Aucune demande.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            {total} point(s) de vente · page {page}/{totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-40"
            >
              Préc.
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-40"
            >
              Suiv.
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-3">PDV</th>
                  <th className="pb-2 pr-3">Nom</th>
                  <th className="pb-2 pr-3">Statut bancaire</th>
                  <th className="pb-2 pr-3">Agence</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">{row.codePdv}</td>
                    <td className="py-2 pr-3 text-slate-900">{row.nomComplet}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${statutBancBadge(row.statutBancarisation)}`}>
                        {row.statutBancarisation}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{refsAgences.find((a) => a.id === row.agenceId)?.code ?? "—"}</td>
                    <td className="py-2">
                      <Link href={`/concessionnaires?focus=${encodeURIComponent(row.id)}`} className="text-xs text-sky-600 hover:underline">
                        Fiche PDV
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-600">
        La mise à jour de la fiche concessionnaire est automatique après validation Chef(fe) de service. Vous pouvez aussi ouvrir la fiche depuis{" "}
        <Link href="/concessionnaires" className="text-sky-600 hover:underline">
          Concessionnaires
        </Link>
        .
      </p>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setCreateOpen(false)} />
          <form
            onSubmit={onSubmit}
            className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Nouvelle demande de bancarisation</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                Fermer
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-600">Concessionnaire</label>
                <select
                  value={concessionnaireId}
                  onChange={(e) => setConcessionnaireId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                >
                  <option value="">Choisir…</option>
                  {items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codePdv} - {c.nomComplet}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Nouveau statut</label>
                <select
                  value={nouveauStatut}
                  onChange={(e) => setNouveauStatut(e.target.value as Banc)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                >
                  <option value="EN_COURS">EN_COURS</option>
                  <option value="BANCARISE">BANCARISE</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Numéro de compte bancaire</label>
                <input
                  value={compteBancaire}
                  onChange={(e) => setCompteBancaire(e.target.value)}
                  required={nouveauStatut === "BANCARISE"}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">
                  Banque / établissement financier
                </label>
                <input
                  value={banqueEtablissement}
                  onChange={(e) => setBanqueEtablissement(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Date d&apos;effet</label>
                <input
                  type="date"
                  value={dateEffet}
                  onChange={(e) => setDateEffet(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Produit (optionnel)</label>
                <select
                  value={produitCode}
                  onChange={(e) => setProduitCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                >
                  <option value="">Tous / non précisé</option>
                  {refsProduits
                    .filter((p) => p.actif)
                    .map((p) => (
                      <option key={p.id} value={p.code}>
                        {p.code} - {p.libelle}
                      </option>
                    ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-600">Document justificatif</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-linear-to-r from-amber-600 to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
              >
                {submitting ? "Envoi..." : "Soumettre"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {decisionTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => (validating ? null : setDecisionTarget(null))} />
          <div className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Confirmation de décision</h3>
            <p className="mt-1 text-xs text-slate-600">
              Demande: {decisionTarget.statutActuel} → {decisionTarget.nouveauStatut}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setDecision("VALIDER")}
                className={`rounded-xl px-3 py-1 text-xs transition ${
                  decision === "VALIDER"
                    ? "bg-emerald-700 text-white"
                    : "border border-emerald-700 text-emerald-400"
                }`}
              >
                Valider
              </button>
              <button
                type="button"
                onClick={() => setDecision("REJETER")}
                className={`rounded-xl px-3 py-1 text-xs transition ${
                  decision === "REJETER"
                    ? "bg-rose-700 text-white"
                    : "border border-rose-700 text-rose-400"
                }`}
              >
                Rejeter
              </button>
            </div>
            <label className="mt-3 block text-xs text-slate-600">Commentaire (optionnel)</label>
            <textarea
              rows={3}
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
              placeholder="Motif / précision"
            />
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={decisionAck}
                onChange={(e) => setDecisionAck(e.target.checked)}
              />
              <span>Je confirme la décision de validation/rejet de cette demande.</span>
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={validating}
                onClick={() => setDecisionTarget(null)}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!decisionAck || validating}
                onClick={() => void decideRequest(decisionTarget.id, decision)}
                className="rounded-xl bg-linear-to-r from-amber-600 to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
              >
                {validating ? "Traitement..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
