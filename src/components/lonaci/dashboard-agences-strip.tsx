"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { LonaciKpiAgenceTrend30j } from "@/lib/lonaci/lonaci-kpi-types";

type Props = {
  items: LonaciKpiAgenceTrend30j[] | null;
  loading: boolean;
};

export default function DashboardAgencesStrip({ items, loading }: Props) {
  const totalReseau = useMemo(() => {
    if (!items?.length) return 0;
    return items.reduce((s, a) => s + a.total30j, 0);
  }, [items]);

  return (
    <section className="lonaci-db-agences-strip" aria-labelledby="dashboard-agences-title">
      <div className="lonaci-db-agences-strip-head">
        <div className="min-w-0">
          <h2 id="dashboard-agences-title" className="lonaci-db-section-title">
            Agences
          </h2>
          <p className="lonaci-db-section-subtitle">
            Volume d&apos;activité (30 derniers jours) · contrats, cautions, intégrations PDV
          </p>
        </div>
        <div className="lonaci-db-agences-strip-head-meta">
          {items && items.length > 0 ? (
            <span className="lonaci-db-badge lonaci-db-badge-blue">{items.length} agence{items.length > 1 ? "s" : ""}</span>
          ) : null}
          {totalReseau > 0 ? (
            <span className="lonaci-db-agences-total-hint">{totalReseau} opération(s) sur le réseau</span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="lonaci-db-muted lonaci-db-agences-loading">Chargement des agences…</p>
      ) : null}

      {!loading && (!items || items.length === 0) ? (
        <p className="lonaci-db-muted lonaci-db-agences-empty">Aucune agence dans le référentiel.</p>
      ) : null}

      {items && items.length > 0 ? (
        <div className="lonaci-db-agences-track" role="list">
          {items.map((a) => {
            const id = a.agenceId ?? "";
            const href = id ? `/concessionnaires?agenceId=${encodeURIComponent(id)}` : "/concessionnaires";
            const inactive = a.actif === false;
            return (
              <article
                key={id || a.agenceLabel}
                role="listitem"
                className={`lonaci-db-agence-card${inactive ? " lonaci-db-agence-card--inactive" : ""}`}
              >
                <div className="lonaci-db-agence-card-top">
                  <div className="lonaci-db-agence-card-titles">
                    <p className="lonaci-db-agence-code">{a.agenceCode ?? "—"}</p>
                    <p className="lonaci-db-agence-libelle" title={a.agenceLabel}>
                      {a.agenceLabel.includes(" - ")
                        ? a.agenceLabel.split(" - ").slice(1).join(" - ")
                        : a.agenceLabel}
                    </p>
                  </div>
                  {inactive ? (
                    <span className="lonaci-db-agence-badge-inactive">Inactive</span>
                  ) : null}
                </div>
                <div className="lonaci-db-agence-metrics">
                  <div>
                    <span className="lonaci-db-agence-metric-val lonaci-db-agence-metric-contract">{a.contrats30j}</span>
                    <span className="lonaci-db-agence-metric-lbl">Contrats</span>
                  </div>
                  <div>
                    <span className="lonaci-db-agence-metric-val lonaci-db-agence-metric-caution">{a.cautions30j}</span>
                    <span className="lonaci-db-agence-metric-lbl">Cautions</span>
                  </div>
                  <div>
                    <span className="lonaci-db-agence-metric-val lonaci-db-agence-metric-pdv">{a.integrations30j}</span>
                    <span className="lonaci-db-agence-metric-lbl">Int.</span>
                  </div>
                  <div className="lonaci-db-agence-metric-total">
                    <span className="lonaci-db-agence-metric-val-total">{a.total30j}</span>
                    <span className="lonaci-db-agence-metric-lbl">Total</span>
                  </div>
                </div>
                <Link href={href} className="lonaci-db-agence-link">
                  Voir le réseau →
                </Link>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
