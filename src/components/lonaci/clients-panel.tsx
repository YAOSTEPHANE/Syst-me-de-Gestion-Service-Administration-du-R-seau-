"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Clipboard,
  Download,
  Eye,
  Import,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { StatusBadge, type Tone } from "@/components/lonaci/ui/badge";
import { Button, IconButton } from "@/components/lonaci/ui/button";
import { ConfirmDialog, Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { PageHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import {
  CLIENT_CODE_PREFIX,
  CLIENT_STATUT_LABELS,
  CLIENT_STATUTS,
  CLIENT_CATEGORIES,
  CLIENT_CATEGORIE_LABELS,
  CLIENT_TYPE_DISTRIBUTEUR,
  CLIENT_TYPE_DISTRIBUTEUR_LABELS,
  clientDisplayName,
  clientCodePrefixForAgence,
  type ClientCategorie,
  type ClientStatut,
  type ClientTypeDistributeur,
} from "@/lib/lonaci/client-constants";
import type { AgenceZoneGeographique, DossierDocumentChecklistPayload } from "@/lib/lonaci/types";
import { OTHER_PRODUCT_CODE } from "@/lib/lonaci/produit-constants";
import {
  buildChecklistFromTemplate,
  computeChecklistComplet,
  mergeProductChecklistTemplates,
} from "@/lib/lonaci/produit-document-checklist";
import { notify } from "@/lib/toast";
import {
  CLIENT_IMPORT_COLUMN_ORDER,
  CLIENT_IMPORT_HEADER_LABELS,
  mapClientImportRowFromRecord,
  matchAgenceFromImportToken,
  inferAgenceCodeFromClientCode,
} from "@/lib/lonaci/clients-import-map";
import { assertExcelImportAllowed } from "@/lib/spreadsheet/import-format-policy";
import ProduitSelectedPiecesChecklist from "@/components/lonaci/produit-selected-pieces-checklist";

function isMostlyEmptyImportRow(row: Record<string, unknown>): boolean {
  return !Object.values(row).some((value) => {
    if (typeof value === "number" && Number.isFinite(value)) return true;
    if (typeof value === "string") return value.trim().length > 0;
    return false;
  });
}

const FILTER_SANS_AGENCE = "__SANS_AGENCE__";
const FILTER_SANS_PRODUIT = "__SANS_PRODUIT__";

async function downloadClientsExcelTemplate(opts?: { produitCode?: string; agenceCode?: string }) {
  const XLSX = await import("xlsx");
  const frenchHeaders = CLIENT_IMPORT_COLUMN_ORDER.map((key) => CLIENT_IMPORT_HEADER_LABELS[key]);
  const produitSample = opts?.produitCode?.trim().toUpperCase() || "LOTO";
  const agenceSample = opts?.agenceCode?.trim().toUpperCase() || "ABOBO";
  const sampleByKey = {
    code: "000001",
    codeMachine: "TERM-001",
    categorie: "PARTICULIER",
    nomComplet: "KOUASSI JEAN",
    raisonSociale: "",
    cniNumero: "CNI123456789",
    nomContact: "KOUASSI JEAN",
    email: "jean.kouassi@example.test",
    telephone: "+2250700000000",
    typeDistributeur: "NOUVEAU",
    nombreTpm: "1",
    numeroDistributeur: "DIST-001",
    numeroTpm: "TPM-001",
    adresse: "Abidjan",
    ville: "Abidjan",
    codePostal: "",
    agence: agenceSample,
    produitsAutorises: produitSample,
    notes: "Exemple de ligne",
  };
  const sample = Object.fromEntries(
    CLIENT_IMPORT_COLUMN_ORDER.map((key) => [
      CLIENT_IMPORT_HEADER_LABELS[key],
      sampleByKey[key],
    ]),
  );
  const wsClients = XLSX.utils.json_to_sheet([sample], { header: frenchHeaders });
  const wsPerimetre = XLSX.utils.aoa_to_sheet([
    ["Périmètre d’import"],
    ["Agence", agenceSample],
    ["Produit", produitSample],
    ["Note", "Un fichier peut contenir plusieurs agences : chaque ligne est rangée selon sa colonne Agence."],
  ]);
  const wb = XLSX.utils.book_new();
  // Feuille données en premier : l’import lit la 1re feuille
  const sheetName = `clients-${agenceSample}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, wsClients, sheetName);
  XLSX.utils.book_append_sheet(wb, wsPerimetre, "Perimetre");
  XLSX.writeFile(wb, `liste-clients-${agenceSample}-${produitSample}.xlsx`);
}

const AGENCE_IMPORT_KEYS = [
  "agence",
  "Agence",
  "Agence (zone)",
  "Agence (Intérieur - Abidjan)",
  "agenceId",
  "agenceCode",
  "codeAgence",
  "code agence",
  "zone",
] as const;

type AgenceListItem = { id: string; code: string; libelle: string };

function analyzeAgencesInImportRows(
  rows: Record<string, unknown>[],
  agences: AgenceListItem[],
): {
  agencesDetectees: Array<{ id: string; libelle: string; count: number }>;
  lignesSansAgence: number;
  tokensNonResolus: string[];
} {
  const counts = new Map<string, number>();
  let lignesSansAgence = 0;
  const unresolved = new Set<string>();

  for (const row of rows) {
    const mapped = mapClientImportRowFromRecord(row);
    let token = mapped.agence.trim();
    if (!token) {
      const inferred = inferAgenceCodeFromClientCode(mapped.code);
      if (inferred) token = inferred;
    }

    if (!token) {
      lignesSansAgence += 1;
      continue;
    }

    const resolved = matchAgenceFromImportToken(token, agences);
    if (!resolved) {
      unresolved.add(token);
      lignesSansAgence += 1;
      continue;
    }
    counts.set(resolved.id, (counts.get(resolved.id) ?? 0) + 1);
  }

  const agencesDetectees = [...counts.entries()]
    .map(([id, count]) => {
      const ag = agences.find((a) => a.id === id);
      return {
        id,
        libelle: ag?.libelle ?? id,
        count,
      };
    })
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }));

  return {
    agencesDetectees,
    lignesSansAgence,
    tokensNonResolus: [...unresolved].slice(0, 8),
  };
}

async function normalizeClientsImportFile(file: File): Promise<Record<string, unknown>[]> {
  const lower = file.name.toLowerCase();
  /** Conserve les en-têtes Excel d’origine : le mapping final se fait côté serveur. */
  const keepRawRows = (rows: Record<string, unknown>[]) =>
    rows.filter((row) => !isMostlyEmptyImportRow(row));

  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(await file.text()) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return keepRawRows(rows as Record<string, unknown>[]);
  }
  if (lower.endsWith(".csv")) {
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    return keepRawRows(
      lines.slice(1).map((line) => {
        const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const row: Record<string, unknown> = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] ?? "";
        });
        return row;
      }),
    );
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    assertExcelImportAllowed("CLIENTS");
    const { readWorkbookFromArrayBuffer, sheetToJsonFirstSheet } = await import(
      "@/lib/spreadsheet/safe-xlsx-read",
    );
    const wb = await readWorkbookFromArrayBuffer(await file.arrayBuffer());
    const rows = await sheetToJsonFirstSheet<Record<string, unknown>>(wb, { defval: "" });
    return keepRawRows(rows);
  }
  throw new Error("Format non supporté. Utilisez .xlsx, .xls, .csv ou .json.");
}

type ListItem = {
  id: string;
  code: string;
  categorie: string;
  raisonSociale: string;
  nomComplet: string | null;
  codeMachine: string | null;
  cniNumero: string | null;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  typeDistributeur: string | null;
  nombreTpm: number | null;
  numeroDistributeur: string | null;
  numeroTpm: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
  statut: string;
  rejetMotif?: string | null;
  updatedAt: string;
};

type AgenceRef = {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  zoneGeographique?: AgenceZoneGeographique;
};

type ProduitRef = {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  documentsChecklist?: Array<{ id: string; libelle: string; obligatoire?: boolean }>;
};

type ClientDetail = {
  id: string;
  code: string;
  categorie: string;
  raisonSociale: string;
  nomComplet: string | null;
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
  agenceId: string | null;
  produitsAutorises: string[];
  statut: string;
  notes: string | null;
  documentChecklist: DossierDocumentChecklistPayload | null;
};

function produitsToDocumentRows(produits: ProduitRef[]) {
  return produits.map((p) => ({
    code: p.code,
    libelle: p.libelle,
    actif: p.actif,
    documentsChecklist: p.documentsChecklist,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

function applyPiecesFournies(
  checklist: DossierDocumentChecklistPayload | null,
  fourniIds: ReadonlySet<string>,
): DossierDocumentChecklistPayload | null {
  if (!checklist) return null;
  const entries = checklist.entries.map((entry) => ({
    ...entry,
    statut: fourniIds.has(entry.itemId)
      ? ("FOURNI" as const)
      : entry.statut === "MANQUANT"
        ? ("MANQUANT" as const)
        : ("EN_ATTENTE" as const),
  }));
  return { entries, complet: computeChecklistComplet(entries) };
}

function checklistToApiPatch(checklist: DossierDocumentChecklistPayload | null) {
  if (!checklist?.entries.length) return undefined;
  return checklist.entries.map((e) => ({ itemId: e.itemId, statut: e.statut }));
}

function libelleZoneGeographique(z: AgenceZoneGeographique | undefined): string {
  if (!z) return "";
  return z === "ABIDJAN" ? "Abidjan" : "Intérieur";
}

function libelleAgenceAvecZone(a: AgenceRef): string {
  const zone = libelleZoneGeographique(a.zoneGeographique);
  return zone ? `${a.libelle} (${zone})` : a.libelle;
}

const CLIENT_STATUS_TONES: Record<string, Tone> = {
  EN_ATTENTE_N1: "info",
  REJETE: "danger",
  DOSSIER_EN_COURS: "warning",
  ACTIF: "success",
  INACTIF: "neutral",
};

type ClientConfirmation = { kind: "deactivate"; id: string; code: string };

/** Fichier lu, en attente du choix agence + produit avant envoi. */
type PendingClientImport = {
  fileName: string;
  rows: Record<string, unknown>[];
  /** Répartition des agences détectées dans le fichier (libellé → nombre de lignes). */
  agencesDetectees: Array<{ id: string; libelle: string; count: number }>;
  lignesSansAgence: number;
  tokensNonResolus: string[];
};

export default function ClientsPanel() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [filterCategorie, setFilterCategorie] = useState("");
  const [filterAgence, setFilterAgence] = useState("");
  const [filterProduit, setFilterProduit] = useState("");
  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [produitsAutorises, setProduitsAutorises] = useState<string[]>([]);
  const [clientChecklist, setClientChecklist] = useState<DossierDocumentChecklistPayload | null>(null);
  const [meRole, setMeRole] = useState<string>("");
  const [importingFile, setImportingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ClientConfirmation | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingClientImport | null>(null);
  const [importProduitCode, setImportProduitCode] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateAgenceId, setTemplateAgenceId] = useState("");
  const [templateProduitCode, setTemplateProduitCode] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingClient, setViewingClient] = useState<ClientDetail | null>(null);
  const [editingClientCode, setEditingClientCode] = useState<string | null>(null);
  /** Affiché après création : identifiant client saisi pour la zone. */
  const [createdClient, setCreatedClient] = useState<{
    id: string;
    code: string;
    nomComplet: string;
    statut: string;
  } | null>(null);
  const [form, setForm] = useState({
    categorie: "PARTICULIER" as ClientCategorie,
    clientCodeSuffix: "",
    nomComplet: "",
    raisonSociale: "",
    codeMachine: "",
    cniNumero: "",
    nomContact: "",
    email: "",
    telephone: "",
    adresse: "",
    ville: "",
    codePostal: "",
    typeDistributeur: "" as "" | ClientTypeDistributeur,
    nombreTpm: "",
    numeroDistributeur: "",
    numeroTpm: "",
    agenceId: "",
    statut: "DOSSIER_EN_COURS" as ClientStatut,
    notes: "",
  });

  const agencesActives = useMemo(
    () =>
      [...agences.filter((a) => a.actif)].sort((a, b) =>
        a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }),
      ),
    [agences],
  );
  const selectedAgence = useMemo(
    () => agencesActives.find((a) => a.id === form.agenceId) ?? null,
    [agencesActives, form.agenceId],
  );
  const clientCodePrefixHint = selectedAgence
    ? clientCodePrefixForAgence(selectedAgence.code)
    : `${CLIENT_CODE_PREFIX}-…-`;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canDeactivate = meRole === "ASSIST_CDS" || meRole === "CHEF_SERVICE";
  const statutFilterOptions = useMemo(
    () => CLIENT_STATUTS.filter((s) => s !== "EN_ATTENTE_N1" && s !== "REJETE"),
    [],
  );
  const produitsTries = useMemo(
    () => [...produits].sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")),
    [produits],
  );
  const selectedProduitLabel = useMemo(() => {
    if (!filterProduit) return null;
    if (filterProduit === FILTER_SANS_PRODUIT) return "Sans produit";
    const found = produitsTries.find((p) => p.code === filterProduit);
    return found ? `${found.code} — ${found.libelle}` : filterProduit;
  }, [filterProduit, produitsTries]);
  const selectedAgenceLabel = useMemo(() => {
    if (!filterAgence) return null;
    if (filterAgence === FILTER_SANS_AGENCE) return "Sans agence";
    const found = agencesActives.find((a) => a.id === filterAgence);
    return found ? libelleAgenceAvecZone(found) : filterAgence;
  }, [filterAgence, agencesActives]);
  const selectedAgenceName = useMemo(() => {
    if (!filterAgence || filterAgence === FILTER_SANS_AGENCE) return null;
    return agencesActives.find((a) => a.id === filterAgence)?.libelle ?? null;
  }, [filterAgence, agencesActives]);
  const scopeImportLabel = useMemo(() => {
    if (!selectedAgenceName || !filterProduit) return null;
    return `${selectedAgenceName} · ${filterProduit}`;
  }, [selectedAgenceName, filterProduit]);

  const piecesFourniesIds = useMemo(
    () =>
      new Set(
        clientChecklist?.entries.filter((e) => e.statut === "FOURNI").map((e) => e.itemId) ?? [],
      ),
    [clientChecklist],
  );

  useEffect(() => {
    if (!modalOpen) return;
    const template = mergeProductChecklistTemplates(
      produitsAutorises,
      produitsToDocumentRows(produits),
    );
    setClientChecklist((prev) => buildChecklistFromTemplate(template, prev?.entries ?? null));
  }, [modalOpen, produitsAutorises, produits]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterCategorie) params.set("categorie", filterCategorie);
      if (filterAgence === FILTER_SANS_AGENCE) params.set("sansAgence", "true");
      else if (filterAgence) params.set("agenceId", filterAgence);
      if (filterProduit === FILTER_SANS_PRODUIT) params.set("sansProduit", "true");
      else if (filterProduit) params.set("produitCode", filterProduit);
      const res = await fetch(`/api/clients?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement impossible");
      }
      const data = (await res.json()) as { items: ListItem[]; total: number };
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger les clients.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, filterStatut, filterCategorie, filterAgence, filterProduit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [refRes, meRes] = await Promise.all([
          fetch("/api/referentials", { credentials: "include", cache: "no-store" }),
          fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
        ]);
        if (refRes.ok) {
          const data = (await refRes.json()) as { agences: AgenceRef[]; produits: ProduitRef[] };
          setAgences(data.agences ?? []);
          setProduits((data.produits ?? []).filter((p) => p.actif));
        }
        if (meRes.ok) {
          const me = (await meRes.json()) as { user: { role: string } };
          setMeRole(me.user?.role ?? "");
        }
      } catch {
        // silencieux : filtres agence restent vides
      }
    })();
  }, []);

  function resetForm() {
    setForm({
      categorie: "PARTICULIER",
      clientCodeSuffix: "",
      nomComplet: "",
      raisonSociale: "",
      codeMachine: "",
      cniNumero: "",
      nomContact: "",
      email: "",
      telephone: "",
      adresse: "",
      ville: "",
      codePostal: "",
      typeDistributeur: "",
      nombreTpm: "",
      numeroDistributeur: "",
      numeroTpm: "",
      agenceId: "",
      statut: "DOSSIER_EN_COURS",
      notes: "",
    });
    setEditingId(null);
    setEditingClientCode(null);
    setCreatedClient(null);
    setProduitsAutorises([]);
    setClientChecklist(null);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  function openCreate() {
    resetForm();
    if (filterProduit && filterProduit !== FILTER_SANS_PRODUIT) {
      setProduitsAutorises([filterProduit]);
    }
    if (filterAgence && filterAgence !== FILTER_SANS_AGENCE) {
      setForm((f) => ({ ...f, agenceId: filterAgence }));
    }
    setModalOpen(true);
  }

  async function onImportClientsFileChange(ev: ChangeEvent<HTMLInputElement>) {
    const source = ev.target.files?.[0];
    if (!source) return;
    try {
      if (agencesActives.length === 0) {
        throw new Error(
          "Référentiel des agences non chargé. Attendez quelques secondes puis réessayez.",
        );
      }

      const rawRows = await normalizeClientsImportFile(source);
      if (rawRows.length === 0) {
        throw new Error("Le fichier ne contient aucune ligne exploitable.");
      }

      const { agencesDetectees, lignesSansAgence, tokensNonResolus } = analyzeAgencesInImportRows(
        rawRows,
        agencesActives,
      );

      setImportProduitCode(
        filterProduit && filterProduit !== FILTER_SANS_PRODUIT ? filterProduit : "",
      );
      setPendingImport({
        fileName: source.name,
        rows: rawRows,
        agencesDetectees,
        lignesSansAgence,
        tokensNonResolus,
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Lecture du fichier impossible.");
    } finally {
      ev.target.value = "";
    }
  }

  async function confirmPendingImport() {
    if (!pendingImport || importingFile) return;

    const produitCode = importProduitCode.trim().toUpperCase();
    if (!produitCode) {
      notify.error("Choisissez le produit concerné par cet import.");
      return;
    }

    if (pendingImport.agencesDetectees.length === 0) {
      if (pendingImport.tokensNonResolus.length > 0) {
        notify.error(
          `Agences du fichier non reconnues : ${pendingImport.tokensNonResolus.join(", ")}. Vérifiez qu’elles existent dans le référentiel.`,
        );
      } else {
        notify.error(
          "Aucune agence détectée dans le fichier. Ajoutez une colonne Agence (code ou libellé) ou des codes CLI-{AGENCE}-…",
        );
      }
      return;
    }

    const rows = pendingImport.rows;

    setImportingFile(true);
    try {
      const res = await fetch("/api/clients/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, produitCode }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            message?: string;
            inserted?: number;
            updated?: number;
            unchanged?: number;
            skippedDuplicates?: number;
            failed?: number;
            results?: Array<{ row: number; ok: boolean; error?: string }>;
          }
        | null;
      if (!res.ok) {
        throw new Error(data?.message ?? "Import impossible");
      }

      const inserted = data?.inserted ?? 0;
      const updated = data?.updated ?? 0;
      const unchanged = data?.unchanged ?? data?.skippedDuplicates ?? 0;
      const failed = data?.failed ?? 0;
      const firstErrors = (data?.results ?? [])
        .filter((r) => !r.ok && r.error)
        .slice(0, 3)
        .map((r) => `L${r.row}: ${r.error}`)
        .join(" · ");

      setPage(1);
      setQ("");
      setFilterStatut("");
      setFilterCategorie("");
      setFilterAgence("");
      setFilterProduit(produitCode);
      const agencesCount = pendingImport.agencesDetectees.length;
      setPendingImport(null);

      setLoading(true);
      setError(null);
      try {
        const listParams = new URLSearchParams({
          page: "1",
          pageSize: String(pageSize),
          produitCode,
        });
        const listRes = await fetch(`/api/clients?${listParams}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!listRes.ok) {
          throw new Error("Rechargement de la liste impossible");
        }
        const listData = (await listRes.json()) as { items: ListItem[]; total: number };
        setItems(listData.items ?? []);
        setTotal(listData.total ?? 0);
      } catch (reloadErr) {
        setError(
          reloadErr instanceof Error ? reloadErr.message : "Impossible de recharger les clients.",
        );
      } finally {
        setLoading(false);
      }

      window.dispatchEvent(new Event("lonaci:data-imported"));

      const agencesLabel = agencesCount > 0 ? `${agencesCount} agence(s)` : "agences du fichier";
      if (inserted === 0 && updated === 0 && failed > 0 && unchanged === 0) {
        notify.error(
          firstErrors
            ? `Import impossible (${agencesLabel} · ${produitCode}). ${firstErrors}`
            : `Import impossible (${failed} erreur(s)).`,
        );
      } else {
        notify.success(
          `Import terminé (${agencesLabel} · ${produitCode}) : ${inserted} créé(s), ${updated} mis à jour, ${unchanged} inchangé(s)${failed ? `, ${failed} erreur(s)` : ""}.`,
        );
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Import clients impossible.");
    } finally {
      setImportingFile(false);
    }
  }

  function openTemplateDialog() {
    setTemplateAgenceId(filterAgence);
    setTemplateProduitCode(filterProduit);
    setTemplateDialogOpen(true);
  }

  function downloadTemplateFromDialog() {
    const produitCode = templateProduitCode.trim().toUpperCase();
    const agence = agencesActives.find((a) => a.id === templateAgenceId);
    if (!agence) {
      notify.error("Choisissez l’agence du modèle.");
      return;
    }
    if (!produitCode) {
      notify.error("Choisissez le produit du modèle.");
      return;
    }
    setTemplateDialogOpen(false);
    void downloadClientsExcelTemplate({
      produitCode,
      agenceCode: agence.code,
    });
  }

  async function fetchClientDetail(id: string): Promise<ClientDetail> {
    const res = await fetch(`/api/clients/${id}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error("CLIENT_LOAD_FAILED");
    const data = (await res.json()) as { client: ClientDetail };
    return data.client;
  }

  async function openView(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const client = await fetchClientDetail(id);
      setViewingClient(client);
    } catch {
      setError("Impossible de charger la fiche client.");
      notify.error("Impossible de charger la fiche client.");
    } finally {
      setBusyId(null);
    }
  }

  async function openEdit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const c = await fetchClientDetail(id);
      const agenceCode = agences.find((a) => a.id === c.agenceId)?.code ?? "";
      const codePrefix = agenceCode ? clientCodePrefixForAgence(agenceCode) : "";
      const codeUpper = c.code.trim().toUpperCase();
      const clientCodeSuffix =
        codePrefix && codeUpper.startsWith(codePrefix) ? codeUpper.slice(codePrefix.length) : codeUpper;
      const categorie = (CLIENT_CATEGORIES as readonly string[]).includes(c.categorie)
        ? (c.categorie as ClientCategorie)
        : "PARTICULIER";
      setEditingId(c.id);
      setEditingClientCode(c.code);
      setForm({
        clientCodeSuffix,
        categorie,
        nomComplet: c.nomComplet ?? "",
        raisonSociale: categorie === "ENTREPRISE" ? (c.raisonSociale ?? "") : "",
        codeMachine: c.codeMachine ?? "",
        cniNumero: c.cniNumero ?? "",
        nomContact: c.nomContact ?? "",
        email: c.email ?? "",
        telephone: c.telephone ?? "",
        adresse: c.adresse ?? "",
        ville: c.ville ?? "",
        codePostal: c.codePostal ?? "",
        typeDistributeur: (CLIENT_TYPE_DISTRIBUTEUR as readonly string[]).includes(c.typeDistributeur ?? "")
          ? (c.typeDistributeur as ClientTypeDistributeur)
          : "",
        nombreTpm: c.nombreTpm != null ? String(c.nombreTpm) : "",
        numeroDistributeur: c.numeroDistributeur ?? "",
        numeroTpm: c.numeroTpm ?? "",
        agenceId: c.agenceId ?? "",
        statut: (CLIENT_STATUTS as readonly string[]).includes(c.statut) ? (c.statut as ClientStatut) : "ACTIF",
        notes: c.notes ?? "",
      });
      setProduitsAutorises([...(c.produitsAutorises ?? [])]);
      setClientChecklist(c.documentChecklist ?? null);
      setModalOpen(true);
    } catch {
      setError("Impossible de charger la fiche client.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    const isEntreprise = form.categorie === "ENTREPRISE";
    if (isEntreprise && !form.raisonSociale.trim()) {
      setError("La raison sociale est obligatoire pour une entreprise.");
      return;
    }
    if (!isEntreprise && !form.nomComplet.trim()) {
      setError("Le nom complet est obligatoire pour un particulier.");
      return;
    }
    setBusyId(editingId ?? "new");
    setError(null);
    try {
      if (editingId) {
        const res = await fetch(`/api/clients/${editingId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categorie: form.categorie,
            nomComplet: form.nomComplet.trim() || null,
            raisonSociale: isEntreprise
              ? form.raisonSociale.trim()
              : form.nomComplet.trim(),
            codeMachine: form.codeMachine.trim() || null,
            cniNumero: form.cniNumero.trim() || null,
            nomContact: form.nomContact.trim() || null,
            email: form.email.trim() || null,
            telephone: form.telephone.trim() || null,
            adresse: form.adresse.trim() || null,
            ville: form.ville.trim() || null,
            codePostal: form.codePostal.trim() || null,
            typeDistributeur: form.typeDistributeur || null,
            nombreTpm: form.nombreTpm.trim() === "" ? null : Number(form.nombreTpm),
            numeroDistributeur: form.numeroDistributeur.trim() || null,
            numeroTpm: form.numeroTpm.trim() || null,
            agenceId: form.agenceId.trim() || null,
            statut: form.statut,
            notes: form.notes.trim() || null,
            produitsAutorises,
            documentChecklist: checklistToApiPatch(clientChecklist),
          }),
        });
        if (!res.ok) throw new Error();
      } else {
        if (!form.agenceId.trim()) {
          setError("Sélectionnez une agence de rattachement selon votre zone.");
          setBusyId(null);
          return;
        }
        if (!form.cniNumero.trim() || form.cniNumero.trim().length < 4) {
          setError("Le numéro CNI (identifiant client) est obligatoire (au moins 4 caractères).");
          setBusyId(null);
          return;
        }
        if (!form.clientCodeSuffix.trim()) {
          setError("Saisissez l’identifiant client pour la zone (unique dans l’agence).");
          setBusyId(null);
          return;
        }
        const res = await fetch("/api/clients", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: form.clientCodeSuffix.trim(),
            categorie: form.categorie,
            nomComplet: form.nomComplet.trim() || null,
            raisonSociale: isEntreprise
              ? form.raisonSociale.trim() || null
              : form.nomComplet.trim() || null,
            codeMachine: form.codeMachine.trim() || null,
            cniNumero: form.cniNumero.trim(),
            nomContact: form.nomContact.trim() || null,
            email: form.email.trim() || null,
            telephone: form.telephone.trim() || null,
            adresse: form.adresse.trim() || null,
            ville: form.ville.trim() || null,
            codePostal: form.codePostal.trim() || null,
            typeDistributeur: form.typeDistributeur || null,
            nombreTpm: form.nombreTpm.trim() === "" ? null : Number(form.nombreTpm),
            numeroDistributeur: form.numeroDistributeur.trim() || null,
            numeroTpm: form.numeroTpm.trim() || null,
            agenceId: form.agenceId.trim(),
            notes: form.notes.trim() || null,
            produitsAutorises,
            documentChecklist: checklistToApiPatch(clientChecklist),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message ?? "Création impossible.");
        }
        const data = (await res.json()) as { client: ClientDetail };
        setCreatedClient({
          id: data.client.id,
          code: data.client.code,
          nomComplet: clientDisplayName(data.client),
          statut: data.client.statut,
        });
        await load();
        return;
      }
      setModalOpen(false);
      resetForm();
      await load();
      notify.success("Client mis à jour.");
    } catch (err) {
      if (editingId) {
        notify.error(err, "Enregistrement impossible.");
      } else {
        setError(err instanceof Error ? err.message : "Création impossible.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deactivate(id: string, code: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
      await load();
      notify.success(`Client ${code} désactivé.`);
    } catch (error) {
      notify.error(error, "Désactivation impossible.");
    } finally {
      setBusyId(null);
    }
  }

  function agenceLabel(agenceId: string | null) {
    if (!agenceId) return "—";
    const ag = agences.find((a) => a.id === agenceId);
    return ag ? libelleAgenceAvecZone(ag) : agenceId;
  }

  /** Libellé court pour la colonne Agence du tableau. */
  function agenceLabelCourt(agenceId: string | null) {
    if (!agenceId) return "—";
    const ag = agences.find((a) => a.id === agenceId);
    if (!ag) return agenceId;
    const zone = libelleZoneGeographique(ag.zoneGeographique);
    return zone ? `${ag.libelle} (${zone})` : ag.libelle;
  }

  function statutLabelCourt(statut: string) {
    switch (statut) {
      case "EN_ATTENTE_N1":
      case "DOSSIER_EN_COURS":
        return "En cours";
      case "REJETE":
        return "Rejeté";
      case "ACTIF":
        return "Actif";
      case "INACTIF":
        return "Inactif";
      default:
        return CLIENT_STATUT_LABELS[statut as ClientStatut] ?? statut;
    }
  }

  async function exportClientsListToExcel() {
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
      });
      if (q.trim()) params.set("q", q.trim());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterCategorie) params.set("categorie", filterCategorie);
      if (filterAgence === FILTER_SANS_AGENCE) params.set("sansAgence", "true");
      else if (filterAgence) params.set("agenceId", filterAgence);
      if (filterProduit === FILTER_SANS_PRODUIT) params.set("sansProduit", "true");
      else if (filterProduit) params.set("produitCode", filterProduit);

      const allRows: ListItem[] = [];
      let pageCursor = 1;
      let totalCount = 0;
      do {
        params.set("page", String(pageCursor));
        const res = await fetch(`/api/clients?${params}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Export impossible");
        const data = (await res.json()) as { items: ListItem[]; total: number };
        totalCount = data.total ?? 0;
        allRows.push(...(data.items ?? []));
        pageCursor += 1;
      } while (allRows.length < totalCount && pageCursor <= 50);

      if (allRows.length === 0) {
        notify.error("Aucune ligne à exporter avec les filtres actuels.");
        return;
      }

      const XLSX = await import("xlsx");
      const frenchHeaders = CLIENT_IMPORT_COLUMN_ORDER.map((key) => CLIENT_IMPORT_HEADER_LABELS[key]);
      const exportRows = allRows.map((row) => {
        const ag = row.agenceId ? agences.find((a) => a.id === row.agenceId) : null;
        const codePrefix = ag ? clientCodePrefixForAgence(ag.code) : "";
        const codeUpper = row.code.trim().toUpperCase();
        const codeSuffix =
          codePrefix && codeUpper.startsWith(codePrefix)
            ? codeUpper.slice(codePrefix.length)
            : codeUpper;
        const contactName = row.nomContact?.trim() || "";
        const typeValue =
          row.typeDistributeur &&
          (CLIENT_TYPE_DISTRIBUTEUR as readonly string[]).includes(row.typeDistributeur)
            ? row.typeDistributeur
            : "";
        const byKey: Record<(typeof CLIENT_IMPORT_COLUMN_ORDER)[number], string | number> = {
          code: codeSuffix,
          codeMachine: row.codeMachine ?? "",
          categorie: row.categorie || "PARTICULIER",
          nomComplet: row.nomComplet ?? clientDisplayName(row),
          raisonSociale: row.raisonSociale ?? "",
          cniNumero: row.cniNumero ?? "",
          nomContact: contactName,
          email: row.email ?? "",
          telephone: row.telephone ?? "",
          typeDistributeur: typeValue,
          nombreTpm: row.nombreTpm ?? "",
          numeroDistributeur: row.numeroDistributeur ?? "",
          numeroTpm: row.numeroTpm ?? "",
          adresse: "",
          ville: "",
          codePostal: "",
          agence: ag?.code ?? "",
          produitsAutorises: (row.produitsAutorises ?? []).join(";"),
          notes: "",
        };
        return Object.fromEntries(
          CLIENT_IMPORT_COLUMN_ORDER.map((key) => [CLIENT_IMPORT_HEADER_LABELS[key], byKey[key]]),
        );
      });

      const ws = XLSX.utils.json_to_sheet(exportRows, { header: frenchHeaders });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "clients");
      const suffix = [selectedAgenceName, filterProduit].filter(Boolean).join("-");
      XLSX.writeFile(wb, suffix ? `liste-clients-${suffix}.xlsx` : "liste-clients.xlsx");
      notify.success(`${exportRows.length} client(s) exporté(s) dans liste-clients.xlsx.`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Export Excel impossible.");
    }
  }

  function displayNomPrincipal(row: ListItem): string {
    return clientDisplayName(row);
  }

  async function confirmClientAction() {
    if (!confirmation) return;
    await deactivate(confirmation.id, confirmation.code);
    setConfirmation(null);
  }

  function clientActions(row: ListItem, mobile = false) {
    if (!mobile) {
      return (
        <div className="inline-flex flex-nowrap items-center justify-end gap-0.5">
          <IconButton
            size="sm"
            variant="secondary"
            icon={Eye}
            label={`Voir fiche ${row.code}`}
            disabled={busyId === row.id}
            onClick={() => void openView(row.id)}
          />
          <IconButton
            size="sm"
            variant="secondary"
            icon={Pencil}
            label={`Modifier ${row.code}`}
            disabled={busyId === row.id}
            onClick={() => void openEdit(row.id)}
          />
          {canDeactivate ? (
            <IconButton
              size="sm"
              variant="danger"
              icon={Trash2}
              label={`Désactiver ${row.code}`}
              disabled={busyId === row.id || row.statut === "INACTIF"}
              onClick={() => setConfirmation({ kind: "deactivate", id: row.id, code: row.code })}
            />
          ) : null}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={Eye}
          disabled={busyId === row.id}
          onClick={() => void openView(row.id)}
        >
          Voir
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={Pencil}
          disabled={busyId === row.id}
          onClick={() => void openEdit(row.id)}
        >
          Modifier
        </Button>
        {canDeactivate ? (
          <Button
            size="sm"
            variant="danger"
            leadingIcon={Trash2}
            disabled={busyId === row.id || row.statut === "INACTIF"}
            onClick={() => setConfirmation({ kind: "deactivate", id: row.id, code: row.code })}
          >
            Désactiver
          </Button>
        ) : null}
      </div>
    );
  }

  const produitsAutorisesFields = (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Produits</p>
      <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
        <p className="mb-1 text-xs font-medium text-slate-700">Produits autorisés</p>
        <p className="mb-2 text-[11px] text-slate-600">
          Limite les produits proposés lors de la création de cautions pour ce client. Laissez vide pour
          autoriser tout le référentiel actif.
        </p>
        {produits.length === 0 ? (
          <p className="text-xs text-amber-800">
            Aucun produit actif chargé. Vérifiez le référentiel{" "}
            <span className="font-medium">Administration → Produits</span>, puis rouvrez ce formulaire.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {produits.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={produitsAutorises.includes(p.code)}
                  onChange={(e) =>
                    setProduitsAutorises((curr) =>
                      e.target.checked ? [...curr, p.code] : curr.filter((code) => code !== p.code),
                    )
                  }
                />
                <span>
                  {p.code} <span className="text-slate-500">({p.libelle})</span>
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs text-slate-800">
              <input
                type="checkbox"
                checked={produitsAutorises.includes(OTHER_PRODUCT_CODE)}
                onChange={(e) =>
                  setProduitsAutorises((curr) =>
                    e.target.checked
                      ? [...curr, OTHER_PRODUCT_CODE]
                      : curr.filter((code) => code !== OTHER_PRODUCT_CODE),
                  )
                }
              />
              <span>{OTHER_PRODUCT_CODE}</span>
            </label>
          </div>
        )}
        <ProduitSelectedPiecesChecklist
          selectedProduitCodes={produitsAutorises}
          produits={produits}
          className="mt-3"
          value={piecesFourniesIds}
          onChange={(ids) => setClientChecklist((prev) => applyPiecesFournies(prev, ids))}
        />
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Référentiel"
        title="Clients"
        description={
          scopeImportLabel
            ? `Liste filtrée sur ${selectedAgenceLabel ?? "agence"} · ${selectedProduitLabel ?? filterProduit}.`
            : `Comptes clients et tiers, distincts des concessionnaires PDV. À l’import, choisissez l’agence et le produit concernés.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              className="sr-only"
              aria-label="Importer des clients depuis un fichier Excel"
              onChange={(e) => void onImportClientsFileChange(e)}
            />
            <Button
              variant="secondary"
              leadingIcon={Download}
              onClick={() => void exportClientsListToExcel()}
            >
              Exporter la liste
            </Button>
            <Button variant="secondary" leadingIcon={Download} onClick={openTemplateDialog}>
              Modèle d’import
            </Button>
            <Button
              variant="secondary"
              leadingIcon={Import}
              disabled={importingFile}
              aria-busy={importingFile}
              onClick={() => importFileInputRef.current?.click()}
            >
              {importingFile ? "Import…" : "Importer Excel"}
            </Button>
            <Button leadingIcon={Plus} onClick={openCreate}>
              Nouveau client
            </Button>
          </div>
        }
      />

      {error ? (
        <FeedbackState tone="danger" title="Opération impossible" description={error} aria-live="assertive" />
      ) : null}

      <Surface elevated padding="sm" className="overflow-x-auto [scrollbar-width:thin]">
        <div
          className="flex min-w-max gap-1.5"
          role="tablist"
          aria-label="Filtrer les clients par agence"
          aria-orientation="horizontal"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!filterAgence}
            onClick={() => {
              setPage(1);
              setFilterAgence("");
            }}
            className={`inline-flex min-h-10 items-center rounded-xl px-3.5 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
              !filterAgence
                ? "bg-[#102a43] text-white shadow-md"
                : "text-slate-600 hover:bg-orange-50 hover:text-[#102a43]"
            }`}
          >
            Toutes les agences
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterAgence === FILTER_SANS_AGENCE}
            title="Clients sans agence renseignée (imports non catégorisés)"
            onClick={() => {
              setPage(1);
              setFilterAgence(FILTER_SANS_AGENCE);
            }}
            className={`inline-flex min-h-10 items-center rounded-xl px-3.5 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
              filterAgence === FILTER_SANS_AGENCE
                ? "bg-amber-700 text-white shadow-md"
                : "text-amber-800 hover:bg-amber-50"
            }`}
          >
            Sans agence
          </button>
          {agencesActives.map((a) => {
            const active = filterAgence === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={active}
                title={libelleAgenceAvecZone(a)}
                onClick={() => {
                  setPage(1);
                  setFilterAgence(a.id);
                }}
                className={`inline-flex min-h-10 items-center rounded-xl px-3.5 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
                  active
                    ? "bg-[#102a43] text-white shadow-md"
                    : "text-slate-600 hover:bg-orange-50 hover:text-[#102a43]"
                }`}
              >
                {a.libelle}
              </button>
            );
          })}
        </div>
      </Surface>

      <Surface elevated padding="sm" className="overflow-x-auto [scrollbar-width:thin]">
        <div
          className="flex min-w-max gap-1.5"
          role="tablist"
          aria-label="Filtrer les clients par produit"
          aria-orientation="horizontal"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!filterProduit}
            onClick={() => {
              setPage(1);
              setFilterProduit("");
            }}
            className={`inline-flex min-h-10 items-center rounded-xl px-3.5 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
              !filterProduit
                ? "bg-[#102a43] text-white shadow-md"
                : "text-slate-600 hover:bg-orange-50 hover:text-[#102a43]"
            }`}
          >
            Tous les produits
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterProduit === FILTER_SANS_PRODUIT}
            title="Clients sans produit rattaché (imports non catégorisés)"
            onClick={() => {
              setPage(1);
              setFilterProduit(FILTER_SANS_PRODUIT);
            }}
            className={`inline-flex min-h-10 items-center rounded-xl px-3.5 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
              filterProduit === FILTER_SANS_PRODUIT
                ? "bg-amber-700 text-white shadow-md"
                : "text-amber-800 hover:bg-amber-50"
            }`}
          >
            Sans produit
          </button>
          {produitsTries.map((p) => {
            const active = filterProduit === p.code;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                title={p.libelle}
                onClick={() => {
                  setPage(1);
                  setFilterProduit(p.code);
                }}
                className={`inline-flex min-h-10 items-center rounded-xl px-3.5 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
                  active
                    ? "bg-[#102a43] text-white shadow-md"
                    : "text-slate-600 hover:bg-orange-50 hover:text-[#102a43]"
                }`}
              >
                {p.code}
              </button>
            );
          })}
        </div>
      </Surface>

      <Surface elevated>
        <FilterBar
          search={{
            value: q,
            onChange: (value) => {
              setPage(1);
              setQ(value);
            },
            label: "Rechercher un client",
            placeholder: "Nom, raison sociale, CNI, code, téléphone…",
          }}
          filters={
            <>
          <select
            value={filterStatut}
            aria-label="Statut"
            onChange={(e) => {
              setPage(1);
              setFilterStatut(e.target.value);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Tous les statuts</option>
            {statutFilterOptions.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUT_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={filterCategorie}
            aria-label="Catégorie"
            onChange={(e) => {
              setPage(1);
              setFilterCategorie(e.target.value);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Toutes les catégories</option>
            {CLIENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CLIENT_CATEGORIE_LABELS[c]}
              </option>
            ))}
          </select>
            </>
          }
          actions={
            <Button
              variant="secondary"
              leadingIcon={RotateCcw}
              onClick={() => {
              setPage(1);
              setQ("");
              setFilterStatut("");
              setFilterCategorie("");
              setFilterAgence("");
              setFilterProduit("");
            }}
            >
              Réinitialiser
            </Button>
          }
        />

        <div className="my-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">
            {total} client(s)
            {scopeImportLabel ? (
              <span className="ml-2 font-normal text-slate-500">· {scopeImportLabel}</span>
            ) : selectedAgenceLabel || selectedProduitLabel ? (
              <span className="ml-2 font-normal text-slate-500">
                · {[selectedAgenceLabel, selectedProduitLabel].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </p>
          <Pagination
            page={page}
            pageCount={totalPages}
            onPageChange={setPage}
            label="Pagination des clients"
          />
        </div>

        {loading ? (
          <FeedbackState title="Chargement des clients" description="La liste est en cours de mise à jour." />
        ) : items.length === 0 ? (
          <FeedbackState
            title="Aucun client"
            description={
              filterAgence === FILTER_SANS_AGENCE || filterProduit === FILTER_SANS_PRODUIT
                ? "Ces clients viennent d’un import non catégorisé. Réimportez le fichier en choisissant l’agence et le produit pour les rattacher."
                : filterAgence || filterProduit
                  ? `Aucun client pour ${[selectedAgenceLabel, selectedProduitLabel].filter(Boolean).join(" · ")} avec les filtres actuels.`
                  : "Aucun client ne correspond aux filtres actuels."
            }
          />
        ) : (
          <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] border-collapse text-left text-xs leading-snug">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
              <col className="w-[6%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="whitespace-nowrap px-2 py-2 font-semibold">Nom complet</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">Contact</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">Type distributeur</th>
                <th className="whitespace-nowrap px-2 py-2 text-center font-semibold">Nb TPM</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold" title="Agence (Intérieur - Abidjan)">
                  Agence
                </th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">N° Distrib.</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">N° TPM</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">Code</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">Statut</th>
                <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const contactLine =
                  row.nomContact?.trim() ||
                  [row.telephone, row.email].filter(Boolean).join(" · ") ||
                  "—";
                const contactTitle = [row.nomContact, row.telephone, row.email]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-orange-50/40"
                  >
                    <td
                      className="truncate px-2 py-2 font-medium text-slate-900"
                      title={displayNomPrincipal(row)}
                    >
                      {displayNomPrincipal(row)}
                    </td>
                    <td className="truncate px-2 py-2 text-slate-700" title={contactTitle || undefined}>
                      {contactLine}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-700">
                      {row.typeDistributeur &&
                      (CLIENT_TYPE_DISTRIBUTEUR as readonly string[]).includes(row.typeDistributeur)
                        ? CLIENT_TYPE_DISTRIBUTEUR_LABELS[row.typeDistributeur as ClientTypeDistributeur]
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-center font-mono text-[11px] text-slate-700">
                      {row.nombreTpm != null ? row.nombreTpm : "—"}
                    </td>
                    <td
                      className="truncate px-2 py-2 text-slate-600"
                      title={agenceLabel(row.agenceId)}
                    >
                      {agenceLabelCourt(row.agenceId)}
                    </td>
                    <td className="truncate px-2 py-2 font-mono text-[11px] text-slate-700" title={row.numeroDistributeur ?? undefined}>
                      {row.numeroDistributeur?.trim() || "—"}
                    </td>
                    <td className="truncate px-2 py-2 font-mono text-[11px] text-slate-700" title={row.numeroTpm ?? undefined}>
                      {row.numeroTpm?.trim() || "—"}
                    </td>
                    <td className="truncate px-2 py-2 font-mono text-[11px] text-slate-800" title={row.code}>
                      {row.code}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <StatusBadge
                        tone={CLIENT_STATUS_TONES[row.statut] ?? "neutral"}
                        title={CLIENT_STATUT_LABELS[row.statut as ClientStatut] ?? row.statut}
                        className="max-w-full"
                      >
                        {statutLabelCourt(row.statut)}
                      </StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      {clientActions(row)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:hidden" role="list" aria-label="Clients">
          {items.map((row) => (
            <article key={row.id} role="listitem" className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-orange-700">{row.code}</p>
                  <h3 className="mt-1 text-base font-bold text-slate-950">{displayNomPrincipal(row)}</h3>
                </div>
                <StatusBadge
                  tone={CLIENT_STATUS_TONES[row.statut] ?? "neutral"}
                  title={CLIENT_STATUT_LABELS[row.statut as ClientStatut] ?? row.statut}
                >
                  {statutLabelCourt(row.statut)}
                </StatusBadge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2">
                  <dt className="font-semibold text-slate-500">Contact</dt>
                  <dd className="mt-1">
                    {row.nomContact?.trim() ||
                      [row.telephone, row.email].filter(Boolean).join(" · ") ||
                      "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Type distributeur</dt>
                  <dd className="mt-1">
                    {row.typeDistributeur &&
                    (CLIENT_TYPE_DISTRIBUTEUR as readonly string[]).includes(row.typeDistributeur)
                      ? CLIENT_TYPE_DISTRIBUTEUR_LABELS[row.typeDistributeur as ClientTypeDistributeur]
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Nb TPM</dt>
                  <dd className="mt-1">{row.nombreTpm != null ? row.nombreTpm : "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-semibold text-slate-500">Agence (Intérieur - Abidjan)</dt>
                  <dd className="mt-1">{agenceLabel(row.agenceId)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">N° Distributeur</dt>
                  <dd className="mt-1 font-mono text-xs">{row.numeroDistributeur?.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">N° TPM</dt>
                  <dd className="mt-1 font-mono text-xs">{row.numeroTpm?.trim() || "—"}</dd>
                </div>
              </dl>
              <div className="mt-4 border-t border-slate-100 pt-4">{clientActions(row, true)}</div>
            </article>
          ))}
        </div>
          </>
        )}
      </Surface>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && !busyId) closeModal();
        }}
        title={createdClient ? "Client enregistré" : editingId ? "Modifier le client" : "Nouveau client"}
        description={
          createdClient
            ? "Conservez et communiquez l’identifiant client."
            : "Les libellés et règles métier restent visibles pendant la saisie."
        }
        size="lg"
      >
            {createdClient ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Le compte de <strong className="text-slate-900">{createdClient.nomComplet}</strong> a été créé avec
                  le statut{" "}
                  <strong className="text-slate-900">{CLIENT_STATUT_LABELS.DOSSIER_EN_COURS}</strong>. Vous pouvez
                  constituer une caution dès maintenant.
                </p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Identifiant client (zone)
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tracking-wide text-emerald-950">
                    {createdClient.code}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <Button
                    variant="secondary"
                    leadingIcon={Clipboard}
                    onClick={() => {
                      void navigator.clipboard.writeText(createdClient.code).then(
                        () => notify.success("Code client copié."),
                        (error: unknown) => notify.error(error, "Copie du code impossible."),
                      );
                    }}
                  >
                    Copier le code
                  </Button>
                  <Button onClick={closeModal}>
                    Fermer
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <form onSubmit={(e) => void saveClient(e)} className="space-y-3">
                  {editingId && editingClientCode ? (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
                        Identifiant client
                      </p>
                      <p className="mt-0.5 font-mono text-lg font-semibold text-indigo-950">{editingClientCode}</p>
                      <p className="mt-1 text-xs text-slate-600">Attribué à la zone à la création — non modifiable.</p>
                    </div>
                  ) : null}
                  {editingId ? (
                meRole === "CHEF_SERVICE" ? (
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      Agence (Intérieur - Abidjan) <span className="text-slate-500">(zone)</span>
                    </span>
                    <select
                      required
                      aria-label="Agence de rattachement selon la zone"
                      value={form.agenceId}
                      onChange={(e) => setForm((f) => ({ ...f, agenceId: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {agencesActives.map((a) => (
                        <option key={a.id} value={a.id}>
                          {libelleAgenceAvecZone(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Agence (Intérieur - Abidjan)
                    </div>
                    <p className="mt-0.5 text-slate-800">{agenceLabel(form.agenceId) || "—"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Seul le rôle Chef(fe) de service peut modifier l’agence.
                    </p>
                  </div>
                )
              ) : null}
              {produitsAutorisesFields}
              <label className="block text-sm">
                <span className="text-slate-600">Catégorie *</span>
                <select
                  required
                  aria-label="Catégorie du client"
                  value={form.categorie}
                  onChange={(e) => {
                    const next = e.target.value as ClientCategorie;
                    setForm((f) => ({
                      ...f,
                      categorie: next,
                      raisonSociale: next === "ENTREPRISE" ? f.raisonSociale : "",
                      nomComplet: next === "ENTREPRISE" ? f.nomComplet : f.nomComplet || f.raisonSociale,
                    }));
                  }}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {CLIENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CLIENT_CATEGORIE_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              {!editingId ? (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Fiche complète — nouveau client
                  </p>
                  <p className="text-xs text-slate-600">
                    Saisissez un identifiant unique dans votre zone (format {CLIENT_CODE_PREFIX}-code agence-suffixe).
                    Statut initial :{" "}
                    <span className="font-medium text-amber-900">{CLIENT_STATUT_LABELS.DOSSIER_EN_COURS}</span> — le
                    client est immédiatement éligible à une caution.
                  </p>
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      Agence (Intérieur - Abidjan) <span className="text-slate-500">(selon votre zone)</span> *
                    </span>
                    <select
                      required
                      aria-label="Agence de rattachement selon la zone"
                      value={form.agenceId}
                      onChange={(e) => setForm((f) => ({ ...f, agenceId: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">— Choisir une agence —</option>
                      {agencesActives.map((a) => (
                        <option key={a.id} value={a.id}>
                          {libelleAgenceAvecZone(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      Identifiant client (zone) <span className="text-rose-600">*</span>
                    </span>
                    <div className="mt-1 flex rounded border border-slate-300 bg-white text-sm focus-within:ring-2 focus-within:ring-indigo-500">
                      <span className="shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                        {clientCodePrefixHint}
                      </span>
                      <input
                        required
                        disabled={!form.agenceId}
                        value={form.clientCodeSuffix}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            clientCodeSuffix: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                          }))
                        }
                        placeholder={form.agenceId ? "000042" : "Choisir une agence d’abord"}
                        className="min-w-0 flex-1 rounded-r border-0 bg-transparent px-3 py-2 font-mono focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                        autoComplete="off"
                        aria-label="Suffixe identifiant client unique dans la zone"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Saisie manuelle : l’identifiant ne doit pas déjà exister dans cette agence.
                    </p>
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      {form.categorie === "ENTREPRISE" ? "Raison sociale *" : "Nom complet *"}
                    </span>
                    <input
                      required
                      value={form.categorie === "ENTREPRISE" ? form.raisonSociale : form.nomComplet}
                      onChange={(e) =>
                        setForm((f) =>
                          f.categorie === "ENTREPRISE"
                            ? { ...f, raisonSociale: e.target.value }
                            : { ...f, nomComplet: e.target.value },
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      autoComplete={form.categorie === "ENTREPRISE" ? "organization" : "name"}
                    />
                  </label>
                  {form.categorie === "ENTREPRISE" ? (
                    <label className="block text-sm">
                      <span className="text-slate-600">Nom du contact / représentant (optionnel)</span>
                      <input
                        value={form.nomComplet}
                        onChange={(e) => setForm((f) => ({ ...f, nomComplet: e.target.value }))}
                        placeholder="Personne à joindre au sein de l’entreprise"
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                        autoComplete="name"
                      />
                    </label>
                  ) : null}
                  <label className="block text-sm">
                    <span className="text-slate-600">Code machine</span>
                    <input
                      value={form.codeMachine}
                      onChange={(e) => setForm((f) => ({ ...f, codeMachine: e.target.value }))}
                      placeholder="Ex. TERM-001"
                      maxLength={64}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Identifiant client (N° CNI) *</span>
                    <input
                      required
                      minLength={4}
                      value={form.cniNumero}
                      onChange={(e) => setForm((f) => ({ ...f, cniNumero: e.target.value }))}
                      placeholder="Numéro de carte nationale d’identité"
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                      autoComplete="off"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-slate-600">Type de distributeur</span>
                      <select
                        value={form.typeDistributeur}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            typeDistributeur: e.target.value as "" | ClientTypeDistributeur,
                          }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {CLIENT_TYPE_DISTRIBUTEUR.map((t) => (
                          <option key={t} value={t}>
                            {CLIENT_TYPE_DISTRIBUTEUR_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-600">Nombre de TPM</span>
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        value={form.nombreTpm}
                        onChange={(e) => setForm((f) => ({ ...f, nombreTpm: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-600">N° Distributeur</span>
                      <input
                        value={form.numeroDistributeur}
                        onChange={(e) => setForm((f) => ({ ...f, numeroDistributeur: e.target.value }))}
                        maxLength={64}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                        autoComplete="off"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-600">N° TPM</span>
                      <input
                        value={form.numeroTpm}
                        onChange={(e) => setForm((f) => ({ ...f, numeroTpm: e.target.value }))}
                        maxLength={64}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Coordonnées de contact
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="text-slate-600">Téléphone</span>
                        <input
                          value={form.telephone}
                          onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="tel"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-slate-600">E-mail</span>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="email"
                        />
                      </label>
                    </div>
                  </div>
                  <label className="block text-sm">
                    <span className="text-slate-600">Contact</span>
                    <input
                      value={form.nomContact}
                      onChange={(e) => setForm((f) => ({ ...f, nomContact: e.target.value }))}
                      placeholder="Nom de la personne à joindre"
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Adresse</span>
                    <input
                      value={form.adresse}
                      onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-slate-600">Ville</span>
                      <input
                        value={form.ville}
                        onChange={(e) => setForm((f) => ({ ...f, ville: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-600">Code postal</span>
                      <input
                        value={form.codePostal}
                        onChange={(e) => setForm((f) => ({ ...f, codePostal: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block text-sm">
                    <span className="text-slate-600">Notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={3}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              ) : (
                <>
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      {form.categorie === "ENTREPRISE" ? "Raison sociale *" : "Nom complet *"}
                    </span>
                    <input
                      required
                      value={form.categorie === "ENTREPRISE" ? form.raisonSociale : form.nomComplet}
                      onChange={(e) =>
                        setForm((f) =>
                          f.categorie === "ENTREPRISE"
                            ? { ...f, raisonSociale: e.target.value }
                            : { ...f, nomComplet: e.target.value },
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      autoComplete={form.categorie === "ENTREPRISE" ? "organization" : "name"}
                    />
                  </label>
                  {form.categorie === "ENTREPRISE" ? (
                    <label className="block text-sm">
                      <span className="text-slate-600">Nom du contact / représentant</span>
                      <input
                        value={form.nomComplet}
                        onChange={(e) => setForm((f) => ({ ...f, nomComplet: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        autoComplete="name"
                      />
                    </label>
                  ) : null}
                  <label className="block text-sm">
                    <span className="text-slate-600">Code machine</span>
                    <input
                      value={form.codeMachine}
                      onChange={(e) => setForm((f) => ({ ...f, codeMachine: e.target.value }))}
                      placeholder="Ex. TERM-001"
                      maxLength={64}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Identifiant client (N° CNI)</span>
                    <input
                      value={form.cniNumero}
                      onChange={(e) => setForm((f) => ({ ...f, cniNumero: e.target.value }))}
                      placeholder="Carte nationale d’identité"
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                      autoComplete="off"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-slate-600">Type de distributeur</span>
                      <select
                        value={form.typeDistributeur}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            typeDistributeur: e.target.value as "" | ClientTypeDistributeur,
                          }))
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">—</option>
                        {CLIENT_TYPE_DISTRIBUTEUR.map((t) => (
                          <option key={t} value={t}>
                            {CLIENT_TYPE_DISTRIBUTEUR_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-600">Nombre de TPM</span>
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        value={form.nombreTpm}
                        onChange={(e) => setForm((f) => ({ ...f, nombreTpm: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-600">N° Distributeur</span>
                      <input
                        value={form.numeroDistributeur}
                        onChange={(e) => setForm((f) => ({ ...f, numeroDistributeur: e.target.value }))}
                        maxLength={64}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                        autoComplete="off"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-600">N° TPM</span>
                      <input
                        value={form.numeroTpm}
                        onChange={(e) => setForm((f) => ({ ...f, numeroTpm: e.target.value }))}
                        maxLength={64}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Coordonnées de contact
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="text-slate-600">Téléphone</span>
                        <input
                          value={form.telephone}
                          onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="tel"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-slate-600">E-mail</span>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="email"
                        />
                      </label>
                    </div>
                  </div>
                  <label className="block text-sm">
                    <span className="text-slate-600">Contact</span>
                    <input
                      value={form.nomContact}
                      onChange={(e) => setForm((f) => ({ ...f, nomContact: e.target.value }))}
                      placeholder="Nom de la personne à joindre"
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                </>
              )}
              {editingId && meRole === "CHEF_SERVICE" ? (
                <label className="block text-sm">
                  <span className="text-slate-600">Statut (administration)</span>
                  <select
                    value={form.statut}
                    aria-label="Statut du client"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, statut: e.target.value as ClientStatut }))
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  >
                    {statutFilterOptions.map((s) => (
                      <option key={s} value={s}>
                        {CLIENT_STATUT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : editingId ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Statut</div>
                  <p className="mt-0.5 text-slate-800">
                    {CLIENT_STATUT_LABELS[form.statut] ?? form.statut}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Les changements de statut passent par le paiement de caution ou une action Chef de service.
                  </p>
                </div>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={closeModal}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={Boolean(busyId)}
                  loading={Boolean(busyId)}
                >
                  Enregistrer
                </Button>
              </div>
            </form>
              </>
            )}
      </Dialog>

      <Dialog
        open={viewingClient !== null}
        onOpenChange={(open) => {
          if (!open) setViewingClient(null);
        }}
        title={viewingClient ? `Fiche client — ${viewingClient.code}` : "Fiche client"}
        description="Consultation en lecture seule."
        size="lg"
      >
        {viewingClient ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identité</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{clientDisplayName(viewingClient)}</p>
              <p className="mt-1 font-mono text-sm text-slate-700">{viewingClient.code}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <StatusBadge
                  tone={
                    viewingClient.categorie === "ENTREPRISE" ? "brand" : "neutral"
                  }
                >
                  {CLIENT_CATEGORIE_LABELS[
                    (CLIENT_CATEGORIES as readonly string[]).includes(viewingClient.categorie)
                      ? (viewingClient.categorie as ClientCategorie)
                      : "PARTICULIER"
                  ]}
                </StatusBadge>
                <StatusBadge tone="info">
                  {CLIENT_STATUT_LABELS[
                    (CLIENT_STATUTS as readonly string[]).includes(viewingClient.statut)
                      ? (viewingClient.statut as ClientStatut)
                      : "ACTIF"
                  ] ?? viewingClient.statut}
                </StatusBadge>
              </div>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: viewingClient.categorie === "ENTREPRISE" ? "Raison sociale" : "Nom complet",
                  value:
                    viewingClient.categorie === "ENTREPRISE"
                      ? viewingClient.raisonSociale
                      : viewingClient.nomComplet || viewingClient.raisonSociale,
                },
                ...(viewingClient.categorie === "ENTREPRISE"
                  ? [{ label: "Contact / représentant", value: viewingClient.nomComplet }]
                  : []),
                { label: "N° CNI", value: viewingClient.cniNumero },
                { label: "Code machine", value: viewingClient.codeMachine },
                {
                  label: "Type de distributeur",
                  value:
                    viewingClient.typeDistributeur &&
                    (CLIENT_TYPE_DISTRIBUTEUR as readonly string[]).includes(viewingClient.typeDistributeur)
                      ? CLIENT_TYPE_DISTRIBUTEUR_LABELS[viewingClient.typeDistributeur as ClientTypeDistributeur]
                      : viewingClient.typeDistributeur,
                },
                {
                  label: "Nombre de TPM",
                  value: viewingClient.nombreTpm != null ? String(viewingClient.nombreTpm) : null,
                },
                { label: "N° Distributeur", value: viewingClient.numeroDistributeur },
                { label: "N° TPM", value: viewingClient.numeroTpm },
                { label: "Contact", value: viewingClient.nomContact },
                { label: "E-mail", value: viewingClient.email },
                { label: "Téléphone", value: viewingClient.telephone },
                { label: "Adresse", value: viewingClient.adresse },
                { label: "Ville", value: viewingClient.ville },
                { label: "Code postal", value: viewingClient.codePostal },
                { label: "Agence", value: agenceLabel(viewingClient.agenceId) },
                {
                  label: "Produits autorisés",
                  value:
                    viewingClient.produitsAutorises.length > 0
                      ? viewingClient.produitsAutorises.join(", ")
                      : "Tous (référentiel actif)",
                },
                { label: "Notes", value: viewingClient.notes },
              ].map((row) => (
                <div key={row.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 break-words text-sm text-slate-900">{row.value?.trim() || "—"}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setViewingClient(null)}>
                Fermer
              </Button>
              <Button
                leadingIcon={Pencil}
                onClick={() => {
                  const id = viewingClient.id;
                  setViewingClient(null);
                  void openEdit(id);
                }}
              >
                Modifier
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open && !importingFile) {
            setPendingImport(null);
            setImportProduitCode("");
          }
        }}
        title="Importer la liste clients"
        description="Chaque client est rangé automatiquement dans l’agence indiquée sur sa ligne (colonne Agence ou code CLI-{AGENCE}-…). Choisissez uniquement le produit."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (!importingFile) setPendingImport(null);
              }}
              disabled={importingFile}
            >
              Annuler
            </Button>
            <Button
              leadingIcon={Import}
              loading={importingFile}
              onClick={() => void confirmPendingImport()}
            >
              Importer
            </Button>
          </>
        }
      >
        {pendingImport ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {pendingImport.rows.length} ligne(s) · {pendingImport.fileName}
            </p>
            {pendingImport.agencesDetectees.length > 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="font-semibold text-slate-700">Agences détectées dans le fichier</p>
                <ul className="mt-1 space-y-0.5 text-slate-600">
                  {pendingImport.agencesDetectees.map((a) => (
                    <li key={a.id}>
                      {a.libelle} — {a.count} client(s)
                    </li>
                  ))}
                </ul>
                {pendingImport.lignesSansAgence > 0 ? (
                  <p className="mt-2 text-xs text-amber-800">
                    {pendingImport.lignesSansAgence} ligne(s) sans agence reconnue
                    {pendingImport.tokensNonResolus.length > 0
                      ? ` (ex. : ${pendingImport.tokensNonResolus.join(", ")})`
                      : ""}
                    .
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {pendingImport.tokensNonResolus.length > 0 ? (
                  <>
                    Valeurs d’agence non reconnues dans le fichier :{" "}
                    <strong>{pendingImport.tokensNonResolus.join(", ")}</strong>. Elles doivent
                    correspondre au code ou au libellé du référentiel.
                  </>
                ) : (
                  <>
                    Aucune colonne Agence détectée. Le fichier doit contenir une colonne Agence
                    (code ou libellé) ou des codes au format CLI-{"{AGENCE}"}-….
                  </>
                )}
              </p>
            )}
            <label className="block space-y-1 text-sm">
              <span className="font-semibold text-slate-700">Produit concerné</span>
              <select
                value={importProduitCode}
                onChange={(e) => setImportProduitCode(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                aria-label="Produit d’import"
                disabled={importingFile}
              >
                <option value="">Sélectionner un produit</option>
                {produitsTries.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.code} — {p.libelle}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={templateDialogOpen}
        onOpenChange={(open) => {
          if (!open) setTemplateDialogOpen(false);
        }}
        title="Modèle d’import"
        description="Choisissez l’agence et le produit pour générer le fichier modèle."
        footer={
          <>
            <Button variant="secondary" onClick={() => setTemplateDialogOpen(false)}>
              Annuler
            </Button>
            <Button leadingIcon={Download} onClick={downloadTemplateFromDialog}>
              Télécharger
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-slate-700">Agence</span>
            <select
              value={templateAgenceId}
              onChange={(e) => setTemplateAgenceId(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              aria-label="Agence du modèle"
            >
              <option value="">Sélectionner une agence</option>
              {agencesActives.map((a) => (
                <option key={a.id} value={a.id}>
                  {libelleAgenceAvecZone(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold text-slate-700">Produit</span>
            <select
              value={templateProduitCode}
              onChange={(e) => setTemplateProduitCode(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              aria-label="Produit du modèle"
            >
              <option value="">Sélectionner un produit</option>
              {produitsTries.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.code} — {p.libelle}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busyId) setConfirmation(null);
        }}
        title="Désactiver le client"
        message={`Le client ${confirmation?.code ?? ""} passera au statut inactif.`}
        confirmLabel="Désactiver"
        destructive
        pending={Boolean(busyId)}
        onConfirm={confirmClientAction}
      />
    </div>
  );
}
