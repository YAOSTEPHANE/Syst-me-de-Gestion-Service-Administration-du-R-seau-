"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Building2, Download, Pencil, Plus, Power, Save, Trash2, X } from "lucide-react";

import { Badge, StatusBadge } from "@/components/lonaci/ui/badge";
import { Button, IconButton } from "@/components/lonaci/ui/button";
import { ConfirmDialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { FormField } from "@/components/lonaci/ui/form-field";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import type { AgenceZoneGeographique } from "@/lib/lonaci/types";
import { notify } from "@/lib/toast";

interface AgenceRow {
  _id: string;
  code: string;
  libelle: string;
  zoneGeographique: AgenceZoneGeographique;
  actif: boolean;
}

const PAGE_SIZE = 8;

function libelleZoneGeographique(z: AgenceZoneGeographique): string {
  return z === "ABIDJAN" ? "Abidjan" : "Intérieur";
}

export default function AdminAgencesPanel() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [agences, setAgences] = useState<AgenceRow[]>([]);
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [createZone, setCreateZone] = useState<AgenceZoneGeographique>("INTERIEUR");
  const [createActif, setCreateActif] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLibelle, setEditLibelle] = useState("");
  const [editZone, setEditZone] = useState<AgenceZoneGeographique>("INTERIEUR");
  const [editActif, setEditActif] = useState(true);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [togglingActifId, setTogglingActifId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgenceRow | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/agences", { credentials: "include", cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setVisible(false);
        return;
      }
      if (!res.ok) {
        setVisible(false);
        return;
      }
      const data = (await res.json()) as { agences: AgenceRow[] };
      setAgences(Array.isArray(data.agences) ? data.agences : []);
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const c = code.trim();
    const l = libelle.trim();
    if (c.length < 2 || l.length < 2) {
      setError("Code et libellé : au moins 2 caractères.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/agences", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, libelle: l, zoneGeographique: createZone, actif: createActif }),
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; agence?: AgenceRow; issues?: { message: string }[] }
        | null;
      if (res.status === 409) {
        notify.error(body?.message ?? "Ce code agence existe déjà.");
        return;
      }
      if (!res.ok) {
        const msg =
          body?.message ??
          (body?.issues?.[0]?.message ? `Données invalides : ${body.issues[0].message}` : "Création impossible.");
        notify.error(msg);
        return;
      }
      if (body?.agence?._id) {
        setAgences((prev) => [...prev, body.agence!].sort((a, b) => a.code.localeCompare(b.code, "fr")));
      } else {
        await load();
      }
      setCode("");
      setLibelle("");
      setCreateZone("INTERIEUR");
      setCreateActif(true);
      notify.success(`Agence « ${body?.agence?.code ?? c} » créée.`);
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(a: AgenceRow) {
    setError(null);
    setEditingId(a._id);
    setEditCode(a.code);
    setEditLibelle(a.libelle);
    setEditZone(a.zoneGeographique);
    setEditActif(a.actif);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCode("");
    setEditLibelle("");
    setEditZone("INTERIEUR");
    setEditActif(true);
    setSavingEditId(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setError(null);
    const c = editCode.trim();
    const l = editLibelle.trim();
    if (c.length < 2 || l.length < 2) {
      setError("Code et libellé : au moins 2 caractères.");
      return;
    }
    setSavingEditId(editingId);
    try {
      const res = await fetch(`/api/admin/agences/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, libelle: l, zoneGeographique: editZone, actif: editActif }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; agence?: AgenceRow } | null;
      if (res.status === 409) {
        notify.error(body?.message ?? "Ce code agence est déjà utilisé.");
        return;
      }
      if (!res.ok) {
        notify.error(body?.message ?? "Enregistrement impossible.");
        return;
      }
      if (body?.agence?._id) {
        setAgences((prev) =>
          prev
            .map((row) => (row._id === body.agence!._id ? body.agence! : row))
            .sort((a, b) => a.code.localeCompare(b.code, "fr")),
        );
        notify.success(`Agence « ${body.agence.code} » mise à jour.`);
        window.dispatchEvent(new Event("lonaci:data-imported"));
      } else {
        await load();
        window.dispatchEvent(new Event("lonaci:data-imported"));
      }
      cancelEdit();
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setSavingEditId(null);
    }
  }

  async function patchAgenceActif(a: AgenceRow, actif: boolean) {
    if (editingId) return;
    setError(null);
    setTogglingActifId(a._id);
    try {
      const res = await fetch(`/api/admin/agences/${encodeURIComponent(a._id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: a.code,
          libelle: a.libelle,
          zoneGeographique: a.zoneGeographique,
          actif,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; agence?: AgenceRow } | null;
      if (!res.ok) {
        notify.error(body?.message ?? "Mise à jour du statut impossible.");
        return;
      }
      if (body?.agence?._id) {
        setAgences((prev) =>
          prev.map((row) => (row._id === body.agence!._id ? body.agence! : row)).sort((a, b) => a.code.localeCompare(b.code, "fr")),
        );
        notify.success(`Agence « ${a.code} » : ${actif ? "active" : "inactive"}.`);
        window.dispatchEvent(new Event("lonaci:data-imported"));
      } else {
        await load();
        window.dispatchEvent(new Event("lonaci:data-imported"));
      }
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setTogglingActifId(null);
    }
  }

  async function deleteAgence(a: AgenceRow) {
    if (editingId) return;
    setError(null);
    setDeletingId(a._id);
    try {
      const res = await fetch(`/api/admin/agences/${encodeURIComponent(a._id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (res.status === 409) {
        notify.error(body?.message ?? "Suppression impossible : l’agence est encore utilisée.");
        return;
      }
      if (res.status === 404) {
        notify.error(body?.message ?? "Agence introuvable.");
        await load();
        return;
      }
      if (!res.ok) {
        notify.error(body?.message ?? "Suppression impossible.");
        return;
      }
      setAgences((prev) => prev.filter((row) => row._id !== a._id));
      notify.success(`Agence « ${a.code} » supprimée.`);
      window.dispatchEvent(new Event("lonaci:data-imported"));
      setDeleteTarget(null);
    } catch {
      notify.error("Erreur réseau ou serveur.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading || !visible) return null;

  const inputClass =
    "lonaci-ui-input";
  const query = search.trim().toLocaleLowerCase("fr");
  const filtered = agences.filter((agence) => {
    if (statusFilter === "ACTIVE" && !agence.actif) return false;
    if (statusFilter === "INACTIVE" && agence.actif) return false;
    return !query || `${agence.code} ${agence.libelle}`.toLocaleLowerCase("fr").includes(query);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const activeCount = agences.filter((agence) => agence.actif).length;
  const busy = editingId !== null || deletingId !== null || togglingActifId !== null || savingEditId !== null;

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Administration · Référentiel"
        title="Agences"
        description="Gérez les agences, leur zone géographique et leur disponibilité dans les parcours métier."
        actions={
          <Button
            variant="secondary"
            leadingIcon={Download}
            onClick={() => window.open("/api/admin/agences/export", "_blank", "noopener,noreferrer")}
          >
            Export PDF
          </Button>
        }
      />

      <Surface padding="lg" elevated>
        <SectionHeader
          title="Nouvelle agence"
          description="Le code est automatiquement normalisé en majuscules. Création réservée au chef de service."
        />
        <form onSubmit={onCreate} className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5 xl:items-end">
          <FormField label="Code agence" htmlFor="agence-code" required>
          <input
            id="agence-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ex. ABIDJAN"
            maxLength={32}
            className={inputClass}
            autoComplete="off"
          />
          </FormField>
          <FormField label="Libellé" htmlFor="agence-libelle" required>
          <input
            id="agence-libelle"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Ex. Agence Abidjan Centre"
            maxLength={200}
            className={inputClass}
          />
          </FormField>
          <FormField label="Zone" htmlFor="agence-zone" required>
          <select
            id="agence-zone"
            value={createZone}
            onChange={(e) => setCreateZone(e.target.value as AgenceZoneGeographique)}
            className={inputClass}
          >
            <option value="ABIDJAN">Abidjan</option>
            <option value="INTERIEUR">Intérieur</option>
          </select>
          </FormField>
          <FormField label="Statut" htmlFor="agence-statut" required>
          <select
            id="agence-statut"
            value={createActif ? "true" : "false"}
            onChange={(e) => setCreateActif(e.target.value === "true")}
            className={inputClass}
          >
            <option value="true">Actif</option>
            <option value="false">Inactif</option>
          </select>
          </FormField>
          <Button type="submit" leadingIcon={Plus} loading={creating}>Créer l’agence</Button>
        </form>
      </Surface>

      {error ? (
        <FeedbackState tone="danger" title="Action impossible" description={error} />
      ) : null}

      <Surface padding="none" elevated className="lonaci-ui-data-table">
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3">
          <div><p className="text-xs text-slate-500">Total</p><p className="text-xl font-semibold text-slate-950">{agences.length}</p></div>
          <div><p className="text-xs text-slate-500">Actives</p><p className="text-xl font-semibold text-emerald-700">{activeCount}</p></div>
          <div><p className="text-xs text-slate-500">Inactives</p><p className="text-xl font-semibold text-slate-700">{agences.length - activeCount}</p></div>
        </div>
        <FilterBar
          className="border-b border-slate-200"
          search={{ value: search, onChange: (value) => { setSearch(value); setPage(1); }, placeholder: "Code ou libellé…", label: "Rechercher une agence" }}
          filters={
            <FormField label="Statut" htmlFor="agence-filter-status" className="min-w-44">
              <select id="agence-filter-status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1); }} className={inputClass}>
                <option value="ALL">Tous les statuts</option>
                <option value="ACTIVE">Actives</option>
                <option value="INACTIVE">Inactives</option>
              </select>
            </FormField>
          }
          actions={<Badge tone="info">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</Badge>}
        />
        {pageRows.length === 0 ? (
          <FeedbackState className="m-4" title="Aucune agence" description="Aucune agence ne correspond aux critères actuels." />
        ) : (
          <>
          <div className="lonaci-ui-table-scroll lonaci-ui-table-scroll--has-mobile">
        <table>
          <caption className="lonaci-ui-sr-only">Référentiel des agences</caption>
          <thead>
            <tr>
              <th>Code</th><th>Libellé</th><th>Zone</th><th>Statut</th><th>ID</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
              {pageRows.map((a) => {
                const isEditing = editingId === a._id;
                return (
                  <tr key={a._id}>
                    <td>
                      {isEditing ? (
                        <input
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                          maxLength={32}
                          className={`${inputClass} min-w-28 font-mono`}
                          aria-label={`Code agence ${a._id}`}
                          autoComplete="off"
                        />
                      ) : (
                        <span className="font-mono font-medium">{a.code}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          value={editLibelle}
                          onChange={(e) => setEditLibelle(e.target.value)}
                          maxLength={200}
                          className={`${inputClass} min-w-44`}
                          aria-label={`Libellé agence ${a._id}`}
                        />
                      ) : (
                        a.libelle
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          value={editZone}
                          onChange={(e) => setEditZone(e.target.value as AgenceZoneGeographique)}
                          className={`${inputClass} min-w-32`}
                          aria-label={`Zone agence ${a._id}`}
                        >
                          <option value="ABIDJAN">Abidjan</option>
                          <option value="INTERIEUR">Intérieur</option>
                        </select>
                      ) : (
                        <Badge tone="info">{libelleZoneGeographique(a.zoneGeographique)}</Badge>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          value={editActif ? "true" : "false"}
                          onChange={(e) => setEditActif(e.target.value === "true")}
                          className={`${inputClass} min-w-28`}
                          aria-label={`Statut agence ${a._id}`}
                        >
                          <option value="true">Actif</option>
                          <option value="false">Inactif</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={a.actif ? "success" : "neutral"}>{a.actif ? "Actif" : "Inactif"}</StatusBadge>
                          <IconButton
                            icon={Power}
                            label={a.actif ? "Rendre inactive" : "Rendre active"}
                            size="sm"
                            onClick={() => void patchAgenceActif(a, !a.actif)}
                            disabled={busy}
                          />
                        </div>
                      )}
                    </td>
                    <td
                      className="max-w-32 truncate font-mono text-xs text-slate-500"
                      title={a._id}
                    >
                      {a._id}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <IconButton
                            icon={Save}
                            label="Enregistrer l’agence"
                            variant="primary"
                            disabled={savingEditId !== null}
                            onClick={() => void saveEdit()}
                          />
                          <IconButton
                            icon={X}
                            label="Annuler la modification"
                            disabled={savingEditId !== null}
                            onClick={cancelEdit}
                          />
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <IconButton
                            icon={Pencil}
                            label={`Modifier ${a.code}`}
                            onClick={() => startEdit(a)}
                            disabled={editingId !== null || deletingId !== null || togglingActifId !== null}
                            title={editingId !== null ? "Terminez l’édition en cours" : undefined}
                          />
                          <IconButton
                            icon={Trash2}
                            label={`Supprimer ${a.code}`}
                            variant="danger"
                            onClick={() => setDeleteTarget(a)}
                            disabled={editingId !== null || deletingId !== null || togglingActifId !== null}
                            title="Supprimer si l’agence n’est plus utilisée"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <div className="lonaci-ui-table-mobile" role="list" aria-label="Référentiel des agences">
        {pageRows.map((a) => (
          <Surface key={a._id} padding="md" elevated>
            {editingId === a._id ? (
              <div className="grid gap-3">
                <FormField label="Code" htmlFor={`mobile-agence-code-${a._id}`} required>
                  <input id={`mobile-agence-code-${a._id}`} value={editCode} onChange={(event) => setEditCode(event.target.value)} maxLength={32} className={inputClass} />
                </FormField>
                <FormField label="Libellé" htmlFor={`mobile-agence-libelle-${a._id}`} required>
                  <input id={`mobile-agence-libelle-${a._id}`} value={editLibelle} onChange={(event) => setEditLibelle(event.target.value)} maxLength={200} className={inputClass} />
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Zone" htmlFor={`mobile-agence-zone-${a._id}`} required>
                    <select id={`mobile-agence-zone-${a._id}`} value={editZone} onChange={(event) => setEditZone(event.target.value as AgenceZoneGeographique)} className={inputClass}>
                      <option value="ABIDJAN">Abidjan</option><option value="INTERIEUR">Intérieur</option>
                    </select>
                  </FormField>
                  <FormField label="Statut" htmlFor={`mobile-agence-status-${a._id}`} required>
                    <select id={`mobile-agence-status-${a._id}`} value={editActif ? "true" : "false"} onChange={(event) => setEditActif(event.target.value === "true")} className={inputClass}>
                      <option value="true">Actif</option><option value="false">Inactif</option>
                    </select>
                  </FormField>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={savingEditId !== null}>Annuler</Button>
                  <Button size="sm" leadingIcon={Save} onClick={() => void saveEdit()} loading={savingEditId === a._id}>Enregistrer</Button>
                </div>
              </div>
            ) : (
            <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3"><Building2 className="mt-0.5 text-cyan-700" size={20} /><div><p className="font-mono text-sm font-semibold">{a.code}</p><p className="text-sm text-slate-600">{a.libelle}</p></div></div>
              <StatusBadge tone={a.actif ? "success" : "neutral"}>{a.actif ? "Actif" : "Inactif"}</StatusBadge>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2"><Badge tone="info">{libelleZoneGeographique(a.zoneGeographique)}</Badge><div className="flex gap-1">
              <IconButton icon={Power} label={a.actif ? "Rendre inactive" : "Rendre active"} size="sm" onClick={() => void patchAgenceActif(a, !a.actif)} disabled={busy} />
              <IconButton icon={Pencil} label={`Modifier ${a.code}`} size="sm" onClick={() => startEdit(a)} disabled={busy} />
              <IconButton icon={Trash2} label={`Supprimer ${a.code}`} size="sm" variant="danger" onClick={() => setDeleteTarget(a)} disabled={busy} />
            </div></div>
            </>
            )}
          </Surface>
        ))}
      </div>
      <div className="p-4"><Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} label="Pagination des agences" /></div>
      </>
        )}
      </Surface>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && deletingId === null) setDeleteTarget(null); }}
        title="Supprimer définitivement l’agence ?"
        description={deleteTarget ? `${deleteTarget.code} — ${deleteTarget.libelle}` : undefined}
        message="Cette action est irréversible et n’est possible que si aucun PDV, utilisateur, dossier ou autre enregistrement n’est rattaché à cette agence."
        confirmLabel="Supprimer l’agence"
        destructive
        pending={deleteTarget !== null && deletingId === deleteTarget._id}
        onConfirm={async () => { if (deleteTarget) await deleteAgence(deleteTarget); }}
      />
    </section>
  );
}
