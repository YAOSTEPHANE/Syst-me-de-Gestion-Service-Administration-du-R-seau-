"use client";

import ClientSearchPicker, {
  pickProduitCodeFromClient,
  type ClientPickerRow,
} from "@/components/lonaci/client-search-picker";
import { captureByAliases, extractPdfText, normalizeDateToIso } from "@/lib/lonaci/pdf-import";
import type { ChangeEvent } from "react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ATTESTATION_CIRCUIT_ETAPES,
  ATTESTATION_DOMICILIATION_STATUT_DESCRIPTIONS,
  ATTESTATION_DOMICILIATION_STATUT_LABELS,
  ATTESTATION_DOMICILIATION_STATUTS_SPEC_44,
  ATTESTATION_DOMICILIATION_TYPE_LABELS,
} from "@/lib/lonaci/constants";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import type { AttestationsDomiciliationDashboardIndicators } from "@/lib/lonaci/attestations-domiciliation";
import { notify } from "@/lib/toast";
import { Download, FilePlus2, Send, Upload } from "lucide-react";
import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { ConfirmDialog, Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { FormField } from "@/components/lonaci/ui/form-field";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Card, Surface } from "@/components/lonaci/ui/surface";

type DemandeType = "ATTESTATION_REVENU" | "DOMICILIATION_PRODUIT";
type DemandeStatut = "DEMANDE_RECUE" | "TRANSMIS" | "FINALISE" | "VALIDE" | "ENVOYE_CLIENT";
type ModuleView = "ATTESTATION_REVENU" | "DOMICILIATION_PRODUIT" | "ALL";

interface DemandeItem {
  id: string;
  type: DemandeType;
  concessionnaireId: string | null;
  agenceId: string | null;
  produitCode: string | null;
  dateDemande: string;
  statut: DemandeStatut;
  observations: string | null;
  delaiTraitementClientJours: number | null;
  clientEmailSentTo: string | null;
  sentToClientAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function statutBadgeClass(statut: DemandeStatut): string {
  switch (statut) {
    case "DEMANDE_RECUE":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "TRANSMIS":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "FINALISE":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "VALIDE":
      return "border-indigo-200 bg-indigo-50 text-indigo-900";
    case "ENVOYE_CLIENT":
      return "border-violet-200 bg-violet-50 text-violet-900";
  }
}

function typeBadgeClass(type: DemandeType): string {
  return type === "ATTESTATION_REVENU"
    ? "border-violet-200 bg-violet-50 text-violet-900"
    : "border-cyan-200 bg-cyan-50 text-cyan-900";
}

async function downloadAttestationsExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = ["type", "concessionnaireId", "produitCode", "dateDemande", "observations"];
  const sample = {
    type: "ATTESTATION_REVENU",
    concessionnaireId: "ID_CONCESSIONNAIRE",
    produitCode: "LOTO",
    dateDemande: new Date().toISOString(),
    observations: "Exemple import attestation/domiciliation",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "attestations_domiciliation");
  XLSX.writeFile(wb, "modele-attestations-domiciliation.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    type: ((raw.type as string | null) ?? "ATTESTATION_REVENU").toUpperCase(),
    concessionnaireId: (raw.concessionnaireId as string | null) ?? null,
    produitCode: (raw.produitCode as string | null)?.toUpperCase() ?? null,
    dateDemande: (raw.dateDemande as string | null) ?? null,
    observations: (raw.observations as string | null) ?? null,
    statut: (raw.statut as string | null) ?? "DEMANDE_RECUE",
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
      type:
        captureByAliases(source, ["type", "demande type"], "(attestation_revenu|domiciliation_produit)")?.toUpperCase() ??
        "ATTESTATION_REVENU",
      concessionnaireId: captureByAliases(source, ["concessionnaire id", "pdv id"], "[a-z0-9]{8,}"),
      produitCode: captureByAliases(source, ["code produit", "produit"], "[a-z0-9_ -]{2,20}")?.toUpperCase(),
      dateDemande: normalizeDateToIso(
        captureByAliases(source, ["date demande", "date"], "[0-9/\\- :tTzZ.+]{8,40}"),
      ),
      observations: captureByAliases(source, ["observations", "commentaire"], "[^|;]{1,300}"),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporté. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

function moduleViewToFilterType(view: ModuleView): "" | DemandeType {
  if (view === "ALL") return "";
  return view;
}

export default function AttestationsDomiciliationPanel() {
  const [moduleView, setModuleView] = useState<ModuleView>("ATTESTATION_REVENU");
  const [items, setItems] = useState<DemandeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [indicators, setIndicators] = useState<AttestationsDomiciliationDashboardIndicators | null>(
    null,
  );
  const [indicatorsLoading, setIndicatorsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const [filterType, setFilterType] = useState<"" | DemandeType>("ATTESTATION_REVENU");
  const [filterClient, setFilterClient] = useState<ClientPickerRow | null>(null);
  const [filterStatut, setFilterStatut] = useState<"" | DemandeStatut>("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterAgenceId, setFilterAgenceId] = useState("");
  const [agences, setAgences] = useState<Array<{ id: string; libelle: string }>>([]);

  const [produits, setProduits] = useState<Array<{ code: string; libelle: string; actif: boolean }>>([]);
  const [referentialsLoading, setReferentialsLoading] = useState(false);
  const [referentialsError, setReferentialsError] = useState<string | null>(null);

  const [type, setType] = useState<DemandeType>("ATTESTATION_REVENU");
  const [createClient, setCreateClient] = useState<ClientPickerRow | null>(null);
  const [produitCode, setProduitCode] = useState("");
  const [dateDemande, setDateDemande] = useState("");
  const [observations, setObservations] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    row: DemandeItem;
    kind: "TRANSMIS" | "FINALISE" | "VALIDE" | "ENVOYER";
  } | null>(null);

  const listQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filterType) params.set("type", filterType);
    if (filterClient?.id) params.set("lonaciClientId", filterClient.id);
    if (filterStatut) params.set("statut", filterStatut);
    if (filterDateFrom) params.set("dateFrom", new Date(`${filterDateFrom}T00:00:00`).toISOString());
    if (filterDateTo) params.set("dateTo", new Date(`${filterDateTo}T23:59:59.999`).toISOString());
    if (filterAgenceId) params.set("agenceId", filterAgenceId);
    return params;
  }, [filterType, filterClient?.id, filterStatut, filterDateFrom, filterDateTo, filterAgenceId]);

