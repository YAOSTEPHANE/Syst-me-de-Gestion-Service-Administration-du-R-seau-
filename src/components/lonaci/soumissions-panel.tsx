"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Download, FilePlus2, FileText, Pencil, Upload } from "lucide-react";

import {
  SoumissionCircuitBadge,
  SoumissionCircuitButtons,
  SoumissionCircuitDialog,
  SoumissionCircuitTabs,
  type SoumissionCircuitDialogMode,
  type SoumissionCircuitItem,
} from "@/components/lonaci/soumission-circuit-ui";
import { SoumissionsStats } from "@/components/lonaci/soumissions-stats";
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
  CLIENT_TYPE_DISTRIBUTEUR,
  CLIENT_TYPE_DISTRIBUTEUR_LABELS,
  type ClientTypeDistributeur,
} from "@/lib/lonaci/client-constants";
import { matchAgenceFromImportToken } from "@/lib/lonaci/clients-import-map";
import type { LonaciRole } from "@/lib/lonaci/constants";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import {
  canMarkSoumissionNonAppele,
  harmonizeSoumissionAppel,
  SOUMISSION_STATUT_DEFAULT,
  SOUMISSION_STATUT_LABELS,
  SOUMISSION_STATUTS,
  type SoumissionStatut,
} from "@/lib/lonaci/soumission-constants";
import {
  isSoumissionCircuitClos,
  type SoumissionCircuitCounters,
  type SoumissionCircuitTab,
} from "@/lib/lonaci/soumission-circuit";
import {
  SOUMISSION_IMPORT_COLUMN_ORDER,
  SOUMISSION_IMPORT_HEADER_LABELS,
  mapSoumissionImportRowFromRecord,
} from "@/lib/lonaci/soumissions-import-map";
import { parseLonaciRole } from "@/lib/lonaci/workflow-ui-policy";
import { assertExcelImportAllowed, getImportAcceptAttribute } from "@/lib/spreadsheet/import-format-policy";
import { notify } from "@/lib/toast";

type SoumissionItem = SoumissionCircuitItem & {
  contact: string;
  typeDistributeur: ClientTypeDistributeur;
  nombreTpe: number;
  agenceId: string;
  produitCode: string;
  statut: SoumissionStatut;
  appele: boolean;
  fichePaiementGeneratedAt: string | null;
  fichePaiementGeneratedByName: string | null;
  date: string;
  observations: string | null;
  updatedAt: string;
};

type AgenceRef = { id: string; code: string; libelle: string; actif: boolean };
type ProduitRef = { code: string; libelle: string; actif: boolean };

type FormState = {
  nomComplet: string;
  contact: string;
  typeDistributeur: ClientTypeDistributeur;
  nombreTpe: string;
  agenceId: string;
  produitCode: string;
  statut: SoumissionStatut;
  appele: boolean;
  date: string;
  observations: string;
};

function statusPillClass(status: SoumissionStatut): string {
  switch (status) {
    case "A_APPELER":
      return "bg-amber-50 text-amber-900";
    case "EN_COURS":
      return "bg-sky-50 text-sky-900";
    case "EN_ATTENTE_PAIEMENT":
      return "bg-violet-50 text-violet-900";
    case "CONVERTI":
      return "bg-emerald-50 text-emerald-900";
    case "SANS_SUITE":
      return "bg-slate-100 text-slate-700";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function emptyForm(): FormState {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    nomComplet: "",
    contact: "",
    typeDistributeur: "NOUVEAU",
    nombreTpe: "0",
    agenceId: "",
    produitCode: "",
    statut: SOUMISSION_STATUT_DEFAULT,
    appele: false,
    date: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
    observations: "",
  };
}

function isMostlyEmptyImportRow(row: Record<string, unknown>): boolean {
  return !Object.values(row).some((value) => {
    if (typeof value === "number" && Number.isFinite(value)) return true;
    if (typeof value === "string") return value.trim().length > 0;
    return false;
  });
}

async function downloadSoumissionsExcelTemplate(opts?: { agenceCode?: string; produitCode?: string }) {
  const XLSX = await import("xlsx");
  const frenchHeaders = SOUMISSION_IMPORT_COLUMN_ORDER.map((key) => SOUMISSION_IMPORT_HEADER_LABELS[key]);
  const agenceSample = opts?.agenceCode?.trim().toUpperCase() || "ABOBO";
  const produitSample = opts?.produitCode?.trim().toUpperCase() || "LOTO";
  const sampleByKey: Record<(typeof SOUMISSION_IMPORT_COLUMN_ORDER)[number], string> = {
    nomComplet: "KOUASSI JEAN",
    contact: "+2250700000000",
    typeDistributeur: "NOUVEAU",
    nombreTpe: "1",
    agence: agenceSample,
    produitCode: produitSample,
    statut: "A_APPELER",
    date: new Date().toISOString().slice(0, 10),
    observations: "Exemple phoning paiement",
  };
  const sample = Object.fromEntries(
    SOUMISSION_IMPORT_COLUMN_ORDER.map((key) => [SOUMISSION_IMPORT_HEADER_LABELS[key], sampleByKey[key]]),
  );
  const ws = XLSX.utils.json_to_sheet([sample], { header: frenchHeaders });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "soumissions");
  const suffix = [agenceSample, produitSample].filter(Boolean).join("-");
  XLSX.writeFile(wb, `modele-soumissions-${suffix}.xlsx`);
}

