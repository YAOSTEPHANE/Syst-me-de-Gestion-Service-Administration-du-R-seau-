"use client";

import DossierDocumentChecklistBlock from "@/components/lonaci/dossier-document-checklist-block";
import { userMayPatchDossierPayload } from "@/lib/auth/dossier-transition-rbac";
import { lonaciFetch } from "@/lib/lonaci-client-fetch";
import type { ContratStatutMetier } from "@/lib/lonaci/contrat-statut-metier";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

/** Aligné sur la réponse GET/PATCH `/api/dossiers/[id]`. */
export type DossierContratActualisationDetail = {
  id: string;
  reference: string;
  status: string;
  type: string;
  concessionnaireId: string | null;
  lonaciClientId?: string | null;
  agenceId: string | null;
  payload: Record<string, unknown>;
  history: Array<{
    status: string;
    actedByUserId: string;
    actedAt: string;
    comment: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
  statutMetier?: ContratStatutMetier;
  statutMetierLabel?: string;
  statutMetierDescription?: string;
  produitCodes?: string[];
  cautionsByProduit?: Array<{
    produitCode: string;
    cautionPaid: boolean;
    paymentReference: string | null;
    referenceLabel: string;
  }>;
};

type ContratActifOption = { id: string; reference: string; produitCode: string; status: string };

function strPayload(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function getPayloadProduitCodes(p: Record<string, unknown>): string[] {
  const raw = p.produitCodes;
  if (Array.isArray(raw)) {
    const codes = raw
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (codes.length) return [...new Set(codes)];
  }
  const single = strPayload(p, "produitCode");
  return single ? [single.trim().toUpperCase()] : [];
}

function dateInputFromIso(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

type Props = {
  /** Détail dossier : le payload est typé `unknown` côté liste ; on le traite comme objet clé-valeur. */
  dossier: Omit<DossierContratActualisationDetail, "payload"> & { payload: unknown };
  meRole: string | null;
  onUpdated: (dossier: DossierContratActualisationDetail) => void;
};

function asPayloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

export default function DossierContratActualisationForm({ dossier, meRole, onUpdated }: Props) {
  const p = asPayloadRecord(dossier.payload);
  const [produitCode, setProduitCode] = useState(() => strPayload(p, "produitCode"));
  const [operationType, setOperationType] = useState<"NOUVEAU" | "ACTUALISATION">(() =>
    strPayload(p, "operationType") === "ACTUALISATION" ? "ACTUALISATION" : "NOUVEAU",
  );
  const [dateEffet, setDateEffet] = useState(() =>
    dateInputFromIso(strPayload(p, "dateEffet") || strPayload(p, "dateOperation")),
  );
  const [parentContratId, setParentContratId] = useState(() => strPayload(p, "parentContratId"));
  const [observations, setObservations] = useState(() => strPayload(p, "observations"));
  const [commentaire, setCommentaire] = useState(() => strPayload(p, "commentaire"));
  const [parentsActifs, setParentsActifs] = useState<ContratActifOption[]>([]);
  const [parentsLoading, setParentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetFromDossier = useCallback(() => {
    const pl = asPayloadRecord(dossier.payload);
    setProduitCode(strPayload(pl, "produitCode"));
    setOperationType(strPayload(pl, "operationType") === "ACTUALISATION" ? "ACTUALISATION" : "NOUVEAU");
    setDateEffet(dateInputFromIso(strPayload(pl, "dateEffet") || strPayload(pl, "dateOperation")));
    setParentContratId(strPayload(pl, "parentContratId"));
    setObservations(strPayload(pl, "observations"));
    setCommentaire(strPayload(pl, "commentaire"));
  }, [dossier.payload]);

  useEffect(() => {
    resetFromDossier();
  }, [dossier.id, resetFromDossier]);

  useEffect(() => {
    const partyId = dossier.lonaciClientId?.trim() || dossier.concessionnaireId?.trim();
    if (operationType !== "ACTUALISATION" || !partyId || !produitCode.trim()) {
      setParentsActifs([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setParentsLoading(true);
      setParentsActifs([]);
      try {
        const params = new URLSearchParams({
          page: "1",
          pageSize: "100",
          produitCode: produitCode.trim().toUpperCase(),
        });
        if (dossier.lonaciClientId?.trim()) {
          params.set("lonaciClientId", dossier.lonaciClientId.trim());
        } else if (dossier.concessionnaireId?.trim()) {
          params.set("concessionnaireId", dossier.concessionnaireId.trim());
        }
        const res = await lonaciFetch(`/api/contrats?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items: ContratActifOption[] };
        if (!cancelled) {
          setParentsActifs((data.items ?? []).filter((c) => c.status === "ACTIF"));
        }
      } finally {
        if (!cancelled) setParentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operationType, dossier.concessionnaireId, dossier.lonaciClientId, produitCode]);

  useEffect(() => {
    if (operationType !== "ACTUALISATION" || parentsActifs.length !== 1) return;
    setParentContratId((prev) => (prev && parentsActifs.some((c) => c.id === prev) ? prev : parentsActifs[0].id));
  }, [operationType, parentsActifs]);

  useEffect(() => {
    if (operationType !== "ACTUALISATION") return;
    setParentContratId((prev) => {
      if (!prev) return prev;
      if (parentsActifs.some((c) => c.id === prev)) return prev;
      return "";
    });
  }, [operationType, parentsActifs]);

  const canEdit = userMayPatchDossierPayload(meRole);
  const produitCodes = getPayloadProduitCodes(p);
  const multiProduits = produitCodes.length > 1;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError(null);
    const d = new Date(`${dateEffet}T12:00:00`);
    if (!dateEffet.trim() || Number.isNaN(d.getTime())) {
      setError("Indiquez une date d’effet valide.");
      return;
    }
    if (!produitCode.trim()) {
      setError("Le code produit est obligatoire.");
      return;
    }
    if (operationType === "ACTUALISATION" && !parentContratId.trim()) {
      setError("Sélectionnez le contrat d’origine pour une actualisation.");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        produitCode: produitCode.trim().toUpperCase(),
        operationType,
        dateEffet: d.toISOString(),
        observations: observations.trim() || null,
        commentaire: commentaire.trim() || null,
      };
      if (operationType === "ACTUALISATION") {
        body.parentContratId = parentContratId.trim();
      } else {
        body.parentContratId = null;
      }

      const res = await lonaciFetch(`/api/dossiers/${encodeURIComponent(dossier.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as
        | { dossier?: DossierContratActualisationDetail; message?: string }
        | null;
      if (!res.ok) {
        throw new Error(json?.message ?? "Enregistrement impossible.");
      }
      if (!json?.dossier) {
        throw new Error("Réponse inattendue du serveur.");
      }
      onUpdated(json.dossier);
    } catch (err) {
      setError(friendlyErrorMessage(err instanceof Error ? err.message : "Erreur"));
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] text-slate-500">
          Votre rôle ne permet pas de modifier le contenu de ce dossier (habilitation « mise à jour dossiers » requise).
        </p>
        <DossierDocumentChecklistBlock
          dossierId={dossier.id}
          payload={asPayloadRecord(dossier.payload)}
          editable={false}
          statutMetier={dossier.statutMetier}
          statutMetierLabel={dossier.statutMetierLabel}
          statutMetierDescription={dossier.statutMetierDescription}
          cautionsByProduit={dossier.cautionsByProduit}
          onUpdated={() => {}}
        />
      </div>
    );
  }

  const payloadRecord = asPayloadRecord(dossier.payload);

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="space-y-2.5 rounded-xl border border-amber-200/90 bg-amber-50/50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
          Actualisation du dossier (brouillon / rejeté)
        </p>
      <p className="text-[11px] text-amber-950/80">
        Les modifications sont enregistrées immédiatement. Elles sont soumises aux mêmes règles métier qu’à la création
        (produit autorisé, contrat parent actif pour une actualisation, etc.).
      </p>
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900" role="alert">
          {error}
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {multiProduits ? (
          <div className="sm:col-span-2 rounded-lg border border-cyan-200 bg-cyan-50/60 px-3 py-2">
            <p className="text-xs font-medium text-cyan-950">Produits du dossier</p>
            <p className="mt-1 text-[11px] text-cyan-900">{produitCodes.join(" · ")}</p>
            <p className="mt-1 text-[11px] text-cyan-800/90">
              Pour ajouter un produit, utilisez la création de contrat : le dossier brouillon existant sera complété
              automatiquement.
            </p>
          </div>
        ) : null}
        <label className="grid gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-800">
            {multiProduits ? "Produit principal (référence)" : "Code produit *"}
          </span>
          <input
            className={inputClass}
            value={produitCode}
            onChange={(e) => setProduitCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            readOnly={multiProduits}
            aria-readonly={multiProduits}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-800">Type d’opération *</span>
          <select
            className={inputClass}
            value={operationType}
            onChange={(e) => setOperationType(e.target.value as "NOUVEAU" | "ACTUALISATION")}
          >
            <option value="NOUVEAU">Nouveau contrat</option>
            <option value="ACTUALISATION">Actualisation d’annexe</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-800">Date d’effet *</span>
          <input type="date" className={inputClass} value={dateEffet} onChange={(e) => setDateEffet(e.target.value)} />
        </label>
        {operationType === "ACTUALISATION" ? (
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-xs font-medium text-slate-800">Contrat d’origine (actif) *</span>
            <select
              className={inputClass}
              value={parentContratId}
              onChange={(e) => setParentContratId(e.target.value)}
              disabled={parentsLoading || parentsActifs.length === 0}
            >
              <option value="">
                {parentsLoading
                  ? "Chargement…"
                  : parentsActifs.length === 0
                    ? "Aucun contrat actif pour ce PDV et ce produit"
                    : "— Choisir —"}
              </option>
              {parentsActifs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.reference} · {c.produitCode}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-800">Observations</span>
          <textarea
            className={`min-h-16 ${inputClass}`}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={2}
          />
        </label>
        <label className="grid gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-800">Commentaire interne</span>
          <textarea
            className={`min-h-16 ${inputClass}`}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={2}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg border border-amber-800 bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-950 disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => resetFromDossier()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Réinitialiser le formulaire
        </button>
      </div>
      </form>
      <DossierDocumentChecklistBlock
        dossierId={dossier.id}
        payload={payloadRecord}
        editable
        canGenererContrat
        statutMetier={dossier.statutMetier}
        statutMetierLabel={dossier.statutMetierLabel}
        statutMetierDescription={dossier.statutMetierDescription}
        cautionsByProduit={dossier.cautionsByProduit}
        onUpdated={(patch) =>
          onUpdated({
            ...dossier,
            payload: patch.payload,
            status: patch.status ?? dossier.status,
            updatedAt: patch.updatedAt ?? dossier.updatedAt,
            statutMetier: patch.statutMetier ?? dossier.statutMetier,
            statutMetierLabel: patch.statutMetierLabel ?? dossier.statutMetierLabel,
            statutMetierDescription:
              patch.statutMetierDescription ?? dossier.statutMetierDescription,
          })
        }
      />
    </div>
  );
}
