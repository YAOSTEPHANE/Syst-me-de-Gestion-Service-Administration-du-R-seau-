"use client";

import { useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { captureByAliases, extractPdfText, normalizeDateToIso, normalizeNumericString } from "@/lib/lonaci/pdf-import";
import { canRole } from "@/lib/auth/rbac";
import { LONACI_ROLES, type LonaciRole } from "@/lib/lonaci/constants";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { assertExcelImportAllowed, getImportAcceptAttribute } from "@/lib/spreadsheet/import-format-policy";
import { notify } from "@/lib/toast";
import { Download, FilePlus2, RefreshCw, Upload } from "lucide-react";
import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { FormField } from "@/components/lonaci/ui/form-field";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Card, Surface } from "@/components/lonaci/ui/surface";
import { workflowAdvanceLabel } from "@/lib/lonaci/workflow-approvals";

type PdvStatus = "DEMANDE_RECUE" | "EN_TRAITEMENT" | "INTEGRE_GPR" | "FINALISE";

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

interface PdvItem {
  id: string;
  reference: string;
  codePdv: string;
  concessionnaireId: string | null;
  raisonSociale: string;
  agenceId: string | null;
  produitCode: string;
  nombreDemandes: number;
  dateDemande: string;
  gps: { lat: number; lng: number };
  observations: string | null;
  status: PdvStatus;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: PdvItem[];
  dashboard?: {
    byAgenceEnTraitement: Array<{ agenceId: string | null; count: number }>;
    staleProcessingCount: number;
  };
  total: number;
  page: number;
  pageSize: number;
}

