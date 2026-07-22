"use client";

import { Download, FilePlus2, RefreshCw } from "lucide-react";

import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { ConfirmDialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Card, Surface } from "@/components/lonaci/ui/surface";
import {
  hideDossierN1N2ForChefService,
  listDossierTransitionActionsForUi,
  userCanApproveDossierAtEtape,
  userCanPerformDossierTransitionAtEtape,
  type DossierTransitionAction,
} from "@/lib/auth/dossier-transition-rbac";
import { getRoleWorkflowFilterStatuses } from "@/lib/lonaci/workflow-ui-policy";
import {
  areWorkflowApprovalsEnabled,
  workflowAdvanceLabel,
} from "@/lib/lonaci/workflow-approvals";
import {
  CLIENT_CATEGORIE_LABELS,
  CLIENT_STATUT_LABELS,
  CLIENT_TYPE_DISTRIBUTEUR_LABELS,
  normalizeClientCategorie,
  normalizeClientTypeDistributeur,
  type ClientCategorie,
} from "@/lib/lonaci/client-constants";
import {
  BANCARISATION_STATUT_LABELS,
  BANCARISATION_STATUTS,
  type BancarisationStatut,
  type LonaciRole,
} from "@/lib/lonaci/constants";
import { produitAutorisePourConcessionnaire } from "@/lib/lonaci/contrat-produit-rules";
import { captureByAliases, extractPdfText, normalizeDateToIso } from "@/lib/lonaci/pdf-import";
import {
  contratStatutMetierBadgeClass,
  type ContratStatutMetier,
} from "@/lib/lonaci/contrat-statut-metier";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { assertExcelImportAllowed, getImportAcceptAttribute } from "@/lib/spreadsheet/import-format-policy";
import { notify } from "@/lib/toast";
import ClientSearchPicker, {
  pickAgenceIdFromClient,
  pickProduitCodeFromClient,
  type ClientPickerRow,
} from "@/components/lonaci/client-search-picker";
import ProduitDocumentChecklistEditor from "@/components/lonaci/produit-document-checklist-editor";
import DossierDocumentChecklistBlock from "@/components/lonaci/dossier-document-checklist-block";
import DossierCompletIndicator from "@/components/lonaci/dossier-complet-indicator";
import { downloadLonaciPdf, openLonaciPdfInTab } from "@/lib/lonaci/download-pdf";
import { COURRIER_COMPTABILITE_TITLE } from "@/lib/lonaci/courrier-comptabilite-constants";
import { ContratEtatMensuelProduitAgenceMatrix } from "@/components/lonaci/contrat-etat-mensuel-produit-agence-matrix";
import {
  buildChecklistFromTemplate,
  mergeProductChecklistTemplates,
  parseDocumentChecklistPayload,
} from "@/lib/lonaci/produit-document-checklist";
import type { DossierDocumentChecklistPayload, ProduitDocument } from "@/lib/lonaci/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type OperationType = "NOUVEAU" | "ACTUALISATION";

type ClientOption = ClientPickerRow;

interface AgenceRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  /** Présent si l’API référentiel expose la zone (Abidjan / intérieur). */
  zoneGeographique?: "ABIDJAN" | "INTERIEUR";
}

function agenceOptionLabel(a: AgenceRef): string {
  const base = `${a.code} — ${a.libelle}`;
  if (a.zoneGeographique === "ABIDJAN") return `${base} · Abidjan`;
  if (a.zoneGeographique === "INTERIEUR") return `${base} · Intérieur`;
  return base;
}

interface ProduitRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  documentsChecklist?: Array<{ id: string; libelle: string; obligatoire?: boolean }>;
}