async function normalizeSoumissionsImportFile(file: File): Promise<Record<string, unknown>[]> {
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
    const headerLine = lines[0]!;
    const delimiter =
      (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
    const split = (line: string) =>
      line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
    const headers = split(headerLine);
    return keepRawRows(
      lines.slice(1).map((line) => {
        const values = split(line);
        const row: Record<string, unknown> = {};
        headers.forEach((header, idx) => {
          row[header || `col_${idx}`] = values[idx] ?? "";
        });
        return row;
      }),
    );
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    assertExcelImportAllowed("SOUMISSIONS");
    const { readWorkbookFromArrayBuffer, sheetToJsonFirstSheet } = await import(
      "@/lib/spreadsheet/safe-xlsx-read",
    );
    const wb = await readWorkbookFromArrayBuffer(await file.arrayBuffer());
    const rows = await sheetToJsonFirstSheet<Record<string, unknown>>(wb, {
      defval: "",
      raw: false,
    });
    return keepRawRows(rows);
  }
  throw new Error("Format non supporté. Utilisez .xlsx, .xls, .csv ou .json.");
}

type PendingImport = {
  fileName: string;
  rows: Record<string, unknown>[];
  agencesDetectees: Array<{ id: string; libelle: string; count: number }>;
  lignesSansAgence: number;
  tokensNonResolus: string[];
};

