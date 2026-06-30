"use client";

import DossierCompletIndicator from "@/components/lonaci/dossier-complet-indicator";
import { downloadLonaciPdf } from "@/lib/lonaci/download-pdf";
import { lonaciFetch } from "@/lib/lonaci-client-fetch";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import {
  contratStatutMetierBadgeClass,
  type ContratStatutMetier,
} from "@/lib/lonaci/contrat-statut-metier";
import {
  DOSSIER_CHECKLIST_STATUTS,
  DOSSIER_CHECKLIST_STATUT_LABELS,
  computeChecklistProgress,
  parseDocumentChecklistPayload,
} from "@/lib/lonaci/produit-document-checklist";
import {
  DECHARGE_DEFINITIVE_DESCRIPTION,
  DECHARGE_DEFINITIVE_MENTION,
  DECHARGE_DEFINITIVE_TITLE,
  DECHARGE_PROVISOIRE_DISCLAIMER,
} from "@/lib/lonaci/dossier-decharge-constants";
import {
  CONTRAT_GENERATION_STEPS,
  CONTRAT_GENERATION_SUMMARY,
} from "@/lib/lonaci/contrat-generation-constants";
import type { DossierDocumentChecklistStatut } from "@/lib/lonaci/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type ChecklistDossierPatch = {
  payload: Record<string, unknown>;
  status?: string;
  updatedAt?: string;
  statutMetier?: ContratStatutMetier;
  statutMetierLabel?: string;
  statutMetierDescription?: string;
  cautionPaid?: boolean;
  dechargeDefinitiveEligible?: boolean;
  cautionPaymentReference?: string | null;
  hasContratGenere?: boolean;
  contratArchive?: boolean;
};

type DossierApiBody = {
  payload: Record<string, unknown>;
  status?: string;
  updatedAt?: string;
  statutMetier?: ContratStatutMetier;
  statutMetierLabel?: string;
  statutMetierDescription?: string;
  cautionPaid?: boolean;
  dechargeDefinitiveEligible?: boolean;
  cautionPaymentReference?: string | null;
  hasContratGenere?: boolean;
  contratArchive?: boolean;
};

function patchFromDossierResponse(dossier: DossierApiBody): ChecklistDossierPatch {
  return {
    payload: dossier.payload,
    status: dossier.status,
    updatedAt: dossier.updatedAt,
    statutMetier: dossier.statutMetier,
    statutMetierLabel: dossier.statutMetierLabel,
    statutMetierDescription: dossier.statutMetierDescription,
    cautionPaid: dossier.cautionPaid,
    dechargeDefinitiveEligible: dossier.dechargeDefinitiveEligible,
    cautionPaymentReference: dossier.cautionPaymentReference ?? null,
    hasContratGenere: dossier.hasContratGenere,
    contratArchive: dossier.contratArchive,
  };
}

type CautionByProduitRow = {
  produitCode: string;
  cautionPaid: boolean;
  paymentReference: string | null;
  referenceLabel: string;
};

type Props = {
  dossierId: string;
  payload: Record<string, unknown>;
  editable: boolean;
  /** Permet « Générer le contrat » même en lecture seule (ex. dossier déjà soumis). */
  canGenererContrat?: boolean;
  cautionPaid?: boolean;
  cautionsByProduit?: CautionByProduitRow[];
  dechargeDefinitiveEligible?: boolean;
  cautionPaymentReference?: string | null;
  dossierStatus?: string;
  hasContratGenere?: boolean;
  contratArchive?: boolean;
  statutMetier?: ContratStatutMetier;
  statutMetierLabel?: string;
  statutMetierDescription?: string;
  onUpdated: (patch: ChecklistDossierPatch) => void;
};

async function triggerPdfDownload(url: string, filename: string, setError: (msg: string) => void) {
  try {
    await downloadLonaciPdf(url, filename);
  } catch (err) {
    setError(friendlyErrorMessage(err instanceof Error ? err.message : "Téléchargement impossible."));
  }
}

