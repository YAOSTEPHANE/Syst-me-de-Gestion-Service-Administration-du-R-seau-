"use client";

import { getLonaciRoleLabel, SUCCESSION_STEP_LABELS } from "@/lib/lonaci/constants";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

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
}

interface StaleRow {
  id: string;
  reference: string;
  concessionnaireId: string;
  daysInactive: number;
  nextStep: string | null;
}

interface ConcessionnaireOption {
  id: string;
  codePdv?: string;
  nomComplet?: string;
  raisonSociale?: string;
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
  };
}

export default function SuccessionPanel() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [items, setItems] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [stale, setStale] = useState<StaleRow[]>([]);

  const [concId, setConcId] = useState("");
  const [concessionnaireQuickPick, setConcessionnaireQuickPick] = useState("");
  const [manualConcIdOpen, setManualConcIdOpen] = useState(false);
  const [concessionnaires, setConcessionnaires] = useState<ConcessionnaireOption[]>([]);
  const [concessionnairesLoading, setConcessionnairesLoading] = useState(false);
  const [concessionnairesError, setConcessionnairesError] = useState<string | null>(null);
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
  const [fStatus, setFStatus] = useState<"" | "OUVERT" | "CLOTURE">("");
  const [fConcessionnaireId, setFConcessionnaireId] = useState("");
  const [fDecisionType, setFDecisionType] = useState<"" | "TRANSFERT" | "RESILIATION">("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");

  function friendlySuccessionError(raw: string): string {
    switch (raw) {
      case "CASE_NOT_FOUND":
        return "Dossier de succession introuvable (ID invalide ou dossier supprimé).";
      case "CONCESSIONNAIRE_NOT_FOUND":
        return "Le concessionnaire lié au dossier n’a pas été trouvé.";
      case "AGENCE_FORBIDDEN":
        return "Accès refusé : vous n’avez pas les droits sur ce dossier.";
      case "ACTE_DECES_REQUIRED":
        return "Acte de décès obligatoire pour ouvrir le dossier.";
      default:
        return raw;
    }
  }

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
      if (fStatus) params.set("status", fStatus);
      if (fConcessionnaireId) params.set("concessionnaireId", fConcessionnaireId);
      if (fDecisionType) params.set("decisionType", fDecisionType);
      if (fDateFrom) params.set("dateFrom", new Date(fDateFrom).toISOString());
      if (fDateTo) params.set("dateTo", new Date(fDateTo).toISOString());
      const [listRes, staleRes] = await Promise.all([
        fetch(`/api/succession-cases?${params.toString()}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/succession-cases/alerts/stale", { credentials: "include", cache: "no-store" }),
      ]);
      if (!listRes.ok) {
        const b = (await listRes.json().catch(() => null)) as { message?: string } | null;
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

  async function loadDetail(caseId: string) {
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
        const raw = b?.message ?? `Fiche dossier inaccessible (HTTP ${res.status})`;
        throw new Error(friendlySuccessionError(raw));
      }
      const payload = (await res.json()) as CaseDetailResponse;
      setDetail(payload.case);
    } catch (e) {
      setDetail(null);
      const message = friendlySuccessionError(e instanceof Error ? e.message : "Erreur");
      setToast({ type: "error", message });
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fStatus, fConcessionnaireId, fDecisionType, fDateFrom, fDateTo]);

  useEffect(() => {
    if (selectedCaseId) {
      void loadDetail(selectedCaseId);
    } else {
      setDetail(null);
    }
  }, [selectedCaseId]);

  useEffect(() => {
    let cancelled = false;
    setConcessionnairesLoading(true);
    setConcessionnairesError(null);
    void (async () => {
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "100", statut: "ACTIF" });
        const res = await fetch(`/api/concessionnaires?${params}`, { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Impossible de charger les concessionnaires");
        const data = (await res.json()) as { items: ConcessionnaireOption[] };
        const next = (data.items ?? []).slice();
        next.sort((a, b) => {
          const la = (a.nomComplet || a.raisonSociale || a.codePdv || a.id).trim();
          const lb = (b.nomComplet || b.raisonSociale || b.codePdv || b.id).trim();
          return la.localeCompare(lb, "fr", { sensitivity: "base" });
        });
        if (!cancelled) setConcessionnaires(next);
      } catch (e) {
        if (!cancelled) setConcessionnairesError(friendlySuccessionError(e instanceof Error ? e.message : "Erreur"));
      } finally {
        if (!cancelled) setConcessionnairesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const concFromUrl = searchParams.get("concessionnaireId")?.trim() ?? "";
  useEffect(() => {
    if (/^[a-f\d]{24}$/i.test(concFromUrl)) {
      setConcId(concFromUrl);
      setConcessionnaireQuickPick(concFromUrl);
      setManualConcIdOpen(false);
    }
  }, [concFromUrl]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      if (!acteDecesFile) {
        throw new Error("ACTE_DECES_REQUIRED");
      }
      const form = new FormData();
      form.set("concessionnaireId", concId.trim());
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
        const raw = b?.message ?? `Création impossible (HTTP ${res.status})`;
        throw new Error(friendlySuccessionError(raw));
      }
      setConcId("");
      setDateDeces("");
      setDeclComment("");
      setActeDecesFile(null);
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
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-6 shadow-sm">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-teal-200/20 blur-3xl" />

      <div className="relative mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-700">LONACI</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Décès & succession</h2>
          <p className="mt-1 text-sm text-slate-600">Workflow guidé en 5 étapes avec traçabilité et contrôles de validation.</p>
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
      <div className={`${cardClass} relative mb-5 grid gap-2 md:grid-cols-6`}>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as "" | "OUVERT" | "CLOTURE")} className={subtleFieldClass}>
          <option value="">Tous statuts</option>
          <option value="OUVERT">OUVERT</option>
          <option value="CLOTURE">CLOTURE</option>
        </select>
        <select value={fConcessionnaireId} onChange={(e) => setFConcessionnaireId(e.target.value)} className={subtleFieldClass}>
          <option value="">Tous concessionnaires</option>
          {concessionnaires.map((c) => (
            <option key={c.id} value={c.id}>{(c.nomComplet || c.raisonSociale || c.codePdv || c.id).trim()}</option>
          ))}
        </select>
        <select value={fDecisionType} onChange={(e) => setFDecisionType(e.target.value as "" | "TRANSFERT" | "RESILIATION")} className={subtleFieldClass}>
          <option value="">Toutes décisions</option>
          <option value="TRANSFERT">TRANSFERT</option>
          <option value="RESILIATION">RESILIATION</option>
        </select>
        <input type="date" value={fDateFrom} onChange={(e) => setFDateFrom(e.target.value)} className={subtleFieldClass} />
        <input type="date" value={fDateTo} onChange={(e) => setFDateTo(e.target.value)} className={subtleFieldClass} />
        <div className="flex gap-2">
          <a
            href={`/api/succession-cases/export?format=csv&${new URLSearchParams({
              ...(fStatus ? { status: fStatus } : {}),
              ...(fConcessionnaireId ? { concessionnaireId: fConcessionnaireId } : {}),
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
              ...(fConcessionnaireId ? { concessionnaireId: fConcessionnaireId } : {}),
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
        <div className="mb-5 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          <p className="font-semibold">Alerte 30 jours sans action ({stale.length})</p>
          <ul className="mt-2 list-inside list-disc text-xs text-amber-800">
            {stale.slice(0, 8).map((s) => (
              <li key={s.id}>
                {s.reference} — {s.daysInactive} j. — prochaine:{" "}
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
            onClick={() => !creating && setCreateOpen(false)}
            disabled={creating}
          />
          <div className="relative z-10 flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-indigo-50 px-4 py-2">
              <div>
                <h3 id="create-succession-title" className="text-sm font-semibold text-slate-900">
                  Ouvrir un dossier décès & succession
                </h3>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                  Concessionnaire, date du décès, acte scanné et commentaire initial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !creating && setCreateOpen(false)}
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
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Concessionnaire (ACTIF) *</span>
                    <select
                      required
                      aria-label="Concessionnaire actif"
                      value={concessionnaireQuickPick}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConcessionnaireQuickPick(v);
                        setConcId(v);
                        setManualConcIdOpen(false);
                      }}
                      disabled={concessionnairesLoading}
                      className={fieldClass}
                    >
                      <option value="">
                        {concessionnairesLoading ? "Chargement des concessionnaires…" : "— Sélectionner —"}
                      </option>
                      {concessionnaires.map((c) => {
                        const label = (c.nomComplet || c.raisonSociale || c.codePdv || c.id).trim();
                        return (
                          <option key={c.id} value={c.id}>
                            {label} · {c.id.slice(0, 8)}…
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {concessionnairesError ? <p className="text-xs text-rose-700">{concessionnairesError}</p> : null}
                  <button
                    type="button"
                    onClick={() => {
                      setManualConcIdOpen((v) => !v);
                      setConcessionnaireQuickPick("");
                    }}
                    className="w-fit text-[11px] font-medium text-cyan-700 underline underline-offset-2 opacity-90 hover:opacity-100"
                  >
                    {manualConcIdOpen ? "Masquer la saisie manuelle" : "Saisie manuelle (coller un ID)"}
                  </button>
                  {manualConcIdOpen ? (
                    <input
                      required
                      value={concId}
                      onChange={(e) => {
                        setConcId(e.target.value);
                        setConcessionnaireQuickPick("");
                      }}
                      placeholder="Coller l’ID concessionnaire"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                      aria-label="ID concessionnaire (saisie libre)"
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
                onClick={() => setCreateOpen(false)}
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
        <h3 className="text-sm font-semibold text-slate-900">Avancer une étape</h3>
        <p className="mt-1 text-xs text-slate-600">
          Renseignez l’ayant droit uniquement avant l’étape « Identification ayant droit ». Dernière étape : Chef(fe)
          de service uniquement (avec décision obligatoire transfert/résiliation).
        </p>
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
        <h3 className="text-sm font-semibold text-slate-900">Étape 3 — Documents collectés</h3>
        <p className="mt-1 text-xs text-slate-600">
          Ajouter au moins un document de succession avant la vérification juridique.
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
        <p className="mt-1 text-xs text-slate-600">Timeline complète des 5 étapes, acteurs et documents.</p>
        <div className="mt-2">
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className={fieldClass}
            aria-label="Dossier succession détail"
          >
            <option value="">— Sélectionner un dossier —</option>
            {items.map((x) => (
              <option key={x.id} value={x.id}>
                {x.reference} · {x.status}
              </option>
            ))}
          </select>
        </div>
        {detailLoading ? <p className="mt-3 text-xs text-slate-500">Chargement de la fiche...</p> : null}
        {detail ? (
          <div className="mt-3 space-y-3 text-xs text-slate-800">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="font-semibold">
                {detail.reference} — {detail.concessionnaire.codePdv} · {detail.concessionnaire.nomComplet}
              </p>
              <p className="text-slate-600">
                Dossier: {detail.status} · Concessionnaire: {detail.concessionnaire.statut} · Décès:{" "}
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
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="font-semibold">Documents</p>
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
                <th className="px-2 py-2">Statut</th>
                <th className="px-2 py-2">Progression</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="text-slate-900">
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 transition hover:bg-cyan-50/30">
                  <td className="px-2 py-2 font-mono text-xs">{row.reference}</td>
                  <td className="px-2 py-2 font-mono text-xs">{row.concessionnaireId}</td>
                  <td className="px-2 py-2">{row.status}</td>
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
                          disabled={advancingId === row.id}
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
              {!items.length ? (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-slate-500">
                    Aucun dossier succession.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
        <span>{total} dossier(s) · page {page}/{Math.max(1, Math.ceil(total / pageSize))}</span>
        <button type="button" onClick={() => void load(page - 1)} disabled={page <= 1} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm transition hover:bg-slate-50 disabled:opacity-40">Préc.</button>
        <button type="button" onClick={() => void load(page + 1)} disabled={page >= Math.max(1, Math.ceil(total / pageSize))} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm transition hover:bg-slate-50 disabled:opacity-40">Suiv.</button>
      </div>
    </section>
  );
}
