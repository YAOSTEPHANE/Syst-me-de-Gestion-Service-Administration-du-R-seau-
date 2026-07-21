"use client";

import ClientSearchPicker, {
  pickProduitCodeFromClient,
  type ClientPickerRow,
} from "@/components/lonaci/client-search-picker";
import { captureByAliases, extractPdfText, normalizeDateToIso } from "@/lib/lonaci/pdf-import";
import type { ChangeEvent } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DossierCompletIndicator from "@/components/lonaci/dossier-complet-indicator";
import ResiliationChecklistBlock from "@/components/lonaci/resiliation-checklist-block";
import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button, IconButton } from "@/components/lonaci/ui/button";
import { ConfirmDialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { PageHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import { RESILIATION_CHECKLIST_ITEMS_SPEC_71 } from "@/lib/lonaci/resiliation-document-checklist";
import {
  RESILIATION_STATUTS_SPEC_72,
  resiliationStatutMetierBadgeClass,
  resolveResiliationStatutMetier,
} from "@/lib/lonaci/resiliation-statut-metier";
import { resiliationChecklistProgress } from "@/lib/lonaci/resiliations-checklist-progress";
import { canRole } from "@/lib/auth/rbac";
import { LONACI_ROLES, type LonaciRole } from "@/lib/lonaci/constants";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { getAssignedWorkflowTarget } from "@/lib/lonaci/workflow-ui-policy";
import type { DossierDocumentChecklistPayload } from "@/lib/lonaci/types";
import { notify } from "@/lib/toast";
import { FilePlus2, RefreshCw, X } from "lucide-react";

type ResiliationStatus =
  | "DOSSIER_RECU"
  | "CONTROLE_CHEF_SECTION"
  | "VALIDATION_N2"
  | "RESILIE"
  | "REJETEE";

interface ResiliationItem {
  id: string;
  concessionnaireId: string;
  produitCode: string;
  dateReception: string;
  motif: string;
  statut: ResiliationStatus;
  commentaire: string | null;
  validatedAt: string | null;
  contratId: string | null;
  contratReference: string | null;
  documentChecklist: DossierDocumentChecklistPayload | null;
  statutMetierLabel: string;
  statutMetierDescription: string;
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number; uploadedAt: string }>;
}

const WORKFLOW_STATUT_FILTER_LABELS: Record<ResiliationStatus, string> = {
  DOSSIER_RECU: "Réception — constitution",
  CONTROLE_CHEF_SECTION: "Circuit — N1",
  VALIDATION_N2: "Circuit — N2",
  RESILIE: "RÉSILIÉ",
  REJETEE: "Rejetée",
};

interface ConcessionnaireItem {
  id: string;
  raisonSociale?: string;
  nomComplet?: string;
  codePdv?: string;
}

interface ProduitRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

async function downloadResiliationsExcelTemplate() {
  const XLSX = await import("xlsx");
  const headers = ["concessionnaireId", "produitCode", "dateReception", "motif", "commentaire"];
  const sample = {
    concessionnaireId: "ID_CONCESSIONNAIRE",
    produitCode: "LOTO",
    dateReception: new Date().toISOString(),
    motif: "Exemple import résiliation",
    commentaire: "",
  };
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "resiliations");
  XLSX.writeFile(wb, "modele-resiliations.xlsx");
}

async function normalizeImportFileForApi(file: File): Promise<File> {
  const sanitize = (raw: Record<string, unknown>): Record<string, unknown> => ({
    concessionnaireId: (raw.concessionnaireId as string | null) ?? null,
    produitCode: (raw.produitCode as string | null)?.toUpperCase() ?? null,
    dateReception: (raw.dateReception as string | null) ?? null,
    motif: (raw.motif as string | null) ?? null,
    commentaire: (raw.commentaire as string | null) ?? null,
    statut: (raw.statut as string | null) ?? "DOSSIER_RECU",
    attachments: [],
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
      concessionnaireId: captureByAliases(source, ["concessionnaire id", "pdv id"], "[a-z0-9]{8,}"),
      produitCode: captureByAliases(source, ["code produit", "produit"], "[a-z0-9_ -]{2,20}")?.toUpperCase(),
      dateReception: normalizeDateToIso(
        captureByAliases(source, ["date reception", "date"], "[0-9/\\- :tTzZ.+]{8,40}"),
      ),
      motif: captureByAliases(source, ["motif"], "[^|;]{1,300}"),
      commentaire: captureByAliases(source, ["commentaire", "observations"], "[^|;]{1,300}"),
    });
    const json = JSON.stringify([row]);
    return new File([json], file.name.replace(/\.pdf$/i, ".json"), { type: "application/json" });
  }
  throw new Error("Format non supporté. Utilisez .json, .csv, .xlsx, .xls ou .pdf.");
}

