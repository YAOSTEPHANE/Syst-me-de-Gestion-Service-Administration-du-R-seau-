"use client";

import { produitAutorisePourConcessionnaire } from "@/lib/lonaci/contrat-produit-rules";
import { captureByAliases, extractPdfText, normalizeDateToIso } from "@/lib/lonaci/pdf-import";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type OperationType = "NOUVEAU" | "ACTUALISATION";

interface ConcessionnaireOption {
  id: string;
  codePdv: string;
  nomComplet: string;
  raisonSociale: string;
  agenceId: string | null;
  produitsAutorises: string[];
}

interface AgenceRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

interface ProduitRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
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
}

interface ToSignRow {
  dossierId: string;
  reference: string;
  concessionnaireId: string;
  produitCode: string;
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

type ContratSuiviEtat = "VALIDE" | "EN_ATTENTE" | "REFUSE" | "EN_RETARD";

function contratSuiviEtat(etape: string, dateDepotIso?: string): ContratSuiviEtat {
  if (etape === "FINALISE") return "VALIDE";
  if (etape === "REJETE") return "REFUSE";

  // Dossier non finalisé/rejeté depuis plus de 7 jours => en retard.
  const depot = dateDepotIso ? new Date(dateDepotIso) : null;
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (depot && !Number.isNaN(depot.getTime()) && now - depot.getTime() > sevenDaysMs) {
    return "EN_RETARD";
  }
  return "EN_ATTENTE";
}

function contratSuiviBadge(etat: ContratSuiviEtat) {
  switch (etat) {
    case "VALIDE":
      return { label: "Validé", className: "bg-emerald-100 text-emerald-900" };
    case "REFUSE":
      return { label: "Refusé", className: "bg-rose-100 text-rose-900" };
    case "EN_RETARD":
      return { label: "En retard", className: "bg-amber-100 text-amber-900" };
    default:
      return { label: "En attente", className: "bg-slate-200 text-slate-800" };
  }
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
  switch (etape) {
    case "BROUILLON":
      return {
        action: "SUBMIT",
        label: "Soumettre le dossier",
        labelBusy: "Soumission…",
        confirmMessage:
          "Confirmer la soumission du dossier ? Il passera à l’étape « Soumis » et pourra être pris en charge pour la validation de niveau 1.",
        successMessage: "Dossier soumis. Prochaine étape : validation de niveau 1.",
        ariaLabel: "Soumettre le dossier pour validation",
        buttonClass:
          "border border-slate-700 bg-slate-800 text-white hover:border-slate-900 hover:bg-slate-900",
      };
    case "SOUMIS":
      return {
        action: "VALIDATE_N1",
        label: "Validation de niveau 1",
        labelBusy: "Validation N1…",
        confirmMessage:
          "Confirmer la validation de niveau 1 ? Le dossier passera à l’étape « Validé N1 » (contrôle premier niveau).",
        successMessage: "Validation de niveau 1 effectuée. Le dossier est à l’étape Validé N1.",
        ariaLabel: "Valider le dossier au niveau 1 (premier contrôle)",
        buttonClass: "border border-sky-600 bg-sky-600 text-white hover:border-sky-700 hover:bg-sky-700",
      };
    case "VALIDE_N1":
      return {
        action: "VALIDATE_N2",
        label: "Validation de niveau 2",
        labelBusy: "Validation N2…",
        confirmMessage:
          "Confirmer la validation de niveau 2 ? Le dossier passera à l’étape « Validé N2 » (contrôle second niveau).",
        successMessage: "Validation de niveau 2 effectuée. Le dossier est à l’étape Validé N2.",
        ariaLabel: "Valider le dossier au niveau 2 (second contrôle)",
        buttonClass: "border border-sky-600 bg-sky-600 text-white hover:border-sky-700 hover:bg-sky-700",
      };
    case "VALIDE_N2":
      return {
        action: "FINALIZE",
        label: "Finaliser le dossier",
        labelBusy: "Finalisation…",
        confirmMessage:
          "Confirmer la finalisation du dossier ? Cette action crée le contrat actif et clôt le flux de validation.",
        successMessage: "Dossier finalisé. Le contrat actif a été créé.",
        ariaLabel: "Finaliser le dossier et créer le contrat actif",
        buttonClass:
          "border border-emerald-700 bg-emerald-600 text-white hover:border-emerald-800 hover:bg-emerald-700",
      };
    default:
      return null;
  }
}

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

function labelPdv(c: ConcessionnaireOption) {
  return `${c.codePdv} — ${c.nomComplet || c.raisonSociale}`;
}

export default function ContratsPanel() {
  const searchParams = useSearchParams();
  const prefillConcessionnaireId = searchParams.get("concessionnaireId") ?? "";

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
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  /** Recherche référentiel PDV */
  const [pdvQuery, setPdvQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ConcessionnaireOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPdv, setSelectedPdv] = useState<ConcessionnaireOption | null>(null);

  const [formAgenceId, setFormAgenceId] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const [dateOperation, setDateOperation] = useState("");
  const [operationType, setOperationType] = useState<OperationType>("NOUVEAU");
  const [parentContratId, setParentContratId] = useState("");
  const [observations, setObservations] = useState("");

  const [parentsActifs, setParentsActifs] = useState<ContratActif[]>([]);
  const [parentsLoading, setParentsLoading] = useState(false);

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

  const agencesTriees = useMemo(
    () => [...agences].sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" })),
    [agences],
  );
  const produitsTries = useMemo(
    () => [...produits].sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" })),
    [produits],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setListRefDebounced(listRefQuery.trim()), 400);
    return () => window.clearTimeout(t);
  }, [listRefQuery]);

  useEffect(() => {
    setListPage(1);
  }, [listRefDebounced]);

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
      const params = new URLSearchParams({
        page: String(listPage),
        pageSize: String(listPageSize),
      });
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

  const concessionnaireId = selectedPdv?.id ?? "";
  const produitLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of produits) {
      map.set(p.code, p.libelle);
    }
    return map;
  }, [produits]);

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
    setOperationType("NOUVEAU");
    setParentContratId("");
    setProduitCode("");
    setSearchResults([]);
    if (!prefillConcessionnaireId) {
      setSelectedPdv(null);
      setFormAgenceId("");
      setPdvQuery("");
    }
  }, [createOpen, prefillConcessionnaireId]);

  useEffect(() => {
    if (!createOpen || !prefillConcessionnaireId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/concessionnaires/${prefillConcessionnaireId}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { concessionnaire: ConcessionnaireOption };
        const c = data.concessionnaire;
        setSelectedPdv(c);
        setFormAgenceId(c.agenceId ?? "");
        setPdvQuery(labelPdv(c));
      } catch {
        /* ignore */
      }
    })();
  }, [createOpen, prefillConcessionnaireId]);

  useEffect(() => {
    if (selectedPdv && labelPdv(selectedPdv) === pdvQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = pdvQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setSearchLoading(true);
        try {
          const params = new URLSearchParams({ page: "1", pageSize: "40", q });
          const res = await fetch(`/api/concessionnaires?${params}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (cancelled || !res.ok) {
            if (!cancelled) setSearchResults([]);
            return;
          }
          const data = (await res.json()) as { items: ConcessionnaireOption[] };
          if (!cancelled) setSearchResults(data.items);
        } finally {
          if (!cancelled) setSearchLoading(false);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [pdvQuery, selectedPdv]);

  useEffect(() => {
    if (operationType !== "ACTUALISATION" || !concessionnaireId || !produitCode.trim()) {
      setParentsActifs([]);
      return;
    }
    void (async () => {
      setParentsLoading(true);
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: "100",
          concessionnaireId,
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
  }, [operationType, concessionnaireId, produitCode]);

  useEffect(() => {
    if (operationType === "NOUVEAU") setParentContratId("");
  }, [operationType]);

  useEffect(() => {
    if (operationType !== "ACTUALISATION" || parentsActifs.length !== 1) return;
    setParentContratId(parentsActifs[0].id);
  }, [operationType, parentsActifs]);

  useEffect(() => {
    if (!selectedPdv || !produitCode) return;
    const allowed = selectedPdv.produitsAutorises ?? [];
    if (!produitAutorisePourConcessionnaire(allowed, produitCode)) setProduitCode("");
  }, [selectedPdv, produitCode]);

  function onPdvQueryChange(v: string) {
    setPdvQuery(v);
    if (selectedPdv && v.trim() !== labelPdv(selectedPdv)) {
      setSelectedPdv(null);
      setFormAgenceId("");
    }
  }

  function pickPdv(c: ConcessionnaireOption) {
    setSelectedPdv(c);
    setFormAgenceId(c.agenceId ?? "");
    setPdvQuery(labelPdv(c));
    setSearchResults([]);
  }

  function clearPdv() {
    setSelectedPdv(null);
    setFormAgenceId("");
    setPdvQuery("");
    setSearchResults([]);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateFormError(null);

    const fail = (message: string) => {
      setCreateFormError(message);
      setToast({ type: "error", message });
    };

    if (!selectedPdv) {
      fail("Sélectionnez un concessionnaire dans le référentiel (cliquez un résultat sous la recherche).");
      return;
    }
    if (!formAgenceId.trim()) {
      fail("Sélectionnez l’agence.");
      return;
    }
    if (selectedPdv.agenceId && formAgenceId !== selectedPdv.agenceId) {
      fail("L’agence doit correspondre au rattachement du point de vente sélectionné.");
      return;
    }
    if (!produitCode.trim()) {
      fail("Sélectionnez un produit.");
      return;
    }
    const autorises = selectedPdv.produitsAutorises ?? [];
    if (!produitAutorisePourConcessionnaire(autorises, produitCode)) {
      fail("Ce produit n’est pas autorisé pour ce point de vente.");
      return;
    }
    if (operationType === "ACTUALISATION" && !parentContratId.trim()) {
      fail("Sélectionnez le contrat d’origine (actif).");
      return;
    }
    const d = new Date(`${dateOperation}T12:00:00`);
    if (Number.isNaN(d.getTime())) {
      fail("Date d’opération invalide.");
      return;
    }

    setCreating(true);
    setToast(null);
    try {
      const body: Record<string, unknown> = {
        concessionnaireId: selectedPdv.id,
        agenceId: formAgenceId.trim(),
        produitCode: produitCode.trim().toUpperCase(),
        operationType,
        dateOperation: d.toISOString(),
        observations: observations.trim() || null,
      };
      if (operationType === "ACTUALISATION") {
        body.parentContratId = parentContratId.trim();
      }
      const res = await fetch("/api/contrats", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const errBody = (await res.json().catch(() => null)) as {
        message?: string;
        issues?: { path: (string | number)[]; message: string }[];
      } | null;
      if (!res.ok) {
        const zodDetail = errBody?.issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join(" — ");
        throw new Error(zodDetail || errBody?.message || "Création impossible.");
      }
      setCreateFormError(null);
      setCreateOpen(false);
      setToast({ type: "success", message: "Contrat créé avec succès." });
      setListReloadTick((n) => n + 1);
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setCreateFormError(message);
      setToast({ type: "error", message });
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

      setListReloadTick((n) => n + 1);
      window.dispatchEvent(new Event("lonaci:data-imported"));
      setToast({
        type: "success",
        message: `Import contrats terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s).`,
      });
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Import impossible");
      setCreateFormError(message);
      setToast({ type: "error", message });
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
    if (!window.confirm(payload.confirmMessage)) return false;

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

      setToast({ type: "success", message: payload.successMessage });
      setListReloadTick((n) => n + 1);
      closeDecision();
      return true;
    } catch (err) {
      setToast({ type: "error", message: friendlyErrorMessage(err instanceof Error ? err.message : "Erreur") });
      return false;
    } finally {
      setDossierActionBusyId(null);
    }
    return false;
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
        setToast({ type: "success", message: "Lien de signature copié dans le presse-papiers." });
      } else {
        setToast({ type: "success", message: `Lien de signature: ${url}` });
      }
    } catch (err) {
      setToast({ type: "error", message: friendlyErrorMessage(err instanceof Error ? err.message : "Erreur") });
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
      setToast({ type: "error", message: "Le motif est obligatoire pour rejeter." });
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
      setToast({
        type: "error",
        message: "Le motif est obligatoire pour retourner pour correction.",
      });
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

  const showSearchPanel = pdvQuery.trim().length >= 2 && (!selectedPdv || labelPdv(selectedPdv) !== pdvQuery.trim());
  const decisionPrimary = workflowPrimaryAction(decisionEtape);

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
      };
    }
    const totals = chartsData.totalsByProduct ?? [];
    const weekly = totals.reduce((acc, row) => acc + (row.weekly ?? 0), 0);
    const monthly = totals.reduce((acc, row) => acc + (row.monthly ?? 0), 0);
    const p = chartsData.pendingByLevel ?? { n1: 0, n2: 0, final: 0 };
    const pendingTotal = (p.n1 ?? 0) + (p.n2 ?? 0) + (p.final ?? 0);
    const active = chartsData.statusCounts?.actif ?? 0;
    const resile = chartsData.statusCounts?.resile ?? 0;
    const totalStatuses = active + resile;
    return {
      weekly,
      monthly,
      velocityPct: monthly > 0 ? Math.round((weekly / monthly) * 100) : 0,
      pendingTotal,
      pendingN1: p.n1 ?? 0,
      pendingN2: p.n2 ?? 0,
      pendingFinal: p.final ?? 0,
      activeRate: totalStatuses > 0 ? Math.round((active / totalStatuses) * 100) : 0,
    };
  }, [chartsData]);

  const portfolioTotal = (chartsData?.statusCounts.actif ?? 0) + (chartsData?.statusCounts.resile ?? 0);
  const activeCount = chartsData?.statusCounts.actif ?? 0;
  const resileCount = chartsData?.statusCounts.resile ?? 0;
  const activeRatio = portfolioTotal > 0 ? Math.round((activeCount / portfolioTotal) * 100) : 0;
  const resileRatio = portfolioTotal > 0 ? Math.round((resileCount / portfolioTotal) * 100) : 0;
  const topProduits = useMemo(() => {
    if (!chartsData) return [];
    return [...(chartsData.totalsByProduct ?? [])]
      .sort((a, b) => (b.monthly ?? 0) - (a.monthly ?? 0))
      .slice(0, 5)
      .map((row) => ({
        produitCode: row.produitCode,
        produitLabel: produitLabelByCode.get(row.produitCode) ?? row.produitCode,
        weekly: row.weekly ?? 0,
        monthly: row.monthly ?? 0,
      }));
  }, [chartsData, produitLabelByCode]);

  return (
    <div className="min-w-0 space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-200 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-cyan-300/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-24 h-44 w-44 rounded-full bg-sky-300/20 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
              Référentiel
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Contrats</h2>
            <p className="mt-1 text-sm text-cyan-100/90">
              Supervision des dossiers contrats, validation multi-étapes et export opérationnel.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <a
              href="/api/contrats/export?format=excel"
              className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Excel
            </a>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={refLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300 bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:border-cyan-200 hover:bg-cyan-400 disabled:opacity-50"
            >
              <span className="text-lg font-light leading-none">+</span>
              Nouveau contrat
            </button>
          </div>
        </div>
      </section>

      {toast ? (
        toast.type === "success" ? (
          <div
            className="fixed left-1/2 top-4 z-[100] w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 shadow-lg"
            role="status"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm"
                  aria-hidden
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span className="min-w-0 pt-1 font-medium leading-snug">{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="shrink-0 text-xs underline text-emerald-800"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <div
            className="fixed left-1/2 top-4 z-[100] w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900 shadow-lg"
            role="alert"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <span className="min-w-0 pt-1 font-medium leading-snug">{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="shrink-0 text-xs underline text-rose-800"
              >
                Fermer
              </button>
            </div>
          </div>
        )
      ) : null}

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 px-4 py-4 sm:px-5">
          <div className="pointer-events-none absolute -right-12 -top-10 h-36 w-36 rounded-full bg-cyan-400/20 blur-2xl" />
          <h3 className="relative text-sm font-semibold text-white">Pilotage contrats</h3>
          <p className="relative mt-0.5 text-xs text-cyan-100/90">
            Vue executive sans graphiques : volumes, pipeline de validation et portefeuille.
          </p>
        </div>

        {chartsError ? (
          <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {chartsError}
          </div>
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
            <div className="text-[11px] text-slate-600">Toutes étapes cumulées</div>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Pipeline de validation</h4>
            <div className="mt-3 space-y-3">
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
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                  <span>Validé N1</span>
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
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Portefeuille contrats</h4>
            {chartsLoading ? (
              <p className="mt-3 text-sm text-slate-500">Chargement des indicateurs…</p>
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
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Top produits (30 jours)</h4>
          {chartsLoading ? (
            <p className="mt-3 text-sm text-slate-500">Chargement des produits…</p>
          ) : topProduits.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Pas de données sur la période.</p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Produit</th>
                    <th className="px-3 py-2 font-semibold">7 jours</th>
                    <th className="px-3 py-2 font-semibold">30 jours</th>
                    <th className="px-3 py-2 font-semibold">Intensité</th>
                  </tr>
                </thead>
                <tbody>
                  {topProduits.map((row) => {
                    const intensity = row.monthly > 0 ? Math.min(100, Math.round((row.weekly / row.monthly) * 100)) : 0;
                    return (
                      <tr key={row.produitCode} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{row.produitLabel}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.weekly}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.monthly}</td>
                        <td className="px-3 py-2">
                          <div className="h-1.5 w-full rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full bg-cyan-500" style={{ width: `${intensity}%` }} />
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
      </section>

      {meRole === "CHEF_SERVICE" ? (
        <section className="rounded-2xl border border-violet-200 bg-violet-50/40 shadow-sm">
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
                <thead>
                  <tr className="border-b border-violet-200/80 text-[11px] font-semibold uppercase tracking-wide text-violet-900/80">
                    <th className="px-3 py-2">Réf. dossier</th>
                    <th className="px-3 py-2">Produit</th>
                    <th className="px-3 py-2">Date op.</th>
                    <th className="px-3 py-2">MAJ</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {signingQueue.map((row) => (
                    <tr key={row.dossierId} className="border-b border-violet-100/80">
                      <td className="px-3 py-2 font-mono text-xs text-violet-950">{row.reference}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.produitCode || "—"}</td>
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
                          <a
                            href={`/api/contrats/${encodeURIComponent(row.dossierId)}/export`}
                            className="text-xs font-medium text-violet-800 underline hover:text-violet-950"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            PDF
                          </a>
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
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-900">Registre des contrats</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Filtres produit, agence, statut contrat, période (mois en cours sur la date d’effet ou plage), étape du dossier
            lié. Périmètre agence appliqué côté serveur.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-cyan-50/30 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 sm:px-5">
          <label className="grid w-full min-w-0 gap-1 sm:w-auto sm:min-w-[140px] sm:max-w-[200px] sm:flex-1">
            <span className="text-[11px] font-medium text-slate-600">Réf.</span>
            <input
              type="search"
              value={listRefQuery}
              onChange={(e) => setListRefQuery(e.target.value)}
              placeholder="Contient…"
              className={inputClass}
              aria-label="Filtrer par référence"
            />
          </label>
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
                  {a.code} — {a.libelle}
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
              <option value="BROUILLON">Brouillon</option>
              <option value="SOUMIS">Soumis (att. N1)</option>
              <option value="VALIDE_N1">Validé N1 (att. N2)</option>
              <option value="VALIDE_N2">Validé N2 (à finaliser)</option>
              <option value="FINALISE">Finalisé</option>
              <option value="REJETE">Rejeté</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setListReloadTick((n) => n + 1)}
            className="rounded-lg border border-cyan-600 bg-cyan-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700"
          >
            Actualiser
          </button>
        </div>

        <div className="p-2 sm:p-0">
          {listError ? (
            <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {listError}
            </div>
          ) : null}
          {listLoading ? (
            <div className="px-4 py-6 sm:px-5">
              <div className="space-y-2 animate-pulse">
                <div className="h-9 rounded-lg bg-slate-100" />
                <div className="h-9 rounded-lg bg-slate-100" />
                <div className="h-9 rounded-lg bg-slate-100" />
                <div className="h-9 rounded-lg bg-slate-100" />
              </div>
              <p className="mt-3 text-center text-xs text-slate-500">Chargement des contrats…</p>
            </div>
          ) : !listError && contratsListe.length === 0 ? (
            <div className="px-4 py-8 text-center sm:px-5">
              <p className="text-sm font-medium text-slate-700">Aucun contrat ne correspond aux critères.</p>
              <p className="mt-1 text-xs text-slate-500">Ajustez les filtres puis cliquez sur “Actualiser”.</p>
            </div>
          ) : (
            <div className="w-full overflow-hidden rounded-b-2xl">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/90 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-2.5 sm:px-4">Réf.</th>
                    <th className="px-3 py-2.5 sm:px-4">Concessionnaire</th>
                    <th className="px-3 py-2.5 sm:px-4">Type</th>
                    <th className="px-3 py-2.5 sm:px-4">Date dépôt</th>
                    <th className="px-3 py-2.5 sm:px-4">Statut</th>
                    <th className="px-3 py-2.5 text-right sm:px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {contratsListe.map((c) => {
                    const etape = c.dossierEtape ?? "FINALISE";
                    const etatSuivi = contratSuiviEtat(etape, c.dateDepot ?? c.createdAt);
                    const etatBadge = contratSuiviBadge(etatSuivi);
                    const actionLabel = "Valider";
                    return (
                      <tr key={c.id} className="border-b border-slate-100 align-top transition-colors duration-150 hover:bg-cyan-50/60">
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-900 sm:px-4" title={c.reference}>
                          {c.reference}
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
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${etatBadge.className}`}
                          >
                            {etatBadge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right sm:px-4">
                          <button
                            type="button"
                            disabled={dossierActionBusyId === c.dossierId}
                            onClick={() => openDecision(c.dossierId, etape)}
                            className="inline-flex min-w-[110px] items-center justify-center rounded-lg border border-cyan-600 bg-cyan-600 px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-white shadow-sm transition-transform duration-150 hover:scale-[1.02] hover:border-cyan-700 hover:bg-cyan-700 disabled:opacity-60"
                          >
                            {dossierActionBusyId === c.dossierId ? "..." : actionLabel}
                          </button>
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
            {listTotal > listPageSize ? (
              <span className="text-slate-500">Affichage limité à {listPageSize} lignes.</span>
            ) : null}
          </div>
        ) : null}
      </section>

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
                      disabled={dossierActionBusyId === decisionDossierId || decisionPrimary === null}
                      onClick={() => void decideApprouver()}
                      className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform duration-150 hover:scale-[1.01] hover:border-sky-700 hover:bg-sky-700 disabled:opacity-60"
                    >
                      Approuver
                    </button>
                    <button
                      type="button"
                      disabled={dossierActionBusyId === decisionDossierId}
                      onClick={() => void decideRejeter()}
                      className="rounded-lg border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform duration-150 hover:scale-[1.01] hover:border-rose-700 hover:bg-rose-700 disabled:opacity-60"
                    >
                      Rejeter
                    </button>
                    <button
                      type="button"
                      disabled={dossierActionBusyId === decisionDossierId}
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nouveau-contrat-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Fermer"
            disabled={creating}
            onClick={() => setCreateOpen(false)}
          />
          <div className="relative z-10 flex max-h-[min(78vh,620px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-cyan-50 to-indigo-50 px-3.5 py-2.5">
              <div>
                <h3 id="nouveau-contrat-title" className="text-lg font-semibold text-slate-900">
                  Nouveau contrat
                </h3>
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
            <form noValidate onSubmit={onCreate} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 via-white to-white px-3.5 py-2">
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">
                    1. Identification PDV
                  </span>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-800">
                    2. Paramètres contrat
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    3. Validation
                  </span>
                </div>

                <div className="grid gap-2.5">
                  <section className="rounded-xl border border-cyan-200/80 bg-white p-2.5 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-800">
                      Point de vente
                    </p>
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">
                        Sélection du concessionnaire (recherche dans le référentiel) *
                      </span>
                      <div className="relative">
                        <input
                          type="search"
                          value={pdvQuery}
                          onChange={(e) => onPdvQueryChange(e.target.value)}
                          placeholder="Code PDV, nom, téléphone… (min. 2 caractères)"
                          autoComplete="off"
                          className={inputClass}
                          aria-label="Rechercher un point de vente"
                        />
                        {selectedPdv ? (
                          <button
                            type="button"
                            onClick={clearPdv}
                            className="mt-1 text-[11px] font-medium text-cyan-700 underline hover:text-cyan-900"
                          >
                            Effacer la sélection
                          </button>
                        ) : null}
                      </div>
                      {searchLoading ? <p className="text-[11px] text-slate-500">Recherche…</p> : null}
                      {showSearchPanel && searchResults.length > 0 ? (
                        <div
                          className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm"
                          role="group"
                          aria-label="Résultats de recherche concessionnaires"
                        >
                          {searchResults.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => pickPdv(c)}
                              className="flex w-full flex-wrap items-baseline gap-x-2 border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-800 transition-colors hover:bg-cyan-50 last:border-b-0"
                            >
                              <span className="font-mono text-xs text-slate-600">{c.codePdv}</span>
                              <span>{c.nomComplet || c.raisonSociale}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {showSearchPanel && !searchLoading && pdvQuery.trim().length >= 2 && searchResults.length === 0 ? (
                        <p className="text-[11px] text-slate-500">Aucun résultat.</p>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-xl border border-indigo-200/80 bg-white p-2.5 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
                      Détails du contrat
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <label className="grid gap-1 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-700">Sélection du produit *</span>
                        <select
                          required
                          value={produitCode}
                          onChange={(e) => setProduitCode(e.target.value)}
                          className={inputClass}
                          disabled={refLoading}
                        >
                          <option value="">{refLoading ? "Chargement des produits…" : "— Choisir un produit —"}</option>
                          {produitsTries.map((p) => {
                            const code = p.code;
                            const label = p.libelle;
                            const ok =
                              !selectedPdv ||
                              produitAutorisePourConcessionnaire(selectedPdv.produitsAutorises ?? [], code);
                            return (
                              <option key={code} value={code} disabled={!ok}>
                                {label}
                                {!ok ? " (non autorisé pour ce PDV)" : ""}
                              </option>
                            );
                          })}
                        </select>
                        {refError ? <span className="text-[11px] text-rose-700">{refError}</span> : null}
                        {!selectedPdv ? (
                          <span className="text-[11px] text-slate-500">
                            Après choix du PDV, seuls les produits autorisés sur sa fiche restent sélectionnables.
                          </span>
                        ) : (selectedPdv.produitsAutorises ?? []).length === 0 ? (
                          <span className="text-[11px] text-amber-800">
                            Aucun produit autorisé sur cette fiche PDV — complétez le référentiel concessionnaire.
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
                              {a.code} — {a.libelle}
                            </option>
                          ))}
                        </select>
                        {selectedPdv?.agenceId ? (
                          <span className="text-[11px] text-slate-500">
                            Doit correspondre au rattachement du PDV ({agencesTriees.find((x) => x.id === selectedPdv.agenceId)?.libelle ?? selectedPdv.agenceId}).
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
                          onChange={(e) => setOperationType(e.target.value as OperationType)}
                          className={inputClass}
                        >
                          <option value="NOUVEAU">NOUVEAU CONTRAT</option>
                          <option value="ACTUALISATION">ACTUALISATION D&apos;ANNEXE</option>
                        </select>
                      </label>
                    </div>
                  </section>

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
                      </label>
                    </section>
                  ) : null}

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
              <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-3.5 py-2">
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
                  accept=".json,.csv,.xlsx,.xls,.pdf"
                  className="sr-only"
                  onChange={(e) => void onImportFileChange(e)}
                />
                <div className="flex flex-wrap items-center gap-2">
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
                  <button
                    type="submit"
                    disabled={creating}
                    className="w-full rounded-lg border border-cyan-600 bg-cyan-600 px-3 py-2.5 text-sm font-medium text-white transition hover:border-cyan-700 hover:bg-cyan-700 disabled:opacity-60 sm:w-auto sm:min-w-[200px]"
                  >
                    {creating ? "Création…" : "Créer le dossier"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
