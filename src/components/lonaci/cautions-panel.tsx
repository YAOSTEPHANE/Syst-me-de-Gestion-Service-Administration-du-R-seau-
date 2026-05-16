"use client";

import { useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { canRole } from "@/lib/auth/rbac";
import {
  CAUTION_ENCAISSEMENT_MODES,
  CAUTION_PAYMENT_MODES,
  LONACI_ROLES,
  type CautionEncaissementMode,
  type CautionStatus,
  type LonaciRole,
} from "@/lib/lonaci/constants";
import { captureByAliases, extractPdfText, normalizeDateToIso, normalizeNumericString } from "@/lib/lonaci/pdf-import";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { assertExcelImportAllowed, getImportAcceptAttribute } from "@/lib/spreadsheet/import-format-policy";
import { CautionEtatMensuelParProduitBlock } from "@/components/lonaci/caution-etat-mensuel-par-produit-block";
import {
  CautionFicheDefinitiveModal,
  type CautionFicheDefinitiveModalData,
} from "@/components/lonaci/caution-fiche-definitive-modal";
import { aggregateEtatMensuelLatestMonth } from "@/lib/lonaci/caution-etat-mensuel-display";
import type { CautionEtatMensuelProduitRow } from "@/lib/lonaci/sprint4";

type CautionPaymentMode = (typeof CAUTION_PAYMENT_MODES)[number];

interface AlertItem {
  id: string;
  contratId: string;
  montant: number;
  dueDate: string;
  daysOverdue: number;
}

/** Données affichées sur la fiche de paiement caution imprimable (caisse + saisie Lonaci). */
interface ProvisionalSlipData {
  numero: string;
  montantFCFA: number;
  dueDate: string;
  clientLabel: string;
  clientCode: string;
  lonaciClientId: string;
  produitCode: string;
  produitLibelle: string;
  cautionId: string;
  /** Référence interne enregistrée sur la caution (ex. PROVISOIRE:FPC-…), distincte de la référence de paiement caisse. */
  referenceInterneLonaci: string;
}

function cautionListItemFromProvisionalSlip(slip: ProvisionalSlipData): CautionListItem {
  return {
    id: slip.cautionId,
    contratId: "",
    lonaciClientId: slip.lonaciClientId,
    clientCode: slip.clientCode,
    concessionnaireNom: slip.clientLabel,
    produitCode: slip.produitCode === "—" ? "" : slip.produitCode,
    agenceLabel: "—",
    montant: slip.montantFCFA,
    modeReglement: "PAIEMENT_DIFFERE",
    status: "EN_ATTENTE",
    paymentReference: slip.referenceInterneLonaci,
    observations: null,
    dueDate: slip.dueDate,
    paidAt: null,
    daysOverdue: 0,
    immutableAfterFinal: false,
    pdvCode: slip.clientCode || "—",
    depotAt: null,
    ficheProvisoire: true,
    numeroFicheProvisoire: slip.numero,
    numeroFicheDefinitive: null,
    ficheDefinitiveEmiseLe: null,
  };
}

interface CautionCounters {
  overdueJ10: number;
  enAttente: number;
  validatedThisMonth: number;
}

type CautionListTab = "J10_OVERDUE" | "EN_ATTENTE" | "VALIDATED_THIS_MONTH";

function isCautionListTab(value: string): value is CautionListTab {
  return value === "J10_OVERDUE" || value === "EN_ATTENTE" || value === "VALIDATED_THIS_MONTH";
}

interface CautionListItem {
  id: string;
  contratId: string;
  lonaciClientId?: string | null;
  clientCode?: string | null;
  concessionnaireNom: string;
  produitCode: string;
  agenceLabel: string;
  montant: number;
  modeReglement: (typeof CAUTION_PAYMENT_MODES)[number];
  status: CautionStatus;
  /** Réf. encaissement ; en fiche provisoire la trace interne peut être au format PROVISOIRE: + N° FPC — l'affichage liste utilise cautionReferenceListeOuFiche. */
  paymentReference: string;
  observations: string | null;
  dueDate: string;
  paidAt: string | null;
  daysOverdue: number;
  immutableAfterFinal: boolean;
  pdvCode: string;
  depotAt: string | null;
  ficheProvisoire: boolean;
  numeroFicheProvisoire: string | null;
  numeroFicheDefinitive: string | null;
  ficheDefinitiveEmiseLe: string | null;
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
      return "Retardé";
    case "EN_ATTENTE":
      return "Attendu caution";
    case "VALIDATED_THIS_MONTH":
      return "Terminées";
    default:
      return "Cautions";
  }
}

function cautionStatutLabel(row: CautionListItem, tab: CautionListTab): string {
  if (tab === "VALIDATED_THIS_MONTH") return "Terminée";
  if (row.status === "VALIDE_N1") return "Validé N1";
  if (row.status === "VALIDE_N2") return "Validé N2";
  if (row.status === "A_CORRIGER") return "ì corriger";
  if (tab === "J10_OVERDUE") return "Retardé";
  return "En attente finalisation";
}

/** Référence comme sur la fiche provisoire (N° FPC indiqué à la caisse) ; hors fiche provisoire, référence d'encaissement. */
function cautionReferenceListeOuFiche(row: CautionListItem): string {
  if (row.ficheProvisoire) {
    const n = row.numeroFicheProvisoire?.trim();
    if (n) return n;
    const pr = (row.paymentReference ?? "").trim();
    const prefix = "PROVISOIRE:";
    if (pr.toUpperCase().startsWith(prefix)) {
      const rest = pr.slice(prefix.length).trim();
      if (rest) return rest;
    }
    return pr || "—";
  }
  return (row.paymentReference ?? "").trim() || "—";
}

/** Fiche définitive remise au porteur après validation du paiement ou finalisation payée. */
function buildCautionFicheModalData(
  row: CautionListItem,
  fiche: {
    numeroFicheDefinitive: string;
    emiseLe: string;
    datePaiement?: string;
    paymentReference?: string;
    modeReglement?: CautionEncaissementMode;
    emailSent?: boolean;
    emailSkippedReason?: string;
    destinataireEmail?: string | null;
  },
  apresValidationPaiement: boolean,
): CautionFicheDefinitiveModalData {
  const mode =
    fiche.modeReglement ??
    (CAUTION_ENCAISSEMENT_MODES.includes(row.modeReglement as CautionEncaissementMode)
      ? (row.modeReglement as CautionEncaissementMode)
      : "VIREMENT");
  return {
    cautionId: row.id,
    numeroFicheDefinitive: fiche.numeroFicheDefinitive,
    identiteLabel: row.contratId.trim() ? "Concessionnaire" : "Porteur / client",
    identiteDetail: row.concessionnaireNom,
    clientCode: row.clientCode ?? null,
    lonaciClientId: row.lonaciClientId ?? null,
    contratId: row.contratId.trim() || null,
    produitCode: row.produitCode,
    produitLibelle: null,
    agenceLabel: row.agenceLabel,
    montantFCFA: row.montant,
    modeLibelle: labelModeReglement(mode),
    paymentReference: fiche.paymentReference?.trim() || row.paymentReference,
    datePaiement: fiche.datePaiement ?? fiche.emiseLe,
    ancienneFicheProvisoire: row.numeroFicheProvisoire,
    apresValidationPaiement,
    emailSent: fiche.emailSent,
    emailSkippedReason: fiche.emailSkippedReason,
    destinataireEmail: fiche.destinataireEmail,
  };
}

/** Ligne affichée : seule, ou groupe (même client + même jour d'échéance, fiches provisoires). */
type CautionListDisplayRow =
  | { kind: "single"; row: CautionListItem }
  | { kind: "group"; key: string; rows: CautionListItem[] };

function cautionAttenduProvisoireGroupKey(row: CautionListItem): string {
  const day = row.dueDate ? row.dueDate.slice(0, 10) : "";
  const idPart = (
    row.lonaciClientId?.trim() ||
    row.clientCode?.trim() ||
    row.concessionnaireNom?.trim() ||
    "—"
  ).toUpperCase();
  return `${idPart}__${day}`;
}

