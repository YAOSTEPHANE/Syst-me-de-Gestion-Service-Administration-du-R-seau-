"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CAUTION_PAYMENT_MODES, type CautionStatus } from "@/lib/lonaci/constants";
import { captureByAliases, extractPdfText, normalizeDateToIso, normalizeNumericString } from "@/lib/lonaci/pdf-import";

type CautionPaymentMode = (typeof CAUTION_PAYMENT_MODES)[number];

interface AlertItem {
  id: string;
  contratId: string;
  montant: number;
  dueDate: string;
  daysOverdue: number;
}

interface ContratItem {
  id: string;
  reference: string;
  status: "ACTIF" | "RESILIE";
}

interface CautionCounters {
  overdueJ10: number;
  enAttente: number;
  validatedThisMonth: number;
}

type CautionListTab = "J10_OVERDUE" | "EN_ATTENTE" | "VALIDATED_THIS_MONTH";

interface CautionListItem {
  id: string;
  contratId: string;
  montant: number;
  modeReglement: (typeof CAUTION_PAYMENT_MODES)[number];
  status: CautionStatus;
  paymentReference: string;
  observations: string | null;
  dueDate: string;
  paidAt: string | null;
  daysOverdue: number;
  immutableAfterFinal: boolean;
  pdvCode: string;
  depotAt: string | null;
}

type FinalizeModalTarget =
  | { mode: "row"; row: CautionListItem }
  | { mode: "id"; id: string };

type CautionDecision = "APPROUVER" | "REJETER" | "RETOURNER_POUR_CORRECTION";

const CAUTION_COLOR_TOKENS = {
  risk: {
    card: "rounded-xl border border-rose-100 bg-linear-to-br from-rose-50 to-white p-3",
    title: "text-[11px] uppercase tracking-wide text-rose-700",
    value: "text-rose-900",
    badge: "bg-rose-50 text-rose-900",
    action: "rounded-lg bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50",
  },
  pending: {
    card: "rounded-xl border border-amber-100 bg-linear-to-br from-amber-50 to-white p-3",
    title: "text-[11px] uppercase tracking-wide text-amber-700",
    value: "text-amber-900",
    badge: "bg-amber-50 text-amber-900",
  },
  validated: {
    card: "rounded-xl border border-emerald-100 bg-linear-to-br from-emerald-50 to-white p-3",
    title: "text-[11px] uppercase tracking-wide text-emerald-700",
    value: "text-emerald-900",
    badge: "bg-emerald-50 text-emerald-900",
    action: "rounded-lg bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50",
  },
} as const;

function labelTab(tab: CautionListTab): string {
  switch (tab) {
    case "J10_OVERDUE":
      return "Dépassées J+10";
    case "EN_ATTENTE":
      return "En attente";
    case "VALIDATED_THIS_MONTH":
      return "Validées ce mois";
    default:
      return "Cautions";
  }
}

function labelModeReglement(m: CautionPaymentMode): string {
  switch (m) {
    case "ESPECES":
      return "ESPÈCES";
    case "VIREMENT":
      return "VIREMENT";
    case "MOBILE_MONEY":
      return "MOBILE MONEY";
    case "CHEQUE":
      return "CHÈQUE";
    default:
      return m;
  }
}

