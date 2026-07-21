"use client";

import Link from "next/link";
import { Download, FileCheck2, PauseCircle, PlayCircle, RotateCcw, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatusBadge, type Tone } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { KpiCard } from "@/components/lonaci/ui/dashboard-cards";
import { ConfirmDialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Pagination } from "@/components/lonaci/ui/pagination";
import { Surface } from "@/components/lonaci/ui/surface";
import {
  GRATTAGE_CONTRAT_STATUT_LABELS,
  GRATTAGE_CONTRAT_STATUTS_SPEC_93,
  type GrattageContratStatut,
} from "@/lib/lonaci/constants";
import { notify } from "@/lib/toast";

type RefAgence = { id: string; code: string; libelle: string };

type ContratRow = {
  id: string;
  reference: string;
  concessionnaireId: string;
  codePdv: string;
  raisonSociale: string;
  agenceId: string | null;
  produitCode: string;
  statut: GrattageContratStatut;
  statutLabel: string;
  dateDebut: string;
  dateFin: string | null;
  createdAt: string;
};

function statutTone(statut: GrattageContratStatut): Tone {
  if (statut === "EN_COURS") return "success";
  if (statut === "SUSPENDU") return "warning";
  if (statut === "RESILIE") return "danger";
  return "neutral";
}