async function fetchList(input: {
  page: number;
  pageSize: number;
  agenceId?: string;
  produitCode?: string;
  status?: PdvStatus;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ListResponse> {
  const search = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  if (input.agenceId) search.set("agenceId", input.agenceId);
  if (input.produitCode) search.set("produitCode", input.produitCode);
  if (input.status) search.set("status", input.status);
  if (input.dateFrom) search.set("dateFrom", new Date(`${input.dateFrom}T00:00:00`).toISOString());
  if (input.dateTo) search.set("dateTo", new Date(`${input.dateTo}T23:59:59.999`).toISOString());
  const response = await fetch(`/api/pdv-integrations?${search}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les intégrations PDV");
  }
  return response.json();
}

function statusClass(status: PdvStatus): string {
  switch (status) {
    case "FINALISE":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "INTEGRE_GPR":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "DEMANDE_RECUE":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "EN_TRAITEMENT":
      return "border-sky-200 bg-sky-50 text-sky-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

async function downloadPdvIntegrationsExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = [
    "agenceId",
    "produitCode",
    "nombreDemandes",
    "dateDemande",
    "gps.lat",
    "gps.lng",
    "observations",
  ];
  const sample = {
    agenceId: "ID_AGENCE",
    produitCode: "LOTO",
    nombreDemandes: 2,
    dateDemande: new Date().toISOString(),
    "gps.lat": 5.3599,
    "gps.lng": -4.0083,
    observations: "Exemple import integration PDV",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "pdv_integrations");
  XLSX.writeFile(wb, "modele-pdv-integrations.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    agenceId: (raw.agenceId as string | null) ?? null,
    produitCode: (raw.produitCode as string | null) ?? null,
    nombreDemandes: raw.nombreDemandes ?? null,
    dateDemande: (raw.dateDemande as string | null) ?? null,
    gps: raw.gps ?? null,
    observations: (raw.observations as string | null) ?? null,
  });
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".csv")) return file;
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    assertExcelImportAllowed("PDV_INTEGRATIONS");
    const { readWorkbookFromArrayBuffer, sheetToJsonFirstSheet } = await import(
      "@/lib/spreadsheet/safe-xlsx-read",
    );
    const wb = await readWorkbookFromArrayBuffer(await file.arrayBuffer());
    const rows = await sheetToJsonFirstSheet<Record<string, unknown>>(wb);
    const normalizedRows = rows.map((row) => {
      const rec = row as Record<string, unknown>;
      const gpsLat = rec["gps.lat"];
      const gpsLng = rec["gps.lng"];
      const next = { ...rec } as Record<string, unknown>;
      if (gpsLat !== undefined || gpsLng !== undefined) {
        next.gps = {
          lat: Number(gpsLat ?? 0),
          lng: Number(gpsLng ?? 0),
        };
      }
      delete next["gps.lat"];
      delete next["gps.lng"];
      return sanitize(next);
    });
    const json = JSON.stringify(normalizedRows);
    return new File([json], file.name.replace(/\.(xlsx|xls)$/i, ".json"), { type: "application/json" });
  }
  if (lower.endsWith(".pdf")) {
    const source = await extractPdfText(file, 8);
    const lat = normalizeNumericString(
      captureByAliases(source, ["lat", "latitude", "gps lat"], "-?[0-9]+(?:[.,][0-9]+)?"),
    );
    const lng = normalizeNumericString(
      captureByAliases(source, ["lng", "long", "longitude", "gps lng"], "-?[0-9]+(?:[.,][0-9]+)?"),
    );
    const row = sanitize({
      agenceId: captureByAliases(source, ["agence id", "id agence"], "[a-z0-9]{8,}"),
      produitCode:
        captureByAliases(source, ["code produit", "produit"], "[a-z0-9_ -]{2,20}")?.toUpperCase() ?? null,
      nombreDemandes: normalizeNumericString(
        captureByAliases(source, ["nombre demandes", "nombre demande", "quantite"], "[0-9]+"),
      ) ?? 1,
      dateDemande: normalizeDateToIso(
        captureByAliases(source, ["date demande", "date integration", "date"], "[0-9/\\- :tTzZ.+]{8,40}"),
      ),
      gps: { lat: lat ?? 0, lng: lng ?? 0 },
      observations: captureByAliases(source, ["observations", "commentaires", "commentaire"], "[^|;]{1,300}"),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporte. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

export default function PdvIntegrationsPanel() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PdvItem[]>([]);
  const [dashboard, setDashboard] = useState<ListResponse["dashboard"] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [filterAgenceId, setFilterAgenceId] = useState("");
  const [filterProduit, setFilterProduit] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | PdvStatus>("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  const [agenceId, setAgenceId] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const [nombreDemandes, setNombreDemandes] = useState("1");
  const [dateDemande, setDateDemande] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [observations, setObservations] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [finalizeModal, setFinalizeModal] = useState<PdvItem | null>(null);
  const [finalizeAck, setFinalizeAck] = useState(false);
  const [meRole, setMeRole] = useState<string | null>(null);

  useEffect(() => {
    const agenceId = searchParams.get("agenceId")?.trim() ?? "";
    const produitCode = searchParams.get("produitCode")?.trim() ?? "";
    const statusRaw = searchParams.get("status")?.trim() ?? "";
    const status = (
      statusRaw === "DEMANDE_RECUE" ||
      statusRaw === "EN_TRAITEMENT" ||
      statusRaw === "INTEGRE_GPR" ||
      statusRaw === "FINALISE"
    )
      ? statusRaw
      : "";
    if (agenceId) setFilterAgenceId(agenceId);
    if (produitCode) setFilterProduit(produitCode);
    if (status) setFilterStatus(status);
    // Intentionnellement au montage uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchList({
        page: nextPage,
        pageSize,
        agenceId: filterAgenceId.trim() || undefined,
        produitCode: filterProduit.trim() || undefined,
        status: filterStatus || undefined,
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined,
      });
      setItems(data.items);
      setDashboard(data.dashboard ?? null);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAgenceId, filterProduit, filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Profil indisponible");
        const data = (await res.json()) as { user?: { role?: string } };
        if (!cancelled) setMeRole(data.user?.role ?? null);
      } catch {
        if (!cancelled) setMeRole(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onDataImported = () => {
      void load(1);
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAgenceId, filterProduit, filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    setRefLoading(true);
    setRefError(null);
    void (async () => {
      try {
        const res = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Référentiels indisponibles");
        const data = (await res.json()) as { agences: AgenceRef[]; produits: ProduitRef[] };
        if (!cancelled) {
          setAgences((data.agences ?? []).filter((a) => a.actif));
          setProduits((data.produits ?? []).filter((p) => p.actif));
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

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateFormError(null);
    setCreating(true);
    setError(null);
    try {
      const latN = Number(lat);
      const lngN = Number(lng);
      if (Number.isNaN(latN) || Number.isNaN(lngN)) {
        throw new Error("GPS lat/lng invalides");
      }
      const response = await fetch("/api/pdv-integrations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agenceId: agenceId.trim() ? agenceId.trim() : null,
          produitCode: produitCode.trim().toUpperCase(),
          nombreDemandes: Number(nombreDemandes),
          dateDemande: new Date(dateDemande).toISOString(),
          gps: { lat: latN, lng: lngN },
          observations: observations.trim() ? observations.trim() : null,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Création impossible");
      }
      setAgenceId("");
      setProduitCode("");
      setNombreDemandes("1");
      setDateDemande("");
      setLat("");
      setLng("");
      setObservations("");
      setCreateOpen(false);
      await load(1);
      notify.success("Demande PDV créée.");
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setCreateFormError(message);
      setError(message);
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
      fd.set("collection", "pdv_integrations");
      fd.set("mode", "insert");
      const res = await fetch("/api/import-data", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as
        | { message?: string; inserted?: number; skippedExistingDuplicates?: number }
        | null;
      if (!res.ok) throw new Error(data?.message ?? "Import impossible");
      await load(1);
      window.dispatchEvent(new Event("lonaci:data-imported"));
      notify.success(
        `Import PDV terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s).`,
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

  function openCreate() {
    setCreateFormError(null);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setDateDemande(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T12:00`);
    setCreateOpen(true);
  }

  function closeCreate() {
    if (creating) return;
    setCreateOpen(false);
    setCreateFormError(null);
  }

  function openFinalizeModal(row: PdvItem) {
    setFinalizeModal(row);
    setFinalizeAck(false);
  }

  function closeFinalizeModal() {
    if (finalizingId) return;
    setFinalizeModal(null);
    setFinalizeAck(false);
  }

  async function finalizeIntegration(id: string) {
    setFinalizingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/pdv-integrations/${encodeURIComponent(id)}/finalize`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Finalisation impossible");
      }
      await load(page);
      setFinalizeModal(null);
      setFinalizeAck(false);
      notify.success("Demande PDV finalisée.");
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setFinalizingId(null);
    }
  }

  async function transitionIntegration(id: string, targetStatus: "EN_TRAITEMENT" | "INTEGRE_GPR" | "FINALISE") {
    if (targetStatus === "FINALISE") {
      const row = items.find((x) => x.id === id);
      if (row) openFinalizeModal(row);
      return;
    }
    setFinalizingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/pdv-integrations/${encodeURIComponent(id)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Transition impossible");
      }
      await load(page);
      notify.success("Transition de statut effectuée.");
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setFinalizingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const meRbacRole = useMemo<LonaciRole | null>(
    () => (meRole && LONACI_ROLES.includes(meRole as LonaciRole) ? (meRole as LonaciRole) : null),
    [meRole],
  );
  const canCreatePdv = useMemo(() => {
    if (!meRbacRole) return false;
    const roleAllowed = ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(meRbacRole);
    return roleAllowed && canRole({ role: meRbacRole, resource: "PDV_INTEGRATIONS", action: "CREATE" }).allowed;
  }, [meRbacRole]);
  const canTransitionPdv = useMemo(() => {
    if (!meRbacRole) return false;
    const roleAllowed = ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(meRbacRole);
    return roleAllowed && canRole({ role: meRbacRole, resource: "PDV_INTEGRATIONS", action: "UPDATE" }).allowed;
  }, [meRbacRole]);
  const canFinalizePdv = useMemo(() => {
    if (!meRbacRole) return false;
    return (
      meRbacRole === "CHEF_SERVICE" &&
      canRole({ role: meRbacRole, resource: "PDV_INTEGRATIONS", action: "FINALIZE" }).allowed
    );
  }, [meRbacRole]);
  const canExportPdv = useMemo(
    () => !!meRbacRole,
    [meRbacRole],
  );
  const analytics = useMemo(() => {
    const status = { demandeRecue: 0, enTraitement: 0, integreGpr: 0, finalise: 0 };
    const byAgence = new Map<string, number>();
    const byDay = new Map<string, number>();
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    let avgLatencyDays = 0;
    let finalizedCount = 0;

    for (const row of items) {
      if (row.status === "DEMANDE_RECUE") status.demandeRecue += 1;
      else if (row.status === "EN_TRAITEMENT") status.enTraitement += 1;
      else if (row.status === "INTEGRE_GPR") status.integreGpr += 1;
      else status.finalise += 1;

      const agenceKey = row.agenceId ?? "Non rattachée";
      byAgence.set(agenceKey, (byAgence.get(agenceKey) ?? 0) + 1);

      const created = new Date(row.createdAt);
      if (!Number.isNaN(created.getTime()) && now - created.getTime() <= sevenDaysMs) {
        const dayKey = created.toISOString().slice(0, 10);
        byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
      }

      if (row.finalizedAt) {
        const finalized = new Date(row.finalizedAt);
        if (!Number.isNaN(finalized.getTime()) && !Number.isNaN(created.getTime()) && finalized > created) {
          avgLatencyDays += (finalized.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          finalizedCount += 1;
        }
      }
    }

    const pipelineTotal = status.demandeRecue + status.enTraitement + status.integreGpr;
    const volumeTotal = status.demandeRecue + status.enTraitement + status.integreGpr + status.finalise;
    const finalRate = volumeTotal > 0 ? Math.round((status.finalise / volumeTotal) * 100) : 0;
    const avgFinalizeDays = finalizedCount > 0 ? (avgLatencyDays / finalizedCount).toFixed(1) : "—";

    const agencies = [...byAgence.entries()]
      .map(([agence, count]) => ({ agence, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const trendPoints = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, count]) => count);
    const maxTrend = trendPoints.length ? Math.max(...trendPoints) : 0;
    const sparkline = trendPoints
      .map((value, index) => {
        const x = trendPoints.length === 1 ? 0 : (index / (trendPoints.length - 1)) * 100;
        const y = maxTrend <= 0 ? 50 : 100 - (value / maxTrend) * 100;
        return `${x},${y}`;
      })
      .join(" ");

    return {
      ...status,
      pipelineTotal,
      volumeTotal,
      finalRate,
      avgFinalizeDays,
      agencies,
      sparkline,
    };
  }, [items]);

  function rowAction(row: PdvItem) {
    if (row.status === "DEMANDE_RECUE" && canTransitionPdv) {
      return <Button size="sm" loading={finalizingId === row.id} onClick={() => void transitionIntegration(row.id, "EN_TRAITEMENT")}>Passer en traitement</Button>;
    }
    if (row.status === "EN_TRAITEMENT" && canTransitionPdv) {
      return <Button size="sm" loading={finalizingId === row.id} onClick={() => void transitionIntegration(row.id, "INTEGRE_GPR")}>Marquer intégré GPR</Button>;
    }
    if (row.status === "INTEGRE_GPR" && canFinalizePdv) {
      return <Button size="sm" loading={finalizingId === row.id} onClick={() => void transitionIntegration(row.id, "FINALISE")}>{workflowAdvanceLabel()}</Button>;
    }
    return row.status === "FINALISE" || row.status === "INTEGRE_GPR"
      ? <StatusBadge tone="success">Validée</StatusBadge>
      : null;
  }

  const columns: DataTableColumn<PdvItem>[] = [
    { id: "reference", header: "Référence", cell: (row) => <span className="font-mono text-xs">{row.reference}</span> },
    { id: "code", header: "Code PDV", cell: (row) => row.codePdv },
    { id: "produit", header: "Produit", cell: (row) => row.produitCode },
    { id: "demandes", header: "Demandes", align: "center", cell: (row) => row.nombreDemandes },
    { id: "date", header: "Date de demande", cell: (row) => new Date(row.dateDemande).toLocaleString("fr-FR") },
    { id: "statut", header: "Statut", cell: (row) => <StatusBadge className={statusClass(row.status)}>{row.status}</StatusBadge> },
    { id: "concessionnaire", header: "Concessionnaire", cell: (row) => <span className="font-mono text-xs">{row.concessionnaireId ?? "—"}</span> },
    { id: "action", header: "Action", align: "right", cell: rowAction },
  ];

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Référentiel"
        title="Géolocalisation PDV"
        description="Géolocalisation des points de vente et suivi du workflow jusqu’à la finalisation."
        actions={
          <>
            <Button variant="secondary" leadingIcon={RefreshCw} onClick={() => void load(page)}>Actualiser</Button>
            {canExportPdv ? <Button variant="secondary" leadingIcon={Download} onClick={() => window.open(`/api/pdv-integrations/export?format=excel&agenceId=${encodeURIComponent(filterAgenceId)}&produitCode=${encodeURIComponent(filterProduit)}&status=${encodeURIComponent(filterStatus)}`, "_blank")}>Excel</Button> : null}
            {canExportPdv ? <Button variant="secondary" leadingIcon={Download} onClick={() => window.open(`/api/pdv-integrations/export?format=pdf&agenceId=${encodeURIComponent(filterAgenceId)}&produitCode=${encodeURIComponent(filterProduit)}&status=${encodeURIComponent(filterStatus)}`, "_blank")}>PDF</Button> : null}
            {canCreatePdv ? <Button leadingIcon={FilePlus2} onClick={openCreate}>Créer une demande</Button> : null}
          </>
        }
      />

      <FilterBar
        aria-label="Filtres des intégrations PDV"
        filters={
          <>
            <FormField label="Agence"><input value={filterAgenceId} onChange={(e) => setFilterAgenceId(e.target.value)} placeholder="Identifiant agence" /></FormField>
            <FormField label="Produit"><input value={filterProduit} onChange={(e) => setFilterProduit(e.target.value)} placeholder="Code produit" /></FormField>
            <FormField label="Statut"><select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "" | PdvStatus)}><option value="">Tous les statuts</option><option value="DEMANDE_RECUE">Demande reçue</option><option value="EN_TRAITEMENT">En traitement</option><option value="INTEGRE_GPR">Intégré GPR</option><option value="FINALISE">Finalisé</option></select></FormField>
            <FormField label="Du"><input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} /></FormField>
            <FormField label="Au"><input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} /></FormField>
          </>
        }
      />

      <Surface elevated>
        <SectionHeader title="Pilotage PDV" description="Indicateurs calculés sur les dossiers visibles et la charge en traitement." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Card title="Volume visible"><strong className="text-2xl">{analytics.volumeTotal}</strong></Card>
          <Card title="Pipeline actif"><strong className="text-2xl">{analytics.pipelineTotal}</strong></Card>
          <Card title="Taux finalisé"><strong className="text-2xl">{analytics.finalRate}%</strong></Card>
          <Card title="Cycle moyen"><strong className="text-2xl">{analytics.avgFinalizeDays} j</strong></Card>
          <Card title="Alertes > 5 jours"><strong className="text-2xl">{dashboard?.staleProcessingCount ?? 0}</strong></Card>
        </div>
        {dashboard?.byAgenceEnTraitement?.length ? (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Demandes en cours par agence">
            {dashboard.byAgenceEnTraitement.map((row) => <StatusBadge key={`${row.agenceId ?? "none"}-${row.count}`} tone="warning">{row.agenceId ?? "Non rattachée"} · {row.count}</StatusBadge>)}
          </div>
        ) : null}
      </Surface>

      {error ? <FeedbackState tone="danger" title="Opération impossible" description={error} /> : null}
      <Surface padding="none" elevated>
        {loading ? <Skeleton lines={6} /> : (
          <DataTable
            rows={items}
            columns={columns}
            rowKey={(row) => row.id}
            caption="Dossiers de géolocalisation PDV"
            getRowLabel={(row) => `Dossier ${row.reference}`}
            mobileCard={(row) => (
              <article className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><strong>{row.codePdv}</strong><p className="mt-1 text-sm text-slate-600">{row.reference} · {row.produitCode}</p></div><StatusBadge className={statusClass(row.status)}>{row.status}</StatusBadge></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Date de demande</dt><dd className="mt-1 font-medium">{new Date(row.dateDemande).toLocaleString("fr-FR")}</dd></div><div><dt className="text-slate-500">Demandes</dt><dd className="mt-1 font-medium">{row.nombreDemandes}</dd></div></dl>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{rowAction(row)}</div>
              </article>
            )}
          />
        )}
      </Surface>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{total} dossier(s)</p><Pagination page={page} pageCount={totalPages} onPageChange={(next) => void load(next)} label="Pagination des intégrations PDV" /></div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => { if (!open) closeCreate(); }}
        title="Créer une demande PDV"
        description="Renseignez les informations opérationnelles et la position du point de vente."
        size="lg"
        footer={
          <>
            <input ref={importFileInputRef} type="file" accept={getImportAcceptAttribute("PDV_INTEGRATIONS")} aria-label="Importer des dossiers PDV" className="sr-only" onChange={(e) => void onImportFileChange(e)} />
            <Button variant="ghost" leadingIcon={Upload} loading={importingFile} onClick={() => importFileInputRef.current?.click()}>Importer</Button>
            <Button variant="secondary" leadingIcon={Download} onClick={() => void downloadPdvIntegrationsExcelTemplate()}>Modèle Excel</Button>
            <Button variant="secondary" disabled={creating} onClick={closeCreate}>Annuler</Button>
            <Button type="submit" form="pdv-create-form" loading={creating}>Créer la demande</Button>
          </>
        }
      >
        {refError ? <FeedbackState tone="danger" title="Référentiels indisponibles" description={refError} /> : null}
        {createFormError ? <FeedbackState tone="danger" title="Création impossible" description={createFormError} /> : null}
        <form id="pdv-create-form" onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Agence concernée"><select value={agenceId} onChange={(e) => setAgenceId(e.target.value)} disabled={refLoading}><option value="">Aucune agence</option>{agences.slice().sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")).map((a) => <option key={a.id} value={a.id}>{a.code} — {a.libelle}</option>)}</select></FormField>
          <FormField label="Produit concerné" required><select required value={produitCode} onChange={(e) => setProduitCode(e.target.value)} disabled={refLoading}><option value="">Sélectionner un produit</option>{produits.slice().sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")).map((p) => <option key={p.code} value={p.code}>{p.libelle}</option>)}</select></FormField>
          <FormField label="Nombre de demandes" required><input required type="number" min={1} step={1} value={nombreDemandes} onChange={(e) => setNombreDemandes(e.target.value)} /></FormField>
          <FormField label="Date de la demande" required><input required type="datetime-local" value={dateDemande} onChange={(e) => setDateDemande(e.target.value)} /></FormField>
          <FormField label="Latitude" required><input required type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} /></FormField>
          <FormField label="Longitude" required><input required type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} /></FormField>
          <FormField label="Observations" className="sm:col-span-2"><textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} /></FormField>
        </form>
      </Dialog>

      <Dialog
        open={finalizeModal !== null}
        onOpenChange={(open) => { if (!open) closeFinalizeModal(); }}
        title={`${workflowAdvanceLabel()} la géolocalisation PDV`}
        description="Cette action peut créer ou lier automatiquement un concessionnaire."
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={finalizingId !== null} onClick={closeFinalizeModal}>Annuler</Button>
            <Button disabled={!finalizeAck || finalizingId !== null} loading={finalizingId !== null} onClick={() => finalizeModal && void finalizeIntegration(finalizeModal.id)}>Confirmer la finalisation</Button>
          </>
        }
      >
        {finalizeModal ? (
          <>
            <FeedbackState tone="warning" title="Action sensible" description="Vérifiez les données avant de poursuivre." />
            <dl className="mt-4 grid gap-2 text-sm"><div><dt>Référence</dt><dd>{finalizeModal.reference}</dd></div><div><dt>Code PDV</dt><dd>{finalizeModal.codePdv}</dd></div><div><dt>Raison sociale</dt><dd>{finalizeModal.raisonSociale}</dd></div><div><dt>GPS</dt><dd>{finalizeModal.gps.lat}, {finalizeModal.gps.lng}</dd></div></dl>
            <label className="mt-4 flex min-h-11 items-center gap-3"><input type="checkbox" checked={finalizeAck} onChange={(e) => setFinalizeAck(e.target.checked)} disabled={finalizingId !== null} /><span>Je confirme avoir vérifié les informations.</span></label>
          </>
        ) : null}
      </Dialog>
    </section>
  );
}
