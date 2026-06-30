"use client";

import ClientSearchPicker, {
  type ClientPickerRow,
} from "@/components/lonaci/client-search-picker";
import DossierCompletIndicator from "@/components/lonaci/dossier-complet-indicator";
import SuccessionChecklistBlock from "@/components/lonaci/succession-checklist-block";
import SuccessionWorkflowStepper from "@/components/lonaci/succession-workflow-stepper";
import {
  SUCCESSION_CHECKLIST_SPEC_101,
  successionChecklistProgress,
} from "@/lib/lonaci/succession-document-checklist";
import { getLonaciRoleLabel, SUCCESSION_STEP_LABELS } from "@/lib/lonaci/constants";
import {
  SUCCESSION_STATUTS_SPEC_103,
  successionStatutMetierBadgeClass,
  type SuccessionStatutMetier,
} from "@/lib/lonaci/succession-statut-metier";
import type { DossierDocumentChecklistPayload } from "@/lib/lonaci/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

interface CaseRow {
  id: string;
  reference: string;
  concessionnaireId: string;
  status: "OUVERT" | "CLOTURE";
  decisionType: "TRANSFERT" | "RESILIATION" | null;
  autoDossierContratReference: string | null;
  currentStepLabel: string | null;
  stepsCompleted: number;
  stepsTotal: number;
  stepHistory: { step: string; completedAt: string; comment: string | null }[];
  validationN1At?: string | null;
  validationN2At?: string | null;
  checklistComplet?: boolean;
  documentChecklist?: DossierDocumentChecklistPayload | null;
  statutMetier: SuccessionStatutMetier;
  statutMetierLabel: string;
  statutMetierDescription: string;
}

interface StaleRow {
  id: string;
  reference: string;
  concessionnaireId: string;
  daysInactive: number;
  daysSinceDeclaration?: number;
  nextStep: string | null;
  thresholdDays?: number;
}

interface CaseDetailResponse {
  case: {
    id: string;
    reference: string;
    status: "OUVERT" | "CLOTURE";
    concessionnaire: { id: string; codePdv: string; nomComplet: string; raisonSociale: string; statut: string };
    dateDeces: string | null;
    acteDeces: {
      filename: string;
      mimeType: string;
      size: number;
      uploadedAt: string;
      uploadedByUser: { prenom: string; nom: string; role: string } | null;
    } | null;
    ayantDroit: { nom: string | null; lienParente: string | null; telephone: string | null; email: string | null };
    documents: Array<{
      id: string;
      filename: string;
      mimeType: string;
      size: number;
      uploadedAt: string;
      uploadedByUser: { prenom: string; nom: string; role: string } | null;
    }>;
    stepHistory: Array<{
      step: string;
      completedAt: string;
      comment: string | null;
      completedByUser: { prenom: string; nom: string; role: string } | null;
    }>;
    decision: {
      type: "TRANSFERT" | "RESILIATION";
      decidedAt: string;
      comment: string | null;
      decidedByUser: { prenom: string; nom: string; role: string } | null;
    } | null;
    validationN1At: string | null;
    validationN1ByUser: { prenom: string; nom: string; role: string } | null;
    validationN2At: string | null;
    validationN2ByUser: { prenom: string; nom: string; role: string } | null;
    documentChecklist: DossierDocumentChecklistPayload | null;
    checklistComplet: boolean;
    statutMetier: SuccessionStatutMetier;
    statutMetierLabel: string;
    statutMetierDescription: string;
  };
}

function friendlySuccessionError(raw: string): string {
  switch (raw) {
    case "CASE_NOT_FOUND":
      return "Dossier de succession introuvable (ID invalide ou dossier supprimé).";
    case "CONCESSIONNAIRE_NOT_FOUND":
      return "Le client lié au dossier n’a pas été trouvé.";
    case "AGENCE_FORBIDDEN":
      return "Accès refusé : vous n’avez pas les droits sur ce dossier.";
    case "ACTE_DECES_REQUIRED":
      return "Acte de décès obligatoire pour ouvrir le dossier.";
    case "SUCCESSION_VALIDATION_N1_N2_REQUIRED":
      return "Validations N1 et N2 obligatoires avant la vérification juridique OHADA (étape 20).";
    case "VERIFICATION_JURIDIQUE_CHEF_SERVICE_ONLY":
      return "Seul le chef de service peut valider l’étape 20 (vérification juridique OHADA).";
    case "DECISION_CHEF_SERVICE_ONLY":
      return "Seul le chef de service peut enregistrer la décision finale (étape 21).";
    case "SUCCESSION_STEP_ORDER":
      return "La validation N1 n’est possible qu’après l’identification de l’ayant droit (étape 18).";
    case "SUCCESSION_VALIDATION_N1_REQUIRED":
      return "La validation N1 (chef de section) est obligatoire avant la validation N2.";
    case "SUCCESSION_VALIDATION_ALREADY_DONE":
      return "Cette validation a déjà été enregistrée.";
    case "SUCCESSION_CHECKLIST_INCOMPLETE":
      return "Checklist §10.1 incomplète : marquez toutes les pièces obligatoires comme fournies.";
    default:
      return raw;
  }
}