export default function ResiliationsPanel() {
  const [items, setItems] = useState<ResiliationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<ResiliationItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailChecklistLive, setDetailChecklistLive] = useState<{
    complet: boolean;
    obligatoiresFournis: number;
    obligatoiresTotal: number;
  } | null>(null);

  const [concessionnaires, setConcessionnaires] = useState<ConcessionnaireItem[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [refLoading, setRefLoading] = useState(true);

  const [createClient, setCreateClient] = useState<ClientPickerRow | null>(null);
  const [produitCode, setProduitCode] = useState("");
  const [dateReception, setDateReception] = useState("");
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);
  const docsRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const [creating, setCreating] = useState(false);
  const [finalizeId, setFinalizeId] = useState<string | null>(null);

  const [fStatus, setFStatus] = useState<ResiliationStatus | "">("");
  const [fFilterClient, setFFilterClient] = useState<ClientPickerRow | null>(null);
  const [fProduitCode, setFProduitCode] = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
      if (fStatus) q.set("statut", fStatus);
      if (fFilterClient?.id) q.set("lonaciClientId", fFilterClient.id);
      if (fProduitCode) q.set("produitCode", fProduitCode);
      if (fDateFrom) q.set("dateFrom", new Date(fDateFrom).toISOString());
      if (fDateTo) q.set("dateTo", new Date(fDateTo).toISOString());
      const res = await fetch(`/api/resiliations?${q}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Chargement impossible");
      const d = (await res.json()) as { items: ResiliationItem[]; total: number; page: number };
      setItems(d.items);
      setTotal(d.total);
      setPage(d.page);
    } catch (e) {
      setError(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
    } finally {
      setLoading(false);
    }
  }, [fDateFrom, fDateTo, fFilterClient?.id, fProduitCode, fStatus, page, pageSize]);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [authRes, refRes, cRes] = await Promise.all([
          fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
          fetch("/api/referentials", { credentials: "include", cache: "no-store" }),
          fetch("/api/concessionnaires?page=1&pageSize=100&statut=ACTIF", { credentials: "include", cache: "no-store" }),
        ]);
        if (authRes.ok) {
          const auth = (await authRes.json()) as { user?: { role?: string } };
          setMeRole(auth.user?.role ?? null);
        }
        if (refRes.ok) {
          const refs = (await refRes.json()) as { produits: ProduitRef[] };
          setProduits((refs.produits ?? []).filter((p) => p.actif));
        }
        if (cRes.ok) {
          const c = (await cRes.json()) as { items: ConcessionnaireItem[] };
          setConcessionnaires(c.items ?? []);
        }
      } finally {
        setRefLoading(false);
      }
    })();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      if (!createClient?.id) {
        setError("Sélectionnez un client.");
        notify.error("Sélectionnez un client.");
        setCreating(false);
        return;
      }
      const form = new FormData();
      form.set("lonaciClientId", createClient.id);
      form.set("produitCode", produitCode);
      form.set("dateReception", new Date(dateReception).toISOString());
      form.set("motif", motif);
      form.set("commentaire", commentaire);
      for (const f of documents) form.append("documents", f);
      const res = await fetch("/api/resiliations", { method: "POST", credentials: "include", body: form });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Création impossible");
      }
      setCreateClient(null);
      setProduitCode("");
      setDateReception("");
      setMotif("");
      setCommentaire("");
      setDocuments([]);
      setCreateOpen(false);
      notify.success("Dossier de résiliation créé (statut DOSSIER_REÇU).");
      await load(1);
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
      notify.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function openDetail(id: string) {
    setDetailId(id);
    setDetailLoading(true);
    setDetailItem(null);
    setDetailChecklistLive(null);
    try {
      const res = await fetch(`/api/resiliations/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Chargement du dossier impossible");
      const data = (await res.json()) as { item: ResiliationItem };
      setDetailItem(data.item);
      setDetailChecklistLive(resiliationChecklistProgress(data.item.documentChecklist));
    } catch (e) {
      notify.error(friendlyErrorMessage(e instanceof Error ? e.message : "Erreur"));
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailId(null);
    setDetailItem(null);
    setDetailChecklistLive(null);
  }

  function syncItemChecklist(id: string, checklist: DossierDocumentChecklistPayload) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, documentChecklist: checklist } : r)));
    setDetailItem((prev) => (prev && prev.id === id ? { ...prev, documentChecklist: checklist } : prev));
    setDetailChecklistLive(resiliationChecklistProgress(checklist));
  }

  async function transitionResiliationRow(id: string, target: ResiliationStatus) {
    if (target === "CONTROLE_CHEF_SECTION") {
      const row =
        detailId === id && detailItem ? detailItem : items.find((r) => r.id === id);
      const checklistComplet =
        detailId === id && detailChecklistLive
          ? detailChecklistLive.complet
          : row?.documentChecklist?.complet;
      if (row?.documentChecklist && checklistComplet === false) {
        notify.error(
          "Checklist incomplète : marquez toutes les pièces obligatoires comme « Fourni » avant soumission.",
        );
        return;
      }
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/resiliations/${encodeURIComponent(id)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          ...(target === "RESILIE" ? { confirmIrreversible: true as const } : {}),
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Transition impossible");
      }
      notify.success(
        target === "RESILIE" ? "Résiliation finalisée — contrat archivé." : "Transition appliquée.",
      );
      if (target === "RESILIE") setFinalizeId(null);
      setItems((current) => current.filter((item) => item.id !== id));
      setTotal((current) => Math.max(0, current - 1));
      if (detailId === id) closeDetail();
      await load(page);
    } catch (e) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : "Erreur");
      setError(message);
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
      fd.set("collection", "resiliations");
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
      window.dispatchEvent(new Event("lonaci:data-imported"));
      notify.success(
        `Import résiliations terminé: ${data?.inserted ?? 0} ligne(s) insérée(s), ${data?.skippedExistingDuplicates ?? 0} doublon(s) ignoré(s), ${data?.skippedInvalidRows ?? 0} ligne(s) invalide(s)${
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

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of concessionnaires) {
      m.set(c.id, (c.nomComplet || c.raisonSociale || c.codePdv || c.id).trim());
    }
    return m;
  }, [concessionnaires]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const meRbacRole =
    meRole && LONACI_ROLES.includes(meRole as LonaciRole) ? (meRole as LonaciRole) : null;
  const canValidateN1 = meRbacRole
    ? canRole({ role: meRbacRole, resource: "DOSSIERS", action: "VALIDATE_N1" }).allowed
    : false;
  const canValidateN2 = meRbacRole
    ? canRole({ role: meRbacRole, resource: "DOSSIERS", action: "VALIDATE_N2" }).allowed
    : false;
  const canFinalize = meRbacRole
    ? canRole({ role: meRbacRole, resource: "DOSSIERS", action: "FINALIZE" }).allowed
    : false;
  const canReject = meRbacRole
    ? canRole({ role: meRbacRole, resource: "DOSSIERS", action: "REJECT" }).allowed
    : false;
  const assignedTransitionTarget = (row: ResiliationItem): ResiliationStatus | null =>
    getAssignedWorkflowTarget({
      workflow: "RESILIATIONS",
      role: meRbacRole,
      status: row.statut,
    }) as ResiliationStatus | null;
  function openCreate() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setDateReception(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
    );
    setCreateOpen(true);
  }
  function closeCreate() {
    if (creating) return;
    setCreateOpen(false);
    setCreateClient(null);
    setProduitCode("");
    setDateReception("");
    setMotif("");
    setCommentaire("");
    setDocuments([]);
  }
  const exportBase = `/api/resiliations/export?${new URLSearchParams({
    ...(fStatus ? { statut: fStatus } : {}),
    ...(fFilterClient?.id ? { lonaciClientId: fFilterClient.id } : {}),
    ...(fProduitCode ? { produitCode: fProduitCode } : {}),
    ...(fDateFrom ? { dateFrom: new Date(fDateFrom).toISOString() } : {}),
    ...(fDateTo ? { dateTo: new Date(fDateTo).toISOString() } : {}),
  }).toString()}`;

  return (
    <section className="relative space-y-5 overflow-hidden bg-orange-50/20">
      <div className="pointer-events-none absolute -right-16 top-0 h-44 w-44 rounded-full bg-cyan-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-0 h-48 w-48 rounded-full bg-rose-200/20 blur-3xl" />
      <Surface elevated padding="lg">
        <PageHeader
          eyebrow="Gestion contractuelle"
          title="Résiliations"
          description="Constitution, contrôle et clôture traçable des dossiers."
          actions={<div className="flex flex-wrap gap-2"><Button leadingIcon={FilePlus2} onClick={openCreate}>Créer une demande</Button><Button variant="secondary" leadingIcon={RefreshCw} onClick={() => void load()}>Actualiser</Button></div>}
        />
        <div>
          <div className="mt-3 max-w-2xl space-y-2 text-[11px] leading-snug text-slate-600">
            <p>
              <span className="font-semibold text-cyan-900">Checklist :</span> dossier complet obligatoire avant
              traitement ({RESILIATION_CHECKLIST_ITEMS_SPEC_71.length} pièces communes + documents produit le cas
              échéant).
            </p>
            <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-900">
                Documents à fournir
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-slate-700">
                {RESILIATION_CHECKLIST_ITEMS_SPEC_71.map((item) => (
                  <li key={item.id}>{item.libelle}</li>
                ))}
              </ul>
            </div>
            <p className="text-[11px] text-slate-600">
              Indicateur <span className="font-semibold">DOSSIER COMPLET / INCOMPLET</span> mis à jour en temps réel
              lors de la saisie de la checklist. À la validation finale, le contrat passe en statut{" "}
              <span className="font-semibold">RÉSILIÉ (archivé)</span> — il n&apos;est jamais supprimé (piste d&apos;audit).
            </p>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900">
                7.2 — Statuts de la résiliation
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-md text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-indigo-200 text-indigo-900">
                      <th className="py-1.5 pr-3 font-semibold">Statut</th>
                      <th className="py-1.5 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    {RESILIATION_STATUTS_SPEC_72.map((row) => (
                      <tr key={row.statut} className="border-b border-indigo-100/80 last:border-0">
                        <td className="py-1.5 pr-3 align-top font-semibold whitespace-nowrap text-slate-900">
                          {row.label}
                        </td>
                        <td className="py-1.5 align-top leading-snug">{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center rounded-xl border border-cyan-600 bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700"
          >
            Créer demande de résiliation
          </button>
          <a
            href={`${exportBase}&format=csv`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-emerald-600 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            Export Excel (CSV)
          </a>
          <a
            href={`${exportBase}&format=pdf`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Export PDF (imprimable)
          </a>
          <button
            type="button"
            onClick={() => void downloadResiliationsExcelTemplate()}
            className="rounded-xl border border-emerald-600 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            Télécharger modèle Excel
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".json,.csv,.xlsx,.xls,.pdf"
            className="hidden"
            onChange={(e) => void onImportFileChange(e)}
          />
          <button
            type="button"
            onClick={() => importFileInputRef.current?.click()}
            disabled={importingFile}
            className="rounded-xl border border-cyan-600 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 shadow-sm transition hover:bg-cyan-100 disabled:opacity-60"
          >
            {importingFile ? "Import..." : "Importer fichier vers le tableau"}
          </button>
        </div>
      </Surface>

      {error ? <FeedbackState tone="danger" title="Impossible de charger les résiliations" description={error} /> : null}

      <FilterBar filters={<div className="grid w-full gap-3 md:grid-cols-5">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as ResiliationStatus | "")} className={inputClass} aria-label="Filtrer par statut">
          <option value="">Tous statuts</option>
          {(Object.keys(WORKFLOW_STATUT_FILTER_LABELS) as ResiliationStatus[]).map((s) => (
            <option key={s} value={s}>
              {WORKFLOW_STATUT_FILTER_LABELS[s]}
            </option>
          ))}
        </select>
        <ClientSearchPicker
          label={<span className="text-xs font-medium text-slate-600">Client (filtre)</span>}
          selected={fFilterClient}
          onSelectedChange={setFFilterClient}
          filter="linkedPdv"
          inputClassName={inputClass}
          showClearLink
          searchPlaceholder="Rechercher un client…"
        />
        <select value={fProduitCode} onChange={(e) => setFProduitCode(e.target.value)} className={inputClass}>
          <option value="">Tous produits</option>
          {produits.map((p) => (
            <option key={p.code} value={p.code}>{p.libelle}</option>
          ))}
        </select>
        <input type="date" value={fDateFrom} onChange={(e) => setFDateFrom(e.target.value)} className={inputClass} />
        <input type="date" value={fDateTo} onChange={(e) => setFDateTo(e.target.value)} className={inputClass} />
      </div>} />

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-cyan-200 bg-cyan-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Total dossiers</p>
          <p className="mt-1 text-xl font-semibold text-cyan-900">{total}</p>
        </article>
        <article className="rounded-xl border border-rose-200 bg-rose-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">En cours</p>
          <p className="mt-1 text-xl font-semibold text-rose-900">
            {items.filter((row) => row.statut !== "RESILIE" && row.statut !== "REJETEE").length}
          </p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Résiliés</p>
          <p className="mt-1 text-xl font-semibold text-emerald-900">{items.filter((row) => row.statut === "RESILIE").length}</p>
        </article>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-slate-600"><span>{total} entrée(s)</span><Pagination page={page} pageCount={totalPages} onPageChange={(next) => void load(next)} label="Pages des résiliations" /></div>

      {loading ? (
        <Skeleton lines={5} />
      ) : (
        <>
        <div className="grid gap-3 md:hidden">
          {items.map((row) => {
            const progress = resiliationChecklistProgress(row.documentChecklist);
            return (
              <Surface key={row.id} padding="md" elevated>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{labelById.get(row.concessionnaireId) ?? row.concessionnaireId}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.produitCode} · {new Date(row.dateReception).toLocaleString("fr-FR")}</p>
                  </div>
                  <StatusBadge tone={row.statut === "RESILIE" ? "success" : row.statut === "REJETEE" ? "danger" : "warning"}>
                    {row.statutMetierLabel}
                  </StatusBadge>
                </div>
                <div className="mt-3"><DossierCompletIndicator complet={progress.complet} size="sm" obligatoiresFournis={progress.obligatoiresFournis} obligatoiresTotal={progress.obligatoiresTotal} /></div>
                {row.attachments.length ? <ul className="mt-3 space-y-1 text-xs">{row.attachments.map((a) => <li key={a.id}><a className="text-orange-700 underline" href={`/api/resiliations/${row.id}/attachments/${a.id}`} target="_blank" rel="noreferrer">{a.filename}</a></li>)}</ul> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void openDetail(row.id)}>Voir le dossier</Button>
                  {assignedTransitionTarget(row) === "CONTROLE_CHEF_SECTION" && canValidateN1 ? <Button size="sm" disabled={busyId === row.id || !progress.complet} onClick={() => void transitionResiliationRow(row.id, "CONTROLE_CHEF_SECTION")}>Valider N1</Button> : null}
                  {assignedTransitionTarget(row) === "VALIDATION_N2" && canValidateN2 ? <Button size="sm" onClick={() => void transitionResiliationRow(row.id, "VALIDATION_N2")}>Valider N2</Button> : null}
                  {assignedTransitionTarget(row) === "RESILIE" && canFinalize ? <Button size="sm" variant="danger" onClick={() => setFinalizeId(row.id)}>Finaliser</Button> : null}
                </div>
              </Surface>
            );
          })}
          {!items.length ? <FeedbackState title="Aucune résiliation" description="Aucun dossier ne correspond aux filtres actifs." /> : null}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Concessionnaire</th>
                <th className="px-3 py-2.5">Produit</th>
                <th className="px-3 py-2.5">Date réception</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5">Checklist</th>
                <th className="px-3 py-2.5">Pièces jointes</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-cyan-50/40"
                  onClick={() => openDetail(row.id)}
                >
                  <td className="px-3 py-2.5">{labelById.get(row.concessionnaireId) ?? row.concessionnaireId}</td>
                  <td className="px-3 py-2.5">{row.produitCode}</td>
                  <td className="px-3 py-2.5 text-xs">{new Date(row.dateReception).toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex max-w-44 flex-col rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight ${resiliationStatutMetierBadgeClass(
                        resolveResiliationStatutMetier({
                          statut: row.statut,
                          checklistComplet: row.documentChecklist?.complet ?? null,
                        }),
                      )}`}
                      title={row.statutMetierDescription}
                    >
                      {row.statutMetierLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {row.documentChecklist ? (
                      (() => {
                        const progress =
                          detailId === row.id && detailChecklistLive
                            ? detailChecklistLive
                            : resiliationChecklistProgress(row.documentChecklist);
                        return (
                          <DossierCompletIndicator
                            complet={progress.complet}
                            size="sm"
                            live={detailId === row.id && row.statut === "DOSSIER_RECU"}
                            obligatoiresFournis={progress.obligatoiresFournis}
                            obligatoiresTotal={progress.obligatoiresTotal}
                          />
                        );
                      })()
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {row.attachments.length ? row.attachments.map((a) => (
                      <div key={a.id}>
                        <a href={`/api/resiliations/${row.id}/attachments/${a.id}`} target="_blank" rel="noreferrer" className="text-xs underline text-slate-700">{a.filename}</a>
                      </div>
                    )) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    {row.statut === "RESILIE" ? (
                      <StatusBadge tone="success">
                        RÉSILIÉ
                      </StatusBadge>
                    ) : row.statut === "REJETEE" ? (
                      <span className="text-xs text-slate-400">Rejetée</span>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-1">
                        {assignedTransitionTarget(row) === "CONTROLE_CHEF_SECTION" && canValidateN1 ? (
                          <button
                            type="button"
                            disabled={busyId === row.id || row.documentChecklist?.complet === false}
                            title={
                              row.documentChecklist?.complet === false
                                ? "Checklist incomplète"
                                : undefined
                            }
                            onClick={() => void transitionResiliationRow(row.id, "CONTROLE_CHEF_SECTION")}
                            className="rounded-lg border border-sky-600 bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                          >
                            Valider N1
                          </button>
                        ) : null}
                        {assignedTransitionTarget(row) === "VALIDATION_N2" && canValidateN2 ? (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void transitionResiliationRow(row.id, "VALIDATION_N2")}
                            className="rounded-lg border border-violet-600 bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                          >
                            Valider N2
                          </button>
                        ) : null}
                        {assignedTransitionTarget(row) === "RESILIE" && canFinalize ? (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => setFinalizeId(row.id)}
                            className="rounded-lg border border-rose-600 bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                          >
                            Finaliser (RÉSILIÉ)
                          </button>
                        ) : null}
                        {assignedTransitionTarget(row) && canReject ? (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void transitionResiliationRow(row.id, "REJETEE")}
                            className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700"
                          >
                            Rejeter
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">Aucune résiliation.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        </>
      )}

      {detailId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="resiliation-detail-title">
          <button type="button" className="absolute inset-0 bg-slate-900/60" aria-label="Fermer" onClick={closeDetail} />
          <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-linear-to-r from-cyan-50 via-white to-rose-50 px-4 py-3">
              <div>
                <h3 id="resiliation-detail-title" className="text-sm font-semibold text-slate-900">
                  Dossier résiliation {detailItem?.id.slice(-8) ?? detailId}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  {detailItem ? `${labelById.get(detailItem.concessionnaireId) ?? detailItem.concessionnaireId} · ${detailItem.produitCode}` : "…"}
                </p>
                {detailItem ? (
                  <p className="mt-1 text-[11px] text-slate-600" title={detailItem.statutMetierDescription}>
                    <span className="font-semibold text-indigo-900">Statut 7.2 :</span> {detailItem.statutMetierLabel}
                  </p>
                ) : null}
              </div>
              <IconButton icon={X} label="Fermer le détail de la résiliation" size="sm" onClick={closeDetail} />
            </div>
            {detailItem?.documentChecklist ? (
              <div className="shrink-0 border-b border-slate-200 px-4 py-2">
                <DossierCompletIndicator
                  complet={detailChecklistLive?.complet ?? detailItem.documentChecklist.complet}
                  size="banner"
                  live={detailItem.statut === "DOSSIER_RECU"}
                  obligatoiresFournis={detailChecklistLive?.obligatoiresFournis}
                  obligatoiresTotal={detailChecklistLive?.obligatoiresTotal}
                />
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {detailLoading ? <p className="text-sm text-slate-500">Chargement du dossier…</p> : null}
              {!detailLoading && detailItem?.statut === "RESILIE" && detailItem.contratReference ? (
                <div className="mb-3 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2.5 text-[11px] text-slate-800">
                  <p className="font-semibold text-slate-900">Contrat archivé</p>
                  <p className="mt-1 leading-snug">
                    Réf. <span className="font-mono">{detailItem.contratReference}</span> — statut{" "}
                    <span className="font-semibold">RÉSILIÉ</span>. Enregistrement conservé (non supprimé) pour la piste
                    d&apos;audit.
                  </p>
                </div>
              ) : null}
              {!detailLoading && detailItem?.documentChecklist ? (
                <ResiliationChecklistBlock
                  resiliationId={detailItem.id}
                  checklist={detailItem.documentChecklist}
                  editable={detailItem.statut === "DOSSIER_RECU"}
                  onUpdated={(checklist) => syncItemChecklist(detailItem.id, checklist)}
                  onProgressChange={setDetailChecklistLive}
                />
              ) : !detailLoading ? (
                <p className="text-sm text-slate-500">Checklist non disponible sur ce dossier.</p>
              ) : null}
              {!detailLoading && detailItem?.attachments.length ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Pièces jointes</p>
                  <ul className="mt-2 space-y-1">
                    {detailItem.attachments.map((a) => (
                      <li key={a.id}>
                        <a
                          href={`/api/resiliations/${detailItem.id}/attachments/${a.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline text-cyan-800"
                        >
                          {a.filename}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {!detailLoading ? (
                <p className="mt-3 text-xs text-slate-600">
                  <span className="font-semibold">Motif :</span> {detailItem?.motif ?? "—"}
                </p>
              ) : null}
            </div>
            {detailItem && detailItem.statut !== "RESILIE" && detailItem.statut !== "REJETEE" ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
                {assignedTransitionTarget(detailItem) === "CONTROLE_CHEF_SECTION" && canValidateN1 ? (
                  <button
                    type="button"
                    disabled={
                      busyId === detailItem.id ||
                      (detailChecklistLive?.complet ?? detailItem.documentChecklist?.complet) === false
                    }
                    onClick={() => void transitionResiliationRow(detailItem.id, "CONTROLE_CHEF_SECTION")}
                    className="rounded-lg border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Valider N1
                  </button>
                ) : null}
                {assignedTransitionTarget(detailItem) === "VALIDATION_N2" && canValidateN2 ? (
                  <button
                    type="button"
                    disabled={busyId === detailItem.id}
                    onClick={() => void transitionResiliationRow(detailItem.id, "VALIDATION_N2")}
                    className="rounded-lg border border-violet-600 bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Valider N2
                  </button>
                ) : null}
                {assignedTransitionTarget(detailItem) === "RESILIE" && canFinalize ? (
                  <button
                    type="button"
                    disabled={busyId === detailItem.id}
                    onClick={() =>
                      setFinalizeId(detailItem.id)
                    }
                    className="rounded-lg border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Finaliser (RÉSILIÉ)
                  </button>
                ) : null}
                {assignedTransitionTarget(detailItem) && canReject ? (
                  <button
                    type="button"
                    disabled={busyId === detailItem.id}
                    onClick={() => void transitionResiliationRow(detailItem.id, "REJETEE")}
                    className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Rejeter
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(finalizeId)}
        onOpenChange={(open) => {
          if (!open && !busyId) setFinalizeId(null);
        }}
        title="Finaliser la résiliation"
        message="Cette action est irréversible : le contrat sera archivé et le concessionnaire passera au statut résilié."
        confirmLabel="Confirmer la résiliation"
        destructive
        pending={Boolean(finalizeId && busyId === finalizeId)}
        onConfirm={async () => {
          if (finalizeId) await transitionResiliationRow(finalizeId, "RESILIE");
        }}
      />

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-resiliation-title">
          <button type="button" className="absolute inset-0 bg-slate-900/60" aria-label="Fermer" onClick={closeCreate} disabled={creating} />
          <div className="relative z-10 flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-linear-to-r from-cyan-50 via-white to-rose-50 px-4 py-2">
              <div>
                <h3 id="create-resiliation-title" className="text-sm font-semibold text-slate-900">
                  Demande de résiliation
                </h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">Client, produit, date de réception, motif, documents joints.</p>
              </div>
              <IconButton icon={X} label="Fermer le formulaire de résiliation" size="sm" onClick={closeCreate} disabled={creating} />
            </div>
            <form id="create-resiliation-form" noValidate onSubmit={onCreate} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="grid gap-3">
                <section className="grid gap-2 rounded-xl border border-cyan-200/70 bg-cyan-50/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Informations dossier</p>
                <ClientSearchPicker
                  key={`resiliation-create-${createOpen}`}
                  label={<span className="text-xs font-medium text-slate-700">Client Lonaci *</span>}
                  selected={createClient}
                  onSelectedChange={(r) => {
                    setCreateClient(r);
                    const codes = produits.map((p) => p.code);
                    const picked = pickProduitCodeFromClient(r, codes);
                    if (picked) setProduitCode(picked);
                  }}
                  filter="linkedPdv"
                  inputClassName={inputClass}
                  disabled={refLoading}
                  searchPlaceholder="Rechercher un client (nom, code, CNI…)"
                />
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Produit concerné *</span>
                  <select required value={produitCode} onChange={(e) => setProduitCode(e.target.value)} className={inputClass} disabled={refLoading}>
                    <option value="">{refLoading ? "Chargement..." : "Sélectionner un produit"}</option>
                    {produits.map((p) => (
                      <option key={p.code} value={p.code}>{p.libelle}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Date de réception du dossier *</span>
                  <input required type="datetime-local" value={dateReception} onChange={(e) => setDateReception(e.target.value)} className={inputClass} />
                </label>
                </section>
                <section className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <label className="grid gap-1">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                      <path d="M14 2v5h5" />
                      <path d="M9 13h6" />
                      <path d="M9 17h6" />
                    </svg>
                    Documents joints
                  </span>
                  <input ref={docsRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setDocuments(Array.from(e.target.files ?? []))} />
                  <button
                    type="button"
                    onClick={() => docsRef.current?.click()}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm outline-none ring-cyan-500/20 focus:ring-2 focus:ring-cyan-500"
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                        <path d="M14 2v5h5" />
                      </svg>
                      <span className="truncate">
                        {documents.length ? `${documents.length} document(s) sélectionné(s)` : "Ajouter lettres/documents"}
                      </span>
                    </span>
                    <span className="shrink-0 text-slate-500">Parcourir</span>
                  </button>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Motif de résiliation *</span>
                  <textarea required rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} className={inputClass} />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Commentaire</span>
                  <textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className={inputClass} />
                </label>
                </section>
              </div>
            </form>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
              <button type="button" onClick={closeCreate} disabled={creating} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
                Annuler
              </button>
              <button
                type="submit"
                form="create-resiliation-form"
                disabled={creating}
                className="rounded-lg border border-cyan-600 bg-cyan-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:border-cyan-700 hover:bg-cyan-700 disabled:opacity-60"
              >
                {creating ? "Enregistrement…" : "Créer dossier (DOSSIER_REÇU)"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
