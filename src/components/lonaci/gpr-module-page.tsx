"use client";

import ClientSearchPicker, {
  pickProduitCodeFromClient,
  type ClientPickerRow,
} from "@/components/lonaci/client-search-picker";
import {
  Activity,
  Ban,
  CheckCircle2,
  Download,
  FilePlus2,
  Files,
  PackageCheck,
  Plus,
  RefreshCw,
  Send,
  TicketCheck,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { StatusBadge, type Tone } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { DataTable, type DataTableColumn } from "@/components/lonaci/ui/data-table";
import { KpiCard } from "@/components/lonaci/ui/dashboard-cards";
import { Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FormField } from "@/components/lonaci/ui/form-field";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
import {
  SCRATCH_CODE_STATUT_LABELS,
  type LonaciRole,
  type ScratchCodeStatut,
} from "@/lib/lonaci/constants";
import {
  canShowScratchLotTransition,
  getAssignedWorkflowTarget,
  parseLonaciRole,
  workflowActionLabelForTarget,
} from "@/lib/lonaci/workflow-ui-policy";
import { notify } from "@/lib/toast";

type RefProduit = { code: string; libelle: string; actif: boolean };
type RefConcessionnaire = { id: string; codePdv: string; raisonSociale: string };

type GprStatus = "SOUMIS_AGENT" | "VALIDE_N1" | "VALIDE_N2" | "SUIVI_CHEF_SERVICE" | "REJETE";
type ScratchStatus = "GENERE" | "ATTRIBUE" | "ACTIF" | "EPUISE";

type GprItem = {
  id: string;
  reference: string;
  concessionnaireId: string;
  produitsActifs: string[];
  dateEnregistrement: string;
  status: GprStatus;
  sync: {
    state: "PENDING" | "SUCCESS" | "FAILED";
    attempts: number;
    lastError: string | null;
    lastSuccessAt: string | null;
  };
  createdAt: string;
};

type ScratchItem = {
  id: string;
  lotId: string;
  concessionnaireId: string;
  produitCode: string;
  requestedCount: number;
  generatedCount: number;
  status: ScratchStatus;
  createdAt: string;
  history: Array<{ action: string; at: string }>;
};

function gprStatusTone(status: GprStatus): Tone {
  if (status === "SOUMIS_AGENT") return "warning";
  if (status === "VALIDE_N1" || status === "VALIDE_N2") return "info";
  if (status === "SUIVI_CHEF_SERVICE") return "success";
  return "danger";
}

function scratchStatusTone(status: ScratchStatus): Tone {
  if (status === "ATTRIBUE") return "info";
  if (status === "ACTIF") return "success";
  if (status === "EPUISE") return "warning";
  return "neutral";
}

function syncStateTone(state: "PENDING" | "SUCCESS" | "FAILED"): Tone {
  if (state === "SUCCESS") return "success";
  if (state === "FAILED") return "danger";
  return "warning";
}

function pickProduitCodesFromClient(
  row: ClientPickerRow | null,
  availableProduitCodes: readonly string[],
): string[] {
  if (!row || !availableProduitCodes.length) return [];
  const order = (row.produitsAutorises ?? [])
    .map((c) => String(c).trim())
    .filter(Boolean);
  if (!order.length) return [];
  const byUpper = new Map(availableProduitCodes.map((c) => [c.trim().toUpperCase(), c]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of order) {
    const hit = byUpper.get(raw.toUpperCase());
    if (hit !== undefined && !seen.has(hit)) {
      seen.add(hit);
      out.push(hit);
    }
  }
  return out;
}

export default function GprModulePage() {
  const [produits, setProduits] = useState<RefProduit[]>([]);
  const [concessionnaires, setConcessionnaires] = useState<RefConcessionnaire[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<LonaciRole | null>(null);

  const [gprItems, setGprItems] = useState<GprItem[]>([]);
  const [gprLogs, setGprLogs] = useState<Array<{ id: string; exportedAt: string; operatorUserId: string; entriesCount: number; generatedFilename: string }>>([]);
  const [scratchItems, setScratchItems] = useState<ScratchItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [gprClient, setGprClient] = useState<ClientPickerRow | null>(null);
  const [gprProducts, setGprProducts] = useState<string[]>([]);
  const [gprDate, setGprDate] = useState("");
  const [creatingGpr, setCreatingGpr] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [transitioningGprId, setTransitioningGprId] = useState<string | null>(null);

  const [lotId, setLotId] = useState("");
  const [lotCodes, setLotCodes] = useState("100");
  const [lotClient, setLotClient] = useState<ClientPickerRow | null>(null);
  const [lotProduitCode, setLotProduitCode] = useState("");
  const [creatingLot, setCreatingLot] = useState(false);
  const [transitioningLotId, setTransitioningLotId] = useState<string | null>(null);
  const [createLotOpen, setCreateLotOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; reference: string } | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const concessionnaireLabelById = useMemo(
    () => new Map(concessionnaires.map((c) => [c.id, `${c.codePdv} - ${c.raisonSociale}`])),
    [concessionnaires],
  );
  const kpis = useMemo(
    () => ({
      gprTotal: gprItems.length,
      gprEligibleSync: gprItems.filter((x) => ["VALIDE_N2", "SUIVI_CHEF_SERVICE"].includes(x.status)).length,
      gprSyncFailed: gprItems.filter((x) => x.sync.state === "FAILED").length,
      scratchTotal: scratchItems.length,
      scratchActive: scratchItems.filter((x) => x.status === "ACTIF").length,
      scratchExhausted: scratchItems.filter((x) => x.status === "EPUISE").length,
      exports: gprLogs.length,
    }),
    [gprItems, scratchItems, gprLogs],
  );

  async function loadReferentials() {
    setLoadingRef(true);
    try {
      const [refRes, cRes] = await Promise.all([
        fetch("/api/referentials", { credentials: "include", cache: "no-store" }),
        fetch("/api/concessionnaires?page=1&pageSize=100", { credentials: "include", cache: "no-store" }),
      ]);
      if (!refRes.ok || !cRes.ok) throw new Error("Chargement des référentiels impossible");
      const refBody = (await refRes.json()) as { produits: RefProduit[] };
      const cBody = (await cRes.json()) as {
        items: Array<{ id: string; codePdv: string; raisonSociale: string }>;
      };
      setProduits((refBody.produits ?? []).filter((p) => p.actif));
      setConcessionnaires(cBody.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoadingRef(false);
    }
  }

  async function loadData() {
    setLoadingData(true);
    setError(null);
    try {
      const [gprRes, logsRes, scratchRes] = await Promise.all([
        fetch("/api/gpr-registrations?page=1&pageSize=20", { credentials: "include", cache: "no-store" }),
        fetch("/api/gpr-registrations/exports", { credentials: "include", cache: "no-store" }),
        fetch("/api/scratch-codes/lots?page=1&pageSize=20", { credentials: "include", cache: "no-store" }),
      ]);
      if (!gprRes.ok || !logsRes.ok || !scratchRes.ok) throw new Error("Chargement des données impossible");
      const gprBody = (await gprRes.json()) as { items: GprItem[] };
      const logsBody = (await logsRes.json()) as {
        items: Array<{ id: string; exportedAt: string; operatorUserId: string; entriesCount: number; generatedFilename: string }>;
      };
      const scratchBody = (await scratchRes.json()) as { items: ScratchItem[] };
      setGprItems(gprBody.items ?? []);
      setGprLogs(logsBody.items ?? []);
      setScratchItems(scratchBody.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setGprDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T12:00`);
    void loadReferentials();
    void loadData();
    void (async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as { user?: { role?: string } };
        setMeRole(parseLonaciRole(body.user?.role));
      } catch {
        setMeRole(null);
      }
    })();
  }, []);

  async function onCreateGpr(e: FormEvent) {
    e.preventDefault();
    if (!gprClient?.id) {
      setError("Sélectionnez un client.");
      return;
    }
    setCreatingGpr(true);
    try {
      const response = await fetch("/api/gpr-registrations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lonaciClientId: gprClient.id,
          produitsActifs: gprProducts,
          dateEnregistrement: new Date(gprDate).toISOString(),
        }),
      });
      if (!response.ok) throw new Error("Création GPR impossible");
      setGprProducts([]);
      setGprClient(null);
      await loadData();
      notify.success("Enregistrement GPR créé.");
    } catch (e) {
      notify.error(e, "Création GPR impossible.");
    } finally {
      setCreatingGpr(false);
    }
  }

  async function onTransitionGpr(id: string, targetStatus: GprStatus, comment: string | null = null) {
    setTransitioningGprId(id);
    try {
      const response = await fetch(`/api/gpr-registrations/${encodeURIComponent(id)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus, comment }),
      });
      if (!response.ok) {
        throw new Error("Transition GPR refusée (vérifiez votre rôle et l’étape).");
      }
      setGprItems((current) => current.filter((item) => item.id !== id));
      await loadData();
      notify.success("Statut GPR mis à jour.");
      if (targetStatus === "REJETE") {
        setRejectTarget(null);
        setRejectComment("");
      }
    } catch (error) {
      notify.error(error, "Transition GPR impossible.");
    } finally {
      setTransitioningGprId(null);
    }
  }

  async function onSyncGpr(id: string) {
    setSyncingId(id);
    try {
      const response = await fetch(`/api/gpr-registrations/${encodeURIComponent(id)}/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Echec de synchronisation GPR");
      }
      await loadData();
      notify.success("Synchronisation GPR terminée.");
    } catch (e) {
      notify.error(e, "Échec de synchronisation GPR.");
    } finally {
      setSyncingId(null);
    }
  }

  async function onCreateLot(e: FormEvent) {
    e.preventDefault();
    if (!lotClient?.id) {
      setError("Sélectionnez un client pour le lot.");
      return;
    }
    setCreatingLot(true);
    try {
      const response = await fetch("/api/scratch-codes/lots", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotId: lotId.trim() ? lotId.trim() : undefined,
          nombreCodes: Number(lotCodes),
          lonaciClientId: lotClient.id,
          produitCode: lotProduitCode,
        }),
      });
      if (!response.ok) throw new Error("Création du lot impossible");
      setLotId("");
      setLotCodes("100");
      setLotClient(null);
      setLotProduitCode("");
      setCreateLotOpen(false);
      await loadData();
      notify.success("Lot de codes créé.");
    } catch (e) {
      notify.error(e, "Création du lot impossible.");
    } finally {
      setCreatingLot(false);
    }
  }

  async function onTransitionLot(lot: string, targetStatus: ScratchStatus) {
    setTransitioningLotId(lot);
    try {
      const response = await fetch(`/api/scratch-codes/lots/${encodeURIComponent(lot)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus }),
      });
      if (!response.ok) {
        throw new Error("Transition lot refusée (validation Chef(fe) de section requise pour ACTIF).");
      }
      await loadData();
      notify.success("Statut du lot mis à jour.");
    } catch (error) {
      notify.error(error, "Transition du lot impossible.");
    } finally {
      setTransitioningLotId(null);
    }
  }

  const assignedGprTarget = (row: GprItem): GprStatus | null =>
    getAssignedWorkflowTarget({
      workflow: "GPR",
      role: meRole,
      status: row.status,
    }) as GprStatus | null;

  const gprActions = (row: GprItem) => {
    const target = assignedGprTarget(row);
    if (!target) return <span className="text-slate-400">Aucune action</span>;
    const label = workflowActionLabelForTarget(target);
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" leadingIcon={CheckCircle2} loading={transitioningGprId === row.id} onClick={() => void onTransitionGpr(row.id, target)}>{label}</Button>
        <Button size="sm" variant="danger" leadingIcon={Ban} disabled={transitioningGprId === row.id} onClick={() => { setRejectTarget({ id: row.id, reference: row.reference }); setRejectComment(""); }}>Rejeter</Button>
      </div>
    );
  };
  const syncActions = (row: GprItem) => (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={syncStateTone(row.sync.state)}>{row.sync.state}</StatusBadge>
        {meRole === "CHEF_SERVICE" && ["VALIDE_N2", "SUIVI_CHEF_SERVICE"].includes(row.status) ? (
          <Button size="sm" variant="secondary" leadingIcon={RefreshCw} loading={syncingId === row.id} onClick={() => void onSyncGpr(row.id)}>Synchroniser</Button>
        ) : null}
      </div>
      {row.sync.lastError ? <p className="mt-1 text-xs text-rose-700">{row.sync.lastError}</p> : null}
    </div>
  );
  const gprColumns: readonly DataTableColumn<GprItem>[] = [
    { id: "reference", header: "Référence", cell: (row) => <span className="font-mono text-xs font-semibold">{row.reference}</span> },
    { id: "concessionnaire", header: "Concessionnaire", cell: (row) => concessionnaireLabelById.get(row.concessionnaireId) ?? row.concessionnaireId },
    { id: "produits", header: "Produits", cell: (row) => row.produitsActifs.join(", ") },
    { id: "date", header: "Date", cell: (row) => new Date(row.dateEnregistrement).toLocaleString("fr-FR") },
    { id: "statut", header: "Statut", cell: (row) => <StatusBadge tone={gprStatusTone(row.status)}>{row.status}</StatusBadge> },
    { id: "sync", header: "Synchronisation API", cell: syncActions },
    { id: "actions", header: "Actions", cell: gprActions },
  ];
  const lotActions = (row: ScratchItem) => {
    const target =
      row.status === "GENERE" && canShowScratchLotTransition(meRole, row.status, "ATTRIBUE") ? "ATTRIBUE" :
      row.status === "ATTRIBUE" && canShowScratchLotTransition(meRole, row.status, "ACTIF") ? "ACTIF" :
      row.status === "ACTIF" && canShowScratchLotTransition(meRole, row.status, "EPUISE") ? "EPUISE" : null;
    if (!target) return <span className="text-slate-400">Aucune action</span>;
    const label = target === "ATTRIBUE" ? "Attribuer" : target === "ACTIF" ? "Activer (N1)" : "Marquer épuisé";
    return <Button size="sm" leadingIcon={Send} loading={transitioningLotId === row.lotId} onClick={() => void onTransitionLot(row.lotId, target)}>{label}</Button>;
  };
  const lotColumns: readonly DataTableColumn<ScratchItem>[] = [
    { id: "lot", header: "Lot", cell: (row) => <span className="font-mono text-xs font-semibold">{row.lotId}</span> },
    { id: "concessionnaire", header: "Concessionnaire", cell: (row) => concessionnaireLabelById.get(row.concessionnaireId) ?? row.concessionnaireId },
    { id: "produit", header: "Produit", cell: (row) => row.produitCode },
    { id: "codes", header: "Codes", cell: (row) => row.generatedCount, align: "right" },
    { id: "statut", header: "Statut", cell: (row) => <StatusBadge tone={scratchStatusTone(row.status)}>{SCRATCH_CODE_STATUT_LABELS[row.status as ScratchCodeStatut] ?? row.status}</StatusBadge> },
    { id: "historique", header: "Historique", cell: (row) => `${row.history.length} événement(s)` },
    { id: "actions", header: "Actions", cell: lotActions },
    { id: "export", header: "Export", cell: (row) => <a href={`/api/scratch-codes/lots/${encodeURIComponent(row.lotId)}/export`} className="lonaci-ui-button lonaci-ui-button--secondary lonaci-ui-button--sm"><Download size={17} aria-hidden="true" />Exporter</a> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Opérations · GPR"
        title="Création de codes grattage"
        description={<>Enregistrements GPR, lots de codes et synchronisations. Consultez aussi les <Link href="/contrats-grattage" className="font-semibold text-orange-700 underline">contrats grattage</Link>.</>}
      />

      {error ? <FeedbackState tone="danger" title="Une erreur est survenue" description={error} action={<Button variant="secondary" onClick={() => void Promise.all([loadReferentials(), loadData()])}>Réessayer</Button>} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Dossiers GPR" value={kpis.gprTotal} icon={Files} />
        <KpiCard label="Prêts à synchroniser" value={kpis.gprEligibleSync} icon={Activity} />
        <KpiCard label="Lots actifs" value={kpis.scratchActive} icon={PackageCheck} />
        <KpiCard label="Échecs sync" value={kpis.gprSyncFailed} icon={RefreshCw} detail={`${kpis.exports} export(s)`} trend={kpis.gprSyncFailed ? { label: "À traiter", tone: "danger" } : { label: "Stable", tone: "success" }} />
      </section>

      <Surface elevated>
        <SectionHeader
          title="Enregistrements GPR"
          description="Registre officiel, workflow de validation et synchronisation directe."
          action={<a href="/api/gpr-registrations/export" className="lonaci-ui-button lonaci-ui-button--secondary lonaci-ui-button--sm"><Download size={17} aria-hidden="true" />Export CSV GPR</a>}
        />
        <form onSubmit={onCreateGpr} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <ClientSearchPicker
              label={<span className="text-[10px] font-medium text-slate-600">Client Lonaci *</span>}
              selected={gprClient}
              onSelectedChange={(r) => {
                setGprClient(r);
                const codes = produits.map((p) => p.code);
                const next = r ? pickProduitCodesFromClient(r, codes) : [];
                setGprProducts(next);
              }}
              filter="linkedPdv"
              inputClassName="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
              disabled={loadingRef}
              searchPlaceholder="Rechercher un client…"
            />
          </div>
          <select
            multiple
            required
            value={gprProducts}
            onChange={(e) => setGprProducts(Array.from(e.target.selectedOptions).map((o) => o.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
            disabled={loadingRef}
          >
            {produits.map((p) => (
              <option key={p.code} value={p.code}>
                {p.libelle}
              </option>
            ))}
          </select>
          <input
            required
            type="datetime-local"
            value={gprDate}
            onChange={(e) => setGprDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
          />
          <Button type="submit" leadingIcon={FilePlus2} loading={creatingGpr} disabled={loadingRef}>Créer l’enregistrement</Button>
        </form>

        <div className="mt-4" aria-live="polite" aria-busy={loadingData}>
          {loadingData ? <Skeleton lines={7} /> : (
            <DataTable
              rows={gprItems}
              columns={gprColumns}
              rowKey={(row) => row.id}
              caption="Enregistrements GPR"
              mobileCard={(row) => (
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-slate-500">{row.reference}</p><h3 className="font-bold">{concessionnaireLabelById.get(row.concessionnaireId) ?? row.concessionnaireId}</h3></div><StatusBadge tone={gprStatusTone(row.status)}>{row.status}</StatusBadge></div>
                  <p className="mt-2 text-sm text-slate-600">{row.produitsActifs.join(", ")} · {new Date(row.dateEnregistrement).toLocaleString("fr-FR")}</p>
                  <div className="mt-3">{syncActions(row)}</div>
                  <div className="mt-4">{gprActions(row)}</div>
                </article>
              )}
            />
          )}
        </div>
      </Surface>

      <Surface elevated>
        <SectionHeader
          title="Codes grattage"
          description={
            <>
              Lots (produit, quantité, référence auto), attribution horodatée, historique par PDV. Distribution :{" "}
              <Link href="/dispatcher" className="font-semibold text-orange-700 underline">
                module Dispatcher
              </Link>
              .
            </>
          }
          action={<Button leadingIcon={Plus} onClick={() => setCreateLotOpen(true)}>Nouveau lot</Button>}
        />
        <Dialog
          open={createLotOpen}
          onOpenChange={(open) => { if (!creatingLot) setCreateLotOpen(open); }}
          title="Créer un lot de codes grattage"
          description="Identifiant, volume de codes, client cible et produit."
          size="lg"
          footer={<><Button variant="secondary" disabled={creatingLot} onClick={() => setCreateLotOpen(false)}>Annuler</Button><Button type="submit" form="create-scratch-lot-form" leadingIcon={TicketCheck} loading={creatingLot} disabled={loadingRef}>Créer le lot</Button></>}
        >
              <form id="create-scratch-lot-form" onSubmit={onCreateLot}>
                <div className="grid gap-3">
                  <section className="grid gap-2 rounded-xl border border-indigo-200/70 bg-indigo-50/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Informations lot</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-700">Identifiant lot (optionnel)</span>
                        <input
                          value={lotId}
                          onChange={(e) => setLotId(e.target.value)}
                          placeholder="Laisser vide pour génération automatique"
                          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-700">Nombre de codes *</span>
                        <input
                          required
                          type="number"
                          min={1}
                          value={lotCodes}
                          onChange={(e) => setLotCodes(e.target.value)}
                          placeholder="Nb codes"
                          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
                        />
                      </label>
                    </div>
                  </section>
                  <section className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
                    <ClientSearchPicker
                      key={`scratch-lot-${createLotOpen}`}
                      label={<span className="text-xs font-medium text-slate-700">Client Lonaci *</span>}
                      selected={lotClient}
                      onSelectedChange={(r) => {
                        setLotClient(r);
                        if (!r) {
                          setLotProduitCode("");
                          return;
                        }
                        const codes = produits.map((p) => p.code);
                        const picked = pickProduitCodeFromClient(r, codes);
                        if (picked) setLotProduitCode(picked);
                      }}
                      filter="linkedPdv"
                      inputClassName="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
                      disabled={loadingRef}
                      searchPlaceholder="Rechercher un client…"
                    />
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Produit *</span>
                      <select
                        required
                        value={lotProduitCode}
                        onChange={(e) => setLotProduitCode(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
                        disabled={loadingRef}
                      >
                        <option value="">Produit</option>
                        {produits.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.libelle}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>
                </div>
              </form>
        </Dialog>

        <div className="mt-4" aria-live="polite" aria-busy={loadingData}>
          {loadingData ? <Skeleton lines={6} /> : (
            <DataTable
              rows={scratchItems}
              columns={lotColumns}
              rowKey={(row) => row.id}
              caption="Lots de codes grattage"
              mobileCard={(row) => (
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-slate-500">{row.lotId}</p><h3 className="font-bold">{concessionnaireLabelById.get(row.concessionnaireId) ?? row.concessionnaireId}</h3></div><StatusBadge tone={scratchStatusTone(row.status)}>{SCRATCH_CODE_STATUT_LABELS[row.status as ScratchCodeStatut] ?? row.status}</StatusBadge></div>
                  <p className="mt-2 text-sm text-slate-600">{row.produitCode} · {row.generatedCount} codes · {row.history.length} événement(s)</p>
                  <div className="mt-4 flex flex-wrap gap-2">{lotActions(row)}{lotColumns[7]?.cell(row)}</div>
                </article>
              )}
            />
          )}
        </div>
      </Surface>

      <Surface elevated>
        <SectionHeader title="Historique des exports GPR" description="Fichiers générés et opérateurs." />
        {loadingData ? (
          <Skeleton lines={3} />
        ) : gprLogs.length === 0 ? (
          <FeedbackState title="Aucun export" description="Les exports GPR apparaîtront ici." />
        ) : (
          <div className="space-y-2 text-xs text-slate-800">
            {gprLogs.map((log) => (
              <article key={log.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p>
                  <span className="text-slate-600">{new Date(log.exportedAt).toLocaleString("fr-FR")}</span> · opérateur{" "}
                  <span className="font-mono text-[11px]">{log.operatorUserId}</span> · {log.entriesCount} entrées
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-emerald-700">{log.generatedFilename}</p>
              </article>
            ))}
          </div>
        )}
      </Surface>

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => { if (!open) { setRejectTarget(null); setRejectComment(""); } }}
        title="Rejeter l’enregistrement GPR"
        description={`Référence ${rejectTarget?.reference ?? ""}`}
        size="sm"
        footer={<><Button variant="secondary" disabled={transitioningGprId === rejectTarget?.id} onClick={() => setRejectTarget(null)}>Annuler</Button><Button variant="danger" leadingIcon={Ban} loading={transitioningGprId === rejectTarget?.id} onClick={() => rejectTarget ? void onTransitionGpr(rejectTarget.id, "REJETE", rejectComment.trim() || null) : undefined}>Confirmer le rejet</Button></>}
      >
        <FormField label="Motif du rejet" hint="Le motif reste optionnel.">
          <textarea value={rejectComment} onChange={(event) => setRejectComment(event.target.value)} rows={4} />
        </FormField>
      </Dialog>
    </div>
  );
}
