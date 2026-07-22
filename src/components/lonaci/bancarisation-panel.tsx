"use client";

import ClientSearchPicker, {
  pickProduitCodeFromClient,
  type ClientPickerRow,
} from "@/components/lonaci/client-search-picker";
import ConcessionnaireSearchPicker, {
  type ConcessionnairePickerRow,
} from "@/components/lonaci/concessionnaire-search-picker";
import Link from "next/link";
import { captureByAliases, extractPdfText, normalizeDateToIso } from "@/lib/lonaci/pdf-import";
import type { ChangeEvent } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import {
  getRoleWorkflowFilterStatuses,
  parseLonaciRole,
  workflowAdvanceLabel,
} from "@/lib/lonaci/workflow-ui-policy";
import {
  areWorkflowApprovalsEnabled,
  isOperationalWorkflowRole,
} from "@/lib/lonaci/workflow-approvals";
import {
  BANCARISATION_STATUT_LABELS,
  BANCARISATION_STATUTS_SPEC_83,
  type BancarisationStatut,
} from "@/lib/lonaci/constants";
import {
  bancarisationStatutBadgeClass,
  bancarisationStatutDescription,
  bancarisationStatutLabel,
} from "@/lib/lonaci/bancarisation-statut";
import { emptyBancarisationStatutCounts } from "@/lib/lonaci/bancarisation-statut";
import { userHasConcessionnairesSaisieModule } from "@/lib/lonaci/module-concessionnaires";
import { assertExcelImportAllowed, getImportAcceptAttribute } from "@/lib/spreadsheet/import-format-policy";
import { notify } from "@/lib/toast";
import { Download, FilePlus2, Landmark, Paperclip, Upload } from "lucide-react";
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

type Banc = BancarisationStatut;
type RequestStatus = "SOUMIS" | "VALIDE_N1" | "VALIDE_N2" | "VALIDE" | "REJETE";

const REQUEST_TABS: RequestStatus[] = ["SOUMIS", "VALIDE_N1", "VALIDE_N2", "VALIDE", "REJETE"];

function emptyRequestStatusCounts(): Record<RequestStatus, number> {
  return { SOUMIS: 0, VALIDE_N1: 0, VALIDE_N2: 0, VALIDE: 0, REJETE: 0 };
}

function requestStatusLabel(s: RequestStatus): string {
  switch (s) {
    case "SOUMIS":
      return "Soumis";
    case "VALIDE_N1":
      return "Validé N1";
    case "VALIDE_N2":
      return "Validé N2";
    case "VALIDE":
      return "Validé (appliqué)";
    case "REJETE":
      return "Rejeté";
    default:
      return s;
  }
}

function tabShortLabel(s: RequestStatus): string {
  switch (s) {
    case "SOUMIS":
      return "Soumis";
    case "VALIDE_N1":
      return "N1";
    case "VALIDE_N2":
      return "N2";
    case "VALIDE":
      return "OK";
    case "REJETE":
      return "Rejet";
    default:
      return s;
  }
}

interface ConcRow {
  id: string;
  codePdv: string;
  nomComplet: string;
  statutBancarisation: Banc;
  statutBancarisationLabel?: string;
  statutBancarisationDescription?: string;
  ribDemandeAt: string | null;
  ribValideAt: string | null;
  bancariseAt: string | null;
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
}
interface RefAgence {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}
interface RefProduit {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}
interface ReqRow {
  id: string;
  concessionnaireId: string;
  statutActuel: Banc;
  nouveauStatut: Banc;
  compteBancaire: string | null;
  banqueEtablissement: string | null;
  dateEffet: string;
  status: RequestStatus;
  validationComment: string | null;
  justificatif: { url: string; filename: string };
  createdAt: string;
}

function canValidateBancarisationRequest(r: ReqRow, role: string): boolean {
  if (!areWorkflowApprovalsEnabled()) {
    if (!isOperationalWorkflowRole(role)) return false;
    return r.status === "SOUMIS" || r.status === "VALIDE_N1" || r.status === "VALIDE_N2";
  }
  if (r.status === "SOUMIS") return role === "CHEF_SECTION";
  if (r.status === "VALIDE_N1") return role === "ASSIST_CDS";
  if (r.status === "VALIDE_N2") return role === "CHEF_SERVICE";
  return false;
}

function canRejectBancarisationRequest(r: ReqRow, role: string): boolean {
  return canValidateBancarisationRequest(r, role);
}
type CounterRow = {
  agenceId: string | null;
  agenceLabel: string;
  produitCode: string;
} & Record<BancarisationStatut, number>;

