"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";

import { Badge, StatusBadge, type Tone } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { ConfirmDialog, Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { PageHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import { canRole } from "@/lib/auth/rbac";
import {
  CLIENT_CODE_PREFIX,
  CLIENT_STATUT_LABELS,
  CLIENT_STATUTS,
  CLIENT_CATEGORIES,
  CLIENT_CATEGORIE_LABELS,
  clientDisplayName,
  clientCodePrefixForAgence,
  type ClientCategorie,
  type ClientStatut,
} from "@/lib/lonaci/client-constants";
import type { AgenceZoneGeographique, DossierDocumentChecklistPayload } from "@/lib/lonaci/types";
import type { LonaciRole } from "@/lib/lonaci/constants";
import { OTHER_PRODUCT_CODE } from "@/lib/lonaci/produit-constants";
import {
  buildChecklistFromTemplate,
  computeChecklistComplet,
  mergeProductChecklistTemplates,
} from "@/lib/lonaci/produit-document-checklist";
import { notify } from "@/lib/toast";
import ProduitSelectedPiecesChecklist from "@/components/lonaci/produit-selected-pieces-checklist";

type ListItem = {
  id: string;
  code: string;
  categorie: string;
  raisonSociale: string;
  nomComplet: string | null;
  cniNumero: string | null;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
  statut: string;
  rejetMotif?: string | null;
  updatedAt: string;
};

type AgenceRef = {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  zoneGeographique?: AgenceZoneGeographique;
};

type ProduitRef = {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  documentsChecklist?: Array<{ id: string; libelle: string; obligatoire?: boolean }>;
};

type ClientDetail = {
  id: string;
  code: string;
  categorie: string;
  raisonSociale: string;
  nomComplet: string | null;
  cniNumero: string | null;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
  statut: string;
  notes: string | null;
  documentChecklist: DossierDocumentChecklistPayload | null;
};

function produitsToDocumentRows(produits: ProduitRef[]) {
  return produits.map((p) => ({
    code: p.code,
    libelle: p.libelle,
    actif: p.actif,
    documentsChecklist: p.documentsChecklist,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

function applyPiecesFournies(
  checklist: DossierDocumentChecklistPayload | null,
  fourniIds: ReadonlySet<string>,
): DossierDocumentChecklistPayload | null {
  if (!checklist) return null;
  const entries = checklist.entries.map((entry) => ({
    ...entry,
    statut: fourniIds.has(entry.itemId)
      ? ("FOURNI" as const)
      : entry.statut === "MANQUANT"
        ? ("MANQUANT" as const)
        : ("EN_ATTENTE" as const),
  }));
  return { entries, complet: computeChecklistComplet(entries) };
}

function checklistToApiPatch(checklist: DossierDocumentChecklistPayload | null) {
  if (!checklist?.entries.length) return undefined;
  return checklist.entries.map((e) => ({ itemId: e.itemId, statut: e.statut }));
}

function libelleZoneGeographique(z: AgenceZoneGeographique | undefined): string {
  if (!z) return "";
  return z === "ABIDJAN" ? "Abidjan" : "Intérieur";
}

function libelleAgenceAvecZone(a: AgenceRef): string {
  const zone = libelleZoneGeographique(a.zoneGeographique);
  const base = `${a.code} — ${a.libelle}`;
  return zone ? `${base} (${zone})` : base;
}

const CLIENT_STATUS_TONES: Record<string, Tone> = {
  EN_ATTENTE_N1: "info",
  REJETE: "danger",
  DOSSIER_EN_COURS: "warning",
  ACTIF: "success",
  INACTIF: "neutral",
};

type ClientConfirmation =
  | { kind: "deactivate"; id: string; code: string }
  | { kind: "validate"; id: string; code: string }
  | { kind: "resubmit"; id: string; code: string };

type ClientRejection = { id: string; code: string };

export default function ClientsPanel() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [filterCategorie, setFilterCategorie] = useState("");
  const [filterAgence, setFilterAgence] = useState("");
  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [produitsAutorises, setProduitsAutorises] = useState<string[]>([]);
  const [clientChecklist, setClientChecklist] = useState<DossierDocumentChecklistPayload | null>(null);
  const [meRole, setMeRole] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ClientConfirmation | null>(null);
  const [rejection, setRejection] = useState<ClientRejection | null>(null);
  const [rejectionMotif, setRejectionMotif] = useState("");
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingClientCode, setEditingClientCode] = useState<string | null>(null);
  /** Affiché après création : identifiant client saisi pour la zone. */
  const [createdClient, setCreatedClient] = useState<{
    id: string;
    code: string;
    nomComplet: string;
    statut: string;
  } | null>(null);
  const [form, setForm] = useState({
    categorie: "PARTICULIER" as ClientCategorie,
    clientCodeSuffix: "",
    nomComplet: "",
    raisonSociale: "",
    cniNumero: "",
    nomContact: "",
    email: "",
    telephone: "",
    adresse: "",
    ville: "",
    codePostal: "",
    agenceId: "",
    statut: "EN_ATTENTE_N1" as ClientStatut,
    notes: "",
  });

  const agencesActives = useMemo(() => agences.filter((a) => a.actif), [agences]);
  const selectedAgence = useMemo(
    () => agencesActives.find((a) => a.id === form.agenceId) ?? null,
    [agencesActives, form.agenceId],
  );
  const clientCodePrefixHint = selectedAgence
    ? clientCodePrefixForAgence(selectedAgence.code)
    : `${CLIENT_CODE_PREFIX}-…-`;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const meRbacRole = meRole as LonaciRole;
  const canDeactivate = meRole === "ASSIST_CDS" || meRole === "CHEF_SERVICE";
  const canValidateN1 = canRole({ role: meRbacRole, resource: "CLIENTS", action: "VALIDATE_N1" }).allowed;
  const canRejectN1 = canRole({ role: meRbacRole, resource: "CLIENTS", action: "REJECT" }).allowed;

  const piecesFourniesIds = useMemo(
    () =>
      new Set(
        clientChecklist?.entries.filter((e) => e.statut === "FOURNI").map((e) => e.itemId) ?? [],
      ),
    [clientChecklist],
  );

  useEffect(() => {
    if (!modalOpen) return;
    const template = mergeProductChecklistTemplates(
      produitsAutorises,
      produitsToDocumentRows(produits),
    );
    setClientChecklist((prev) => buildChecklistFromTemplate(template, prev?.entries ?? null));
  }, [modalOpen, produitsAutorises, produits]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterCategorie) params.set("categorie", filterCategorie);
      if (filterAgence) params.set("agenceId", filterAgence);
      const res = await fetch(`/api/clients?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Chargement impossible");
      }
      const data = (await res.json()) as { items: ListItem[]; total: number };
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger les clients.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, filterStatut, filterCategorie, filterAgence]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [refRes, meRes] = await Promise.all([
          fetch("/api/referentials", { credentials: "include", cache: "no-store" }),
          fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
        ]);
        if (refRes.ok) {
          const data = (await refRes.json()) as { agences: AgenceRef[]; produits: ProduitRef[] };
          setAgences(data.agences ?? []);
          setProduits((data.produits ?? []).filter((p) => p.actif));
        }
        if (meRes.ok) {
          const me = (await meRes.json()) as { user: { role: string } };
          setMeRole(me.user?.role ?? "");
        }
      } catch {
        // silencieux : filtres agence restent vides
      }
    })();
  }, []);

  function resetForm() {
    setForm({
      categorie: "PARTICULIER",
      clientCodeSuffix: "",
      nomComplet: "",
      raisonSociale: "",
      cniNumero: "",
      nomContact: "",
      email: "",
      telephone: "",
      adresse: "",
      ville: "",
      codePostal: "",
      agenceId: "",
      statut: "EN_ATTENTE_N1",
      notes: "",
    });
    setEditingId(null);
    setEditingClientCode(null);
    setCreatedClient(null);
    setProduitsAutorises([]);
    setClientChecklist(null);
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  async function openEdit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${id}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { client: ClientDetail };
      const c = data.client;
      const agenceCode = agences.find((a) => a.id === c.agenceId)?.code ?? "";
      const codePrefix = agenceCode ? clientCodePrefixForAgence(agenceCode) : "";
      const codeUpper = c.code.trim().toUpperCase();
      const clientCodeSuffix =
        codePrefix && codeUpper.startsWith(codePrefix) ? codeUpper.slice(codePrefix.length) : codeUpper;
      setEditingId(c.id);
      setEditingClientCode(c.code);
      setForm({
        clientCodeSuffix,
        categorie: (CLIENT_CATEGORIES as readonly string[]).includes(c.categorie)
          ? (c.categorie as ClientCategorie)
          : "PARTICULIER",
        nomComplet: c.nomComplet ?? "",
        raisonSociale: c.raisonSociale ?? "",
        cniNumero: c.cniNumero ?? "",
        nomContact: c.nomContact ?? "",
        email: c.email ?? "",
        telephone: c.telephone ?? "",
        adresse: c.adresse ?? "",
        ville: c.ville ?? "",
        codePostal: c.codePostal ?? "",
        agenceId: c.agenceId ?? "",
        statut: (CLIENT_STATUTS as readonly string[]).includes(c.statut) ? (c.statut as ClientStatut) : "ACTIF",
        notes: c.notes ?? "",
      });
      setProduitsAutorises([...(c.produitsAutorises ?? [])]);
      setClientChecklist(c.documentChecklist ?? null);
      setModalOpen(true);
    } catch {
      setError("Impossible de charger la fiche client.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    const isEntreprise = form.categorie === "ENTREPRISE";
    if (isEntreprise && !form.raisonSociale.trim()) {
      setError("La raison sociale est obligatoire pour une entreprise.");
      return;
    }
    if (!isEntreprise && !form.nomComplet.trim()) {
      setError("Le nom complet est obligatoire pour un particulier.");
      return;
    }
    setBusyId(editingId ?? "new");
    setError(null);
    try {
      if (editingId) {
        const res = await fetch(`/api/clients/${editingId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categorie: form.categorie,
            nomComplet: form.nomComplet.trim() || null,
            raisonSociale: form.raisonSociale.trim() || form.nomComplet.trim(),
            cniNumero: form.cniNumero.trim() || null,
            nomContact: form.nomContact.trim() || null,
            email: form.email.trim() || null,
            telephone: form.telephone.trim() || null,
            adresse: form.adresse.trim() || null,
            ville: form.ville.trim() || null,
            codePostal: form.codePostal.trim() || null,
            agenceId: form.agenceId.trim() || null,
            statut: form.statut,
            notes: form.notes.trim() || null,
            produitsAutorises,
            documentChecklist: checklistToApiPatch(clientChecklist),
          }),
        });
        if (!res.ok) throw new Error();
      } else {
        if (!form.agenceId.trim()) {
          setError("Sélectionnez une agence de rattachement selon votre zone.");
          setBusyId(null);
          return;
        }
        if (!form.cniNumero.trim() || form.cniNumero.trim().length < 4) {
          setError("Le numéro CNI (identifiant client) est obligatoire (au moins 4 caractères).");
          setBusyId(null);
          return;
        }
        if (!form.clientCodeSuffix.trim()) {
          setError("Saisissez l’identifiant client pour la zone (unique dans l’agence).");
          setBusyId(null);
          return;
        }
        const res = await fetch("/api/clients", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: form.clientCodeSuffix.trim(),
            categorie: form.categorie,
            nomComplet: form.nomComplet.trim() || null,
            raisonSociale: form.raisonSociale.trim() || null,
            cniNumero: form.cniNumero.trim(),
            nomContact: form.nomContact.trim() || null,
            email: form.email.trim() || null,
            telephone: form.telephone.trim() || null,
            adresse: form.adresse.trim() || null,
            ville: form.ville.trim() || null,
            codePostal: form.codePostal.trim() || null,
            agenceId: form.agenceId.trim(),
            notes: form.notes.trim() || null,
            produitsAutorises,
            documentChecklist: checklistToApiPatch(clientChecklist),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message ?? "Création impossible.");
        }
        const data = (await res.json()) as { client: ClientDetail };
        setCreatedClient({
          id: data.client.id,
          code: data.client.code,
          nomComplet: clientDisplayName(data.client),
          statut: data.client.statut,
        });
        await load();
        return;
      }
      setModalOpen(false);
      resetForm();
      await load();
      notify.success("Client mis à jour.");
    } catch (err) {
      if (editingId) {
        notify.error(err, "Enregistrement impossible.");
      } else {
        setError(err instanceof Error ? err.message : "Création impossible.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deactivate(id: string, code: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
      await load();
      notify.success(`Client ${code} désactivé.`);
    } catch (error) {
      notify.error(error, "Désactivation impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function validateClientN1(id: string, code: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${id}/validate-n1`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Validation N1 impossible");
      }
      await load();
      notify.success(`Client ${code} validé au niveau N1.`);
    } catch (e) {
      notify.error(e, "Validation N1 impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function rejectClientN1(id: string, code: string, motif: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motif: motif.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Rejet impossible");
      }
      await load();
      notify.success(`Client ${code} rejeté.`);
    } catch (e) {
      notify.error(e, "Rejet impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmClientRejection() {
    if (!rejection) return;
    const motif = rejectionMotif.trim();
    if (motif.length < 3) {
      setRejectionError("Motif de rejet requis (3 caractères minimum).");
      return;
    }
    const current = rejection;
    await rejectClientN1(current.id, current.code, motif);
    setRejection(null);
    setRejectionMotif("");
    setRejectionError(null);
  }

  async function resubmitClient(id: string, code: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${id}/submit`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Resoumission impossible");
      }
      await load();
      notify.success(`Client ${code} resoumis pour validation N1.`);
    } catch (e) {
      notify.error(e, "Resoumission impossible.");
    } finally {
      setBusyId(null);
    }
  }

  function agenceLabel(agenceId: string | null) {
    if (!agenceId) return "—";
    const ag = agences.find((a) => a.id === agenceId);
    return ag ? libelleAgenceAvecZone(ag) : agenceId;
  }

  function displayNomPrincipal(row: ListItem): string {
    return clientDisplayName(row);
  }

  function categorieLabel(categorie: string): string {
    return CLIENT_CATEGORIE_LABELS[categorie as ClientCategorie] ?? categorie;
  }

  function formatProduitsCell(codes: string[]): string {
    if (!codes.length) return "—";
    return codes
      .map((c) => {
        const p = produits.find((pr) => pr.code === c);
        return p ? p.code : c;
      })
      .join(", ");
  }

  async function confirmClientAction() {
    if (!confirmation) return;
    const current = confirmation;
    if (current.kind === "deactivate") {
      await deactivate(current.id, current.code);
    } else if (current.kind === "validate") {
      await validateClientN1(current.id, current.code);
    } else {
      await resubmitClient(current.id, current.code);
    }
    setConfirmation(null);
  }

  function clientActions(row: ListItem, mobile = false) {
    return (
      <div className={`flex flex-wrap gap-2 ${mobile ? "" : "justify-end"}`}>
        {row.statut === "EN_ATTENTE_N1" && canValidateN1 ? (
          <Button
            size="sm"
            leadingIcon={Check}
            disabled={busyId === row.id}
            onClick={() => setConfirmation({ kind: "validate", id: row.id, code: row.code })}
          >
            Valider N1
          </Button>
        ) : null}
        {row.statut === "EN_ATTENTE_N1" && canRejectN1 ? (
          <Button
            size="sm"
            variant="danger"
            leadingIcon={X}
            disabled={busyId === row.id}
            onClick={() => {
              setRejection({ id: row.id, code: row.code });
              setRejectionMotif("");
              setRejectionError(null);
            }}
          >
            Rejeter
          </Button>
        ) : null}
        {row.statut === "REJETE" ? (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={Send}
            disabled={busyId === row.id}
            onClick={() => setConfirmation({ kind: "resubmit", id: row.id, code: row.code })}
          >
            Resoumettre
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={Pencil}
          disabled={busyId === row.id}
          onClick={() => void openEdit(row.id)}
        >
          Modifier
        </Button>
        {canDeactivate ? (
          <Button
            size="sm"
            variant="danger"
            leadingIcon={Trash2}
            disabled={busyId === row.id || row.statut === "INACTIF"}
            onClick={() => setConfirmation({ kind: "deactivate", id: row.id, code: row.code })}
          >
            Désactiver
          </Button>
        ) : null}
      </div>
    );
  }

  const produitsAutorisesFields = (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Produits</p>
      <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
        <p className="mb-1 text-xs font-medium text-slate-700">Produits autorisés</p>
        <p className="mb-2 text-[11px] text-slate-600">
          Limite les produits proposés lors de la création de cautions pour ce client. Laissez vide pour
          autoriser tout le référentiel actif.
        </p>
        {produits.length === 0 ? (
          <p className="text-xs text-amber-800">
            Aucun produit actif chargé. Vérifiez le référentiel{" "}
            <span className="font-medium">Administration → Produits</span>, puis rouvrez ce formulaire.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
            <label className="flex items-center gap-2 text-xs text-slate-800">
              <input
                type="checkbox"
                checked={produitsAutorises.includes(OTHER_PRODUCT_CODE)}
                onChange={(e) =>
                  setProduitsAutorises((curr) =>
                    e.target.checked
                      ? [...curr, OTHER_PRODUCT_CODE]
                      : curr.filter((code) => code !== OTHER_PRODUCT_CODE),
                  )
                }
              />
              <span>{OTHER_PRODUCT_CODE}</span>
            </label>
          </div>
        )}
        <ProduitSelectedPiecesChecklist
          selectedProduitCodes={produitsAutorises}
          produits={produits}
          className="mt-3"
          value={piecesFourniesIds}
          onChange={(ids) => setClientChecklist((prev) => applyPiecesFournies(prev, ids))}
        />
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Référentiel"
        title="Clients"
        description={`Comptes clients et tiers, distincts des concessionnaires PDV. Identifiant unique par zone : ${CLIENT_CODE_PREFIX}-AGENCE-….`}
        actions={
          <Button leadingIcon={Plus} onClick={openCreate}>
            Nouveau client
          </Button>
        }
      />

      {error ? (
        <FeedbackState tone="danger" title="Opération impossible" description={error} aria-live="assertive" />
      ) : null}

      <Surface elevated>
        <FilterBar
          search={{
            value: q,
            onChange: (value) => {
              setPage(1);
              setQ(value);
            },
            label: "Rechercher un client",
            placeholder: "Nom, raison sociale, CNI, code, téléphone…",
          }}
          filters={
            <>
          <select
            value={filterStatut}
            aria-label="Statut"
            onChange={(e) => {
              setPage(1);
              setFilterStatut(e.target.value);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Tous les statuts</option>
            {CLIENT_STATUTS.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUT_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={filterCategorie}
            aria-label="Catégorie"
            onChange={(e) => {
              setPage(1);
              setFilterCategorie(e.target.value);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Toutes les catégories</option>
            {CLIENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CLIENT_CATEGORIE_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={filterAgence}
            aria-label="Agence"
            onChange={(e) => {
              setPage(1);
              setFilterAgence(e.target.value);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Toutes les agences</option>
            {agencesActives.map((a) => (
              <option key={a.id} value={a.id}>
                {libelleAgenceAvecZone(a)}
              </option>
            ))}
          </select>
            </>
          }
          actions={
            <Button
              variant="secondary"
              leadingIcon={RotateCcw}
              onClick={() => {
              setPage(1);
              setQ("");
              setFilterStatut("");
              setFilterCategorie("");
              setFilterAgence("");
            }}
            >
              Réinitialiser
            </Button>
          }
        />

        <div className="my-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">{total} client(s)</p>
          <Pagination
            page={page}
            pageCount={totalPages}
            onPageChange={setPage}
            label="Pagination des clients"
          />
        </div>

        {loading ? (
          <FeedbackState title="Chargement des clients" description="La liste est en cours de mise à jour." />
        ) : items.length === 0 ? (
          <FeedbackState title="Aucun client" description="Aucun client ne correspond aux filtres actuels." />
        ) : (
          <>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3">Catégorie</th>
                <th className="py-2 pr-3">Nom / Raison sociale</th>
                <th className="py-2 pr-3">CNI</th>
                <th className="py-2 pr-3">Contact</th>
                <th className="py-2 pr-3">Agence (zone)</th>
                <th className="py-2 pr-3">Produits</th>
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-800">{row.code}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={row.categorie === "ENTREPRISE" ? "brand" : "neutral"}>
                        {categorieLabel(row.categorie)}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      <div>{displayNomPrincipal(row)}</div>
                      {row.categorie === "ENTREPRISE" && row.nomComplet?.trim() ? (
                        <div className="text-xs font-normal text-slate-500">Contact : {row.nomComplet}</div>
                      ) : row.categorie === "PARTICULIER" &&
                        row.raisonSociale &&
                        row.nomComplet &&
                        row.raisonSociale !== row.nomComplet ? (
                        <div className="text-xs font-normal text-slate-500">{row.raisonSociale}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">{row.cniNumero ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-700">
                      <div className="text-xs text-slate-500">
                        {[row.telephone, row.email].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{agenceLabel(row.agenceId)}</td>
                    <td className="py-2 pr-3 text-xs text-slate-700" title={formatProduitsCell(row.produitsAutorises ?? [])}>
                      {formatProduitsCell(row.produitsAutorises ?? [])}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusBadge tone={CLIENT_STATUS_TONES[row.statut] ?? "neutral"}>
                        {CLIENT_STATUT_LABELS[row.statut as ClientStatut] ?? row.statut}
                      </StatusBadge>
                      {row.statut === "REJETE" && row.rejetMotif ? (
                        <p className="mt-1 max-w-[14rem] text-[11px] text-rose-800" title={row.rejetMotif}>
                          {row.rejetMotif}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {clientActions(row)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:hidden" role="list" aria-label="Clients">
          {items.map((row) => (
            <article key={row.id} role="listitem" className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-orange-700">{row.code}</p>
                  <h3 className="mt-1 text-base font-bold text-slate-950">{displayNomPrincipal(row)}</h3>
                </div>
                <StatusBadge tone={CLIENT_STATUS_TONES[row.statut] ?? "neutral"}>
                  {CLIENT_STATUT_LABELS[row.statut as ClientStatut] ?? row.statut}
                </StatusBadge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm">
                <div><dt className="font-semibold text-slate-500">Catégorie</dt><dd className="mt-1">{categorieLabel(row.categorie)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Contact</dt><dd className="mt-1">{[row.telephone, row.email].filter(Boolean).join(" · ") || "—"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Agence</dt><dd className="mt-1">{agenceLabel(row.agenceId)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Produits</dt><dd className="mt-1">{formatProduitsCell(row.produitsAutorises ?? [])}</dd></div>
              </dl>
              <div className="mt-4 border-t border-slate-100 pt-4">{clientActions(row, true)}</div>
            </article>
          ))}
        </div>
          </>
        )}
      </Surface>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && !busyId) closeModal();
        }}
        title={createdClient ? "Client enregistré" : editingId ? "Modifier le client" : "Nouveau client"}
        description={
          createdClient
            ? "Conservez et communiquez l’identifiant client."
            : "Les libellés et règles métier restent visibles pendant la saisie."
        }
        size="lg"
      >
            {createdClient ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Le compte de <strong className="text-slate-900">{createdClient.nomComplet}</strong> a été créé avec
                  le statut{" "}
                  <strong className="text-slate-900">{CLIENT_STATUT_LABELS.EN_ATTENTE_N1}</strong>. Un Chef de section
                  doit valider la fiche (N1) avant la constitution d’une caution.
                </p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Identifiant client (zone)
                  </p>
                  <p className="mt-2 font-mono text-2xl font-bold tracking-wide text-emerald-950">
                    {createdClient.code}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <Button
                    variant="secondary"
                    leadingIcon={Clipboard}
                    onClick={() => {
                      void navigator.clipboard.writeText(createdClient.code).then(
                        () => notify.success("Code client copié."),
                        (error: unknown) => notify.error(error, "Copie du code impossible."),
                      );
                    }}
                  >
                    Copier le code
                  </Button>
                  <Button onClick={closeModal}>
                    Fermer
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <form onSubmit={(e) => void saveClient(e)} className="space-y-3">
                  {editingId && editingClientCode ? (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
                        Identifiant client
                      </p>
                      <p className="mt-0.5 font-mono text-lg font-semibold text-indigo-950">{editingClientCode}</p>
                      <p className="mt-1 text-xs text-slate-600">Attribué à la zone à la création — non modifiable.</p>
                    </div>
                  ) : null}
                  {editingId ? (
                meRole === "CHEF_SERVICE" ? (
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      Agence de rattachement <span className="text-slate-500">(zone)</span>
                    </span>
                    <select
                      required
                      aria-label="Agence de rattachement selon la zone"
                      value={form.agenceId}
                      onChange={(e) => setForm((f) => ({ ...f, agenceId: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {agencesActives.map((a) => (
                        <option key={a.id} value={a.id}>
                          {libelleAgenceAvecZone(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Agence de rattachement (zone)
                    </div>
                    <p className="mt-0.5 text-slate-800">{agenceLabel(form.agenceId) || "—"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Seul le rôle Chef(fe) de service peut modifier l’agence.
                    </p>
                  </div>
                )
              ) : null}
              {produitsAutorisesFields}
              <label className="block text-sm">
                <span className="text-slate-600">Catégorie *</span>
                <select
                  required
                  aria-label="Catégorie du client"
                  value={form.categorie}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categorie: e.target.value as ClientCategorie }))
                  }
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {CLIENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CLIENT_CATEGORIE_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              {!editingId ? (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Fiche complète — nouveau client
                  </p>
                  <p className="text-xs text-slate-600">
                    Saisissez un identifiant unique dans votre zone (format {CLIENT_CODE_PREFIX}-code agence-suffixe).
                    Statut initial :{" "}
                    <span className="font-medium text-sky-900">{CLIENT_STATUT_LABELS.EN_ATTENTE_N1}</span> pour tous
                    les rôles — le Chef de section valide (N1), puis le dossier passe en{" "}
                    <span className="font-medium text-amber-900">{CLIENT_STATUT_LABELS.DOSSIER_EN_COURS}</span> avant la
                    caution.
                  </p>
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      Agence de rattachement <span className="text-slate-500">(selon votre zone)</span> *
                    </span>
                    <select
                      required
                      aria-label="Agence de rattachement selon la zone"
                      value={form.agenceId}
                      onChange={(e) => setForm((f) => ({ ...f, agenceId: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">— Choisir une agence —</option>
                      {agencesActives.map((a) => (
                        <option key={a.id} value={a.id}>
                          {libelleAgenceAvecZone(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      Identifiant client (zone) <span className="text-rose-600">*</span>
                    </span>
                    <div className="mt-1 flex rounded border border-slate-300 bg-white text-sm focus-within:ring-2 focus-within:ring-indigo-500">
                      <span className="shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                        {clientCodePrefixHint}
                      </span>
                      <input
                        required
                        disabled={!form.agenceId}
                        value={form.clientCodeSuffix}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            clientCodeSuffix: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                          }))
                        }
                        placeholder={form.agenceId ? "000042" : "Choisir une agence d’abord"}
                        className="min-w-0 flex-1 rounded-r border-0 bg-transparent px-3 py-2 font-mono focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                        autoComplete="off"
                        aria-label="Suffixe identifiant client unique dans la zone"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Saisie manuelle : l’identifiant ne doit pas déjà exister dans cette agence.
                    </p>
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      {form.categorie === "ENTREPRISE" ? "Raison sociale *" : "Nom complet *"}
                    </span>
                    <input
                      required
                      value={form.categorie === "ENTREPRISE" ? form.raisonSociale : form.nomComplet}
                      onChange={(e) =>
                        setForm((f) =>
                          f.categorie === "ENTREPRISE"
                            ? { ...f, raisonSociale: e.target.value }
                            : { ...f, nomComplet: e.target.value },
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      autoComplete={form.categorie === "ENTREPRISE" ? "organization" : "name"}
                    />
                  </label>
                  {form.categorie === "ENTREPRISE" ? (
                    <label className="block text-sm">
                      <span className="text-slate-600">Nom du contact / représentant (optionnel)</span>
                      <input
                        value={form.nomComplet}
                        onChange={(e) => setForm((f) => ({ ...f, nomComplet: e.target.value }))}
                        placeholder="Personne à joindre au sein de l’entreprise"
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                        autoComplete="name"
                      />
                    </label>
                  ) : (
                    <label className="block text-sm">
                      <span className="text-slate-600">Raison sociale / enseigne (optionnel)</span>
                      <input
                        value={form.raisonSociale}
                        onChange={(e) => setForm((f) => ({ ...f, raisonSociale: e.target.value }))}
                        placeholder="Si enseigne distincte du nom"
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  )}
                  <label className="block text-sm">
                    <span className="text-slate-600">Identifiant client (N° CNI) *</span>
                    <input
                      required
                      minLength={4}
                      value={form.cniNumero}
                      onChange={(e) => setForm((f) => ({ ...f, cniNumero: e.target.value }))}
                      placeholder="Numéro de carte nationale d’identité"
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                      autoComplete="off"
                    />
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Coordonnées de contact
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="text-slate-600">Téléphone</span>
                        <input
                          value={form.telephone}
                          onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="tel"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-slate-600">E-mail</span>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="email"
                        />
                      </label>
                    </div>
                  </div>
                  <label className="block text-sm">
                    <span className="text-slate-600">Autre interlocuteur (optionnel)</span>
                    <input
                      value={form.nomContact}
                      onChange={(e) => setForm((f) => ({ ...f, nomContact: e.target.value }))}
                      placeholder="Nom d’une personne à joindre si différente du client"
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600">Adresse</span>
                    <input
                      value={form.adresse}
                      onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-slate-600">Ville</span>
                      <input
                        value={form.ville}
                        onChange={(e) => setForm((f) => ({ ...f, ville: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-600">Code postal</span>
                      <input
                        value={form.codePostal}
                        onChange={(e) => setForm((f) => ({ ...f, codePostal: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block text-sm">
                    <span className="text-slate-600">Notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={3}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              ) : (
                <>
                  <label className="block text-sm">
                    <span className="text-slate-600">
                      {form.categorie === "ENTREPRISE" ? "Raison sociale *" : "Nom complet *"}
                    </span>
                    <input
                      required
                      value={form.categorie === "ENTREPRISE" ? form.raisonSociale : form.nomComplet}
                      onChange={(e) =>
                        setForm((f) =>
                          f.categorie === "ENTREPRISE"
                            ? { ...f, raisonSociale: e.target.value }
                            : { ...f, nomComplet: e.target.value },
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      autoComplete={form.categorie === "ENTREPRISE" ? "organization" : "name"}
                    />
                  </label>
                  {form.categorie === "ENTREPRISE" ? (
                    <label className="block text-sm">
                      <span className="text-slate-600">Nom du contact / représentant</span>
                      <input
                        value={form.nomComplet}
                        onChange={(e) => setForm((f) => ({ ...f, nomComplet: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        autoComplete="name"
                      />
                    </label>
                  ) : (
                    <label className="block text-sm">
                      <span className="text-slate-600">Raison sociale / enseigne (optionnel)</span>
                      <input
                        value={form.raisonSociale}
                        onChange={(e) => setForm((f) => ({ ...f, raisonSociale: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  )}
                  <label className="block text-sm">
                    <span className="text-slate-600">Identifiant client (N° CNI)</span>
                    <input
                      value={form.cniNumero}
                      onChange={(e) => setForm((f) => ({ ...f, cniNumero: e.target.value }))}
                      placeholder="Carte nationale d’identité"
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                      autoComplete="off"
                    />
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Coordonnées de contact
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="text-slate-600">Téléphone</span>
                        <input
                          value={form.telephone}
                          onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="tel"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-slate-600">E-mail</span>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                          autoComplete="email"
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}
              {editingId && meRole === "CHEF_SERVICE" ? (
                <label className="block text-sm">
                  <span className="text-slate-600">Statut (administration)</span>
                  <select
                    value={form.statut}
                    aria-label="Statut du client"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, statut: e.target.value as ClientStatut }))
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  >
                    {CLIENT_STATUTS.map((s) => (
                      <option key={s} value={s}>
                        {CLIENT_STATUT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : editingId ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Statut</div>
                  <p className="mt-0.5 text-slate-800">
                    {CLIENT_STATUT_LABELS[form.statut] ?? form.statut}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Les changements de statut passent par la validation N1 ou le paiement de caution.
                  </p>
                </div>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={closeModal}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={Boolean(busyId)}
                  loading={Boolean(busyId)}
                >
                  Enregistrer
                </Button>
              </div>
            </form>
              </>
            )}
      </Dialog>

      <ConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busyId) setConfirmation(null);
        }}
        title={
          confirmation?.kind === "deactivate"
            ? "Désactiver le client"
            : confirmation?.kind === "validate"
              ? "Valider au niveau N1"
              : "Resoumettre le client"
        }
        message={
          confirmation?.kind === "deactivate"
            ? `Le client ${confirmation.code} passera au statut inactif.`
            : confirmation?.kind === "validate"
              ? `Confirmer la validation N1 du client ${confirmation.code} ?`
              : `Le client ${confirmation?.code ?? ""} sera resoumis pour validation N1.`
        }
        confirmLabel={
          confirmation?.kind === "deactivate"
            ? "Désactiver"
            : confirmation?.kind === "validate"
              ? "Valider N1"
              : "Resoumettre"
        }
        destructive={confirmation?.kind === "deactivate"}
        pending={Boolean(busyId)}
        onConfirm={confirmClientAction}
      />

      <Dialog
        open={rejection !== null}
        onOpenChange={(open) => {
          if (!open && !busyId) {
            setRejection(null);
            setRejectionMotif("");
            setRejectionError(null);
          }
        }}
        title="Rejeter le client"
        description={`Motif de rejet pour le client ${rejection?.code ?? ""} :`}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={Boolean(busyId)}
              onClick={() => {
                setRejection(null);
                setRejectionMotif("");
                setRejectionError(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={Boolean(busyId)}
              onClick={() => void confirmClientRejection()}
            >
              Rejeter
            </Button>
          </>
        }
      >
        <label className="block text-sm">
          <span className="font-medium text-slate-700">
            Motif <span className="text-rose-600">*</span>
          </span>
          <textarea
            data-autofocus
            required
            minLength={3}
            rows={4}
            value={rejectionMotif}
            disabled={Boolean(busyId)}
            onChange={(event) => {
              setRejectionMotif(event.target.value);
              if (rejectionError) setRejectionError(null);
            }}
            aria-invalid={rejectionError ? "true" : undefined}
            aria-describedby={rejectionError ? "client-rejection-error" : undefined}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-rose-500/20 focus:border-rose-400 focus:ring-4 disabled:bg-slate-100"
            placeholder="Précisez le motif du rejet…"
          />
        </label>
        {rejectionError ? (
          <p id="client-rejection-error" className="mt-2 text-sm font-medium text-rose-700" role="alert">
            {rejectionError}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