function analyzeAgencesInRows(
  rows: Record<string, unknown>[],
  agences: Array<{ id: string; code: string; libelle: string }>,
): {
  agencesDetectees: Array<{ id: string; libelle: string; count: number }>;
  lignesSansAgence: number;
  tokensNonResolus: string[];
} {
  const counts = new Map<string, number>();
  let lignesSansAgence = 0;
  const unresolved = new Set<string>();

  for (const row of rows) {
    const mapped = mapSoumissionImportRowFromRecord(row);
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

export default function SoumissionsPanel() {
  const [items, setItems] = useState<SoumissionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<LonaciRole | null>(null);

  const [filterAgence, setFilterAgence] = useState("");
  const [filterProduit, setFilterProduit] = useState("");
  const [filterStatut, setFilterStatut] = useState<"" | SoumissionStatut>("");
  const [filterAppele, setFilterAppele] = useState<"" | "true" | "false">("");
  const [filterQ, setFilterQ] = useState("");

  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [referentialsLoading, setReferentialsLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyAppeleId, setBusyAppeleId] = useState<string | null>(null);

  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importProduitCode, setImportProduitCode] = useState("");
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [circuitTab, setCircuitTab] = useState<SoumissionCircuitTab>("TOUTES");
  const [circuitCounters, setCircuitCounters] = useState<SoumissionCircuitCounters | null>(null);
  const [circuitTarget, setCircuitTarget] = useState<{
    item: SoumissionCircuitItem;
    mode: SoumissionCircuitDialogMode;
  } | null>(null);

  const canWrite =
    meRole !== "AUDITEUR" && meRole !== "LECTURE_SEULE" && meRole !== "SUPERVISEUR_REGIONAL";

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const agenceLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agences) map.set(a.id, a.libelle || a.code);
    return map;
  }, [agences]);

  async function load(nextPage = page) {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
      if (filterAgence.trim()) params.set("agenceId", filterAgence.trim());
      if (filterProduit.trim()) params.set("produitCode", filterProduit.trim().toUpperCase());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterAppele) params.set("appele", filterAppele);
      if (filterQ.trim()) params.set("q", filterQ.trim());
      if (circuitTab !== "TOUTES") params.set("circuit", circuitTab);
      const res = await fetch(`/api/soumissions?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as {
        items: SoumissionItem[];
        total: number;
        page: number;
        circuitCounters?: SoumissionCircuitCounters;
      };
      setItems(data.items);
      setCircuitCounters(data.circuitCounters ?? null);
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
  }, [filterAgence, filterProduit, filterStatut, filterAppele, filterQ, circuitTab]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { user?: { role?: string } };
        setMeRole(parseLonaciRole(body.user?.role));
      } catch {
        setMeRole(null);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReferentialsLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Référentiels indisponibles");
        const data = (await res.json()) as { agences?: AgenceRef[]; produits?: ProduitRef[] };
        if (!cancelled) {
          setAgences(
            (data.agences ?? [])
              .filter((a) => a.actif)
              .slice()
              .sort((a, b) => a.code.localeCompare(b.code, "fr")),
          );
          setProduits(
            (data.produits ?? [])
              .slice()
              .sort((a, b) => a.code.localeCompare(b.code, "fr")),
          );
        }
      } catch {
        if (!cancelled) {
          setAgences([]);
          setProduits([]);
        }
      } finally {
        if (!cancelled) setReferentialsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function exportSoumissionsListToExcel() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (filterAgence.trim()) params.set("agenceId", filterAgence.trim());
      if (filterProduit.trim()) params.set("produitCode", filterProduit.trim().toUpperCase());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterAppele) params.set("appele", filterAppele);
      if (filterQ.trim()) params.set("q", filterQ.trim());

      const allRows: SoumissionItem[] = [];
      let pageCursor = 1;
      let totalCount = 0;
      do {
        params.set("page", String(pageCursor));
        const res = await fetch(`/api/soumissions?${params}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Export impossible");
        const data = (await res.json()) as { items: SoumissionItem[]; total: number };
        totalCount = data.total ?? 0;
        allRows.push(...(data.items ?? []));
        pageCursor += 1;
      } while (allRows.length < totalCount && pageCursor <= 50);

      if (allRows.length === 0) {
        notify.error("Aucune ligne à exporter avec les filtres actuels.");
        return;
      }

      const XLSX = await import("xlsx");
      const frenchHeaders = [
        ...SOUMISSION_IMPORT_COLUMN_ORDER.map((key) => SOUMISSION_IMPORT_HEADER_LABELS[key]),
        "Appelé",
      ];
      const exportRows = allRows.map((row) => {
        const ag = agences.find((a) => a.id === row.agenceId);
        const byKey: Record<(typeof SOUMISSION_IMPORT_COLUMN_ORDER)[number], string | number> = {
          nomComplet: row.nomComplet,
          contact: row.contact,
          typeDistributeur: row.typeDistributeur,
          nombreTpe: row.nombreTpe,
          agence: ag?.code ?? row.agenceId,
          produitCode: row.produitCode,
          statut: SOUMISSION_STATUT_LABELS[row.statut] ?? row.statut,
          date: row.date.slice(0, 10),
          observations: row.observations ?? "",
        };
        return {
          ...Object.fromEntries(
            SOUMISSION_IMPORT_COLUMN_ORDER.map((key) => [
              SOUMISSION_IMPORT_HEADER_LABELS[key],
              byKey[key],
            ]),
          ),
          Appelé: row.appele ? "Oui" : "Non",
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportRows, { header: frenchHeaders });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "soumissions");
      const agenceCode = agences.find((a) => a.id === filterAgence)?.code;
      const produitCode = filterProduit.trim().toUpperCase() || undefined;
      const suffix = [
        agenceCode,
        produitCode,
        filterStatut,
        filterAppele === "true" ? "appeles" : filterAppele === "false" ? "non-appeles" : "",
      ]
        .filter(Boolean)
        .join("-");
      const filename = suffix ? `liste-soumissions-${suffix}.xlsx` : "liste-soumissions.xlsx";
      XLSX.writeFile(wb, filename);
      notify.success(`${exportRows.length} soumission(s) exportée(s).`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Export Excel impossible.");
    } finally {
      setExporting(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(row: SoumissionItem) {
    setEditingId(row.id);
    setForm({
      nomComplet: row.nomComplet,
      contact: row.contact,
      typeDistributeur: row.typeDistributeur,
      nombreTpe: String(row.nombreTpe),
      agenceId: row.agenceId,
      produitCode: row.produitCode,
      statut: row.statut,
      appele: Boolean(row.appele),
      date: row.date.slice(0, 10),
      observations: row.observations ?? "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    if (saving) return;
    setDialogOpen(false);
    setEditingId(null);
    setFormError(null);
    setSaving(false);
    setForm(emptyForm());
  }

  function handleFormDialogOpenChange(open: boolean) {
    if (open) {
      setDialogOpen(true);
      return;
    }
    closeDialog();
  }

  function handleImportDialogOpenChange(open: boolean) {
    if (!open && !importingFile) {
      setPendingImport(null);
      setImportProduitCode("");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const nombreTpe = Number(form.nombreTpe);
      if (!Number.isFinite(nombreTpe) || nombreTpe < 0) {
        throw new Error("Nombre de TPE invalide");
      }
      const dateIso = new Date(`${form.date}T12:00:00`).toISOString();
      const payload = {
        nomComplet: form.nomComplet.trim(),
        contact: form.contact.trim(),
        typeDistributeur: form.typeDistributeur,
        nombreTpe,
        agenceId: form.agenceId,
        produitCode: form.produitCode.trim().toUpperCase(),
        statut: form.statut,
        appele: form.appele,
        date: dateIso,
        observations: form.observations.trim() || null,
      };

      const res = editingId
        ? await fetch(`/api/soumissions/${editingId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/soumissions", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Enregistrement impossible");
      }

      notify.success(editingId ? "Soumission mise à jour." : "Soumission créée.");
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      setStatsRefreshKey((k) => k + 1);
      await load(editingId ? page : 1);
    } catch (err) {
      setFormError(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur"));
    } finally {
      setSaving(false);
    }
  }

  async function onImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportingFile(true);
    try {
      const rows = await normalizeSoumissionsImportFile(file);
      if (rows.length === 0) throw new Error("Aucune ligne à importer");
      const analysis = analyzeAgencesInRows(
        rows,
        agences.map((a) => ({ id: a.id, code: a.code, libelle: a.libelle })),
      );
      setImportProduitCode(filterProduit.trim().toUpperCase());
      setPendingImport({
        fileName: file.name,
        rows,
        ...analysis,
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setImportingFile(false);
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const produitCode = importProduitCode.trim().toUpperCase();
    if (!produitCode) {
      notify.error("Choisissez le produit concerné par cet import.");
      return;
    }

    setImportingFile(true);
    try {
      const res = await fetch("/api/soumissions/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: pendingImport.rows,
          defaultProduitCode: produitCode,
          ...(filterAgence.trim() ? { defaultAgenceId: filterAgence.trim() } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        inserted?: number;
        updated?: number;
        unchanged?: number;
        failed?: number;
        results?: Array<{ row: number; ok: boolean; error?: string }>;
      } | null;
      if (!res.ok) throw new Error(body?.message ?? "Import impossible");

      const inserted = body?.inserted ?? 0;
      const updated = body?.updated ?? 0;
      const unchanged = body?.unchanged ?? 0;
      const failed = body?.failed ?? 0;
      const firstErrors = (body?.results ?? [])
        .filter((r) => !r.ok && r.error)
        .slice(0, 3)
        .map((r) => `L${r.row}: ${r.error}`)
        .join(" · ");

      setPendingImport(null);
      setImportProduitCode("");
      setFilterProduit(produitCode);
      setStatsRefreshKey((k) => k + 1);
      await load(1);

      if (inserted === 0 && updated === 0 && failed > 0 && unchanged === 0) {
        notify.error(
          firstErrors
            ? `Import impossible (${failed} échec(s) · ${produitCode}). ${firstErrors}`
            : `Import impossible (${failed} échec(s)).`,
        );
      } else {
        notify.success(
          `Import terminé (${produitCode}) — ${inserted} créé(s), ${updated} mis à jour, ${unchanged} inchangé(s)${
            failed ? `, ${failed} échec(s)` : ""
          }.${firstErrors ? ` ${firstErrors}` : ""}`,
        );
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setImportingFile(false);
    }
  }

  async function toggleAppele(row: SoumissionItem) {
    if (!canWrite) return;
    const nextAppele = !row.appele;
    setBusyAppeleId(row.id);
    try {
      const res = await fetch(`/api/soumissions/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appele: nextAppele }),
      });
      const body = (await res.json().catch(() => null)) as
        | { item?: SoumissionItem; message?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.message ?? "Mise à jour impossible");
      }
      if (body?.item) {
        setItems((prev) =>
          prev.map((item) => (item.id === row.id ? { ...item, ...body.item! } : item)),
        );
      }
      const nextStatut = body?.item?.statut;
      const statutNote =
        nextStatut && nextStatut !== row.statut ? ` Statut : ${SOUMISSION_STATUT_LABELS[nextStatut]}.` : "";
      notify.success(`${nextAppele ? "Marqué comme appelé." : "Marqué comme non appelé."}${statutNote}`);
      setStatsRefreshKey((k) => k + 1);
      if (filterAppele || filterStatut) await load(page);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Mise à jour impossible");
    } finally {
      setBusyAppeleId(null);
    }
  }

  function refreshAfterCircuitChange() {
    setStatsRefreshKey((k) => k + 1);
    void load(page);
  }

  function openFicheCaisse(row: SoumissionItem) {
    window.open(
      `/api/soumissions/${encodeURIComponent(row.id)}/fiche-paiement/pdf`,
      "_blank",
      "noopener,noreferrer",
    );
    if (!row.circuitStatut) window.setTimeout(refreshAfterCircuitChange, 2500);
  }

  function renderRowActions(row: SoumissionItem) {
    const clos = isSoumissionCircuitClos(row.circuitStatut);
    return (
      <>
        {row.circuitActions?.ficheCaisse ? (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={FileText}
            title={
              row.fichePaiementGeneratedByName
                ? `Dernière fiche : ${row.fichePaiementGeneratedByName}`
                : "Tirer la fiche de paiement caisse (100 000 FCFA)"
            }
            onClick={() => openFicheCaisse(row)}
          >
            Fiche caisse
          </Button>
        ) : null}
        <SoumissionCircuitButtons item={row} onOpen={(item, mode) => setCircuitTarget({ item, mode })} />
        {canWrite && (!row.appele || canMarkSoumissionNonAppele(row.statut)) ? (
          <Button
            size="sm"
            variant={row.appele ? "secondary" : "primary"}
            title={
              row.appele
                ? row.statut === "EN_COURS"
                  ? "Repasser en « Non appelé » (statut « À appeler »)"
                  : "Repasser en « Non appelé »"
                : row.statut === "A_APPELER"
                  ? "Marquer appelé (statut « En cours »)"
                  : "Marquer appelé"
            }
            className={
              row.appele ? "!border-emerald-600 !bg-emerald-600 !text-white hover:!bg-emerald-700" : undefined
            }
            loading={busyAppeleId === row.id}
            onClick={() => void toggleAppele(row)}
          >
            {row.appele ? "Non appelé" : "Appelé"}
          </Button>
        ) : null}
        {canWrite && !clos ? (
          <Button size="sm" variant="secondary" leadingIcon={Pencil} onClick={() => openEdit(row)}>
            Modifier
          </Button>
        ) : null}
      </>
    );
  }

  const columns: DataTableColumn<SoumissionItem>[] = [
    {
      id: "nom",
      header: "Nom complet",
      cell: (row) => <span className="font-medium text-slate-900">{row.nomComplet}</span>,
    },
    { id: "contact", header: "Contact", cell: (row) => row.contact },
    {
      id: "type",
      header: "Distributeur",
      cell: (row) => CLIENT_TYPE_DISTRIBUTEUR_LABELS[row.typeDistributeur] ?? row.typeDistributeur,
    },
    { id: "tpe", header: "TPE", cell: (row) => row.nombreTpe },
    { id: "produit", header: "Produit", cell: (row) => row.produitCode || "—" },
    {
      id: "agence",
      header: "Agence",
      cell: (row) => agenceLabelById.get(row.agenceId) ?? row.agenceId,
    },
    {
      id: "statut",
      header: "Statut",
      cell: (row) => (
        <StatusBadge className={statusPillClass(row.statut)}>
          {SOUMISSION_STATUT_LABELS[row.statut]}
        </StatusBadge>
      ),
    },
    {
      id: "appele",
      header: "Appel",
      cell: (row) =>
        row.appele ? (
          <StatusBadge className="bg-emerald-50 text-emerald-900">Appelé</StatusBadge>
        ) : (
          <StatusBadge className="bg-amber-50 text-amber-900">Non appelé</StatusBadge>
        ),
    },
    {
      id: "circuit",
      header: "Circuit",
      cell: (row) => <SoumissionCircuitBadge item={row} />,
    },
    {
      id: "date",
      header: "Date",
      cell: (row) => new Date(row.date).toLocaleDateString("fr-FR"),
    },
    {
      id: "obs",
      header: "Observation",
      cell: (row) => (
        <span className="line-clamp-2 max-w-[16rem] text-slate-600">{row.observations || "—"}</span>
      ),
    },
    {
      id: "action",
      header: "Action",
      align: "right",
      cell: (row) => <div className="flex flex-wrap justify-end gap-2">{renderRowActions(row)}</div>,
    },
  ];

  return (
    <section className="lonaci-soumissions space-y-5">
      <PageHeader
        eyebrow="Parcours"
        title="Soumission"
        description="File de contacts à rappeler pour le paiement, classée par produit et agence."
        actions={
          <>
            <input
              ref={importFileInputRef}
              type="file"
              accept={getImportAcceptAttribute("SOUMISSIONS")}
              aria-label="Importer des soumissions depuis un fichier Excel"
              className="sr-only"
              onChange={(e) => void onImportFileChange(e)}
            />
            <Button
              variant="secondary"
              leadingIcon={Download}
              loading={exporting}
              onClick={() => void exportSoumissionsListToExcel()}
            >
              Exporter la liste
            </Button>
            {canWrite ? (
              <>
                <Button
                  variant="secondary"
                  leadingIcon={Download}
                  onClick={() =>
                    void downloadSoumissionsExcelTemplate({
                      agenceCode: agences.find((a) => a.id === filterAgence)?.code,
                      produitCode: filterProduit || undefined,
                    })
                  }
                >
                  Modèle Excel
                </Button>
                <Button
                  variant="secondary"
                  leadingIcon={Upload}
                  loading={importingFile}
                  onClick={() => importFileInputRef.current?.click()}
                >
                  {importingFile ? "Import…" : "Importer Excel"}
                </Button>
                <Button leadingIcon={FilePlus2} onClick={openCreate}>
                  Nouvelle soumission
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <FilterBar
        aria-label="Filtres des soumissions"
        search={{
          value: filterQ,
          onChange: setFilterQ,
          placeholder: "Nom, contact…",
          label: "Recherche soumissions",
        }}
        filters={
          <>
            <FormField label="Agence">
              <select
                value={filterAgence}
                onChange={(e) => setFilterAgence(e.target.value)}
                disabled={referentialsLoading}
              >
                <option value="">Toutes les agences</option>
                {agences.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.libelle}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Produit">
              <select
                value={filterProduit}
                onChange={(e) => setFilterProduit(e.target.value)}
                disabled={referentialsLoading}
              >
                <option value="">Tous</option>
                {produits
                  .filter((p) => p.actif)
                  .map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} — {p.libelle}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label="Statut">
              <select
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value as "" | SoumissionStatut)}
              >
                <option value="">Tous les statuts</option>
                {SOUMISSION_STATUTS.map((s) => (
                  <option key={s} value={s}>
                    {SOUMISSION_STATUT_LABELS[s]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Appel">
              <select
                value={filterAppele}
                onChange={(e) => setFilterAppele(e.target.value as "" | "true" | "false")}
              >
                <option value="">Tous</option>
                <option value="false">Non appelés</option>
                <option value="true">Appelés</option>
              </select>
            </FormField>
          </>
        }
      />

      <SoumissionsStats
        agenceId={filterAgence}
        produitCode={filterProduit}
        statut={filterStatut}
        appele={filterAppele}
        q={filterQ}
        refreshKey={statsRefreshKey}
      />

      <SoumissionCircuitTabs value={circuitTab} counters={circuitCounters} onChange={setCircuitTab} />

      {listError ? (
        <FeedbackState tone="danger" title="Chargement impossible" description={listError} />
      ) : null}

      <Surface padding="none" elevated>
        {loading ? (
          <Skeleton lines={5} />
        ) : (
          <DataTable
            rows={items}
            columns={columns}
            rowKey={(row) => row.id}
            caption="Liste des soumissions"
            getRowLabel={(row) => `Soumission ${row.nomComplet}`}
            mobileCard={(row) => (
              <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong>{row.nomComplet}</strong>
                    <p className="mt-1 text-sm text-slate-600">{row.contact}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge className={statusPillClass(row.statut)}>
                      {SOUMISSION_STATUT_LABELS[row.statut]}
                    </StatusBadge>
                    <StatusBadge
                      className={
                        row.appele ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
                      }
                    >
                      {row.appele ? "Appelé" : "Non appelé"}
                    </StatusBadge>
                  </div>
                </div>
                <dl className="mt-4 grid gap-2 text-sm">
                  <div>
                    <dt className="text-slate-500">Produit</dt>
                    <dd className="mt-1 font-medium">{row.produitCode || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Agence</dt>
                    <dd className="mt-1 font-medium">
                      {agenceLabelById.get(row.agenceId) ?? row.agenceId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">TPE</dt>
                    <dd className="mt-1 font-medium">{row.nombreTpe}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Circuit</dt>
                    <dd className="mt-1">
                      <SoumissionCircuitBadge item={row} />
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 empty:hidden">
                  {renderRowActions(row)}
                </div>
              </article>
            )}
          />
        )}
      </Surface>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{total} soumission(s)</p>
        <Pagination
          page={page}
          pageCount={totalPages}
          onPageChange={(next) => void load(next)}
          label="Pagination des soumissions"
        />
      </div>

      <SoumissionCircuitDialog
        target={circuitTarget}
        onClose={() => setCircuitTarget(null)}
        onDone={() => {
          setCircuitTarget(null);
          refreshAfterCircuitChange();
        }}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={handleFormDialogOpenChange}
        title={editingId ? "Modifier la soumission" : "Nouvelle soumission"}
        description="Contact phoning pour le suivi de l’appel."
        size="lg"
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={closeDialog}>
              Annuler
            </Button>
            <Button type="submit" form="soumission-form" loading={saving}>
              {editingId ? "Enregistrer" : "Créer"}
            </Button>
          </>
        }
      >
        {formError ? (
          <FeedbackState tone="danger" title="Enregistrement impossible" description={formError} />
        ) : null}
        <form id="soumission-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => void onSubmit(e)}>
          <FormField label="Nom complet" required>
            <input
              required
              minLength={2}
              value={form.nomComplet}
              onChange={(e) => setForm((f) => ({ ...f, nomComplet: e.target.value }))}
            />
          </FormField>
          <FormField label="Contact" required>
            <input
              required
              minLength={4}
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            />
          </FormField>
          <FormField label="Type de distributeur">
            <select
              value={form.typeDistributeur}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  typeDistributeur: e.target.value as ClientTypeDistributeur,
                }))
              }
            >
              {CLIENT_TYPE_DISTRIBUTEUR.map((t) => (
                <option key={t} value={t}>
                  {CLIENT_TYPE_DISTRIBUTEUR_LABELS[t]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Nombre de TPE">
            <input
              type="number"
              min={0}
              max={9999}
              value={form.nombreTpe}
              onChange={(e) => setForm((f) => ({ ...f, nombreTpe: e.target.value }))}
            />
          </FormField>
          <FormField label="Produit" required>
            <select
              required
              value={form.produitCode}
              onChange={(e) => setForm((f) => ({ ...f, produitCode: e.target.value }))}
              disabled={referentialsLoading}
            >
              <option value="">Sélectionner…</option>
              {produits
                .filter((p) => p.actif)
                .map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} — {p.libelle}
                  </option>
                ))}
            </select>
          </FormField>
          <FormField label="Agence" required>
            <select
              required
              value={form.agenceId}
              onChange={(e) => setForm((f) => ({ ...f, agenceId: e.target.value }))}
              disabled={referentialsLoading}
            >
              <option value="">Sélectionner…</option>
              {agences.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.libelle}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Statut">
            <select
              value={form.statut}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ...harmonizeSoumissionAppel(f, { statut: e.target.value as SoumissionStatut }),
                }))
              }
            >
              {SOUMISSION_STATUTS.map((s) => (
                <option key={s} value={s}>
                  {SOUMISSION_STATUT_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Appel"
            hint={
              canMarkSoumissionNonAppele(form.statut)
                ? "« Appelé » fait passer « À appeler » en « En cours »."
                : `Le statut « ${SOUMISSION_STATUT_LABELS[form.statut]} » implique un appel.`
            }
          >
            <select
              value={form.appele ? "true" : "false"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ...harmonizeSoumissionAppel(f, { appele: e.target.value === "true" }),
                }))
              }
            >
              <option value="false" disabled={!canMarkSoumissionNonAppele(form.statut)}>
                Non appelé
              </option>
              <option value="true">Appelé</option>
            </select>
          </FormField>
          <FormField label="Date">
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </FormField>
          <FormField label="Observation" className="sm:col-span-2">
            <textarea
              rows={3}
              value={form.observations}
              onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
            />
          </FormField>
        </form>
      </Dialog>

      <Dialog
        open={pendingImport !== null}
        onOpenChange={handleImportDialogOpenChange}
        title="Confirmer l’import"
        description="Choisissez le produit concerné. Chaque ligne est rangée selon l’agence indiquée dans le fichier (sinon le filtre agence)."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={importingFile}
              onClick={() => {
                if (!importingFile) {
                  setPendingImport(null);
                  setImportProduitCode("");
                }
              }}
            >
              Annuler
            </Button>
            <Button leadingIcon={Upload} loading={importingFile} onClick={() => void confirmImport()}>
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
            <FormField label="Produit concerné" required>
              <select
                required
                value={importProduitCode}
                onChange={(e) => setImportProduitCode(e.target.value)}
                disabled={importingFile || referentialsLoading}
                aria-label="Produit d’import"
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
            </FormField>
            {filterAgence.trim() ? (
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                Agence du filtre utilisée pour les lignes sans agence :{" "}
                {agences.find((a) => a.id === filterAgence)?.libelle ?? filterAgence}
              </p>
            ) : null}
            {pendingImport.agencesDetectees.length > 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="font-semibold text-slate-700">Agences détectées</p>
                <ul className="mt-1 space-y-0.5 text-slate-600">
                  {pendingImport.agencesDetectees.map((a) => (
                    <li key={a.id}>
                      {a.libelle} — {a.count} ligne(s)
                    </li>
                  ))}
                </ul>
                {pendingImport.lignesSansAgence > 0 ? (
                  <p className="mt-2 text-xs text-amber-800">
                    {pendingImport.lignesSansAgence} ligne(s) sans agence reconnue
                    {pendingImport.tokensNonResolus.length > 0
                      ? ` (ex. : ${pendingImport.tokensNonResolus.join(", ")})`
                      : ""}
                    {filterAgence.trim()
                      ? " — elles utiliseront l’agence du filtre."
                      : " — ajoutez une colonne Agence (code) ou sélectionnez une agence dans le filtre."}
                    .
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {filterAgence.trim()
                  ? "Aucune agence dans le fichier : l’agence du filtre sera utilisée pour toutes les lignes."
                  : "Aucune agence détectée. Ajoutez une colonne Agence (ex. ABOBO) ou sélectionnez une agence dans le filtre avant d’importer."}
              </p>
            )}
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