export default function ContratsGrattagePanel() {
  const [agences, setAgences] = useState<RefAgence[]>([]);
  const [items, setItems] = useState<ContratRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [transitionTarget, setTransitionTarget] = useState<{
    id: string;
    reference: string;
    statut: GrattageContratStatut;
  } | null>(null);

  const [filterAgenceId, setFilterAgenceId] = useState("");
  const [filterConcessionnaireId, setFilterConcessionnaireId] = useState("");
  const [filterStatut, setFilterStatut] = useState<"" | GrattageContratStatut>("");

  const exportHref = useMemo(() => {
    const p = new URLSearchParams({ format: "pdf" });
    if (filterAgenceId) p.set("agenceId", filterAgenceId);
    if (filterConcessionnaireId.trim()) p.set("concessionnaireId", filterConcessionnaireId.trim());
    if (filterStatut) p.set("statut", filterStatut);
    return `/api/grattage-contrats/export?${p}`;
  }, [filterAgenceId, filterConcessionnaireId, filterStatut]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (filterAgenceId) params.set("agenceId", filterAgenceId);
      if (filterConcessionnaireId.trim()) params.set("concessionnaireId", filterConcessionnaireId.trim());
      if (filterStatut) params.set("statut", filterStatut);
      const res = await fetch(`/api/grattage-contrats?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Chargement des contrats impossible");
      const body = (await res.json()) as { items: ContratRow[]; total: number };
      setItems(body.items ?? []);
      setTotal(body.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [filterAgenceId, filterConcessionnaireId, filterStatut, page]);

  useEffect(() => {
    void (async () => {
      try {
        const refRes = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (refRes.ok) {
          const ref = (await refRes.json()) as { agences: RefAgence[] };
          setAgences((ref.agences ?? []).filter((a) => a.id));
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function onTransition(id: string, targetStatut: GrattageContratStatut) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/grattage-contrats/${encodeURIComponent(id)}/statut`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatut, comment: null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Transition refusée");
      }
      await loadList();
      notify.success(`Contrat passé au statut « ${GRATTAGE_CONTRAT_STATUT_LABELS[targetStatut]} ».`);
      setTransitionTarget(null);
    } catch (error) {
      notify.error(error, "Transition du contrat impossible.");
    } finally {
      setBusyId(null);
    }
  }

  const kpis = useMemo(() => {
    const byStatut = Object.fromEntries(GRATTAGE_CONTRAT_STATUTS_SPEC_93.map((s) => [s.statut, 0])) as Record<
      GrattageContratStatut,
      number
    >;
    for (const row of items) byStatut[row.statut] = (byStatut[row.statut] ?? 0) + 1;
    return byStatut;
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const transitionActions = (row: ContratRow) => (
    <div className="flex flex-wrap gap-2">
      {row.statut === "EN_COURS" ? (
        <>
          <Button size="sm" variant="secondary" leadingIcon={PauseCircle} disabled={busyId === row.id} onClick={() => setTransitionTarget({ id: row.id, reference: row.reference, statut: "SUSPENDU" })}>Suspendre</Button>
          <Button size="sm" variant="danger" leadingIcon={XCircle} disabled={busyId === row.id} onClick={() => setTransitionTarget({ id: row.id, reference: row.reference, statut: "RESILIE" })}>Résilier</Button>
        </>
      ) : null}
      {row.statut === "SUSPENDU" ? (
        <Button size="sm" leadingIcon={PlayCircle} disabled={busyId === row.id} onClick={() => setTransitionTarget({ id: row.id, reference: row.reference, statut: "EN_COURS" })}>Reprendre</Button>
      ) : null}
    </div>
  );
  const columns: readonly DataTableColumn<ContratRow>[] = [
    { id: "reference", header: "Référence", cell: (row) => <span className="font-mono text-xs font-semibold">{row.reference}</span> },
    { id: "pdv", header: "Point de vente", cell: (row) => <div><span className="font-mono text-xs text-slate-500">{row.codePdv}</span><strong className="block">{row.raisonSociale}</strong></div> },
    { id: "produit", header: "Produit", cell: (row) => row.produitCode },
    { id: "statut", header: "Statut", cell: (row) => <StatusBadge tone={statutTone(row.statut)}>{row.statutLabel}</StatusBadge> },
    { id: "debut", header: "Début", cell: (row) => new Date(row.dateDebut).toLocaleDateString("fr-FR") },
    { id: "fin", header: "Fin", cell: (row) => row.dateFin ? new Date(row.dateFin).toLocaleDateString("fr-FR") : "—" },
    { id: "actions", header: "Actions", cell: transitionActions },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contrats grattage"
        title="Liste et cycle de vie des contrats"
        description={<>Filtres par agence, concessionnaire et statut. Création automatique à la validation GPR finale (<Link href="/gpr" className="font-semibold text-orange-700 underline">module GPR</Link>).</>}
        actions={<a href={exportHref} className="lonaci-ui-button lonaci-ui-button--primary lonaci-ui-button--md"><Download size={18} aria-hidden="true" />Exporter en PDF</a>}
      />

      {error ? <FeedbackState tone="danger" title="Chargement impossible" description={error} action={<Button variant="secondary" onClick={() => void loadList()}>Réessayer</Button>} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicateurs des contrats">
        {GRATTAGE_CONTRAT_STATUTS_SPEC_93.map((item) => <KpiCard key={item.statut} label={item.label} value={kpis[item.statut] ?? 0} icon={FileCheck2} />)}
      </section>

      <Surface elevated>
        <SectionHeader title="Registre des contrats" description={`${total} contrat(s) · ${items.length} affiché(s) sur cette page`} />
        <FilterBar
          filters={<>
            <select aria-label="Filtrer par agence" value={filterAgenceId} onChange={(event) => { setPage(1); setFilterAgenceId(event.target.value); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
              <option value="">Toutes les agences</option>
              {agences.map((agence) => <option key={agence.id} value={agence.id}>{agence.libelle}</option>)}
            </select>
            <input aria-label="Filtrer par identifiant concessionnaire" value={filterConcessionnaireId} onChange={(event) => { setPage(1); setFilterConcessionnaireId(event.target.value); }} placeholder="ID concessionnaire" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs" />
            <select aria-label="Filtrer par statut" value={filterStatut} onChange={(event) => { setPage(1); setFilterStatut(event.target.value as "" | GrattageContratStatut); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3">
              <option value="">Tous les statuts</option>
              {GRATTAGE_CONTRAT_STATUTS_SPEC_93.map((item) => <option key={item.statut} value={item.statut}>{item.label}</option>)}
            </select>
          </>}
          actions={<Button variant="secondary" size="sm" leadingIcon={RotateCcw} onClick={() => { setPage(1); setFilterAgenceId(""); setFilterConcessionnaireId(""); setFilterStatut(""); }}>Réinitialiser</Button>}
        />
        <div className="mt-4" aria-live="polite" aria-busy={loading}>
          {loading ? <Skeleton lines={7} /> : (
            <DataTable
              rows={items}
              columns={columns}
              rowKey={(row) => row.id}
              caption="Contrats grattage"
              getRowLabel={(row) => `${row.reference}, ${row.raisonSociale}`}
              mobileCard={(row) => (
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-mono text-xs text-slate-500">{row.reference}</p><h3 className="font-bold">{row.raisonSociale}</h3><p className="text-sm text-slate-600">{row.codePdv} · {row.produitCode}</p></div>
                    <StatusBadge tone={statutTone(row.statut)}>{row.statutLabel}</StatusBadge>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Du {new Date(row.dateDebut).toLocaleDateString("fr-FR")} au {row.dateFin ? new Date(row.dateFin).toLocaleDateString("fr-FR") : "—"}</p>
                  <div className="mt-4">{transitionActions(row)}</div>
                </article>
              )}
            />
          )}
        </div>
        <div className="mt-4"><Pagination page={page} pageCount={totalPages} onPageChange={setPage} label="Pages des contrats grattage" /></div>
      </Surface>

      <ConfirmDialog
        open={Boolean(transitionTarget)}
        onOpenChange={(open) => { if (!open && busyId !== transitionTarget?.id) setTransitionTarget(null); }}
        title="Confirmer le changement de statut"
        message={<>Passer le contrat <strong>{transitionTarget?.reference}</strong> au statut « {transitionTarget ? GRATTAGE_CONTRAT_STATUT_LABELS[transitionTarget.statut] : ""} » ?</>}
        confirmLabel="Confirmer"
        destructive={transitionTarget?.statut === "RESILIE"}
        pending={busyId === transitionTarget?.id}
        onConfirm={() => transitionTarget ? onTransition(transitionTarget.id, transitionTarget.statut) : undefined}
      />
    </div>
  );
}
