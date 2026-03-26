"use client";

import Link from "next/link";
import {
  LONACI_ROLES,
  CONCESSIONNAIRE_STATUT_LABELS,
  CONCESSIONNAIRE_STATUTS,
  type ConcessionnaireStatut,
} from "@/lib/lonaci/constants";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TabId = "fiche" | "contrats" | "historique" | "pieces";

interface AgenceRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

interface ProduitRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

interface PieceMeta {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedByUserId: string;
}

interface ConcessionnaireDetail {
  id: string;
  codePdv: string;
  nomComplet: string;
  raisonSociale: string;
  cniNumero: string | null;
  photoUrl: string | null;
  email: string | null;
  telephonePrincipal: string | null;
  telephoneSecondaire: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
  statut: string;
  statutBancarisation: string;
  compteBancaire: string | null;
  gps: { lat: number; lng: number } | null;
  piecesJointes: PieceMeta[];
  notesInternes: string | null;
  observations: string | null;
}

interface AuditItem {
  id: string;
  action: string;
  userId: string;
  /** Prénom, nom et e-mail si l’utilisateur existe encore en base */
  userDisplay: string | null;
  details: Record<string, unknown> | null;
  /** Résumé en français (champs modifiés, pièces, etc.) */
  detailsHuman: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Création de la fiche",
  UPDATE: "Mise à jour",
  DEACTIVATE: "Désactivation (fiche conservée, jamais de suppression définitive)",
  PIECE_ADD: "Pièce jointe ajoutée",
  PIECE_REMOVE: "Pièce retirée du dossier",
};

function isFicheGelee(statut: string): boolean {
  return statut === "RESILIE" || statut === "DECEDE";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function labelOperationTypeContrat(t: string) {
  if (t === "ACTUALISATION") return "Actualisation";
  if (t === "NOUVEAU") return "Nouveau";
  return t;
}

function labelContratStatut(s: string) {
  if (s === "ACTIF") return "Actif";
  if (s === "RESILIE") return "Résilié";
  return s;
}

function labelDossierEtape(status: string) {
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
    default:
      return status;
  }
}

interface ContratListeRow {
  id: string;
  reference: string;
  produitCode: string;
  operationType: string;
  status: string;
  dateEffet: string;
  dossierId: string;
  dateDepot?: string;
  dossierEtape?: string;
}

/** Dossier contrat (Mongo) non finalisé — renvoyé par GET /api/contrats avec `concessionnaireId`. */
interface DossierContratListeRef {
  id: string;
  reference: string;
  status: string;
  updatedAt: string;
}

function isContratActifRow(c: ContratListeRow): boolean {
  return c.status === "ACTIF";
}

/** Dossier dont le flux n’est pas terminé (pas encore de ligne Prisma « contrat »). */
function isDossierContratEnAttente(d: { status: string }): boolean {
  return d.status !== "FINALISE";
}

export interface ConcessionnaireFicheModalProps {
  open: boolean;
  concessionnaireId: string | null;
  initialTab?: TabId;
  onClose: () => void;
  agences: AgenceRef[];
  produits: ProduitRef[];
  me: { agenceId: string | null; role: string } | null;
  isAgenceProfileFixed: boolean;
  onSaved: () => void;
}

