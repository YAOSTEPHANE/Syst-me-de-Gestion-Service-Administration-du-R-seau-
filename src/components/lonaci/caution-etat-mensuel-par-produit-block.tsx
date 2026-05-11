"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CautionEtatMensuelProduitRow } from "@/lib/lonaci/sprint4";
import {
  displayEtatRowMetrics,
  ecartCautionsAffiche,
  monthUsesAttenduProrata,
  pctDuTotalRefDossiers,
  sumEtatMensuelMetricsRows,
} from "@/lib/lonaci/caution-etat-mensuel-display";

/** Texte en cours ≠ valeur enregistrée (ou saisie invalide en attente de correction). */
function attendusRawNeedsSave(
  rowKey: string,
  serverMontant: number,
  pendingRawByKey: Readonly<Record<string, string>>,
): boolean {
  const raw = pendingRawByKey[rowKey];
  if (raw === undefined) return false;
  const n = parseMontantFcfaSaisi(raw);
  if (n === null) return true;
  return n !== serverMontant;
}

export type CautionEtatMensuelParProduitBlockProps = {
  /** Préfixe unique pour les id DOM (accessibilité) si plusieurs blocs coexistent. */
  domIdPrefix?: string;
  months?: number;
  /** Chef de service : permet de saisir / réinitialiser les montants « Attendus montants cautions » par mois et produit. */
  allowAdminAttendusMontants?: boolean;
};

