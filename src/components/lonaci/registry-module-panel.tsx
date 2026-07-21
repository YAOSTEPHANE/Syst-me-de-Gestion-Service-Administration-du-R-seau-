"use client";

import ClientSearchPicker, { type ClientPickerRow } from "@/components/lonaci/client-search-picker";
import { Download, FilePlus2, Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { LONACI_AGENCES } from "@/components/lonaci/lonaci-nav";
import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { ConfirmDialog, Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { FormField } from "@/components/lonaci/ui/form-field";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import { notify } from "@/lib/toast";

type RegistryModule = "AGREMENT" | "CESSION" | "GPR";

export interface RegistryModulePanelProps {
  module: RegistryModule;
  title: string;
  description: string;
  statuts: readonly string[];
  defaultStatut: string;
  /** Masquer le bandeau titre / description (pages composites) */
  omitSectionHeader?: boolean;
}

interface Row {
  id: string;
  reference: string;
  titre: string;
  concessionnaireId: string | null;
  agenceId: string | null;
  statut: string;
  commentaire: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function RegistryModulePanel({
  module,
  title,
  description,
  statuts,
  defaultStatut,
  omitSectionHeader = false,
}: RegistryModulePanelProps) {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; reference: string } | null>(null);
  const [editTitre, setEditTitre] = useState("");
  const [editCommentaire, setEditCommentaire] = useState("");
  const [q, setQ] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [filterAgence, setFilterAgence] = useState("");

  const [titre, setTitre] = useState("");
  const [createClient, setCreateClient] = useState<ClientPickerRow | null>(null);
  const [agenceId, setAgenceId] = useState("");
  const [statut, setStatut] = useState(defaultStatut);
  const [commentaire, setCommentaire] = useState("");
  const [creating, setCreating] = useState(false);

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        module,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterAgence) params.set("agenceId", filterAgence);
      const res = await fetch(`/api/lonaci-registries?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as { items: Row[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setError("Impossible de charger le registre.");
    } finally {
      setLoading(false);
    }
  }, [module, page, q, filterStatut, filterAgence]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/lonaci-registries", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module,
          titre: titre.trim(),
          lonaciClientId: createClient?.id?.trim() || null,
          agenceId: agenceId.trim() || null,
          statut,
          commentaire: commentaire.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      setTitre("");
      setCreateClient(null);
      setAgenceId("");
      setCommentaire("");
      setStatut(defaultStatut);
      await load();
      notify.success("Entrée créée.");
    } catch (error) {
      notify.error(error, "Création impossible.");
    } finally {
      setCreating(false);
    }
  }

  async function patchStatut(id: string, next: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/lonaci-registries/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: next }),
      });
      if (!res.ok) throw new Error();
      await load();
      notify.success("Statut mis à jour.");
    } catch (error) {
      notify.error(error, "Mise à jour impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    const nextTitre = editTitre.trim();
    if (nextTitre.length < 2) {
      setError("Le titre doit contenir au moins 2 caractères.");
      return;
    }
    setBusyId(editingId);
    try {
      const res = await fetch(`/api/lonaci-registries/${editingId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: nextTitre,
          commentaire: editCommentaire.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      setEditTitre("");
      setEditCommentaire("");
      await load();
      notify.success("Entrée mise à jour.");
    } catch (error) {
      notify.error(error, "Mise à jour impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteEntry(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/lonaci-registries/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      await load();
      notify.success("Entrée supprimée.");
      setDeleteTarget(null);
    } catch (error) {
      notify.error(error, "Suppression impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        module,
        page: "1",
        pageSize: "1000",
      });
      if (q.trim()) params.set("q", q.trim());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterAgence) params.set("agenceId", filterAgence);
      const res = await fetch(`/api/lonaci-registries?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: Row[] };
      const rows = Array.isArray(data.items) ? data.items : [];
      const escapeCsv = (value: string | null | undefined) => {
        const raw = value ?? "";
        const escaped = raw.replace(/"/g, '""');
        return `"${escaped}"`;
      };
      const header = ["reference", "module", "titre", "statut", "agenceId", "concessionnaireId", "commentaire", "updatedAt"];
      const lines = rows.map((row) =>
        [
          escapeCsv(row.reference),
          escapeCsv(module),
          escapeCsv(row.titre),
          escapeCsv(row.statut),
          escapeCsv(row.agenceId),
          escapeCsv(row.concessionnaireId),
          escapeCsv(row.commentaire),
          escapeCsv(new Date(row.updatedAt).toISOString()),
        ].join(","),
      );
      const csv = [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `registre-${module.toLowerCase()}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify.success("Export CSV généré.");
    } catch (error) {
      notify.error(error, "Export CSV impossible.");
    } finally {
      setExporting(false);
    }
  }

  const columns: readonly DataTableColumn<Row>[] = [
    {
      id: "reference",
      header: "Référence",
      cell: (row) => <span className="font-mono text-xs font-semibold text-slate-700">{row.reference}</span>,
    },
    {
      id: "titre",
      header: "Titre",
      cell: (row) => (
        <div>
          <strong className="text-slate-950">{row.titre}</strong>
          {row.commentaire ? <p className="mt-1 text-xs text-slate-500">{row.commentaire}</p> : null}
        </div>
      ),
    },
    { id: "agence", header: "Agence", cell: (row) => row.agenceId ?? "—" },
    {
      id: "statut",
      header: "Statut",
      cell: (row) => <StatusBadge tone="brand">{row.statut}</StatusBadge>,
    },
    {
      id: "updatedAt",
      header: "Mise à jour",
      cell: (row) => new Date(row.updatedAt).toLocaleString("fr-FR"),
    },
    {
      id: "actions",
      header: "Actions",
      cell: (row) => (
        <div className="flex min-w-70 flex-wrap items-center gap-2">
          <select
            aria-label={`Changer le statut pour ${row.reference}`}
            value={row.statut}
            disabled={busyId === row.id}
            onChange={(event) => void patchStatut(row.id, event.target.value)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            {statuts.map((value) => <option key={value}>{value}</option>)}
          </select>
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={Pencil}
            disabled={busyId === row.id}
            onClick={() => {
              setEditingId(row.id);
              setEditTitre(row.titre);
              setEditCommentaire(row.commentaire ?? "");
            }}
          >
            Modifier
          </Button>
          <Button
            size="sm"
            variant="danger"
            leadingIcon={Trash2}
            disabled={busyId === row.id}
            onClick={() => setDeleteTarget({ id: row.id, reference: row.reference })}
          >
            Supprimer
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {!omitSectionHeader ? (
        <PageHeader eyebrow={`Registre ${module}`} title={title} description={description} />
      ) : null}

      <Surface elevated>
        <SectionHeader title="Nouvelle entrée" description="Ajoutez un dossier au registre sans quitter le module." />
        <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Titre / objet" required className="sm:col-span-2">
            <input
              required
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </FormField>
          <div className="sm:col-span-2">
            <ClientSearchPicker
              label={<span className="font-semibold text-slate-900">Client Lonaci (optionnel)</span>}
              selected={createClient}
              onSelectedChange={setCreateClient}
              filter="contrat"
              searchPlaceholder="Rechercher un client…"
            />
          </div>
          <FormField label="Agence">
            <select
              value={agenceId}
              onChange={(e) => setAgenceId(e.target.value)}
            >
              <option value="">—</option>
              {LONACI_AGENCES.filter((a) => a.value).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Statut initial">
            <select
              value={statut}
              onChange={(e) => setStatut(e.target.value)}
            >
              {statuts.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Commentaire" className="sm:col-span-2">
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
            />
          </FormField>
          <div className="sm:col-span-2">
            <Button type="submit" leadingIcon={FilePlus2} loading={creating}>Enregistrer</Button>
          </div>
        </form>
      </Surface>

      {error ? <FeedbackState tone="danger" title="Le registre est indisponible" description={error} /> : null}

      <Surface elevated>
        <SectionHeader title={`Registre (${total})`} description="Recherche, mise à jour, export et pagination." />
        <FilterBar
          search={{
            value: q,
            onChange: (value) => { setPage(1); setQ(value); },
            placeholder: "Référence, titre ou commentaire",
          }}
          filters={
            <>
          <select
            aria-label="Filtrer par statut"
            value={filterStatut}
            onChange={(e) => {
              setPage(1);
              setFilterStatut(e.target.value);
            }}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">Tous les statuts</option>
            {statuts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrer par agence"
            value={filterAgence}
            onChange={(e) => {
              setPage(1);
              setFilterAgence(e.target.value);
            }}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">Toutes les agences</option>
            {LONACI_AGENCES.filter((a) => a.value).map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
            </>
          }
          actions={<>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={RotateCcw}
            onClick={() => {
              setPage(1);
              setQ("");
              setFilterStatut("");
              setFilterAgence("");
            }}
          >
            Réinitialiser
          </Button>
          <Button leadingIcon={Download} size="sm" loading={exporting} disabled={loading} onClick={() => void exportCsv()}>
            Exporter CSV
          </Button>
          </>}
        />

        <div className="mt-4" aria-live="polite" aria-busy={loading}>
          {loading ? <Skeleton lines={6} /> : (
            <DataTable
              rows={items}
              columns={columns}
              rowKey={(row) => row.id}
              caption={`Registre ${module}`}
              getRowLabel={(row) => `${row.reference}, ${row.titre}`}
              mobileCard={(row) => (
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-mono text-xs text-slate-500">{row.reference}</p><h3 className="font-bold text-slate-950">{row.titre}</h3></div>
                    <StatusBadge tone="brand">{row.statut}</StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{row.commentaire ?? "Aucun commentaire"}</p>
                  <p className="mt-2 text-xs text-slate-500">{row.agenceId ?? "Sans agence"} · {new Date(row.updatedAt).toLocaleString("fr-FR")}</p>
                  <div className="mt-4">{columns[5]?.cell(row)}</div>
                </article>
              )}
            />
          )}
        </div>
        <div className="mt-4"><Pagination page={page} pageCount={totalPages} onPageChange={setPage} label={`Pages du registre ${module}`} /></div>
      </Surface>

      <Dialog
        open={Boolean(editingId)}
        onOpenChange={(open) => { if (!open && busyId !== editingId) setEditingId(null); }}
        title="Modifier l’entrée"
        description="Mettez à jour le titre et le commentaire."
        footer={<>
          <Button variant="secondary" disabled={busyId === editingId} onClick={() => setEditingId(null)}>Annuler</Button>
          <Button leadingIcon={Save} loading={busyId === editingId} onClick={() => void saveEdit()}>Enregistrer</Button>
        </>}
      >
        <div className="grid gap-4">
              <FormField label="Titre" required>
                <input
                  value={editTitre}
                  onChange={(e) => setEditTitre(e.target.value)}
                />
              </FormField>
              <FormField label="Commentaire">
                <textarea
                  rows={3}
                  value={editCommentaire}
                  onChange={(e) => setEditCommentaire(e.target.value)}
                />
              </FormField>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open && busyId !== deleteTarget?.id) setDeleteTarget(null); }}
        title="Supprimer l’entrée"
        message={<>L’entrée <strong>{deleteTarget?.reference}</strong> sera supprimée définitivement.</>}
        confirmLabel="Supprimer"
        destructive
        pending={busyId === deleteTarget?.id}
        onConfirm={() => deleteTarget ? deleteEntry(deleteTarget.id) : undefined}
      />
    </div>
  );
}