type Decision = "VALIDER" | "REJETER";

const STATUS_CARD_TOKENS: Record<BancarisationStatut, { card: string; value: string }> = {
  NON_BANCARISE: {
    card: "border-slate-200 bg-linear-to-br from-slate-50 to-white",
    value: "text-slate-800",
  },
  EN_ATTENTE_RIB: {
    card: "border-amber-200 bg-linear-to-br from-amber-50 to-white",
    value: "text-amber-800",
  },
  RIB_FOURNI: {
    card: "border-sky-200 bg-linear-to-br from-sky-50 to-white",
    value: "text-sky-800",
  },
  RIB_VALIDE: {
    card: "border-indigo-200 bg-linear-to-br from-indigo-50 to-white",
    value: "text-indigo-800",
  },
  BANCARISE: {
    card: "border-emerald-200 bg-linear-to-br from-emerald-50 to-white",
    value: "text-emerald-800",
  },
};

const REQUEST_STATUS_TOKENS: Record<RequestStatus, string> = {
  SOUMIS: "bg-indigo-100 text-indigo-950 ring-1 ring-indigo-400",
  VALIDE_N1: "bg-sky-100 text-sky-950 ring-1 ring-sky-400",
  VALIDE_N2: "bg-violet-100 text-violet-950 ring-1 ring-violet-400",
  VALIDE: "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-400",
  REJETE: "bg-rose-100 text-rose-950 ring-1 ring-rose-400",
};

async function downloadBancarisationExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = [
    "concessionnaireId",
    "agenceId",
    "produitCode",
    "statutActuel",
    "nouveauStatut",
    "compteBancaire",
    "banqueEtablissement",
    "dateEffet",
    "status",
    "validationComment",
  ];
  const sample = {
    concessionnaireId: "ID_CONCESSIONNAIRE",
    agenceId: "ID_AGENCE",
    produitCode: "LOTO",
    statutActuel: "NON_BANCARISE",
    nouveauStatut: "EN_ATTENTE_RIB",
    compteBancaire: "",
    banqueEtablissement: "",
    dateEffet: new Date().toISOString(),
    status: "SOUMIS",
    validationComment: "",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "bancarisation_requests");
  XLSX.writeFile(wb, "modele-bancarisation.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    concessionnaireId: (raw.concessionnaireId as string | null) ?? null,
    agenceId: (raw.agenceId as string | null) ?? null,
    produitCode: (raw.produitCode as string | null)?.toUpperCase() ?? null,
    statutActuel: (raw.statutActuel as string | null) ?? "NON_BANCARISE",
    nouveauStatut: (raw.nouveauStatut as string | null) ?? "EN_ATTENTE_RIB",
    compteBancaire: (raw.compteBancaire as string | null) ?? null,
    banqueEtablissement: (raw.banqueEtablissement as string | null) ?? null,
    dateEffet: (raw.dateEffet as string | null) ?? null,
    status: (raw.status as string | null) ?? "SOUMIS",
    validationComment: (raw.validationComment as string | null) ?? null,
    justificatif: { url: "#", filename: "import-manuel" },
  });
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".csv")) return file;
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    assertExcelImportAllowed("BANCARISATION");
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
      concessionnaireId: captureByAliases(source, ["concessionnaire id", "pdv id"], "[a-z0-9]{8,}"),
      agenceId: captureByAliases(source, ["agence id"], "[a-z0-9]{8,}"),
      produitCode: captureByAliases(source, ["produit", "code produit"], "[a-z0-9_ -]{2,20}")?.toUpperCase(),
      statutActuel: captureByAliases(source, ["statut actuel"], "(non_bancarise|en_cours|bancarise)")?.toUpperCase(),
      nouveauStatut: captureByAliases(source, ["nouveau statut", "statut cible"], "(non_bancarise|en_cours|bancarise)")?.toUpperCase(),
      compteBancaire: captureByAliases(source, ["compte bancaire", "rib", "iban"], "[^|;]{4,120}"),
      banqueEtablissement: captureByAliases(source, ["banque", "etablissement"], "[^|;]{2,120}"),
      dateEffet: normalizeDateToIso(captureByAliases(source, ["date effet", "date"], "[0-9/\\- :tTzZ.+]{8,40}")),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporté. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

function statutBancBadge(statut: Banc) {
  return `border ${bancarisationStatutBadgeClass(statut)}`;
}

function requestStatusBadge(status: RequestStatus) {
  return REQUEST_STATUS_TOKENS[status];
}

