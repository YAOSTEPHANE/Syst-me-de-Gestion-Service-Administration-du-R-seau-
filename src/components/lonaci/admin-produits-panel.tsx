"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Download,
  FilePlus2,
  Files,
  Package,
  Pencil,
  Plus,
  Power,
  Save,
  Trash2,
} from "lucide-react";

import ProduitPiecesEditor, {
  piecesFromStored,
  piecesToApiPayload,
  type ProduitPieceDraft,
} from "@/components/lonaci/produit-pieces-editor";
import { Badge, StatusBadge } from "@/components/lonaci/ui/badge";
import { Button, IconButton } from "@/components/lonaci/ui/button";
import { ConfirmDialog, Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { FormField } from "@/components/lonaci/ui/form-field";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import { notify } from "@/lib/toast";

interface ProduitRow {
  _id: string;
  code: string;
  libelle: string;
  prix?: number;
  prixKit?: number;
  actif: boolean;
  documentsChecklist?: Array<{ id: string; libelle: string; obligatoire?: boolean }>;
  documentsAnnexe?: Array<{ id: string; libelle: string; obligatoire?: boolean }>;
}

const PAGE_SIZE = 8;

export default function AdminProduitsPanel() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [produits, setProduits] = useState<ProduitRow[]>([]);
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [prix, setPrix] = useState("");
  const [prixKit, setPrixKit] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLibelle, setEditLibelle] = useState("");
  const [editPrix, setEditPrix] = useState("");
  const [editPrixKit, setEditPrixKit] = useState("");
  const [editActif, setEditActif] = useState(true);
  const [editChecklistItems, setEditChecklistItems] = useState<ProduitPieceDraft[]>([]);
  const [createChecklistItems, setCreateChecklistItems] = useState<ProduitPieceDraft[]>([]);
  const [showCreatePieces, setShowCreatePieces] = useState(false);
  const [piecesModalProduit, setPiecesModalProduit] = useState<ProduitRow | null>(null);
  const [piecesModalItems, setPiecesModalItems] = useState<ProduitPieceDraft[]>([]);
  const [annexeModalProduit, setAnnexeModalProduit] = useState<ProduitRow | null>(null);
  const [annexeModalItems, setAnnexeModalItems] = useState<ProduitPieceDraft[]>([]);
  const [savingPiecesId, setSavingPiecesId] = useState<string | null>(null);
  const [savingAnnexeId, setSavingAnnexeId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProduitRow | null>(null);
  const [quickUpdatingId, setQuickUpdatingId] = useState<string | null>(null);
  /** Sauvegarde rapide du montant attendu (prix) depuis la cellule du tableau. */
  const [savingPrixId, setSavingPrixId] = useState<string | null>(null);
  const [savingPrixKitId, setSavingPrixKitId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [sortBy, setSortBy] = useState<"CODE" | "LABEL" | "PRICE_ASC" | "PRICE_DESC">("CODE");
  const [page, setPage] = useState(1);

  const inputClass =
    "lonaci-ui-input";

  const load = useCallback(async () => {
    setError(null);
    try {
      const resProduits = await fetch("/api/admin/produits", { credentials: "include", cache: "no-store" });
      if (resProduits.status === 401 || resProduits.status === 403) {
        setVisible(false);
        return;
      }
      if (!resProduits.ok) {
        setVisible(false);
        return;
      }
      const data = (await resProduits.json()) as { produits: ProduitRow[] };
      setProduits(Array.isArray(data.produits) ? data.produits : []);
      setVisible(true);
    } catch {
      setVisible(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onDataImported = () => {
      void load();
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
  }, [load]);

  function startEdit(p: ProduitRow) {
    setError(null);
    setEditingId(p._id);
    setEditCode(p.code);
    setEditLibelle(p.libelle);
    setEditPrix(typeof p.prix === "number" ? String(p.prix) : "");
    setEditPrixKit(typeof p.prixKit === "number" ? String(p.prixKit) : "");
    setEditActif(p.actif);
    setEditChecklistItems(piecesFromStored(p.documentsChecklist));
  }

  function openPiecesModal(p: ProduitRow) {
    setError(null);
    setPiecesModalProduit(p);
    setPiecesModalItems(piecesFromStored(p.documentsChecklist));
  }

  function closePiecesModal() {
    setPiecesModalProduit(null);
    setPiecesModalItems([]);
  }

  function openAnnexeModal(p: ProduitRow) {
    setError(null);
    setAnnexeModalProduit(p);
    setAnnexeModalItems(piecesFromStored(p.documentsAnnexe));
  }

  function closeAnnexeModal() {
    setAnnexeModalProduit(null);
    setAnnexeModalItems([]);
  }

  async function saveAnnexeModal(e: FormEvent) {
    e.preventDefault();
    if (!annexeModalProduit) return;
    setError(null);
    setSavingAnnexeId(annexeModalProduit._id);
    try {
      const res = await fetch(`/api/admin/produits/${annexeModalProduit._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentsAnnexe: piecesToApiPayload(annexeModalItems) }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; produit?: ProduitRow } | null;
      if (!res.ok || !body?.produit) {
        notify.error(body?.message ?? "Enregistrement des documents annexe impossible.");
        return;
      }
      setProduits((prev) => prev.map((row) => (row._id === body.produit!._id ? body.produit! : row)));
      notify.success(
        `Documents annexe du produit « ${body.produit.code} » enregistrés (${body.produit.documentsAnnexe?.length ?? 0}).`,
      );
      closeAnnexeModal();
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setSavingAnnexeId(null);
    }
  }

  async function savePiecesModal(e: FormEvent) {
    e.preventDefault();
    if (!piecesModalProduit) return;
    setError(null);
    setSavingPiecesId(piecesModalProduit._id);
    try {
      const res = await fetch(`/api/admin/produits/${piecesModalProduit._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentsChecklist: piecesToApiPayload(piecesModalItems) }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; produit?: ProduitRow } | null;
      if (!res.ok || !body?.produit) {
        notify.error(body?.message ?? "Enregistrement des pièces impossible.");
        return;
      }
      setProduits((prev) => prev.map((row) => (row._id === body.produit!._id ? body.produit! : row)));
      notify.success(
        `Pièces du produit « ${body.produit.code} » enregistrées (${body.produit.documentsChecklist?.length ?? 0}).`,
      );
      closePiecesModal();
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setSavingPiecesId(null);
    }
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setError(null);
    const c = editCode.trim();
    const l = editLibelle.trim();
    const prixNum = Number.parseInt(editPrix.replace(/\s/g, ""), 10);
    const prixKitRaw = editPrixKit.replace(/\s/g, "");
    const prixKitNum = prixKitRaw === "" ? 0 : Number.parseInt(prixKitRaw, 10);
    if (c.length < 2 || l.length < 2) {
      setError("Code et libellé : au moins 2 caractères.");
      return;
    }
    if (!Number.isFinite(prixNum) || prixNum < 0 || !Number.isInteger(prixNum)) {
      setError("Indiquez un prix caution valide en FCFA (entier ≥ 0).");
      return;
    }
    if (!Number.isFinite(prixKitNum) || prixKitNum < 0 || !Number.isInteger(prixKitNum)) {
      setError("Indiquez un prix kit valide en FCFA (entier ≥ 0).");
      return;
    }
    setSavingId(editingId);
    try {
      const res = await fetch(`/api/admin/produits/${editingId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: c,
          libelle: l,
          prix: prixNum,
          prixKit: prixKitNum,
          actif: editActif,
          documentsChecklist: piecesToApiPayload(editChecklistItems),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; produit?: ProduitRow; issues?: { message: string }[] }
        | null;
      if (res.status === 409) {
        notify.error(body?.message ?? "Modification impossible (conflit).");
        return;
      }
      if (!res.ok) {
        const msg =
          body?.message ??
          (body?.issues?.[0]?.message ? `Données invalides : ${body.issues[0].message}` : "Enregistrement impossible.");
        notify.error(msg);
        return;
      }
      if (body?.produit?._id) {
        setProduits((prev) =>
          prev
            .map((row) => (row._id === body.produit!._id ? body.produit! : row))
            .sort((a, b) => a.code.localeCompare(b.code, "fr")),
        );
        notify.success(`Produit « ${body.produit.code} » mis à jour.`);
        setEditingId(null);
      }
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteProduit(p: ProduitRow) {
    setError(null);
    setDeletingId(p._id);
    try {
      const res = await fetch(`/api/admin/produits/${p._id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; produit?: ProduitRow; deactivated?: boolean; deleted?: boolean }
        | null;
      if (!res.ok) {
        notify.error(body?.message ?? "Suppression impossible.");
        return;
      }
      if (body?.deleted) {
        setProduits((prev) => prev.filter((row) => row._id !== p._id));
        notify.success(`Produit « ${p.code} » supprimé.`);
        if (editingId === p._id) setEditingId(null);
        setDeleteTarget(null);
        return;
      }
      if (body?.produit && body.deactivated) {
        setProduits((prev) => prev.map((row) => (row._id === body.produit!._id ? body.produit! : row)));
        notify.success(body.message ?? `Produit « ${p.code} » désactivé (données encore liées).`);
        if (editingId === p._id) setEditingId(null);
        setDeleteTarget(null);
      }
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setDeletingId(null);
    }
  }

  async function savePrixFromTable(p: ProduitRow, raw: string) {
    const prixNum = Number.parseInt(raw.replace(/\s/g, ""), 10);
    if (!Number.isFinite(prixNum) || prixNum < 0 || !Number.isInteger(prixNum)) {
      setError("Montant attendu invalide : indiquez un entier ≥ 0 (FCFA).");
      return;
    }
    const current = typeof p.prix === "number" ? p.prix : 0;
    if (prixNum === current) {
      setError(null);
      return;
    }
    setError(null);
    setSavingPrixId(p._id);
    try {
      const res = await fetch(`/api/admin/produits/${p._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prix: prixNum }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; produit?: ProduitRow } | null;
      if (!res.ok || !body?.produit) {
        notify.error(body?.message ?? "Enregistrement du montant impossible.");
        return;
      }
      setProduits((prev) => prev.map((row) => (row._id === body.produit!._id ? body.produit! : row)));
      notify.success(`Montant attendu « ${body.produit.code} » : ${prixNum.toLocaleString("fr-FR")} FCFA.`);
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setSavingPrixId(null);
    }
  }

  async function savePrixKitFromTable(p: ProduitRow, raw: string) {
    const trimmed = raw.replace(/\s/g, "");
    const prixKitNum = trimmed === "" ? 0 : Number.parseInt(trimmed, 10);
    if (!Number.isFinite(prixKitNum) || prixKitNum < 0 || !Number.isInteger(prixKitNum)) {
      setError("Prix kit invalide : indiquez un entier ≥ 0 (FCFA).");
      return;
    }
    const current = typeof p.prixKit === "number" ? p.prixKit : 0;
    if (prixKitNum === current) {
      setError(null);
      return;
    }
    setError(null);
    setSavingPrixKitId(p._id);
    try {
      const res = await fetch(`/api/admin/produits/${p._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prixKit: prixKitNum }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; produit?: ProduitRow } | null;
      if (!res.ok || !body?.produit) {
        notify.error(body?.message ?? "Enregistrement du prix kit impossible.");
        return;
      }
      setProduits((prev) => prev.map((row) => (row._id === body.produit!._id ? body.produit! : row)));
      notify.success(`Prix kit « ${body.produit.code} » : ${prixKitNum.toLocaleString("fr-FR")} FCFA.`);
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setSavingPrixKitId(null);
    }
  }

  async function toggleActif(p: ProduitRow) {
    setError(null);
    setQuickUpdatingId(p._id);
    try {
      const res = await fetch(`/api/admin/produits/${p._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !p.actif }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; produit?: ProduitRow } | null;
      if (!res.ok || !body?.produit) {
        notify.error(body?.message ?? "Mise à jour du statut impossible.");
        return;
      }
      setProduits((prev) => prev.map((row) => (row._id === body.produit!._id ? body.produit! : row)));
      notify.success(`Produit « ${body.produit.code} » ${body.produit.actif ? "activé" : "désactivé"}.`);
      if (editingId === p._id) setEditingId(null);
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setQuickUpdatingId(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const c = code.trim();
    const l = libelle.trim();
    const prixNum = Number.parseInt(prix.replace(/\s/g, ""), 10);
    const prixKitRaw = prixKit.replace(/\s/g, "");
    const prixKitNum = prixKitRaw === "" ? 0 : Number.parseInt(prixKitRaw, 10);
    if (c.length < 2 || l.length < 2) {
      setError("Code et libellé : au moins 2 caractères.");
      return;
    }
    if (!Number.isFinite(prixNum) || prixNum < 0 || !Number.isInteger(prixNum)) {
      setError("Indiquez un prix caution valide en FCFA (entier ≥ 0).");
      return;
    }
    if (!Number.isFinite(prixKitNum) || prixKitNum < 0 || !Number.isInteger(prixKitNum)) {
      setError("Indiquez un prix kit valide en FCFA (entier ≥ 0).");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/produits", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: c,
          libelle: l,
          prix: prixNum,
          prixKit: prixKitNum,
          documentsChecklist: piecesToApiPayload(createChecklistItems),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; produit?: ProduitRow; issues?: { message: string }[] }
        | null;
      if (res.status === 409) {
        notify.error(body?.message ?? "Ce code produit existe déjà.");
        return;
      }
      if (!res.ok) {
        const msg =
          body?.message ??
          (body?.issues?.[0]?.message ? `Données invalides : ${body.issues[0].message}` : "Création impossible.");
        notify.error(msg);
        return;
      }
      if (body?.produit?._id) {
        setProduits((prev) => [...prev, body.produit!].sort((a, b) => a.code.localeCompare(b.code, "fr")));
      } else {
        await load();
      }
      setCode("");
      setLibelle("");
      setPrix("");
      setPrixKit("");
      setCreateChecklistItems([]);
      setShowCreatePieces(false);
      notify.success(`Produit « ${body?.produit?.code ?? c} » créé.`);
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setCreating(false);
    }
  }

  if (loading || !visible) return null;

  const q = search.trim().toLowerCase();
  const filtered = produits
    .filter((p) => {
      if (statusFilter === "ACTIVE" && !p.actif) return false;
      if (statusFilter === "INACTIVE" && p.actif) return false;
      if (!q) return true;
      return p.code.toLowerCase().includes(q) || p.libelle.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === "LABEL") return a.libelle.localeCompare(b.libelle, "fr");
      if (sortBy === "PRICE_ASC") return (a.prix ?? 0) - (b.prix ?? 0);
      if (sortBy === "PRICE_DESC") return (b.prix ?? 0) - (a.prix ?? 0);
      return a.code.localeCompare(b.code, "fr");
    });

  const activeCount = produits.filter((p) => p.actif).length;
  const inactiveCount = produits.length - activeCount;
  const avgPrice =
    produits.length > 0
      ? Math.round(produits.reduce((sum, p) => sum + (typeof p.prix === "number" ? p.prix : 0), 0) / produits.length)
      : 0;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Administration · Référentiel"
        title="Produits"
        description="Pilotez les produits, les cautions attendues et les pièces injectées dans les dossiers."
        actions={
          <Button
            variant="secondary"
            leadingIcon={Download}
            onClick={() => window.open("/api/admin/produits/export", "_blank", "noopener,noreferrer")}
          >
            Export PDF
          </Button>
        }
      />

      <Surface padding="lg" elevated>
        <SectionHeader title="Nouveau produit" description="Création réservée au chef de service." />
      <form onSubmit={onCreate} className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
        <FormField label="Code produit" htmlFor="produit-code" required>
          <input
            id="produit-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ex. LOTO"
            maxLength={32}
            className={inputClass}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Libellé" htmlFor="produit-libelle" required>
          <input
            id="produit-libelle"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Ex. Loterie nationale"
            maxLength={200}
            className={inputClass}
          />
        </FormField>
        <FormField label="Montant attendu caution (FCFA)" htmlFor="produit-prix" required>
          <input
            id="produit-prix"
            value={prix}
            onChange={(e) => setPrix(e.target.value.replace(/[^\d\s]/g, ""))}
            placeholder="Ex. 500"
            inputMode="numeric"
            className={inputClass}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Prix kit (FCFA)" htmlFor="produit-prix-kit">
          <input
            id="produit-prix-kit"
            value={prixKit}
            onChange={(e) => setPrixKit(e.target.value.replace(/[^\d\s]/g, ""))}
            placeholder="Optionnel — accompagne le produit"
            inputMode="numeric"
            className={inputClass}
            autoComplete="off"
          />
        </FormField>
        <Button type="submit" leadingIcon={Plus} loading={creating}>Créer le produit</Button>
      </form>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <Button
          variant="ghost"
          leadingIcon={showCreatePieces ? ChevronUp : ChevronDown}
          onClick={() => setShowCreatePieces((v) => !v)}
        >
          Pièces à fournir à la création (optionnel)
        </Button>
        {showCreatePieces ? (
          <div className="mt-3">
            <ProduitPiecesEditor items={createChecklistItems} onChange={setCreateChecklistItems} />
          </div>
        ) : null}
      </div>
      </Surface>

      {error ? <FeedbackState tone="danger" title="Action impossible" description={error} /> : null}

      <Surface padding="none" elevated className="lonaci-ui-data-table">
      <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3">
        <div><p className="text-xs text-slate-500">Total produits</p><p className="text-xl font-semibold text-slate-950">{produits.length}</p></div>
        <div><p className="text-xs text-slate-500">Actifs / Inactifs</p><p className="text-xl font-semibold text-slate-950">{activeCount} <span className="text-slate-400">/</span> {inactiveCount}</p></div>
        <div><p className="text-xs text-slate-500">Caution moyenne</p><p className="text-xl font-semibold text-cyan-800">{avgPrice.toLocaleString("fr-FR")} FCFA</p></div>
      </div>

      <FilterBar
        className="border-b border-slate-200"
        search={{ value: search, onChange: (value) => { setSearch(value); setPage(1); }, placeholder: "Code ou libellé…", label: "Rechercher un produit" }}
        filters={<>
        <FormField label="Statut" htmlFor="produit-status-filter" className="min-w-44">
          <select
            id="produit-status-filter"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE"); setPage(1); }}
            className={inputClass}
          >
            <option value="ALL">Tous</option>
            <option value="ACTIVE">Actifs uniquement</option>
            <option value="INACTIVE">Inactifs uniquement</option>
          </select>
        </FormField>
        <FormField label="Tri" htmlFor="produit-sort-filter" className="min-w-44">
          <select
            id="produit-sort-filter"
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as "CODE" | "LABEL" | "PRICE_ASC" | "PRICE_DESC"); setPage(1); }}
            className={inputClass}
          >
            <option value="CODE">Code (A → Z)</option>
            <option value="LABEL">Libellé (A → Z)</option>
            <option value="PRICE_ASC">Prix (croissant)</option>
            <option value="PRICE_DESC">Prix (décroissant)</option>
          </select>
        </FormField>
        </>}
        actions={<Badge tone="info">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</Badge>}
      />

      {pageRows.length === 0 ? <FeedbackState className="m-4" title="Aucun produit" description="Aucun produit ne correspond aux critères actuels." /> : (
      <div className="lonaci-ui-table-scroll lonaci-ui-table-scroll--has-mobile">
        <table>
          <caption className="lonaci-ui-sr-only">Référentiel des produits</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Libellé</th>
              <th className="px-3 py-2 font-semibold">Caution (FCFA)</th>
              <th className="px-3 py-2 font-semibold">Prix kit (FCFA)</th>
              <th className="px-3 py-2 font-semibold">Pièces à fournir</th>
              <th className="px-3 py-2 font-semibold">Statut</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
              <th className="px-3 py-2 font-mono font-normal text-slate-500">ID</th>
            </tr>
          </thead>
          <tbody className="text-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Aucun produit ne correspond au filtre.
                </td>
              </tr>
            ) : (
              pageRows.map((p) =>
                editingId === p._id ? (
                  <tr key={p._id} className="border-b border-slate-100 bg-cyan-50/50 last:border-b-0">
                    <td colSpan={8} className="p-3">
                      <form
                        onSubmit={onSaveEdit}
                        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
                      >
                        <label className="grid gap-1 lg:col-span-2">
                          <span className="text-xs font-medium text-slate-700">Code</span>
                          <input
                            value={editCode}
                            onChange={(e) => setEditCode(e.target.value)}
                            maxLength={32}
                            className={inputClass}
                            aria-label="Modifier le code produit"
                          />
                        </label>
                        <label className="grid gap-1 lg:col-span-3">
                          <span className="text-xs font-medium text-slate-700">Libellé</span>
                          <input
                            value={editLibelle}
                            onChange={(e) => setEditLibelle(e.target.value)}
                            maxLength={200}
                            className={inputClass}
                            aria-label="Modifier le libellé"
                          />
                        </label>
                        <label className="grid gap-1 lg:col-span-2">
                          <span className="text-xs font-medium text-slate-700">Caution (FCFA)</span>
                          <input
                            value={editPrix}
                            onChange={(e) => setEditPrix(e.target.value.replace(/[^\d\s]/g, ""))}
                            inputMode="numeric"
                            className={inputClass}
                            aria-label="Modifier le montant caution"
                          />
                        </label>
                        <label className="grid gap-1 lg:col-span-2">
                          <span className="text-xs font-medium text-slate-700">Prix kit (FCFA)</span>
                          <input
                            value={editPrixKit}
                            onChange={(e) => setEditPrixKit(e.target.value.replace(/[^\d\s]/g, ""))}
                            inputMode="numeric"
                            className={inputClass}
                            aria-label="Modifier le prix kit"
                            placeholder="0"
                          />
                        </label>
                        <label className="flex items-center gap-2 lg:col-span-2">
                          <input
                            type="checkbox"
                            checked={editActif}
                            onChange={(e) => setEditActif(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                          />
                          <span className="text-xs font-medium text-slate-700">Actif</span>
                        </label>
                        <div className="grid gap-1 sm:col-span-2 lg:col-span-12">
                          <span className="text-xs font-medium text-slate-700">Pièces à fournir</span>
                          <ProduitPiecesEditor
                            items={editChecklistItems}
                            onChange={setEditChecklistItems}
                            disabled={savingId === p._id}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 lg:col-span-2">
                          <Button
                            type="submit"
                            size="sm"
                            leadingIcon={Save}
                            loading={savingId === p._id}
                            disabled={savingId === p._id}
                          >
                            Enregistrer
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={savingId === p._id}
                            onClick={cancelEdit}
                          >
                            Annuler
                          </Button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={p._id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2 font-mono font-medium">{p.code}</td>
                    <td className="px-3 py-2">{p.libelle}</td>
                    <td className="px-3 py-2">
                      <input
                        key={`prix-inline-${p._id}-${p.prix ?? "x"}`}
                        type="text"
                        inputMode="numeric"
                        defaultValue={typeof p.prix === "number" ? String(p.prix) : ""}
                        placeholder="0"
                        aria-label={`Montant caution FCFA pour ${p.code}`}
                        title="Modifier le montant puis valider avec Entrée ou en cliquant ailleurs"
                        disabled={
                          savingPrixId === p._id ||
                          savingPrixKitId === p._id ||
                          deletingId === p._id ||
                          quickUpdatingId === p._id ||
                          editingId !== null
                        }
                        onBlur={(e) => void savePrixFromTable(p, e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        className="w-full min-w-28 max-w-44 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs tabular-nums text-slate-900 outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        key={`prix-kit-inline-${p._id}-${p.prixKit ?? "x"}`}
                        type="text"
                        inputMode="numeric"
                        defaultValue={typeof p.prixKit === "number" ? String(p.prixKit) : ""}
                        placeholder="0"
                        aria-label={`Prix kit FCFA pour ${p.code}`}
                        title="Prix kit optionnel accompagnant le produit"
                        disabled={
                          savingPrixId === p._id ||
                          savingPrixKitId === p._id ||
                          deletingId === p._id ||
                          quickUpdatingId === p._id ||
                          editingId !== null
                        }
                        onBlur={(e) => void savePrixKitFromTable(p, e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        className="w-full min-w-28 max-w-44 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs tabular-nums text-slate-900 outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-slate-600">
                          {(p.documentsChecklist?.length ?? 0) === 0
                            ? "Aucune"
                            : `${p.documentsChecklist!.length} pièce${p.documentsChecklist!.length > 1 ? "s" : ""}`}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          leadingIcon={Files}
                          onClick={() => openPiecesModal(p)}
                          disabled={deletingId === p._id || editingId !== null || quickUpdatingId === p._id}
                        >
                          Gérer les pièces
                        </Button>
                        <span className="text-[11px] text-slate-600">
                          {(p.documentsAnnexe?.length ?? 0) === 0
                            ? "Aucun doc. annexe"
                            : `${p.documentsAnnexe!.length} doc. annexe`}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          leadingIcon={Archive}
                          onClick={() => openAnnexeModal(p)}
                          disabled={deletingId === p._id || editingId !== null || quickUpdatingId === p._id}
                        >
                          Docs annexe contrat
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={p.actif ? "success" : "neutral"}>{p.actif ? "Actif" : "Inactif"}</StatusBadge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <IconButton
                          icon={Pencil}
                          label={`Modifier ${p.code}`}
                          onClick={() => startEdit(p)}
                          disabled={deletingId === p._id || editingId !== null}
                        />
                        <IconButton
                          icon={Power}
                          label={p.actif ? `Désactiver ${p.code}` : `Activer ${p.code}`}
                          onClick={() => void toggleActif(p)}
                          disabled={deletingId === p._id || quickUpdatingId === p._id || editingId !== null}
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Supprimer ${p.code}`}
                          variant="danger"
                          onClick={() => setDeleteTarget(p)}
                          disabled={deletingId === p._id || quickUpdatingId === p._id || editingId !== null}
                        />
                      </div>
                    </td>
                    <td className="max-w-32 truncate px-3 py-2 font-mono text-[10px] text-slate-500" title={p._id}>
                      {p._id}
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
      )}
      {pageRows.length > 0 ? (
      <div className="lonaci-ui-table-mobile" role="list" aria-label="Référentiel des produits">
        {pageRows.map((p) => (
          <Surface key={p._id} padding="md" elevated>
            {editingId === p._id ? (
              <form onSubmit={onSaveEdit} className="grid gap-3">
                <FormField label="Code" htmlFor={`mobile-produit-code-${p._id}`} required>
                  <input id={`mobile-produit-code-${p._id}`} value={editCode} onChange={(event) => setEditCode(event.target.value)} maxLength={32} className={inputClass} />
                </FormField>
                <FormField label="Libellé" htmlFor={`mobile-produit-libelle-${p._id}`} required>
                  <input id={`mobile-produit-libelle-${p._id}`} value={editLibelle} onChange={(event) => setEditLibelle(event.target.value)} maxLength={200} className={inputClass} />
                </FormField>
                <FormField label="Montant caution (FCFA)" htmlFor={`mobile-produit-prix-${p._id}`} required>
                  <input id={`mobile-produit-prix-${p._id}`} value={editPrix} onChange={(event) => setEditPrix(event.target.value.replace(/[^\d\s]/g, ""))} inputMode="numeric" className={inputClass} />
                </FormField>
                <FormField label="Prix kit (FCFA)" htmlFor={`mobile-produit-prix-kit-${p._id}`}>
                  <input id={`mobile-produit-prix-kit-${p._id}`} value={editPrixKit} onChange={(event) => setEditPrixKit(event.target.value.replace(/[^\d\s]/g, ""))} inputMode="numeric" placeholder="0" className={inputClass} />
                </FormField>
                <FormField label="Statut" htmlFor={`mobile-produit-status-${p._id}`}>
                  <select id={`mobile-produit-status-${p._id}`} value={editActif ? "true" : "false"} onChange={(event) => setEditActif(event.target.value === "true")} className={inputClass}>
                    <option value="true">Actif</option><option value="false">Inactif</option>
                  </select>
                </FormField>
                <FormField label="Pièces à fournir">
                  <ProduitPiecesEditor items={editChecklistItems} onChange={setEditChecklistItems} disabled={savingId === p._id} />
                </FormField>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={savingId === p._id}>Annuler</Button>
                  <Button type="submit" size="sm" leadingIcon={Save} loading={savingId === p._id}>Enregistrer</Button>
                </div>
              </form>
            ) : (
            <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3"><Package className="mt-0.5 text-cyan-700" size={20} /><div><p className="font-mono text-sm font-semibold">{p.code}</p><p className="text-sm text-slate-600">{p.libelle}</p></div></div>
              <StatusBadge tone={p.actif ? "success" : "neutral"}>{p.actif ? "Actif" : "Inactif"}</StatusBadge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">Caution</dt><dd className="font-semibold">{(p.prix ?? 0).toLocaleString("fr-FR")} FCFA</dd></div>
              <div><dt className="text-xs text-slate-500">Prix kit</dt><dd className="font-semibold">{(p.prixKit ?? 0).toLocaleString("fr-FR")} FCFA</dd></div>
              <div className="col-span-2"><dt className="text-xs text-slate-500">Documents</dt><dd>{p.documentsChecklist?.length ?? 0} pièce(s) · {p.documentsAnnexe?.length ?? 0} annexe(s)</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
              <IconButton icon={Files} label={`Gérer les pièces de ${p.code}`} size="sm" onClick={() => openPiecesModal(p)} disabled={editingId !== null || deletingId !== null} />
              <IconButton icon={Archive} label={`Gérer les annexes de ${p.code}`} size="sm" onClick={() => openAnnexeModal(p)} disabled={editingId !== null || deletingId !== null} />
              <IconButton icon={Pencil} label={`Modifier ${p.code}`} size="sm" onClick={() => startEdit(p)} disabled={editingId !== null || deletingId !== null} />
              <IconButton icon={Power} label={p.actif ? `Désactiver ${p.code}` : `Activer ${p.code}`} size="sm" onClick={() => void toggleActif(p)} disabled={editingId !== null || deletingId !== null || quickUpdatingId !== null} />
              <IconButton icon={Trash2} label={`Supprimer ${p.code}`} size="sm" variant="danger" onClick={() => setDeleteTarget(p)} disabled={editingId !== null || deletingId !== null} />
            </div>
            </>
            )}
          </Surface>
        ))}
      </div>
      ) : null}
      <div className="p-4"><Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} label="Pagination des produits" /></div>
      </Surface>

      {piecesModalProduit ? (
        <Dialog
          open
          onOpenChange={(open) => { if (!open && savingPiecesId === null) closePiecesModal(); }}
          title={`Pièces à fournir — ${piecesModalProduit.code}`}
          description={piecesModalProduit.libelle}
          size="lg"
        >
            <form onSubmit={(e) => void savePiecesModal(e)} className="space-y-4">
              <ProduitPiecesEditor
                items={piecesModalItems}
                onChange={setPiecesModalItems}
                disabled={savingPiecesId === piecesModalProduit._id}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={savingPiecesId === piecesModalProduit._id}
                  onClick={closePiecesModal}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  leadingIcon={Save}
                  loading={savingPiecesId === piecesModalProduit._id}
                  disabled={savingPiecesId === piecesModalProduit._id}
                >
                  Enregistrer les pièces
                </Button>
              </div>
            </form>
        </Dialog>
      ) : null}

      {annexeModalProduit ? (
        <Dialog
          open
          onOpenChange={(open) => { if (!open && savingAnnexeId === null) closeAnnexeModal(); }}
          title={`Documents annexe au contrat — ${annexeModalProduit.code}`}
          description={annexeModalProduit.libelle}
          size="lg"
        >
            <form onSubmit={(e) => void saveAnnexeModal(e)} className="space-y-4">
              <ProduitPiecesEditor
                items={annexeModalItems}
                onChange={setAnnexeModalItems}
                disabled={savingAnnexeId === annexeModalProduit._id}
                helpText="Ces documents sont associés à l’annexe du contrat (PDF annexe et checklist dossier). Marquez-les comme fournis avant la génération du contrat."
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={savingAnnexeId === annexeModalProduit._id}
                  onClick={closeAnnexeModal}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  leadingIcon={FilePlus2}
                  loading={savingAnnexeId === annexeModalProduit._id}
                  disabled={savingAnnexeId === annexeModalProduit._id}
                >
                  Enregistrer les documents annexe
                </Button>
              </div>
            </form>
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && deletingId === null) setDeleteTarget(null); }}
        title="Supprimer ce produit ?"
        description={deleteTarget ? `${deleteTarget.code} — ${deleteTarget.libelle}` : undefined}
        message="Si des contrats ou dossiers utilisent encore ce produit, il sera désactivé au lieu d’être supprimé."
        confirmLabel="Supprimer le produit"
        destructive
        pending={deleteTarget !== null && deletingId === deleteTarget._id}
        onConfirm={async () => { if (deleteTarget) await deleteProduit(deleteTarget); }}
      />
    </section>
  );
}

