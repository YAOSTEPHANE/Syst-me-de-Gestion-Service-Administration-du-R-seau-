"use client";

import DossierContratActualisationForm from "@/components/lonaci/dossier-contrat-actualisation-form";
import DossierCompletIndicator from "@/components/lonaci/dossier-complet-indicator";
import DossierDocumentChecklistBlock from "@/components/lonaci/dossier-document-checklist-block";
import {
  hideDossierN1N2ForChefService,
  listDossierBulkActionsForUi,
  listDossierTransitionActionsForUi,
  userMayPatchDossierPayload,
  type DossierTransitionAction,
} from "@/lib/auth/dossier-transition-rbac";
import { isWorkflowDocumentVisible } from "@/lib/auth/workflow-visibility";
import {
  getRoleWorkflowFilterStatuses,
  parseLonaciRole,
} from "@/lib/lonaci/workflow-ui-policy";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lonaciFetch } from "@/lib/lonaci-client-fetch";
import {
  contratStatutMetierBadgeClass,
  type ContratStatutMetier,
} from "@/lib/lonaci/contrat-statut-metier";
import { formatDossierOperationLabel, formatDossierTypeDetail } from "@/lib/lonaci/dossier-labels";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { openLonaciPdfInTab } from "@/lib/lonaci/download-pdf";
import { notify } from "@/lib/toast";
import {
  Download,
  Eye,
  FileText,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import { StatusBadge, type Tone } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { ConfirmDialog, Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { PageHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";

type DossierStatus =
  | "BROUILLON"
  | "SOUMIS"
  | "VALIDE_N1"
  | "VALIDE_N2"
  | "FINALISE"
  | "REJETE";

type TransitionAction = DossierTransitionAction;

interface BulkTransitionResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; message: string }>;
}

interface BulkTransitionLogItem {
  id: string;
  actorUserId: string;
  action: string;
  total: number;
  succeeded: number;
  failed: number;
  comment: string | null;
  resultSample: Array<{ id: string; ok: boolean; message: string }>;
  createdAt: string;
}

interface BulkTransitionLogsResponse {
  items: BulkTransitionLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

type ReplayMode = "FAILED_ONLY" | "ALL_SAMPLE";

interface DossierItem {
  id: string;
  reference: string;
  status: DossierStatus;
  type: string;
  payload?: Record<string, unknown>;
  concessionnaireId: string | null;
  lonaciClientId?: string | null;
  updatedAt: string;
  hasDocumentChecklist?: boolean;
  checklistComplet?: boolean | null;
  createdByUserId?: string;
  statutMetier?: ContratStatutMetier;
  statutMetierLabel?: string;
  statutMetierDescription?: string;
}

function dossierHasContratGenere(payload?: Record<string, unknown>): boolean {
  return Boolean(payload?.contratGenere && typeof payload.contratGenere === "object");
}

function dossierRecapPdfUrl(dossierId: string): string {
  return `/api/contrats/${encodeURIComponent(dossierId)}/export?view=1`;
}

function contratOfficielPdfUrl(dossierId: string): string {
  return `/api/contrats/${encodeURIComponent(dossierId)}/contrat/pdf?view=1`;
}

function dossierSubmitBlockedByChecklist(item: DossierItem): boolean {
  return (
    item.type === "CONTRAT_ACTUALISATION" &&
    item.hasDocumentChecklist === true &&
    item.checklistComplet === false
  );
}

interface DossierListResponse {
  items: DossierItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface DossierTransitionResponse {
  dossier?: {
    id: string;
    status: DossierStatus;
    updatedAt: string | Date;
  };
}

interface DossierDetailItem {
  id: string;
  reference: string;
  status: DossierStatus;
  type: string;
  concessionnaireId: string | null;
  lonaciClientId?: string | null;
  agenceId: string | null;
  payload: Record<string, unknown>;
  history: Array<{ status: DossierStatus; actedByUserId: string; actedAt: string; comment: string | null }>;
  createdAt: string;
  updatedAt: string;
  statutMetier?: ContratStatutMetier;
  statutMetierLabel?: string;
  statutMetierDescription?: string;
  hasContratGenere?: boolean;
  contratArchive?: boolean;
}

type SortField = "updatedAt" | "reference" | "status";
type SortOrder = "asc" | "desc";

async function fetchDossiers(
  page: number,
  pageSize: number,
  status?: DossierStatus,
  q?: string,
  concessionnaireId?: string,
  sortField: SortField = "updatedAt",
  sortOrder: SortOrder = "desc",
): Promise<DossierListResponse> {
  const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) {
    search.set("status", status);
  }
  if (q?.trim()) {
    search.set("q", q.trim());
  }
  if (concessionnaireId?.trim()) {
    search.set("concessionnaireId", concessionnaireId.trim());
  }
  search.set("sortField", sortField);
  search.set("sortOrder", sortOrder);
  const response = await lonaciFetch(`/api/dossiers?${search.toString()}`);
  if (!response.ok) {
    throw new Error("Impossible de charger les dossiers");
  }
  return response.json();
}

function actionLabel(action: TransitionAction): string {
  switch (action) {
    case "SUBMIT":
      return "Soumettre";
    case "VALIDATE_N1":
      return "Validation N1";
    case "VALIDATE_N2":
      return "Validation N2";
    case "FINALIZE":
      return "Finaliser";
    case "REJECT":
      return "Rejeter (retour brouillon)";
    case "RETURN_PREVIOUS":
      return "Retourner pour correction";
  }
}

function hideN1N2ForAdmin(role: string | null, action: TransitionAction): boolean {
  return hideDossierN1N2ForChefService(role, action);
}

function actionLabelFromRaw(action: string): string {
  if (
    action === "SUBMIT" ||
    action === "VALIDATE_N1" ||
    action === "VALIDATE_N2" ||
    action === "FINALIZE" ||
    action === "REJECT" ||
    action === "RETURN_PREVIOUS"
  ) {
    return actionLabel(action);
  }
  if (action === "REJECT_TO_DRAFT") return "Rejeter (brouillon)";
  return action;
}

function isSensitiveReplayAction(action: string): boolean {
  return action === "REJECT" || action === "RETURN_PREVIOUS" || action === "REJECT_TO_DRAFT";
}

function statusLabel(status: DossierStatus): string {
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
  }
}

const DOSSIER_STATUS_TONES: Record<DossierStatus, Tone> = {
  BROUILLON: "neutral",
  SOUMIS: "info",
  VALIDE_N1: "brand",
  VALIDE_N2: "brand",
  FINALISE: "success",
  REJETE: "danger",
};

function confirmMessage(action: TransitionAction): string | null {
  if (action === "FINALIZE") {
    return "Confirmer la finalisation du dossier ? Cette action crée le contrat actif.";
  }
  return null;
}

export default function DossiersPanel() {
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get("status")?.trim() ?? "";
  const [statusFilter, setStatusFilter] = useState<DossierStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DossierItem[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);
  const referenceFilter = searchParams.get("reference")?.trim() ?? "";
  const [search, setSearch] = useState(referenceFilter);
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [highlightedDossierId, setHighlightedDossierId] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [meUserId, setMeUserId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [serverTotal, setServerTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<TransitionAction>("SUBMIT");
  const [bulkComment, setBulkComment] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkLogs, setBulkLogs] = useState<BulkTransitionLogItem[]>([]);
  const [bulkLogsLoading, setBulkLogsLoading] = useState(false);
  const [bulkLogsPage, setBulkLogsPage] = useState(1);
  const [bulkLogsPageSize, setBulkLogsPageSize] = useState(8);
  const [bulkLogsTotal, setBulkLogsTotal] = useState(0);
  const [bulkLogsActionFilter, setBulkLogsActionFilter] = useState<string>("ALL");
  const [bulkLogsFailedOnly, setBulkLogsFailedOnly] = useState(false);
  const [bulkLogsReplayBusyId, setBulkLogsReplayBusyId] = useState<string | null>(null);
  const [selectedBulkLogIds, setSelectedBulkLogIds] = useState<string[]>([]);
  const [bulkReplaySelectionBusy, setBulkReplaySelectionBusy] = useState(false);
  const [bulkReplayMode, setBulkReplayMode] = useState<ReplayMode>("FAILED_ONLY");
  const [bulkReplayCommentOverride, setBulkReplayCommentOverride] = useState("");
  const [transitionConfirmation, setTransitionConfirmation] = useState<{
    id: string;
    action: TransitionAction;
  } | null>(null);
  const [replaySelectionConfirmationOpen, setReplaySelectionConfirmationOpen] = useState(false);
  const [meReplayKey, setMeReplayKey] = useState<string | null>(null);
  const fieldClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";
  const concessionnaireFilter = searchParams.get("concessionnaireId") ?? "";

  async function load() {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDossiers(
        page,
        pageSize,
        statusFilter === "ALL" ? undefined : statusFilter,
        search,
        concessionnaireFilter,
        sortField,
        sortOrder,
      );
      setItems(data.items);
      setServerTotal(data.total);
      if (data.page !== page) setPage(data.page);
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur de chargement");
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }

  async function transition(id: string, action: TransitionAction, comment?: string | null) {
    if (action === "SUBMIT") {
      const row = items.find((i) => i.id === id);
      if (row && dossierSubmitBlockedByChecklist(row)) {
        const msg = friendlyErrorMessage("DOSSIER_CHECKLIST_INCOMPLETE");
        setError(msg);
        notify.error(msg);
        return false;
      }
    }
    setActionBusyId(id);
    try {
      const body: { action: TransitionAction; comment?: string | null } = { action };
      if (comment !== undefined) body.comment = comment;

      const response = await lonaciFetch(`/api/dossiers/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? "Transition impossible");
      }

      const result = (await response.json().catch(() => null)) as DossierTransitionResponse | null;
      const transitioned = result?.dossier;
      if (transitioned) {
        const updatedAt =
          transitioned.updatedAt instanceof Date
            ? transitioned.updatedAt.toISOString()
            : transitioned.updatedAt;
        const currentItem = items.find((item) => item.id === transitioned.id);
        const parsedRole = parseLonaciRole(meRole);
        const leavesVisibleQueue =
          !parsedRole ||
          !isWorkflowDocumentVisible({
            workflow: "DOSSIERS",
            role: parsedRole,
            userId: meUserId,
            creatorId: currentItem?.createdByUserId,
            status: transitioned.status,
          });
        const leavesActiveFilter =
          (statusFilter !== "ALL" && transitioned.status !== statusFilter) ||
          leavesVisibleQueue;

        setItems((current) => {
          const updated = current.map((item) =>
            item.id === transitioned.id
              ? { ...item, status: transitioned.status, updatedAt }
              : item,
          );
          return leavesActiveFilter
            ? updated.filter((item) => item.id !== transitioned.id)
            : updated;
        });
        if (leavesActiveFilter) {
          setServerTotal((current) => Math.max(0, current - 1));
        }
        setSelectedIds((current) => current.filter((selectedId) => selectedId !== transitioned.id));
        setDetailItem((current) =>
          current?.id === transitioned.id
            ? { ...current, status: transitioned.status, updatedAt }
            : current,
        );
      }

      await load();
      notify.success("Transition effectuée avec succès.");
      return true;
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur de transition");
      setError(message);
      notify.error(message);
      return false;
    } finally {
      setActionBusyId(null);
    }
  }

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionAction, setDecisionAction] = useState<TransitionAction | null>(null);
  const [decisionDossierId, setDecisionDossierId] = useState<string | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<DossierDetailItem | null>(null);

  async function openDetail(id: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailItem(null);
    try {
      const res = await lonaciFetch(`/api/dossiers/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Détail dossier indisponible");
      }
      const body = (await res.json()) as { dossier: DossierDetailItem };
      setDetailItem(body.dossier);
    } catch (err) {
      notify.error(
        friendlyErrorMessage(err instanceof Error ? err.message : "Erreur de chargement du détail"),
      );
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
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

  async function openContratOfficielPdf(dossierId: string) {
    try {
      await openLonaciPdfInTab(contratOfficielPdfUrl(dossierId));
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "PDF contrat indisponible."));
    }
  }

  function openDecision(id: string, action: TransitionAction) {
    setDecisionDossierId(id);
    setDecisionAction(action);
    setDecisionComment("");
    setDecisionOpen(true);
  }

  function closeDecision() {
    setDecisionOpen(false);
    setDecisionDossierId(null);
    setDecisionAction(null);
    setDecisionComment("");
  }

  async function submitDecision() {
    if (!decisionDossierId || !decisionAction) return;
    const trimmed = decisionComment.trim();
    if (!trimmed) {
      notify.error("Motif/commentaire obligatoire.");
      return;
    }

    const ok = await transition(decisionDossierId, decisionAction, trimmed);
    if (ok) closeDecision();
  }

  const loadBulkLogs = useCallback(async () => {
    setBulkLogsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(bulkLogsPage),
        pageSize: String(bulkLogsPageSize),
        failedOnly: bulkLogsFailedOnly ? "1" : "0",
      });
      if (bulkLogsActionFilter !== "ALL") {
        params.set("action", bulkLogsActionFilter);
      }
      const response = await lonaciFetch(`/api/dossiers/bulk-transition/logs?${params.toString()}`);
      if (!response.ok) {
        setBulkLogs([]);
        setBulkLogsTotal(0);
        return;
      }
      const body = (await response.json()) as BulkTransitionLogsResponse;
      setBulkLogs(body.items ?? []);
      setBulkLogsTotal(body.total ?? 0);
    } catch {
      setBulkLogs([]);
      setBulkLogsTotal(0);
    } finally {
      setBulkLogsLoading(false);
    }
  }, [bulkLogsActionFilter, bulkLogsFailedOnly, bulkLogsPage, bulkLogsPageSize]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await lonaciFetch("/api/auth/me");
        if (!r.ok) return;
        const d = (await r.json()) as {
          user?: { role?: string; _id?: string; id?: string; email?: string };
        };
        setMeRole(d.user?.role ?? null);
        setMeUserId(String(d.user?._id ?? d.user?.id ?? ""));
        const rawKey = d.user?._id ?? d.user?.id ?? d.user?.email ?? d.user?.role ?? "anonymous";
        setMeReplayKey(String(rawKey));
      } catch {
        setMeRole(null);
        setMeReplayKey("anonymous");
      }
    })();
  }, []);

  useEffect(() => {
    if (!meReplayKey) return;
    if (typeof window === "undefined") return;
    try {
      const saved = window.sessionStorage.getItem(`lonaci:bulk-replay-comment:${meReplayKey}`);
      if (saved !== null) {
        setBulkReplayCommentOverride(saved);
      }
    } catch {
      // Ignore sessionStorage errors.
    }
  }, [meReplayKey]);

  useEffect(() => {
    if (!meReplayKey) return;
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(`lonaci:bulk-replay-comment:${meReplayKey}`, bulkReplayCommentOverride);
    } catch {
      // Ignore sessionStorage errors.
    }
  }, [bulkReplayCommentOverride, meReplayKey]);

  const bulkActionsForUi = useMemo(
    () => listDossierBulkActionsForUi(meRole, statusFilter === "ALL" ? null : statusFilter),
    [meRole, statusFilter],
  );
  const visibleDossierStatuses = useMemo(
    () => getRoleWorkflowFilterStatuses("DOSSIERS", parseLonaciRole(meRole)),
    [meRole],
  );
  useEffect(() => {
    if (statusFilter === "ALL" || visibleDossierStatuses.includes(statusFilter)) return;
    setStatusFilter("ALL");
  }, [statusFilter, visibleDossierStatuses]);

  useEffect(() => {
    if (!bulkActionsForUi.includes(bulkAction)) {
      setBulkAction(bulkActionsForUi[0] ?? "SUBMIT");
    }
    if (bulkLogsActionFilter === "VALIDATE_N1" || bulkLogsActionFilter === "VALIDATE_N2") {
      if (meRole === "CHEF_SERVICE") {
        setBulkLogsActionFilter("ALL");
      }
    }
  }, [bulkAction, bulkActionsForUi, bulkLogsActionFilter, meRole]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page, pageSize, search, concessionnaireFilter, sortField, sortOrder]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, pageSize, search, concessionnaireFilter, sortField, sortOrder]);

  useEffect(() => {
    if (referenceFilter) {
      setSearch(referenceFilter);
    }
  }, [referenceFilter]);

  useEffect(() => {
    if (
      statusFromUrl === "BROUILLON" ||
      statusFromUrl === "SOUMIS" ||
      statusFromUrl === "VALIDE_N1" ||
      statusFromUrl === "VALIDE_N2" ||
      statusFromUrl === "FINALISE" ||
      statusFromUrl === "REJETE"
    ) {
      setStatusFilter(statusFromUrl);
    }
  }, [statusFromUrl]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => items.some((row) => row.id === id)));
  }, [items]);

  useEffect(() => {
    void loadBulkLogs();
  }, [loadBulkLogs]);

  useEffect(() => {
    setSelectedBulkLogIds((prev) => prev.filter((id) => bulkLogs.some((row) => row.id === id)));
  }, [bulkLogs]);

  useEffect(() => {
    const replayComment = bulkReplayCommentOverride.trim();
    if (bulkReplayMode !== "ALL_SAMPLE" || replayComment) return;
    const selectedLogs = bulkLogs.filter((log) => selectedBulkLogIds.includes(log.id));
    if (!selectedLogs.some((log) => isSensitiveReplayAction(log.action))) return;
    setBulkReplayMode("FAILED_ONLY");
    notify.warning("Retour automatique en mode échecs seuls: commentaire explicite manquant.");
  }, [bulkReplayCommentOverride, bulkReplayMode, bulkLogs, selectedBulkLogIds]);

  const filteredItems = useMemo(() => items, [items]);

  const totalVisible = useMemo(() => filteredItems.length, [filteredItems]);
  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
  const replayCommentProvided = bulkReplayCommentOverride.trim().length > 0;
  const selectedBulkLogs = useMemo(
    () => bulkLogs.filter((log) => selectedBulkLogIds.includes(log.id)),
    [bulkLogs, selectedBulkLogIds],
  );
  const hasSensitiveSelectedBulkLogs = useMemo(
    () => selectedBulkLogs.some((log) => isSensitiveReplayAction(log.action)),
    [selectedBulkLogs],
  );
  const allSampleBlockedForSelection = hasSensitiveSelectedBulkLogs && !replayCommentProvided;

  async function runBulkTransition() {
    if (!selectedIds.length || bulkBusy) return;
    if ((bulkAction === "REJECT" || bulkAction === "RETURN_PREVIOUS") && !bulkComment.trim()) {
      notify.error("Commentaire obligatoire pour cette action en lot.");
      return;
    }

    setBulkBusy(true);
    try {
      const response = await lonaciFetch("/api/dossiers/bulk-transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          action: bulkAction,
          comment: bulkComment.trim() ? bulkComment.trim() : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | BulkTransitionResponse
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error((body as { message?: string } | null)?.message ?? "Transition bulk impossible");
      }

      const report = body as BulkTransitionResponse;
      const firstFailures = report.results
        .filter((row) => !row.ok)
        .slice(0, 3)
        .map((row) => `${row.id}: ${row.message}`);
      const reportMessage =
        report.failed === 0
          ? `${report.succeeded}/${report.total} dossier(s) mis à jour.`
          : `${report.succeeded}/${report.total} réussi(s), ${report.failed} échec(s). ${firstFailures.join(" | ")}`;
      if (report.failed === 0) {
        notify.success(reportMessage);
      } else {
        notify.warning(reportMessage);
      }
      setSelectedIds([]);
      await load();
      await loadBulkLogs();
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur transition bulk"));
    } finally {
      setBulkBusy(false);
    }
  }

  function exportBulkLogsCsv() {
    const params = new URLSearchParams({
      page: "1",
      pageSize: "100",
      failedOnly: bulkLogsFailedOnly ? "1" : "0",
      format: "csv",
    });
    if (bulkLogsActionFilter !== "ALL") {
      params.set("action", bulkLogsActionFilter);
    }
    window.open(`/api/dossiers/bulk-transition/logs?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  async function replayBulkFailures(logId: string) {
    const replayComment = bulkReplayCommentOverride.trim();
    const log = bulkLogs.find((row) => row.id === logId);
    if (bulkReplayMode === "ALL_SAMPLE" && !replayComment && log && isSensitiveReplayAction(log.action)) {
      notify.error("Mode échantillon complet bloqué: ajoutez un commentaire explicite de rejeu.");
      return;
    }
    setBulkLogsReplayBusyId(logId);
    try {
      const response = await lonaciFetch("/api/dossiers/bulk-transition/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, mode: bulkReplayMode, commentOverride: replayComment || null }),
      });
      const body = (await response.json().catch(() => null)) as
        | BulkTransitionResponse
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error((body as { message?: string } | null)?.message ?? "Rejeu impossible");
      }
      const report = body as BulkTransitionResponse;
      const reportMessage =
        report.failed === 0
          ? `Rejeu réussi: ${report.succeeded}/${report.total}.`
          : `Rejeu partiel: ${report.succeeded}/${report.total}, ${report.failed} échec(s).`;
      if (report.failed === 0) {
        notify.success(reportMessage);
      } else {
        notify.warning(reportMessage);
      }
      await load();
      await loadBulkLogs();
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur de rejeu"));
    } finally {
      setBulkLogsReplayBusyId(null);
    }
  }

  async function replaySelectedBulkFailures() {
    if (!selectedBulkLogIds.length || bulkReplaySelectionBusy) return;
    const replayComment = bulkReplayCommentOverride.trim();
    const selectedLogs = bulkLogs.filter((log) => selectedBulkLogIds.includes(log.id));
    const hasSensitiveSelected = selectedLogs.some((log) => isSensitiveReplayAction(log.action));
    if (bulkReplayMode === "ALL_SAMPLE" && hasSensitiveSelected && !replayComment) {
      notify.error(
        "Mode échantillon complet bloqué: commentaire explicite requis pour les actions sensibles.",
      );
      return;
    }
    setBulkReplaySelectionBusy(true);
    try {
      let totalSucceeded = 0;
      let totalTotal = 0;
      let totalFailed = 0;
      let failedLogs = 0;
      for (const logId of selectedBulkLogIds) {
        const response = await lonaciFetch("/api/dossiers/bulk-transition/replay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logId, mode: bulkReplayMode, commentOverride: replayComment || null }),
        });
        const body = (await response.json().catch(() => null)) as
          | BulkTransitionResponse
          | { message?: string }
          | null;
        if (!response.ok) {
          failedLogs += 1;
          continue;
        }
        const report = body as BulkTransitionResponse;
        totalSucceeded += report.succeeded;
        totalTotal += report.total;
        totalFailed += report.failed;
      }
      setSelectedBulkLogIds([]);
      await load();
      await loadBulkLogs();
      if (failedLogs > 0) {
        notify.warning(
          `Rejeu terminé avec incidents: ${failedLogs} journal(aux) non rejoué(s), ${totalSucceeded}/${totalTotal} dossier(s) réussi(s).`,
        );
      } else {
        const reportMessage =
          totalFailed === 0
            ? `Rejeu groupé réussi: ${totalSucceeded}/${totalTotal}.`
            : `Rejeu groupé partiel: ${totalSucceeded}/${totalTotal}, ${totalFailed} échec(s).`;
        if (totalFailed === 0) {
          notify.success(reportMessage);
        } else {
          notify.warning(reportMessage);
        }
      }
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur de rejeu groupé"));
    } finally {
      setBulkReplaySelectionBusy(false);
    }
  }

  useEffect(() => {
    if (!referenceFilter || loading || filteredItems.length === 0) return;
    const target = filteredItems.find((item) => item.reference === referenceFilter);
    if (!target) return;
    const cell = document.getElementById(`dossier-${target.id}`);
    if (!cell) return;
    cell.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedDossierId(target.id);
    const timeout = window.setTimeout(() => setHighlightedDossierId(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [referenceFilter, filteredItems, loading]);

  function dossierActions(item: DossierItem) {
    const transitions = listDossierTransitionActionsForUi(meRole, item.status);
    return (
      <div className="flex flex-wrap gap-2">
        {transitions.map((action) => {
          const submitBlocked = action === "SUBMIT" && dossierSubmitBlockedByChecklist(item);
          return (
            <Button
              key={action}
              size="sm"
              variant={action === "REJECT" ? "danger" : "secondary"}
              disabled={actionBusyId === item.id || submitBlocked}
              title={
                submitBlocked
                  ? "Checklist documents incomplète — marquez tous les documents obligatoires comme Fourni"
                  : undefined
              }
              onClick={() => {
                if (action === "REJECT" || action === "RETURN_PREVIOUS") {
                  openDecision(item.id, action);
                } else if (confirmMessage(action)) {
                  setTransitionConfirmation({ id: item.id, action });
                } else {
                  void transition(item.id, action);
                }
              }}
            >
              {actionLabel(action)}
            </Button>
          );
        })}
        {transitions.length === 0 ? <span className="self-center text-xs text-slate-400">Aucune transition</span> : null}
        <Button size="sm" variant="secondary" leadingIcon={Eye} onClick={() => void openDetail(item.id)}>
          Détail
        </Button>
        <Button size="sm" variant="secondary" leadingIcon={Download} onClick={() => void openDossierRecapPdf(item.id)}>
          Récap.
        </Button>
        {dossierHasContratGenere(item.payload) ? (
          <Button size="sm" leadingIcon={FileText} onClick={() => void openContratOfficielPdf(item.id)}>
            Contrat
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Gestion des contrats"
        title="Dossiers"
        description="Checklist documentaire, génération du contrat et circuit de validation en quatre niveaux."
        actions={
          <Button variant="secondary" leadingIcon={RefreshCw} onClick={() => void load()}>
            Actualiser
          </Button>
        }
      />
      <Surface elevated>
      <FilterBar
        search={{
          value: search,
          onChange: setSearch,
          label: "Rechercher un dossier",
          placeholder: "Référence, statut, type ou client…",
        }}
        filters={
          <>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            aria-label="Champ de tri dossiers"
            className={fieldClass}
          >
            <option value="updatedAt">Tri: date MAJ</option>
            <option value="reference">Tri: référence</option>
            <option value="status">Tri: statut</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            aria-label="Ordre de tri dossiers"
            className={fieldClass}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DossierStatus | "ALL")}
            aria-label="Filtrer les dossiers par statut"
            className={fieldClass}
          >
            <option value="ALL">Tous</option>
            {visibleDossierStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Nombre de dossiers par page"
            className={fieldClass}
          >
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
          </>
        }
        actions={
          <Button variant="secondary" leadingIcon={RotateCcw} onClick={() => {
            setSearch("");
            setStatusFilter("ALL");
            setSortField("updatedAt");
            setSortOrder("desc");
          }}>
            Réinitialiser
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{totalVisible} dossier(s) affiché(s)</span>
        <span>•</span>
        <span>Total: {serverTotal}</span>
        <span>•</span>
        <span>Page {page}/{totalPages}</span>
      </div>
      <div className="mb-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-4">
        <select
          value={bulkAction}
          onChange={(e) => setBulkAction(e.target.value as TransitionAction)}
          aria-label="Action en lot"
          className={fieldClass}
        >
          {bulkActionsForUi.map((action) => (
              <option key={action} value={action}>
                {actionLabel(action)}
              </option>
            ))}
        </select>
        <input
          value={bulkComment}
          onChange={(e) => setBulkComment(e.target.value)}
          placeholder="Commentaire lot (obligatoire pour rejet/retour)"
          className={`lg:col-span-2 ${fieldClass}`}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!selectedIds.length || bulkBusy}
            onClick={() => void runBulkTransition()}
            className="rounded-lg border border-cyan-600 bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
          >
            {bulkBusy ? "Traitement..." : `Appliquer en lot (${selectedIds.length})`}
          </button>
          <button
            type="button"
            disabled={!selectedIds.length || bulkBusy}
            onClick={() => setSelectedIds([])}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Effacer
          </button>
        </div>
      </div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Dernières exécutions bulk</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={
                !selectedBulkLogIds.length ||
                bulkReplaySelectionBusy ||
                (bulkReplayMode === "ALL_SAMPLE" && allSampleBlockedForSelection)
              }
              onClick={() => setReplaySelectionConfirmationOpen(true)}
              className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {bulkReplaySelectionBusy
                ? "Rejeu sélection..."
                : `Rejouer sélection (${selectedBulkLogIds.length})`}
            </button>
            <button
              type="button"
              onClick={exportBulkLogsCsv}
              className="rounded border border-cyan-300 bg-cyan-50 px-2 py-1 text-xs text-cyan-800 hover:bg-cyan-100"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void loadBulkLogs()}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Rafraîchir
            </button>
          </div>
        </div>
        <div className="mb-2 grid gap-2 md:grid-cols-3">
          <select
            value={bulkLogsActionFilter}
            onChange={(e) => {
              setBulkLogsPage(1);
              setBulkLogsActionFilter(e.target.value);
            }}
            className={fieldClass}
            aria-label="Filtrer l'historique bulk par action"
          >
            <option value="ALL">Toutes les actions</option>
            {(["SUBMIT", "VALIDATE_N1", "VALIDATE_N2", "FINALIZE", "REJECT", "RETURN_PREVIOUS"] as const)
              .filter((action) => !hideN1N2ForAdmin(meRole, action))
              .map((action) => (
                <option key={action} value={action}>
                  {actionLabel(action)}
                </option>
              ))}
            <option value="REJECT_TO_DRAFT">Rejeter (brouillon)</option>
          </select>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={bulkLogsFailedOnly}
              onChange={(e) => {
                setBulkLogsPage(1);
                setBulkLogsFailedOnly(e.target.checked);
              }}
            />
            Échecs uniquement
          </label>
          <select
            value={bulkLogsPageSize}
            onChange={(e) => {
              setBulkLogsPage(1);
              setBulkLogsPageSize(Number(e.target.value));
            }}
            className={fieldClass}
            aria-label="Nombre de journaux bulk par page"
          >
            <option value={8}>8 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-700">Mode rejeu:</label>
          <select
            value={bulkReplayMode}
            onChange={(e) => setBulkReplayMode(e.target.value as ReplayMode)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
            aria-label="Mode de rejeu de l'historique bulk"
          >
            <option value="FAILED_ONLY">Échecs seuls</option>
            <option value="ALL_SAMPLE" disabled={allSampleBlockedForSelection}>
              Échantillon complet
            </option>
          </select>
          <input
            value={bulkReplayCommentOverride}
            onChange={(e) => setBulkReplayCommentOverride(e.target.value)}
            placeholder="Commentaire explicite de rejeu (requis pour actions sensibles)"
            className="w-full max-w-xl rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
          />
          <button
            type="button"
            disabled={!bulkReplayCommentOverride.trim()}
            onClick={() => setBulkReplayCommentOverride("")}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Effacer le commentaire
          </button>
        </div>
        {allSampleBlockedForSelection ? (
          <p className="mb-2 text-xs text-amber-700">
            Le mode échantillon complet est bloqué pour la sélection actuelle: ajoutez un commentaire explicite.
          </p>
        ) : null}
        {bulkLogsLoading ? <p className="text-xs text-slate-500">Chargement...</p> : null}
        {!bulkLogsLoading && bulkLogs.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun journal bulk disponible.</p>
        ) : null}
        {!bulkLogsLoading && bulkLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label="Sélectionner tous les journaux bulk visibles"
                      disabled={!bulkLogs.some((log) => log.failed > 0) || bulkReplaySelectionBusy}
                      checked={
                        bulkLogs.some((log) => log.failed > 0) &&
                        bulkLogs.every((log) => (log.failed > 0 ? selectedBulkLogIds.includes(log.id) : true))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          const ids = bulkLogs.filter((log) => log.failed > 0).map((log) => log.id);
                          setSelectedBulkLogIds((prev) => [...new Set([...prev, ...ids])]);
                        } else {
                          const visible = new Set(bulkLogs.map((log) => log.id));
                          setSelectedBulkLogIds((prev) => prev.filter((id) => !visible.has(id)));
                        }
                      }}
                    />
                  </th>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Action</th>
                  <th className="px-2 py-1.5">Acteur</th>
                  <th className="px-2 py-1.5 text-right">Résultat</th>
                  <th className="px-2 py-1.5">Commentaire</th>
                  <th className="px-2 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bulkLogs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100 text-slate-700">
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner le journal ${log.id}`}
                        disabled={log.failed === 0 || bulkReplaySelectionBusy}
                        checked={selectedBulkLogIds.includes(log.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBulkLogIds((prev) => [...new Set([...prev, log.id])]);
                          } else {
                            setSelectedBulkLogIds((prev) => prev.filter((id) => id !== log.id));
                          }
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5">{new Date(log.createdAt).toLocaleString("fr-FR")}</td>
                    <td className="px-2 py-1.5">{actionLabelFromRaw(log.action)}</td>
                    <td className="px-2 py-1.5">{log.actorUserId}</td>
                    <td className="px-2 py-1.5 text-right">
                      <span className={log.failed === 0 ? "text-emerald-700" : "text-rose-700"}>
                        {log.succeeded}/{log.total}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">{log.comment ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        disabled={
                          log.failed === 0 ||
                          bulkLogsReplayBusyId === log.id ||
                          bulkReplaySelectionBusy ||
                          (bulkReplayMode === "ALL_SAMPLE" &&
                            isSensitiveReplayAction(log.action) &&
                            !replayCommentProvided)
                        }
                        onClick={() => void replayBulkFailures(log.id)}
                        className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {bulkLogsReplayBusyId === log.id ? "Rejeu..." : "Rejouer"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            {bulkLogsTotal} journal(aux) • page {bulkLogsPage}/
            {Math.max(1, Math.ceil(bulkLogsTotal / bulkLogsPageSize))}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={bulkLogsPage <= 1 || bulkLogsLoading}
              onClick={() => setBulkLogsPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={bulkLogsPage >= Math.max(1, Math.ceil(bulkLogsTotal / bulkLogsPageSize)) || bulkLogsLoading}
              onClick={() =>
                setBulkLogsPage((p) => Math.min(Math.max(1, Math.ceil(bulkLogsTotal / bulkLogsPageSize)), p + 1))
              }
              className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        </div>
      </div>
      {concessionnaireFilter ? (
        <p className="mb-4 text-xs text-emerald-700">
          Filtre concessionnaire actif: {concessionnaireFilter}
        </p>
      ) : null}
      {referenceFilter ? (
        <p className="mb-4 text-xs text-emerald-700">Filtre référence actif: {referenceFilter}</p>
      ) : null}

      {loading ? <FeedbackState title="Chargement des dossiers" description="Actualisation de la file de travail…" /> : null}
      {error ? (
        <FeedbackState className="mb-3" tone="danger" title="Chargement impossible" description={error} aria-live="assertive" />
      ) : null}

      {!loading ? (
        <div>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Sélectionner tous les dossiers visibles"
                    checked={filteredItems.length > 0 && filteredItems.every((row) => selectedIds.includes(row.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds((prev) => [...new Set([...prev, ...filteredItems.map((row) => row.id)])]);
                      } else {
                        const hidden = selectedIds.filter((id) => !filteredItems.some((row) => row.id === id));
                        setSelectedIds(hidden);
                      }
                    }}
                  />
                </th>
                <th className="px-3 py-2.5">Référence</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Statut contrat</th>
                <th className="px-3 py-2.5">Checklist</th>
                <th className="px-3 py-2.5">Opération</th>
                <th className="px-3 py-2.5">Concessionnaire</th>
                <th className="px-3 py-2.5">MAJ</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-slate-100 transition hover:bg-cyan-50/40 ${
                    highlightedDossierId === item.id ? "bg-emerald-50" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${item.reference}`}
                      checked={selectedIds.includes(item.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) =>
                          e.target.checked ? [...new Set([...prev, item.id])] : prev.filter((id) => id !== item.id),
                        );
                      }}
                    />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs" id={`dossier-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => void openDetail(item.id)}
                      className="text-left text-cyan-700 hover:text-cyan-900 hover:underline"
                    >
                      {item.reference}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={DOSSIER_STATUS_TONES[item.status]}>
                      {statusLabel(item.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2.5">
                    {item.type === "CONTRAT_ACTUALISATION" && item.statutMetier ? (
                      <span
                        title={item.statutMetierDescription ?? ""}
                        className={`inline-flex max-w-[10rem] rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight ${contratStatutMetierBadgeClass(item.statutMetier)}`}
                      >
                        {item.statutMetierLabel ?? item.statutMetier}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {item.hasDocumentChecklist ? (
                      <DossierCompletIndicator
                        complet={item.checklistComplet === true}
                        size="sm"
                        live={detailOpen && highlightedDossierId === item.id}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-800">
                    {formatDossierOperationLabel(item.type, item.payload)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    <Link
                      href={
                        item.lonaciClientId
                          ? `/contrats?lonaciClientId=${encodeURIComponent(item.lonaciClientId)}`
                          : item.concessionnaireId
                            ? `/contrats?concessionnaireId=${encodeURIComponent(item.concessionnaireId)}`
                            : "/contrats"
                      }
                      className="text-cyan-700 hover:text-cyan-800"
                    >
                      {item.lonaciClientId ?? item.concessionnaireId ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{new Date(item.updatedAt).toLocaleString()}</td>
                  <td className="px-3 py-2.5">
                    {dossierActions(item)}
                  </td>
                </tr>
              ))}
              {!filteredItems.length ? (
                <tr>
                  <td className="px-3 py-6 text-slate-500" colSpan={7}>
                    Aucun dossier trouvé.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-3 py-3">
            <Pagination page={page} pageCount={totalPages} onPageChange={setPage} label="Pagination des dossiers" />
          </div>
        </div>
        <div className="grid gap-3 md:hidden" role="list" aria-label="Dossiers">
          {filteredItems.length === 0 ? (
            <FeedbackState title="Aucun dossier" description="Aucun dossier ne correspond aux critères actuels." />
          ) : filteredItems.map((item) => (
            <article
              key={item.id}
              id={`dossier-mobile-${item.id}`}
              role="listitem"
              className={`rounded-2xl border bg-white p-4 shadow-sm ${highlightedDossierId === item.id ? "border-emerald-300 bg-emerald-50" : "border-orange-200"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => void openDetail(item.id)} className="min-h-11 text-left font-mono text-sm font-bold text-orange-700">
                  {item.reference}
                </button>
                <StatusBadge tone={DOSSIER_STATUS_TONES[item.status]}>{statusLabel(item.status)}</StatusBadge>
              </div>
              <dl className="mt-3 grid gap-3 text-sm">
                <div><dt className="font-semibold text-slate-500">Opération</dt><dd className="mt-1">{formatDossierOperationLabel(item.type, item.payload)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Client / concessionnaire</dt><dd className="mt-1 break-all font-mono text-xs">{item.lonaciClientId ?? item.concessionnaireId ?? "—"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Mise à jour</dt><dd className="mt-1">{new Date(item.updatedAt).toLocaleString("fr-FR")}</dd></div>
              </dl>
              <div className="mt-4 border-t border-slate-100 pt-4">{dossierActions(item)}</div>
            </article>
          ))}
          <Pagination page={page} pageCount={totalPages} onPageChange={setPage} label="Pagination mobile des dossiers" />
        </div>
        </div>
      ) : null}

      <Dialog
        open={decisionOpen && Boolean(decisionDossierId) && Boolean(decisionAction)}
        onOpenChange={(next) => {
          if (!next && actionBusyId !== decisionDossierId) closeDecision();
        }}
        title={decisionAction === "REJECT" ? "Rejet du dossier" : "Retour pour correction"}
        description={
          decisionAction === "REJECT"
            ? "Motif obligatoire. Le dossier repassera à l’étape Brouillon."
            : "Un motif est requis pour retourner le dossier."
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeDecision} disabled={actionBusyId === decisionDossierId}>
              Annuler
            </Button>
            <Button
              variant={decisionAction === "REJECT" ? "danger" : "primary"}
              disabled={actionBusyId === decisionDossierId || !decisionComment.trim()}
              onClick={() => void submitDecision()}
            >
              Confirmer
            </Button>
          </>
        }
      >
              <label className="grid gap-1">
                <span className="text-xs font-medium text-slate-700">Motif / commentaire</span>
                <textarea
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder="Texte libre…"
                  rows={3}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] leading-4 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400"
                />
              </label>
      </Dialog>

      <Dialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title="Détail dossier"
        description="Consultation complète et historique des transitions."
        size="lg"
      >
              {detailLoading ? <p className="text-sm text-slate-500">Chargement du détail...</p> : null}
              {!detailLoading && detailItem ? (
                <div className="space-y-3">
                  <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                    <p className="text-xs text-slate-700"><span className="font-semibold">Référence:</span> {detailItem.reference}</p>
                    <p className="text-xs text-slate-700"><span className="font-semibold">Statut:</span> {statusLabel(detailItem.status)}</p>
                    <p className="text-xs text-slate-700 sm:col-span-2">
                      <span className="font-semibold">Nature :</span>{" "}
                      {formatDossierTypeDetail(detailItem.type, detailItem.payload)}
                    </p>
                    <p className="text-xs text-slate-700">
                      <span className="font-semibold">
                        {detailItem.lonaciClientId ? "Client:" : "Concessionnaire:"}
                      </span>{" "}
                      {detailItem.lonaciClientId ?? detailItem.concessionnaireId ?? "—"}
                    </p>
                    <p className="text-xs text-slate-700"><span className="font-semibold">Créé le:</span> {new Date(detailItem.createdAt).toLocaleString("fr-FR")}</p>
                    <p className="text-xs text-slate-700"><span className="font-semibold">Mis à jour:</span> {new Date(detailItem.updatedAt).toLocaleString("fr-FR")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void openDossierRecapPdf(detailItem.id)}
                      className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                    >
                      Récap. dossier (PDF)
                    </button>
                    {detailItem.hasContratGenere || dossierHasContratGenere(detailItem.payload) ? (
                      <button
                        type="button"
                        onClick={() => void openContratOfficielPdf(detailItem.id)}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
                      >
                        {detailItem.contratArchive ? "Contrat archivé (PDF)" : "Contrat (PDF)"}
                      </button>
                    ) : (
                      <span className="self-center text-xs text-slate-500">
                        Contrat PDF après génération (décharge définitive).
                      </span>
                    )}
                  </div>
                  {detailItem.type === "CONTRAT_ACTUALISATION" &&
                  (detailItem.status === "BROUILLON" || detailItem.status === "REJETE") ? (
                    <DossierContratActualisationForm
                      dossier={detailItem}
                      meRole={meRole}
                      onUpdated={(d) => {
                        setDetailItem({
                          id: d.id,
                          reference: d.reference,
                          status: d.status as DossierStatus,
                          type: d.type,
                          concessionnaireId: d.concessionnaireId,
                          lonaciClientId: d.lonaciClientId,
                          agenceId: d.agenceId,
                          payload: d.payload,
                          history: d.history as DossierDetailItem["history"],
                          createdAt: d.createdAt,
                          updatedAt: d.updatedAt,
                          statutMetier: d.statutMetier,
                          statutMetierLabel: d.statutMetierLabel,
                          statutMetierDescription: d.statutMetierDescription,
                        });
                        notify.success("Dossier actualisé.");
                        void load();
                      }}
                    />
                  ) : null}
                  {detailItem.type === "CONTRAT_ACTUALISATION" &&
                  detailItem.status !== "BROUILLON" &&
                  detailItem.status !== "REJETE" ? (
                    <DossierDocumentChecklistBlock
                      dossierId={detailItem.id}
                      payload={detailItem.payload ?? {}}
                      editable={false}
                      canGenererContrat={userMayPatchDossierPayload(meRole)}
                      statutMetier={detailItem.statutMetier}
                      statutMetierLabel={detailItem.statutMetierLabel}
                      statutMetierDescription={detailItem.statutMetierDescription}
                      onUpdated={(patch) => {
                        setDetailItem((prev) =>
                          prev
                            ? {
                                ...prev,
                                payload: patch.payload,
                                status: (patch.status ?? prev.status) as DossierStatus,
                                updatedAt: patch.updatedAt ?? prev.updatedAt,
                                statutMetier: patch.statutMetier ?? prev.statutMetier,
                                statutMetierLabel: patch.statutMetierLabel ?? prev.statutMetierLabel,
                                statutMetierDescription:
                                  patch.statutMetierDescription ?? prev.statutMetierDescription,
                              }
                            : prev,
                        );
                        void load();
                      }}
                    />
                  ) : null}
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Historique</p>
                    {detailItem.history.length ? (
                      <ul className="space-y-1 text-xs text-slate-700">
                        {detailItem.history.map((h, idx) => (
                          <li key={`${h.actedAt}-${idx}`} className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                            <span className="font-medium">{statusLabel(h.status)}</span> - {new Date(h.actedAt).toLocaleString("fr-FR")} - {h.comment ?? "Sans commentaire"}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-500">Aucun historique.</p>
                    )}
                  </div>
                </div>
              ) : null}
      </Dialog>

      <ConfirmDialog
        open={transitionConfirmation !== null}
        onOpenChange={(next) => {
          if (!next && !actionBusyId) setTransitionConfirmation(null);
        }}
        title="Finaliser le dossier"
        message={transitionConfirmation ? confirmMessage(transitionConfirmation.action) ?? "Confirmer cette transition ?" : ""}
        confirmLabel="Finaliser"
        pending={Boolean(actionBusyId)}
        onConfirm={async () => {
          if (!transitionConfirmation) return;
          const current = transitionConfirmation;
          await transition(current.id, current.action);
          setTransitionConfirmation(null);
        }}
      />

      <ConfirmDialog
        open={replaySelectionConfirmationOpen}
        onOpenChange={(next) => {
          if (!next && !bulkReplaySelectionBusy) setReplaySelectionConfirmationOpen(false);
        }}
        title="Rejouer la sélection"
        message={`Confirmer le rejeu (${bulkReplayMode === "FAILED_ONLY" ? "échecs seuls" : "échantillon complet"}) pour ${selectedBulkLogIds.length} journal(aux) ?`}
        confirmLabel="Rejouer"
        pending={bulkReplaySelectionBusy}
        onConfirm={async () => {
          await replaySelectedBulkFailures();
          setReplaySelectionConfirmationOpen(false);
        }}
      />
      </Surface>
    </div>
  );
}