  async function loadIndicators() {
    setIndicatorsLoading(true);
    try {
      const params = new URLSearchParams(listQueryParams);
      const res = await fetch(`/api/attestations-domiciliation/stats?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Indicateurs indisponibles");
      const data = (await res.json()) as {
        indicators: AttestationsDomiciliationDashboardIndicators;
      };
      setIndicators(data.indicators);
    } catch {
      setIndicators(null);
    } finally {
      setIndicatorsLoading(false);
    }
  }

  async function load(nextPage = page) {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
      listQueryParams.forEach((value, key) => params.set(key, value));

      const res = await fetch(`/api/attestations-domiciliation?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as { items: DemandeItem[]; total: number; page: number };
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
    void loadIndicators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQueryParams]);

  function onModuleViewChange(view: ModuleView) {
    setModuleView(view);
    const nextFilter = moduleViewToFilterType(view);
    setFilterType(nextFilter);
    if (view !== "ALL") setType(view);
    setPage(1);
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const payload = {
        type,
        lonaciClientId: createClient?.id ?? null,
        produitCode: produitCode.trim() ? produitCode.trim().toUpperCase() : null,
        dateDemande: new Date(dateDemande).toISOString(),
        observations: observations.trim() ? observations.trim() : null,
      };
      const res = await fetch("/api/attestations-domiciliation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Création impossible");
      }
      closeCreate();
      notify.success("Demande enregistrée (statut Demande reçue).");
      await load(1);
      void loadIndicators();
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setCreateError(message);
      notify.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function transition(id: string, target: "TRANSMIS" | "FINALISE" | "VALIDE") {
    setBusyId(id);
    setListError(null);
    try {
      const res = await fetch(`/api/attestations-domiciliation/${encodeURIComponent(id)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Transition impossible");
      }
      await load(page);
      void loadIndicators();
      notify.success("Transition effectuée.");
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setListError(message);
      notify.error(message);
    } finally {
      setBusyId(null);
    }
  }

  async function envoyerAuClient(id: string) {
    setBusyId(id);
    setListError(null);
    try {
      const res = await fetch(
        `/api/attestations-domiciliation/${encodeURIComponent(id)}/envoyer-client`,
        { method: "POST", credentials: "include" },
      );
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        clientEmailSentTo?: string;
        sentToClientAt?: string;
      } | null;
      if (!res.ok) {
        throw new Error(body?.message ?? "Envoi au client impossible");
      }
      await load(page);
      void loadIndicators();
      notify.success(
        body?.clientEmailSentTo
          ? `Attestation envoyée à ${body.clientEmailSentTo} — statut Envoyé client.`
          : "Envoi client effectué.",
      );
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setListError(message);
      notify.error(message);
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
      fd.set("collection", "attestations_domiciliation");
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
      void loadIndicators();
      window.dispatchEvent(new Event("lonaci:data-imported"));
      notify.success(
        `Import attestations/domiciliation terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s), ${data?.skippedInvalidRows ?? 0} ligne(s) invalide(s)${
          data?.invalidRows?.[0] ? ` (ex: ligne ${data.invalidRows[0].index} - ${data.invalidRows[0].reason})` : ""
        }.`,
      );
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Import impossible");
      notify.error(message);
    } finally {
      setImportingFile(false);
      e.target.value = "";
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const exportQuery = listQueryParams.toString();

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";
  const inputClassXs =
    "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";
  const dashboardTitle = "Tableau de bord des attestations";
  const circuitEtapes = useMemo(
    () => ATTESTATION_CIRCUIT_ETAPES.filter((e, i, arr) => arr.findIndex((x) => x.step === e.step) === i),
    [],
  );
  const dashboardSubtitle =
    moduleView === "ATTESTATION_REVENU"
      ? "Attestation de revenu — demandes des concessionnaires, filtrable par période et par agence."
      : moduleView === "DOMICILIATION_PRODUIT"
        ? "Domiciliation produit — suivi et indicateurs de traitement."
        : "Vue consolidée attestations et domiciliation.";

  function resetCreateFields() {
    setType("ATTESTATION_REVENU");
    setCreateClient(null);
    setProduitCode("");
    setDateDemande("");
    setObservations("");
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
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const d = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    setDateDemande(`${y}-${m}-${d}T${hh}:${mm}`);
    // focus date for fast entry
    setTimeout(() => dateInputRef.current?.focus(), 0);
  }, [createOpen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Référentiels indisponibles");
        const data = (await res.json()) as {
          produits?: Array<{ code: string; libelle: string; actif: boolean }>;
          agences?: Array<{ id: string; libelle: string }>;
        };
        if (cancelled) return;
        setProduits((data.produits ?? []).slice().sort((a, b) => a.code.localeCompare(b.code, "fr")));
        setAgences((data.agences ?? []).slice().sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")));
      } catch {
        if (!cancelled) setReferentialsError("Référentiels indisponibles");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!createOpen || produits.length) return;
    setReferentialsLoading(true);
    setReferentialsError(null);
    setReferentialsLoading(false);
  }, [createOpen, produits.length]);

  function actionLabel(row: DemandeItem): string | null {
    if (row.statut === "DEMANDE_RECUE") return "Transmettre DFC";
    if (row.statut === "TRANSMIS") return "Finaliser (DFC)";
    if (row.statut === "FINALISE") return "Mettre en révision";
    if (row.statut === "VALIDE") return "Envoyer au client";
    return null;
  }

  function requestAction(row: DemandeItem) {
    const label = actionLabel(row);
    if (!label) return null;
    const kind = row.statut === "DEMANDE_RECUE" ? "TRANSMIS" : row.statut === "TRANSMIS" ? "FINALISE" : row.statut === "FINALISE" ? "VALIDE" : "ENVOYER";
    return <Button size="sm" leadingIcon={kind === "ENVOYER" ? Send : undefined} loading={busyId === row.id} onClick={() => setPendingAction({ row, kind })}>{label}</Button>;
  }

  const columns: DataTableColumn<DemandeItem>[] = [
    { id: "type", header: "Type", cell: (row) => <StatusBadge className={typeBadgeClass(row.type)}>{ATTESTATION_DOMICILIATION_TYPE_LABELS[row.type]}</StatusBadge> },
    { id: "produit", header: "Produit", cell: (row) => row.produitCode ?? "—" },
    { id: "client", header: "Concessionnaire", cell: (row) => <span className="font-mono text-xs">{row.concessionnaireId ?? "—"}</span> },
    { id: "date", header: "Date de demande", cell: (row) => new Date(row.dateDemande).toLocaleString("fr-FR") },
    { id: "statut", header: "Statut", cell: (row) => <StatusBadge className={statutBadgeClass(row.statut)} title={ATTESTATION_DOMICILIATION_STATUT_DESCRIPTIONS[row.statut]}>{ATTESTATION_DOMICILIATION_STATUT_LABELS[row.statut]}</StatusBadge> },
    { id: "delai", header: "Délai", cell: (row) => row.delaiTraitementClientJours != null ? `${row.delaiTraitementClientJours} j` : "—" },
    { id: "observations", header: "Observations", cell: (row) => row.observations ?? "—" },
    { id: "action", header: "Action", align: "right", cell: (row) => row.statut === "ENVOYE_CLIENT" ? (row.sentToClientAt ? new Date(row.sentToClientAt).toLocaleString("fr-FR") : "—") : requestAction(row) },
  ];

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Attestations & domiciliation"
        title={dashboardTitle}
        description={dashboardSubtitle}
        actions={
          <>
            <Button variant="secondary" leadingIcon={Download} onClick={() => window.open(`/api/attestations-domiciliation/export?format=excel&${exportQuery}`, "_blank")}>Excel</Button>
            <Button variant="secondary" leadingIcon={Download} onClick={() => window.open(`/api/attestations-domiciliation/export?format=pdf&${exportQuery}`, "_blank")}>PDF</Button>
            <Button variant="secondary" leadingIcon={Download} onClick={() => void downloadAttestationsExcelTemplate()}>Modèle Excel</Button>
            <input ref={importFileInputRef} type="file" accept=".json,.csv,.xlsx,.xls,.pdf" className="sr-only" aria-label="Importer des attestations" onChange={(e) => void onImportFileChange(e)} />
            <Button variant="secondary" leadingIcon={Upload} loading={importingFile} onClick={() => importFileInputRef.current?.click()}>Importer</Button>
            <Button leadingIcon={FilePlus2} onClick={() => setCreateOpen(true)}>Nouvelle demande</Button>
          </>
        }
      />

      <Surface>
        <SectionHeader title="Périmètre et circuit" description="Suivez séparément les attestations, les domiciliations ou la vue consolidée." />
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Périmètre module">
          {([["ATTESTATION_REVENU", "Attestation de revenu"], ["DOMICILIATION_PRODUIT", "Domiciliation"], ["ALL", "Tout"]] as const).map(([view, label]) => (
            <Button key={view} variant={moduleView === view ? "primary" : "secondary"} size="sm" role="tab" aria-selected={moduleView === view} onClick={() => onModuleViewChange(view)}>{label}</Button>
          ))}
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {circuitEtapes.map((etape) => <li key={etape.step} className="rounded-xl border border-orange-100 bg-orange-50/50 p-3 text-sm"><strong>{etape.step}. {etape.label}</strong><p className="mt-1 text-xs text-slate-600">{etape.description}</p></li>)}
        </ol>
      </Surface>

      <Surface>
        <SectionHeader title="Indicateurs clés" description={indicatorsLoading ? "Actualisation en cours…" : "Volumes et délais selon les filtres actifs."} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card title={ATTESTATION_DOMICILIATION_STATUT_LABELS.DEMANDE_RECUE}><strong className="text-2xl">{indicators?.enCours ?? "—"}</strong></Card>
          <Card title={ATTESTATION_DOMICILIATION_STATUT_LABELS.TRANSMIS}><strong className="text-2xl">{indicators?.transmisDfc ?? "—"}</strong></Card>
          <Card title={ATTESTATION_DOMICILIATION_STATUT_LABELS.FINALISE}><strong className="text-2xl">{indicators?.finalise ?? "—"}</strong></Card>
          <Card title={ATTESTATION_DOMICILIATION_STATUT_LABELS.VALIDE}><strong className="text-2xl">{indicators?.valide ?? "—"}</strong></Card>
          <Card title={ATTESTATION_DOMICILIATION_STATUT_LABELS.ENVOYE_CLIENT}><strong className="text-2xl">{indicators?.envoyeClient ?? "—"}</strong></Card>
        </div>
      </Surface>

      <FilterBar
        aria-label="Filtres des attestations et domiciliations"
        filters={
          <>
            <FormField label="Type"><select value={filterType} onChange={(e) => { const next = e.target.value as "" | DemandeType; setFilterType(next); setModuleView(next || "ALL"); }}><option value="">Tous les types</option><option value="ATTESTATION_REVENU">Attestation de revenu</option><option value="DOMICILIATION_PRODUIT">Domiciliation produit</option></select></FormField>
            <div className="min-w-56"><ClientSearchPicker label="Client" selected={filterClient} onSelectedChange={setFilterClient} filter="linkedPdv" inputClassName={inputClassXs} showClearLink searchPlaceholder="Rechercher un client" /></div>
            <FormField label="Statut"><select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value as "" | DemandeStatut)}><option value="">Tous les statuts</option>{ATTESTATION_DOMICILIATION_STATUTS_SPEC_44.map((row) => <option key={row.statut} value={row.statut}>{row.label}</option>)}</select></FormField>
            <FormField label="Agence"><select value={filterAgenceId} onChange={(e) => setFilterAgenceId(e.target.value)}><option value="">Toutes les agences</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.libelle}</option>)}</select></FormField>
            <FormField label="Du"><input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} /></FormField>
            <FormField label="Au"><input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} /></FormField>
          </>
        }
      />

      {listError ? <FeedbackState tone="danger" title="Chargement impossible" description={listError} /> : null}
      <Surface padding="none" elevated>
        {loading ? <Skeleton lines={6} /> : (
          <DataTable
            rows={items}
            columns={columns}
            rowKey={(row) => row.id}
            caption="Demandes d’attestation et de domiciliation"
            getRowLabel={(row) => `${ATTESTATION_DOMICILIATION_TYPE_LABELS[row.type]} du ${new Date(row.dateDemande).toLocaleDateString("fr-FR")}`}
            mobileCard={(row) => (
              <article className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><strong>{ATTESTATION_DOMICILIATION_TYPE_LABELS[row.type]}</strong><p className="mt-1 text-sm text-slate-600">{row.produitCode ?? "Sans produit"}</p></div><StatusBadge className={statutBadgeClass(row.statut)}>{ATTESTATION_DOMICILIATION_STATUT_LABELS[row.statut]}</StatusBadge></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Date de demande</dt><dd className="mt-1 font-medium">{new Date(row.dateDemande).toLocaleString("fr-FR")}</dd></div><div><dt className="text-slate-500">Délai</dt><dd className="mt-1 font-medium">{row.delaiTraitementClientJours != null ? `${row.delaiTraitementClientJours} j` : "—"}</dd></div></dl>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{requestAction(row)}</div>
              </article>
            )}
          />
        )}
      </Surface>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{total} demande(s)</p><Pagination page={page} pageCount={totalPages} onPageChange={(next) => void load(next)} label="Pagination des attestations" /></div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => { if (!open && !creating) closeCreate(); }}
        title="Nouvelle demande"
        description={`Statut initial : ${ATTESTATION_DOMICILIATION_STATUT_LABELS.DEMANDE_RECUE}.`}
        size="lg"
        footer={<><Button variant="secondary" disabled={creating} onClick={closeCreate}>Annuler</Button><Button type="submit" form="attestation-create-form" loading={creating}>Créer la demande</Button></>}
      >
        {createError ? <FeedbackState tone="danger" title="Création impossible" description={createError} /> : null}
        <form id="attestation-create-form" noValidate onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Type" required className="sm:col-span-2"><select required value={type} onChange={(e) => setType(e.target.value as DemandeType)}><option value="ATTESTATION_REVENU">Attestation de revenu</option><option value="DOMICILIATION_PRODUIT">Domiciliation produit</option></select></FormField>
          <div className="sm:col-span-2"><ClientSearchPicker key={`attestation-create-${createOpen}`} label="Client Lonaci" selected={createClient} onSelectedChange={(row) => { setCreateClient(row); const picked = pickProduitCodeFromClient(row, produits.filter((p) => p.actif).map((p) => p.code)); if (picked) setProduitCode(picked); }} filter="linkedPdv" inputClassName={inputClass} searchPlaceholder="Rechercher un client" /></div>
          <FormField label="Produit concerné" error={referentialsError}><select value={produitCode} onChange={(e) => setProduitCode(e.target.value)} disabled={referentialsLoading}><option value="">Aucun produit</option>{produits.filter((p) => p.actif).map((p) => <option key={p.code} value={p.code}>{p.code} — {p.libelle}</option>)}</select></FormField>
          <FormField label="Date de la demande" required><input ref={dateInputRef} required type="datetime-local" value={dateDemande} onChange={(e) => setDateDemande(e.target.value)} /></FormField>
          <FormField label="Observations" className="sm:col-span-2"><textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} /></FormField>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open && !busyId) setPendingAction(null); }}
        title="Confirmer l’action"
        description={pendingAction ? actionLabel(pendingAction.row) ?? undefined : undefined}
        message="Cette action fera avancer le dossier dans son workflow. Vérifiez les informations avant de confirmer."
        confirmLabel="Confirmer"
        pending={busyId !== null}
        onConfirm={async () => {
          if (!pendingAction) return;
          if (pendingAction.kind === "ENVOYER") await envoyerAuClient(pendingAction.row.id);
          else await transition(pendingAction.row.id, pendingAction.kind);
          setPendingAction(null);
        }}
      />
    </section>
  );
}