function buildCautionListDisplayRows(items: CautionListItem[], tab: CautionListTab): CautionListDisplayRow[] {
  if (tab !== "EN_ATTENTE") {
    return items.map((row) => ({ kind: "single", row }));
  }
  const order: string[] = [];
  const buckets = new Map<string, CautionListItem[]>();
  for (const row of items) {
    const key = row.ficheProvisoire ? cautionAttenduProvisoireGroupKey(row) : `__solo__${row.id}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(row);
  }
  const out: CautionListDisplayRow[] = [];
  for (const key of order) {
    const rows = buckets.get(key)!;
    if (rows.length === 1) {
      out.push({ kind: "single", row: rows[0]! });
    } else {
      out.push({ kind: "group", key, rows });
    }
  }
  return out;
}

function labelModeReglement(m: CautionPaymentMode): string {
  switch (m) {
    case "ESPECES":
      return "ESP——CES";
    case "VIREMENT":
      return "VIREMENT";
    case "MOBILE_MONEY":
      return "MOBILE MONEY";
    case "CHEQUE":
      return "CH——QUE";
    case "PAIEMENT_DIFFERE":
      return "Paiement différé (fiche de paiement caution)";
    default:
      return m;
  }
}

function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    assertExcelImportAllowed("CAUTIONS");
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

type LonaciClientSearchHit = {
  id: string;
  code: string;
  nomComplet: string | null;
  raisonSociale: string;
  statut?: string;
};

type ReferentialProduitRow = { code: string; libelle: string; actif: boolean; prix?: number };

function formatClientHitLabel(hit: LonaciClientSearchHit): string {
  const name = hit.nomComplet?.trim() || hit.raisonSociale?.trim() || hit.id;
  const code = hit.code?.trim();
  return code ? `${name} · ${code}` : name;
}

async function fetchReferentialProduitsActifs(): Promise<ReferentialProduitRow[]> {
  const response = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
  if (!response.ok) {
    throw new Error("Impossible de charger le référentiel produits");
  }
  const data = (await response.json()) as { produits?: ReferentialProduitRow[] };
  return (data.produits ?? []).filter((p) => p.actif !== false);
}

async function fetchClientsSearch(q: string, signal?: AbortSignal): Promise<LonaciClientSearchHit[]> {
  const params = new URLSearchParams({ page: "1", pageSize: "20", q, statut: "ACTIF" });
  const response = await fetch(`/api/clients?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { items?: LonaciClientSearchHit[] };
  return Array.isArray(data.items) ? data.items : [];
}

/** Codes produits uniques en conservant l'ordre de sélection (coche la première occurrence). */
function uniqueOrderedProduitCodes(selected: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of selected) {
    const k = raw.trim().toUpperCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Impression : le navigateur imprime par défaut toute la page (liste Cautions comprise).
 * On masque tout le corps sauf la modale portant la classe `lonaci-print-surface`, et on compacte la fiche pour A4.
 */
const LONACI_PRINT_ISOLATION_CSS = `
@media print {
  @page { size: A4; margin: 5mm; }
  html, body {
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }
  body * {
    visibility: hidden;
  }
  .lonaci-print-surface,
  .lonaci-print-surface * {
    visibility: visible;
  }
  .lonaci-print-surface {
    position: fixed !important;
    inset: 0 !important;
    display: block !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 3mm 4mm !important;
    background: #fff !important;
    box-shadow: none !important;
    z-index: 2147483647 !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .lonaci-print-surface .provisional-slip-sheet {
    box-shadow: none !important;
    max-height: none !important;
    height: auto !important;
    overflow: visible !important;
    padding: 0 !important;
    margin: 0 auto !important;
    max-width: 100% !important;
    font-size: 8.6pt !important;
    line-height: 1.22 !important;
  }
  .lonaci-print-surface .provisional-slip-sheet h2 {
    font-size: 13pt !important;
    margin: 0 0 1.5mm !important;
  }
  .lonaci-print-surface .provisional-slip-sheet header {
    margin-bottom: 2mm !important;
    padding-bottom: 2mm !important;
  }
  .lonaci-print-surface .provisional-slip-sheet section {
    margin-bottom: 2mm !important;
    padding: 2mm 2.5mm !important;
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  .lonaci-print-surface .fiche-print-table-wrap {
    overflow: visible !important;
    max-height: none !important;
  }
  .lonaci-print-surface .provisional-slip-sheet table {
    width: 100% !important;
    min-width: 0 !important;
    table-layout: fixed !important;
    font-size: 7.2pt !important;
  }
  .lonaci-print-surface .provisional-slip-sheet th,
  .lonaci-print-surface .provisional-slip-sheet td {
    padding: 0.5mm 0.8mm !important;
    hyphens: auto;
    overflow-wrap: anywhere;
  }
  .lonaci-print-surface .lonaci-payee-print-card {
    box-shadow: none !important;
    max-height: none !important;
    overflow: visible !important;
    padding: 2mm !important;
    font-size: 8.8pt !important;
  }
}
`.trim();

/** Texte presse-papiers pour la fiche unique regroupant toutes les cautions produit. */
function provisionalBundleClipboardLines(slips: ProvisionalSlipData[]): string[] {
  if (slips.length === 0) return [];
  const head = slips[0]!;
  const total = slips.reduce((a, s) => a + s.montantFCFA, 0);
  const lines: string[] = [
    "Lonaci — Fiche de paiement caution (document unique)",
    `Client: ${head.clientLabel}`,
    `Code client: ${head.clientCode}`,
    `ID client Lonaci: ${head.lonaciClientId || "—"}`,
    `Total FCFA à encaisser: ${total}`,
    `Nombre de cautions / produits: ${slips.length}`,
    "",
    "Détail par produit :",
  ];
  slips.forEach((s, i) => {
    lines.push(
      `--- Ligne ${i + 1} / ${slips.length} ---`,
      `N° FPC: ${s.numero}`,
      `ID dossier caution: ${s.cautionId || "—"}`,
      `Code produit: ${s.produitCode}`,
      ...(s.produitLibelle ? [`Libellé produit: ${s.produitLibelle}`] : []),
      `Montant FCFA: ${s.montantFCFA}`,
      `—0chéance: ${s.dueDate}`,
      `Référence interne Lonaci (trace): ${s.referenceInterneLonaci}`,
      "",
    );
  });
  return lines;
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
  const initialTabFromUrl = searchParams.get("tab")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const referentialError = error;
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [counters, setCounters] = useState<CautionCounters | null>(null);
  /** Données brutes état mensuel par produit (même API que le tableau) — pour aligner les Analytics. */
  const [etatMensuelRows, setEtatMensuelRows] = useState<CautionEtatMensuelProduitRow[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [tab, setTab] = useState<CautionListTab>("EN_ATTENTE");
  const [items, setItems] = useState<CautionListItem[]>([]);

  const pageSize = 50;

  const [referentialProduits, setReferentialProduits] = useState<ReferentialProduitRow[]>([]);
  const [referentialProduitsLoading, setReferentialProduitsLoading] = useState(false);
  const [selectedLonaciClientId, setSelectedLonaciClientId] = useState("");
  const [clientSearchInput, setClientSearchInput] = useState("");
  const [clientSearchHits, setClientSearchHits] = useState<LonaciClientSearchHit[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [clientFromPick, setClientFromPick] = useState<{ id: string; label: string; code: string } | null>(null);
  const [selectedProduitCodes, setSelectedProduitCodes] = useState<string[]>([]);
  /** Filtre texte sur code / libellé pour retrouver un produit dans une longue liste. */
  const [produitSearch, setProduitSearch] = useState("");
  const referentialLoadSeq = useRef(0);
  const [montant, setMontant] = useState("");
  const [modeReglement, setModeReglement] = useState<CautionEncaissementMode>("ESPECES");
  const [dueDateLocal, setDueDateLocal] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [observations, setObservations] = useState("");
  /** Par défaut : fiche de paiement caution pour paiement à la caisse (parcours nominal). */
  const [ficheProvisoire, setFicheProvisoire] = useState(true);
  const [regularizeTarget, setRegularizeTarget] = useState<CautionListItem | null>(null);
  const [regularizeMode, setRegularizeMode] = useState<CautionEncaissementMode>("VIREMENT");
  const [regularizeRef, setRegularizeRef] = useState("");
  const [regularizeDue, setRegularizeDue] = useState("");
  const [regularizing, setRegularizing] = useState(false);
  const [provisionalSlips, setProvisionalSlips] = useState<ProvisionalSlipData[]>([]);
  const provisionalSlipsTotalFcfa = provisionalSlips.reduce((sum, s) => sum + s.montantFCFA, 0);
  const [cautionPayeeSlip, setCautionPayeeSlip] = useState<CautionFicheDefinitiveModalData | null>(null);
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
  const [meRole, setMeRole] = useState<string | null>(null);
  const meRbacRole = useMemo<LonaciRole | null>(
    () => (meRole && LONACI_ROLES.includes(meRole as LonaciRole) ? (meRole as LonaciRole) : null),
    [meRole],
  );
  const mayRegularizePaiement = useMemo(
    () =>
      meRbacRole ? canRole({ role: meRbacRole, resource: "CAUTIONS", action: "CREATE" }).allowed : false,
    [meRbacRole],
  );

  const cautionListDisplayRows = useMemo(
    () => buildCautionListDisplayRows(items, tab),
    [items, tab],
  );

  const renderCautionListActionCell = useCallback(
    (row: CautionListItem) => {
      const pipelineStatus = ["EN_ATTENTE", "A_CORRIGER", "VALIDE_N1", "VALIDE_N2"].includes(row.status);
      const mayFinalize = meRbacRole
        ? canRole({ role: meRbacRole, resource: "CAUTIONS", action: "FINALIZE" }).allowed
        : false;
      const mayReject = meRbacRole
        ? canRole({ role: meRbacRole, resource: "CAUTIONS", action: "REJECT" }).allowed
        : false;
      const mayReturn = meRbacRole
        ? canRole({ role: meRbacRole, resource: "CAUTIONS", action: "RETURN_FOR_CORRECTION" }).allowed
        : false;
      const showRegularize =
        row.ficheProvisoire &&
        (row.status === "EN_ATTENTE" || row.status === "A_CORRIGER") &&
        mayRegularizePaiement;
      const showFinalize = pipelineStatus && !row.ficheProvisoire && mayFinalize;
      const showReturn = pipelineStatus && mayReturn;
      const showReject = pipelineStatus && mayReject;
      const showActionCell =
        tab !== "VALIDATED_THIS_MONTH" &&
        !row.immutableAfterFinal &&
        (showFinalize || showReturn || showReject || showRegularize);

      if (!showActionCell) {
        return (
          <span
            className={
              tab === "VALIDATED_THIS_MONTH" || row.status === "VALIDE_N1" || row.status === "VALIDE_N2"
                ? "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                : "text-[11px] text-slate-500"
            }
          >
            {tab === "VALIDATED_THIS_MONTH" || row.status === "VALIDE_N1" || row.status === "VALIDE_N2"
              ? "Validée"
              : "—"}
          </span>
        );
      }
      return (
        <div className="flex flex-wrap justify-end gap-1">
          {showRegularize ? (
            <button
              type="button"
              onClick={() => {
                setRegularizeTarget(row);
                setRegularizeMode("VIREMENT");
                setRegularizeRef("");
                setRegularizeDue(isoToDatetimeLocalValue(row.dueDate));
              }}
              className="rounded-lg border border-amber-600 bg-amber-500 px-2 py-1 text-[10px] font-semibold text-white"
            >
              Régulariser paiement
            </button>
          ) : null}
          {showFinalize ? (
            <button
              type="button"
              disabled={finalizingId === row.id}
              onClick={() => {
                setFinalizeAck(false);
                setFinalizeDecision("APPROUVER");
                setFinalizeComment("");
                setFinalizeModal({ mode: "row", row });
              }}
              className={
                tab === "J10_OVERDUE"
                  ? CAUTION_COLOR_TOKENS.risk.action
                  : CAUTION_COLOR_TOKENS.validated.action
              }
            >
              {tab === "J10_OVERDUE" ? "Finaliser (urgence)" : "Finaliser"}
            </button>
          ) : null}
          {showReturn ? (
            <button
              type="button"
              disabled={finalizingId === row.id}
              onClick={() => {
                setFinalizeAck(false);
                setFinalizeDecision("RETOURNER_POUR_CORRECTION");
                setFinalizeComment("");
                setFinalizeModal({ mode: "row", row });
              }}
              className="rounded-lg border border-amber-600 bg-white px-2 py-1 text-[10px] font-semibold text-amber-800"
            >
              Retour
            </button>
          ) : null}
          {showReject ? (
            <button
              type="button"
              disabled={finalizingId === row.id}
              onClick={() => {
                setFinalizeAck(false);
                setFinalizeDecision("REJETER");
                setFinalizeComment("");
                setFinalizeModal({ mode: "row", row });
              }}
              className="rounded-lg border border-rose-600 bg-white px-2 py-1 text-[10px] font-semibold text-rose-800"
            >
              Rejeter
            </button>
          ) : null}
        </div>
      );
    },
    [finalizingId, meRbacRole, mayRegularizePaiement, tab],
  );

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
    setModeReglement("ESPECES");
    setFicheProvisoire(true);
    setClientSearchInput("");
    setClientSearchHits([]);
    setClientFromPick(null);
    setSelectedLonaciClientId("");
    setSelectedProduitCodes([]);
    setProduitSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  const loadReferentialProduits = useCallback(async () => {
    const seq = ++referentialLoadSeq.current;
    setReferentialProduitsLoading(true);
    try {
      const rows = await fetchReferentialProduitsActifs();
      if (seq === referentialLoadSeq.current) setReferentialProduits(rows);
    } catch {
      if (seq === referentialLoadSeq.current) setReferentialProduits([]);
    } finally {
      if (seq === referentialLoadSeq.current) setReferentialProduitsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReferentialProduits();
    const onImported = () => void loadReferentialProduits();
    window.addEventListener("lonaci:data-imported", onImported);
    return () => window.removeEventListener("lonaci:data-imported", onImported);
  }, [loadReferentialProduits]);

  const produitsPourSelect = useMemo(() => {
    const q = produitSearch.trim().toLowerCase();
    const match = (p: ReferentialProduitRow) => {
      if (!q) return true;
      const code = p.code.trim().toLowerCase();
      const lib = (p.libelle ?? "").trim().toLowerCase();
      return code.includes(q) || lib.includes(q);
    };
    const fil = referentialProduits.filter(match);
    const selectedUpper = selectedProduitCodes.map((c) => c.trim().toUpperCase()).filter(Boolean);
    const filCodes = new Set(fil.map((p) => p.code.trim().toUpperCase()));
    const extras = referentialProduits.filter(
      (p) => selectedUpper.includes(p.code.trim().toUpperCase()) && !filCodes.has(p.code.trim().toUpperCase()),
    );
    const orderedExtras: ReferentialProduitRow[] = [];
    const seenExt = new Set<string>();
    for (const c of selectedProduitCodes) {
      const ku = c.trim().toUpperCase();
      const row = extras.find((e) => e.code.trim().toUpperCase() === ku);
      if (row && !seenExt.has(ku)) {
        seenExt.add(ku);
        orderedExtras.push(row);
      }
    }
    const seen = new Set<string>();
    const out: ReferentialProduitRow[] = [];
    for (const p of orderedExtras) {
      const k = p.code.trim().toUpperCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(p);
      }
    }
    for (const p of fil) {
      const k = p.code.trim().toUpperCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(p);
      }
    }
    return out;
  }, [referentialProduits, produitSearch, selectedProduitCodes]);

  const referentielMontantTotal = useMemo(() => {
    const ordered = uniqueOrderedProduitCodes(selectedProduitCodes);
    if (ordered.length === 0) return null;
    let sum = 0;
    for (const code of ordered) {
      const row = referentialProduits.find((p) => p.code.trim().toUpperCase() === code);
      const prix = row && typeof row.prix === "number" && Number.isFinite(row.prix) ? Math.round(row.prix) : null;
      if (prix === null || prix <= 0) return null;
      sum += prix;
    }
    return sum;
  }, [selectedProduitCodes, referentialProduits]);

  useEffect(() => {
    if (referentielMontantTotal !== null) {
      setMontant(String(referentielMontantTotal));
    } else {
      setMontant("");
    }
  }, [referentielMontantTotal]);

  const toggleProduitCode = useCallback((code: string) => {
    const k = code.trim().toUpperCase();
    setSelectedProduitCodes((prev) => {
      if (prev.some((c) => c.trim().toUpperCase() === k)) {
        return prev.filter((c) => c.trim().toUpperCase() !== k);
      }
      return [...prev, code.trim()];
    });
  }, []);

  const selectAllFilteredProduits = useCallback(() => {
    setSelectedProduitCodes((prev) => {
      const map = new Map<string, string>();
      for (const c of prev) {
        const ku = c.trim().toUpperCase();
        if (ku) map.set(ku, c.trim());
      }
      for (const p of produitsPourSelect) {
        const ku = p.code.trim().toUpperCase();
        if (!map.has(ku)) map.set(ku, p.code.trim());
      }
      return [...map.values()];
    });
  }, [produitsPourSelect]);

  const clearProduitSelection = useCallback(() => setSelectedProduitCodes([]), []);

  useEffect(() => {
    const q = clientSearchInput.trim();
    if (q.length < 2) {
      setClientSearchHits([]);
      setClientSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setClientSearchLoading(true);
        try {
          const hits = await fetchClientsSearch(q, controller.signal);
          if (!controller.signal.aborted) setClientSearchHits(hits);
        } catch {
          if (!controller.signal.aborted) setClientSearchHits([]);
        } finally {
          if (!controller.signal.aborted) setClientSearchLoading(false);
        }
      })();
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [clientSearchInput]);

  const load = useCallback(async (nextTab?: CautionListTab) => {
    setLoading(true);
    setError(null);
    try {
      const tabEff = nextTab ?? tab;
      const [list, a, meRes, etatRes] = await Promise.all([
        fetchCautionsList({ tab: tabEff, pageSize }),
        fetchAlerts().catch(() => []),
        fetch("/api/auth/me", { credentials: "include", cache: "no-store" }).catch(() => null),
        fetch(`/api/cautions/etat-mensuel-produits?months=12&_=${Date.now()}`, {
          credentials: "include",
          cache: "no-store",
        }).catch(() => null),
      ]);
      setItems(list);
      setAlerts(a);
      if (etatRes?.ok) {
        const etatJson = (await etatRes.json().catch(() => null)) as { rows?: CautionEtatMensuelProduitRow[] } | null;
        setEtatMensuelRows(Array.isArray(etatJson?.rows) ? etatJson.rows : []);
      } else {
        setEtatMensuelRows([]);
      }
      if (meRes?.ok) {
        const me = (await meRes.json()) as { user?: { role?: string } };
        setMeRole(me.user?.role ?? null);
      } else {
        setMeRole(null);
      }
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
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
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
    if (isCautionListTab(initialTabFromUrl)) {
      setTab(initialTabFromUrl);
      void load(initialTabFromUrl);
    } else {
      void load();
    }
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
  }, [initialTabFromUrl, load]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedLonaciClientId.trim()) {
      setToast({ type: "error", message: "Choisissez un client Lonaci actif." });
      return;
    }
    if (!clientFromPick || clientFromPick.id !== selectedLonaciClientId.trim()) {
      setToast({ type: "error", message: "Sélectionnez un client dans les résultats de recherche." });
      return;
    }
    const codes = uniqueOrderedProduitCodes(selectedProduitCodes);
    if (codes.length === 0) {
      setToast({ type: "error", message: "Cochez au moins un produit du référentiel." });
      return;
    }
    if (!paymentReference.trim() && !ficheProvisoire) {
      setToast({ type: "error", message: "Indiquez la référence du paiement." });
      return;
    }
    if (referentielMontantTotal === null || referentielMontantTotal <= 0) {
      setToast({
        type: "error",
        message:
          "Montant : chaque produit coché doit avoir un tarif caution référentiel valide (prix manquant ou nul sur au moins un).",
      });
      return;
    }
    setCreating(true);
    setError(null);
    const wasProvisoire = ficheProvisoire;
    try {
      const due = new Date(dueDateLocal);
      if (Number.isNaN(due.getTime())) {
        throw new Error("Date d'échéance invalide");
      }
      const clientId = selectedLonaciClientId.trim();
      const obs = observations.trim() ? observations.trim() : null;
      const payRef = ficheProvisoire ? undefined : paymentReference.trim();
      const slipsOut: ProvisionalSlipData[] = [];

      for (const produitCode of codes) {
        const row = referentialProduits.find((p) => p.code.trim().toUpperCase() === produitCode);
        const montantLigne =
          row && typeof row.prix === "number" && Number.isFinite(row.prix) ? Math.round(row.prix) : 0;
        if (montantLigne <= 0) {
          throw new Error(`Produit ${produitCode} : tarif caution invalide ou manquant.`);
        }
        const response = await fetch("/api/cautions", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lonaciClientId: clientId,
            produitCode,
            montant: montantLigne,
            modeReglement: ficheProvisoire ? "PAIEMENT_DIFFERE" : modeReglement,
            dueDate: due.toISOString(),
            paymentReference: payRef,
            observations: obs,
            ficheProvisoire: ficheProvisoire || undefined,
          }),
        });
        const raw = (await response.json().catch(() => null)) as
          | {
              message?: string;
              caution?: {
                _id?: string;
                id?: string;
                contratId?: string;
                lonaciClientId?: string;
                ficheProvisoire?: boolean;
                numeroFicheProvisoire?: string | null;
                montant?: number;
                dueDate?: string;
                paymentReference?: string;
              };
            }
          | null;
        if (!response.ok) {
          throw new Error(raw?.message ?? `Création impossible pour le produit ${produitCode}.`);
        }
        const c = raw?.caution;
        if (c?.ficheProvisoire && c.numeroFicheProvisoire && clientFromPick) {
          const refProduit = referentialProduits.find((p) => p.code.trim().toUpperCase() === produitCode);
          const produitLibelle =
            refProduit?.libelle && refProduit.libelle !== produitCode ? refProduit.libelle : "";
          const cautionId = String(c._id ?? c.id ?? "").trim();
          const refInterne =
            typeof c.paymentReference === "string" && c.paymentReference.trim()
              ? c.paymentReference.trim()
              : `PROVISOIRE:${c.numeroFicheProvisoire}`;
          slipsOut.push({
            numero: c.numeroFicheProvisoire,
            montantFCFA: typeof c.montant === "number" ? c.montant : montantLigne,
            dueDate: typeof c.dueDate === "string" ? c.dueDate : due.toISOString(),
            clientLabel: clientFromPick.label,
            clientCode: clientFromPick.code.trim() || "—",
            lonaciClientId: clientFromPick.id,
            produitCode,
            produitLibelle,
            cautionId,
            referenceInterneLonaci: refInterne,
          });
        }
      }

      setCreateOpen(false);
      setMontant("");
      setDueDateLocal("");
      setPaymentReference("");
      setObservations("");
      setModeReglement("ESPECES");
      setFicheProvisoire(true);
      if (slipsOut.length > 0) {
        setProvisionalSlips(slipsOut);
      }
      window.dispatchEvent(new Event("lonaci:data-imported"));
      const n = codes.length;
      setToast({
        type: "success",
        message:
          wasProvisoire && slipsOut.length > 1
            ? `${slipsOut.length} cautions créées — une fiche de paiement caution unique affichée (${n} produit${n > 1 ? "s" : ""}).`
            : wasProvisoire
              ? "Fiche de paiement caution créée."
              : n > 1
                ? `${n} cautions créées.`
                : "Caution créée.",
      });
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setCreating(false);
    }
  }

  async function submitRegularize(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!regularizeTarget) return;
    const ref = regularizeRef.trim();
    if (!ref) {
      setToast({ type: "error", message: "Référence de paiement obligatoire." });
      return;
    }
    setRegularizing(true);
    try {
      const body: { modeReglement: CautionEncaissementMode; paymentReference: string; dueDate?: string } = {
        modeReglement: regularizeMode,
        paymentReference: ref,
      };
      const due = new Date(regularizeDue);
      if (!Number.isNaN(due.getTime())) {
        body.dueDate = due.toISOString();
      }
      const res = await fetch(`/api/cautions/${encodeURIComponent(regularizeTarget.id)}/regulariser-paiement`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = (await res.json().catch(() => null)) as {
        message?: string;
        fiche?: {
          numeroFicheDefinitive: string;
          emiseLe: string;
          paymentReference: string;
          modeReglement: CautionEncaissementMode;
        };
      } | null;
      if (!res.ok) {
        throw new Error(raw?.message ?? "Régularisation impossible");
      }
      const targetRow = regularizeTarget;
      setRegularizeTarget(null);
      setRegularizeRef("");
      window.dispatchEvent(new Event("lonaci:data-imported"));
      if (targetRow && raw?.fiche?.numeroFicheDefinitive) {
        setCautionPayeeSlip(buildCautionFicheModalData(targetRow, raw.fiche, true));
      }
      setToast({
        type: "success",
        message: raw?.fiche?.numeroFicheDefinitive
          ? `Paiement valid—  fiche d—finitive ${raw.fiche.numeroFicheDefinitive} g—n—r—e.`
          : "Paiement r—gularis—  finalisation possible.",
      });
    } catch (err) {
      setToast({
        type: "error",
        message: friendlyErrorMessage(err instanceof Error ? err.message : "Erreur"),
      });
    } finally {
      setRegularizing(false);
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
      window.dispatchEvent(new Event("lonaci:data-imported"));
      setToast({
        type: "success",
        message: `Import cautions terminé: ${data?.upserted ?? 0} créée(s), ${data?.modified ?? 0} mise(s) à jour.`,
      });
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Import impossible");
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

  async function executeDecision(
    cautionId: string,
    decision: CautionDecision,
    comment?: string,
    rowSnapshot?: CautionListItem | null,
  ) {
    setFinalizingId(cautionId);
    setError(null);
    try {
      const response = await fetch(`/api/cautions/${encodeURIComponent(cautionId)}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        fiche?: {
          numeroFicheDefinitive: string;
          emiseLe: string;
          paymentReference: string;
          modeReglement: CautionEncaissementMode;
        } | null;
      } | null;
      if (!response.ok) {
        throw new Error(body?.message ?? "Finalisation impossible");
      }
      const paidRow =
        decision === "APPROUVER" ? (rowSnapshot ?? items.find((r) => r.id === cautionId)) ?? null : null;
      if (paidRow && body?.fiche?.numeroFicheDefinitive) {
        setCautionPayeeSlip(buildCautionFicheModalData(paidRow, body.fiche, false));
      } else if (paidRow && paidRow.numeroFicheDefinitive) {
        setCautionPayeeSlip(
          buildCautionFicheModalData(
            paidRow,
            {
              numeroFicheDefinitive: paidRow.numeroFicheDefinitive,
              emiseLe: paidRow.ficheDefinitiveEmiseLe ?? new Date().toISOString(),
              datePaiement: paidRow.ficheDefinitiveEmiseLe ?? new Date().toISOString(),
            },
            false,
          ),
        );
      }
      closeFinalizeModal();
      setManualCautionId("");
      window.dispatchEvent(new Event("lonaci:data-imported"));
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
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
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
    const rowSnap = finalizeModal.mode === "row" ? finalizeModal.row : null;
    await executeDecision(id, finalizeDecision, comment || undefined, rowSnap);
  }

  function closeCreate() {
    setCreateOpen(false);
    setError(null);
    setToast(null);

    setMontant("");
    setDueDateLocal("");
    setPaymentReference("");
    setObservations("");
    setModeReglement("ESPECES");
    setFicheProvisoire(true);
    setClientSearchInput("");
    setClientSearchHits([]);
    setClientFromPick(null);
    setSelectedLonaciClientId("");
    setSelectedProduitCodes([]);
    setProduitSearch("");
  }

  const etatTableauDernierMois = useMemo(
    () => aggregateEtatMensuelLatestMonth(etatMensuelRows),
    [etatMensuelRows],
  );

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
    /** —0cart arithmétique sur les onglets liste (—0— « —0cart » du tableau ref. dossiers). */
    const pipelineEcart = pending - validated;
    return {
      totalKnown,
      pending,
      validated,
      pipelineEcart,
      validationRate: totalKnown > 0 ? Math.round((validated / totalKnown) * 100) : 0,
      pipelineEcartRate: totalKnown > 0 ? Math.round((pipelineEcart / totalKnown) * 100) : 0,
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
              Suivi des encaissements, contrôles d'échéance et finalisation par le chef de service.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("lonaci:data-imported"))}
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
          <div className="relative z-10 flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="relative flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-4 py-3">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-200/40 blur-2xl" />
              <div>
                <p className="mb-1 inline-flex rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                  Gestion des cautions
                </p>
                <h3 id="nouvelle-caution-title" className="text-lg font-semibold text-slate-900">
                  Constitution d&apos;une caution
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  <strong>1.</strong> Choisir un <strong>client Lonaci</strong> (module Clients). <strong>2.</strong>{" "}
                  Choisir le <strong>produit</strong> dans le référentiel : le montant suit le tarif produit.{" "}
                  <strong>3.</strong> Générer en principe une <strong>fiche pour la caisse</strong> ; après encaissement,
                  régulariser dans Lonaci.
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeCreate()}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
                aria-label="Fermer"
              >
                —
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 via-white to-white px-4 py-3">
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                  1. Client Lonaci
                </span>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800">
                  2. Produit(s)
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  3. Constitution (caisse ou déjà payé)
                </span>
              </div>

              <form onSubmit={onCreate} className="grid gap-3">
                <section className="rounded-xl border-2 border-amber-200/90 bg-white p-3 shadow-sm">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                    1. Client Lonaci
                  </p>
                  <p className="mb-3 text-[11px] leading-relaxed text-slate-600">
                    Recherchez un client <strong>actif</strong> du référentiel Clients Lonaci, puis cliquez sur une ligne
                    pour valider la sélection.
                  </p>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Recherche client</label>
                  <p className="mb-1.5 text-[11px] text-slate-500">
                    Nom, raison sociale ou code (au moins 2 caractères), puis choix dans les résultats.
                  </p>
                  <div className="relative mb-3">
                    <input
                      type="search"
                      autoComplete="off"
                      value={clientSearchInput}
                      onChange={(e) => setClientSearchInput(e.target.value)}
                      placeholder="Ex. Kouassi, SARL Horizon, code client…"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                      aria-label="Rechercher un client Lonaci"
                    />
                    {clientSearchLoading ? (
                      <p className="mt-1 text-[11px] text-slate-500">Recherche…</p>
                    ) : null}
                    {clientSearchInput.trim().length >= 2 && !clientSearchLoading && clientSearchHits.length === 0 ? (
                      <p className="mt-1 text-[11px] text-slate-500">Aucun résultat.</p>
                    ) : null}
                    {clientSearchHits.length > 0 ? (
                      <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                        {clientSearchHits.map((hit) => (
                          <button
                            key={hit.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-indigo-50"
                            onClick={() => {
                              setSelectedLonaciClientId(hit.id);
                              const label = formatClientHitLabel(hit);
                              setClientFromPick({ id: hit.id, label, code: hit.code });
                              setClientSearchInput(label);
                              setClientSearchHits([]);
                            }}
                          >
                            {formatClientHitLabel(hit)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {selectedLonaciClientId.trim() ? (
                    <p className="text-[11px] text-emerald-800">
                      Client sélectionné : <span className="font-semibold">{clientFromPick?.label ?? "—"}</span>
                    </p>
                  ) : null}
                </section>

                <section className="rounded-xl border border-indigo-200/80 bg-gradient-to-b from-indigo-50/30 to-white p-3 shadow-sm">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-900">
                    2. Produit(s) référentiel
                  </p>
                  <p className="mb-3 text-[11px] leading-relaxed text-slate-600">
                    Cochez <strong>un ou plusieurs</strong> produits : une <strong>caution distincte</strong> par produit
                    est créée si ce mode est choisi ; à l&apos;issue, une <strong>seule fiche de paiement caution</strong>{" "}
                    regroupe tous les lots (tableau + total). Le montant affiché est la{" "}
                    <strong>somme</strong> des tarifs référentiels.
                  </p>
                  <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="caution-produit-filter">
                    Filtrer la liste
                  </label>
                  <input
                    id="caution-produit-filter"
                    type="search"
                    autoComplete="off"
                    value={produitSearch}
                    onChange={(e) => setProduitSearch(e.target.value)}
                    placeholder="Code ou libellé du produit…"
                    disabled={referentialProduitsLoading || referentialProduits.length === 0}
                    className="mb-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                    aria-label="Filtrer les produits par code ou libellé"
                  />
                  <div className="mb-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={referentialProduitsLoading || produitsPourSelect.length === 0}
                      onClick={() => selectAllFilteredProduits()}
                      className="rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      Tout cocher (liste filtrée)
                    </button>
                    <button
                      type="button"
                      disabled={selectedProduitCodes.length === 0}
                      onClick={() => clearProduitSelection()}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Décocher tout
                    </button>
                  </div>
                    <p className="mb-1 text-[11px] font-medium text-slate-700">
                      Produits ({selectedProduitCodes.length} sélectionné
                      {selectedProduitCodes.length !== 1 ? "s" : ""})
                    </p>
                  {referentialProduitsLoading ? (
                    <p className="mb-2 text-[11px] text-slate-500">Chargement du référentiel…</p>
                  ) : null}
                  {referentialError && createOpen ? (
                    <div className="mb-2 rounded border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700">
                      Erreur de chargement écran : vérifiez la connexion puis actualisez.
                    </div>
                  ) : null}
                  <div
                    role="group"
                    aria-label="Sélection des produits pour les cautions"
                    className="max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white p-1"
                  >
                    {produitsPourSelect.map((p) => {
                      const code = p.code.trim();
                      const ku = code.toUpperCase();
                      const checked = selectedProduitCodes.some((c) => c.trim().toUpperCase() === ku);
                      const lib = p.libelle?.trim();
                      const label = lib && lib !== code ? `${code} — ${lib}` : code;
                      const prixLabel =
                        typeof p.prix === "number" && Number.isFinite(p.prix)
                          ? `${Math.round(p.prix).toLocaleString("fr-FR")} FCFA`
                          : "—";
                      return (
                        <label
                          key={code}
                          className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-indigo-50/80"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProduitCode(code)}
                            className="mt-0.5 rounded border-slate-300"
                          />
                          <span className="min-w-0 flex-1 text-slate-900">
                            <span className="font-medium">{label}</span>
                            <span className="ml-2 tabular-nums text-xs text-slate-600">{prixLabel}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {!referentialProduitsLoading &&
                  referentialProduits.length > 0 &&
                  produitSearch.trim() &&
                  produitsPourSelect.length === 0 ? (
                    <p className="mt-1 text-[11px] text-slate-600">Aucun produit ne correspond au filtre.</p>
                  ) : null}
                  {!referentialProduitsLoading && referentialProduits.length > 0 ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {produitsPourSelect.length === 1
                        ? "1 produit affiché"
                        : `${produitsPourSelect.length} produits affichés`}
                      {produitSearch.trim() ? ` sur ${referentialProduits.length}.` : "."}
                    </p>
                  ) : null}
                  {selectedProduitCodes.length > 0 && referentielMontantTotal === null && !referentialProduitsLoading ? (
                    <p className="mt-1 text-[11px] text-amber-800">
                      Au moins un produit coché n&apos;a pas de prix référentiel utilisable : décochez-le ou complétez
                      le tarif dans le référentiel.
                    </p>
                  ) : null}
                </section>

                <fieldset className="rounded-xl border-2 border-indigo-300/80 bg-gradient-to-b from-indigo-50/40 to-white p-3 shadow-sm">
                  <legend className="px-1 text-xs font-bold uppercase tracking-wide text-indigo-900">
                    3. Constitution de la caution
                  </legend>
                  <p className="mb-3 text-[11px] leading-relaxed text-slate-600">
                    Cas nominal : vous remplissez ce formulaire avec le client inscrit, puis le porteur présente la{" "}
                    <strong>fiche de paiement caution</strong> à la caisse pour payer. Si l&apos;argent a déjà été encaissé hors
                    ce flux, basculez sur la saisie directe.
                  </p>

                  <div className="mb-3 grid gap-2" role="radiogroup" aria-label="Mode de constitution de la caution">
                    <label
                      className={`flex cursor-pointer gap-2.5 rounded-lg border border-amber-300 bg-amber-50/80 p-3 ${
                        ficheProvisoire ? "ring-2 ring-amber-400" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="caution-constitution-mode"
                        checked={ficheProvisoire}
                        onChange={() => setFicheProvisoire(true)}
                        className="mt-1"
                      />
                      <span className="text-xs leading-relaxed text-amber-950">
                        <span className="font-semibold">Paiement à la caisse (recommandé)</span> — enregistrement sans
                        encaissement immédiat ; génération d&apos;une fiche numérotée (FPC-…) à imprimer pour le
                        guichet. Après paiement : <strong>Régulariser paiement</strong> dans Lonaci (référence reçue).
                      </span>
                    </label>
                    <label
                      className={`flex cursor-pointer gap-2.5 rounded-lg border border-slate-200 bg-white p-3 ${
                        !ficheProvisoire ? "ring-2 ring-indigo-300" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="caution-constitution-mode"
                        checked={!ficheProvisoire}
                        onChange={() => setFicheProvisoire(false)}
                        className="mt-1"
                      />
                      <span className="text-xs leading-relaxed text-slate-700">
                        <span className="font-semibold">Encaissement déjà effectué</span> — saisir tout de suite le
                        mode, la date et la référence du paiement reçu (hors fiche caisse).
                      </span>
                    </label>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="caution-montant" className="mb-1 block text-xs font-medium text-slate-700">
                        Total montants cautions (somme des produits cochés)
                      </label>
                      <input
                        id="caution-montant"
                        required
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={montant}
                        readOnly
                        aria-readonly="true"
                        title="Somme des tarifs caution des produits cochés — non modifiable"
                        className="w-full min-w-0 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-800 outline-none cursor-not-allowed"
                      />
                      {referentielMontantTotal === null && selectedProduitCodes.length > 0 && !referentialProduitsLoading ? (
                        <p className="mt-1 text-[11px] text-amber-800">
                          Aucun total valide : vérifiez que chaque produit coché a un tarif dans le référentiel.
                        </p>
                      ) : null}
                    </div>

                    {ficheProvisoire ? (
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-700">
                          Date limite de paiement à la caisse <span className="text-rose-600">*</span>
                        </label>
                        <input
                          aria-label="Date limite de paiement prévue pour la fiche de paiement caution"
                          required
                          type="datetime-local"
                          value={dueDateLocal}
                          onChange={(e) => setDueDateLocal(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          —0chéance pour les alertes et le suivi jusqu&apos;à la régularisation après passage en caisse.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label htmlFor="caution-mode-reglement" className="mb-1 block text-xs font-medium text-slate-700">
                            Mode de règlement <span className="text-rose-600">*</span>
                          </label>
                          <select
                            id="caution-mode-reglement"
                            required
                            aria-label="Mode de règlement du paiement de caution"
                            value={modeReglement}
                            onChange={(e) => setModeReglement(e.target.value as CautionEncaissementMode)}
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                          >
                            {CAUTION_ENCAISSEMENT_MODES.map((m) => (
                              <option key={m} value={m}>
                                {labelModeReglement(m)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="caution-date-paiement" className="mb-1 block text-xs font-medium text-slate-700">
                            Date et heure du paiement <span className="text-rose-600">*</span>
                          </label>
                          <input
                            id="caution-date-paiement"
                            required
                            type="datetime-local"
                            value={dueDateLocal}
                            onChange={(e) => setDueDateLocal(e.target.value)}
                            aria-label="Date et heure du paiement reçu"
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                          <p className="mt-1 text-[11px] text-slate-500">
                            Date d&apos;encaissement effectif (caisse, banque ou opérateur).
                          </p>
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor="caution-ref-paiement" className="mb-1 block text-xs font-medium text-slate-700">
                            Référence du paiement <span className="text-rose-600">*</span>
                          </label>
                          <input
                            id="caution-ref-paiement"
                            required
                            aria-label="Référence du paiement"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            placeholder="Ex. n° transaction, n° chèque, référence virement…"
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </fieldset>

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
                    accept={getImportAcceptAttribute("CAUTIONS")}
                    aria-label="Importer des cautions"
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
                    disabled={creating || referentialProduitsLoading}
                    className="rounded-lg border border-amber-500 bg-amber-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-amber-600 hover:bg-amber-600 disabled:opacity-60"
                  >
                    {creating
                      ? "Création…"
                      : ficheProvisoire
                        ? "Générer la fiche caisse"
                        : "Enregistrer la caution payée"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {regularizeTarget ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="regularize-caution-title"
        >
          <form
            onSubmit={(e) => void submitRegularize(e)}
            className="w-full max-w-md rounded-2xl border-2 border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white p-4 shadow-2xl"
          >
            <h4 id="regularize-caution-title" className="text-base font-semibold text-slate-900">
              Régulariser le paiement
            </h4>
            <p className="mt-1 text-xs text-slate-600">
              Fiche{" "}
              <span className="font-mono font-medium text-slate-800">
                {regularizeTarget.numeroFicheProvisoire ?? "—"}
              </span>{" "}
              — complétez le formulaire de paiement effectif (même rubrique que lors d'un encaissement direct).
            </p>
            <fieldset className="mt-4 rounded-xl border border-indigo-200/90 bg-white/90 p-3">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-indigo-900">
                Formulaire de paiement de la caution
              </legend>
              <div className="mt-2 grid gap-3">
                <label className="block text-sm">
                  <span className="text-slate-600">Mode de règlement *</span>
                  <select
                    aria-label="Mode de règlement après régularisation"
                    value={regularizeMode}
                    onChange={(e) => setRegularizeMode(e.target.value as CautionEncaissementMode)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {CAUTION_ENCAISSEMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {labelModeReglement(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Référence du paiement *</span>
                  <input
                    required
                    value={regularizeRef}
                    onChange={(e) => setRegularizeRef(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                    placeholder="Référence transaction / chèque / etc."
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Date / heure du paiement (optionnel)</span>
                  <input
                    type="datetime-local"
                    value={regularizeDue}
                    onChange={(e) => setRegularizeDue(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </fieldset>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={regularizing}
                onClick={() => {
                  setRegularizeTarget(null);
                  setRegularizeRef("");
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={regularizing}
                className="rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {regularizing ? "Enregistrement…" : "Valider la régularisation"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {provisionalSlips.length > 0 ? (
        <div className="lonaci-print-surface fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 p-4">
          <style dangerouslySetInnerHTML={{ __html: LONACI_PRINT_ISOLATION_CSS }} />
          <div className="provisional-slip-sheet max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border-2 border-slate-300 bg-white p-6 shadow-2xl print:max-h-none print:rounded-none print:border-0 print:p-4 print:shadow-none">
            <header className="mb-5 border-b-2 border-slate-800 pb-4 print:mb-3 print:border-slate-900 print:pb-2">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Fiche de paiement caution
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                <strong>Document unique</strong> pour la caisse et Lonaci : client, total à encaisser et tableau de tous
                les produits / cautions créés sur cette opération.
              </p>
            </header>

            {provisionalSlips.length > 1 ? (
              <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50/90 px-3 py-2 text-sm text-sky-950 print:hidden">
                <strong>{provisionalSlips.length} produits</strong> — une caution par ligne, présentés sur cette même
                fiche.
              </p>
            ) : null}

            <section className="mb-6 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/90 to-white p-4 print:mb-3 print:border-slate-300 print:bg-white print:p-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-indigo-950">Client Lonaci</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-indigo-900/90">
                Personne ou structure enregistrée dans le référentiel <strong>Clients</strong> Lonaci.
              </p>
              <p className="mt-2 text-xl font-semibold leading-snug text-slate-900">{provisionalSlips[0]!.clientLabel}</p>
              <dl className="mt-3 grid gap-2 text-sm text-slate-700">
                <div className="flex flex-wrap justify-between gap-2 border-t border-indigo-100 pt-2 print:border-slate-200">
                  <dt className="text-slate-500">Code client</dt>
                  <dd className="break-all font-mono text-xs font-semibold text-slate-900">
                    {provisionalSlips[0]!.clientCode || "—"}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-t border-indigo-100 pt-2 print:border-slate-200">
                  <dt className="text-slate-500">Identifiant technique (Lonaci)</dt>
                  <dd className="break-all font-mono text-xs font-semibold text-slate-900">
                    {provisionalSlips[0]!.lonaciClientId || "—"}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="rounded-lg border-2 border-dashed border-slate-400 bg-white px-4 py-3 print:border-slate-500">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total à encaisser</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl print:text-xl">
                    {provisionalSlipsTotalFcfa.toLocaleString("fr-FR")}{" "}
                    <span className="text-base font-semibold text-slate-600">FCFA</span>
                  </p>
                  {provisionalSlips.length > 1 ? (
                    <p className="mt-1 text-xs text-slate-600">
                      Somme des {provisionalSlips.length} cautions (une par produit).
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-3 text-sm leading-relaxed text-slate-800 print:bg-white">
                <p className="font-semibold text-slate-900">Pour le caissier</p>
                <p className="mt-2 text-xs sm:text-sm">
                  Encaisser <strong>une fois</strong> le total ci-dessus pour ce client.
                  {provisionalSlips.length > 1 ? (
                    <>
                      {" "}
                      Mentionner sur le reçu ou le borderau les <strong>références FPC</strong> du tableau ci-dessous
                      (chaque ligne), avec les montants de ligne si utile pour la compta.
                    </>
                  ) : (
                    <>
                      {" "}
                      Mentionner sur le reçu ou le borderau la <strong>référence FPC</strong> figurant dans le tableau
                      ci-dessous.
                    </>
                  )}
                </p>
              </div>
            </section>

            <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50/40 p-4 print:mb-3 print:bg-white print:p-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                Produits et cautions (fiche unique)
              </h4>
              <p className="mt-1 text-xs text-slate-600">
                Chaque ligne correspond à une caution Lonaci ; régularisez le paiement ligne par ligne après
                encaissement.
              </p>
              <div className="fiche-print-table-wrap mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white print:overflow-visible print:mt-2">
                <table className="w-full min-w-[44rem] border-collapse text-left text-sm print:min-w-0 print:table-fixed print:text-[7.5pt]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      <th scope="col" className="px-2 py-2">
                        #
                      </th>
                      <th scope="col" className="px-2 py-2">
                        N° FPC
                      </th>
                      <th scope="col" className="px-2 py-2">
                        Produit
                      </th>
                      <th scope="col" className="px-2 py-2 text-right">
                        Montant
                      </th>
                      <th scope="col" className="px-2 py-2 whitespace-nowrap">
                        —0chéance
                      </th>
                      <th scope="col" className="px-2 py-2 font-mono text-[10px] font-bold normal-case tracking-normal">
                        ID dossier
                      </th>
                      <th scope="col" className="max-w-[8rem] px-2 py-2 font-mono text-[10px] font-bold normal-case tracking-normal">
                        Réf. interne
                      </th>
                      <th scope="col" className="print:hidden px-2 py-2 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {provisionalSlips.map((row, rowIdx) => (
                      <tr
                        key={`${row.referenceInterneLonaci}-${row.cautionId}-row-${rowIdx}`}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-2 py-2 align-top tabular-nums text-slate-700">{rowIdx + 1}</td>
                        <td className="px-2 py-2 align-top font-mono text-xs font-semibold text-indigo-900">
                          {row.numero}
                        </td>
                        <td className="max-w-[14rem] px-2 py-2 align-top">
                          <span className="font-mono text-xs text-slate-900">{row.produitCode}</span>
                          {row.produitLibelle ? (
                            <span className="mt-0.5 block text-xs leading-snug text-slate-600">{row.produitLibelle}</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 align-top text-right font-semibold tabular-nums text-slate-900">
                          {row.montantFCFA.toLocaleString("fr-FR")}{" "}
                          <span className="text-xs font-normal text-slate-500">FCFA</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 align-top text-xs text-slate-800">
                          {new Date(row.dueDate).toLocaleString("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="max-w-[7rem] truncate px-2 py-2 align-top font-mono text-[10px] text-slate-700" title={row.cautionId || undefined}>
                          {row.cautionId || "—"}
                        </td>
                        <td className="max-w-[8rem] truncate px-2 py-2 align-top font-mono text-[10px] text-amber-950" title={row.referenceInterneLonaci}>
                          {row.referenceInterneLonaci}
                        </td>
                        <td className="print:hidden px-2 py-2 align-top text-right">
                          <button
                            type="button"
                            disabled={!/^[a-f\d]{24}$/i.test(row.cautionId)}
                            title={
                              /^[a-f\d]{24}$/i.test(row.cautionId)
                                ? "Régulariser cette ligne"
                                : "ID caution manquant"
                            }
                            onClick={() => {
                              if (!/^[a-f\d]{24}$/i.test(row.cautionId)) return;
                              setRegularizeTarget(cautionListItemFromProvisionalSlip(row));
                              setRegularizeRef("");
                              setRegularizeMode("VIREMENT");
                              setProvisionalSlips([]);
                            }}
                            className="rounded-md border border-indigo-400 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-900 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Régulariser
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                      <td colSpan={3} className="px-2 py-2 text-right text-sm">
                        Total
                      </td>
                      <td className="px-2 py-2 text-right text-sm tabular-nums">
                        {provisionalSlipsTotalFcfa.toLocaleString("fr-FR")}{" "}
                        <span className="text-xs font-normal text-slate-500">FCFA</span>
                      </td>
                      <td colSpan={4} className="px-2 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-xs leading-relaxed text-indigo-950 print:bg-white">
                <p className="font-semibold text-indigo-950">Après paiement à la caisse (Lonaci)</p>
                <p className="mt-1 text-indigo-900/95">
                  Liste <strong>Cautions</strong> — ' pour <strong>chaque ligne</strong> du tableau :{" "}
                  <strong>Régulariser paiement</strong> et saisir le mode ainsi que la référence figurant sur le reçu
                  caisse. Les références <strong>FPC</strong> et <strong>ID dossier</strong> ci-dessus identifient chaque
                  dossier ; la colonne « Réf. interne » est une trace Lonaci, distincte de la référence bancaire.
                </p>
              </div>
            </section>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 print:hidden">
              <button
                type="button"
                onClick={() => setProvisionalSlips([])}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(provisionalBundleClipboardLines(provisionalSlips).join("\n"))
                    .then(
                      () => setToast({ type: "success", message: "Fiche copiée dans le presse-papiers." }),
                      () => setToast({ type: "error", message: "Copie impossible (navigateur ou permissions)." }),
                    );
                }}
                className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Copier la fiche
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Imprimer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cautionPayeeSlip ? (
        <CautionFicheDefinitiveModal slip={cautionPayeeSlip} onClose={() => setCautionPayeeSlip(null)} />
      ) : null}

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Analytics cautions</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Pipeline liste (onglets) et dernier mois du tableau « État mensuel par produit » — mêmes formules d'affichage
            que le tableau (à encaisser affiché, encaissées, écart cautions, non encaissées FCFA).
          </p>
        </div>

        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={CAUTION_COLOR_TOKENS.risk.card}>
            <div className={CAUTION_COLOR_TOKENS.risk.title}>Retardé</div>
            <div className={`mt-1 text-2xl font-semibold ${CAUTION_COLOR_TOKENS.risk.value}`}>{counters?.overdueJ10 ?? "—"}</div>
            <div className="text-[11px] text-slate-600">{cautionAnalytics.riskRate}% du portefeuille caution</div>
          </div>
          <div className={CAUTION_COLOR_TOKENS.pending.card}>
            <div className={CAUTION_COLOR_TOKENS.pending.title}>En cours (liste)</div>
            <div className={`mt-1 text-2xl font-semibold ${CAUTION_COLOR_TOKENS.pending.value}`}>{cautionAnalytics.pending}</div>
            <div className="text-[11px] text-slate-600">Onglets « Attendu caution » + retards J+10 — hors ref. dossiers du tableau</div>
          </div>
          <div className={CAUTION_COLOR_TOKENS.validated.card}>
            <div className={CAUTION_COLOR_TOKENS.validated.title}>Terminées</div>
            <div className={`mt-1 text-2xl font-semibold ${CAUTION_COLOR_TOKENS.validated.value}`}>{counters?.validatedThisMonth ?? "—"}</div>
            <div className="text-[11px] text-slate-600">Taux finalisé (mois): {cautionAnalytics.validationRate}%</div>
          </div>
          <div className="rounded-xl border border-cyan-100 bg-linear-to-br from-cyan-50 to-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-cyan-700">—0cart pipeline (liste)</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{cautionAnalytics.pipelineEcart}</div>
            <div className="text-[11px] text-slate-600">
              (En cours + retards) ——' Terminées ce mois · {cautionAnalytics.pipelineEcartRate}% du portefeuille liste — distinct
              de la colonne « —0cart » du tableau
            </div>
          </div>
        </div>

        {etatTableauDernierMois ? (
          <div className="border-b border-slate-100 bg-amber-50/40 px-4 py-3">
            <p className="text-xs font-semibold text-amber-950">
              Tableau par produit — {etatTableauDernierMois.moisLabel}{" "}
              <span className="font-mono font-normal text-amber-900/80">({etatTableauDernierMois.yearMonth})</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] tabular-nums text-slate-800">
              <span>
                ì encaisser affiché :{" "}
                <strong className="text-slate-950">{etatTableauDernierMois.totals.nombreCautionsAEncaisser}</strong>{" "}
                cautions
              </span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span>
                Encaissées :{" "}
                <strong className="text-slate-950">{etatTableauDernierMois.totals.nombreCautionsEncaissees}</strong> /{" "}
                <strong className="text-slate-950">
                  {etatTableauDernierMois.totals.montantCautionsEncaissees.toLocaleString("fr-FR")}
                </strong>{" "}
                FCFA
              </span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span>
                —0cart (cautions) :{" "}
                <strong className="text-slate-950">
                  {etatTableauDernierMois.totals.ecartNombreCautionsAffiche.toLocaleString("fr-FR")}
                </strong>
              </span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span>
                Non encaissées (FCFA) :{" "}
                <strong className="text-slate-950">
                  {etatTableauDernierMois.totals.montantCautionsNonEncaissees.toLocaleString("fr-FR")}
                </strong>
              </span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span>
                Attendus (FCFA) :{" "}
                <strong className="text-slate-950">
                  {etatTableauDernierMois.totals.montantAttendusCautions.toLocaleString("fr-FR")}
                </strong>
              </span>
            </div>
          </div>
        ) : (
          <div className="border-b border-slate-100 px-4 py-2.5 text-[11px] text-slate-500">
            État mensuel par produit indisponible ou vide — les totaux du tableau ne peuvent pas être affichés ici.
          </div>
        )}

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
                <p className="text-xs text-slate-500">Aucune donnée sur l'onglet courant.</p>
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
                <p className="text-xs text-slate-500">Pas d'alerte disponible.</p>
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

      <CautionEtatMensuelParProduitBlock
        domIdPrefix="cautions-etat-mensuel"
        months={12}
        allowAdminAttendusMontants={meRbacRole === "CHEF_SERVICE" || meRbacRole === "ASSIST_CDS"}
      />

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
          <div className="text-xs font-medium text-rose-700">Retardé</div>
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
          <div className="text-xs font-medium text-amber-700">Attendu caution</div>
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
          <div className="text-xs font-medium text-emerald-700">Terminées</div>
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
                <th className="px-2 py-2 font-medium" scope="col" title="Fiche provisoire : N° FPC comme sur l'imprimé ; sinon référence d'encaissement.">
                  Réf.
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Client
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Produit
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Montant
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Agence
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
              {cautionListDisplayRows.map((displayRow) => {
                const badgeClass =
                  tab === "J10_OVERDUE"
                    ? CAUTION_COLOR_TOKENS.risk.badge
                    : tab === "EN_ATTENTE"
                      ? CAUTION_COLOR_TOKENS.pending.badge
                      : CAUTION_COLOR_TOKENS.validated.badge;

                if (displayRow.kind === "single") {
                  const row = displayRow.row;
                  const statutLabel = cautionStatutLabel(row, tab);
                  return (
                    <tr key={row.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                      <td className="px-2 py-2 font-mono whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span>
                            {cautionReferenceListeOuFiche(row)}
                          </span>
                          {row.ficheProvisoire ? (
                            <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-900">
                              Provisoire
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{row.concessionnaireNom || "—"}</td>
                      <td className="px-2 py-2 font-mono whitespace-nowrap">{row.produitCode || "—"}</td>
                      <td className="px-2 py-2">{row.montant?.toLocaleString("fr-FR") ?? row.montant}</td>
                      <td className="px-2 py-2">{row.agenceLabel || "Sans agence"}</td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                          {statutLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">{renderCautionListActionCell(row)}</td>
                    </tr>
                  );
                }

                const { key, rows } = displayRow;
                const primary = rows[0]!;
                const statutLabel = cautionStatutLabel(primary, tab);
                const totalMontant = rows.reduce(
                  (acc, r) => acc + (typeof r.montant === "number" ? r.montant : 0),
                  0,
                );
                const uniqAgences = [...new Set(rows.map((r) => r.agenceLabel || "Sans agence"))];
                const agenceCell = uniqAgences.length === 1 ? uniqAgences[0]! : uniqAgences.join(" · ");

                return (
                  <tr
                    key={`group-${key}`}
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50 align-top"
                  >
                    <td className="px-2 py-2 font-mono whitespace-nowrap">
                      <div className="flex flex-col gap-1.5">
                        {rows.map((r) => (
                          <div key={r.id} className="flex flex-col gap-0.5">
                            <span>
                              {cautionReferenceListeOuFiche(r)}
                            </span>
                            {r.ficheProvisoire ? (
                              <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-900">
                                Provisoire
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{primary.concessionnaireNom || "—"}</td>
                    <td className="px-2 py-2 font-mono">
                      <div className="flex flex-col gap-0.5 whitespace-nowrap">
                        {rows.map((r) => (
                          <span key={r.id}>{r.produitCode || "—"}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-semibold tabular-nums">{totalMontant.toLocaleString("fr-FR")}</div>
                      <div className="text-[10px] text-slate-500">
                        {rows.length} ligne{rows.length > 1 ? "s" : ""} · total fiche
                      </div>
                    </td>
                    <td className="px-2 py-2">{agenceCell}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                        {statutLabel}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex flex-col items-end gap-2">
                        {rows.map((r) => (
                          <div key={r.id} className="w-full">
                            {renderCautionListActionCell(r)}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!cautionListDisplayRows.length ? (
                <tr>
                  <td className="px-2 py-6 text-center text-slate-500" colSpan={7}>
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
          Rôle requis : chef(fe) de service. Régulariser toute fiche provisoire avant finalisation. Double confirmation avant envoi.
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
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <h3 id="finalize-caution-title" className="text-base font-semibold text-slate-900">
                  Décision finale
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-600">Approuver, rejeter ou retourner pour correction.</p>
              </div>
              <button
                type="button"
                disabled={finalizingId !== null}
                onClick={closeFinalizeModal}
                className="rounded px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Fermer"
              >
                —
              </button>
            </div>

            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950">
              <strong>Approuver</strong> ou <strong>Rejeter</strong> rend la caution immuable.{" "}
              <strong>Retourner pour correction</strong> garde la caution modifiable.
            </div>

            <div className="mt-3 grid gap-1.5">
              <p className="text-[11px] font-semibold text-slate-700">Décision</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={finalizingId !== null}
                  onClick={() => setFinalizeDecision("APPROUVER")}
                  className={
                    finalizeDecision === "APPROUVER"
                      ? "rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                      : "rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
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
                      ? "rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                      : "rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
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
                      ? "rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                      : "rounded-md border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50"
                  }
                >
                  Retour correction
                </button>
              </div>
            </div>

            {finalizeModal.mode === "row" ? (
              <dl className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-slate-800">
                <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                  <dt className="text-slate-500">Réf.</dt>
                  <dd className="font-mono">{cautionReferenceListeOuFiche(finalizeModal.row)}</dd>
                </div>
                <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                  <dt className="text-slate-500">
                    {finalizeModal.row.contratId.trim() ? "Contrat (id)" : "Client Lonaci (id)"}
                  </dt>
                  <dd className="font-mono">
                    {finalizeModal.row.contratId.trim()
                      ? finalizeModal.row.contratId
                      : finalizeModal.row.lonaciClientId?.trim() || "—"}
                  </dd>
                </div>
                <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                  <dt className="text-slate-500">Montant</dt>
                  <dd className="font-semibold tabular-nums">
                    {finalizeModal.row.montant?.toLocaleString("fr-FR") ?? finalizeModal.row.montant} FCFA
                  </dd>
                </div>
                <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                  <dt className="text-slate-500">Retard</dt>
                  <dd className="tabular-nums">{finalizeModal.row.daysOverdue} j</dd>
                </div>
              </dl>
            ) : (
              <div className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2">
                <p className="text-[11px] text-slate-600">Identifiant caution (manuel)</p>
                <p className="mt-0.5 font-mono text-xs text-slate-900">{finalizeModal.id}</p>
              </div>
            )}

            <div className="mt-3">
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Motif {finalizeDecision === "APPROUVER" ? "(optionnel)" : "(obligatoire)"}
              </label>
              <textarea
                value={finalizeComment}
                onChange={(e) => setFinalizeComment(e.target.value)}
                disabled={finalizingId !== null}
                rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                placeholder={
                  finalizeDecision === "APPROUVER"
                    ? "Optionnel"
                    : "Ex: référence de paiement incorrecte, pièce manquante, incohérence montant…"
                }
              />
            </div>

            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-xs text-slate-800">
              <input
                type="checkbox"
                checked={finalizeAck}
                onChange={(e) => setFinalizeAck(e.target.checked)}
                disabled={finalizingId !== null}
                className="mt-0.5 rounded border-slate-300"
              />
              <span>
                Je confirme ma décision.
              </span>
            </label>

            <div className="mt-3 flex flex-wrap justify-end gap-1.5">
              <button
                type="button"
                disabled={finalizingId !== null}
                onClick={closeFinalizeModal}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
                className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
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
