"use client";

import ClientSearchPicker, {
  pickAgenceIdFromClient,
  pickProduitCodeFromClient,
  type ClientPickerRow,
} from "@/components/lonaci/client-search-picker";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { captureByAliases, extractPdfText, normalizeDateToIso } from "@/lib/lonaci/pdf-import";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import type { LonaciRole } from "@/lib/lonaci/constants";
import {
  getAssignedWorkflowTarget,
  getRoleWorkflowFilterStatuses,
  parseLonaciRole,
} from "@/lib/lonaci/workflow-ui-policy";
import { notify } from "@/lib/toast";
import { Download, FilePlus2, FileText, Upload } from "lucide-react";
import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { FormField } from "@/components/lonaci/ui/form-field";
import { PageHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import {
  AGREMENT_IMPORT_COLUMN_ORDER,
  AGREMENT_IMPORT_HEADER_LABELS,
  mapAgrementImportRowFromRecord,
} from "@/lib/lonaci/agrements-import-map";
import { matchAgenceFromImportToken } from "@/lib/lonaci/clients-import-map";
import { assertExcelImportAllowed } from "@/lib/spreadsheet/import-format-policy";

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

function transitionLabel(target: AgrementStatus): string {
  if (target === "CONTROLE") return "Contrôler";
  if (target === "TRANSMIS") return "Transmettre";
  return "Finaliser";
}

async function downloadAgrementsExcelTemplate(opts?: { produitCode?: string }) {
  const XLSX = await import("xlsx");
  const frenchHeaders = AGREMENT_IMPORT_COLUMN_ORDER.map((key) => AGREMENT_IMPORT_HEADER_LABELS[key]);
  const produitSample = opts?.produitCode?.trim().toUpperCase() || "LOTO";
  const sampleByKey: Record<(typeof AGREMENT_IMPORT_COLUMN_ORDER)[number], string> = {
    referenceOfficielle: "AGR-2026-001",
    dateReception: new Date().toISOString().slice(0, 10),
    agence: "ABOBO",
    produitCode: produitSample,
    lonaciClientId: "",
    observations: "Exemple import agrément",
  };
  const sample = Object.fromEntries(
    AGREMENT_IMPORT_COLUMN_ORDER.map((key) => [AGREMENT_IMPORT_HEADER_LABELS[key], sampleByKey[key]]),
  );
  const ws = XLSX.utils.json_to_sheet([sample], { header: frenchHeaders });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "agrements");
  XLSX.writeFile(wb, `modele-agrements-${produitSample}.xlsx`);
}

function isMostlyEmptyImportRow(row: Record<string, unknown>): boolean {
  return !Object.values(row).some((value) => {
    if (typeof value === "number" && Number.isFinite(value)) return true;
    if (typeof value === "string") return value.trim().length > 0;
    return false;
  });
}

type AgenceListItem = { id: string; code: string; libelle: string };

function analyzeAgencesInAgrementRows(
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
    const mapped = mapAgrementImportRowFromRecord(row);
    const token = mapped.agence.trim();
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
      return { id, libelle: ag?.libelle ?? id, count };
    })
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }));

  return {
    agencesDetectees,
    lignesSansAgence,
    tokensNonResolus: [...unresolved].slice(0, 8),
  };
}

async function normalizeAgrementsImportFile(file: File): Promise<Record<string, unknown>[]> {
  const lower = file.name.toLowerCase();
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
    assertExcelImportAllowed("AGREMENTS");
    const { readWorkbookFromArrayBuffer, sheetToJsonFirstSheet } = await import(
      "@/lib/spreadsheet/safe-xlsx-read",
    );
    const wb = await readWorkbookFromArrayBuffer(await file.arrayBuffer());
    const rows = await sheetToJsonFirstSheet<Record<string, unknown>>(wb, { defval: "" });
    return keepRawRows(rows);
  }
  if (lower.endsWith(".pdf")) {
    const source = await extractPdfText(file, 8);
    return [
      {
        produitCode:
          captureByAliases(source, ["code produit", "produit"], "[a-z0-9_ -]{2,20}")?.toUpperCase() ??
          "",
        dateReception:
          normalizeDateToIso(
            captureByAliases(source, ["date reception", "date agrement", "date"], "[0-9/\\- :tTzZ.+]{8,40}"),
          ) ?? "",
        "Référence officielle":
          captureByAliases(
            source,
            ["reference officielle", "numero officielle", "num agrement"],
            "[a-z0-9\\-_/]{3,80}",
          ) ?? "",
        Agence: captureByAliases(source, ["agence", "code agence"], "[a-z0-9 _-]{2,40}") ?? "",
        observations:
          captureByAliases(source, ["observations", "commentaires", "commentaire"], "[^|;]{1,300}") ??
          "",
      },
    ].filter((row) => !isMostlyEmptyImportRow(row));
  }
  throw new Error("Format non supporté. Utilisez .xlsx, .xls, .csv, .json ou .pdf.");
}