function statutBadgeClass(statut: DossierDocumentChecklistStatut): string {
  switch (statut) {
    case "FOURNI":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "MANQUANT":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "EN_ATTENTE":
      return "bg-amber-100 text-amber-900 border-amber-200";
  }
}

export default function DossierDocumentChecklistBlock({
  dossierId,
  payload,
  editable,
  canGenererContrat,
  cautionPaid,
  cautionsByProduit,
  dechargeDefinitiveEligible,
  cautionPaymentReference,
  dossierStatus,
  hasContratGenere: hasContratGenereProp,
  contratArchive,
  statutMetier,
  statutMetierLabel,
  statutMetierDescription,
  onUpdated,
}: Props) {
  const showGenererContrat = canGenererContrat ?? editable;
  const checklist = useMemo(() => parseDocumentChecklistPayload(payload), [payload]);
  const [localStatuts, setLocalStatuts] = useState<Record<string, DossierDocumentChecklistStatut>>({});
  const [saving, setSaving] = useState(false);
  const [generatingContrat, setGeneratingContrat] = useState(false);
  const [contratMessage, setContratMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasContratGenere = hasContratGenereProp ?? Boolean(
    payload?.contratGenere && typeof payload.contratGenere === "object",
  );
  const contratGenere = hasContratGenere && payload?.contratGenere && typeof payload.contratGenere === "object"
    ? (payload.contratGenere as Record<string, unknown>)
    : null;
  const contratReferencePreview =
    typeof contratGenere?.referenceContratPreview === "string"
      ? contratGenere.referenceContratPreview
      : null;

  useEffect(() => {
    if (!checklist) {
      setLocalStatuts({});
      return;
    }
    const map: Record<string, DossierDocumentChecklistStatut> = {};
    for (const e of checklist.entries) {
      map[e.itemId] = e.statut;
    }
    setLocalStatuts(map);
  }, [checklist]);

  const progress = useMemo(() => {
    if (!checklist?.entries.length) {
      return { complet: true, obligatoiresFournis: 0, obligatoiresTotal: 0 };
    }
    return computeChecklistProgress(checklist.entries, localStatuts);
  }, [checklist, localStatuts]);

  const canDownloadDechargeDefinitive =
    dechargeDefinitiveEligible !== undefined ? dechargeDefinitiveEligible : progress.complet;
  const showDechargeDefinitiveHint =
    progress.complet && dechargeDefinitiveEligible === false;

  const saveStatuts = useCallback(
    async (nextMap: Record<string, DossierDocumentChecklistStatut>) => {
      if (!checklist?.entries.length) return;
      setSaving(true);
      setError(null);
      try {
        const res = await lonaciFetch(`/api/dossiers/${dossierId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentChecklist: checklist.entries.map((e) => ({
              itemId: e.itemId,
              statut: nextMap[e.itemId] ?? e.statut,
            })),
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          message?: string;
          dossier?: DossierApiBody;
        } | null;
        if (!res.ok || !body?.dossier) {
          setError(friendlyErrorMessage(body?.message ?? "Enregistrement checklist impossible."));
          return;
        }
        onUpdated(patchFromDossierResponse(body.dossier));
      } catch {
        setError("Erreur réseau ou serveur.");
      } finally {
        setSaving(false);
      }
    },
    [checklist, dossierId, onUpdated],
  );

  function onStatutChange(itemId: string, statut: DossierDocumentChecklistStatut) {
    const nextMap = { ...localStatuts, [itemId]: statut };
    setLocalStatuts(nextMap);
    if (editable) {
      void saveStatuts(nextMap);
    }
  }

  async function onGenererContrat() {
    setGeneratingContrat(true);
    setContratMessage(null);
    setError(null);
    try {
      const res = await lonaciFetch(`/api/dossiers/${dossierId}/generer-contrat`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        dossier?: DossierApiBody;
        submitted?: boolean;
      } | null;
      if (!res.ok || !body?.dossier) {
        setError(friendlyErrorMessage(body?.message ?? "Génération du contrat impossible."));
        return;
      }
      onUpdated(patchFromDossierResponse(body.dossier));
      setContratMessage(
        body.submitted
          ? "Contrat généré et dossier soumis au circuit de validation (4 niveaux)."
          : "Contrat déjà généré — téléchargeable ci-dessous.",
      );
    } catch {
      setError("Erreur réseau ou serveur.");
    } finally {
      setGeneratingContrat(false);
    }
  }

  if (!checklist || !checklist.entries.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-600">
          Aucune checklist de documents configurée pour ce produit. Configurez-la dans Paramètres → Produits.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <DossierCompletIndicator
        complet={progress.complet}
        size="banner"
        live={editable}
        obligatoiresFournis={progress.obligatoiresFournis}
        obligatoiresTotal={progress.obligatoiresTotal}
        className="mb-3"
      />
      {statutMetier && statutMetierLabel ? (
        <div
          className={`mb-3 rounded-lg border px-2.5 py-2 text-[11px] ${contratStatutMetierBadgeClass(statutMetier)}`}
          title={statutMetierDescription ?? ""}
        >
          <p className="font-semibold">{statutMetierLabel}</p>
          {statutMetierDescription ? <p className="mt-0.5 opacity-90">{statutMetierDescription}</p> : null}
        </div>
      ) : null}
      {cautionsByProduit && cautionsByProduit.length > 1 ? (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-800">
          <p className="font-semibold text-slate-700">Cautions par produit</p>
          <ul className="mt-1 space-y-0.5">
            {cautionsByProduit.map((c) => (
              <li key={c.produitCode} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium">{c.produitCode}</span>
                <span className={c.cautionPaid ? "text-emerald-700" : "text-amber-800"}>
                  {c.cautionPaid ? "Payée" : "En attente"}
                </span>
                {c.paymentReference ? (
                  <span className="text-slate-500">réf. {c.paymentReference}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Checklist documents</p>
          <p className="text-[11px] text-slate-500">Suivi obligatoire lors de la constitution du dossier.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DossierCompletIndicator
            complet={progress.complet}
            size="sm"
            live={editable}
            obligatoiresFournis={progress.obligatoiresFournis}
            obligatoiresTotal={progress.obligatoiresTotal}
          />
          <button
            type="button"
            onClick={() =>
              void triggerPdfDownload(
                `/api/dossiers/${dossierId}/checklist/pdf`,
                `checklist-${dossierId}.pdf`,
                setError,
              )
            }
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            PDF checklist
          </button>
          {!progress.complet ? (
            <button
              type="button"
              onClick={() =>
                void triggerPdfDownload(
                  `/api/dossiers/${dossierId}/decharge-provisoire/pdf`,
                  `decharge-provisoire-${dossierId}.pdf`,
                  setError,
                )
              }
              className="rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100"
              title={DECHARGE_PROVISOIRE_DISCLAIMER}
            >
              Décharge provisoire (PDF)
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!canDownloadDechargeDefinitive}
                onClick={() =>
                  void triggerPdfDownload(
                    `/api/dossiers/${dossierId}/decharge-definitive/pdf`,
                    `decharge-definitive-${dossierId}.pdf`,
                    setError,
                  )
                }
                className="rounded-lg border border-emerald-500 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                title={
                  canDownloadDechargeDefinitive
                    ? `${DECHARGE_DEFINITIVE_TITLE} — ${DECHARGE_DEFINITIVE_MENTION}`
                    : "Checklist complète requise, caution payée et référence de paiement renseignée"
                }
              >
                Décharge définitive (PDF)
              </button>
              {showGenererContrat && !hasContratGenere ? (
                <button
                  type="button"
                  disabled={generatingContrat}
                  onClick={() => void onGenererContrat()}
                  className="rounded-lg border border-cyan-600 bg-cyan-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                >
                  {generatingContrat ? "Génération…" : "Générer le contrat"}
                </button>
              ) : null}
              {hasContratGenere ? (
                <button
                  type="button"
                  onClick={() =>
                    void triggerPdfDownload(
                      `/api/contrats/${dossierId}/contrat/pdf`,
                      `contrat-${dossierId}.pdf`,
                      setError,
                    )
                  }
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-900"
                >
                  {contratArchive ? "Contrat archivé (PDF)" : "Contrat (PDF)"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {error ? <p className="mb-2 text-xs text-rose-700">{error}</p> : null}
      {saving ? <p className="mb-2 text-xs text-slate-500">Enregistrement…</p> : null}
      {!progress.complet ? (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
          {DECHARGE_PROVISOIRE_DISCLAIMER}
        </p>
      ) : (
        <div className="mb-2 space-y-2">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-900">
            <span className="font-semibold">{DECHARGE_DEFINITIVE_TITLE}</span>
            {" — "}
            {DECHARGE_DEFINITIVE_DESCRIPTION}
          </p>
          {showDechargeDefinitiveHint ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
              {cautionPaid === false
                ? "Caution non payée : la décharge définitive sera disponible après encaissement et saisie de la référence de paiement."
                : cautionPaymentReference
                  ? "Référence de paiement manquante sur la caution liée — complétez-la dans le module Cautions."
                  : "Conditions non remplies pour la décharge définitive (caution payée + référence de paiement)."}
            </p>
          ) : canDownloadDechargeDefinitive && cautionPaymentReference ? (
            <p className="rounded-lg border border-emerald-300/80 bg-white px-2 py-1.5 text-[11px] text-emerald-950">
              <span className="font-semibold">Réf. paiement caution :</span> {cautionPaymentReference}
            </p>
          ) : null}
          <p className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-2 py-1.5 text-[11px] text-emerald-900">
            Générez la décharge définitive puis le contrat. Le dossier suit le circuit de validation à 4 niveaux ;
            à la finalisation, le concessionnaire devient actif.
          </p>
          <div className="rounded-lg border border-cyan-200 bg-cyan-50/50 px-2.5 py-2 text-[11px] text-cyan-950">
            <p className="font-semibold">{CONTRAT_GENERATION_SUMMARY}</p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
              {CONTRAT_GENERATION_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          {hasContratGenere ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-800">
              Contrat généré
              {contratReferencePreview ? ` — réf. ${contratReferencePreview}` : ""}
              {dossierStatus ? ` · étape dossier : ${dossierStatus}` : ""}
              {contratArchive ? " · PDF archivé après validation finale" : ""}
            </p>
          ) : null}
        </div>
      )}
      {contratMessage ? (
        <p className="mb-2 rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1.5 text-[11px] text-cyan-900">
          {contratMessage}
        </p>
      ) : null}

      <ul className="space-y-2">
        {checklist.entries.map((entry) => {
          const statut = localStatuts[entry.itemId] ?? entry.statut;
          return (
            <li
              key={entry.itemId}
              className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{entry.libelle}</p>
                {entry.obligatoire ? (
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Obligatoire</p>
                ) : (
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Facultatif</p>
                )}
              </div>
              {editable ? (
                <div className="flex flex-wrap gap-1">
                  {DOSSIER_CHECKLIST_STATUTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={saving}
                      onClick={() => onStatutChange(entry.itemId, s)}
                      className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                        statut === s ? statutBadgeClass(s) : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {DOSSIER_CHECKLIST_STATUT_LABELS[s]}
                    </button>
                  ))}
                </div>
              ) : (
                <span className={`rounded-md border px-2 py-1 text-[11px] font-medium ${statutBadgeClass(statut)}`}>
                  {DOSSIER_CHECKLIST_STATUT_LABELS[statut]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
