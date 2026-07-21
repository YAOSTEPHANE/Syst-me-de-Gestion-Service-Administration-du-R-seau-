"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, PackageCheck, Send, Store, TicketCheck } from "lucide-react";

import { StatusBadge, type Tone } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { KpiCard } from "@/components/lonaci/ui/dashboard-cards";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
import { SCRATCH_CODE_STATUT_LABELS, type ScratchCodeStatut } from "@/lib/lonaci/constants";
import { notify } from "@/lib/toast";

type RefProduit = { code: string; libelle: string; actif: boolean };

type Dashboard = {
  codesDistribues: number;
  soldeRestant: number;
  lotsTotal: number;
  lotsEnAttenteAttribution: number;
  lotsActifs: number;
  alertesRupture: Array<{
    produitCode: string;
    soldeRestant: number;
    codesDistribues: number;
    seuil: number;
  }>;
  seuilAlerte: number;
  generatedAt: string;
};

type EligiblePdv = {
  id: string;
  codePdv: string;
  raisonSociale: string;
  agenceId: string | null;
  produitCode: string;
};

type ScratchLot = {
  id: string;
  lotId: string;
  concessionnaireId: string;
  produitCode: string;
  generatedCount: number;
  status: ScratchCodeStatut;
  attribueAt: string | null;
  createdAt: string;
  history: Array<{ action: string; at: string }>;
};

function statusTone(status: ScratchCodeStatut): Tone {
  if (status === "ATTRIBUE") return "info";
  if (status === "ACTIF") return "success";
  if (status === "EPUISE") return "warning";
  return "neutral";
}