type PendingAgrementImport = {
  fileName: string;
  rows: Record<string, unknown>[];
  agencesDetectees: Array<{ id: string; libelle: string; count: number }>;
  lignesSansAgence: number;
  tokensNonResolus: string[];
};

export default function AgrementsPanel() {
  const [items, setItems] = useState<AgrementItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<LonaciRole | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingAgrementImport | null>(null);
  const [importProduitCode, setImportProduitCode] = useState("");

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
  const [createClient, setCreateClient] = useState<ClientPickerRow | null>(null);
  const [observations, setObservations] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

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
    void (async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as { user?: { role?: string } };
        setMeRole(parseLonaciRole(body.user?.role));
      } catch {
        setMeRole(null);
      }
    })();
  }, []);

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
      notify.error(message);
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
      form.set("lonaciClientId", createClient?.id?.trim() ?? "");
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
      setCreateClient(null);
      setObservations("");
      setPdfFile(null);
      setCreateOpen(false);
      notify.success("Agrément enregistré (statut RECU).");
      await load(1);
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setCreateError(message);
      notify.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function onImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const source = e.target.files?.[0];
    if (!source) return;
    try {
      const agencesActives = agences.filter((a) => a.actif && a.id);
      if (agencesActives.length === 0) {
        throw new Error(
          "Référentiel des agences non chargé. Attendez quelques secondes puis réessayez.",
        );
      }

      const rawRows = await normalizeAgrementsImportFile(source);
      if (rawRows.length === 0) {
        throw new Error("Le fichier ne contient aucune ligne exploitable.");
      }

      const { agencesDetectees, lignesSansAgence, tokensNonResolus } = analyzeAgencesInAgrementRows(
        rawRows,
        agencesActives,
      );

      setImportProduitCode(filterProduit.trim().toUpperCase());
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
      e.target.value = "";
    }
  }

  async function confirmPendingImport() {
    if (!pendingImport || importingFile) return;

    const produitCode = importProduitCode.trim().toUpperCase();
    if (!produitCode) {
      notify.error("Choisissez le produit concerné par cet import.");
      return;
    }

    setImportingFile(true);
    try {
      const res = await fetch("/api/agrements/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: pendingImport.rows, produitCode }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            message?: string;
            inserted?: number;
            updated?: number;
            unchanged?: number;
            failed?: number;
            results?: Array<{ row: number; ok: boolean; error?: string }>;
          }
        | null;
      if (!res.ok) {
        throw new Error(data?.message ?? "Import impossible");
      }

      const inserted = data?.inserted ?? 0;
      const updated = data?.updated ?? 0;
      const unchanged = data?.unchanged ?? 0;
      const failed = data?.failed ?? 0;
      const firstErrors = (data?.results ?? [])
        .filter((r) => !r.ok && r.error)
        .slice(0, 3)
        .map((r) => `L${r.row}: ${r.error}`)
        .join(" · ");

      const agencesCount = pendingImport.agencesDetectees.length;
      setPendingImport(null);
      setFilterProduit(produitCode);
      await load(1);
      window.dispatchEvent(new Event("lonaci:data-imported"));

      const agencesLabel =
        agencesCount > 0 ? `${agencesCount} agence(s)` : "agences du fichier";
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
      notify.error(err instanceof Error ? err.message : "Import agréments impossible.");
    } finally {
      setImportingFile(false);
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
      setItems((current) => current.filter((item) => item.id !== id));
      setTotal((current) => Math.max(0, current - 1));
      await load(page);
      notify.success("Transition effectuée.");
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setListError(message);
      notify.error(message);
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visibleFilterStatuses = getRoleWorkflowFilterStatuses("AGREMENTS", meRole);
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
    "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400";

  function resetCreateFields() {
    setProduitCode("");
    setDateReception("");
    setReferenceOfficielle("");
    setAgenceId("");
    setCreateClient(null);
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

  function workflowAction(row: AgrementItem) {
    const assigned = getAssignedWorkflowTarget({ workflow: "AGREMENTS", role: meRole, status: row.statut });
    const target = assigned === "CONTROLE" || assigned === "TRANSMIS" || assigned === "FINALISE" ? assigned : null;
    return target ? (
      <Button size="sm" loading={busyId === row.id} onClick={() => void transition(row.id, target)}>
        {transitionLabel(target)}
      </Button>
    ) : null;
  }

  const columns: DataTableColumn<AgrementItem>[] = [
    { id: "reference", header: "Référence", cell: (row) => <span className="font-mono text-xs">{row.reference}</span> },
    { id: "produit", header: "Produit", cell: (row) => row.produitCode },
    { id: "date", header: "Date de réception", cell: (row) => new Date(row.dateReception).toLocaleString("fr-FR") },
    { id: "officielle", header: "Référence officielle", cell: (row) => row.referenceOfficielle },
    { id: "statut", header: "Statut", cell: (row) => <StatusBadge className={statusPillClass(row.statut)}>{row.statut}</StatusBadge> },
    {
      id: "document",
      header: "Document",
      cell: (row) => row.hasDocument ? <a href={`/api/agrements/${row.id}/document`} target="_blank" rel="noopener noreferrer">Ouvrir le PDF</a> : "—",
    },
    { id: "action", header: "Action", align: "right", cell: workflowAction },
  ];

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Référentiel"
        title="Agréments"
        description="Contrôle, validation et archivage des agréments produits."
        actions={
          <>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".json,.csv,.xlsx,.xls,.pdf"
              aria-label="Importer des agréments"
              className="sr-only"
              onChange={(e) => void onImportFileChange(e)}
            />
            {meRole !== "AUDITEUR" ? (
              <Button
                variant="secondary"
                leadingIcon={Upload}
                loading={importingFile}
                onClick={() => importFileInputRef.current?.click()}
              >
                Importer
              </Button>
            ) : null}
            {meRole !== "AUDITEUR" ? (
              <Button
                variant="secondary"
                leadingIcon={Download}
                onClick={() =>
                  void downloadAgrementsExcelTemplate({
                    produitCode: filterProduit || undefined,
                  })
                }
              >
                Modèle Excel
              </Button>
            ) : null}
            <Button variant="secondary" leadingIcon={Download} onClick={() => window.open(`/api/agrements/export?format=excel&${exportQuery}`, "_blank")}>Excel</Button>
            <Button variant="secondary" leadingIcon={FileText} onClick={() => window.open(`/api/agrements/export?format=pdf&${exportQuery}`, "_blank")}>PDF</Button>
            {meRole !== "AUDITEUR" ? <Button leadingIcon={FilePlus2} onClick={() => setCreateOpen(true)}>Créer un agrément</Button> : null}
          </>
        }
      />

      <FilterBar
        aria-label="Filtres des agréments"
        filters={
          <>
            <FormField label="Agence"><input value={filterAgence} onChange={(e) => setFilterAgence(e.target.value)} placeholder="Identifiant agence" /></FormField>
            <FormField label="Produit"><input value={filterProduit} onChange={(e) => setFilterProduit(e.target.value)} placeholder="Code produit" /></FormField>
            <FormField label="Statut"><select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value as "" | AgrementStatus)}><option value="">Tous les statuts</option>{visibleFilterStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></FormField>
            <FormField label="Du"><input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} /></FormField>
            <FormField label="Au"><input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} /></FormField>
          </>
        }
      />

      {listError ? <FeedbackState tone="danger" title="Chargement impossible" description={listError} /> : null}
      <Surface padding="none" elevated>
        {loading ? <Skeleton lines={5} /> : (
          <DataTable
            rows={items}
            columns={columns}
            rowKey={(row) => row.id}
            caption="Liste des agréments"
            getRowLabel={(row) => `Agrément ${row.reference}`}
            mobileCard={(row) => (
              <article className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><strong>{row.referenceOfficielle}</strong><p className="mt-1 text-sm text-slate-600">{row.reference} · {row.produitCode}</p></div><StatusBadge className={statusPillClass(row.statut)}>{row.statut}</StatusBadge></div>
                <dl className="mt-4 text-sm"><div><dt className="text-slate-500">Date de réception</dt><dd className="mt-1 font-medium">{new Date(row.dateReception).toLocaleString("fr-FR")}</dd></div></dl>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {row.hasDocument ? <Button variant="secondary" size="sm" leadingIcon={FileText} onClick={() => window.open(`/api/agrements/${row.id}/document`, "_blank")}>PDF</Button> : null}
                  {workflowAction(row)}
                </div>
              </article>
            )}
          />
        )}
      </Surface>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{total} agrément(s)</p><Pagination page={page} pageCount={totalPages} onPageChange={(next) => void load(next)} label="Pagination des agréments" /></div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => { if (!open && !creating) closeCreate(); }}
        title="Créer un agrément"
        description="Saisissez les informations et joignez le document PDF obligatoire."
        size="lg"
        footer={
          <>
            <Button variant="secondary" disabled={creating} onClick={closeCreate}>Annuler</Button>
            <Button type="submit" form="agrement-create-form" loading={creating}>Créer l’agrément</Button>
          </>
        }
      >
        {createError ? <FeedbackState tone="danger" title="Création impossible" description={createError} /> : null}
        <form id="agrement-create-form" noValidate onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Produit concerné" required error={referentialsError}>
            <select required value={produitCode} onChange={(e) => setProduitCode(e.target.value)} disabled={referentialsLoading}><option value="">Sélectionner un produit</option>{produits.filter((p) => p.actif).map((p) => <option key={p.code} value={p.code}>{p.code} — {p.libelle}</option>)}</select>
          </FormField>
          <FormField label="Date de réception" required><input required type="datetime-local" value={dateReception} onChange={(e) => setDateReception(e.target.value)} /></FormField>
          <FormField label="Référence officielle" required><input required value={referenceOfficielle} onChange={(e) => setReferenceOfficielle(e.target.value)} /></FormField>
          <FormField label="Agence concernée"><select value={agenceId} onChange={(e) => setAgenceId(e.target.value)} disabled={referentialsLoading}><option value="">Aucune agence</option>{agences.filter((a) => a.actif && a.id).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.libelle}</option>)}</select></FormField>
          <div className="sm:col-span-2"><ClientSearchPicker key={`agrement-create-${createOpen}`} label="Client Lonaci" selected={createClient} onSelectedChange={(row) => { setCreateClient(row); const picked = pickProduitCodeFromClient(row, produits.filter((p) => p.actif).map((p) => p.code)); if (picked) setProduitCode(picked); const pickedAgence = pickAgenceIdFromClient(row, agences.filter((a) => a.actif && a.id).map((a) => a.id)); if (pickedAgence) setAgenceId(pickedAgence); }} filter="contrat" inputClassName={inputClass} searchPlaceholder="Rechercher un client" /></div>
          <FormField label="Document PDF" required>
            <input ref={pdfInputRef} required type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
          </FormField>
          <FormField label="Observations"><textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} /></FormField>
        </form>
      </Dialog>

      <Dialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open && !importingFile) {
            setPendingImport(null);
            setImportProduitCode("");
          }
        }}
        title="Importer la liste agréments"
        description="Chaque agrément est rangé automatiquement dans l’agence indiquée sur sa ligne. Choisissez uniquement le produit."
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
              leadingIcon={Upload}
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
                      {a.libelle} — {a.count} agrément(s)
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
                    Valeurs d’agence non reconnues :{" "}
                    <strong>{pendingImport.tokensNonResolus.join(", ")}</strong>.
                  </>
                ) : (
                  <>
                    Aucune agence détectée dans le fichier. Ajoutez une colonne Agence (code ou
                    libellé) pour classer les lignes.
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
                {produits
                  .filter((p) => p.actif)
                  .map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} — {p.libelle}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