export default function SuccessionPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [items, setItems] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [stale, setStale] = useState<StaleRow[]>([]);

  const [clientId, setClientId] = useState("");
  const [createFormClient, setCreateFormClient] = useState<ClientPickerRow | null>(null);
  const [manualClientIdOpen, setManualClientIdOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [dateDeces, setDateDeces] = useState("");
  const [declComment, setDeclComment] = useState("");
  const [acteDecesFile, setActeDecesFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const [advComment, setAdvComment] = useState("");
  const [ayantNom, setAyantNom] = useState("");
  const [ayantLien, setAyantLien] = useState("");
  const [ayantTel, setAyantTel] = useState("");
  const [ayantEmail, setAyantEmail] = useState("");
  const [decisionType, setDecisionType] = useState<"" | "TRANSFERT" | "RESILIATION">("");
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [docCaseId, setDocCaseId] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [detail, setDetail] = useState<CaseDetailResponse["case"] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailChecklistLive, setDetailChecklistLive] = useState<{
    complet: boolean;
    obligatoiresFournis: number;
    obligatoiresTotal: number;
  } | null>(null);
  const [fStatus, setFStatus] = useState<"" | "OUVERT" | "CLOTURE">("");
  const [fStatutMetier, setFStatutMetier] = useState<"" | SuccessionStatutMetier>("");
  const [fFilterClient, setFFilterClient] = useState<ClientPickerRow | null>(null);
  const [fDecisionType, setFDecisionType] = useState<"" | "TRANSFERT" | "RESILIATION">("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");
  const [meRole, setMeRole] = useState<string | null>(null);
  const [validationBusy, setValidationBusy] = useState<"N1" | "N2" | null>(null);

  const handleAuthFailure = useCallback(
    (status: number, rawMessage?: string): boolean => {
      if (status !== 401) return false;
      setToast({
        type: "error",
        message:
          rawMessage ||
          "Session expirée ou invalide. Vous allez être redirigé vers la page de connexion.",
      });
      router.replace("/login");
      router.refresh();
      return true;
    },
    [router],
  );

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
      if (fStatus) params.set("status", fStatus);
      if (fStatutMetier) params.set("statutMetier", fStatutMetier);
      if (fFilterClient?.id) params.set("lonaciClientId", fFilterClient.id);
      if (fDecisionType) params.set("decisionType", fDecisionType);
      if (fDateFrom) params.set("dateFrom", new Date(fDateFrom).toISOString());
      if (fDateTo) params.set("dateTo", new Date(fDateTo).toISOString());
      const [listRes, staleRes] = await Promise.all([
        fetch(`/api/succession-cases?${params.toString()}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/succession-cases/alerts/stale", { credentials: "include", cache: "no-store" }),
      ]);
      if (!listRes.ok) {
        const b = (await listRes.json().catch(() => null)) as { message?: string } | null;
        if (handleAuthFailure(listRes.status, b?.message)) return;
        throw new Error(b?.message ?? `Liste succession inaccessible (HTTP ${listRes.status}).`);
      }
      const listData = (await listRes.json()) as { items: CaseRow[]; total: number; page: number };
      setItems(listData.items);
      setTotal(listData.total);
      setPage(listData.page);
      if (staleRes.ok) {
        const s = (await staleRes.json()) as { items: StaleRow[] };
        setStale(s.items);
      } else {
        setStale([]);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Erreur";
      const message = friendlySuccessionError(raw);
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }

  const loadDetail = useCallback(
    async (caseId: string) => {
      if (!caseId) {
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/succession-cases/${encodeURIComponent(caseId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { message?: string } | null;
          if (handleAuthFailure(res.status, b?.message)) return;
          const raw = b?.message ?? `Fiche dossier inaccessible (HTTP ${res.status})`;
          throw new Error(friendlySuccessionError(raw));
        }
        const payload = (await res.json()) as CaseDetailResponse;
        setDetail(payload.case);
        if (payload.case.documentChecklist?.entries.length) {
          setDetailChecklistLive(successionChecklistProgress(payload.case.documentChecklist));
        } else {
          setDetailChecklistLive(null);
        }
      } catch (e) {
        setDetail(null);
        const message = friendlySuccessionError(e instanceof Error ? e.message : "Erreur");
        setToast({ type: "error", message });
      } finally {
        setDetailLoading(false);
      }
    },
    [handleAuthFailure],
  );

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fStatus, fStatutMetier, fFilterClient?.id, fDecisionType, fDateFrom, fDateTo]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!res.ok) {
          setMeRole(null);
          return;
        }
        const me = (await res.json()) as { user?: { role?: string } };
        setMeRole(me.user?.role ?? null);
      } catch {
        setMeRole(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedCaseId) {
      void loadDetail(selectedCaseId);
    } else {
      setDetail(null);
    }
  }, [selectedCaseId, loadDetail]);

  const clientFromUrl = searchParams.get("lonaciClientId")?.trim() ?? searchParams.get("clientId")?.trim() ?? "";
  const concFromUrl = searchParams.get("concessionnaireId")?.trim() ?? "";
  const statusFromUrl = searchParams.get("status")?.trim() ?? "";
  const staleOnlyFromUrl = searchParams.get("staleOnly")?.trim() ?? "";
  const staleOnlyActive = staleOnlyFromUrl === "1";
  useEffect(() => {
    if (clientFromUrl && /^[a-f\d]{24}$/i.test(clientFromUrl)) {
      setClientId(clientFromUrl);
      setManualClientIdOpen(false);
      let cancelled = false;
      void (async () => {
        try {
          const res = await fetch(`/api/clients/${encodeURIComponent(clientFromUrl)}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok || cancelled) return;
          const raw = (await res.json()) as { client?: Record<string, unknown> };
          const c = raw.client;
          if (!c || cancelled) return;
          const id = String(c.id ?? "").trim();
          if (!id) return;
          setCreateFormClient({
            id,
            code: String(c.code ?? ""),
            nomComplet: (c.nomComplet as string | null | undefined) ?? null,
            raisonSociale: (c.raisonSociale as string | null | undefined) ?? null,
            agenceId: (c.agenceId as string | null | undefined) ?? null,
            produitsAutorises: Array.isArray(c.produitsAutorises) ? (c.produitsAutorises as string[]) : undefined,
          });
        } catch {
          if (!cancelled) setCreateFormClient(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (concFromUrl && /^[a-f\d]{24}$/i.test(concFromUrl)) {
      setClientId(concFromUrl);
      setCreateFormClient(null);
      setManualClientIdOpen(true);
    }
  }, [clientFromUrl, concFromUrl]);

  useEffect(() => {
    if (statusFromUrl === "OUVERT" || statusFromUrl === "CLOTURE") {
      setFStatus(statusFromUrl);
    }
    if (staleOnlyFromUrl === "1") {
      setFStatus("OUVERT");
    }
  }, [staleOnlyFromUrl, statusFromUrl]);

  const visibleItems = staleOnlyActive
    ? items.filter((row) => stale.some((s) => s.id === row.id))
    : items;
  const staleIds = new Set(stale.map((s) => s.id));
  const staleThresholdDays = stale[0]?.thresholdDays ?? 30;

  function rowChecklistProgress(row: CaseRow) {
    if (selectedCaseId === row.id && detailChecklistLive) return detailChecklistLive;
    if (row.documentChecklist?.entries.length) return successionChecklistProgress(row.documentChecklist);
    return {
      complet: row.checklistComplet ?? false,
      obligatoiresFournis: 0,
      obligatoiresTotal: 0,
    };
  }

  const selectedRow = visibleItems.find((r) => r.id === selectedCaseId) ?? null;
  const selectedRowProgress = selectedRow ? rowChecklistProgress(selectedRow) : null;

  function advanceBlockReason(row: CaseRow): string | undefined {
    const progress = rowChecklistProgress(row);
    const step = row.currentStepLabel;
    if (step === "DECISION") {
      if (meRole !== "CHEF_SERVICE") {
        return "Seul le chef de service peut enregistrer la décision finale (étape 21).";
      }
      if (!decisionType) {
        return "Choisissez Transfert ou Résiliation dans le bloc « Avancer une étape ».";
      }
      return undefined;
    }
    if (step === "VERIFICATION_JURIDIQUE") {
      if (!progress.complet) {
        return "Checklist §10.1 incomplète : toutes les pièces obligatoires doivent être « Fourni ».";
      }
      if (!row.validationN1At || !row.validationN2At) {
        return "Validations N1 et N2 requises avant la vérification juridique OHADA (étape 20).";
      }
      if (meRole !== "CHEF_SERVICE") {
        return "Seul le chef de service peut valider la vérification juridique OHADA (étape 20).";
      }
      return undefined;
    }
    if (step === "PIECES_JUSTIFICATIVES") {
      if (!progress.complet) {
        return "Complétez la checklist §10.1 (étape 19) avant la vérification juridique OHADA.";
      }
      if (!row.validationN1At || !row.validationN2At) {
        return "Enregistrez les validations N1 (chef de section) et N2 (assistant CDS).";
      }
    }
    return undefined;
  }

  function resetSuccessionCreateForm() {
    setCreateFormClient(null);
    setClientId("");
    setManualClientIdOpen(false);
    setDateDeces("");
    setDeclComment("");
    setActeDecesFile(null);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!clientId.trim()) {
      setToast({ type: "error", message: "Sélectionnez un client dans la liste ou saisissez son ID." });
      return;
    }
    setCreating(true);
    try {
      if (!acteDecesFile) {
        throw new Error("ACTE_DECES_REQUIRED");
      }
      const form = new FormData();
      if (createFormClient?.id) {
        form.set("lonaciClientId", clientId.trim());
      } else {
        form.set("concessionnaireId", clientId.trim());
      }
      form.set("comment", declComment.trim() || "");
      form.set("dateDeces", dateDeces ? new Date(dateDeces).toISOString() : "");
      form.set("acteDeces", acteDecesFile);
      const res = await fetch("/api/succession-cases", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        if (handleAuthFailure(res.status, b?.message)) return;
        const raw = b?.message ?? `Création impossible (HTTP ${res.status})`;
        throw new Error(friendlySuccessionError(raw));
      }
      resetSuccessionCreateForm();
      setCreateOpen(false);
      await load();
      setToast({ type: "success", message: "Dossier de succession ouvert. Étape 1 enregistrée." });
    } catch (e) {
      const message = friendlySuccessionError(e instanceof Error ? e.message : "Erreur");
      setToast({ type: "error", message });
    } finally {
      setCreating(false);
    }
  }

  async function postSuccessionValidation(caseId: string, level: "N1" | "N2") {
    setValidationBusy(level);
    try {
      const path =
        level === "N1"
          ? `/api/succession-cases/${encodeURIComponent(caseId)}/validation-n1`
          : `/api/succession-cases/${encodeURIComponent(caseId)}/validation-n2`;
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        if (handleAuthFailure(res.status, b?.message)) return;
        throw new Error(friendlySuccessionError(b?.message ?? "Erreur"));
      }
      await load();
      if (selectedCaseId === caseId) await loadDetail(caseId);
      setToast({ type: "success", message: level === "N1" ? "Validation N1 enregistrée." : "Validation N2 enregistrée." });
    } catch (e) {
      setToast({
        type: "error",
        message: friendlySuccessionError(e instanceof Error ? e.message : "Erreur"),
      });
    } finally {
      setValidationBusy(null);
    }
  }

  async function advance(caseId: string, nextStep: string | null) {
    const isDecision = nextStep === "DECISION";
    const ok = window.confirm(
      isDecision
        ? "Confirmer la décision finale ? Cette action clôture le dossier."
        : "Valider l’étape suivante du parcours succession ?",
    );
    if (!ok) return;

    setAdvancingId(caseId);
    try {
      const body: Record<string, unknown> = {
        comment: advComment.trim() || null,
      };
      if (nextStep === "IDENTIFICATION_AYANT_DROIT") {
        body.ayantDroitNom = ayantNom.trim();
        body.ayantDroitLienParente = ayantLien.trim() || undefined;
        body.ayantDroitTelephone = ayantTel.trim() || undefined;
        body.ayantDroitEmail = ayantEmail.trim() || undefined;
      }
      if (nextStep === "DECISION") {
        body.decisionType = decisionType || undefined;
      }
      const res = await fetch(`/api/succession-cases/${encodeURIComponent(caseId)}/advance`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        if (handleAuthFailure(res.status, b?.message)) return;
        const raw = b?.message ?? `Avancement impossible (HTTP ${res.status})`;
        throw new Error(friendlySuccessionError(raw));
      }
      setAdvComment("");
      setAyantNom("");
      setAyantLien("");
      setAyantTel("");
      setAyantEmail("");
      setDecisionType("");
      await load();
      if (selectedCaseId && selectedCaseId === caseId) {
        await loadDetail(caseId);
      }
      setToast({ type: "success", message: "Étape enregistrée. Le dossier a été mis à jour." });
    } catch (e) {
      const message = friendlySuccessionError(e instanceof Error ? e.message : "Erreur");
      setToast({ type: "error", message });
    } finally {
      setAdvancingId(null);
    }
  }

  async function uploadDocument(e: FormEvent) {
    e.preventDefault();
    if (!docCaseId || !docFile) {
      setToast({ type: "error", message: "Sélectionner un dossier et un document." });
      return;
    }

    setUploadingDoc(true);
    try {
      const form = new FormData();
      form.set("file", docFile);
      const res = await fetch(`/api/succession-cases/${encodeURIComponent(docCaseId)}/documents`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        if (handleAuthFailure(res.status, b?.message)) return;
        const raw = b?.message ?? `Upload impossible (HTTP ${res.status})`;
        throw new Error(friendlySuccessionError(raw));
      }
      setDocFile(null);
      await load();
      if (selectedCaseId && selectedCaseId === docCaseId) {
        await loadDetail(selectedCaseId);
      }
      setToast({ type: "success", message: `Document ajouté : ${docFile.name}` });
    } catch (e) {
      const message = friendlySuccessionError(e instanceof Error ? e.message : "Erreur");
      setToast({ type: "error", message });
    } finally {
      setUploadingDoc(false);
    }
  }

  const cardClass =
    "rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80";
  const fieldClass =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200";
  const subtleFieldClass =
    "rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-linear-to-br from-slate-50 via-white to-indigo-50/40 p-6 shadow-sm">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-teal-200/20 blur-3xl" />

      <div className="relative mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-700">Infinitecore Systeme</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Décès et ayants droit</h2>
          <p className="mt-1 text-sm text-slate-600">
            Workflow §10.2 (étapes 17 à 21) — checklist §10.1 à l&apos;étape 19, conformité OHADA à l&apos;étape 20.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center rounded-xl border border-cyan-600 bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700"
          >
            Ouvrir dossier succession
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Actualiser
          </button>
        </div>
      </div>
      <div className={`${cardClass} mb-5`}>
        <h3 className="text-sm font-semibold text-violet-900">10.1 — Checklist de documents à fournir</h3>
        <ul className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
          {SUCCESSION_CHECKLIST_SPEC_101.map((row) => (
            <li key={row.itemId} className="rounded-lg border border-violet-100 bg-violet-50/50 px-2 py-1">
              {row.libelle}
              {row.obligatoire ? <span className="text-rose-600"> *</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-slate-600">
          Indicateur <span className="font-semibold">DOSSIER COMPLET / INCOMPLET</span> mis à jour en temps réel
          à l&apos;étape 19 (vérification documentaire).
        </p>
      </div>

      <div className={`${cardClass} mb-5`}>
        <h3 className="text-sm font-semibold text-slate-900">10.2 — Workflow en 5 étapes</h3>
        {selectedRow ? (
          <SuccessionWorkflowStepper
            className="mt-3"
            stepsCompleted={selectedRow.stepsCompleted}
            currentStepLabel={selectedRow.currentStepLabel}
            status={selectedRow.status}
          />
        ) : (
          <p className="mt-2 text-xs text-slate-600">
            Sélectionnez un dossier dans la liste ou la fiche détaillée pour afficher la progression (17 → 21).
          </p>
        )}
      </div>

      <div className={`${cardClass} mb-5`}>
        <h3 className="text-sm font-semibold text-indigo-900">10.3 — Statuts</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs text-slate-700">
            <thead>
              <tr className="border-b border-indigo-100 text-indigo-900">
                <th className="py-1.5 pr-3 font-semibold">Statut</th>
                <th className="py-1.5 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody>
              {SUCCESSION_STATUTS_SPEC_103.map((row) => (
                <tr key={row.statut} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${successionStatutMetierBadgeClass(row.statut)}`}
                    >
                      {row.libelle}
                    </span>
                  </td>
                  <td className="py-1.5">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${cardClass} relative mb-5 grid gap-2 md:grid-cols-6`}>
        <select
          aria-label="Filtrer par statut métier §10.3"
          value={fStatutMetier}
          onChange={(e) => setFStatutMetier(e.target.value as "" | SuccessionStatutMetier)}
          className={subtleFieldClass}
        >
          <option value="">Tous statuts §10.3</option>
          {SUCCESSION_STATUTS_SPEC_103.map((row) => (
            <option key={row.statut} value={row.statut}>
              {row.libelle}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrer par statut technique"
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value as "" | "OUVERT" | "CLOTURE")}
          className={subtleFieldClass}
        >
          <option value="">Tous (ouvert / clos)</option>
          <option value="OUVERT">OUVERT</option>
          <option value="CLOTURE">CLOTURE</option>
        </select>
        <div className="min-w-0">
          <ClientSearchPicker
            label={<span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Client (filtre)</span>}
            selected={fFilterClient}
            onSelectedChange={setFFilterClient}
            filter="linkedPdv"
            inputClassName={subtleFieldClass}
            showClearLink
            searchPlaceholder="Filtrer par client…"
          />
        </div>
        <select
          aria-label="Filtrer par type de décision"
          value={fDecisionType}
          onChange={(e) => setFDecisionType(e.target.value as "" | "TRANSFERT" | "RESILIATION")}
          className={subtleFieldClass}
        >
          <option value="">Toutes décisions</option>
          <option value="TRANSFERT">TRANSFERT</option>
          <option value="RESILIATION">RESILIATION</option>
        </select>
        <input
          aria-label="Filtrer par date de début"
          type="date"
          value={fDateFrom}
          onChange={(e) => setFDateFrom(e.target.value)}
          className={subtleFieldClass}
        />
        <input
          aria-label="Filtrer par date de fin"
          type="date"
          value={fDateTo}
          onChange={(e) => setFDateTo(e.target.value)}
          className={subtleFieldClass}
        />
        <div className="flex gap-2">
          <a
            href={`/api/succession-cases/export?format=csv&${new URLSearchParams({
              ...(fStatus ? { status: fStatus } : {}),
              ...(fFilterClient?.id ? { lonaciClientId: fFilterClient.id } : {}),
              ...(fDecisionType ? { decisionType: fDecisionType } : {}),
              ...(fDateFrom ? { dateFrom: new Date(fDateFrom).toISOString() } : {}),
              ...(fDateTo ? { dateTo: new Date(fDateTo).toISOString() } : {}),
            }).toString()}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-emerald-600 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
          >
            Export CSV
          </a>
          <a
            href={`/api/succession-cases/export?format=pdf&${new URLSearchParams({
              ...(fStatus ? { status: fStatus } : {}),
              ...(fFilterClient?.id ? { lonaciClientId: fFilterClient.id } : {}),
              ...(fDecisionType ? { decisionType: fDecisionType } : {}),
              ...(fDateFrom ? { dateFrom: new Date(fDateFrom).toISOString() } : {}),
              ...(fDateTo ? { dateTo: new Date(fDateTo).toISOString() } : {}),
            }).toString()}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Export PDF
          </a>
        </div>
      </div>

      {stale.length ? (
        <div
          className="mb-5 rounded-2xl border border-amber-200 bg-linear-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
          role="alert"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold">
              Alerte automatique — aucune action depuis {staleThresholdDays} j. après déclaration ({stale.length})
            </p>
            <Link
              href="/succession?status=OUVERT&staleOnly=1"
              className="rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-50"
            >
              Voir tous
            </Link>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Notification in-app envoyée aux chefs de section, assistants CDS et chefs de service (cron journalier).
          </p>
          <ul className="mt-2 list-inside list-disc text-xs text-amber-800">
            {stale.slice(0, 8).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="text-left underline hover:text-amber-950"
                  onClick={() => setSelectedCaseId(s.id)}
                >
                  {s.reference}
                </button>{" "}
                — inactif {s.daysInactive} j.
                {s.daysSinceDeclaration != null ? ` · déclaré il y a ${s.daysSinceDeclaration} j.` : ""} — prochaine :{" "}
                {s.nextStep ? (SUCCESSION_STEP_LABELS[s.nextStep as keyof typeof SUCCESSION_STEP_LABELS] ?? s.nextStep) : "—"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-succession-title">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60"
            aria-label="Fermer"
            onClick={() => {
              if (creating) return;
              resetSuccessionCreateForm();
              setCreateOpen(false);
            }}
            disabled={creating}
          />
          <div className="relative z-10 flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-linear-to-r from-cyan-50 via-white to-indigo-50 px-4 py-2">
              <div>
                <h3 id="create-succession-title" className="text-sm font-semibold text-slate-900">
                  Ouvrir un dossier décès & succession
                </h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                  Client Lonaci, date du décès, acte scanné et commentaire initial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (creating) return;
                  resetSuccessionCreateForm();
                  setCreateOpen(false);
                }}
                disabled={creating}
                className="rounded-lg border border-slate-300 px-2 py-0.5 text-sm text-slate-600"
              >
                ×
              </button>
            </div>
            <form id="create-succession-form" onSubmit={onCreate} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="grid gap-3">
                <section className="grid gap-2 rounded-xl border border-cyan-200/70 bg-cyan-50/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Informations dossier</p>
                  <ClientSearchPicker
                    key={`succession-create-${createOpen}`}
                    label={<span className="text-xs font-medium text-slate-700">Client Lonaci *</span>}
                    selected={createFormClient}
                    onSelectedChange={(v) => {
                      setCreateFormClient(v);
                      setClientId(v?.id ?? "");
                      if (v) setManualClientIdOpen(false);
                    }}
                    filter="linkedPdv"
                    inputClassName={fieldClass}
                    searchPlaceholder="Rechercher un client (nom, code, CNI…)"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setManualClientIdOpen((v) => !v);
                      setCreateFormClient(null);
                    }}
                    className="w-fit text-[11px] font-medium text-cyan-700 underline underline-offset-2 opacity-90 hover:opacity-100"
                  >
                    {manualClientIdOpen ? "Masquer la saisie manuelle" : "Saisie manuelle (coller un ID)"}
                  </button>
                  {manualClientIdOpen ? (
                    <input
                      value={clientId}
                      onChange={(e) => {
                        setClientId(e.target.value);
                        setCreateFormClient(null);
                      }}
                      placeholder="Coller l’ID client Lonaci"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                      aria-label="ID client Lonaci (saisie libre)"
                    />
                  ) : null}
                </section>

                <section className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Date du décès *</span>
                    <input
                      type="datetime-local"
                      required
                      value={dateDeces}
                      onChange={(e) => setDateDeces(e.target.value)}
                      className={fieldClass}
                      aria-label="Date du décès"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Acte de décès scanné *</span>
                    <input
                      type="file"
                      required
                      accept=".pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => setActeDecesFile(e.target.files?.[0] ?? null)}
                      className={fieldClass}
                      aria-label="Acte de décès scanné"
                    />
                  </label>
                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">Commentaire de déclaration</span>
                    <input
                      value={declComment}
                      onChange={(e) => setDeclComment(e.target.value)}
                      placeholder="Commentaire déclaration"
                      className={fieldClass}
                      aria-label="Commentaire"
                    />
                  </label>
                </section>
              </div>
            </form>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  resetSuccessionCreateForm();
                  setCreateOpen(false);
                }}
                disabled={creating}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="create-succession-form"
                disabled={creating}
                className="rounded-lg border border-cyan-600 bg-cyan-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700 disabled:opacity-60"
              >
                {creating ? "Création..." : "Ouvrir dossier succession (étape 1)"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`${cardClass} mb-5`}>
        <h3 className="text-sm font-semibold text-slate-900">Avancer une étape (§10.2)</h3>
        <p className="mt-1 text-xs text-slate-600">
          Étape 18 : renseignez l&apos;ayant droit. Étape 19 : checklist §10.1 + validations N1/N2. Étape 20 :
          chef de service (OHADA). Étape 21 : décision transfert ou résiliation (chef de service).
        </p>
        {selectedRow && selectedRow.status === "OUVERT" && selectedRowProgress ? (
          <div className="mt-3">
            <DossierCompletIndicator
              complet={selectedRowProgress.complet}
              size="banner"
              live={selectedCaseId === selectedRow.id}
              obligatoiresFournis={selectedRowProgress.obligatoiresFournis}
              obligatoiresTotal={selectedRowProgress.obligatoiresTotal}
            />
            {selectedRow.currentStepLabel === "PIECES_JUSTIFICATIVES" && !selectedRowProgress.complet ? (
              <p className="mt-2 text-[11px] font-medium text-amber-800">
                Complétez la checklist §10.1 (étape 19) avant la vérification juridique OHADA.
              </p>
            ) : null}
            {selectedRow.currentStepLabel === "PIECES_JUSTIFICATIVES" &&
            selectedRowProgress.complet &&
            (!selectedRow.validationN1At || !selectedRow.validationN2At) ? (
              <p className="mt-2 text-[11px] font-medium text-amber-800">
                Enregistrez les validations N1 et N2 dans la fiche détaillée (étape 19).
              </p>
            ) : null}
          </div>
        ) : null}
        <textarea
          value={advComment}
          onChange={(e) => setAdvComment(e.target.value)}
          placeholder="Commentaire (optionnel)"
          rows={2}
          className={`mt-2 ${fieldClass}`}
          aria-label="Commentaire avancement"
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <input
            value={ayantNom}
            onChange={(e) => setAyantNom(e.target.value)}
            placeholder="Ayant droit — nom"
            className={fieldClass}
            aria-label="Nom ayant droit"
          />
          <input
            value={ayantLien}
            onChange={(e) => setAyantLien(e.target.value)}
            placeholder="Lien de parenté"
            className={fieldClass}
            aria-label="Lien de parenté"
          />
          <input
            value={ayantTel}
            onChange={(e) => setAyantTel(e.target.value)}
            placeholder="Téléphone"
            className={fieldClass}
            aria-label="Téléphone ayant droit"
          />
          <input
            value={ayantEmail}
            onChange={(e) => setAyantEmail(e.target.value)}
            placeholder="Email"
            className={fieldClass}
            aria-label="Email ayant droit"
          />
        </div>
        <div className="mt-2">
          <select
            value={decisionType}
            onChange={(e) => setDecisionType(e.target.value as "" | "TRANSFERT" | "RESILIATION")}
            className={fieldClass}
            aria-label="Decision finale succession"
          >
            <option value="">Décision finale (étape 5 uniquement) : sélectionner</option>
            <option value="TRANSFERT">Transfert</option>
            <option value="RESILIATION">Résiliation</option>
          </select>
        </div>
      </div>

      <form onSubmit={uploadDocument} className={`${cardClass} mb-5`}>
        <h3 className="text-sm font-semibold text-slate-900">19. Vérification documentaire — pièces complémentaires</h3>
        <p className="mt-1 text-xs text-slate-600">
          Complétez la checklist §10.1 dans la fiche détaillée, enregistrez N1/N2, puis joignez les scans ci-dessous.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <select
            required
            value={docCaseId}
            onChange={(e) => setDocCaseId(e.target.value)}
            className={fieldClass}
            aria-label="Dossier succession"
          >
            <option value="">— Dossier —</option>
            {items
              .filter((x) => x.status === "OUVERT")
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.reference}
                </option>
              ))}
          </select>
          <input
            required
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
            className={fieldClass}
            aria-label="Document de succession"
          />
          <button
            type="submit"
            disabled={uploadingDoc}
            className="rounded-xl border border-cyan-600 bg-cyan-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-60"
          >
            {uploadingDoc ? "Upload..." : "Ajouter document"}
          </button>
        </div>
      </form>

      <div className={`${cardClass} mb-5`}>
        <h3 className="text-sm font-semibold text-slate-900">Fiche détaillée par dossier</h3>
        <p className="mt-1 text-xs text-slate-600">Workflow §10.2, checklist, validations N1/N2 et documents.</p>
        <div className="mt-2">
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className={fieldClass}
            aria-label="Dossier succession détail"
          >
            <option value="">— Sélectionner un dossier —</option>
            {visibleItems.map((x) => (
              <option key={x.id} value={x.id}>
                {x.reference} · {x.status}
              </option>
            ))}
          </select>
        </div>
        {detailLoading ? <p className="mt-3 text-xs text-slate-500">Chargement de la fiche...</p> : null}
        {detail ? (
          <div className="mt-3 space-y-3 text-xs text-slate-800">
            <SuccessionWorkflowStepper
              stepsCompleted={detail.stepHistory.length}
              currentStepLabel={
                detail.status === "CLOTURE"
                  ? null
                  : (items.find((r) => r.id === detail.id)?.currentStepLabel ?? null)
              }
              status={detail.status}
            />
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="font-semibold">
                {detail.reference} — {detail.concessionnaire.codePdv} · {detail.concessionnaire.nomComplet}
              </p>
              <p className="mt-2">
                <span
                  title={detail.statutMetierDescription}
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${successionStatutMetierBadgeClass(detail.statutMetier)}`}
                >
                  {detail.statutMetierLabel}
                </span>
              </p>
              <p className="mt-1 text-slate-600">
                {detail.statutMetierDescription}
              </p>
              <p className="mt-1 text-slate-600">
                Statut technique: {detail.status} · Concessionnaire: {detail.concessionnaire.statut} · Décès:{" "}
                {detail.dateDeces ? new Date(detail.dateDeces).toLocaleString("fr-FR") : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="font-semibold">Timeline des étapes</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {detail.stepHistory.map((s, idx) => (
                  <li key={`${s.step}-${idx}`}>
                    {(SUCCESSION_STEP_LABELS[s.step as keyof typeof SUCCESSION_STEP_LABELS] ?? s.step) + " — "}
                    {new Date(s.completedAt).toLocaleString("fr-FR")} ·{" "}
                    {s.completedByUser
                      ? `${s.completedByUser.prenom} ${s.completedByUser.nom} (${getLonaciRoleLabel(s.completedByUser.role)})`
                      : "Utilisateur inconnu"}
                    {s.comment ? ` · ${s.comment}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="font-semibold">Ayant droit</p>
              <p className="text-slate-700">
                {detail.ayantDroit.nom ?? "—"} · {detail.ayantDroit.lienParente ?? "—"} · {detail.ayantDroit.telephone ?? "—"} ·{" "}
                {detail.ayantDroit.email ?? "—"}
              </p>
            </div>
            {detail.documentChecklist ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <DossierCompletIndicator
                    complet={detailChecklistLive?.complet ?? detail.documentChecklist.complet}
                    size="banner"
                    live={detail.status === "OUVERT"}
                    obligatoiresFournis={detailChecklistLive?.obligatoiresFournis}
                    obligatoiresTotal={detailChecklistLive?.obligatoiresTotal}
                  />
                </div>
                <SuccessionChecklistBlock
                  caseId={detail.id}
                  checklist={detail.documentChecklist}
                  editable={detail.status === "OUVERT"}
                  acteDecesPresent={Boolean(detail.acteDeces)}
                  onUpdated={(checklist) => {
                    setDetail((prev) =>
                      prev ? { ...prev, documentChecklist: checklist, checklistComplet: checklist.complet } : prev,
                    );
                    setDetailChecklistLive(successionChecklistProgress(checklist));
                    setItems((prev) =>
                      prev.map((r) =>
                        r.id === detail.id
                          ? { ...r, checklistComplet: checklist.complet, documentChecklist: checklist }
                          : r,
                      ),
                    );
                  }}
                  onProgressChange={setDetailChecklistLive}
                />
              </>
            ) : null}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="font-semibold">Documents joints (compléments)</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {detail.acteDeces ? (
                  <li>
                    <a
                      href={`/api/succession-cases/${encodeURIComponent(detail.id)}/acte-deces`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-emerald-700"
                    >
                      Acte de décès: {detail.acteDeces.filename}
                    </a>{" "}
                    — {new Date(detail.acteDeces.uploadedAt).toLocaleString("fr-FR")}
                  </li>
                ) : null}
                {detail.documents.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`/api/succession-cases/${encodeURIComponent(detail.id)}/documents/${encodeURIComponent(d.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-emerald-700"
                    >
                      {d.filename}
                    </a>{" "}
                    — {new Date(d.uploadedAt).toLocaleString("fr-FR")}
                  </li>
                ))}
                {!detail.documents.length && !detail.acteDeces ? <li>Aucun document</li> : null}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="font-semibold">Étape 19 — Validations N1 / N2 (vérification documentaire)</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-slate-700">
                <li>
                  N1 (chef de section) :{" "}
                  {detail.validationN1At
                    ? `${new Date(detail.validationN1At).toLocaleString("fr-FR")}${
                        detail.validationN1ByUser
                          ? ` · ${detail.validationN1ByUser.prenom} ${detail.validationN1ByUser.nom} (${getLonaciRoleLabel(detail.validationN1ByUser.role)})`
                          : ""
                      }`
                    : "en attente"}
                </li>
                <li>
                  N2 (assistant CDS) :{" "}
                  {detail.validationN2At
                    ? `${new Date(detail.validationN2At).toLocaleString("fr-FR")}${
                        detail.validationN2ByUser
                          ? ` · ${detail.validationN2ByUser.prenom} ${detail.validationN2ByUser.nom} (${getLonaciRoleLabel(detail.validationN2ByUser.role)})`
                          : ""
                      }`
                    : "en attente"}
                </li>
              </ul>
              {detail.status === "OUVERT" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {!detail.validationN1At && meRole === "CHEF_SECTION" ? (
                    <button
                      type="button"
                      disabled={validationBusy !== null}
                      onClick={() => void postSuccessionValidation(detail.id, "N1")}
                      className="rounded-lg border border-sky-600 bg-sky-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {validationBusy === "N1" ? "…" : "Enregistrer validation N1"}
                    </button>
                  ) : null}
                  {detail.validationN1At && !detail.validationN2At && meRole === "ASSIST_CDS" ? (
                    <button
                      type="button"
                      disabled={validationBusy !== null}
                      onClick={() => void postSuccessionValidation(detail.id, "N2")}
                      className="rounded-lg border border-violet-600 bg-violet-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {validationBusy === "N2" ? "…" : "Enregistrer validation N2"}
                    </button>
                  ) : null}
                  {detail.validationN1At ? (
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Validée N1
                    </span>
                  ) : null}
                  {detail.validationN2At ? (
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Validée N2
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="font-semibold">Décision</p>
              <p className="text-slate-700">
                {detail.decision
                  ? `${detail.decision.type} — ${new Date(detail.decision.decidedAt).toLocaleString("fr-FR")}${detail.decision.comment ? ` · ${detail.decision.comment}` : ""}`
                  : "Pas encore rendue"}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-slate-500">Chargement...</p> : null}
      {error ? <p className="mb-2 text-sm text-rose-700">{error}</p> : null}
      {toast ? (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex justify-between gap-2">
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} className="text-xs">
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-2">Réf</th>
                <th className="px-2 py-2">Concessionnaire</th>
                <th className="px-2 py-2">Statut §10.3</th>
                <th className="px-2 py-2">Dossier §10.1</th>
                <th className="px-2 py-2">Progression</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="text-slate-900">
              {visibleItems.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 transition hover:bg-cyan-50/30">
                  <td className="px-2 py-2 font-mono text-xs">
                    {row.reference}
                    {staleIds.has(row.id) ? (
                      <span
                        className="mt-1 block w-fit rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900"
                        title={`Aucune action depuis ${staleThresholdDays} j. après déclaration`}
                      >
                        Alerte {staleThresholdDays}j
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{row.concessionnaireId}</td>
                  <td className="px-2 py-2">
                    <span
                      title={row.statutMetierDescription}
                      className={`inline-flex max-w-[11rem] flex-col gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase leading-tight ${successionStatutMetierBadgeClass(row.statutMetier)}`}
                    >
                      {row.statutMetierLabel}
                    </span>
                    <span className="mt-1 block text-[9px] font-normal normal-case text-slate-500">{row.status}</span>
                  </td>
                  <td className="px-2 py-2">
                    {(() => {
                      const progress = rowChecklistProgress(row);
                      return (
                        <DossierCompletIndicator
                          complet={progress.complet}
                          size="sm"
                          live={selectedCaseId === row.id && row.status === "OUVERT"}
                          obligatoiresFournis={progress.obligatoiresFournis}
                          obligatoiresTotal={progress.obligatoiresTotal}
                        />
                      );
                    })()}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {row.stepsCompleted}/{row.stepsTotal}
                    {row.currentStepLabel ? (
                      <span className="mt-1 block text-slate-500">
                        Prochaine :{" "}
                        {SUCCESSION_STEP_LABELS[row.currentStepLabel as keyof typeof SUCCESSION_STEP_LABELS] ??
                          row.currentStepLabel}
                      </span>
                    ) : null}
                    {row.decisionType === "TRANSFERT" && row.autoDossierContratReference ? (
                      <Link
                        href={`/dossiers?reference=${encodeURIComponent(row.autoDossierContratReference)}`}
                        className="mt-1 block rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100"
                      >
                        Nouveau dossier contrat initié: {row.autoDossierContratReference} (ouvrir)
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCaseId(row.id)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Voir fiche
                      </button>
                      {row.status === "OUVERT" && row.currentStepLabel ? (
                        <button
                          type="button"
                          disabled={advancingId === row.id || Boolean(advanceBlockReason(row))}
                          title={advanceBlockReason(row)}
                          onClick={() => void advance(row.id, row.currentStepLabel)}
                          className="rounded-lg border border-cyan-600 px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                        >
                          {advancingId === row.id ? "…" : "Valider étape"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleItems.length ? (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-slate-500">
                    Aucun dossier succession.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
        <span>
          {staleOnlyActive ? `${visibleItems.length} dossier(s) stale affiché(s)` : `${total} dossier(s)`} · page {page}/{Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button type="button" onClick={() => void load(page - 1)} disabled={page <= 1} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm transition hover:bg-slate-50 disabled:opacity-40">Préc.</button>
        <button type="button" onClick={() => void load(page + 1)} disabled={page >= Math.max(1, Math.ceil(total / pageSize))} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm transition hover:bg-slate-50 disabled:opacity-40">Suiv.</button>
      </div>
    </section>
  );
}