export default function ConcessionnaireFicheModal({
  open,
  concessionnaireId,
  initialTab = "fiche",
  onClose,
  agences,
  produits,
  me,
  isAgenceProfileFixed,
  onSaved,
}: ConcessionnaireFicheModalProps) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConcessionnaireDetail | null>(null);

  const [nomComplet, setNomComplet] = useState("");
  const [cniNumero, setCniNumero] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [telSecondary, setTelSecondary] = useState("");
  const [adresse, setAdresse] = useState("");
  const [ville, setVille] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [agenceId, setAgenceId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [produitsAutorises, setProduitsAutorises] = useState<string[]>([]);
  const [statut, setStatut] = useState<string>("ACTIF");
  const [statutBancarisation, setStatutBancarisation] = useState<string>("NON_BANCARISE");
  const [compteBancaire, setCompteBancaire] = useState("");
  const [observations, setObservations] = useState("");
  const [notesInternes, setNotesInternes] = useState("");

  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);

  const [pieceUploading, setPieceUploading] = useState(false);
  const [pieceKind, setPieceKind] = useState<"PHOTO" | "DOCUMENT">("DOCUMENT");
  const [removingPieceId, setRemovingPieceId] = useState<string | null>(null);

  const [contratsItems, setContratsItems] = useState<ContratListeRow[]>([]);
  const [dossiersContratEnAttente, setDossiersContratEnAttente] = useState<DossierContratListeRef[]>([]);
  const [contratsTotal, setContratsTotal] = useState(0);
  const [contratsLoading, setContratsLoading] = useState(false);
  const [contratsError, setContratsError] = useState<string | null>(null);

  const canDeactivate = me?.role === "ASSIST_CDS" || me?.role === "CHEF_SERVICE";
  const canChangeAgence = me?.role === "CHEF_SERVICE";
  const chefService = me?.role === "CHEF_SERVICE";

  /** Actives pour les nouveaux choix ; inclut toujours l’agence actuelle si elle est inactive (sinon la liste déroulante ne peut pas afficher la valeur). */
  const agencesPourSelect = useMemo(() => {
    const actives = agences.filter((a) => a.actif);
    const sorted = [...actives].sort((a, b) =>
      a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }),
    );
    const cur = agenceId.trim();
    if (cur && !sorted.some((a) => a.id === cur)) {
      const extra = agences.find((a) => a.id === cur);
      if (extra) {
        return [extra, ...sorted];
      }
      // Agence "orpheline" : l'ID existe sur la fiche mais plus dans le référentiel chargé.
      // Sans option correspondante, le <select> affiche vide même si value est défini.
      const placeholder: AgenceRef = {
        id: cur,
        code: "?",
        libelle: "Agence introuvable dans le référentiel",
        actif: false,
      };
      return [placeholder, ...sorted];
    }
    return sorted;
  }, [agences, agenceId]);

  const agenceRefCourante = useMemo(() => {
    const cur = agenceId.trim();
    if (!cur) return null;
    return agences.find((a) => a.id === cur) ?? null;
  }, [agences, agenceId]);

  const loadDetail = useCallback(async () => {
    if (!concessionnaireId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/concessionnaires/${concessionnaireId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Fiche inaccessible");
      }
      const data = (await res.json()) as { concessionnaire: ConcessionnaireDetail };
      const c = data.concessionnaire;
      setDetail(c);
      setNomComplet(c.nomComplet ?? "");
      setCniNumero(c.cniNumero ?? "");
      setEmail(c.email ?? "");
      setTel(c.telephonePrincipal ?? "");
      setTelSecondary(c.telephoneSecondaire ?? "");
      setAdresse(c.adresse ?? "");
      setVille(c.ville ?? "");
      setCodePostal(c.codePostal ?? "");
      setAgenceId(c.agenceId ?? "");
      setLat(c.gps != null ? String(c.gps.lat) : "");
      setLng(c.gps != null ? String(c.gps.lng) : "");
      setProduitsAutorises([...(c.produitsAutorises ?? [])]);
      setStatut(c.statut);
      setStatutBancarisation(c.statutBancarisation);
      setCompteBancaire(c.compteBancaire ?? "");
      setObservations(c.observations ?? "");
      setNotesInternes(c.notesInternes ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [concessionnaireId]);

  const loadAudit = useCallback(
    async (page: number, append: boolean) => {
      if (!concessionnaireId) return;
      setAuditLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "80",
        });
        const res = await fetch(`/api/concessionnaires/${concessionnaireId}/audit?${params}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: AuditItem[];
          total: number;
          page: number;
        };
        setAuditTotal(data.total);
        setAuditPage(data.page);
        setAuditItems((prev) => (append ? [...prev, ...data.items] : data.items));
      } finally {
        setAuditLoading(false);
      }
    },
    [concessionnaireId],
  );

  const loadContrats = useCallback(async () => {
    if (!concessionnaireId) return;
    setContratsLoading(true);
    setContratsError(null);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
        concessionnaireId,
      });
      const res = await fetch(`/api/contrats?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Liste des contrats indisponible");
      }
      const data = (await res.json()) as {
        items: ContratListeRow[];
        total: number;
        dossiers?: DossierContratListeRef[];
      };
      setContratsItems(data.items);
      setContratsTotal(data.total);
      const dossiers = Array.isArray(data.dossiers) ? data.dossiers : [];
      setDossiersContratEnAttente(dossiers.filter(isDossierContratEnAttente));
    } catch (e) {
      setContratsItems([]);
      setDossiersContratEnAttente([]);
      setContratsTotal(0);
      setContratsError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setContratsLoading(false);
    }
  }, [concessionnaireId]);

  useEffect(() => {
    if (!open || !concessionnaireId) return;
    setTab(initialTab);
    void loadDetail();
  }, [open, concessionnaireId, initialTab, loadDetail]);

  useEffect(() => {
    if (!open || tab !== "historique" || !concessionnaireId) return;
    void loadAudit(1, false);
  }, [open, tab, concessionnaireId, loadAudit]);

  useEffect(() => {
    if (!open || tab !== "contrats" || !concessionnaireId) return;
    void loadContrats();
  }, [open, tab, concessionnaireId, loadContrats]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (saving || deactivating || pieceUploading) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving, deactivating, pieceUploading]);

  const inputClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

  const gelee = detail ? isFicheGelee(detail.statut) : false;
  const canEditNotesWhenGelee =
    me != null && (LONACI_ROLES as readonly string[]).includes(me.role);
  const readOnlyFiche = Boolean(gelee && !canEditNotesWhenGelee);
  const notesOnlyMode = Boolean(gelee && canEditNotesWhenGelee);

  async function onSaveFiche(e: FormEvent) {
    e.preventDefault();
    if (!concessionnaireId || !detail) return;
    setSaving(true);
    setError(null);
    try {
      if (notesOnlyMode) {
        const res = await fetch(`/api/concessionnaires/${concessionnaireId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notesInternes: notesInternes.trim() ? notesInternes.trim() : null }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(b?.message ?? "Enregistrement impossible");
        }
        await res.json();
        onClose();
        queueMicrotask(() => onSaved());
        return;
      }

      if (readOnlyFiche) return;

      if (!nomComplet.trim() || nomComplet.trim().length < 2) {
        throw new Error("Le nom complet est obligatoire (2 caractères minimum).");
      }
      const cni = cniNumero.trim();
      if (cni.length > 0 && cni.length < 4) {
        throw new Error("Numéro CNI : au moins 4 caractères si renseigné.");
      }
      const la = Number(lat.replace(",", "."));
      const lo = Number(lng.replace(",", "."));
      if (Number.isNaN(la) || Number.isNaN(lo)) {
        throw new Error("Coordonnées GPS invalides.");
      }
      if (statutBancarisation === "BANCARISE" && !compteBancaire.trim()) {
        throw new Error("Le numéro de compte est obligatoire pour passer au statut BANCARISÉ.");
      }

      const telP = tel.trim();
      const telS = telSecondary.trim();
      const body: Record<string, unknown> = {
        nomComplet: nomComplet.trim(),
        cniNumero: cni.length ? cni : null,
        email: email.trim() ? email.trim() : null,
        telephonePrincipal: telP.length >= 8 ? telP : telP.length === 0 ? null : undefined,
        telephoneSecondaire: telS.length >= 8 ? telS : telS.length === 0 ? null : undefined,
        adresse: adresse.trim() ? adresse.trim() : null,
        ville: ville.trim() ? ville.trim() : null,
        codePostal: codePostal.trim() ? codePostal.trim() : null,
        agenceId: agenceId.trim() || null,
        produitsAutorises,
        statut,
        statutBancarisation,
        compteBancaire: compteBancaire.trim() || null,
        gps: { lat: la, lng: lo },
        observations: observations.trim() ? observations.trim() : null,
        notesInternes: notesInternes.trim() ? notesInternes.trim() : null,
      };

      if (body.telephonePrincipal === undefined) {
        throw new Error("Téléphone principal : au moins 8 chiffres, ou laisser vide.");
      }
      if (body.telephoneSecondaire === undefined) {
        throw new Error("Téléphone secondaire : au moins 8 chiffres, ou laisser vide.");
      }

      const res = await fetch(`/api/concessionnaires/${concessionnaireId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Enregistrement impossible");
      }
      await res.json();
      onClose();
      queueMicrotask(() => onSaved());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate() {
    if (!concessionnaireId || !detail) return;
    const ok = window.confirm(
      "Désactiver cette fiche ? Le statut passera à « Inactif ». Aucune suppression définitive : la fiche et l’historique restent consultables.",
    );
    if (!ok) return;
    setDeactivating(true);
    setError(null);
    try {
      const res = await fetch(`/api/concessionnaires/${concessionnaireId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Désactivation impossible");
      }
      await loadDetail();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDeactivating(false);
    }
  }

  async function onUploadPiece(file: File | null) {
    if (!concessionnaireId || !file || !detail) return;
    setPieceUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", pieceKind);
      const res = await fetch(`/api/concessionnaires/${concessionnaireId}/pieces`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Envoi impossible");
      }
      const data = (await res.json()) as { concessionnaire: ConcessionnaireDetail };
      setDetail(data.concessionnaire);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPieceUploading(false);
    }
  }

  async function onRemovePiece(pieceId: string) {
    if (!concessionnaireId) return;
    const ok = window.confirm(
      "Retirer cette pièce du dossier ? Le fichier sera supprimé du stockage (la fiche concessionnaire n’est jamais supprimée).",
    );
    if (!ok) return;
    setRemovingPieceId(pieceId);
    setError(null);
    try {
      const res = await fetch(`/api/concessionnaires/${concessionnaireId}/pieces/${pieceId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? "Retrait impossible");
      }
      const data = (await res.json()) as { concessionnaire: ConcessionnaireDetail | null };
      if (data.concessionnaire) setDetail(data.concessionnaire);
      else await loadDetail();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRemovingPieceId(null);
    }
  }

  if (!open || !concessionnaireId) return null;

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fiche-concessionnaire-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Fermer"
        disabled={saving || deactivating}
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(92vh,880px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h3 id="fiche-concessionnaire-title" className="text-lg font-semibold text-slate-900">
              Fiche concessionnaire
            </h3>
            {detail ? (
              <p className="mt-0.5 font-mono text-sm text-slate-600">
                {detail.codePdv}
                <span className="ml-2 font-sans text-slate-500">— code PDV non modifiable</span>
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-slate-500">Chargement…</p>
            )}
          </div>
          <button
            type="button"
            disabled={saving || deactivating}
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-slate-200 px-4 pt-2">
          {(
            [
              ["fiche", "Fiche & modification"],
              ["contrats", "Contrats"],
              ["historique", "Historique"],
              ["pieces", "Pièces jointes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-t-lg border border-b-0 px-3 py-2 text-sm font-medium transition ${
                tab === id
                  ? "border-slate-200 bg-white text-cyan-800"
                  : "border-transparent text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
            </div>
          ) : null}

          {loading ? <p className="text-sm text-slate-600">Chargement de la fiche…</p> : null}

          {!loading && detail && tab === "fiche" ? (
            <form onSubmit={onSaveFiche} className="grid gap-4">
              {readOnlyFiche ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Fiche en statut résilié ou décédé : les champs de la fiche sont en lecture seule. La modification des
                  notes internes est réservée aux comptes (agent, chef de section, assistant CDS, chef de
                  service) avec accès à ce point de vente.
                </p>
              ) : null}
              {notesOnlyMode ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Statut résilié ou décédé : seules les <strong>notes internes</strong> peuvent être modifiées.
                </p>
              ) : null}

              {!notesOnlyMode && !readOnlyFiche ? (
                <>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Nom complet *</span>
                    <input
                      required
                      value={nomComplet}
                      onChange={(e) => setNomComplet(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Numéro CNI</span>
                    <input value={cniNumero} onChange={(e) => setCniNumero(e.target.value)} className={inputClass} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">E-mail</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Téléphone principal</span>
                      <input
                        value={tel}
                        onChange={(e) => setTel(e.target.value)}
                        placeholder="Vide ou min. 8 caractères"
                        className={inputClass}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Téléphone secondaire</span>
                      <input
                        value={telSecondary}
                        onChange={(e) => setTelSecondary(e.target.value)}
                        placeholder="Vide ou min. 8 caractères"
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Adresse</span>
                    <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className={inputClass} />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Ville</span>
                      <input value={ville} onChange={(e) => setVille(e.target.value)} className={inputClass} />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Code postal</span>
                      <input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} className={inputClass} />
                    </label>
                  </div>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Agence de rattachement</span>
                    <select
                      value={agenceId}
                      onChange={(e) => setAgenceId(e.target.value)}
                      disabled={!canChangeAgence}
                      className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100`}
                    >
                      <option value="">—</option>
                      {agencesPourSelect.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.code} — {ag.libelle}
                          {!ag.actif ? " (inactive)" : ""}
                        </option>
                      ))}
                    </select>
                    {agenceId.trim() && !agenceRefCourante ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                        L’agence enregistrée sur cette fiche n’existe pas dans le référentiel chargé (référence{" "}
                        <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-900">
                          {agenceId.trim()}
                        </code>
                        ).{" "}
                        {canChangeAgence
                          ? "Choisissez une agence active pour corriger le rattachement."
                          : "Si le chef de service corrige le rattachement, l’agence pourra s’afficher normalement."}
                      </p>
                    ) : null}
                    {!canChangeAgence ? (
                      <span className="text-xs text-slate-500">
                        Changement d’agence : chef de service uniquement.
                        {isAgenceProfileFixed ? " Votre profil est rattaché à une agence." : ""}
                      </span>
                    ) : null}
                  </label>
                  <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
                    <p className="mb-2 text-xs font-medium text-slate-700">Produits autorisés</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {produits.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-xs text-slate-800">
                          <input
                            type="checkbox"
                            checked={produitsAutorises.includes(p.code)}
                            onChange={(e) =>
                              setProduitsAutorises((curr) =>
                                e.target.checked ? [...curr, p.code] : curr.filter((code) => code !== p.code),
                              )
                            }
                          />
                          <span>
                            {p.code} <span className="text-slate-500">({p.libelle})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Latitude GPS *</span>
                      <input value={lat} onChange={(e) => setLat(e.target.value)} className={inputClass} />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Longitude GPS *</span>
                      <input value={lng} onChange={(e) => setLng(e.target.value)} className={inputClass} />
                    </label>
                  </div>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Statut</span>
                    <select
                      value={statut}
                      onChange={(e) => setStatut(e.target.value)}
                      className={inputClass}
                    >
                      {CONCESSIONNAIRE_STATUTS.map((s) => (
                        <option key={s} value={s}>
                          {CONCESSIONNAIRE_STATUT_LABELS[s as ConcessionnaireStatut]}
                        </option>
                      ))}
                    </select>
                    {!chefService ? (
                      <span className="text-xs text-slate-500">
                        Passage en « Résilié » ou « Décédé » : chef de service uniquement (API).
                      </span>
                    ) : null}
                  </label>
                  <fieldset className="grid gap-2">
                    <legend className="text-xs font-medium text-slate-700">Bancarisation</legend>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["BANCARISE", "Oui"],
                          ["NON_BANCARISE", "Non"],
                          ["EN_COURS", "En cours"],
                        ] as const
                      ).map(([value, label]) => (
                        <label
                          key={value}
                          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                            statutBancarisation === value
                              ? "border-cyan-600 bg-cyan-50 text-cyan-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="statutBancarisation"
                            value={value}
                            checked={statutBancarisation === value}
                            onChange={() => setStatutBancarisation(value)}
                            className="h-4 w-4 shrink-0 border-slate-300 text-cyan-600 focus:ring-cyan-500"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Compte bancaire</span>
                    <input value={compteBancaire} onChange={(e) => setCompteBancaire(e.target.value)} className={inputClass} />
                    <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 text-[11px] text-cyan-900">
                      Le numéro de compte est obligatoire pour passer au statut BANCARISÉ.
                    </span>
                    <span className="text-[11px] text-slate-500">
                      ℹ Ce module est requis pour le plan de commissionnement structuré.
                    </span>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-700">Observations</span>
                    <textarea
                      value={observations}
                      onChange={(e) => setObservations(e.target.value)}
                      className={`min-h-24 ${inputClass}`}
                    />
                  </label>
                </>
              ) : null}

              {(canEditNotesWhenGelee || !readOnlyFiche) && (
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Notes internes</span>
                  <textarea
                    value={notesInternes}
                    onChange={(e) => setNotesInternes(e.target.value)}
                    disabled={readOnlyFiche}
                    className={`min-h-20 ${inputClass} disabled:bg-slate-100`}
                  />
                </label>
              )}

              {!readOnlyFiche ? (
                <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? "Enregistrement…" : "Enregistrer les modifications"}
                  </button>
                  {canDeactivate && !gelee && detail.statut !== "INACTIF" ? (
                    <button
                      type="button"
                      disabled={deactivating || saving}
                      onClick={() => void onDeactivate()}
                      className="rounded-lg border border-amber-600 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                    >
                      {deactivating ? "Désactivation…" : "Désactiver la fiche"}
                    </button>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    Aucune suppression définitive : la désactivation fixe le statut à « Inactif » et conserve
                    l’historique.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 text-xs">
                <Link href={`/contrats?concessionnaireId=${detail.id}`} className="text-emerald-700 hover:underline">
                  Contrats
                </Link>
                <Link href={`/dossiers?concessionnaireId=${detail.id}`} className="text-cyan-700 hover:underline">
                  Dossiers
                </Link>
                <Link
                  href={`/carte-pdv?concessionnaireId=${detail.id}${detail.agenceId ? `&agenceId=${encodeURIComponent(detail.agenceId)}` : ""}`}
                  className="text-violet-700 hover:underline"
                >
                  Carte PDV
                </Link>
              </div>
            </form>
          ) : null}

          {!loading && detail && tab === "contrats" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  Contrats enregistrés pour ce point de vente ({detail.codePdv}).
                </p>
                <Link
                  href={`/contrats?concessionnaireId=${encodeURIComponent(detail.id)}`}
                  className="text-sm font-medium text-emerald-700 hover:underline"
                >
                  Ouvrir la page Contrats
                </Link>
              </div>
              {contratsError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {contratsError}
                </div>
              ) : null}
              {contratsLoading ? (
                <p className="text-sm text-slate-500">Chargement des contrats…</p>
              ) : contratsItems.length === 0 && dossiersContratEnAttente.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun contrat pour ce concessionnaire.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-3 py-2.5">Code</th>
                        <th className="px-3 py-2.5">Produit</th>
                        <th className="px-3 py-2.5">Type</th>
                        <th className="px-3 py-2.5">Statut</th>
                        <th className="px-3 py-2.5">Validité</th>
                        <th className="px-3 py-2.5">Dossier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dossiersContratEnAttente.map((d) => (
                        <tr
                          key={`dossier-${d.id}`}
                          className="border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50/80"
                        >
                          <td className="px-3 py-2.5 text-slate-400">—</td>
                          <td className="px-3 py-2.5 text-slate-400">—</td>
                          <td className="px-3 py-2.5 text-slate-400">—</td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                              {labelDossierEtape(d.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-400">—</td>
                          <td className="px-3 py-2.5 text-slate-400">—</td>
                        </tr>
                      ))}
                      {contratsItems.map((c) => {
                        const actif = isContratActifRow(c);
                        return (
                          <tr key={c.id} className="border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50/80">
                            {actif ? (
                              <>
                                <td className="px-3 py-2.5 font-mono text-xs text-slate-900">{c.reference}</td>
                                <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{c.produitCode}</td>
                                <td className="px-3 py-2.5 text-slate-800">{labelOperationTypeContrat(c.operationType)}</td>
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                                    {labelContratStatut(c.status)}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                                  {formatShortDate(c.dateEffet)}
                                </td>
                                <td className="px-3 py-2.5 text-slate-700">
                                  {c.dossierEtape ? labelDossierEtape(c.dossierEtape) : "—"}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2.5 text-slate-400">—</td>
                                <td className="px-3 py-2.5 text-slate-400">—</td>
                                <td className="px-3 py-2.5 text-slate-400">—</td>
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                                    {labelContratStatut(c.status)}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-slate-400">—</td>
                                <td className="px-3 py-2.5 text-slate-400">—</td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!contratsLoading && (contratsItems.length > 0 || dossiersContratEnAttente.length > 0) ? (
                <p className="text-xs text-slate-500">
                  {[
                    dossiersContratEnAttente.length > 0
                      ? `${dossiersContratEnAttente.length} dossier${
                          dossiersContratEnAttente.length > 1 ? "s" : ""
                        } en attente de finalisation`
                      : null,
                    contratsItems.length > 0
                      ? `${contratsTotal} contrat${contratsTotal > 1 ? "s" : ""} au total${
                          contratsTotal > 100
                            ? " (affichage des 100 premiers — utilisez la page Contrats pour la pagination)"
                            : ""
                        }`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  .
                </p>
              ) : null}
            </div>
          ) : null}

          {!loading && detail && tab === "historique" ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Journal des opérations sur cette fiche ({auditTotal} événement{auditTotal > 1 ? "s" : ""}).
              </p>
              <ul className="relative space-y-0 border-l-2 border-cyan-200 pl-6">
                {auditItems.map((ev) => (
                  <li key={ev.id} className="relative pb-6 last:pb-0">
                    <span className="absolute -left-[9px] top-1.5 h-3 w-3 rounded-full border-2 border-cyan-500 bg-white" />
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {ACTION_LABELS[ev.action] ?? ev.action}
                        </span>
                        <time className="text-xs text-slate-500" dateTime={ev.createdAt}>
                          {new Date(ev.createdAt).toLocaleString("fr-FR")}
                        </time>
                      </div>
                      <p className="mt-1 text-xs text-slate-600" title={`Réf. technique : ${ev.userId}`}>
                        {ev.userDisplay ? (
                          <>
                            Par{" "}
                            <span className="font-medium text-slate-800">{ev.userDisplay}</span>
                          </>
                        ) : (
                          <>
                            Utilisateur introuvable ou compte supprimé — réf.{" "}
                            <code className="rounded bg-white px-1 text-[10px] text-slate-700">{ev.userId}</code>
                          </>
                        )}
                      </p>
                      {ev.detailsHuman ? (
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-slate-100 bg-white p-2 text-[11px] leading-relaxed text-slate-800">
                          {ev.detailsHuman}
                        </pre>
                      ) : null}
                      {ev.details && Object.keys(ev.details).length > 0 && !ev.detailsHuman ? (
                        <pre className="mt-2 max-h-32 overflow-auto rounded bg-white p-2 text-[11px] text-slate-700">
                          {JSON.stringify(ev.details, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {auditLoading ? <p className="text-sm text-slate-500">Chargement…</p> : null}
              {!auditLoading && auditItems.length < auditTotal ? (
                <button
                  type="button"
                  onClick={() => void loadAudit(auditPage + 1, true)}
                  className="text-sm font-medium text-cyan-700 hover:underline"
                >
                  Charger plus
                </button>
              ) : null}
              {!auditLoading && auditItems.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun événement enregistré.</p>
              ) : null}
            </div>
          ) : null}

          {!loading && detail && tab === "pieces" ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Documents PDF ou images (contrats, CNI, photos PDV…). Téléchargement authentifié via les liens
                ci-dessous.
              </p>
              {!gelee ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-wrap items-end gap-3">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Type</span>
                      <select
                        value={pieceKind}
                        onChange={(e) => setPieceKind(e.target.value as "PHOTO" | "DOCUMENT")}
                        className={inputClass}
                      >
                        <option value="DOCUMENT">Document (PDF, image)</option>
                        <option value="PHOTO">Photo PDV (met à jour l’aperçu liste si envoyée en photo)</option>
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Fichier</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        disabled={pieceUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          e.target.value = "";
                          void onUploadPiece(f);
                        }}
                        className="text-sm text-slate-600 file:mr-2 file:rounded file:border file:border-slate-300 file:bg-white file:px-2 file:py-1"
                      />
                    </label>
                  </div>
                  {pieceUploading ? <p className="text-xs text-slate-500">Téléversement…</p> : null}
                </div>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Statut résilié ou décédé : plus d’ajout ni de retrait de pièces. Téléchargement des fichiers existants
                  toujours possible.
                </p>
              )}
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                {detail.piecesJointes.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-slate-500">Aucune pièce jointe.</li>
                ) : (
                  detail.piecesJointes.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{p.filename}</p>
                        <p className="text-xs text-slate-500">
                          {p.kind} · {p.mimeType} · {formatBytes(p.size)} ·{" "}
                          {new Date(p.uploadedAt).toLocaleString("fr-FR")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <a
                          href={`/api/concessionnaires/${concessionnaireId}/pieces/${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-cyan-600 bg-white px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-50"
                        >
                          Ouvrir / télécharger
                        </a>
                        {!gelee ? (
                          <button
                            type="button"
                            disabled={removingPieceId === p.id}
                            onClick={() => void onRemovePiece(p.id)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {removingPieceId === p.id ? "…" : "Retirer"}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