function produitsToDocumentRows(produits: ProduitRef[]): ProduitDocument[] {
  return produits.map((p) => ({
    code: p.code,
    libelle: p.libelle,
    actif: p.actif,
    documentsChecklist: p.documentsChecklist,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

function checklistToApiPatch(checklist: DossierDocumentChecklistPayload | null) {
  if (!checklist?.entries.length) return undefined;
  return checklist.entries.map((e) => ({ itemId: e.itemId, statut: e.statut }));
}

function uniqueOrderedProduitCodes(selected: string[]): string[] {
  const map = new Map<string, string>();
  for (const raw of selected) {
    const trimmed = raw.trim();
    const key = trimmed.toUpperCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, trimmed);
  }
  return [...map.values()];
}

interface ContratActif {
  id: string;
  reference: string;
  produitCode: string;
  status: string;
}

interface ContratListeItem {
  id: string;
  reference: string;
  concessionnaireId: string;
  codePdv: string;
  nomPdv: string;
  produitCode: string;
  operationType: string;
  status: string;
  dateEffet: string;
  dossierId: string;
  createdAt: string;
  updatedAt: string;
  /** Création du dossier source (ou date contrat si dossier introuvable). */
  dateDepot?: string;
  /** Statut workflow du dossier lié. */
  dossierEtape?: string;
  statutMetier?: ContratStatutMetier;
  statutMetierLabel?: string;
  statutMetierDescription?: string;
  hasDocumentChecklist?: boolean;
  checklistComplet?: boolean | null;
  cautionPaid?: boolean;
  dechargeDefinitiveEligible?: boolean;
  cautionPaymentReference?: string | null;
  hasContratGenere?: boolean;
  contratArchive?: boolean;
  annexeArchive?: boolean;
  annexeReference?: string | null;
  documentsAnnexeAttendus?: string[];
  contratsParProduit?: Array<{
    produitCode: string;
    produitLibelle: string;
    referenceContratPreview: string;
    referenceAnnexePreview: string;
    documentsAnnexeAttendus?: string[];
    hasContratGenere: boolean;
    contratArchive: boolean;
    annexeArchive: boolean;
  }>;
  clientFiche?: {
    code: string;
    categorie: string | null;
    nomComplet: string | null;
    raisonSociale: string;
    codeMachine: string | null;
    cniNumero: string | null;
    nomContact: string | null;
    email: string | null;
    telephone: string | null;
    adresse: string | null;
    ville: string | null;
    codePostal: string | null;
    typeDistributeur: string | null;
    nombreTpm: number | null;
    numeroDistributeur: string | null;
    numeroTpm: string | null;
    notes: string | null;
    produitsAutorises: string[];
    agenceId: string | null;
    agenceLabel?: string | null;
    statut: string;
  } | null;
  /** Ligne issue d’un dossier pas encore finalisé (pas de contrat Prisma). */
  isDossierPending?: boolean;
}

interface ToSignRow {
  dossierId: string;
  reference: string;
  concessionnaireId: string;
  produitCode: string;
  produitCodes?: string[];
  dateOperation: string;
  updatedAt: string;
}

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function labelOperationType(t: string) {
  if (t === "ACTUALISATION") return "Actualisation";
  if (t === "NOUVEAU") return "Nouveau";
  return t;
}

function labelDossierEtape(status: string) {
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
    default:
      return status;
  }
}

async function downloadContratsExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = [
    "concessionnaireId",
    "agenceId",
    "produitCode",
    "operationType",
    "dateOperation",
    "parentContratId",
    "observations",
  ];
  const sample = {
    concessionnaireId: "ID_CONCESSIONNAIRE",
    agenceId: "ID_AGENCE",
    produitCode: "LOTO",
    operationType: "NOUVEAU",
    dateOperation: new Date().toISOString(),
    parentContratId: "",
    observations: "Exemple import contrat",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "contrats");
  XLSX.writeFile(wb, "modele-contrats.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    concessionnaireId: (raw.concessionnaireId as string | null) ?? null,
    agenceId: (raw.agenceId as string | null) ?? null,
    produitCode: (raw.produitCode as string | null) ?? null,
    operationType: (raw.operationType as string | null) ?? "NOUVEAU",
    dateOperation: (raw.dateOperation as string | null) ?? null,
    parentContratId: (raw.parentContratId as string | null) ?? null,
    observations: (raw.observations as string | null) ?? null,
  });
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".csv")) return file;
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    assertExcelImportAllowed("CONTRATS");
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
    const dateOperationRaw = captureByAliases(source, ["date operation", "date", "date contrat"], "[0-9/\\- :tTzZ.+]{8,40}");
    const row = sanitize({
      concessionnaireId: captureByAliases(source, ["concessionnaire id", "pdv id", "id concessionnaire"], "[a-z0-9]{8,}"),
      agenceId: captureByAliases(source, ["agence id", "id agence"], "[a-z0-9]{8,}"),
      produitCode:
        captureByAliases(source, ["code produit", "produit", "product"], "[a-z0-9_ -]{2,20}")?.toUpperCase() ?? null,
      operationType:
        captureByAliases(source, ["type operation", "operation", "type"], "(nouveau|actualisation)")?.toUpperCase() ??
        "NOUVEAU",
      dateOperation: normalizeDateToIso(dateOperationRaw),
      parentContratId: captureByAliases(source, ["parent contrat id", "contrat parent", "id parent"], "[a-z0-9]{8,}"),
      observations: captureByAliases(source, ["observations", "observation", "commentaires", "commentaire"], "[^|;]{1,300}"),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporte. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

/** Actions exposées dans le tableau (alignées sur `/api/dossiers/[id]/transition`). */
type DossierWorkflowAction =
  | "SUBMIT"
  | "VALIDATE_N1"
  | "VALIDATE_N2"
  | "FINALIZE"
  | "REJECT"
  | "RETURN_PREVIOUS";

function workflowPrimaryAction(etape: string): {
  action: DossierWorkflowAction;
  label: string;
  labelBusy: string;
  confirmMessage: string;
  successMessage: string;
  ariaLabel: string;
  buttonClass: string;
} | null {
  const advance = workflowAdvanceLabel();
  const hierarchical = areWorkflowApprovalsEnabled();
  switch (etape) {
    case "BROUILLON":
      return {
        action: "SUBMIT",
        label: "Soumettre le dossier",
        labelBusy: "Soumission…",
        confirmMessage: hierarchical
          ? "Confirmer la soumission du dossier ? Il passera à l’étape « Soumis » et pourra être pris en charge pour la validation de niveau 1."
          : "Confirmer la soumission ? Le dossier sera validé automatiquement.",
        successMessage: hierarchical
          ? "Dossier soumis. Prochaine étape : validation de niveau 1."
          : "Dossier soumis et validé automatiquement.",
        ariaLabel: "Soumettre le dossier",
        buttonClass:
          "border border-slate-700 bg-slate-800 text-white hover:border-slate-900 hover:bg-slate-900",
      };
    case "SOUMIS":
      return {
        action: "VALIDATE_N1",
        label: hierarchical ? "Validation de niveau 1" : advance,
        labelBusy: hierarchical ? "Validation N1…" : `${advance}…`,
        confirmMessage: hierarchical
          ? "Confirmer la validation de niveau 1 ? Le dossier passera à l’étape « Validé N1 » (contrôle premier niveau)."
          : `Confirmer : ${advance} le dossier ?`,
        successMessage: hierarchical
          ? "Validation de niveau 1 effectuée. Le dossier est à l’étape Validé N1."
          : "Dossier avancé.",
        ariaLabel: hierarchical
          ? "Valider le dossier au niveau 1 (premier contrôle)"
          : `${advance} le dossier`,
        buttonClass: "border border-sky-600 bg-sky-600 text-white hover:border-sky-700 hover:bg-sky-700",
      };
    case "VALIDE_N1":
      return {
        action: "VALIDATE_N2",
        label: hierarchical ? "Validation de niveau 2" : advance,
        labelBusy: hierarchical ? "Validation N2…" : `${advance}…`,
        confirmMessage: hierarchical
          ? "Confirmer la validation de niveau 2 ? Le dossier passera à l’étape « Validé N2 » (contrôle second niveau)."
          : `Confirmer : ${advance} le dossier ?`,
        successMessage: hierarchical
          ? "Validation de niveau 2 effectuée. Le dossier est à l’étape Validé N2."
          : "Dossier avancé.",
        ariaLabel: hierarchical
          ? "Valider le dossier au niveau 2 (second contrôle)"
          : `${advance} le dossier`,
        buttonClass: "border border-sky-600 bg-sky-600 text-white hover:border-sky-700 hover:bg-sky-700",
      };
    case "VALIDE_N2":
      return {
        action: "FINALIZE",
        label: hierarchical ? "Finaliser le dossier" : advance,
        labelBusy: hierarchical ? "Finalisation…" : `${advance}…`,
        confirmMessage: hierarchical
          ? "Confirmer la finalisation du dossier ? Cette action crée le contrat actif et clôt le flux de validation."
          : `Confirmer : ${advance} le dossier ? Cette action crée le contrat actif.`,
        successMessage: "Dossier finalisé. Le contrat actif a été créé.",
        ariaLabel: hierarchical
          ? "Finaliser le dossier et créer le contrat actif"
          : `${advance} le dossier et créer le contrat actif`,
        buttonClass:
          "border border-emerald-700 bg-emerald-600 text-white hover:border-emerald-800 hover:bg-emerald-700",
      };
    default:
      return null;
  }
}

/** Au moins une action workflow pertinente à l'étape métier courante. */
function userCanOpenDossierDecisionModal(role: string | null, etape: string | null | undefined): boolean {
  return listDossierTransitionActionsForUi(role, etape).length > 0;
}

function dossierRecapPdfUrl(dossierId: string): string {
  return `/api/contrats/${encodeURIComponent(dossierId)}/export?view=1`;
}

function contratOfficielPdfUrl(dossierId: string, produitCode?: string): string {
  const q = new URLSearchParams({ view: "1" });
  if (produitCode?.trim()) q.set("produitCode", produitCode.trim().toUpperCase());
  return `/api/contrats/${encodeURIComponent(dossierId)}/contrat/pdf?${q}`;
}

function annexeOfficiellePdfUrl(dossierId: string, produitCode: string): string {
  const q = new URLSearchParams({ view: "1", produitCode: produitCode.trim().toUpperCase() });
  return `/api/contrats/${encodeURIComponent(dossierId)}/annexe/pdf?${q}`;
}

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

export default function ContratsPanel() {
  const searchParams = useSearchParams();
  const prefillLonaciClientId = searchParams.get("lonaciClientId") ?? searchParams.get("clientId") ?? "";
  const urlProduitCode = searchParams.get("produitCode")?.trim().toUpperCase() ?? "";
  const urlAgenceId = searchParams.get("agenceId")?.trim() ?? "";
  const urlStatus = searchParams.get("status")?.trim() ?? "";
  const urlDossierStatus = searchParams.get("dossierStatus")?.trim() ?? "";

  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState<string | null>(null);
  const [produits, setProduits] = useState<ProduitRef[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  /** Erreurs du formulaire « Nouveau contrat » : affichées dans la modale (les toasts passent sous le backdrop z-50). */
  const [createFormError, setCreateFormError] = useState<string | null>(null);

  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);

  const [formAgenceId, setFormAgenceId] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const [selectedProduitCodes, setSelectedProduitCodes] = useState<string[]>([]);
  const [dateOperation, setDateOperation] = useState("");
  const [operationType, setOperationType] = useState<OperationType>("NOUVEAU");
  const [parentContratId, setParentContratId] = useState("");
  const [observations, setObservations] = useState("");
  const [commune, setCommune] = useState("");
  const [quartier, setQuartier] = useState("");
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLng, setGpsLng] = useState("");
  const [statutBancarisation, setStatutBancarisation] =
    useState<BancarisationStatut>("NON_BANCARISE");
  const [compteBancaire, setCompteBancaire] = useState("");
  const [createChecklist, setCreateChecklist] = useState<DossierDocumentChecklistPayload | null>(null);

  const createChecklistObligatoires = useMemo(() => {
    if (!createChecklist?.entries.length) return { total: 0, fournis: 0, complet: true };
    const obligatoires = createChecklist.entries.filter((e) => e.obligatoire);
    const fournis = obligatoires.filter((e) => e.statut === "FOURNI").length;
    return {
      total: obligatoires.length,
      fournis,
      complet: obligatoires.length === 0 || fournis === obligatoires.length,
    };
  }, [createChecklist]);

  const [parentsActifs, setParentsActifs] = useState<ContratActif[]>([]);
  const [parentsLoading, setParentsLoading] = useState(false);
  /** Permet de relancer le chargement des contrats actifs sans changer le produit (le select ne refire pas si la valeur est identique). */
  const [parentsFetchTick, setParentsFetchTick] = useState(0);

  const [listPage, setListPage] = useState(1);
  const [listPageSize] = useState(100);
  const [listStatus, setListStatus] = useState<"" | "ACTIF" | "RESILIE">("");
  const [listProduit, setListProduit] = useState("");
  const [listAgenceId, setListAgenceId] = useState("");
  const [listMonthCurrent, setListMonthCurrent] = useState(false);
  const [listDateFrom, setListDateFrom] = useState("");
  const [listDateTo, setListDateTo] = useState("");
  const [listWorkflowStatus, setListWorkflowStatus] = useState<
    "" | "BROUILLON" | "SOUMIS" | "VALIDE_N1" | "VALIDE_N2" | "FINALISE" | "REJETE"
  >("");
  const [listRefQuery, setListRefQuery] = useState("");
  const [listRefDebounced, setListRefDebounced] = useState("");
  const [signingQueue, setSigningQueue] = useState<ToSignRow[]>([]);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [contratsListe, setContratsListe] = useState<ContratListeItem[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listReloadTick, setListReloadTick] = useState(0);

  const [dossierActionBusyId, setDossierActionBusyId] = useState<string | null>(null);
  const [signatureLinkBusyId, setSignatureLinkBusyId] = useState<string | null>(null);
  const [editContratOpen, setEditContratOpen] = useState(false);
  const [editContratId, setEditContratId] = useState<string | null>(null);
  const [editDateEffet, setEditDateEffet] = useState("");
  const [editStatus, setEditStatus] = useState<"ACTIF" | "RESILIE" | "CEDE">("ACTIF");
  const [editOperationType, setEditOperationType] = useState<"NOUVEAU" | "ACTUALISATION">("NOUVEAU");
  const [editSaving, setEditSaving] = useState(false);
  const [viewContratOpen, setViewContratOpen] = useState(false);
  const [viewContrat, setViewContrat] = useState<ContratListeItem | null>(null);

  const [checklistModalContrat, setChecklistModalContrat] = useState<ContratListeItem | null>(null);
  const [checklistModalPayload, setChecklistModalPayload] = useState<Record<string, unknown> | null>(null);
  const [checklistModalDossierStatus, setChecklistModalDossierStatus] = useState<string>("BROUILLON");
  const [checklistModalStatutMetier, setChecklistModalStatutMetier] = useState<ContratStatutMetier | undefined>();
  const [checklistModalStatutLabel, setChecklistModalStatutLabel] = useState<string | undefined>();
  const [checklistModalStatutDescription, setChecklistModalStatutDescription] = useState<string | undefined>();
  const [checklistModalCautionPaid, setChecklistModalCautionPaid] = useState<boolean | undefined>();
  const [checklistModalDechargeEligible, setChecklistModalDechargeEligible] = useState<boolean | undefined>();
  const [checklistModalPaymentRef, setChecklistModalPaymentRef] = useState<string | null | undefined>();
  const [checklistModalHasContratGenere, setChecklistModalHasContratGenere] = useState<boolean | undefined>();
  const [checklistModalContratArchive, setChecklistModalContratArchive] = useState<boolean | undefined>();
  const [checklistModalAnnexeArchive, setChecklistModalAnnexeArchive] = useState<boolean | undefined>();
  const [checklistModalContratsParProduit, setChecklistModalContratsParProduit] = useState<
    ContratListeItem["contratsParProduit"]
  >(undefined);
  const [checklistModalLoading, setChecklistModalLoading] = useState(false);

  useEffect(() => {
    if (urlProduitCode) setListProduit(urlProduitCode);
    if (urlAgenceId) setListAgenceId(urlAgenceId);
    if (urlStatus === "ACTIF" || urlStatus === "RESILIE") {
      setListStatus(urlStatus);
    }
    if (
      urlDossierStatus === "BROUILLON" ||
      urlDossierStatus === "SOUMIS" ||
      urlDossierStatus === "VALIDE_N1" ||
      urlDossierStatus === "VALIDE_N2" ||
      urlDossierStatus === "FINALISE" ||
      urlDossierStatus === "REJETE"
    ) {
      setListWorkflowStatus(urlDossierStatus);
    }
    // Intentionnellement au montage uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  type ContratsChartsRow = { produitCode: string; weekly: number; monthly: number };
  type PendingByLevelDto = { n1: number; n2: number; final: number };
  const [chartsLoading, setChartsLoading] = useState(true);
  const [chartsError, setChartsError] = useState<string | null>(null);
  const [chartsData, setChartsData] = useState<{
    totalsByProduct: ContratsChartsRow[];
    pendingByLevel: PendingByLevelDto;
    statusCounts: { actif: number; resile: number };
  } | null>(null);

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionDossierId, setDecisionDossierId] = useState<string | null>(null);
  const [decisionEtape, setDecisionEtape] = useState<string>("FINALISE");
  const [decisionMotif, setDecisionMotif] = useState("");
  const [transitionConfirmMessage, setTransitionConfirmMessage] = useState<string | null>(null);
  const transitionConfirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const agencesTriees = useMemo(
    () => [...agences].sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" })),
    [agences],
  );
  const produitsTries = useMemo(
    () => [...produits].sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" })),
    [produits],
  );

  const produitsPourSelect = useMemo(() => {
    if (!selectedClient) return produitsTries;
    const autorises = selectedClient.produitsAutorises ?? [];
    if (!autorises.length) return produitsTries;
    return produitsTries.filter((p) => produitAutorisePourConcessionnaire(autorises, p.code));
  }, [produitsTries, selectedClient]);

  const createProduitCodes = useMemo(() => {
    if (operationType === "ACTUALISATION") {
      const single = produitCode.trim();
      return single ? [single.toUpperCase()] : [];
    }
    return uniqueOrderedProduitCodes(selectedProduitCodes).map((c) => c.toUpperCase());
  }, [operationType, produitCode, selectedProduitCodes]);

  useEffect(() => {
    const t = window.setTimeout(() => setListRefDebounced(listRefQuery.trim()), 400);
    return () => window.clearTimeout(t);
  }, [listRefQuery]);

  useEffect(() => {
    setListPage(1);
  }, [listRefDebounced]);

  const buildContratsListFiltersParams = useCallback(() => {
    const params = new URLSearchParams();
    if (listStatus) params.set("status", listStatus);
    if (listProduit.trim()) params.set("produitCode", listProduit.trim().toUpperCase());
    if (listRefDebounced) params.set("q", listRefDebounced);
    if (listAgenceId.trim()) params.set("agenceId", listAgenceId.trim());
    if (listMonthCurrent) params.set("monthCurrent", "true");
    else {
      if (listDateFrom.trim()) {
        params.set("dateFrom", new Date(`${listDateFrom.trim()}T00:00:00`).toISOString());
      }
      if (listDateTo.trim()) {
        params.set("dateTo", new Date(`${listDateTo.trim()}T23:59:59.999`).toISOString());
      }
    }
    if (listWorkflowStatus) params.set("dossierStatus", listWorkflowStatus);
    return params;
  }, [
    listStatus,
    listProduit,
    listRefDebounced,
    listAgenceId,
    listMonthCurrent,
    listDateFrom,
    listDateTo,
    listWorkflowStatus,
  ]);

  useEffect(() => {
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
  }, []);

  const loadContratsListe = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const params = buildContratsListFiltersParams();
      params.set("page", String(listPage));
      params.set("pageSize", String(listPageSize));
      const res = await fetch(`/api/contrats?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement de la liste impossible.");
      }
      const data = (await res.json()) as {
        items: ContratListeItem[];
        total: number;
        page: number;
        pageSize: number;
        toSign?: ToSignRow[];
      };
      setContratsListe(data.items);
      setListTotal(data.total);
      if (Array.isArray(data.toSign)) setSigningQueue(data.toSign);
    } catch (e) {
      setContratsListe([]);
      setListTotal(0);
      setListError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setListLoading(false);
    }
  }, [
    listPage,
    listPageSize,
    listStatus,
    listProduit,
    listAgenceId,
    listMonthCurrent,
    listDateFrom,
    listDateTo,
    listWorkflowStatus,
    listRefDebounced,
    buildContratsListFiltersParams,
  ]);

  useEffect(() => {
    void loadContratsListe();
  }, [loadContratsListe, listReloadTick]);

  useEffect(() => {
    const onDataImported = () => {
      setListReloadTick((n) => n + 1);
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
  }, []);

  useEffect(() => {
    void (async () => {
      setChartsLoading(true);
      setChartsError(null);
      try {
        const params30d = new URLSearchParams({
          page: "1",
          pageSize: "1",
          monthCurrent: "true",
        });

        const res30d = await fetch(`/api/contrats?${params30d}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res30d.ok) {
          const body = (await res30d.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message ?? "Chargement graphiques impossible.");
        }
        const data30d = (await res30d.json()) as {
          totalsByProduct?: ContratsChartsRow[];
          pendingByLevel?: PendingByLevelDto;
          toSign?: ToSignRow[];
        };
        if (Array.isArray(data30d.toSign)) setSigningQueue(data30d.toSign);

        // Répartition ACTIF / RESILIE (scope et filtres serveur).
        const paramsActif = new URLSearchParams({ page: "1", pageSize: "1", status: "ACTIF" });
        const paramsResilie = new URLSearchParams({ page: "1", pageSize: "1", status: "RESILIE" });
        const [resActif, resResilie] = await Promise.all([
          fetch(`/api/contrats?${paramsActif}`, { credentials: "include", cache: "no-store" }),
          fetch(`/api/contrats?${paramsResilie}`, { credentials: "include", cache: "no-store" }),
        ]);

        const [dataActif, dataResilie] = await Promise.all([
          resActif.ok ? resActif.json() : Promise.resolve(null),
          resResilie.ok ? resResilie.json() : Promise.resolve(null),
        ]);

        const actif =
          typeof (dataActif as { total?: number } | null)?.total === "number"
            ? (dataActif as { total: number }).total
            : 0;
        const resile =
          typeof (dataResilie as { total?: number } | null)?.total === "number"
            ? (dataResilie as { total: number }).total
            : 0;

        setChartsData({
          totalsByProduct: data30d.totalsByProduct ?? [],
          pendingByLevel: data30d.pendingByLevel ?? { n1: 0, n2: 0, final: 0 },
          statusCounts: { actif, resile },
        });
      } catch (e) {
        setChartsError(e instanceof Error ? e.message : "Erreur chargement graphiques");
        setChartsData(null);
      } finally {
        setChartsLoading(false);
      }
    })();
  }, [listReloadTick]);

  const lonaciClientId = selectedClient?.id ?? "";

  useEffect(() => {
    void (async () => {
      try {
        setRefError(null);
        const refRes = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (refRes.ok) {
          const ref = (await refRes.json()) as { agences: AgenceRef[]; produits: ProduitRef[] };
          setAgences((ref.agences ?? []).filter((a) => a.actif));
          setProduits((ref.produits ?? []).filter((p) => p.actif));
        } else {
          setRefError("Référentiels indisponibles");
        }
      } catch (e) {
        setRefError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setRefLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    setCreateFormError(null);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setDateOperation(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    setObservations("");
    setCommune("");
    setQuartier("");
    setGpsLat("");
    setGpsLng("");
    setStatutBancarisation("NON_BANCARISE");
    setCompteBancaire("");
    setOperationType("NOUVEAU");
    setParentContratId("");
    setProduitCode("");
    setSelectedProduitCodes([]);
    if (!prefillLonaciClientId) {
      setSelectedClient(null);
      setFormAgenceId("");
    }
  }, [createOpen, prefillLonaciClientId]);

  useEffect(() => {
    if (!createOpen || !prefillLonaciClientId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${prefillLonaciClientId}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { client: ClientOption };
        const c = data.client as ClientOption;
        setSelectedClient(c);
        const agIds = agencesTriees.map((a) => a.id);
        setFormAgenceId(
          pickAgenceIdFromClient(c, agIds) || (typeof c.agenceId === "string" ? c.agenceId.trim() : "") || "",
        );
      } catch {
        /* ignore */
      }
    })();
  }, [createOpen, prefillLonaciClientId, agencesTriees]);

  useEffect(() => {
    if (operationType !== "ACTUALISATION" || !lonaciClientId || !produitCode.trim()) {
      setParentsActifs([]);
      return;
    }
    void (async () => {
      setParentsLoading(true);
      setParentsActifs([]);
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: "100",
          lonaciClientId,
          produitCode: produitCode.trim().toUpperCase(),
        });
        const res = await fetch(`/api/contrats?${params}`, { credentials: "include", cache: "no-store" });
        if (!res.ok) {
          setParentsActifs([]);
          return;
        }
        const data = (await res.json()) as { items: ContratActif[] };
        setParentsActifs(data.items.filter((c) => c.status === "ACTIF"));
      } finally {
        setParentsLoading(false);
      }
    })();
  }, [operationType, lonaciClientId, produitCode, parentsFetchTick]);

  useEffect(() => {
    if (operationType === "NOUVEAU") {
      setParentContratId("");
      return;
    }
    setParentContratId((prev) => {
      if (parentsActifs.length === 0) return "";
      if (prev && parentsActifs.some((c) => c.id === prev)) return prev;
      if (parentsActifs.length === 1) return parentsActifs[0].id;
      return "";
    });
  }, [operationType, parentsActifs]);

  useEffect(() => {
    if (!createOpen || createProduitCodes.length === 0) {
      setCreateChecklist(null);
      return;
    }
    const template = mergeProductChecklistTemplates(createProduitCodes, produitsToDocumentRows(produits));
    setCreateChecklist((prev) => buildChecklistFromTemplate(template, prev?.entries ?? null));
  }, [createOpen, createProduitCodes, produits]);

  useEffect(() => {
    if (!selectedClient) return;
    const allowed = selectedClient.produitsAutorises ?? [];
    if (operationType === "ACTUALISATION") {
      if (produitCode && !produitAutorisePourConcessionnaire(allowed, produitCode)) setProduitCode("");
      return;
    }
    setSelectedProduitCodes((prev) =>
      prev.filter((code) => !allowed.length || produitAutorisePourConcessionnaire(allowed, code)),
    );
  }, [selectedClient, produitCode, operationType]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateFormError(null);

    const fail = (message: string) => {
      setCreateFormError(message);
      notify.error(message);
    };

    if (!selectedClient) {
      fail("Sélectionnez un client dans le référentiel (cliquez un résultat sous la recherche).");
      return;
    }
    if (!formAgenceId.trim()) {
      fail("Sélectionnez l’agence.");
      return;
    }
    if (selectedClient.agenceId && formAgenceId !== selectedClient.agenceId) {
      fail("L’agence doit correspondre au rattachement du client sélectionné.");
      return;
    }
    if (!createProduitCodes.length) {
      fail(
        operationType === "ACTUALISATION"
          ? "Sélectionnez un produit."
          : "Cochez au moins un produit (un contrat et une annexe seront générés par produit).",
      );
      return;
    }
    const autorises = selectedClient.produitsAutorises ?? [];
    for (const code of createProduitCodes) {
      if (!produitAutorisePourConcessionnaire(autorises, code)) {
        fail(`Le produit ${code} n’est pas autorisé pour ce client.`);
        return;
      }
    }
    if (operationType === "ACTUALISATION" && !parentContratId.trim()) {
      fail("Sélectionnez le contrat d’origine (actif).");
      return;
    }
    if (createChecklist?.entries.length && !createChecklistObligatoires.complet) {
      fail(
        `Checklist incomplète : marquez toutes les pièces obligatoires comme « Fourni » (${createChecklistObligatoires.fournis}/${createChecklistObligatoires.total}).`,
      );
      return;
    }
    const d = new Date(`${dateOperation}T12:00:00`);
    if (Number.isNaN(d.getTime())) {
      fail("Date d’opération invalide.");
      return;
    }
    const la = Number(gpsLat.replace(",", "."));
    const lo = Number(gpsLng.replace(",", "."));
    const hasLat = Boolean(gpsLat.trim());
    const hasLng = Boolean(gpsLng.trim());
    if (hasLat !== hasLng || ((hasLat || hasLng) && (Number.isNaN(la) || Number.isNaN(lo)))) {
      fail("Renseignez latitude et longitude valides, ou laissez les deux champs vides.");
      return;
    }
    if (statutBancarisation === "BANCARISE" && !compteBancaire.trim()) {
      fail("Le numéro de compte est obligatoire pour passer au statut BANCARISÉ.");
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        lonaciClientId: selectedClient.id,
        agenceId: formAgenceId.trim(),
        operationType,
        dateOperation: d.toISOString(),
        observations: observations.trim() || null,
        commune: commune.trim() || null,
        quartier: quartier.trim() || null,
        gps: hasLat && hasLng ? { lat: la, lng: lo } : null,
        statutBancarisation,
        compteBancaire: compteBancaire.trim() || null,
      };
      if (operationType === "ACTUALISATION") {
        body.produitCode = createProduitCodes[0];
        body.parentContratId = parentContratId.trim();
      } else {
        body.produitCodes = createProduitCodes;
      }
      const checklistPatch = checklistToApiPatch(createChecklist);
      if (checklistPatch) {
        body.documentChecklist = checklistPatch;
      }
      const res = await fetch("/api/contrats", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = (await res.json().catch(() => null)) as {
        message?: string;
        code?: string;
        issues?: { path: (string | number)[]; message: string }[];
        checklistRequired?: boolean;
        submitted?: boolean;
        autoValidated?: boolean;
        finalized?: boolean;
        extended?: boolean;
        added?: boolean;
      } | null;
      if (!res.ok) {
        const zodDetail = resBody?.issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join(" — ");
        throw new Error(zodDetail || resBody?.code || resBody?.message || "Création impossible.");
      }
      setCreateFormError(null);
      setCreateOpen(false);
      setCreateChecklist(null);
      const n = createProduitCodes.length;
      const nLabel = `${n} produit${n > 1 ? "s" : ""}`;
      const validatedSuffix = resBody?.finalized
        ? "validé et finalisé automatiquement."
        : resBody?.autoValidated
          ? "validé automatiquement."
          : resBody?.submitted
            ? "soumis."
            : null;
      const successMsg = resBody?.extended
        ? resBody.added
          ? validatedSuffix
            ? `Produit(s) ajouté(s) au dossier existant (${nLabel} au total) et ${validatedSuffix}`
            : "Produit(s) ajouté(s) au dossier existant (brouillon). Complétez la checklist puis soumettez."
          : "Ces produits sont déjà sur le dossier ouvert du client — complétez-le depuis le tableau."
        : validatedSuffix
          ? `Dossier contrat créé (${nLabel} — un contrat et une annexe par produit) et ${validatedSuffix}`
          : resBody?.checklistRequired
            ? `Dossier créé en brouillon pour ${nLabel}. Complétez la checklist documents puis soumettez-le.`
            : `Dossier contrat créé en brouillon (${nLabel}). Soumettez-le depuis le tableau pour le faire avancer.`;
      notify.success(successMsg);
      window.dispatchEvent(new Event("lonaci:data-imported"));
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setCreateFormError(message);
      notify.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function onImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const source = e.target.files?.[0];
    if (!source) return;
    setImportingFile(true);
    setCreateFormError(null);
    try {
      const file = await normalizeImportFileForApi(source);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("collection", "dossiers");
      fd.set("mode", "insert");

      const res = await fetch("/api/import-data", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { message?: string; inserted?: number; skippedExistingDuplicates?: number }
        | null;
      if (!res.ok) throw new Error(data?.message ?? "Import impossible");

      window.dispatchEvent(new Event("lonaci:data-imported"));
      notify.success(
        `Import contrats terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s).`,
      );
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Import impossible");
      setCreateFormError(message);
      notify.error(message);
    } finally {
      setImportingFile(false);
      e.target.value = "";
    }
  }

  async function transitionDossierRow(
    dossierId: string,
    payload: {
      action: DossierWorkflowAction;
      confirmMessage: string;
      successMessage: string;
      comment?: string;
    },
  ) {
    const confirmed = await new Promise<boolean>((resolve) => {
      transitionConfirmResolverRef.current = resolve;
      setTransitionConfirmMessage(payload.confirmMessage);
    });
    if (!confirmed) return false;

    setDossierActionBusyId(dossierId);
    try {
      const body: { action: DossierWorkflowAction; comment?: string | null } = {
        action: payload.action,
      };
      if (payload.comment !== undefined) {
        body.comment = payload.comment;
      }
      const res = await fetch(`/api/dossiers/${encodeURIComponent(dossierId)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Validation impossible.");
      }

      notify.success(payload.successMessage);
      window.dispatchEvent(new Event("lonaci:data-imported"));
      closeDecision();
      return true;
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur"));
      return false;
    } finally {
      setDossierActionBusyId(null);
    }
  }

  function resolveTransitionConfirmation(confirmed: boolean) {
    const resolve = transitionConfirmResolverRef.current;
    transitionConfirmResolverRef.current = null;
    setTransitionConfirmMessage(null);
    resolve?.(confirmed);
  }

  async function generateClientSignatureLink(dossierId: string) {
    setSignatureLinkBusyId(dossierId);
    try {
      const res = await fetch(`/api/dossiers/${encodeURIComponent(dossierId)}/signature-link`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => null)) as
        | { message?: string; link?: { url?: string } }
        | null;
      if (!res.ok) {
        throw new Error(payload?.message ?? "Génération du lien impossible.");
      }

      const url = payload?.link?.url;
      if (!url) {
        throw new Error("Lien de signature introuvable.");
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        notify.success("Lien de signature copié dans le presse-papiers.");
      } else {
        notify.info(`Lien de signature: ${url}`);
      }
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur"));
    } finally {
      setSignatureLinkBusyId(null);
    }
  }

  function openDecision(dossierId: string, etape: string) {
    setDecisionDossierId(dossierId);
    setDecisionEtape(etape);
    setDecisionMotif("");
    setDecisionOpen(true);
  }

  function closeDecision() {
    setDecisionOpen(false);
    setDecisionDossierId(null);
    setDecisionMotif("");
  }

  async function decideApprouver() {
    if (!decisionDossierId) return;
    const primary = workflowPrimaryAction(decisionEtape);
    if (!primary) return;

    const ok = await transitionDossierRow(decisionDossierId, {
      action: primary.action,
      confirmMessage: primary.confirmMessage,
      successMessage: primary.successMessage,
    });
    if (!ok) return;
  }

  async function decideRejeter() {
    if (!decisionDossierId) return;
    const motif = decisionMotif.trim();
    if (!motif) {
      notify.error("Le motif est obligatoire pour rejeter.");
      return;
    }

    const ok = await transitionDossierRow(decisionDossierId, {
      action: "REJECT",
      comment: motif,
      confirmMessage:
        "Confirmer le rejet du dossier ? Le dossier repassera à l’étape « Brouillon ».",
      successMessage: "Dossier rejeté (retour brouillon).",
    });
    if (!ok) return;
  }

  async function decideRetourner() {
    if (!decisionDossierId) return;
    const motif = decisionMotif.trim();
    if (!motif) {
      notify.error("Le motif est obligatoire pour retourner pour correction.");
      return;
    }

    const ok = await transitionDossierRow(decisionDossierId, {
      action: "RETURN_PREVIOUS",
      comment: motif,
      confirmMessage:
        "Confirmer le retour pour correction ? Le dossier reviendra à l’étape précédente.",
      successMessage: "Retour pour correction effectué.",
    });
    if (!ok) return;
  }

  function openEditContrat(contrat: ContratListeItem) {
    const isoDay = (() => {
      const d = new Date(contrat.dateEffet);
      if (Number.isNaN(d.getTime())) return "";
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    setEditContratId(contrat.id);
    setEditDateEffet(isoDay);
    setEditStatus((contrat.status as "ACTIF" | "RESILIE" | "CEDE") ?? "ACTIF");
    setEditOperationType((contrat.operationType as "NOUVEAU" | "ACTUALISATION") ?? "NOUVEAU");
    setEditContratOpen(true);
  }

  function closeEditContrat() {
    if (editSaving) return;
    setEditContratOpen(false);
    setEditContratId(null);
    setEditDateEffet("");
    setEditStatus("ACTIF");
    setEditOperationType("NOUVEAU");
  }

  function openViewContrat(contrat: ContratListeItem) {
    setViewContrat(contrat);
    setViewContratOpen(true);
  }

  function closeViewContrat() {
    setViewContratOpen(false);
    setViewContrat(null);
  }

  async function openDossierRecapPdf(dossierId: string) {
    try {
      await openLonaciPdfInTab(dossierRecapPdfUrl(dossierId));
    } catch (err) {
      notify.error(
        friendlyErrorMessage(err instanceof Error ? err.message : "PDF récapitulatif indisponible."),
      );
    }
  }

  async function openContratOfficielPdf(dossierId: string, produitCode?: string) {
    try {
      await openLonaciPdfInTab(contratOfficielPdfUrl(dossierId, produitCode));
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "PDF contrat indisponible."));
    }
  }

  async function openAnnexeOfficiellePdf(dossierId: string, produitCode: string) {
    try {
      await openLonaciPdfInTab(annexeOfficiellePdfUrl(dossierId, produitCode));
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "PDF annexe indisponible."));
    }
  }

  async function openChecklistModal(contrat: ContratListeItem) {
    setChecklistModalContrat(contrat);
    setChecklistModalPayload(null);
    setChecklistModalLoading(true);
    try {
      const res = await fetch(`/api/dossiers/${encodeURIComponent(contrat.dossierId)}`, {
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        dossier?: {
          payload?: Record<string, unknown>;
          status?: string;
          statutMetier?: ContratStatutMetier;
          statutMetierLabel?: string;
          statutMetierDescription?: string;
          cautionPaid?: boolean;
          dechargeDefinitiveEligible?: boolean;
          cautionPaymentReference?: string | null;
          hasContratGenere?: boolean;
          contratArchive?: boolean;
          annexeArchive?: boolean;
          contratsParProduit?: ContratListeItem["contratsParProduit"];
        };
      } | null;
      if (!res.ok || !body?.dossier) {
        notify.error(friendlyErrorMessage(body?.message ?? "Chargement de la checklist impossible."));
        setChecklistModalContrat(null);
        return;
      }
      setChecklistModalPayload(body.dossier.payload ?? {});
      setChecklistModalDossierStatus(body.dossier.status ?? "BROUILLON");
      setChecklistModalStatutMetier(body.dossier.statutMetier);
      setChecklistModalStatutLabel(body.dossier.statutMetierLabel);
      setChecklistModalStatutDescription(body.dossier.statutMetierDescription);
      setChecklistModalCautionPaid(body.dossier.cautionPaid);
      setChecklistModalDechargeEligible(body.dossier.dechargeDefinitiveEligible);
      setChecklistModalPaymentRef(body.dossier.cautionPaymentReference ?? null);
      setChecklistModalHasContratGenere(body.dossier.hasContratGenere);
      setChecklistModalContratArchive(body.dossier.contratArchive);
      setChecklistModalAnnexeArchive(body.dossier.annexeArchive);
      setChecklistModalContratsParProduit(body.dossier.contratsParProduit);
    } catch {
      notify.error("Erreur réseau lors du chargement de la checklist.");
      setChecklistModalContrat(null);
    } finally {
      setChecklistModalLoading(false);
    }
  }

  function closeChecklistModal() {
    setChecklistModalContrat(null);
    setChecklistModalPayload(null);
    setChecklistModalCautionPaid(undefined);
    setChecklistModalDechargeEligible(undefined);
    setChecklistModalPaymentRef(undefined);
    setChecklistModalHasContratGenere(undefined);
    setChecklistModalContratArchive(undefined);
    setChecklistModalAnnexeArchive(undefined);
    setChecklistModalContratsParProduit(undefined);
  }

  function syncContratChecklistInList(dossierId: string, patch: { payload: Record<string, unknown> }) {
    const checklist = parseDocumentChecklistPayload(patch.payload);
    const hasDocumentChecklist = Boolean(checklist?.entries.length);
    const checklistComplet = hasDocumentChecklist ? checklist!.complet : null;
    setContratsListe((prev) =>
      prev.map((item) =>
        item.dossierId === dossierId
          ? { ...item, hasDocumentChecklist, checklistComplet }
          : item,
      ),
    );
    if (viewContrat?.dossierId === dossierId) {
      setViewContrat((prev) =>
        prev ? { ...prev, hasDocumentChecklist, checklistComplet } : prev,
      );
    }
  }

  async function saveEditContrat() {
    if (!editContratId) return;
    const raw = editDateEffet.trim();
    if (!raw) {
      notify.error("La date d'effet est obligatoire.");
      return;
    }
    const date = new Date(`${raw}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      notify.error("Date d'effet invalide.");
      return;
    }

    setEditSaving(true);
    try {
      const res = await fetch(`/api/contrats/${encodeURIComponent(editContratId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateEffet: date.toISOString(),
          status: editStatus,
          operationType: editOperationType,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        throw new Error(body?.message ?? "Modification contrat impossible.");
      }
      notify.success("Contrat modifié avec succès.");
      window.dispatchEvent(new Event("lonaci:data-imported"));
      closeEditContrat();
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur"));
    } finally {
      setEditSaving(false);
    }
  }

  const decisionPrimary = workflowPrimaryAction(decisionEtape);
  const hideN1N2ForAdmin =
    meRole === "CHEF_SERVICE" &&
    decisionPrimary !== null &&
    hideDossierN1N2ForChefService(meRole, decisionPrimary.action as DossierTransitionAction);
  const mayApprouverDossier = userCanApproveDossierAtEtape(meRole, decisionEtape);
  const mayRejectDossier = userCanPerformDossierTransitionAtEtape(meRole, decisionEtape, "REJECT");
  const mayReturnDossier = userCanPerformDossierTransitionAtEtape(meRole, decisionEtape, "RETURN_PREVIOUS");

  /** Un valideur ne voit que sa file ; l’agent conserve le suivi complet. */
  const pipelineLevels = useMemo(() => {
    switch (meRole) {
      case "CHEF_SECTION":
        return { showN1: true, showN2: false, showFinal: false };
      case "ASSIST_CDS":
        return { showN1: false, showN2: true, showFinal: false };
      case "CHEF_SERVICE":
        return { showN1: false, showN2: false, showFinal: true };
      default:
        return { showN1: true, showN2: true, showFinal: true };
    }
  }, [meRole]);

  const contractsKpis = useMemo(() => {
    if (!chartsData) {
      return {
        weekly: 0,
        monthly: 0,
        velocityPct: 0,
        pendingTotal: 0,
        pendingN1: 0,
        pendingN2: 0,
        pendingFinal: 0,
        activeRate: 0,
        showN1: pipelineLevels.showN1,
        showN2: pipelineLevels.showN2,
        showFinal: pipelineLevels.showFinal,
      };
    }
    const totals = chartsData.totalsByProduct ?? [];
    const weekly = totals.reduce((acc, row) => acc + (row.weekly ?? 0), 0);
    const monthly = totals.reduce((acc, row) => acc + (row.monthly ?? 0), 0);
    const p = chartsData.pendingByLevel ?? { n1: 0, n2: 0, final: 0 };
    const pendingN1 = p.n1 ?? 0;
    const pendingN2 = p.n2 ?? 0;
    const pendingFinal = p.final ?? 0;
    const showN1 = pipelineLevels.showN1;
    const showN2 = pipelineLevels.showN2;
    const showFinal = pipelineLevels.showFinal;
    const pendingTotal =
      (showN1 ? pendingN1 : 0) + (showN2 ? pendingN2 : 0) + (showFinal ? pendingFinal : 0);
    const active = chartsData.statusCounts?.actif ?? 0;
    const resile = chartsData.statusCounts?.resile ?? 0;
    const totalStatuses = active + resile;
    return {
      weekly,
      monthly,
      velocityPct: monthly > 0 ? Math.round((weekly / monthly) * 100) : 0,
      pendingTotal,
      pendingN1,
      pendingN2,
      pendingFinal,
      activeRate: totalStatuses > 0 ? Math.round((active / totalStatuses) * 100) : 0,
      showN1,
      showN2,
      showFinal,
    };
  }, [chartsData, pipelineLevels]);

  const dossierEtapeFilterOptions = useMemo(() => {
    const labels: Record<string, string> = {
      BROUILLON: "Brouillon",
      SOUMIS: "Soumis (att. N1)",
      VALIDE_N1: "Validé N1 (att. N2)",
      VALIDE_N2: "Validé N2 (à finaliser)",
      FINALISE: "Finalisé",
      REJETE: "Rejeté",
    };
    const role = (meRole ?? "AGENT") as LonaciRole;
    const statuses = getRoleWorkflowFilterStatuses("DOSSIERS", role);
    return statuses.map((value) => ({
      value,
      label: labels[value] ?? value,
    }));
  }, [meRole]);

  useEffect(() => {
    if (!listWorkflowStatus) return;
    if (dossierEtapeFilterOptions.some((opt) => opt.value === listWorkflowStatus)) return;
    setListWorkflowStatus("");
  }, [dossierEtapeFilterOptions, listWorkflowStatus]);

  const portfolioTotal = (chartsData?.statusCounts.actif ?? 0) + (chartsData?.statusCounts.resile ?? 0);
  const activeCount = chartsData?.statusCounts.actif ?? 0;
  const resileCount = chartsData?.statusCounts.resile ?? 0;
  const activeRatio = portfolioTotal > 0 ? Math.round((activeCount / portfolioTotal) * 100) : 0;
  const resileRatio = portfolioTotal > 0 ? Math.round((resileCount / portfolioTotal) * 100) : 0;
  const listPageCount = Math.max(1, Math.ceil(listTotal / listPageSize));
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        eyebrow="Référentiel"
        title="Contrats"
        description="Supervision des dossiers contrats, validation multi-étapes et export opérationnel."
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={Download}
              onClick={() => window.location.assign("/api/contrats/export?format=excel")}
            >
              Export Excel
            </Button>
            <Button leadingIcon={FilePlus2} onClick={() => setCreateOpen(true)} disabled={refLoading}>
              Nouveau contrat
            </Button>
          </>
        }
      />

      <Surface padding="none" elevated className="mt-6 overflow-hidden">
        <div className="relative border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 px-4 py-4 sm:px-5">
          <div className="pointer-events-none absolute -right-12 -top-10 h-36 w-36 rounded-full bg-cyan-400/20 blur-2xl" />
          <h3 className="relative text-sm font-semibold text-white">Pilotage contrats</h3>
          <p className="relative mt-0.5 text-xs text-cyan-100/90">
            Vue executive sans graphiques : volumes, pipeline de validation et portefeuille.
          </p>
        </div>

        {chartsError ? (
          <FeedbackState
            title="Indicateurs indisponibles"
            description={chartsError}
            tone="danger"
            className="m-4"
            aria-live="assertive"
          />
        ) : null}

        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4">
            <div className="text-[11px] uppercase tracking-wide text-cyan-700">Volume mensuel</div>
            <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{contractsKpis.monthly}</div>
            <div className="text-[11px] text-slate-600">Contrats sur 30 jours</div>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
            <div className="text-[11px] uppercase tracking-wide text-indigo-700">Volume hebdo</div>
            <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{contractsKpis.weekly}</div>
            <div className="text-[11px] text-slate-600">Contrats sur 7 jours</div>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-4">
            <div className="text-[11px] uppercase tracking-wide text-violet-700">Vélocité</div>
            <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{contractsKpis.velocityPct}%</div>
            <div className="text-[11px] text-slate-600">7j vs 30j</div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
            <div className="text-[11px] uppercase tracking-wide text-amber-700">En attente</div>
            <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{contractsKpis.pendingTotal}</div>
            <div className="text-[11px] text-slate-600">
              {pipelineLevels.showN1 && pipelineLevels.showN2 && pipelineLevels.showFinal
                ? "Toutes étapes cumulées"
                : "Votre file active"}
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Pipeline de validation</h4>
            <div className="mt-3 space-y-3">
              {contractsKpis.showN1 ? (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                    <span>Soumis (N1)</span>
                    <span className="font-semibold text-slate-900">{contractsKpis.pendingN1}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-sky-500"
                      style={{
                        width: `${contractsKpis.pendingTotal > 0 ? Math.max(8, Math.round((contractsKpis.pendingN1 / contractsKpis.pendingTotal) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
              {contractsKpis.showN2 ? (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                    <span>Validé N1 (att. N2)</span>
                    <span className="font-semibold text-slate-900">{contractsKpis.pendingN2}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-violet-500"
                      style={{
                        width: `${contractsKpis.pendingTotal > 0 ? Math.max(8, Math.round((contractsKpis.pendingN2 / contractsKpis.pendingTotal) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
              {contractsKpis.showFinal ? (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                    <span>Validé N2 (à finaliser)</span>
                    <span className="font-semibold text-slate-900">{contractsKpis.pendingFinal}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{
                        width: `${contractsKpis.pendingTotal > 0 ? Math.max(8, Math.round((contractsKpis.pendingFinal / contractsKpis.pendingTotal) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Portefeuille contrats</h4>
            {chartsLoading ? (
              <Skeleton lines={3} className="mt-3" />
            ) : (
              <>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-[11px] text-emerald-800">Actifs</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-950">{activeCount}</p>
                    <p className="text-[11px] text-emerald-800">{activeRatio}%</p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="text-[11px] text-rose-800">Résiliés</p>
                    <p className="mt-1 text-2xl font-bold text-rose-950">{resileCount}</p>
                    <p className="text-[11px] text-rose-800">{resileRatio}%</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  Portefeuille total : <span className="font-semibold text-slate-900">{portfolioTotal}</span>
                </p>
              </>
            )}
          </article>
        </div>

        <div className="border-t border-slate-100 p-4 sm:p-5">
          <ContratEtatMensuelProduitAgenceMatrix domIdPrefix="contrats-etat-matrix" months={12} />
        </div>
      </Surface>

      {meRole === "CHEF_SERVICE" ? (
        <Card padding="none" elevated className="overflow-hidden border-violet-200 bg-violet-50/40">
          <div className="border-b border-violet-200/90 px-4 py-3 sm:px-5">
            <h3 className="text-sm font-semibold text-violet-950">Dossiers à finaliser (signature / création contrat)</h3>
            <p className="mt-0.5 text-xs text-violet-900/85">
              Liste des dossiers au statut « Validé N2 » — étape avant finalisation. Export PDF du récapitulatif par ligne.
            </p>
          </div>
          <div className="overflow-x-auto p-2 sm:p-4">
            {signingQueue.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <p className="text-sm font-medium text-violet-900/80">Aucun dossier en attente de finalisation.</p>
                <p className="mt-1 text-xs text-violet-800/70">La file de signature est vide pour le moment.</p>
              </div>
            ) : (
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <caption className="sr-only">Dossiers contrats en attente de finalisation et de signature</caption>
                <thead>
                  <tr className="border-b border-violet-200/80 text-[11px] font-semibold uppercase tracking-wide text-violet-900/80">
                    <th scope="col" className="px-3 py-2">Réf. dossier</th>
                    <th scope="col" className="px-3 py-2">Produit</th>
                    <th scope="col" className="px-3 py-2">Date op.</th>
                    <th scope="col" className="px-3 py-2">MAJ</th>
                    <th scope="col" className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {signingQueue.map((row) => {
                    const codes =
                      row.produitCodes && row.produitCodes.length > 0
                        ? row.produitCodes
                        : row.produitCode
                          ? [row.produitCode]
                          : [];
                    return (
                    <tr key={row.dossierId} className="border-b border-violet-100/80">
                      <td className="px-3 py-2 font-mono text-xs text-violet-950">{row.reference}</td>
                      <td className="px-3 py-2 text-xs">
                        {codes.length ? (
                          <div className="flex flex-col gap-1">
                            {codes.map((code) => (
                              <span key={code} className="font-mono text-xs text-violet-950">
                                {code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">{formatShortDate(row.dateOperation)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {new Date(row.updatedAt).toLocaleString("fr-FR")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href={`/dossiers#dossier-${row.dossierId}`}
                            className="text-xs font-medium text-violet-800 underline hover:text-violet-950"
                          >
                            Dossiers
                          </Link>
                          <button
                            type="button"
                            onClick={() => void openDossierRecapPdf(row.dossierId)}
                            className="text-xs font-medium text-violet-800 underline hover:text-violet-950"
                          >
                            Récap.
                          </button>
                          {codes.map((code) => (
                            <span key={`${row.dossierId}-${code}-docs`} className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => void openContratOfficielPdf(row.dossierId, code)}
                                className="text-xs font-medium text-violet-800 underline hover:text-violet-950"
                              >
                                Contrat {code}
                              </button>
                              <button
                                type="button"
                                onClick={() => void openAnnexeOfficiellePdf(row.dossierId, code)}
                                className="text-xs font-medium text-violet-800 underline hover:text-violet-950"
                              >
                                Annexe {code}
                              </button>
                            </span>
                          ))}
                          <button
                            type="button"
                            onClick={() => void generateClientSignatureLink(row.dossierId)}
                            disabled={signatureLinkBusyId === row.dossierId}
                            className="text-xs font-medium text-violet-800 underline hover:text-violet-950 disabled:opacity-60"
                          >
                            {signatureLinkBusyId === row.dossierId ? "Lien..." : "Lien signature client"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      ) : null}

      <Surface padding="none" elevated className="overflow-hidden">
        <SectionHeader
          className="border-b border-slate-200 px-4 py-3 sm:px-5"
          title="Registre des contrats"
          description={
            <>
            Filtres produit, agence, statut contrat, période (mois en cours sur la date d’effet ou plage), étape du dossier
            lié. Les dossiers en cours (soumis, etc.) apparaissent ici ; le contrat Prisma est créé à la finalisation.
            Périmètre agence appliqué côté serveur.
            </>
          }
        />

        <FilterBar
          className="border-b border-slate-100"
          search={{
            value: listRefQuery,
            onChange: setListRefQuery,
            label: "Filtrer par référence",
            placeholder: "Référence du contrat…",
          }}
          filters={<div className="contents">
          <label className="grid w-full min-w-0 gap-1 sm:w-auto sm:min-w-[140px] sm:max-w-[200px]">
            <span className="text-[11px] font-medium text-slate-600">Produit</span>
            <select
              value={listProduit}
              onChange={(e) => {
                setListProduit(e.target.value);
                setListPage(1);
              }}
              className={inputClass}
            >
              <option value="">Tous</option>
              {produitsTries.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="grid w-full min-w-0 gap-1 sm:w-auto sm:min-w-[120px] sm:max-w-[160px]">
            <span className="text-[11px] font-medium text-slate-600">Statut</span>
            <select
              value={listStatus}
              onChange={(e) => {
                setListStatus(e.target.value as "" | "ACTIF" | "RESILIE");
                setListPage(1);
              }}
              className={inputClass}
            >
              <option value="">Tous</option>
              <option value="ACTIF">Actif</option>
              <option value="RESILIE">Résilié</option>
            </select>
          </label>
          <label className="grid w-full min-w-0 gap-1 sm:w-auto sm:min-w-[160px] sm:max-w-[220px]">
            <span className="text-[11px] font-medium text-slate-600">Agence</span>
            <select
              value={listAgenceId}
              onChange={(e) => {
                setListAgenceId(e.target.value);
                setListPage(1);
              }}
              className={inputClass}
            >
              <option value="">Toutes</option>
              {agencesTriees.map((a) => (
                <option key={a.id} value={a.id}>
                  {agenceOptionLabel(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 pt-5 sm:pt-6">
            <input
              type="checkbox"
              checked={listMonthCurrent}
              onChange={(e) => {
                setListMonthCurrent(e.target.checked);
                if (e.target.checked) {
                  setListDateFrom("");
                  setListDateTo("");
                }
                setListPage(1);
              }}
              className="rounded border-slate-300"
            />
            <span className="text-[11px] font-medium text-slate-600">Mois en cours (date d’effet)</span>
          </label>
          <label className="grid w-full min-w-0 gap-1 sm:w-auto sm:min-w-[130px] sm:max-w-[150px]">
            <span className="text-[11px] font-medium text-slate-600">Effet du</span>
            <input
              type="date"
              value={listDateFrom}
              disabled={listMonthCurrent}
              onChange={(e) => {
                setListDateFrom(e.target.value);
                setListPage(1);
              }}
              className={inputClass}
            />
          </label>
          <label className="grid w-full min-w-0 gap-1 sm:w-auto sm:min-w-[130px] sm:max-w-[150px]">
            <span className="text-[11px] font-medium text-slate-600">Effet au</span>
            <input
              type="date"
              value={listDateTo}
              disabled={listMonthCurrent}
              onChange={(e) => {
                setListDateTo(e.target.value);
                setListPage(1);
              }}
              className={inputClass}
            />
          </label>
          <label className="grid w-full min-w-0 gap-1 sm:w-auto sm:min-w-[140px] sm:max-w-[200px]">
            <span className="text-[11px] font-medium text-slate-600">Étape dossier lié</span>
            <select
              value={listWorkflowStatus}
              onChange={(e) => {
                setListWorkflowStatus(
                  e.target.value as
                    | ""
                    | "BROUILLON"
                    | "SOUMIS"
                    | "VALIDE_N1"
                    | "VALIDE_N2"
                    | "FINALISE"
                    | "REJETE",
                );
                setListPage(1);
              }}
              className={inputClass}
            >
              <option value="">Toutes</option>
              {dossierEtapeFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          </div>}
          actions={
            <Button
              size="sm"
              leadingIcon={RefreshCw}
              onClick={() => window.dispatchEvent(new Event("lonaci:data-imported"))}
            >
              Actualiser
            </Button>
          }
        />

        <div className="p-2 sm:p-0">
          {listError ? (
            <FeedbackState
              title="Chargement impossible"
              description={listError}
              tone="danger"
              className="m-4"
              aria-live="assertive"
            />
          ) : null}
          {listLoading ? (
            <div className="px-4 py-6 sm:px-5">
              <Skeleton lines={4} />
            </div>
          ) : !listError && contratsListe.length === 0 ? (
            <div className="px-4 py-8 text-center sm:px-5">
              <p className="text-sm font-medium text-slate-700">Aucun contrat ne correspond aux critères.</p>
              <p className="mt-1 text-xs text-slate-500">
                Les dossiers soumis apparaissent ici avant finalisation. Vérifiez les filtres (statut Actif/Résilié,
                mois en cours, étape) puis cliquez sur « Actualiser ».
              </p>
            </div>
          ) : (
            <div className="w-full overflow-hidden rounded-b-2xl">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <caption className="sr-only">Registre des contrats selon les filtres actifs</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/90 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <th scope="col" className="px-3 py-2.5 sm:px-4">Réf.</th>
                    <th scope="col" className="px-3 py-2.5 sm:px-4">Client</th>
                    <th scope="col" className="px-3 py-2.5 sm:px-4">Type</th>
                    <th scope="col" className="px-3 py-2.5 sm:px-4">Date dépôt</th>
                    <th scope="col" className="px-3 py-2.5 sm:px-4">Statut</th>
                    <th scope="col" className="px-3 py-2.5 sm:px-4">Dossier</th>
                    <th scope="col" className="px-3 py-2.5 text-right sm:px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {contratsListe.map((c) => {
                    const etape = c.dossierEtape ?? null;
                    const statutLabel = c.statutMetierLabel ?? c.status;
                    const statutDescription = c.statutMetierDescription ?? "";
                    const statutBadgeClass = c.statutMetier
                      ? contratStatutMetierBadgeClass(c.statutMetier)
                      : "bg-slate-200 text-slate-800";
                    const workflowPrimary = etape ? workflowPrimaryAction(etape) : null;
                    const canApproveDossier = userCanApproveDossierAtEtape(meRole, etape);
                    const canDecideDossier = userCanOpenDossierDecisionModal(meRole, etape);
                    return (
                      <tr key={c.id} className="border-b border-slate-100 align-top transition-colors duration-150 hover:bg-cyan-50/60">
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-900 sm:px-4" title={c.reference}>
                          <div>{c.reference}</div>
                          {c.annexeReference ? (
                            <div className="mt-0.5 font-sans text-[10px] text-violet-800" title="Annexe associée">
                              Annexe : <span className="font-mono">{c.annexeReference}</span>
                            </div>
                          ) : null}
                          {(c.documentsAnnexeAttendus?.length ?? 0) > 0 ? (
                            <div
                              className="mt-0.5 font-sans text-[10px] text-slate-500"
                              title={c.documentsAnnexeAttendus!.join(", ")}
                            >
                              {c.documentsAnnexeAttendus!.length} doc. annexe
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 sm:px-4" title={c.nomPdv || "—"}>
                          {c.nomPdv || "—"}
                        </td>
                        <td className="px-3 py-2.5 sm:px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-slate-800">{labelOperationType(c.operationType)}</span>
                            <span className="font-mono text-[11px] text-slate-500">{c.produitCode}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 sm:px-4">
                          {formatShortDate(c.dateDepot ?? c.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-800 sm:px-4">
                          <StatusBadge
                            title={statutDescription}
                            className={`inline-flex max-w-[11rem] rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight ${statutBadgeClass}`}
                          >
                            {statutLabel}
                          </StatusBadge>
                        </td>
                        <td className="px-3 py-2.5 sm:px-4">
                          {c.hasDocumentChecklist ? (
                            <DossierCompletIndicator
                              complet={c.checklistComplet === true}
                              size="sm"
                              live
                            />
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right sm:px-4">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            {c.hasDocumentChecklist ? (
                              <button
                                type="button"
                                onClick={() => void openChecklistModal(c)}
                                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                              >
                                Checklist
                              </button>
                            ) : null}
                            {c.dechargeDefinitiveEligible ? (
                              <button
                                type="button"
                                title="DÉCHARGE DÉFINITIVE — DOSSIER COMPLET"
                                onClick={() =>
                                  void downloadLonaciPdf(
                                    `/api/dossiers/${c.dossierId}/decharge-definitive/pdf`,
                                    `decharge-definitive-${c.reference}.pdf`,
                                  ).catch((err) =>
                                    notify.error(
                                      friendlyErrorMessage(
                                        err instanceof Error ? err.message : "Téléchargement impossible.",
                                      ),
                                    ),
                                  )
                                }
                                className="inline-flex items-center justify-center rounded-lg border border-emerald-500 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-emerald-900 shadow-sm transition hover:bg-emerald-100"
                              >
                                Décharge
                              </button>
                            ) : null}
                            {c.dechargeDefinitiveEligible ? (
                              <button
                                type="button"
                                title={COURRIER_COMPTABILITE_TITLE}
                                onClick={() =>
                                  void downloadLonaciPdf(
                                    `/api/dossiers/${c.dossierId}/courrier-comptabilite/pdf`,
                                    `courrier-comptabilite-${c.reference}.pdf`,
                                  ).catch((err) =>
                                    notify.error(
                                      friendlyErrorMessage(
                                        err instanceof Error ? err.message : "Téléchargement impossible.",
                                      ),
                                    ),
                                  )
                                }
                                className="inline-flex items-center justify-center rounded-lg border border-blue-600 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-blue-900 shadow-sm transition hover:bg-blue-100"
                              >
                                Courrier compta.
                              </button>
                            ) : null}
                            {c.dossierEtape === "FINALISE" && c.hasContratGenere ? (
                              <button
                                type="button"
                                title="Fiche de décharge — remise du contrat au client"
                                onClick={() =>
                                  void downloadLonaciPdf(
                                    `/api/dossiers/${c.dossierId}/decharge-contrat/pdf?produitCode=${encodeURIComponent(c.produitCode)}`,
                                    `decharge-contrat-client-${c.reference}.pdf`,
                                  ).catch((err) =>
                                    notify.error(
                                      friendlyErrorMessage(
                                        err instanceof Error ? err.message : "Téléchargement impossible.",
                                      ),
                                    ),
                                  )
                                }
                                className="inline-flex items-center justify-center rounded-lg border border-blue-600 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-blue-900 shadow-sm transition hover:bg-blue-100"
                              >
                                Décharge client
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void openDossierRecapPdf(c.dossierId)}
                              title="Récapitulatif dossier (historique validations)"
                              className="inline-flex items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-indigo-800 shadow-sm transition hover:bg-indigo-100"
                            >
                              Récap.
                            </button>
                            {c.hasContratGenere ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void openContratOfficielPdf(c.dossierId, c.produitCode)}
                                  title={
                                    c.contratArchive
                                      ? `Contrat ${c.produitCode} signé archivé (PDF)`
                                      : `Projet de contrat ${c.produitCode} (PDF)`
                                  }
                                  className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-white shadow-sm transition hover:bg-slate-900"
                                >
                                  Contrat
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void openAnnexeOfficiellePdf(c.dossierId, c.produitCode)}
                                  title={
                                    c.annexeArchive
                                      ? `Annexe ${c.produitCode} archivée (PDF)`
                                      : `Projet d’annexe ${c.produitCode} (PDF)`
                                  }
                                  className="inline-flex items-center justify-center rounded-lg border border-indigo-700 bg-indigo-700 px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-white shadow-sm transition hover:bg-indigo-800"
                                >
                                  Annexe
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openViewContrat(c)}
                              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              Voir
                            </button>
                            {canDecideDossier ? (
                              <button
                                type="button"
                                disabled={dossierActionBusyId === c.dossierId}
                                title={
                                  canApproveDossier && workflowPrimary
                                    ? workflowPrimary.label
                                    : "Rejeter ou retourner pour correction"
                                }
                                onClick={() => openDecision(c.dossierId, etape ?? "")}
                                className="inline-flex min-w-[110px] items-center justify-center rounded-lg border border-cyan-600 bg-cyan-600 px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-white shadow-sm transition-transform duration-150 hover:scale-[1.02] hover:border-cyan-700 hover:bg-cyan-700 disabled:opacity-60"
                              >
                                {dossierActionBusyId === c.dossierId
                                  ? "..."
                                  : canApproveDossier && workflowPrimary
                                    ? workflowPrimary.label
                                    : "Décision"}
                              </button>
                            ) : null}
                            {meRole === "CHEF_SERVICE" && !c.isDossierPending ? (
                              <button
                                type="button"
                                onClick={() => openEditContrat(c)}
                                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                              >
                                Modifier
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!listLoading && contratsListe.length > 0 ? (
          <div className="flex flex-col items-start justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:px-5">
            <span>
              {listTotal} contrat{listTotal > 1 ? "s" : ""}
            </span>
            <Pagination
              page={listPage}
              pageCount={listPageCount}
              onPageChange={setListPage}
              label="Pagination du registre des contrats"
            />
          </div>
        ) : null}
      </Surface>

      {editContratOpen && editContratId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-contrat-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Fermer"
            disabled={editSaving}
            onClick={closeEditContrat}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 id="edit-contrat-title" className="text-base font-semibold text-slate-900">
                Modifier le contrat
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">Mise à jour de la date d&apos;effet.</p>
            </div>
            <div className="space-y-3 px-4 py-4">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-700">Date d&apos;effet</span>
                <input
                  type="date"
                  value={editDateEffet}
                  onChange={(e) => setEditDateEffet(e.target.value)}
                  className={inputClass}
                  disabled={editSaving}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-700">Statut</span>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as "ACTIF" | "RESILIE" | "CEDE")}
                  className={inputClass}
                  disabled={editSaving}
                >
                  <option value="ACTIF">Actif</option>
                  <option value="RESILIE">Résilié</option>
                  <option value="CEDE">Cédé</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-700">Type d&apos;opération</span>
                <select
                  value={editOperationType}
                  onChange={(e) => setEditOperationType(e.target.value as "NOUVEAU" | "ACTUALISATION")}
                  className={inputClass}
                  disabled={editSaving}
                >
                  <option value="NOUVEAU">Nouveau</option>
                  <option value="ACTUALISATION">Actualisation</option>
                </select>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={closeEditContrat}
                disabled={editSaving}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void saveEditContrat()}
                disabled={editSaving}
                className="rounded-lg border border-cyan-600 bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
              >
                {editSaving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {checklistModalContrat ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contrat-checklist-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60"
            aria-label="Fermer"
            onClick={closeChecklistModal}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <h3 id="contrat-checklist-title" className="text-base font-semibold text-slate-900">
                  Checklist documents — contrat
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  {checklistModalContrat.reference} · {checklistModalContrat.produitCode}
                </p>
              </div>
              <button
                type="button"
                onClick={closeChecklistModal}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
            {checklistModalLoading ? (
              <p className="text-sm text-slate-600">Chargement…</p>
            ) : checklistModalPayload ? (
              <DossierDocumentChecklistBlock
                dossierId={checklistModalContrat.dossierId}
                payload={checklistModalPayload}
                editable={checklistModalDossierStatus === "BROUILLON" || checklistModalDossierStatus === "A_CORRIGER"}
                canGenererContrat={
                  checklistModalDossierStatus === "BROUILLON" || checklistModalDossierStatus === "A_CORRIGER"
                }
                cautionPaid={checklistModalCautionPaid}
                dechargeDefinitiveEligible={checklistModalDechargeEligible}
                cautionPaymentReference={checklistModalPaymentRef}
                dossierStatus={checklistModalDossierStatus}
                hasContratGenere={checklistModalHasContratGenere}
                contratArchive={checklistModalContratArchive}
                annexeArchive={checklistModalAnnexeArchive}
                contratsParProduit={checklistModalContratsParProduit}
                statutMetier={checklistModalStatutMetier}
                statutMetierLabel={checklistModalStatutLabel}
                statutMetierDescription={checklistModalStatutDescription}
                onUpdated={(patch) => {
                  setChecklistModalPayload(patch.payload);
                  if (patch.status) setChecklistModalDossierStatus(patch.status);
                  if (patch.statutMetier) setChecklistModalStatutMetier(patch.statutMetier);
                  if (patch.statutMetierLabel) setChecklistModalStatutLabel(patch.statutMetierLabel);
                  if (patch.statutMetierDescription) {
                    setChecklistModalStatutDescription(patch.statutMetierDescription);
                  }
                  if (patch.cautionPaid !== undefined) setChecklistModalCautionPaid(patch.cautionPaid);
                  if (patch.dechargeDefinitiveEligible !== undefined) {
                    setChecklistModalDechargeEligible(patch.dechargeDefinitiveEligible);
                  }
                  if (patch.cautionPaymentReference !== undefined) {
                    setChecklistModalPaymentRef(patch.cautionPaymentReference);
                  }
                  if (patch.hasContratGenere !== undefined) {
                    setChecklistModalHasContratGenere(patch.hasContratGenere);
                  }
                  if (patch.contratArchive !== undefined) {
                    setChecklistModalContratArchive(patch.contratArchive);
                  }
                  if (patch.annexeArchive !== undefined) {
                    setChecklistModalAnnexeArchive(patch.annexeArchive);
                  }
                  if (patch.contratsParProduit !== undefined) {
                    setChecklistModalContratsParProduit(patch.contratsParProduit);
                  }
                  syncContratChecklistInList(checklistModalContrat.dossierId, patch);
                  setListReloadTick((n) => n + 1);
                }}
              />
            ) : (
              <p className="text-sm text-slate-600">Aucune checklist configurée pour ce produit.</p>
            )}
          </div>
        </div>
      ) : null}

      {viewContratOpen && viewContrat ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-contrat-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Fermer"
            onClick={closeViewContrat}
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 id="view-contrat-title" className="text-base font-semibold text-slate-900">
                Détails du contrat
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">Consultation du contrat créé.</p>
            </div>
            <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Référence</p>
                <p className="font-mono text-xs text-slate-900">{viewContrat.reference}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Client</p>
                <p className="text-sm text-slate-900">{viewContrat.nomPdv || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Produit</p>
                <p className="text-sm text-slate-900">{viewContrat.produitCode}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Type</p>
                <p className="text-sm text-slate-900">{labelOperationType(viewContrat.operationType)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Statut</p>
                <p className="text-sm text-slate-900">
                  {viewContrat.statutMetierLabel ?? viewContrat.status}
                </p>
                {viewContrat.statutMetierDescription ? (
                  <p className="mt-0.5 text-xs text-slate-500">{viewContrat.statutMetierDescription}</p>
                ) : null}
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Date d&apos;effet</p>
                <p className="text-sm text-slate-900">{formatShortDate(viewContrat.dateEffet)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Date de dépôt</p>
                <p className="text-sm text-slate-900">{formatShortDate(viewContrat.dateDepot ?? viewContrat.createdAt)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Étape dossier</p>
                <p className="text-sm text-slate-900">{labelDossierEtape(viewContrat.dossierEtape ?? "FINALISE")}</p>
              </div>
            </div>
            {viewContrat.clientFiche ? (
              <div className="border-t border-slate-200 px-4 py-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Fiche client
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["Identifiant", viewContrat.clientFiche.code],
                      [
                        "Catégorie",
                        CLIENT_CATEGORIE_LABELS[
                          normalizeClientCategorie(viewContrat.clientFiche.categorie) as ClientCategorie
                        ],
                      ],
                      ["Nom complet", viewContrat.clientFiche.nomComplet],
                      ["Raison sociale", viewContrat.clientFiche.raisonSociale],
                      ["Code machine", viewContrat.clientFiche.codeMachine],
                      ["N° CNI", viewContrat.clientFiche.cniNumero],
                      ["Contact", viewContrat.clientFiche.nomContact],
                      ["E-mail", viewContrat.clientFiche.email],
                      ["Téléphone", viewContrat.clientFiche.telephone],
                      ["Adresse", viewContrat.clientFiche.adresse],
                      ["Ville", viewContrat.clientFiche.ville],
                      ["Code postal", viewContrat.clientFiche.codePostal],
                      [
                        "Agence (Intérieur - Abidjan)",
                        viewContrat.clientFiche.agenceLabel,
                      ],
                      [
                        "Type de distributeur",
                        (() => {
                          const t = normalizeClientTypeDistributeur(
                            viewContrat.clientFiche.typeDistributeur,
                          );
                          return t
                            ? CLIENT_TYPE_DISTRIBUTEUR_LABELS[t]
                            : viewContrat.clientFiche.typeDistributeur;
                        })(),
                      ],
                      ["Nombre de TPM", viewContrat.clientFiche.nombreTpm],
                      ["N° Distributeur", viewContrat.clientFiche.numeroDistributeur],
                      ["N° TPM", viewContrat.clientFiche.numeroTpm],
                      [
                        "Produits autorisés",
                        viewContrat.clientFiche.produitsAutorises.length
                          ? viewContrat.clientFiche.produitsAutorises.join(", ")
                          : null,
                      ],
                      [
                        "Statut client",
                        (CLIENT_STATUT_LABELS as Record<string, string>)[
                          viewContrat.clientFiche.statut
                        ] ?? viewContrat.clientFiche.statut,
                      ],
                      ["Notes", viewContrat.clientFiche.notes],
                    ] as const
                  ).map(([label, value]) => {
                    const alwaysShow =
                      label === "Agence (Intérieur - Abidjan)" ||
                      label === "Type de distributeur" ||
                      label === "Nombre de TPM" ||
                      label === "N° Distributeur" ||
                      label === "N° TPM";
                    const text =
                      value == null || value === ""
                        ? null
                        : typeof value === "number"
                          ? String(value)
                          : String(value).trim();
                    if (!text && !alwaysShow) return null;
                    return (
                      <div key={label}>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          {label}
                        </p>
                        <p className="text-sm text-slate-900">{text || "—"}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void openDossierRecapPdf(viewContrat.dossierId)
                  }
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                >
                  Récap. dossier
                </button>
                {viewContrat.hasContratGenere ? (
                  <button
                    type="button"
                    onClick={() =>
                      void openContratOfficielPdf(viewContrat.dossierId, viewContrat.produitCode)
                    }
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
                  >
                    {viewContrat.contratArchive ? "Contrat archivé (PDF)" : "Contrat (PDF)"}
                  </button>
                ) : (
                  <span className="self-center text-xs text-slate-500">
                    Contrat PDF disponible après génération (checklist / décharge définitive).
                  </span>
                )}
                {viewContrat.dossierEtape === "FINALISE" && viewContrat.hasContratGenere ? (
                  <button
                    type="button"
                    onClick={() =>
                      void downloadLonaciPdf(
                        `/api/dossiers/${viewContrat.dossierId}/decharge-contrat/pdf${
                          viewContrat.produitCode
                            ? `?produitCode=${encodeURIComponent(viewContrat.produitCode)}`
                            : ""
                        }`,
                        `decharge-contrat-client-${viewContrat.reference}.pdf`,
                      ).catch((err) =>
                        notify.error(
                          friendlyErrorMessage(
                            err instanceof Error ? err.message : "Téléchargement impossible.",
                          ),
                        ),
                      )
                    }
                    className="rounded-lg border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
                  >
                    Décharge client (PDF)
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeViewContrat}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {decisionOpen && decisionDossierId ? (
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
            disabled={dossierActionBusyId === decisionDossierId}
            onClick={closeDecision}
          />
          <div className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="relative flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 px-5 py-4">
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-300/20 blur-2xl" />
              <div>
                <p className="mb-1 inline-flex rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
                  Workflow dossier
                </p>
                <h3 id="decision-dossier-title" className="text-lg font-semibold text-white">
                  Décision du dossier
                </h3>
                <p className="mt-0.5 text-xs text-cyan-100/90">
                  Statut actuel : <span className="font-medium text-white">{labelDossierEtape(decisionEtape)}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={dossierActionBusyId === decisionDossierId}
                onClick={closeDecision}
                className="rounded-lg border border-white/35 bg-white/10 px-2.5 py-1 text-sm text-white transition hover:bg-white/20 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-50/80 to-white p-5">
              <div className="grid gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Justification de décision
                  </p>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">
                      Motif (obligatoire pour Rejeter / Retourner pour correction)
                    </span>
                    <textarea
                      value={decisionMotif}
                      onChange={(e) => setDecisionMotif(e.target.value)}
                      placeholder="Saisissez une justification claire pour traçabilité…"
                      rows={4}
                      className={`min-h-24 ${inputClass}`}
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    Actions disponibles
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        dossierActionBusyId === decisionDossierId ||
                        decisionPrimary === null ||
                        !mayApprouverDossier
                      }
                      onClick={() => void decideApprouver()}
                      title={
                        hideN1N2ForAdmin && decisionPrimary
                          ? decisionPrimary.action === "VALIDATE_N1"
                            ? "Validation N1 réservée au chef de section."
                            : "Validation N2 réservée à l'assistant(e) chef(fe) de service."
                          : undefined
                      }
                      className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform duration-150 hover:scale-[1.01] hover:border-sky-700 hover:bg-sky-700 disabled:opacity-60"
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      disabled={
                        dossierActionBusyId === decisionDossierId ||
                        !mayRejectDossier
                      }
                      onClick={() => void decideRejeter()}
                      className="rounded-lg border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform duration-150 hover:scale-[1.01] hover:border-rose-700 hover:bg-rose-700 disabled:opacity-60"
                    >
                      Rejeter
                    </button>
                    <button
                      type="button"
                      disabled={
                        dossierActionBusyId === decisionDossierId ||
                        !mayReturnDossier
                      }
                      onClick={() => void decideRetourner()}
                      className="rounded-lg border border-amber-600 bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform duration-150 hover:scale-[1.01] hover:border-amber-700 hover:bg-amber-700 disabled:opacity-60"
                    >
                      Retourner pour correction
                    </button>
                    <button
                      type="button"
                      disabled={dossierActionBusyId === decisionDossierId}
                      onClick={closeDecision}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  </div>
                </div>

                {decisionPrimary === null ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Aucune action d’approbation n’est disponible pour cette étape.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nouveau-contrat-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55"
            aria-label="Fermer"
            disabled={creating}
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative z-10 isolate flex w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-cyan-50 to-indigo-50 px-3.5 py-2.5">
              <div>
                <h3 id="nouveau-contrat-title" className="text-lg font-semibold text-slate-900">
                  Nouveau contrat
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Un contrat et une annexe par produit — plusieurs produits possibles sur le même dossier client.
                </p>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <form noValidate onSubmit={onCreate} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-3.5 py-2">
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">
                    1. Identification client
                  </span>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800">
                    2. Paramètres contrat
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                    3. Pièces documents
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    4. Validation
                  </span>
                </div>

                <div className="grid gap-2.5">
                  <section className="rounded-xl border border-cyan-200/80 bg-white p-2.5 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-800">
                      Client
                    </p>
                    <ClientSearchPicker
                      key={`contrat-create-${createOpen}-${prefillLonaciClientId || "none"}`}
                      label="Sélection du client (recherche par nom, code, CNI…) *"
                      selected={selectedClient}
                      onSelectedChange={(row) => {
                        setSelectedClient(row);
                        const agIds = agencesTriees.map((a) => a.id);
                        const pickedAg = pickAgenceIdFromClient(row, agIds);
                        setFormAgenceId(pickedAg || (row ? "" : ""));
                        const pool = produitsTries
                          .filter((p) =>
                            !row || !(row.produitsAutorises ?? []).length
                              ? true
                              : produitAutorisePourConcessionnaire(row.produitsAutorises ?? [], p.code),
                          )
                          .map((p) => p.code);
                        if (operationType === "NOUVEAU") {
                          setSelectedProduitCodes(uniqueOrderedProduitCodes(pool));
                          setProduitCode(pool[0] ?? "");
                        } else {
                          const picked = pickProduitCodeFromClient(row, pool);
                          setProduitCode(picked || "");
                          setSelectedProduitCodes(picked ? [picked] : []);
                        }
                      }}
                      inputClassName={inputClass}
                    />
                  </section>

                  <section className="rounded-xl border border-indigo-200/80 bg-white p-2.5 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
                      Détails du contrat
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <label className="grid gap-1 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-700">
                          {operationType === "ACTUALISATION"
                            ? "Sélection du produit *"
                            : "Produit(s) — un contrat et une annexe par ligne *"}
                        </span>
                        {operationType === "ACTUALISATION" ? (
                          <select
                            required
                            value={produitCode}
                            onChange={(e) => setProduitCode(e.target.value)}
                            className={inputClass}
                            disabled={refLoading}
                          >
                            <option value="">{refLoading ? "Chargement des produits…" : "— Choisir un produit —"}</option>
                            {produitsPourSelect.map((p) => (
                              <option key={p.code} value={p.code}>
                                {p.libelle}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                            <div className="mb-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={refLoading || produitsPourSelect.length === 0}
                                onClick={() =>
                                  setSelectedProduitCodes(produitsPourSelect.map((p) => p.code))
                                }
                                className="rounded border border-indigo-300 bg-white px-2 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                              >
                                Tout cocher
                              </button>
                              <button
                                type="button"
                                disabled={selectedProduitCodes.length === 0}
                                onClick={() => setSelectedProduitCodes([])}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Tout décocher
                              </button>
                            </div>
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {produitsPourSelect.map((p) => {
                                const ku = p.code.trim().toUpperCase();
                                const checked = selectedProduitCodes.some(
                                  (c) => c.trim().toUpperCase() === ku,
                                );
                                return (
                                  <label
                                    key={p.code}
                                    className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-sm hover:border-indigo-300"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        setSelectedProduitCodes((prev) => {
                                          if (checked) {
                                            return prev.filter((c) => c.trim().toUpperCase() !== ku);
                                          }
                                          return uniqueOrderedProduitCodes([...prev, p.code]);
                                        });
                                      }}
                                      className="mt-0.5"
                                    />
                                    <span>
                                      <span className="font-mono text-xs text-slate-800">{p.code}</span>
                                      <span className="mt-0.5 block text-xs text-slate-600">{p.libelle}</span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            {selectedProduitCodes.length > 0 ? (
                              <p className="mt-2 text-[11px] text-indigo-900">
                                {selectedProduitCodes.length} produit
                                {selectedProduitCodes.length > 1 ? "s" : ""} sélectionné
                                {selectedProduitCodes.length > 1 ? "s" : ""} → autant de contrats et d’annexes à
                                finaliser.
                              </p>
                            ) : null}
                          </div>
                        )}
                        {refError ? <span className="text-[11px] text-rose-700">{refError}</span> : null}
                        {!selectedClient ? (
                          <span className="text-[11px] text-slate-500">
                            Après choix du client, seuls les produits autorisés sur sa fiche restent sélectionnables.
                          </span>
                        ) : (selectedClient.produitsAutorises ?? []).length === 0 ? (
                          <span className="text-[11px] text-amber-800">
                            Aucun produit autorisé sur cette fiche client — complétez le référentiel client.
                          </span>
                        ) : null}
                      </label>

                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-700">Sélection de l’agence *</span>
                        <select
                          required
                          value={formAgenceId}
                          onChange={(e) => setFormAgenceId(e.target.value)}
                          className={inputClass}
                        >
                          <option value="">— Choisir une agence —</option>
                          {agencesTriees.map((a) => (
                            <option key={a.id} value={a.id}>
                              {agenceOptionLabel(a)}
                            </option>
                          ))}
                        </select>
                        {selectedClient?.agenceId ? (
                          <span className="text-[11px] text-slate-500">
                            Doit correspondre au rattachement du client ({agencesTriees.find((x) => x.id === selectedClient.agenceId)?.libelle ?? selectedClient.agenceId}).
                          </span>
                        ) : null}
                      </label>

                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-700">Date de l’opération *</span>
                        <input
                          type="date"
                          required
                          value={dateOperation}
                          onChange={(e) => setDateOperation(e.target.value)}
                          className={inputClass}
                        />
                      </label>

                      <label className="grid gap-1 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-700">Type *</span>
                        <select
                          value={operationType}
                          onChange={(e) => {
                            const next = e.target.value as OperationType;
                            setOperationType(next);
                            if (next === "ACTUALISATION" && selectedProduitCodes[0]) {
                              setProduitCode(selectedProduitCodes[0]!);
                            }
                          }}
                          className={inputClass}
                        >
                          <option value="NOUVEAU">NOUVEAU CONTRAT</option>
                          <option value="ACTUALISATION">ACTUALISATION D&apos;ANNEXE</option>
                        </select>
                      </label>
                    </div>
                  </section>

                  {createProduitCodes.length > 0 ? (
                    <section className="rounded-xl border border-emerald-200/80 bg-white p-2.5 shadow-sm">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                        Documents du produit
                      </p>
                      {createChecklist ? (
                        <ProduitDocumentChecklistEditor
                          checklist={createChecklist}
                          editable
                          onChange={setCreateChecklist}
                          title="Pièces à fournir pour ce(s) contrat(s)"
                          hint={`Liste fusionnée des pièces des ${createProduitCodes.length} produit(s) — marquez chaque pièce Fourni, Manquant ou En attente.`}
                        />
                      ) : (
                        <p className="text-xs text-slate-500">Préparation de la checklist…</p>
                      )}
                      {createChecklist?.entries.length ? (
                        <p
                          className={`mt-2 text-[11px] ${
                            createChecklistObligatoires.complet ? "text-emerald-800" : "text-amber-900"
                          }`}
                        >
                          {createChecklistObligatoires.complet
                            ? areWorkflowApprovalsEnabled()
                              ? "Checklist complète — le dossier sera soumis automatiquement à la validation N1."
                              : "Checklist complète — le dossier sera soumis et validé automatiquement."
                            : `${createChecklistObligatoires.fournis}/${createChecklistObligatoires.total} pièce(s) obligatoire(s) marquée(s) « Fourni ».`}
                        </p>
                      ) : null}
                    </section>
                  ) : null}

                  {operationType === "ACTUALISATION" ? (
                    <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-2.5 shadow-sm ring-1 ring-violet-900/[0.04]">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                        Contrat d’origine
                      </p>
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-800">Contrat existant à actualiser *</span>
                        <select
                          required
                          value={parentContratId}
                          onChange={(e) => setParentContratId(e.target.value)}
                          disabled={parentsLoading || parentsActifs.length === 0}
                          className={inputClass}
                        >
                          <option value="">
                            {parentsLoading
                              ? "Chargement des contrats actifs…"
                              : parentsActifs.length === 0
                                ? "Aucun contrat actif pour ce PDV et ce produit"
                                : "— Choisir le contrat d’origine —"}
                          </option>
                          {parentsActifs.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.reference} · {c.produitCode} · actif
                            </option>
                          ))}
                        </select>
                        {lonaciClientId && produitCode.trim() ? (
                          <button
                            type="button"
                            onClick={() => setParentsFetchTick((n) => n + 1)}
                            disabled={parentsLoading}
                            className="justify-self-start text-[11px] font-medium text-violet-800 underline decoration-violet-400/80 hover:text-violet-950 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Recharger la liste (même produit)
                          </button>
                        ) : null}
                      </label>
                    </section>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        Localisation
                      </p>
                      <div className="grid gap-2">
                        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-slate-700">Commune</span>
                            <input
                              value={commune}
                              onChange={(e) => setCommune(e.target.value)}
                              placeholder="ex. Cocody"
                              className={inputClass}
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-slate-700">Quartier</span>
                            <input
                              value={quartier}
                              onChange={(e) => setQuartier(e.target.value)}
                              placeholder="ex. Angré"
                              className={inputClass}
                            />
                          </label>
                        </div>
                        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-slate-700">Latitude GPS</span>
                            <input
                              value={gpsLat}
                              onChange={(e) => setGpsLat(e.target.value)}
                              placeholder="ex. 5.3599 (optionnel)"
                              inputMode="decimal"
                              className={inputClass}
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-slate-700">Longitude GPS</span>
                            <input
                              value={gpsLng}
                              onChange={(e) => setGpsLng(e.target.value)}
                              placeholder="ex. -4.0083 (optionnel)"
                              inputMode="decimal"
                              className={inputClass}
                            />
                          </label>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        Statuts & bancarisation
                      </p>
                      <div className="grid gap-2">
                        <p className="text-[11px] text-slate-600">
                          Données reprises sur la fiche PDV à la signature / promotion du client.
                        </p>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-slate-700">Statut de bancarisation</span>
                          <select
                            aria-label="Statut de bancarisation"
                            value={statutBancarisation}
                            onChange={(e) => setStatutBancarisation(e.target.value as BancarisationStatut)}
                            className={inputClass}
                          >
                            {BANCARISATION_STATUTS.map((s) => (
                              <option key={s} value={s}>
                                {BANCARISATION_STATUT_LABELS[s]}
                              </option>
                            ))}
                          </select>
                          <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 text-[11px] text-cyan-900">
                            Le numéro de compte est obligatoire pour passer au statut BANCARISÉ.
                          </span>
                        </label>
                        {statutBancarisation === "BANCARISE" ? (
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-slate-700">Numéro de compte bancaire *</span>
                            <input
                              value={compteBancaire}
                              onChange={(e) => setCompteBancaire(e.target.value)}
                              placeholder="Obligatoire si bancarisé"
                              className={inputClass}
                            />
                          </label>
                        ) : (
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-slate-700">Numéro de compte bancaire</span>
                            <input
                              value={compteBancaire}
                              onChange={(e) => setCompteBancaire(e.target.value)}
                              placeholder="Optionnel si non bancarisé"
                              className={inputClass}
                            />
                          </label>
                        )}
                      </div>
                    </section>
                  </div>

                  <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Observations</p>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Commentaire interne</span>
                    <textarea
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                        placeholder="Texte libre (optionnel)"
                      rows={2}
                      className={`min-h-20 ${inputClass}`}
                      />
                    </label>
                  </section>
                </div>
              </div>
              <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-3.5 py-2.5">
                {createFormError ? (
                  <div
                    className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
                    role="alert"
                  >
                    {createFormError}
                  </div>
                ) : null}
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept={getImportAcceptAttribute("CONTRATS")}
                  aria-label="Importer des contrats"
                  className="sr-only"
                  onChange={(e) => void onImportFileChange(e)}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="submit"
                    disabled={creating}
                    className="order-first w-full rounded-lg border border-cyan-600 bg-cyan-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700 disabled:opacity-60 sm:order-last sm:ml-auto sm:w-auto sm:min-w-[200px]"
                  >
                    {creating ? "Création…" : "Créer le dossier"}
                  </button>
                  <button
                    type="button"
                    disabled={importingFile}
                    onClick={() => importFileInputRef.current?.click()}
                    className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60"
                  >
                    {importingFile ? "Import..." : "Importer fichier vers le tableau"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadContratsExcelTemplate()}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Télécharger le modèle Excel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={transitionConfirmMessage !== null}
        onOpenChange={(open) => {
          if (!open) resolveTransitionConfirmation(false);
        }}
        title="Confirmer la transition"
        description="Cette action met à jour l’étape du workflow du dossier."
        message={transitionConfirmMessage ?? ""}
        confirmLabel="Confirmer"
        onConfirm={() => resolveTransitionConfirmation(true)}
      />
    </div>
  );
}
