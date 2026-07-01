"use client";

import DossierContratActualisationForm from "@/components/lonaci/dossier-contrat-actualisation-form";
import DossierCompletIndicator from "@/components/lonaci/dossier-complet-indicator";
import DossierDocumentChecklistBlock from "@/components/lonaci/dossier-document-checklist-block";
import {
  hideDossierN1N2ForChefService,
  listDossierBulkActionsForUi,
  listDossierTransitionActionsForUi,
  userMayPatchDossierPayload,
  userMayPerformDossierTransition,
  type DossierTransitionAction,
} from "@/lib/auth/dossier-transition-rbac";
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
  statutMetier?: ContratStatutMetier;
  statutMetierLabel?: string;
  statutMetierDescription?: string;
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

function statusBadgeClass(status: DossierStatus): string {
  switch (status) {
    case "BROUILLON":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "SOUMIS":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "VALIDE_N1":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "VALIDE_N2":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "FINALISE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "REJETE":
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

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
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [items, setItems] = useState<DossierItem[]>([]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);
  const referenceFilter = searchParams.get("reference")?.trim() ?? "";
  const [search, setSearch] = useState(referenceFilter);
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [highlightedDossierId, setHighlightedDossierId] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);
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
      setToast({
        type: "error",
        message,
      });
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
        setToast({ type: "error", message: msg });
        return false;
      }
    }
    const message = confirmMessage(action);
    if (message && !window.confirm(message)) {
      return;
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
      await load();
      setToast({ type: "success", message: "Transition effectuée avec succès." });
      return true;
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur de transition");
      setError(message);
      setToast({ type: "error", message });
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
      setToast({
        type: "error",
        message: friendlyErrorMessage(
          err instanceof Error ? err.message : "Erreur de chargement du détail",
        ),
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
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
      setToast({ type: "error", message: "Motif/commentaire obligatoire." });
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
    setToast({
      type: "error",
      message: "Retour automatique en mode échecs seuls: commentaire explicite manquant.",
    });
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
      setToast({ type: "error", message: "Commentaire obligatoire pour cette action en lot." });
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
      setToast({
        type: report.failed === 0 ? "success" : "error",
        message:
          report.failed === 0
            ? `${report.succeeded}/${report.total} dossier(s) mis à jour.`
            : `${report.succeeded}/${report.total} réussi(s), ${report.failed} échec(s). ${firstFailures.join(" | ")}`,
      });
      setSelectedIds([]);
      await load();
      await loadBulkLogs();
    } catch (err) {
      setToast({
        type: "error",
        message: friendlyErrorMessage(err instanceof Error ? err.message : "Erreur transition bulk"),
      });
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
      setToast({
        type: "error",
        message: "Mode échantillon complet bloqué: ajoutez un commentaire explicite de rejeu.",
      });
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
      setToast({
        type: report.failed === 0 ? "success" : "error",
        message:
          report.failed === 0
            ? `Rejeu réussi: ${report.succeeded}/${report.total}.`
            : `Rejeu partiel: ${report.succeeded}/${report.total}, ${report.failed} échec(s).`,
      });
      await load();
      await loadBulkLogs();
    } catch (err) {
      setToast({
        type: "error",
        message: friendlyErrorMessage(err instanceof Error ? err.message : "Erreur de rejeu"),
      });
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
      setToast({
        type: "error",
        message: "Mode échantillon complet bloqué: commentaire explicite requis pour les actions sensibles.",
      });
      return;
    }
    if (
      !window.confirm(
        `Confirmer le rejeu (${bulkReplayMode === "FAILED_ONLY" ? "échecs seuls" : "échantillon complet"}) pour ${selectedBulkLogIds.length} journal(aux) sélectionné(s) ?`,
      )
    ) {
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
        setToast({
          type: "error",
          message: `Rejeu terminé avec incidents: ${failedLogs} journal(aux) non rejoué(s), ${totalSucceeded}/${totalTotal} dossier(s) réussi(s).`,
        });
      } else {
        setToast({
          type: totalFailed === 0 ? "success" : "error",
          message:
            totalFailed === 0
              ? `Rejeu groupé réussi: ${totalSucceeded}/${totalTotal}.`
              : `Rejeu groupé partiel: ${totalSucceeded}/${totalTotal}, ${totalFailed} échec(s).`,
        });
      }
    } catch (err) {
      setToast({
        type: "error",
        message: friendlyErrorMessage(err instanceof Error ? err.message : "Erreur de rejeu groupé"),
      });
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-700">Infinitecore Systeme</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Gestion des contrats — dossiers</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-600">
            Checklist documents par produit, décharges provisoire et définitive, génération du contrat puis circuit
            de validation en 4 niveaux ; à la finalisation par le Chef de Service, le client devient concessionnaire actif.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Recherche ref/statut/type/client"
            className={`w-full lg:w-72 ${fieldClass}`}
          />
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
            <option value="BROUILLON">BROUILLON</option>
            <option value="SOUMIS">SOUMIS</option>
            <option value="VALIDE_N1">VALIDE_N1</option>
            <option value="VALIDE_N2">VALIDE_N2</option>
            <option value="FINALISE">FINALISE</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center rounded-xl border border-cyan-600 bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700"
          >
            Actualiser
          </button>
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
        </div>
      </div>

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
              onClick={() => void replaySelectedBulkFailures()}
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

      {loading ? <p className="text-sm text-slate-500">Chargement...</p> : null}
      {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
      {toast ? (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs opacity-80 hover:opacity-100"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
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
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
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
                    <div className="flex flex-wrap gap-2">
                      {listDossierTransitionActionsForUi(meRole, item.status).map((action) => {
                          const submitBlocked =
                            action === "SUBMIT" && dossierSubmitBlockedByChecklist(item);
                          return (
                          <button
                            key={action}
                            type="button"
                            disabled={actionBusyId === item.id || submitBlocked}
                            title={
                              submitBlocked
                                ? "Checklist documents incomplète — marquez tous les documents obligatoires comme Fourni"
                                : undefined
                            }
                            onClick={() => {
                              if (action === "REJECT" || action === "RETURN_PREVIOUS") {
                                openDecision(item.id, action);
                                return;
                              }
                              void transition(item.id, action);
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                          >
                            {actionLabel(action)}
                          </button>
                          );
                        })}
                      {listDossierTransitionActionsForUi(meRole, item.status).length === 0 ? (
                        <span className="text-xs text-slate-400">Aucune action</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void openDetail(item.id)}
                        className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-700 shadow-sm transition hover:bg-indigo-50"
                      >
                        Détail
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            `/api/contrats/${encodeURIComponent(item.id)}/export`,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                        className="rounded-lg border border-emerald-600 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 shadow-sm transition hover:bg-emerald-50"
                      >
                        PDF récap.
                      </button>
                    </div>
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
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        </div>
      ) : null}

      {decisionOpen && decisionDossierId && decisionAction ? (
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
            disabled={actionBusyId === decisionDossierId}
            onClick={closeDecision}
          />
          <div className="relative z-10 flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-3 py-1.5">
              <div>
                <h3
                  id="decision-dossier-title"
                  className="text-sm font-semibold text-slate-900"
                >
                    {decisionAction === "REJECT"
                      ? "Rejet du dossier (retour brouillon)"
                      : "Retour pour correction"}
                </h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                    {decisionAction === "REJECT"
                      ? "Motif/commentaire obligatoire. Le dossier repassera à l’étape Brouillon."
                      : "Motif/commentaire requis pour cette action."}
                </p>
              </div>
              <button
                type="button"
                disabled={actionBusyId === decisionDossierId}
                onClick={closeDecision}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
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

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={actionBusyId === decisionDossierId || !decisionComment.trim()}
                  onClick={() => void submitDecision()}
                  className="rounded-lg border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === decisionDossierId}
                  onClick={closeDecision}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {detailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="dossier-detail-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Fermer"
            onClick={() => setDetailOpen(false)}
          />
          <div className="relative z-10 flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-2">
              <div>
                <h3 id="dossier-detail-title" className="text-sm font-semibold text-slate-900">
                  Détail dossier
                </h3>
                <p className="text-xs text-slate-600">Consultation complète et historique des transitions.</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded-lg border border-slate-300 px-2 py-0.5 text-sm text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
                        setToast({ type: "success", message: "Dossier actualisé." });
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
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