export default function BancarisationPanel() {
  const [filter, setFilter] = useState<Banc | "">("");
  const [requestTab, setRequestTab] = useState<RequestStatus>("SOUMIS");
  const [items, setItems] = useState<ConcRow[]>([]);
  const [total, setTotal] = useState(0);
  const [refsAgences, setRefsAgences] = useState<RefAgence[]>([]);
  const [refsProduits, setRefsProduits] = useState<RefProduit[]>([]);
  const [requests, setRequests] = useState<ReqRow[]>([]);
  const [allStatusCounts, setAllStatusCounts] = useState<Record<RequestStatus, number> | null>(null);
  const [counters, setCounters] = useState<CounterRow[]>([]);
  const [userRole, setUserRole] = useState<string>("");
  /** null = chargement initial ; false = pas de module CONCESSIONNAIRES (pas d’API bancarisation). */
  const [saisieBancarisation, setSaisieBancarisation] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [ribDemandeOpen, setRibDemandeOpen] = useState(false);
  const [ribDemandePdv, setRibDemandePdv] = useState<ConcessionnairePickerRow | null>(null);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(true);
  const [ribActionRow, setRibActionRow] = useState<ConcRow | null>(null);
  const [ribActionMode, setRibActionMode] = useState<"attach" | "valider" | "integrer" | null>(null);
  const [ribAttachFile, setRibAttachFile] = useState<File | null>(null);
  const [ribCompte, setRibCompte] = useState("");
  const [ribBanque, setRibBanque] = useState("");
  const [ribBusyId, setRibBusyId] = useState<string | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<ReqRow | null>(null);
  const [decision, setDecision] = useState<Decision>("VALIDER");
  const [decisionComment, setDecisionComment] = useState("");
  const [decisionAck, setDecisionAck] = useState(false);
  const [ribDirectTarget, setRibDirectTarget] = useState<ConcRow | null>(null);

  const [createClient, setCreateClient] = useState<ClientPickerRow | null>(null);
  const [nouveauStatut, setNouveauStatut] = useState<Banc>("EN_ATTENTE_RIB");
  const [compteBancaire, setCompteBancaire] = useState("");
  const [banqueEtablissement, setBanqueEtablissement] = useState("");
  const [dateEffet, setDateEffet] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const b = useMemo(() => {
    const acc = emptyBancarisationStatutCounts();
    for (const c of counters) {
      for (const k of Object.keys(acc) as BancarisationStatut[]) {
        acc[k] += c[k] ?? 0;
      }
    }
    return acc;
  }, [counters]);

  const requestCountersPage = useMemo(() => {
    const c = emptyRequestStatusCounts();
    for (const r of requests) {
      if (r.status in c) c[r.status] += 1;
    }
    return c;
  }, [requests]);
  const visibleRequestTabs = useMemo(() => {
    const role = parseLonaciRole(userRole);
    if (role === "AGENT") return REQUEST_TABS;
    const statuses = getRoleWorkflowFilterStatuses("BANCARISATION", role);
    return REQUEST_TABS.filter((status) => statuses.includes(status));
  }, [userRole]);

  useEffect(() => {
    if (visibleRequestTabs.length > 0 && !visibleRequestTabs.includes(requestTab)) {
      setRequestTab(visibleRequestTabs[0]!);
    }
  }, [requestTab, visibleRequestTabs]);

  const tauxBancarisation = useMemo(() => {
    const totalGlobal = Object.values(b).reduce((s, n) => s + n, 0);
    if (totalGlobal <= 0) return 0;
    return Math.round((b.BANCARISE / totalGlobal) * 100);
  }, [b]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      if (!meRes.ok) throw new Error();
      const meData = (await meRes.json()) as { user: { role: string; modulesAutorises?: string[] } };
      const saisie = userHasConcessionnairesSaisieModule(meData.user.modulesAutorises ?? []);
      setUserRole(meData.user.role);
      setSaisieBancarisation(saisie);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (filter) params.set("statutBancarisation", filter);
      const [listRes, refsRes] = await Promise.all([
        fetch(`/api/concessionnaires?${params}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/referentials", { credentials: "include", cache: "no-store" }),
      ]);
      if (!listRes.ok || !refsRes.ok) throw new Error();
      const listData = (await listRes.json()) as { items: ConcRow[]; total: number };
      const refsData = (await refsRes.json()) as { agences: RefAgence[]; produits: RefProduit[] };
      setItems(listData.items);
      setTotal(listData.total);
      setRefsAgences(refsData.agences);
      setRefsProduits(refsData.produits);

      if (saisie) {
        const reqRes = await fetch(`/api/bancarisation?page=1&pageSize=50&status=${requestTab}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!reqRes.ok) throw new Error();
        const reqData = (await reqRes.json()) as {
          items: ReqRow[];
          counters: CounterRow[];
          allStatusCounts?: Partial<Record<RequestStatus, number>>;
        };
        setRequests(reqData.items);
        setCounters(reqData.counters);
        if (reqData.allStatusCounts) {
          setAllStatusCounts({ ...emptyRequestStatusCounts(), ...reqData.allStatusCounts });
        } else {
          setAllStatusCounts(null);
        }
      } else {
        setRequests([]);
        setCounters([]);
        setAllStatusCounts(null);
      }
    } catch {
      setError("Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, requestTab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!decisionTarget) return;
    if (decision === "VALIDER" && !canValidateBancarisationRequest(decisionTarget, userRole)) {
      setDecision("REJETER");
    }
  }, [decisionTarget, userRole, decision]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!createClient?.id) throw new Error("Sélectionnez un client.");
      if (!file) throw new Error("Document justificatif obligatoire.");
      if (nouveauStatut === "BANCARISE" && !compteBancaire.trim()) {
        throw new Error("Le numero de compte bancaire est obligatoire pour BANCARISE.");
      }
      const form = new FormData();
      form.set("lonaciClientId", createClient.id);
      form.set("nouveauStatut", nouveauStatut);
      form.set("compteBancaire", compteBancaire.trim());
      form.set("banqueEtablissement", banqueEtablissement.trim());
      form.set("dateEffet", new Date(dateEffet).toISOString());
      form.set("produitCode", produitCode);
      form.set("file", file);
      const res = await fetch("/api/bancarisation", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Creation impossible");
      }
      notify.success(
        "Demande soumise : validation N1 (chef de section) puis N2 (assistant CDS), puis chef de service.",
      );
      setCreateOpen(false);
      setCreateClient(null);
      setCompteBancaire("");
      setBanqueEtablissement("");
      setDateEffet("");
      setFile(null);
      await load();
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function postRibDemande(concessionnaireId: string) {
    setRibBusyId(concessionnaireId);
    setError(null);
    try {
      const res = await fetch(`/api/concessionnaires/${encodeURIComponent(concessionnaireId)}/rib/demande`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyEmail, notifySms }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; notify?: unknown } | null;
      if (!res.ok) throw new Error(body?.message ?? "Demande RIB impossible");
      notify.success("Demande RIB créée — notification envoyée si possible.");
      setRibDemandeOpen(false);
      setRibDemandePdv(null);
      await load();
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      notify.error(message);
    } finally {
      setRibBusyId(null);
    }
  }

  async function postRibAttach(concessionnaireId: string, file: File) {
    setRibBusyId(concessionnaireId);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/concessionnaires/${encodeURIComponent(concessionnaireId)}/rib/attach`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Pièce RIB impossible");
      notify.success("RIB attaché — statut RIB FOURNI.");
      setRibActionRow(null);
      setRibActionMode(null);
      setRibAttachFile(null);
      await load();
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur"));
    } finally {
      setRibBusyId(null);
    }
  }

  async function postRibValider(concessionnaireId: string) {
    setRibBusyId(concessionnaireId);
    try {
      const res = await fetch(`/api/concessionnaires/${encodeURIComponent(concessionnaireId)}/rib/valider`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compteBancaire: ribCompte.trim() || null,
          banqueEtablissement: ribBanque.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Validation RIB impossible");
      notify.success("RIB validé — prêt pour intégration (BANCARISÉ).");
      setRibActionRow(null);
      setRibActionMode(null);
      await load();
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur"));
    } finally {
      setRibBusyId(null);
    }
  }

  async function postRibIntegrer(concessionnaireId: string) {
    if (!ribCompte.trim()) {
      notify.error("Numéro de compte obligatoire pour l'intégration.");
      return;
    }
    setRibBusyId(concessionnaireId);
    try {
      const res = await fetch(`/api/concessionnaires/${encodeURIComponent(concessionnaireId)}/rib/integrer`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compteBancaire: ribCompte.trim(),
          banqueEtablissement: ribBanque.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Intégration impossible");
      notify.success("Bancarisation intégrée — commissions activées.");
      setRibActionRow(null);
      setRibActionMode(null);
      await load();
    } catch (err) {
      notify.error(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur"));
    } finally {
      setRibBusyId(null);
    }
  }

  function openRibAction(row: ConcRow, mode: "attach" | "valider" | "integrer") {
    setRibActionRow(row);
    setRibActionMode(mode);
    setRibCompte(row.compteBancaire ?? "");
    setRibBanque(row.banqueEtablissement ?? "");
    setRibAttachFile(null);
  }

  async function decideRequest(id: string, action: Decision) {
    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`/api/bancarisation/${encodeURIComponent(id)}/validate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: action,
          comment: decisionComment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Decision impossible");
      }
      notify.success(
          action === "VALIDER"
            ? "Décision enregistrée (étape suivante ou application sur la fiche PDV)."
            : "Demande rejetée.",
      );
      setDecisionTarget(null);
      setDecisionComment("");
      setDecisionAck(false);
      setRequests((current) => current.filter((request) => request.id !== id));
      await load();
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setValidating(false);
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
      fd.set("collection", "bancarisation_requests");
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
      await load();
      window.dispatchEvent(new Event("lonaci:data-imported"));
      notify.success(
        `Import bancarisation terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s), ${data?.skippedInvalidRows ?? 0} ligne(s) invalide(s)${
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

  function openDecision(row: ReqRow, nextDecision: Decision) {
    setDecision(nextDecision);
    setDecisionComment("");
    setDecisionAck(false);
    setDecisionTarget(row);
  }

  function pdvAction(row: ConcRow) {
    if (!saisieBancarisation) return null;
    if (row.statutBancarisation === "NON_BANCARISE") return <Button size="sm" onClick={() => setRibDirectTarget(row)}>Demander le RIB</Button>;
    if (row.statutBancarisation === "EN_ATTENTE_RIB") return <Button size="sm" leadingIcon={Paperclip} onClick={() => openRibAction(row, "attach")}>Joindre le RIB</Button>;
    if (row.statutBancarisation === "RIB_FOURNI") return <Button size="sm" onClick={() => openRibAction(row, "valider")}>Valider le RIB</Button>;
    if (row.statutBancarisation === "RIB_VALIDE") return <Button size="sm" onClick={() => openRibAction(row, "integrer")}>Intégrer</Button>;
    return null;
  }

  const counterColumns: DataTableColumn<CounterRow>[] = [
    { id: "agence", header: "Agence", cell: (row) => row.agenceLabel },
    { id: "produit", header: "Produit", cell: (row) => <span className="font-mono text-xs">{row.produitCode}</span> },
    ...((Object.keys(emptyBancarisationStatutCounts()) as BancarisationStatut[]).map((status): DataTableColumn<CounterRow> => ({
      id: status,
      header: BANCARISATION_STATUT_LABELS[status],
      align: "center",
      cell: (row) => row[status],
    }))),
  ];

  const requestColumns: DataTableColumn<ReqRow>[] = [
    { id: "date", header: "Date", cell: (row) => new Date(row.createdAt).toLocaleString("fr-FR") },
    { id: "concessionnaire", header: "Concessionnaire", cell: (row) => <span className="font-mono text-xs">{row.concessionnaireId}</span> },
    { id: "demande", header: "Demande", cell: (row) => <div className="flex items-center gap-2"><StatusBadge className={statutBancBadge(row.statutActuel)}>{bancarisationStatutLabel(row.statutActuel)}</StatusBadge><span aria-hidden="true">→</span><StatusBadge className={statutBancBadge(row.nouveauStatut)}>{bancarisationStatutLabel(row.nouveauStatut)}</StatusBadge></div> },
    { id: "justificatif", header: "Justificatif", cell: (row) => <a href={row.justificatif.url} target="_blank" rel="noopener noreferrer">{row.justificatif.filename || "Ouvrir"}</a> },
    { id: "commentaire", header: "Commentaire", cell: (row) => row.validationComment || "—" },
    {
      id: "action",
      header: "Action",
      align: "right",
      cell: (row) => canValidateBancarisationRequest(row, userRole) || canRejectBancarisationRequest(row, userRole) ? (
        <div className="flex justify-end gap-2">{canValidateBancarisationRequest(row, userRole) ? <Button size="sm" onClick={() => openDecision(row, "VALIDER")}>Valider</Button> : null}{canRejectBancarisationRequest(row, userRole) ? <Button size="sm" variant="danger" onClick={() => openDecision(row, "REJETER")}>Rejeter</Button> : null}</div>
      ) : <StatusBadge className={requestStatusBadge(row.status)}>{requestStatusLabel(row.status)}</StatusBadge>,
    },
  ];

  const pdvColumns: DataTableColumn<ConcRow>[] = [
    { id: "pdv", header: "PDV", cell: (row) => <span className="font-mono text-xs">{row.codePdv}</span> },
    { id: "nom", header: "Nom", cell: (row) => row.nomComplet },
    { id: "statut", header: "Statut", cell: (row) => <StatusBadge className={statutBancBadge(row.statutBancarisation)} title={row.statutBancarisationDescription ?? bancarisationStatutDescription(row.statutBancarisation)}>{row.statutBancarisationLabel ?? bancarisationStatutLabel(row.statutBancarisation)}</StatusBadge> },
    { id: "agence", header: "Agence", cell: (row) => refsAgences.find((agence) => agence.id === row.agenceId)?.code ?? "—" },
    { id: "action", header: "Actions", align: "right", cell: (row) => <div className="flex justify-end gap-2">{pdvAction(row)}<Link href={`/concessionnaires?focus=${encodeURIComponent(row.id)}`}>Voir la fiche</Link></div> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Parcours financier"
        title="Bancarisation"
        description="De la demande de RIB à l’intégration pour le versement des commissions."
        actions={saisieBancarisation ? (
          <>
            <Button variant="secondary" leadingIcon={Landmark} onClick={() => setRibDemandeOpen(true)}>Demande de RIB</Button>
            <Button leadingIcon={FilePlus2} onClick={() => setCreateOpen(true)}>Circuit historique</Button>
            <Button variant="secondary" leadingIcon={Download} onClick={() => window.open(`/api/bancarisation/export?format=excel${filter ? `&statutBancarisation=${filter}` : ""}`, "_blank")}>Excel</Button>
            <Button variant="secondary" leadingIcon={Download} onClick={() => window.open(`/api/bancarisation/export?format=pdf${filter ? `&statutBancarisation=${filter}` : ""}`, "_blank")}>PDF</Button>
            <Button variant="secondary" leadingIcon={Download} onClick={() => void downloadBancarisationExcelTemplate()}>Modèle</Button>
            <input ref={importFileInputRef} type="file" accept={getImportAcceptAttribute("BANCARISATION")} className="sr-only" aria-label="Importer des demandes de bancarisation" onChange={(e) => void onImportFileChange(e)} />
            <Button variant="secondary" leadingIcon={Upload} loading={importingFile} onClick={() => importFileInputRef.current?.click()}>Importer</Button>
          </>
        ) : undefined}
      />

      {saisieBancarisation === false ? <FeedbackState tone="warning" title="Consultation uniquement" description="Les demandes, validations, exports et compteurs détaillés exigent le module CONCESSIONNAIRES." /> : null}
      {error ? <FeedbackState tone="danger" title="Opération impossible" description={error} /> : null}

      {saisieBancarisation ? (
        <Surface>
          <SectionHeader title="Indicateurs de bancarisation" description="Répartition selon le statut de bancarisation." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {(Object.keys(emptyBancarisationStatutCounts()) as BancarisationStatut[]).map((status) => <Card key={status} title={BANCARISATION_STATUT_LABELS[status]} className={STATUS_CARD_TOKENS[status].card}><strong className={`text-2xl ${STATUS_CARD_TOKENS[status].value}`}>{b[status]}</strong></Card>)}
            <Card title="Taux bancarisé"><strong className="text-2xl">{tauxBancarisation}%</strong><progress className="mt-3 w-full" max={100} value={tauxBancarisation} aria-label="Taux de bancarisation" /></Card>
          </div>
        </Surface>
      ) : null}

      <FilterBar
        aria-label="Filtres de bancarisation"
        filters={
          <FormField label="Statut de bancarisation"><select value={filter} onChange={(e) => { setPage(1); setFilter(e.target.value as Banc | ""); }}><option value="">Tous les statuts</option>{BANCARISATION_STATUTS_SPEC_83.map((row) => <option key={row.statut} value={row.statut}>{row.label}</option>)}</select></FormField>
        }
      />

      {saisieBancarisation ? (
        <>
          <Surface>
            <SectionHeader title="Compteurs par agence et produit" />
            <DataTable rows={counters.slice(0, 120)} columns={counterColumns} rowKey={(row) => `${row.agenceId ?? "na"}-${row.produitCode}`} caption="Compteurs de bancarisation" mobileCard={(row) => <article className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"><div><strong>{row.agenceLabel}</strong><p className="mt-1 text-sm text-slate-600">{row.produitCode}</p></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm">{(Object.keys(emptyBancarisationStatutCounts()) as BancarisationStatut[]).map((status) => <div key={status}><dt className="text-slate-500">{BANCARISATION_STATUT_LABELS[status]}</dt><dd className="mt-1 font-semibold">{row[status]}</dd></div>)}</dl></article>} />
          </Surface>

          <Surface>
            <SectionHeader
              title="Circuit de validation"
              description={
                areWorkflowApprovalsEnabled()
                  ? "Validation N1, N2 puis chef de service."
                  : `Progression libre (${workflowAdvanceLabel()}).`
              }
              action={<div className="flex flex-wrap gap-2">{visibleRequestTabs.map((status) => <Button key={status} size="sm" variant={requestTab === status ? "primary" : "secondary"} onClick={() => setRequestTab(status)}>{tabShortLabel(status)} ({(allStatusCounts ?? requestCountersPage)[status]})</Button>)}</div>}
            />
            <DataTable
              rows={requests}
              columns={requestColumns}
              rowKey={(row) => row.id}
              caption="Demandes du circuit de validation"
              mobileCard={(row) => <article className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><strong>{row.concessionnaireId}</strong><p className="mt-1 text-sm text-slate-600">{new Date(row.createdAt).toLocaleString("fr-FR")}</p></div><StatusBadge className={requestStatusBadge(row.status)}>{requestStatusLabel(row.status)}</StatusBadge></div><div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{canValidateBancarisationRequest(row, userRole) ? <Button size="sm" onClick={() => openDecision(row, "VALIDER")}>Valider</Button> : null}{canRejectBancarisationRequest(row, userRole) ? <Button size="sm" variant="danger" onClick={() => openDecision(row, "REJETER")}>Rejeter</Button> : null}</div></article>}
            />
          </Surface>
        </>
      ) : null}

      <Surface padding="none" elevated>
        {loading ? <Skeleton lines={6} /> : <DataTable rows={items} columns={pdvColumns} rowKey={(row) => row.id} caption="Points de vente et statuts de bancarisation" mobileCard={(row) => <article className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><strong>{row.nomComplet}</strong><p className="mt-1 text-sm text-slate-600">{row.codePdv}</p></div><StatusBadge className={statutBancBadge(row.statutBancarisation)}>{bancarisationStatutLabel(row.statutBancarisation)}</StatusBadge></div><div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{pdvAction(row)}<Button variant="ghost" size="sm" onClick={() => window.location.assign(`/concessionnaires?focus=${encodeURIComponent(row.id)}`)}>Voir la fiche</Button></div></article>} />}
      </Surface>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{total} point(s) de vente</p><Pagination page={page} pageCount={totalPages} onPageChange={setPage} label="Pagination des points de vente" /></div>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open && !submitting) setCreateOpen(false); }} title="Nouvelle demande de bancarisation" description={areWorkflowApprovalsEnabled() ? "Circuit historique N1 → N2 → chef de service." : "Circuit de progression des demandes."} size="lg" footer={<><Button variant="secondary" disabled={submitting} onClick={() => setCreateOpen(false)}>Annuler</Button><Button type="submit" form="bancarisation-create-form" loading={submitting}>Soumettre</Button></>}>
        <form id="bancarisation-create-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><ClientSearchPicker key={`banc-create-${createOpen}`} label="Client Lonaci" selected={createClient} onSelectedChange={(row) => { setCreateClient(row); const picked = pickProduitCodeFromClient(row, refsProduits.filter((p) => p.actif).map((p) => p.code)); if (picked) setProduitCode(picked); }} filter="linkedPdv" inputClassName="w-full" searchPlaceholder="Rechercher un client" /></div>
          <FormField label="Nouveau statut" required><select value={nouveauStatut} onChange={(e) => setNouveauStatut(e.target.value as Banc)}>{BANCARISATION_STATUTS_SPEC_83.filter((row) => row.statut !== "NON_BANCARISE").map((row) => <option key={row.statut} value={row.statut}>{row.label}</option>)}</select></FormField>
          <FormField label="Numéro de compte" required={nouveauStatut === "BANCARISE"}><input value={compteBancaire} onChange={(e) => setCompteBancaire(e.target.value)} required={nouveauStatut === "BANCARISE"} /></FormField>
          <FormField label="Banque / établissement"><input value={banqueEtablissement} onChange={(e) => setBanqueEtablissement(e.target.value)} /></FormField>
          <FormField label="Date d’effet" required><input type="date" value={dateEffet} onChange={(e) => setDateEffet(e.target.value)} required /></FormField>
          <FormField label="Produit"><select value={produitCode} onChange={(e) => setProduitCode(e.target.value)}><option value="">Non précisé</option>{refsProduits.filter((p) => p.actif).map((p) => <option key={p.id} value={p.code}>{p.code} — {p.libelle}</option>)}</select></FormField>
          <FormField label="Document justificatif" required><input type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></FormField>
        </form>
      </Dialog>

      <Dialog open={decisionTarget !== null} onOpenChange={(open) => { if (!open && !validating) setDecisionTarget(null); }} title="Décision de validation" description={decisionTarget ? `${bancarisationStatutLabel(decisionTarget.statutActuel)} → ${bancarisationStatutLabel(decisionTarget.nouveauStatut)}` : undefined} size="sm" footer={<><Button variant="secondary" disabled={validating} onClick={() => setDecisionTarget(null)}>Annuler</Button><Button variant={decision === "REJETER" ? "danger" : "primary"} disabled={!decisionAck} loading={validating} onClick={() => decisionTarget && void decideRequest(decisionTarget.id, decision)}>Confirmer</Button></>}>
        {decisionTarget ? <div className="space-y-4"><div className="flex gap-2">{canValidateBancarisationRequest(decisionTarget, userRole) ? <Button size="sm" variant={decision === "VALIDER" ? "primary" : "secondary"} onClick={() => setDecision("VALIDER")}>Valider</Button> : null}<Button size="sm" variant={decision === "REJETER" ? "danger" : "secondary"} onClick={() => setDecision("REJETER")}>Rejeter</Button></div><FormField label="Commentaire"><textarea rows={3} value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} /></FormField><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={decisionAck} onChange={(e) => setDecisionAck(e.target.checked)} /><span>Je confirme cette décision.</span></label></div> : null}
      </Dialog>

      <Dialog open={ribDemandeOpen} onOpenChange={setRibDemandeOpen} title="Demande de RIB" description="Crée la demande et notifie le concessionnaire." size="sm" footer={<><Button variant="secondary" onClick={() => setRibDemandeOpen(false)}>Annuler</Button><Button disabled={!ribDemandePdv?.id || ribBusyId !== null} loading={ribBusyId !== null} onClick={() => ribDemandePdv?.id && void postRibDemande(ribDemandePdv.id)}>Créer la demande</Button></>}>
        <ConcessionnaireSearchPicker key={`rib-demande-${ribDemandeOpen}`} label="Concessionnaire" selected={ribDemandePdv} onSelectedChange={setRibDemandePdv} inputClassName="w-full" searchPlaceholder="Rechercher un PDV" />
        <div className="mt-4 grid gap-2"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} /><span>Notifier par email</span></label><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={notifySms} onChange={(e) => setNotifySms(e.target.checked)} /><span>Notifier par SMS</span></label></div>
      </Dialog>

      <Dialog open={ribActionRow !== null && ribActionMode !== null} onOpenChange={(open) => { if (!open && !ribBusyId) { setRibActionRow(null); setRibActionMode(null); } }} title={ribActionMode === "attach" ? "Joindre le RIB" : ribActionMode === "valider" ? "Valider le RIB" : "Intégrer la bancarisation"} description={ribActionRow ? `${ribActionRow.codePdv} — ${ribActionRow.nomComplet}` : undefined} size="sm" footer={<><Button variant="secondary" disabled={ribBusyId !== null} onClick={() => { setRibActionRow(null); setRibActionMode(null); }}>Annuler</Button><Button loading={ribBusyId !== null} disabled={ribActionMode === "attach" && !ribAttachFile} onClick={() => { if (!ribActionRow) return; if (ribActionMode === "attach" && ribAttachFile) void postRibAttach(ribActionRow.id, ribAttachFile); else if (ribActionMode === "valider") void postRibValider(ribActionRow.id); else if (ribActionMode === "integrer") void postRibIntegrer(ribActionRow.id); }}>Confirmer</Button></>}>
        {ribActionMode === "attach" ? <FormField label="Fichier RIB" required><input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setRibAttachFile(e.target.files?.[0] ?? null)} /></FormField> : <div className="grid gap-4"><FormField label="Numéro de compte" required={ribActionMode === "integrer"}><input value={ribCompte} onChange={(e) => setRibCompte(e.target.value)} /></FormField><FormField label="Banque / établissement"><input value={ribBanque} onChange={(e) => setRibBanque(e.target.value)} /></FormField></div>}
      </Dialog>

      <ConfirmDialog open={ribDirectTarget !== null} onOpenChange={(open) => { if (!open && !ribBusyId) setRibDirectTarget(null); }} title="Créer une demande de RIB" message={ribDirectTarget ? `Confirmer la demande de RIB pour ${ribDirectTarget.codePdv} — ${ribDirectTarget.nomComplet}.` : ""} confirmLabel="Créer la demande" pending={ribBusyId !== null} onConfirm={async () => { if (!ribDirectTarget) return; await postRibDemande(ribDirectTarget.id); setRibDirectTarget(null); }} />
    </div>
  );
}