export default function DispatcherGrattagePage() {
  const [produits, setProduits] = useState<RefProduit[]>([]);
  const [produitCode, setProduitCode] = useState("");
  const [pdvSearch, setPdvSearch] = useState("");
  const [eligible, setEligible] = useState<EligiblePdv[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [lots, setLots] = useState<ScratchLot[]>([]);
  const [selectedPdvId, setSelectedPdvId] = useState<string | null>(null);
  const [history, setHistory] = useState<{
    items: ScratchLot[];
    codesByStatus: Partial<Record<ScratchCodeStatut, number>>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attributingLot, setAttributingLot] = useState<string | null>(null);

  const selectedPdv = useMemo(
    () => eligible.find((p) => p.id === selectedPdvId) ?? null,
    [eligible, selectedPdvId],
  );

  const loadDashboard = useCallback(async () => {
    const res = await fetch("/api/scratch-codes/dashboard", { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error("Tableau de bord indisponible");
    setDashboard((await res.json()) as Dashboard);
  }, []);

  const loadLots = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", pageSize: "30", status: "GENERE" });
    if (produitCode) params.set("produitCode", produitCode);
    if (selectedPdvId) params.set("concessionnaireId", selectedPdvId);
    const res = await fetch(`/api/scratch-codes/lots?${params}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error("Lots indisponibles");
    const body = (await res.json()) as { items: ScratchLot[] };
    setLots(body.items ?? []);
  }, [produitCode, selectedPdvId]);

  const loadEligible = useCallback(async () => {
    if (!produitCode) {
      setEligible([]);
      return;
    }
    const params = new URLSearchParams({ produitCode, limit: "80" });
    if (pdvSearch.trim()) params.set("q", pdvSearch.trim());
    const res = await fetch(`/api/scratch-codes/eligible-concessionnaires?${params}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Liste éligible indisponible");
    const body = (await res.json()) as { items: EligiblePdv[] };
    setEligible(body.items ?? []);
  }, [produitCode, pdvSearch]);

  const loadHistory = useCallback(async (concessionnaireId: string) => {
    const params = new URLSearchParams({ concessionnaireId, page: "1", pageSize: "50" });
    const res = await fetch(`/api/scratch-codes/history?${params}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error("Historique indisponible");
    setHistory((await res.json()) as { items: ScratchLot[]; codesByStatus: Partial<Record<ScratchCodeStatut, number>> });
  }, []);

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      const refRes = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
      if (!refRes.ok) throw new Error("Référentiels indisponibles");
      const refBody = (await refRes.json()) as { produits: RefProduit[] };
      const active = (refBody.produits ?? []).filter((p) => p.actif);
      setProduits(active);
      if (!produitCode && active[0]) setProduitCode(active[0].code);
      await Promise.all([loadDashboard(), loadLots(), loadEligible()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!produitCode) return;
    void loadEligible();
  }, [produitCode, pdvSearch, loadEligible]);

  useEffect(() => {
    if (!produitCode) return;
    void loadLots();
  }, [produitCode, selectedPdvId, loadLots]);

  useEffect(() => {
    if (!selectedPdvId) {
      setHistory(null);
      return;
    }
    void loadHistory(selectedPdvId);
  }, [selectedPdvId, loadHistory]);

  async function onAttribuerLot(e: FormEvent, lotId: string, concessionnaireId: string) {
    e.preventDefault();
    setAttributingLot(lotId);
    try {
      const res = await fetch(`/api/scratch-codes/lots/${encodeURIComponent(lotId)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus: "ATTRIBUE" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Attribution impossible");
      }
      await Promise.all([loadDashboard(), loadLots(), selectedPdvId ? loadHistory(selectedPdvId) : Promise.resolve()]);
      if (concessionnaireId === selectedPdvId) void loadHistory(concessionnaireId);
      notify.success("Lot attribué avec succès.");
    } catch (err) {
      notify.error(err, "Attribution impossible.");
    } finally {
      setAttributingLot(null);
    }
  }

  const lotActions = (lot: ScratchLot) =>
    selectedPdv && lot.produitCode === produitCode ? (
      <Button
        size="sm"
        leadingIcon={Send}
        loading={attributingLot === lot.lotId}
        onClick={(event) => void onAttribuerLot(event, lot.lotId, selectedPdv.id)}
      >
        Attribuer
      </Button>
    ) : <span className="text-sm text-slate-400">Sélectionnez un PDV</span>;
  const lotColumns: readonly DataTableColumn<ScratchLot>[] = [
    { id: "lot", header: "Lot", cell: (lot) => <span className="font-mono text-xs font-semibold">{lot.lotId}</span> },
    { id: "produit", header: "Produit", cell: (lot) => lot.produitCode },
    { id: "quantite", header: "Quantité", cell: (lot) => lot.generatedCount, align: "right" },
    { id: "pdv", header: "PDV cible", cell: (lot) => selectedPdv && lot.produitCode === produitCode ? `${selectedPdv.codePdv} — ${selectedPdv.raisonSociale}` : "À sélectionner" },
    { id: "action", header: "Action", cell: lotActions },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHeader eyebrow="Dispatcher" title="Distribution des codes grattage" description="Attribution en temps réel, concessionnaires éligibles par produit, suivi des stocks et alertes de rupture." />

      {error ? <FeedbackState tone="danger" title="Données indisponibles" description={error} action={<Button variant="secondary" onClick={() => void refreshAll()}>Réessayer</Button>} /> : null}

      {dashboard ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Codes distribués" value={dashboard.codesDistribues} icon={TicketCheck} />
          <KpiCard label="Solde restant" value={dashboard.soldeRestant} icon={Boxes} detail="Codes non attribués" />
          <KpiCard label="Lots en attente" value={dashboard.lotsEnAttenteAttribution} icon={PackageCheck} />
          <KpiCard label="Lots actifs" value={dashboard.lotsActifs} icon={Store} />
        </section>
      ) : loading ? <Skeleton lines={4} /> : null}

      {dashboard && dashboard.alertesRupture.length > 0 ? (
        <FeedbackState tone="warning" title={`Alertes rupture (solde < ${dashboard.seuilAlerte} codes)`} description={
          <ul className="mt-2 space-y-1 text-sm">
            {dashboard.alertesRupture.map((a) => (
              <li key={a.produitCode}>
                <strong>{a.produitCode}</strong> — solde {a.soldeRestant} · déjà distribués {a.codesDistribues}
              </li>
            ))}
          </ul>
        } />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <Surface elevated>
          <SectionHeader title="Concessionnaires éligibles" description="Contrat actif et enregistrement GPR validé pour le produit." />
          <FilterBar
            search={{ value: pdvSearch, onChange: setPdvSearch, placeholder: "Code ou raison sociale", label: "Rechercher un PDV" }}
            filters={
              <select
                aria-label="Filtrer par produit"
                value={produitCode}
                onChange={(e) => {
                  setProduitCode(e.target.value);
                  setSelectedPdvId(null);
                }}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
              >
                {produits.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.libelle}
                  </option>
                ))}
              </select>
            }
          />
          <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
            {eligible.length === 0 ? (
              <li>{loading ? <Skeleton lines={3} /> : <FeedbackState title="Aucun PDV éligible" description="Modifiez le produit ou la recherche." />}</li>
            ) : (
              eligible.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPdvId(p.id)}
                    className={`min-h-11 w-full rounded-xl border px-3 py-3 text-left transition ${
                      selectedPdvId === p.id
                        ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <span className="font-mono text-[11px] text-slate-600">{p.codePdv}</span>
                    <span className="ml-2 font-medium text-slate-900">{p.raisonSociale}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Surface>

        <Surface elevated>
          <SectionHeader title="Historique PDV" description={selectedPdv ? `${selectedPdv.codePdv} — ${selectedPdv.raisonSociale}` : "Sélectionnez un concessionnaire."} />
          {selectedPdv ? (
            null
          ) : <FeedbackState title="Aucun PDV sélectionné" description="Choisissez un concessionnaire éligible dans la liste." />}
          {history && selectedPdv ? (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(SCRATCH_CODE_STATUT_LABELS) as ScratchCodeStatut[]).map((s) => (
                  <StatusBadge key={s} tone={statusTone(s)}>{SCRATCH_CODE_STATUT_LABELS[s]} · {history.codesByStatus[s] ?? 0}</StatusBadge>
                ))}
              </div>
              <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto text-sm">
                {history.items.map((lot) => (
                  <li key={lot.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="font-mono">{lot.lotId}</span> · {lot.generatedCount} codes ·{" "}
                    <StatusBadge tone={statusTone(lot.status)}>{SCRATCH_CODE_STATUT_LABELS[lot.status]}</StatusBadge>
                    {lot.attribueAt ? (
                      <span className="ml-1 text-slate-500">
                        attribué {new Date(lot.attribueAt).toLocaleString("fr-FR")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Surface>
      </section>

      <Surface elevated>
        <SectionHeader title="Lots à attribuer en temps réel" description="Lots générés — sélectionnez un PDV éligible puis attribuez le lot." />
        <div aria-live="polite" aria-busy={loading}>
          {loading ? <Skeleton lines={5} /> : (
            <DataTable
              rows={lots}
              columns={lotColumns}
              rowKey={(lot) => lot.id}
              caption="Lots de codes à attribuer"
              mobileCard={(lot) => (
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-slate-500">{lot.lotId}</p><h3 className="font-bold">{lot.produitCode}</h3></div><StatusBadge tone="neutral">{lot.generatedCount} codes</StatusBadge></div>
                  <p className="mt-3 text-sm text-slate-600">{selectedPdv && lot.produitCode === produitCode ? `${selectedPdv.codePdv} — ${selectedPdv.raisonSociale}` : "Choisissez un PDV éligible"}</p>
                  <div className="mt-4">{lotActions(lot)}</div>
                </article>
              )}
            />
          )}
        </div>
      </Surface>

      <p className="flex items-center gap-2 text-xs text-slate-500" role="status">
        <AlertTriangle size={15} aria-hidden="true" />
        Dernière mise à jour tableau de bord :{" "}
        {dashboard ? new Date(dashboard.generatedAt).toLocaleString("fr-FR") : "—"}
      </p>
    </div>
  );
}