async function downloadCautionsExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = ["contratId", "montant", "modeReglement", "dueDate", "paymentReference", "observations"];
  const sample = {
    contratId: "ID_CONTRAT",
    montant: 250000,
    modeReglement: "VIREMENT",
    dueDate: new Date().toISOString(),
    paymentReference: "TX-123456",
    observations: "Exemple import caution",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "cautions");
  XLSX.writeFile(wb, "modele-cautions.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    contratId: (raw.contratId as string | null) ?? null,
    montant: raw.montant ?? null,
    modeReglement: (raw.modeReglement as string | null) ?? null,
    dueDate: (raw.dueDate as string | null) ?? null,
    paymentReference: (raw.paymentReference as string | null) ?? null,
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
    const montant = normalizeNumericString(
      captureByAliases(source, ["montant", "somme", "amount"], "[0-9]+(?:[.,][0-9]+)?"),
    );
    const dueDate = normalizeDateToIso(
      captureByAliases(source, ["date paiement", "due date", "date"], "[0-9/\\- :tTzZ.+]{8,40}"),
    );
    const row = sanitize({
      contratId: captureByAliases(source, ["contrat id", "id contrat"], "[a-z0-9]{8,}"),
      montant: montant ?? 0,
      modeReglement:
        captureByAliases(source, ["mode reglement", "mode paiement", "reglement"], "(especes|virement|mobile[_ ]money|cheque)")
          ?.toUpperCase()
          .replace(" ", "_") ?? "VIREMENT",
      dueDate,
      paymentReference: captureByAliases(
        source,
        ["reference paiement", "payment reference", "reference", "ref paiement"],
        "[a-z0-9\\-_/]{3,80}",
      ),
      observations: captureByAliases(source, ["observations", "commentaires", "commentaire"], "[^|;]{1,300}"),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporte. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

async function fetchAlerts(): Promise<AlertItem[]> {
  const response = await fetch("/api/cautions/alerts", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les alertes cautions");
  }
  const data = (await response.json()) as { items: AlertItem[] };
  return data.items;
}

async function fetchContratsActifs(): Promise<ContratItem[]> {
  const response = await fetch("/api/contrats?page=1&pageSize=50", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les contrats");
  }
  const data = (await response.json()) as { items: ContratItem[] };
  return data.items.filter((c) => c.status === "ACTIF");
}

async function fetchCautionsList(input: { tab: CautionListTab; pageSize: number }): Promise<CautionListItem[]> {
  const params = new URLSearchParams({
    page: "1",
    pageSize: String(input.pageSize),
    tab: input.tab,
  });
  const response = await fetch(`/api/cautions?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Impossible de charger la liste des cautions");
  }
  const data = (await response.json()) as { items: CautionListItem[] };
  return data.items;
}

async function fetchCautionCounters(): Promise<CautionCounters> {
  const response = await fetch("/api/cautions/stats", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les statistiques cautions");
  }
  const data = (await response.json()) as { counters: CautionCounters };
  return data.counters;
}

export default function CautionsPanel() {
  const searchParams = useSearchParams();
  const contratPrefill = searchParams.get("contratId") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Réutilise l'état d'erreur global pour éviter un crash runtime si le chargement des contrats échoue.
  const contractsError = error;
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [contrats, setContrats] = useState<ContratItem[]>([]);
  const [counters, setCounters] = useState<CautionCounters | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [tab, setTab] = useState<CautionListTab>("EN_ATTENTE");
  const [items, setItems] = useState<CautionListItem[]>([]);

  const pageSize = 50;

  const [contratId, setContratId] = useState(contratPrefill);
  const [contratQuickPick, setContratQuickPick] = useState("");
  const [montant, setMontant] = useState("");
  const [modeReglement, setModeReglement] = useState<CautionPaymentMode>("VIREMENT");
  const [dueDateLocal, setDueDateLocal] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [observations, setObservations] = useState("");
  const [creating, setCreating] = useState(false);

  const [manualCautionId, setManualCautionId] = useState("");
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [finalizeModal, setFinalizeModal] = useState<FinalizeModalTarget | null>(null);
  const [finalizeAck, setFinalizeAck] = useState(false);
  const [finalizeDecision, setFinalizeDecision] = useState<CautionDecision>("APPROUVER");
  const [finalizeComment, setFinalizeComment] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (contratPrefill) {
      setContratId(contratPrefill);
      setContratQuickPick(contratPrefill);
      setCreateOpen(true);
    }
  }, [contratPrefill]);

  useEffect(() => {
    if (!createOpen) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const d = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    setDueDateLocal(`${y}-${m}-${d}T${hh}:${mm}`);
    setPaymentReference("");
    setObservations("");
    setMontant("");
    setModeReglement("VIREMENT");
    if (!contratPrefill) {
      setContratId("");
      setContratQuickPick("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  const load = useCallback(async (nextTab?: CautionListTab) => {
    setLoading(true);
    setError(null);
    try {
      const tabEff = nextTab ?? tab;
      const [c, list, a] = await Promise.all([
        fetchContratsActifs(),
        fetchCautionsList({ tab: tabEff, pageSize }),
        fetchAlerts().catch(() => []),
      ]);
      setContrats(c);
      setItems(list);
      setAlerts(a);
      // Déclenche aussi le rechargement des compteurs.
      // (On ne casse pas l'affichage si les stats échouent.)

      // Les compteurs sont indépendants de la table; on ne casse pas l'affichage si le backend est indisponible.
      try {
        const s = await fetchCautionCounters();
        setCounters(s);
      } catch {
        setCounters(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }, [pageSize, tab]);

  useEffect(() => {
    const onDataImported = () => {
      void load();
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    void load();
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
  }, [load]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contratId.trim()) {
      setToast({ type: "error", message: "Indiquez un contrat." });
      return;
    }
    if (!paymentReference.trim()) {
      setToast({ type: "error", message: "Indiquez la référence du paiement." });
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const due = new Date(dueDateLocal);
      if (Number.isNaN(due.getTime())) {
        throw new Error("Date d'échéance invalide");
      }
      const response = await fetch("/api/cautions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contratId,
          montant: Number(montant),
          modeReglement,
          dueDate: due.toISOString(),
          paymentReference: paymentReference.trim(),
          observations: observations.trim() ? observations.trim() : null,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Création caution impossible");
      }
      setCreateOpen(false);
      setMontant("");
      setDueDateLocal("");
      setPaymentReference("");
      setObservations("");
      if (!contratPrefill) {
        setContratId("");
        setContratQuickPick("");
      }
      await load();
      setToast({ type: "success", message: "Caution créée." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setCreating(false);
    }
  }

  async function onImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const source = e.target.files?.[0];
    if (!source) return;
    setImportingFile(true);
    setError(null);
    try {
      const file = await normalizeImportFileForApi(source);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("collection", "cautions");
      fd.set("mode", "upsert");
      fd.set("upsertBy", "contratId");
      const res = await fetch("/api/import-data", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { message?: string; upserted?: number; modified?: number }
        | null;
      if (!res.ok) throw new Error(data?.message ?? "Import impossible");
      await load(tab);
      window.dispatchEvent(new Event("lonaci:data-imported"));
      setToast({
        type: "success",
        message: `Import cautions terminé: ${data?.upserted ?? 0} créée(s), ${data?.modified ?? 0} mise(s) à jour.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import impossible";
      setToast({ type: "error", message });
    } finally {
      setImportingFile(false);
      e.target.value = "";
    }
  }

  function closeFinalizeModal() {
    setFinalizeModal(null);
    setFinalizeAck(false);
    setFinalizeDecision("APPROUVER");
    setFinalizeComment("");
  }

  async function executeDecision(cautionId: string, decision: CautionDecision, comment?: string) {
    setFinalizingId(cautionId);
    setError(null);
    try {
      const response = await fetch(`/api/cautions/${encodeURIComponent(cautionId)}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Finalisation impossible");
      }
      closeFinalizeModal();
      setManualCautionId("");
      await load();
      setToast({
        type: "success",
        message:
          decision === "APPROUVER"
            ? "Caution approuvée (payée)."
            : decision === "REJETER"
              ? "Caution rejetée."
              : "Caution retournée pour correction.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setFinalizingId(null);
    }
  }

  async function confirmFinalizeFromModal() {
    if (!finalizeModal || !finalizeAck) return;
    const id = finalizeModal.mode === "row" ? finalizeModal.row.id : finalizeModal.id.trim();
    if (!id) return;
    const needsComment = finalizeDecision !== "APPROUVER";
    const comment = finalizeComment.trim();
    if (needsComment && !comment) return;
    await executeDecision(id, finalizeDecision, comment || undefined);
  }

  function closeCreate() {
    setCreateOpen(false);
    setError(null);
    setToast(null);

    // Reset des champs de saisie (sauf préremplissage depuis l'URL).
    setMontant("");
    setDueDateLocal("");
    setPaymentReference("");
    setObservations("");
    setModeReglement("VIREMENT");

    if (!contratPrefill) {
      setContratId("");
      setContratQuickPick("");
    }
  }

  const cautionAnalytics = useMemo(() => {
    const totalKnown =
      (counters?.overdueJ10 ?? 0) + (counters?.enAttente ?? 0) + (counters?.validatedThisMonth ?? 0);
    const modeCounts = items.reduce<Record<string, number>>((acc, row) => {
      const key = labelModeReglement(row.modeReglement);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const modeEntries = Object.entries(modeCounts)
      .map(([mode, count]) => ({ mode, count }))
      .sort((a, b) => b.count - a.count);
    const topOverdue = [...alerts].sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 5);
    const overdueTrend = [...alerts]
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 8)
      .map((a) => a.daysOverdue)
      .reverse();
    const maxTrend = overdueTrend.length ? Math.max(...overdueTrend) : 0;
    const sparkline = overdueTrend
      .map((value, index) => {
        const x = overdueTrend.length === 1 ? 0 : (index / (overdueTrend.length - 1)) * 100;
        const y = maxTrend <= 0 ? 50 : 100 - (value / maxTrend) * 100;
        return `${x},${y}`;
      })
      .join(" ");
    const pending = (counters?.overdueJ10 ?? 0) + (counters?.enAttente ?? 0);
    const validated = counters?.validatedThisMonth ?? 0;
    return {
      totalKnown,
      pending,
      validated,
      validationRate: totalKnown > 0 ? Math.round((validated / totalKnown) * 100) : 0,
      riskRate: totalKnown > 0 ? Math.round(((counters?.overdueJ10 ?? 0) / totalKnown) * 100) : 0,
      modeEntries,
      topOverdue,
      sparkline,
    };
  }, [alerts, counters, items]);

  return (
    <section className="space-y-5 rounded-2xl bg-white/80 p-6">
      <header className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-r from-slate-900 via-slate-800 to-amber-900 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-amber-300/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-24 h-44 w-44 rounded-full bg-orange-300/20 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">
              Référentiel
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Cautions</h2>
            <p className="mt-1 text-sm text-amber-100/90">
              Suivi des encaissements, contrôles d’échéance et décisions de validation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Actualiser
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl border border-amber-300 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-amber-200 hover:bg-amber-400 disabled:opacity-60"
            >
              Nouvelle caution
            </button>
          </div>
        </div>
      </header>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nouvelle-caution-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60"
            aria-label="Fermer"
            onClick={() => closeCreate()}
          />
          <div className="relative z-10 flex max-h-[78vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="relative flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-4 py-3">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-200/40 blur-2xl" />
              <div>
                <p className="mb-1 inline-flex rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                  Gestion des cautions
                </p>
                <h3 id="nouvelle-caution-title" className="text-lg font-semibold text-slate-900">
                  Nouvelle caution
                </h3>
                <p className="mt-1 text-xs leading-4 text-slate-600">
                  Sélection du contrat, date et référence paiement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeCreate()}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 via-white to-white px-4 py-3">
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                  1. Contrat
                </span>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800">
                  2. Paiement
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  3. Validation
                </span>
              </div>

              {contratPrefill ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] leading-4 text-amber-800">
                  Contrat prérempli depuis l’URL.{" "}
                  <Link href="/cautions" className="font-medium text-amber-700 underline hover:text-amber-900">
                    Retirer
                  </Link>
                </div>
              ) : null}

              <form onSubmit={onCreate} className="grid gap-2.5">
                <section className="rounded-xl border border-amber-200/80 bg-white p-3 shadow-sm">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                    Contrat de rattachement
                  </p>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Contrat (actifs)</label>
                  {contractsError ? (
                    <div className="mb-2 rounded border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700">
                      Impossible de charger la liste des contrats.
                      <span className="font-mono">{contractsError}</span>
                      <button
                        type="button"
                        onClick={() => void load()}
                        className="ml-2 underline hover:text-rose-900"
                      >
                        Réessayer
                      </button>
                    </div>
                  ) : null}
                  <select
                    aria-label="Choisir un contrat actif"
                    value={contratQuickPick}
                    onChange={(e) => {
                      const v = e.target.value;
                      setContratQuickPick(v);
                      setContratId(v);
                    }}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">— Choisir un contrat —</option>
                    {contrats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.reference} · {c.id.slice(0, 8)}…
                      </option>
                    ))}
                  </select>
                </section>

                <section className="rounded-xl border border-indigo-200/80 bg-white p-3 shadow-sm">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
                    Détails du paiement
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="caution-montant" className="mb-1 block text-xs font-medium text-slate-700">
                        Montant
                      </label>
                      <input
                        id="caution-montant"
                        required
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={montant}
                        onChange={(e) => setMontant(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Mode règlement</label>
                      <select
                        aria-label="Mode de règlement"
                        value={modeReglement}
                        onChange={(e) => setModeReglement(e.target.value as CautionPaymentMode)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        {CAUTION_PAYMENT_MODES.map((m) => (
                          <option key={m} value={m}>
                            {labelModeReglement(m)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Date du paiement</label>
                      <input
                        aria-label="Date et heure du paiement"
                        required
                        type="datetime-local"
                        value={dueDateLocal}
                        onChange={(e) => setDueDateLocal(e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Référence du paiement</label>
                      <input
                        required
                        aria-label="Référence du paiement"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Ex: TX-123456 / CHQ-0001"
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Observations</p>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Zone observations</label>
                  <textarea
                    aria-label="Observations"
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Notes internes / détails utiles (optionnel)"
                    rows={2}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400"
                  />
                </section>

                <div className="flex flex-wrap justify-end gap-2">
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
                    onClick={() => void downloadCautionsExcelTemplate()}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Télécharger le modèle Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => closeCreate()}
                    disabled={creating}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-lg border border-amber-500 bg-amber-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-amber-600 hover:bg-amber-600 disabled:opacity-60"
                  >
                    {creating ? "Création..." : "Créer caution"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Analytics cautions</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Vue moderne des risques, du pipeline de validation et des modes de règlement.
          </p>
        </div>

        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={CAUTION_COLOR_TOKENS.risk.card}>
            <div className={CAUTION_COLOR_TOKENS.risk.title}>Risque J+10</div>
            <div className={`mt-1 text-2xl font-semibold ${CAUTION_COLOR_TOKENS.risk.value}`}>{counters?.overdueJ10 ?? "—"}</div>
            <div className="text-[11px] text-slate-600">{cautionAnalytics.riskRate}% du portefeuille caution</div>
          </div>
          <div className={CAUTION_COLOR_TOKENS.pending.card}>
            <div className={CAUTION_COLOR_TOKENS.pending.title}>Pipeline en cours</div>
            <div className={`mt-1 text-2xl font-semibold ${CAUTION_COLOR_TOKENS.pending.value}`}>{cautionAnalytics.pending}</div>
            <div className="text-[11px] text-slate-600">En attente + retards</div>
          </div>
          <div className={CAUTION_COLOR_TOKENS.validated.card}>
            <div className={CAUTION_COLOR_TOKENS.validated.title}>Validées ce mois</div>
            <div className={`mt-1 text-2xl font-semibold ${CAUTION_COLOR_TOKENS.validated.value}`}>{counters?.validatedThisMonth ?? "—"}</div>
            <div className="text-[11px] text-slate-600">Taux de validation: {cautionAnalytics.validationRate}%</div>
          </div>
          <div className="rounded-xl border border-cyan-100 bg-linear-to-br from-cyan-50 to-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-cyan-700">Volume suivi</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{cautionAnalytics.totalKnown}</div>
            <div className="text-[11px] text-slate-600">Total des 3 indicateurs</div>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 p-3 lg:col-span-5">
            <div className="text-xs font-semibold text-slate-900">Répartition modes de règlement</div>
            <div className="mt-2 space-y-2">
              {cautionAnalytics.modeEntries.length ? (
                cautionAnalytics.modeEntries.map((entry) => {
                  const pct = items.length > 0 ? Math.round((entry.count / items.length) * 100) : 0;
                  return (
                    <div key={entry.mode}>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                        <span>{entry.mode}</span>
                        <span>
                          {entry.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <progress
                          className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:bg-cyan-500"
                          max={100}
                          value={pct}
                          aria-label={`Part ${entry.mode}`}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-500">Aucune donnée sur l’onglet courant.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 lg:col-span-4">
            <div className="text-xs font-semibold text-slate-900">Tendance des retards critiques</div>
            <div className="mt-1 text-[11px] text-slate-600">Top alertes J+10 (évolution jours de retard)</div>
            <div className="mt-3 h-24 rounded-lg bg-slate-50 p-2">
              {cautionAnalytics.sparkline ? (
                <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    stroke="#e11d48"
                    strokeWidth="2.5"
                    points={cautionAnalytics.sparkline}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <p className="text-xs text-slate-500">Pas d’alerte disponible.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 lg:col-span-3">
            <div className="text-xs font-semibold text-slate-900">Top retards</div>
            <div className="mt-2 space-y-2">
              {cautionAnalytics.topOverdue.length ? (
                cautionAnalytics.topOverdue.map((a) => (
                  <div key={a.id} className="rounded-md bg-rose-50/70 px-2 py-1.5 text-[11px]">
                    <div className="font-mono text-slate-800">{a.contratId}</div>
                    <div className="text-rose-800">{a.daysOverdue} jours de retard</div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">Aucune alerte critique.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            setTab("J10_OVERDUE");
            void load("J10_OVERDUE");
          }}
          className={`rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition ${
            tab === "J10_OVERDUE" ? "ring-2 ring-rose-200" : "hover:bg-white"
          }`}
        >
          <div className="text-xs font-medium text-rose-700">Dépassées J+10</div>
          <div className="mt-1 flex items-center justify-center text-3xl font-semibold text-rose-900">
            {counters?.overdueJ10 ?? "—"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab("EN_ATTENTE");
            void load("EN_ATTENTE");
          }}
          className={`rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition ${
            tab === "EN_ATTENTE" ? "ring-2 ring-amber-200" : "hover:bg-white"
          }`}
        >
          <div className="text-xs font-medium text-amber-700">En attente</div>
          <div className="mt-1 flex items-center justify-center text-3xl font-semibold text-amber-900">
            {counters?.enAttente ?? "—"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab("VALIDATED_THIS_MONTH");
            void load("VALIDATED_THIS_MONTH");
          }}
          className={`rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition ${
            tab === "VALIDATED_THIS_MONTH" ? "ring-2 ring-emerald-200" : "hover:bg-white"
          }`}
        >
          <div className="text-xs font-medium text-emerald-700">Validées ce mois</div>
          <div className="mt-1 flex items-center justify-center text-3xl font-semibold text-emerald-900">
            {counters?.validatedThisMonth ?? "—"}
          </div>
        </button>
      </div>

      <h3 className="text-sm font-semibold text-amber-800">{labelTab(tab)}</h3>
      {loading ? <p className="text-sm text-slate-600">Chargement...</p> : null}
      {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
      {toast ? (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            toast.type === "success"
              ? "bg-emerald-50/80 text-emerald-800"
              : "bg-rose-50/80 text-rose-800"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} className="text-xs opacity-80 hover:opacity-100">
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-2 font-medium" scope="col">
                  Réf.
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Contrat
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  PDV
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Montant (FCFA)
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Dépôt
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Délai
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Statut
                </th>
                <th className="px-2 py-2 text-right font-medium" scope="col">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="text-slate-900">
              {items.map((row) => {
                const statutLabel =
                  tab === "J10_OVERDUE" ? "Dépassée" : tab === "EN_ATTENTE" ? "En attente" : "Validée ce mois";
                return (
                  <tr key={row.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                    <td className="px-2 py-2 font-mono whitespace-nowrap">
                      {row.paymentReference || "—"}
                    </td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{row.contratId || "—"}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{row.pdvCode || "—"}</td>
                    <td className="px-2 py-2">{row.montant?.toLocaleString("fr-FR") ?? row.montant}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {row.depotAt ? new Date(row.depotAt).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-2 py-2">{row.daysOverdue}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          tab === "J10_OVERDUE"
                            ? CAUTION_COLOR_TOKENS.risk.badge
                            : tab === "EN_ATTENTE"
                              ? CAUTION_COLOR_TOKENS.pending.badge
                              : CAUTION_COLOR_TOKENS.validated.badge
                        }`}
                      >
                        {statutLabel}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {(row.status === "EN_ATTENTE" || row.status === "A_CORRIGER") &&
                      tab !== "VALIDATED_THIS_MONTH" ? (
                        <button
                          type="button"
                          disabled={row.immutableAfterFinal || finalizingId === row.id}
                          onClick={() => {
                            setFinalizeAck(false);
                            setFinalizeDecision("APPROUVER");
                            setFinalizeComment("");
                            setFinalizeModal({ mode: "row", row });
                          }}
                          className={tab === "J10_OVERDUE" ? CAUTION_COLOR_TOKENS.risk.action : CAUTION_COLOR_TOKENS.validated.action}
                        >
                          {tab === "J10_OVERDUE" ? "Traitement d'urgence" : "VALIDÉ"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!items.length ? (
                <tr>
                  <td className="px-2 py-6 text-center text-slate-500" colSpan={8}>
                    Aucune caution pour ce filtre.
                  </td>
                </tr>
              ) : null}
            </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Finaliser par ID (hors liste)</h3>
        <p className="mb-3 text-xs text-slate-600">
          Rôle requis : Chef(fe) de service. Double confirmation avant envoi.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={manualCautionId}
            onChange={(e) => setManualCautionId(e.target.value)}
            placeholder="ID caution (hex)"
            className="min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <button
            type="button"
            disabled={!manualCautionId.trim() || finalizingId !== null}
            onClick={() => {
              setFinalizeAck(false);
              setFinalizeDecision("APPROUVER");
              setFinalizeComment("");
              setFinalizeModal({ mode: "id", id: manualCautionId.trim() });
            }}
            className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:border-emerald-700 hover:bg-emerald-700 disabled:opacity-50"
          >
            Finaliser payée
          </button>
        </div>
      </div>

      {finalizeModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finalize-caution-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60"
            aria-label="Fermer"
            disabled={finalizingId !== null}
            onClick={() => (finalizingId ? null : closeFinalizeModal())}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 id="finalize-caution-title" className="text-lg font-semibold text-slate-900">
                  Validation finale
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Décision de validation : approuver, rejeter, ou retourner pour correction. Réservé au rôle{" "}
                  <span className="text-[11px] font-semibold">Chef(fe) de service</span>.
                </p>
              </div>
              <button
                type="button"
                disabled={finalizingId !== null}
                onClick={closeFinalizeModal}
                className="rounded px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <strong>Approuver</strong> ou <strong>Rejeter</strong> rend la caution immuable.{" "}
              <strong>Retourner pour correction</strong> garde la caution modifiable.
            </div>

            <div className="mt-4 grid gap-2">
              <p className="text-xs font-semibold text-slate-700">Décision</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={finalizingId !== null}
                  onClick={() => setFinalizeDecision("APPROUVER")}
                  className={
                    finalizeDecision === "APPROUVER"
                      ? "rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                  }
                >
                  Approuver
                </button>
                <button
                  type="button"
                  disabled={finalizingId !== null}
                  onClick={() => setFinalizeDecision("REJETER")}
                  className={
                    finalizeDecision === "REJETER"
                      ? "rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  }
                >
                  Rejeter
                </button>
                <button
                  type="button"
                  disabled={finalizingId !== null}
                  onClick={() => setFinalizeDecision("RETOURNER_POUR_CORRECTION")}
                  className={
                    finalizeDecision === "RETOURNER_POUR_CORRECTION"
                      ? "rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                  }
                >
                  Retourner pour correction
                </button>
              </div>
            </div>

            {finalizeModal.mode === "row" ? (
              <dl className="mt-4 grid gap-2 text-sm text-slate-800">
                <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                  <dt className="text-slate-500">Réf. paiement</dt>
                  <dd className="font-mono text-xs">{finalizeModal.row.paymentReference || "—"}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                  <dt className="text-slate-500">Contrat</dt>
                  <dd className="font-mono text-xs">{finalizeModal.row.contratId}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                  <dt className="text-slate-500">PDV</dt>
                  <dd className="font-mono text-xs">{finalizeModal.row.pdvCode || "—"}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                  <dt className="text-slate-500">Montant</dt>
                  <dd className="font-semibold tabular-nums">
                    {finalizeModal.row.montant?.toLocaleString("fr-FR") ?? finalizeModal.row.montant} FCFA
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                  <dt className="text-slate-500">Mode de règlement</dt>
                  <dd>{labelModeReglement(finalizeModal.row.modeReglement)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                  <dt className="text-slate-500">Échéance</dt>
                  <dd>{new Date(finalizeModal.row.dueDate).toLocaleString("fr-FR")}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                  <dt className="text-slate-500">Dépôt</dt>
                  <dd>
                    {finalizeModal.row.depotAt
                      ? new Date(finalizeModal.row.depotAt).toLocaleDateString("fr-FR")
                      : "—"}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                  <dt className="text-slate-500">Délai (j.)</dt>
                  <dd className="tabular-nums">{finalizeModal.row.daysOverdue}</dd>
                </div>
                <div className="py-1.5">
                  <dt className="text-slate-500">Observations</dt>
                  <dd className="mt-1 text-xs text-slate-700">
                    {finalizeModal.row.observations?.trim() ? finalizeModal.row.observations : "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-600">Identifiant caution (saisie manuelle)</p>
                <p className="mt-1 font-mono text-sm text-slate-900">{finalizeModal.id}</p>
              </div>
            )}

            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Motif {finalizeDecision === "APPROUVER" ? "(optionnel)" : "(obligatoire)"}
              </label>
              <textarea
                value={finalizeComment}
                onChange={(e) => setFinalizeComment(e.target.value)}
                disabled={finalizingId !== null}
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder={
                  finalizeDecision === "APPROUVER"
                    ? "Optionnel"
                    : "Ex: référence de paiement incorrecte, pièce manquante, incohérence montant…"
                }
              />
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={finalizeAck}
                onChange={(e) => setFinalizeAck(e.target.checked)}
                disabled={finalizingId !== null}
                className="mt-0.5 rounded border-slate-300"
              />
              <span>
                J’ai contrôlé les informations ci-dessus et je confirme ma décision.
              </span>
            </label>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={finalizingId !== null}
                onClick={closeFinalizeModal}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={
                  !finalizeAck ||
                  finalizingId !== null ||
                  (finalizeDecision !== "APPROUVER" && !finalizeComment.trim())
                }
                onClick={() => void confirmFinalizeFromModal()}
                className="rounded-lg border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {finalizingId ? "Envoi…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