function parseMontantFcfaSaisi(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(/\u00a0/g, "");
  if (normalized === "") return null;
  const n = Number.parseInt(normalized, 10);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/** Fragment d’identifiant HTML stable (évite les caractères interdits dans les id). */
function safeDomIdPart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

type MonthSection = {
  yearMonth: string;
  moisLabel: string;
  rows: CautionEtatMensuelProduitRow[];
};

function monthSectionsFromRows(rows: CautionEtatMensuelProduitRow[]): MonthSection[] {
  const indexByYm = new Map<string, number>();
  const out: MonthSection[] = [];
  for (const r of rows) {
    let idx = indexByYm.get(r.yearMonth);
    if (idx === undefined) {
      idx = out.length;
      indexByYm.set(r.yearMonth, idx);
      out.push({ yearMonth: r.yearMonth, moisLabel: r.moisLabel, rows: [] });
    }
    out[idx]!.rows.push(r);
  }
  return out;
}

function TotauxMoisResume({ totals }: { totals: ReturnType<typeof sumEtatMensuelMetricsRows> }) {
  return (
    <div className="border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] text-slate-700 sm:px-4">
      <p className="font-semibold text-slate-800">Totaux du mois</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums leading-snug">
        <span>
          Attendus <strong className="text-slate-900">{totals.montantAttendusCautions.toLocaleString("fr-FR")}</strong>{" "}
          FCFA
        </span>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <span>
          À encaisser <strong className="text-slate-900">{totals.nombreCautionsAEncaisser}</strong> cautions
        </span>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <span>
          Encaissées <strong className="text-slate-900">{totals.nombreCautionsEncaissees}</strong> /{" "}
          <strong className="text-slate-900">{totals.montantCautionsEncaissees.toLocaleString("fr-FR")}</strong> FCFA
        </span>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <span>
          Écart <strong className="text-slate-900">{totals.ecartNombreCautionsAffiche.toLocaleString("fr-FR")}</strong>{" "}
          cautions
        </span>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <span>
          Non enc. <strong className="text-slate-900">{totals.nombreCautionsNonEncaissees}</strong> /{" "}
          <strong className="text-slate-900">{totals.montantCautionsNonEncaissees.toLocaleString("fr-FR")}</strong> FCFA
        </span>
      </p>
    </div>
  );
}

export function CautionEtatMensuelParProduitBlock({
  domIdPrefix = "caution-etat-mensuel",
  months = 12,
  allowAdminAttendusMontants = false,
}: CautionEtatMensuelParProduitBlockProps) {
  const [rows, setRows] = useState<CautionEtatMensuelProduitRow[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [attendusEditError, setAttendusEditError] = useState<string | null>(null);
  const [savingAttendusKey, setSavingAttendusKey] = useState<string | null>(null);
  /** Brouillon saisi (clé mois|produit) tant qu’il diffère du montant serveur — sert à n’afficher « Enregistrer » que si besoin. */
  const [attendusPendingRawByKey, setAttendusPendingRawByKey] = useState<Record<string, string>>({});
  /** Ligne en cours d’édition (null = consultation : montant + « Modifier »). */
  const [attendusEditModeKey, setAttendusEditModeKey] = useState<string | null>(null);

  const sections: MonthSection[] = useMemo(() => monthSectionsFromRows(rows), [rows]);

  const [expandedYms, setExpandedYms] = useState<Set<string>>(() => new Set());
  const expandUserTouchedRef = useRef(false);

  useEffect(() => {
    if (sections.length === 0) {
      setExpandedYms(new Set());
      expandUserTouchedRef.current = false;
      return;
    }
    const keyList = sections.map((s) => s.yearMonth);
    setExpandedYms((prev) => {
      const valid = new Set([...prev].filter((k) => keyList.includes(k)));
      if (valid.size > 0 || expandUserTouchedRef.current) return valid;
      return new Set([keyList[0]!]);
    });
  }, [sections]);

  const toggleMonth = useCallback((ym: string) => {
    expandUserTouchedRef.current = true;
    setExpandedYms((prev) => {
      const next = new Set(prev);
      if (next.has(ym)) next.delete(ym);
      else next.add(ym);
      return next;
    });
  }, []);

  const loadRows = useCallback(async () => {
    const m = Math.min(36, Math.max(1, Math.floor(months)));
    try {
      const er = await fetch(`/api/cautions/etat-mensuel-produits?months=${m}&_=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (er.ok) {
        const d = (await er.json()) as { rows?: CautionEtatMensuelProduitRow[] };
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setHint(null);
      } else {
        setRows([]);
        setHint("État mensuel par produit indisponible.");
      }
    } catch {
      setRows([]);
      setHint("État mensuel par produit indisponible.");
    }
  }, [months]);

  useEffect(() => {
    void loadRows();
    const onDataImported = () => {
      void loadRows();
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
  }, [loadRows]);

  const rowAttendusKey = useCallback((yearMonth: string, produitCode: string) => `${yearMonth}|${produitCode}`, []);

  /** Après rechargement des lignes, retirer les brouillons qui correspondent déjà au montant serveur. */
  useEffect(() => {
    setAttendusPendingRawByKey((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of rows) {
        const k = rowAttendusKey(r.yearMonth, r.produitCode);
        const raw = next[k];
        if (raw === undefined) continue;
        const n = parseMontantFcfaSaisi(raw);
        if (n !== null && n === r.montantAttendusCautions) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows, rowAttendusKey]);

  const clearAttendusPendingKey = useCallback((yearMonth: string, produitCode: string) => {
    const k = rowAttendusKey(yearMonth, produitCode);
    setAttendusPendingRawByKey((prev) => {
      if (!(k in prev)) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  }, [rowAttendusKey]);

  const openAttendusEdit = useCallback((rk: string) => {
    setAttendusPendingRawByKey((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key !== rk) delete next[key];
      }
      return next;
    });
    setAttendusEditModeKey(rk);
  }, []);

  const closeAttendusEdit = useCallback(() => {
    setAttendusEditModeKey(null);
  }, []);

  const saveAttendusMontantsSaisi = useCallback(
    async (yearMonth: string, produitCode: string, raw: string, current: number) => {
      const n = parseMontantFcfaSaisi(raw);
      if (n === null) {
        setAttendusEditError("Montant invalide : indiquez un entier ≥ 0 (FCFA).");
        return;
      }
      if (n === current) {
        setAttendusEditError(null);
        clearAttendusPendingKey(yearMonth, produitCode);
        closeAttendusEdit();
        return;
      }
      setAttendusEditError(null);
      const rk = rowAttendusKey(yearMonth, produitCode);
      setSavingAttendusKey(rk);
      try {
        const res = await fetch("/api/cautions/etat-attendus-montants", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yearMonth, produitCode, montantAttendusCautions: n }),
        });
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) {
          setAttendusEditError(body?.message ?? "Enregistrement impossible.");
          return;
        }
        await loadRows();
        clearAttendusPendingKey(yearMonth, produitCode);
        closeAttendusEdit();
        window.dispatchEvent(new Event("lonaci:data-imported"));
      } catch {
        setAttendusEditError("Erreur réseau ou serveur.");
      } finally {
        setSavingAttendusKey(null);
      }
    },
    [clearAttendusPendingKey, closeAttendusEdit, loadRows, rowAttendusKey],
  );

  const resetAttendusMontantsSaisi = useCallback(
    async (yearMonth: string, produitCode: string) => {
      setAttendusEditError(null);
      setSavingAttendusKey(rowAttendusKey(yearMonth, produitCode));
      try {
        const params = new URLSearchParams({ yearMonth, produitCode });
        const res = await fetch(`/api/cautions/etat-attendus-montants?${params.toString()}`, {
          method: "DELETE",
          credentials: "include",
        });
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) {
          setAttendusEditError(body?.message ?? "Réinitialisation impossible.");
          return;
        }
        await loadRows();
        clearAttendusPendingKey(yearMonth, produitCode);
        closeAttendusEdit();
        window.dispatchEvent(new Event("lonaci:data-imported"));
      } catch {
        setAttendusEditError("Erreur réseau ou serveur.");
      } finally {
        setSavingAttendusKey(null);
      }
    },
    [clearAttendusPendingKey, closeAttendusEdit, loadRows, rowAttendusKey],
  );

  useEffect(() => {
    if (!allowAdminAttendusMontants || !attendusEditModeKey) return;
    const parts = attendusEditModeKey.split("|");
    const ym = parts[0];
    const pc = parts.slice(1).join("|");
    if (!ym || parts.length < 2) return;
    const id = `${domIdPrefix}-att-${safeDomIdPart(ym)}-${safeDomIdPart(pc)}`;
    const t = window.requestAnimationFrame(() => {
      document.getElementById(id)?.focus();
    });
    return () => window.cancelAnimationFrame(t);
  }, [allowAdminAttendusMontants, attendusEditModeKey, domIdPrefix]);

  const showBody = rows.length > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-amber-50/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">État des cautions par produit (par mois)</h3>
        <p className="mt-1 text-xs text-slate-600">
          {months <= 1
            ? "Dernier mois calendaire."
            : `Les ${months} derniers mois calendaires.`}{" "}
          Encaissements : cautions <strong>payées</strong> dont la date d’encaissement (
          <code className="rounded bg-white/80 px-1">paidAt</code>) tombe dans le mois. Encours fin de mois : saisie
          avant la fin du mois, non payée avant cette date, non annulée à cette date (statut actuel pour le circuit —
          sans historique détaillé des transitions). Les <strong className="text-slate-800">encaissements du mois</strong>{" "}
          (colonnes « encaissées ») restent les <strong className="text-slate-800">montants réels</strong> issus des
          cautions. Si un <strong className="text-slate-800">chef de service</strong> corrige l’attendu par rapport au
          total dossiers, la colonne <strong className="text-slate-800">Cautions non encaissées (FCFA)</strong> reste{" "}
          <strong className="text-slate-800">attendu (FCFA) − cautions encaissées (FCFA)</strong> sur la ligne. Le{" "}
          <strong className="text-slate-800">nombre</strong> de cautions à encaisser affiché vaut l’arrondi de{" "}
          <strong className="text-slate-800">attendu (FCFA) ÷ cautions encaissées (FCFA)</strong> du mois sur la ligne
          (si encaissées = 0 : affichage du stock au prorata). La colonne <strong className="text-slate-800">Écart</strong>{" "}
          vaut le <strong className="text-slate-800">nombre de cautions à encaisser affiché − nombre de cautions
          encaissées</strong>. Les{" "}
          <strong className="text-slate-800">totaux du mois</strong> suivent les valeurs affichées (sommes des colonnes).
          La colonne <strong className="text-slate-800">% du total ref. dossiers</strong> (après « Écart ») est le{" "}
          <strong className="text-slate-800">pourcentage de l’écart</strong> (en cautions) : valeur de la colonne{" "}
          <strong className="text-slate-800">Écart</strong> pour la ligne, divisée par la somme des écarts du mois sur
          toutes les lignes. Avec <strong className="text-slate-800">un seul produit</strong> et un écart non nul, la
          ligne affiche <strong className="text-slate-800">100&nbsp;%</strong>. Si la somme des écarts du mois est nulle,
          le % affiche <strong className="text-slate-800">—</strong>. La ligne <strong className="text-slate-800">Total mois</strong> ne montre pas de % (non pertinent).{" "}
          <strong className="text-slate-800">Cliquez un mois</strong> pour ouvrir ou fermer son tableau par produit
          (plusieurs mois peuvent rester ouverts).
        </p>
        {allowAdminAttendusMontants ? (
          <p className="mt-2 text-xs text-slate-700">
            <strong className="text-slate-800">Chef de service :</strong> vous pouvez corriger la colonne « Attendus
            montants cautions » par produit et par mois (valeur conservée en base).{" "}
            <strong className="text-slate-800">Consultation / édition :</strong> le montant enregistré s’affiche avec{" "}
            <strong className="text-slate-800">Modifier</strong> pour rouvrir la saisie. En édition, le bouton{" "}
            <strong className="text-slate-800">Enregistrer</strong> n’apparaît que si le champ diffère du montant en
            base ; après enregistrement vous revenez en consultation. Vous pouvez aussi enregistrer en quittant le
            champ ou avec{" "}
            <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[10px]">Entrée</kbd>. Tant que
            la valeur n’est pas enregistrée, les pourcentages et totaux ne reflètent pas la saisie.
            Après enregistrement, les totaux suivent la valeur en base ; les{" "}
            <strong className="text-slate-800">%</strong> du total ref. dossiers (pourcentage de l’écart en cautions,
            ligne ÷ somme du mois) se recalculent sur toutes les lignes du mois lorsque les colonnes « à encaisser » ou
            « encaissées » varient.
            Le montant <strong className="text-slate-800">« non enc. » (FCFA)</strong> affiché
            vaut <strong className="text-slate-800">attendu − encaissées</strong> sur la ligne ;
            le <strong className="text-slate-800">nombre</strong> à encaisser affiché suit{" "}
            <strong className="text-slate-800">attendu ÷ encaissées (FCFA)</strong> (arrondi), ou le stock au prorata si
            encaissées = 0. Le bouton « ↺ »
            supprime la saisie admin.
          </p>
        ) : null}
        {attendusEditError ? <p className="mt-2 text-xs text-red-800">{attendusEditError}</p> : null}
        {hint ? <p className="mt-2 text-xs text-amber-900">{hint}</p> : null}
      </div>
      <div className="max-h-[min(40rem,60vh)] overflow-auto p-3 sm:p-4">
        {!showBody && !hint ? (
          <p className="text-sm text-slate-500">Aucune ligne à afficher.</p>
        ) : !showBody ? null : (
          <div className="space-y-5">
            {sections.map((sec) => {
              const isOpen = expandedYms.has(sec.yearMonth);
              const panelId = `${domIdPrefix}-${sec.yearMonth}`;
              const totals = sumEtatMensuelMetricsRows(sec.rows.map(displayEtatRowMetrics));
              const prorataUsed = monthUsesAttenduProrata(sec.rows);
              return (
                <div
                  key={sec.yearMonth}
                  className={`overflow-hidden rounded-xl border shadow-sm transition-colors ${
                    isOpen
                      ? "border-amber-300 bg-amber-50/30 ring-1 ring-amber-200/80"
                      : "border-slate-200 bg-slate-50/40"
                  }`}
                >
                  <button
                    type="button"
                    id={`${panelId}-trigger`}
                    aria-expanded={isOpen ? "true" : "false"}
                    aria-controls={panelId}
                    onClick={() => toggleMonth(sec.yearMonth)}
                    className={`flex w-full flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2.5 text-left transition sm:px-4 ${
                      isOpen
                        ? "border-amber-200/80 bg-amber-50/70 hover:bg-amber-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block h-0 w-0 border-y-[5px] border-y-transparent border-l-[6px] transition-transform ${
                          isOpen ? "rotate-90 border-l-amber-800" : "border-l-slate-500"
                        }`}
                        aria-hidden
                      />
                      <span className="text-sm font-semibold capitalize text-slate-900">{sec.moisLabel}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {sec.rows.length} produit{sec.rows.length !== 1 ? "s" : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-right">
                      <span className="font-mono text-xs text-slate-500">{sec.yearMonth}</span>
                      <span className="text-[10px] font-medium text-slate-600">
                        Total attendus{" "}
                        <span className="tabular-nums text-slate-900">
                          {totals.montantAttendusCautions.toLocaleString("fr-FR")}
                        </span>{" "}
                        FCFA
                      </span>
                    </span>
                  </button>
                  {!isOpen ? <TotauxMoisResume totals={totals} /> : null}
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={`${panelId}-trigger`}
                    hidden={!isOpen}
                    className="overflow-x-auto p-2 sm:p-3"
                  >
                    {isOpen ? (
                      <table className="w-full min-w-[700px] border-collapse text-left text-[11px] text-slate-800">
                        {prorataUsed ? (
                          <caption className="caption-bottom px-0 pb-2 text-left text-[10px] leading-snug text-slate-600">
                            * Cautions non encaissées (FCFA) : attendu − encaissées du mois sur la ligne. Nombre à
                            encaisser : arrondi(attendu FCFA ÷ encaissées FCFA) ; si encaissées = 0, stock au prorata.
                            Écart (cautions) : à encaisser affiché − encaissées. % ref. dossiers : pourcentage de cet
                            écart (ligne ÷ somme des écarts du mois ; « — » si somme = 0). Résumé mois replié : mêmes
                            totaux + écart cautions. Les encaissements restent les montants réels.
                          </caption>
                        ) : null}
                        <thead className="bg-white text-slate-600">
                          <tr className="border-b border-slate-200">
                            <th className="whitespace-nowrap px-2 py-2 font-semibold">Produit</th>
                            <th
                              className="whitespace-pre-line px-2 py-2 font-semibold leading-tight"
                              title={
                                allowAdminAttendusMontants
                                  ? "Chef de service : montant saisissable ; sinon total calculé depuis les cautions en périmètre."
                                  : undefined
                              }
                            >
                              {"Attendus\nmontants\ncautions (FCFA)"}
                            </th>
                            <th
                              className="whitespace-pre-line px-2 py-2 font-semibold leading-tight"
                              title="Arrondi(attendu FCFA ÷ cautions encaissées FCFA du mois) ; si encaissées = 0 : stock au prorata"
                            >
                              {"Nombre de\ncautions à\nencaisser"}
                            </th>
                            <th
                              className="whitespace-pre-line px-2 py-2 font-semibold leading-tight"
                              title="Montants réels des cautions payées dans le mois (non proratisés)"
                            >
                              {"Cautions\nencaissées\n(FCFA)"}
                            </th>
                            <th className="whitespace-pre-line px-2 py-2 font-semibold leading-tight">
                              {"Nombre de\ncautions\nencaissées"}
                            </th>
                            <th
                              className="whitespace-pre-line px-2 py-2 font-semibold leading-tight"
                              title="Attendus montants cautions (FCFA) − cautions encaissées (FCFA) du mois sur la ligne"
                            >
                              {"Cautions\nnon\nencaissées (FCFA)"}
                            </th>
                            <th
                              className="whitespace-pre-line px-2 py-2 font-semibold leading-tight"
                              title="Nombre de cautions à encaisser − nombre de cautions encaissées"
                            >
                              {"Écart"}
                            </th>
                            <th
                              className="whitespace-pre-line px-2 py-2 font-semibold leading-tight"
                              title="% ref. dossiers = pourcentage de l’Écart (cautions) : écart ligne ÷ somme des écarts du mois. Un seul produit et écart ≠ 0 ⇒ 100 %. Somme des écarts = 0 ⇒ —. Total mois : pas de %."
                            >
                              {"%\ndu total\nref. dossiers"}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {sec.rows.map((r) => {
                            const d = displayEtatRowMetrics(r);
                            const ecartLigne = ecartCautionsAffiche(d);
                            const rk = rowAttendusKey(r.yearMonth, r.produitCode);
                            const attendusInputId = `${domIdPrefix}-att-${safeDomIdPart(r.yearMonth)}-${safeDomIdPart(r.produitCode)}`;
                            const attendusInputValue =
                              attendusPendingRawByKey[rk] !== undefined
                                ? attendusPendingRawByKey[rk]!
                                : String(r.montantAttendusCautions);
                            const showEnregistrerBtn = attendusRawNeedsSave(rk, r.montantAttendusCautions, attendusPendingRawByKey);
                            const attendusRowIsEditing =
                              attendusEditModeKey === rk ||
                              attendusRawNeedsSave(rk, r.montantAttendusCautions, attendusPendingRawByKey);
                            return (
                            <tr key={`${r.yearMonth}-${r.produitCode}`} className="border-t border-slate-100">
                              <td className="px-2 py-1.5 align-top">
                                <span className="font-mono text-[10px] font-semibold">{r.produitCode}</span>
                                <span className="mt-0.5 block text-[10px] text-slate-600">{r.libelle}</span>
                              </td>
                              <td className="px-2 py-1.5 align-top">
                                {allowAdminAttendusMontants ? (
                                  <div className="flex flex-col gap-0.5">
                                    {attendusRowIsEditing ? (
                                      <span className="group/att-edit inline-flex flex-wrap items-center gap-1">
                                        <input
                                          id={attendusInputId}
                                          type="text"
                                          inputMode="numeric"
                                          aria-label={`Attendus montants cautions FCFA ${r.produitCode} ${r.yearMonth}`}
                                          disabled={savingAttendusKey === rk}
                                          value={attendusInputValue}
                                          onChange={(e) => {
                                            setAttendusPendingRawByKey((prev) => ({
                                              ...prev,
                                              [rk]: e.target.value,
                                            }));
                                          }}
                                          className="min-w-[5.5rem] max-w-[8rem] rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-60"
                                          onBlur={(e) => {
                                            void saveAttendusMontantsSaisi(
                                              r.yearMonth,
                                              r.produitCode,
                                              e.target.value,
                                              r.montantAttendusCautions,
                                            );
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              (e.target as HTMLInputElement).blur();
                                            }
                                          }}
                                        />
                                        {showEnregistrerBtn ? (
                                          <button
                                            type="button"
                                            className="shrink-0 rounded border border-amber-600 bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
                                            title="Enregistrer ce montant en base (équivalent à quitter le champ ou Entrée)"
                                            disabled={savingAttendusKey === rk}
                                            onClick={() => {
                                              void saveAttendusMontantsSaisi(
                                                r.yearMonth,
                                                r.produitCode,
                                                attendusInputValue,
                                                r.montantAttendusCautions,
                                              );
                                            }}
                                          >
                                            Enregistrer
                                          </button>
                                        ) : null}
                                        {r.attendusMontantsSource === "ADMIN" ? (
                                          <button
                                            type="button"
                                            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-600 opacity-100 transition-opacity hover:bg-slate-50 sm:opacity-0 sm:group-hover/att-edit:opacity-100 sm:group-focus-within/att-edit:opacity-100"
                                            title="Réinitialiser : supprimer la saisie admin et utiliser le total calculé depuis les dossiers"
                                            disabled={savingAttendusKey === rk}
                                            onClick={() => void resetAttendusMontantsSaisi(r.yearMonth, r.produitCode)}
                                          >
                                            ↺
                                          </button>
                                        ) : null}
                                      </span>
                                    ) : (
                                      <div className="group/att-consult inline-flex flex-wrap items-center gap-1">
                                        <span className="tabular-nums font-mono text-[11px] text-slate-900">
                                          {r.montantAttendusCautions.toLocaleString("fr-FR")}
                                        </span>
                                        <span className="inline-flex items-center gap-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/att-consult:opacity-100 sm:group-focus-within/att-consult:opacity-100">
                                          <button
                                            type="button"
                                            className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                                            title="Modifier le montant attendu"
                                            disabled={savingAttendusKey === rk}
                                            onClick={() => openAttendusEdit(rk)}
                                          >
                                            Modifier
                                          </button>
                                          {r.attendusMontantsSource === "ADMIN" ? (
                                            <button
                                              type="button"
                                              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                                              title="Réinitialiser : supprimer la saisie admin et utiliser le total calculé depuis les dossiers"
                                              disabled={savingAttendusKey === rk}
                                              onClick={() => void resetAttendusMontantsSaisi(r.yearMonth, r.produitCode)}
                                            >
                                              Réinitialiser
                                            </button>
                                          ) : null}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="tabular-nums">{r.montantAttendusCautions.toLocaleString("fr-FR")}</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{d.nombreCautionsAEncaisser}</td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {d.montantCautionsEncaissees.toLocaleString("fr-FR")}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{d.nombreCautionsEncaissees}</td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {d.montantCautionsNonEncaissees.toLocaleString("fr-FR")}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {ecartLigne.toLocaleString("fr-FR")}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums text-slate-700">
                                {pctDuTotalRefDossiers(ecartLigne, totals.ecartNombreCautionsAffiche)}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t-2 border-amber-200/90 bg-amber-50/90 text-slate-900">
                          <tr>
                            <th
                              scope="row"
                              className="px-2 py-2 text-left text-[11px] font-semibold tracking-tight"
                            >
                              Total mois
                            </th>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.montantAttendusCautions.toLocaleString("fr-FR")}
                            </td>
                            <td className="px-2 py-2 tabular-nums font-semibold">{totals.nombreCautionsAEncaisser}</td>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.montantCautionsEncaissees.toLocaleString("fr-FR")}
                            </td>
                            <td className="px-2 py-2 tabular-nums font-semibold">{totals.nombreCautionsEncaissees}</td>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.montantCautionsNonEncaissees.toLocaleString("fr-FR")}
                            </td>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.ecartNombreCautionsAffiche.toLocaleString("fr-FR")}
                            </td>
                            <td
                              className="px-2 py-2 tabular-nums font-semibold text-slate-500"
                              title="Pas de part % sur la ligne de total ; les % s’appliquent aux lignes produit."
                            >
                              —
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
