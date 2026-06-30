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
  if (r.status === "SOUMIS") return role === "CHEF_SECTION";
  if (r.status === "VALIDE_N1") return role === "ASSIST_CDS";
  if (r.status === "VALIDE_N2") return role === "CHEF_SERVICE";
  return false;
}

function canRejectBancarisationRequest(r: ReqRow, role: string): boolean {
  return (
    ["SOUMIS", "VALIDE_N1", "VALIDE_N2"].includes(r.status) &&
    ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(role)
  );
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
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
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
    setToast(null);
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
      setToast({
        type: "success",
        message: "Demande soumise : validation N1 (chef de section) puis N2 (assistant CDS), puis chef de service.",
      });
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
      setToast({ type: "error", message });
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
      setToast({ type: "success", message: "Demande RIB créée — notification envoyée si possible." });
      setRibDemandeOpen(false);
      setRibDemandePdv(null);
      await load();
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setToast({ type: "error", message });
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
      setToast({ type: "success", message: "RIB attaché — statut RIB FOURNI." });
      setRibActionRow(null);
      setRibActionMode(null);
      setRibAttachFile(null);
      await load();
    } catch (err) {
      setToast({ type: "error", message: friendlyErrorMessage(err instanceof Error ? err.message : "Erreur") });
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
      setToast({ type: "success", message: "RIB validé — prêt pour intégration (BANCARISÉ)." });
      setRibActionRow(null);
      setRibActionMode(null);
      await load();
    } catch (err) {
      setToast({ type: "error", message: friendlyErrorMessage(err instanceof Error ? err.message : "Erreur") });
    } finally {
      setRibBusyId(null);
    }
  }

  async function postRibIntegrer(concessionnaireId: string) {
    if (!ribCompte.trim()) {
      setToast({ type: "error", message: "Numéro de compte obligatoire pour l'intégration." });
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
      setToast({ type: "success", message: "Bancarisation intégrée — commissions activées." });
      setRibActionRow(null);
      setRibActionMode(null);
      await load();
    } catch (err) {
      setToast({ type: "error", message: friendlyErrorMessage(err instanceof Error ? err.message : "Erreur") });
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
      setToast({
        type: "success",
        message:
          action === "VALIDER"
            ? "Décision enregistrée (étape suivante ou application sur la fiche PDV)."
            : "Demande rejetée.",
      });
      setDecisionTarget(null);
      setDecisionComment("");
      setDecisionAck(false);
      await load();
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Erreur");
      setError(message);
      setToast({ type: "error", message });
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
      setToast({
        type: "success",
        message: `Import bancarisation terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s), ${data?.skippedInvalidRows ?? 0} ligne(s) invalide(s)${
          data?.invalidRows?.[0] ? ` (ex: ligne ${data.invalidRows[0].index} - ${data.invalidRows[0].reason})` : ""
        }.`,
      });
    } catch (err) {
      const message = friendlyErrorMessage(err instanceof Error ? err.message : "Import impossible");
      setToast({ type: "error", message });
    } finally {
      setImportingFile(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-linear-to-br from-white via-slate-50 to-white p-5 shadow-sm">
        <div className="pointer-events-none absolute -top-24 right-0 h-52 w-52 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-12 h-40 w-40 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Bancarisation</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Parcours unifié (spec 8.3) : de la demande RIB à l&apos;intégration pour le versement des commissions.
            </p>
            <div className="mt-3 max-w-2xl rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 text-[11px] leading-snug text-slate-600">
              <p className="font-semibold uppercase tracking-wide text-indigo-900">8.3 — Statuts de la bancarisation</p>
              <table className="mt-2 w-full text-left">
                <thead>
                  <tr className="border-b border-indigo-200 text-indigo-900">
                    <th className="py-1 pr-2 font-semibold">Statut</th>
                    <th className="py-1 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {BANCARISATION_STATUTS_SPEC_83.map((row) => (
                    <tr key={row.statut} className="border-t border-indigo-100/80">
                      <td className="py-1 pr-2 align-top font-semibold whitespace-nowrap text-slate-900">{row.label}</td>
                      <td className="py-1 align-top text-slate-700">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {saisieBancarisation === false ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <span className="font-semibold">Action / saisie uniquement</span> : demandes, validations, exports et
                compteurs détaillés bancarisation exigent le module{" "}
                <code className="rounded bg-white px-1 py-0.5 text-[11px]">CONCESSIONNAIRES</code> (le profil{" "}
                <code className="rounded bg-white px-1 py-0.5 text-[11px]">CONCESSIONNAIRES_LECTURE</code> ne suffit pas).
                Vous pouvez consulter les PDV ci-dessous selon vos droits sur le référentiel.
              </p>
            ) : null}
          </div>
          {saisieBancarisation ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setRibDemandeOpen(true)}
                className="rounded-xl bg-linear-to-r from-cyan-600 to-cyan-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Demande de RIB
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-xl border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100"
              >
                Circuit historique
              </button>
              <button
                type="button"
                onClick={() => {
                  void window.open(
                    `/api/bancarisation/export?format=excel${
                      filter ? `&statutBancarisation=${filter}` : ""
                    }`,
                    "_blank",
                  );
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
              >
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => {
                  void window.open(
                    `/api/bancarisation/export?format=pdf${
                      filter ? `&statutBancarisation=${filter}` : ""
                    }`,
                    "_blank",
                  );
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => void downloadBancarisationExcelTemplate()}
                className="rounded-xl border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                Modèle Excel
              </button>
              <input
                ref={importFileInputRef}
                type="file"
                accept={getImportAcceptAttribute("BANCARISATION")}
                className="hidden"
                onChange={(e) => void onImportFileChange(e)}
              />
              <button
                type="button"
                onClick={() => importFileInputRef.current?.click()}
                disabled={importingFile}
                className="rounded-xl border border-cyan-600 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:opacity-60"
              >
                {importingFile ? "Import..." : "Importer fichier vers le tableau"}
              </button>
            </div>
          ) : null}
        </div>
        {saisieBancarisation ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className={`rounded-2xl border p-2.5 ${STATUS_CARD_TOKENS.NON_BANCARISE.card}`}>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Non bancarisés</p>
              <p className={`mt-1 text-xl font-semibold ${STATUS_CARD_TOKENS.NON_BANCARISE.value}`}>{b.NON_BANCARISE}</p>
            </div>
            <div className={`rounded-2xl border p-2.5 ${STATUS_CARD_TOKENS.EN_ATTENTE_RIB.card}`}>
              <p className="text-[10px] font-semibold uppercase leading-tight text-slate-500">EN ATTENTE DE RIB</p>
              <p className={`mt-1 text-xl font-semibold ${STATUS_CARD_TOKENS.EN_ATTENTE_RIB.value}`}>{b.EN_ATTENTE_RIB}</p>
            </div>
            <div className={`rounded-2xl border p-2.5 ${STATUS_CARD_TOKENS.RIB_FOURNI.card}`}>
              <p className="text-[10px] font-semibold uppercase leading-tight text-slate-500">RIB FOURNI</p>
              <p className={`mt-1 text-xl font-semibold ${STATUS_CARD_TOKENS.RIB_FOURNI.value}`}>{b.RIB_FOURNI}</p>
            </div>
            <div className={`rounded-2xl border p-2.5 ${STATUS_CARD_TOKENS.RIB_VALIDE.card}`}>
              <p className="text-[10px] font-semibold uppercase leading-tight text-slate-500">RIB VALIDÉ</p>
              <p className={`mt-1 text-xl font-semibold ${STATUS_CARD_TOKENS.RIB_VALIDE.value}`}>{b.RIB_VALIDE}</p>
            </div>
            <div className={`rounded-2xl border p-2.5 ${STATUS_CARD_TOKENS.BANCARISE.card}`}>
              <p className="text-[10px] font-semibold uppercase leading-tight text-slate-500">BANCARISÉ</p>
              <p className={`mt-1 text-xl font-semibold ${STATUS_CARD_TOKENS.BANCARISE.value}`}>{b.BANCARISE}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Taux</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{tauxBancarisation}%</p>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-linear-to-r from-cyan-400 to-emerald-400"
                  style={{ width: `${Math.min(100, Math.max(0, tauxBancarisation))}%` }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Filtrer :</span>
        {(
          [
            ["", "Tous"],
            ...BANCARISATION_STATUTS_SPEC_83.map((r) => [r.statut, r.label] as const),
          ] as const
        ).map(([val, label]) => (
          <button
            key={val || "all"}
            type="button"
            onClick={() => {
              setPage(1);
              setFilter(val);
            }}
            className={`rounded-xl border px-3 py-1.5 text-xs transition ${
              filter === val
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {toast ? (
        <div
          className={`rounded px-3 py-2 text-sm ${
            toast.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {saisieBancarisation ? (
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Compteurs par agence et produit</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-3">Agence</th>
                <th className="pb-2 pr-3">Produit</th>
                {(Object.keys(emptyBancarisationStatutCounts()) as BancarisationStatut[]).map((s) => (
                  <th key={s} className="pb-2 pr-3 whitespace-nowrap">
                    {BANCARISATION_STATUT_LABELS[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {counters.slice(0, 120).map((c, i) => (
                <tr
                  key={`${c.agenceId ?? "na"}-${c.produitCode}-${i}`}
                  className="border-b border-slate-100 transition hover:bg-slate-50"
                >
                  <td className="py-1.5 pr-3 text-slate-700">{c.agenceLabel}</td>
                  <td className="py-1.5 pr-3 font-mono text-cyan-300">{c.produitCode}</td>
                  {(Object.keys(emptyBancarisationStatutCounts()) as BancarisationStatut[]).map((s) => (
                    <td key={s} className="py-1.5 pr-3 font-semibold text-slate-800">
                      {c[s]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {saisieBancarisation ? (
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Circuit de validation (N1 → N2 → chef de service)</h3>
          <div className="flex flex-wrap gap-2">
            {REQUEST_TABS.map((s) => {
              const tabCounts = allStatusCounts ?? requestCountersPage;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRequestTab(s)}
                  className={`rounded-xl border px-2.5 py-1 text-xs transition ${
                    requestTab === s
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tabShortLabel(s)} ({tabCounts[s]})
                </button>
              );
            })}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Concessionnaire</th>
                <th className="pb-2 pr-3">Demande</th>
                <th className="pb-2 pr-3">Justificatif</th>
                <th className="pb-2 pr-3">Commentaire</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                  <td className="py-1.5 pr-3">{new Date(r.createdAt).toLocaleString("fr-FR")}</td>
                  <td className="py-1.5 pr-3 font-mono">{r.concessionnaireId.slice(0, 8)}…</td>
                  <td className="py-1.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statutBancBadge(r.statutActuel)}`}>
                      {r.statutActuel}
                    </span>
                    <span className="px-2 text-slate-500">→</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statutBancBadge(r.nouveauStatut)}`}>
                      {r.nouveauStatut}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <a
                      href={r.justificatif.url}
                      target="_blank"
                      className="text-sky-400 hover:underline"
                    >
                      {r.justificatif.filename || "Ouvrir"}
                    </a>
                  </td>
                  <td className="py-1.5 pr-3 text-slate-400">{r.validationComment || "—"}</td>
                  <td className="py-1.5">
                    {saisieBancarisation &&
                    (canValidateBancarisationRequest(r, userRole) || canRejectBancarisationRequest(r, userRole)) ? (
                      <div className="flex flex-wrap gap-2">
                        {canValidateBancarisationRequest(r, userRole) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDecision("VALIDER");
                              setDecisionComment("");
                              setDecisionAck(false);
                              setDecisionTarget(r);
                            }}
                            className="rounded-xl bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500"
                          >
                            {r.status === "SOUMIS"
                              ? "Valider N1"
                              : r.status === "VALIDE_N1"
                                ? "Valider N2"
                                : "Valider (appliquer)"}
                          </button>
                        ) : null}
                        {canRejectBancarisationRequest(r, userRole) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDecision("REJETER");
                              setDecisionComment("");
                              setDecisionAck(false);
                              setDecisionTarget(r);
                            }}
                            className="rounded-xl bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-500"
                          >
                            Rejeter
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${requestStatusBadge(r.status)}`}>
                        {requestStatusLabel(r.status)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!requests.length ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={6}>
                    Aucune demande.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            {total} point(s) de vente · page {page}/{totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-40"
            >
              Préc.
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-40"
            >
              Suiv.
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-3">PDV</th>
                  <th className="pb-2 pr-3">Nom</th>
                  <th className="pb-2 pr-3">Statut (8.3)</th>
                  <th className="pb-2 pr-3">Agence</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">{row.codePdv}</td>
                    <td className="py-2 pr-3 text-slate-900">{row.nomComplet}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex max-w-[11rem] flex-col rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight ${statutBancBadge(row.statutBancarisation)}`}
                        title={
                          row.statutBancarisationDescription ??
                          bancarisationStatutDescription(row.statutBancarisation)
                        }
                      >
                        {row.statutBancarisationLabel ?? bancarisationStatutLabel(row.statutBancarisation)}
                      </span>
                      {row.bancariseAt ? (
                        <p className="mt-0.5 text-[10px] text-slate-500" title={row.bancariseAt}>
                          Intégré {new Date(row.bancariseAt).toLocaleString("fr-FR")}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{refsAgences.find((a) => a.id === row.agenceId)?.code ?? "—"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {saisieBancarisation && row.statutBancarisation === "NON_BANCARISE" ? (
                          <button
                            type="button"
                            disabled={ribBusyId === row.id}
                            onClick={() => void postRibDemande(row.id)}
                            className="rounded border border-cyan-600 bg-cyan-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                          >
                            Demande RIB
                          </button>
                        ) : null}
                        {saisieBancarisation && row.statutBancarisation === "EN_ATTENTE_RIB" ? (
                          <button
                            type="button"
                            disabled={ribBusyId === row.id}
                            onClick={() => openRibAction(row, "attach")}
                            className="rounded border border-sky-600 bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                          >
                            Joindre RIB
                          </button>
                        ) : null}
                        {saisieBancarisation && row.statutBancarisation === "RIB_FOURNI" ? (
                          <button
                            type="button"
                            disabled={ribBusyId === row.id}
                            onClick={() => openRibAction(row, "valider")}
                            className="rounded border border-indigo-600 bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                          >
                            Valider RIB
                          </button>
                        ) : null}
                        {saisieBancarisation && row.statutBancarisation === "RIB_VALIDE" ? (
                          <button
                            type="button"
                            disabled={ribBusyId === row.id}
                            onClick={() => openRibAction(row, "integrer")}
                            className="rounded border border-emerald-600 bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                          >
                            Intégrer
                          </button>
                        ) : null}
                        <Link href={`/concessionnaires?focus=${encodeURIComponent(row.id)}`} className="text-[10px] text-sky-600 hover:underline">
                          Fiche
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-600">
        Statut 8.3 mis à jour à chaque étape du parcours RIB. Le circuit
        historique (N1 → N2 → chef de service) reste disponible pour les dossiers existants. Fiches :{" "}
        <Link href="/concessionnaires" className="text-sky-600 hover:underline">
          Concessionnaires
        </Link>
        .
      </p>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setCreateOpen(false)} />
          <form
            onSubmit={onSubmit}
            className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Nouvelle demande de bancarisation</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                Fermer
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <ClientSearchPicker
                  key={`banc-create-${createOpen}`}
                  label={<span className="text-xs text-slate-600">Client Lonaci *</span>}
                  selected={createClient}
                  onSelectedChange={(r) => {
                    setCreateClient(r);
                    const codes = refsProduits.filter((p) => p.actif).map((p) => p.code);
                    const picked = pickProduitCodeFromClient(r, codes);
                    if (picked) setProduitCode(picked);
                  }}
                  filter="linkedPdv"
                  inputClassName="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                  searchPlaceholder="Rechercher un client…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Nouveau statut</label>
                <select
                  value={nouveauStatut}
                  onChange={(e) => setNouveauStatut(e.target.value as Banc)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                >
                  <option value="EN_ATTENTE_RIB">EN ATTENTE DE RIB</option>
                  <option value="RIB_FOURNI">RIB FOURNI</option>
                  <option value="RIB_VALIDE">RIB VALIDÉ</option>
                  <option value="BANCARISE">BANCARISÉ</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Numéro de compte bancaire</label>
                <input
                  value={compteBancaire}
                  onChange={(e) => setCompteBancaire(e.target.value)}
                  required={nouveauStatut === "BANCARISE"}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">
                  Banque / établissement financier
                </label>
                <input
                  value={banqueEtablissement}
                  onChange={(e) => setBanqueEtablissement(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Date d&apos;effet</label>
                <input
                  type="date"
                  value={dateEffet}
                  onChange={(e) => setDateEffet(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Produit (optionnel)</label>
                <select
                  value={produitCode}
                  onChange={(e) => setProduitCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                >
                  <option value="">Tous / non précisé</option>
                  {refsProduits
                    .filter((p) => p.actif)
                    .map((p) => (
                      <option key={p.id} value={p.code}>
                        {p.code} - {p.libelle}
                      </option>
                    ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-600">Document justificatif</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-linear-to-r from-amber-600 to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
              >
                {submitting ? "Envoi..." : "Soumettre"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {decisionTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => (validating ? null : setDecisionTarget(null))} />
          <div className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Confirmation de décision</h3>
            <p className="mt-1 text-xs text-slate-600">
              Demande: {decisionTarget.statutActuel} → {decisionTarget.nouveauStatut} · statut workflow :{" "}
              {requestStatusLabel(decisionTarget.status)}
            </p>
            <div className="mt-3 flex gap-2">
              {canValidateBancarisationRequest(decisionTarget, userRole) ? (
                <button
                  type="button"
                  onClick={() => setDecision("VALIDER")}
                  className={`rounded-xl px-3 py-1 text-xs transition ${
                    decision === "VALIDER"
                      ? "bg-emerald-700 text-white"
                      : "border border-emerald-700 text-emerald-400"
                  }`}
                >
                  Valider
                </button>
              ) : null}
              {canRejectBancarisationRequest(decisionTarget, userRole) ? (
                <button
                  type="button"
                  onClick={() => setDecision("REJETER")}
                  className={`rounded-xl px-3 py-1 text-xs transition ${
                    decision === "REJETER"
                      ? "bg-rose-700 text-white"
                      : "border border-rose-700 text-rose-400"
                  }`}
                >
                  Rejeter
                </button>
              ) : null}
            </div>
            <label className="mt-3 block text-xs text-slate-600">Commentaire (optionnel)</label>
            <textarea
              rows={3}
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
              placeholder="Motif / précision"
            />
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={decisionAck}
                onChange={(e) => setDecisionAck(e.target.checked)}
              />
              <span>Je confirme la décision de validation/rejet de cette demande.</span>
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={validating}
                onClick={() => setDecisionTarget(null)}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={
                  !decisionAck ||
                  validating ||
                  (decision === "VALIDER" && !canValidateBancarisationRequest(decisionTarget, userRole)) ||
                  (decision === "REJETER" && !canRejectBancarisationRequest(decisionTarget, userRole))
                }
                onClick={() => void decideRequest(decisionTarget.id, decision)}
                className="rounded-xl bg-linear-to-r from-amber-600 to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
              >
                {validating ? "Traitement..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ribDemandeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setRibDemandeOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Demande de RIB</h3>
            <p className="mt-1 text-xs text-slate-600">
              Crée la demande et notifie le concessionnaire par email et/ou SMS.
            </p>
            <div className="mt-3">
              <ConcessionnaireSearchPicker
                key={`rib-demande-${ribDemandeOpen}`}
                label={<span className="text-xs text-slate-600">Concessionnaire</span>}
                selected={ribDemandePdv}
                onSelectedChange={setRibDemandePdv}
                inputClassName="w-full rounded-xl border border-slate-300 px-2 py-2 text-sm"
                searchPlaceholder="Rechercher un PDV…"
              />
            </div>
            <div className="mt-3 flex flex-col gap-2 text-xs text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
                Notifier par email
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={notifySms} onChange={(e) => setNotifySms(e.target.checked)} />
                Notifier par SMS (si configuré)
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRibDemandeOpen(false)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs">
                Annuler
              </button>
              <button
                type="button"
                disabled={!ribDemandePdv?.id || ribBusyId !== null}
                onClick={() => ribDemandePdv?.id && void postRibDemande(ribDemandePdv.id)}
                className="rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                Créer la demande
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ribActionRow && ribActionMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => {
              setRibActionRow(null);
              setRibActionMode(null);
            }}
          />
          <div className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">
              {ribActionMode === "attach"
                ? "Joindre le RIB"
                : ribActionMode === "valider"
                  ? "Valider le RIB"
                  : "Intégrer (BANCARISÉ)"}
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              {ribActionRow.codePdv} — {ribActionRow.nomComplet}
            </p>
            {ribActionMode === "attach" ? (
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="mt-3 w-full text-xs"
                onChange={(e) => setRibAttachFile(e.target.files?.[0] ?? null)}
              />
            ) : (
              <div className="mt-3 grid gap-2">
                <label className="grid gap-1 text-xs">
                  <span className="text-slate-600">Numéro de compte {ribActionMode === "integrer" ? "*" : ""}</span>
                  <input
                    value={ribCompte}
                    onChange={(e) => setRibCompte(e.target.value)}
                    required={ribActionMode === "integrer"}
                    className="rounded-xl border border-slate-300 px-2 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="text-slate-600">Banque / établissement</span>
                  <input
                    value={ribBanque}
                    onChange={(e) => setRibBanque(e.target.value)}
                    className="rounded-xl border border-slate-300 px-2 py-2 text-sm"
                  />
                </label>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRibActionRow(null);
                  setRibActionMode(null);
                }}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={ribBusyId === ribActionRow.id}
                onClick={() => {
                  if (ribActionMode === "attach" && ribAttachFile) {
                    void postRibAttach(ribActionRow.id, ribAttachFile);
                  } else if (ribActionMode === "valider") {
                    void postRibValider(ribActionRow.id);
                  } else if (ribActionMode === "integrer") {
                    void postRibIntegrer(ribActionRow.id);
                  }
                }}
                className="rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
