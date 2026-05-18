"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useLonaciKpi } from "@/components/lonaci/lonaci-kpi-context";
import { LONACI_AGENCES } from "@/components/lonaci/lonaci-nav";
import type { LonaciKpiPayload } from "@/lib/lonaci/lonaci-kpi-types";

function shortLibelle(label: string): string {
  if (label.includes(" - ")) return label.split(" - ").slice(1).join(" - ");
  return label;
}

function triggerLabel(value: string, kpi: LonaciKpiPayload | null): string {
  if (!value) return "Toutes les agences";
  const fromKpi = kpi?.agencesOverview30j?.find((a) => a.agenceId === value);
  if (fromKpi) return shortLibelle(fromKpi.agenceLabel);
  const legacy = LONACI_AGENCES.find((a) => a.value === value);
  return legacy?.label ?? "Agence";
}

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export default function ShellAgenceFilterDropdown({ value, onChange }: Props) {
  const { kpi, error: kpiError } = useLonaciKpi();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    const list = kpi?.agencesOverview30j?.filter((a) => a.agenceId) ?? [];
    return [...list].sort((a, b) => {
      const ca = a.agenceCode ?? a.agenceLabel;
      const cb = b.agenceCode ?? b.agenceLabel;
      return ca.localeCompare(cb, "fr", { sensitivity: "base" });
    });
  }, [kpi?.agencesOverview30j]);

  const useKpiList = sorted.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!useKpiList) {
    return (
      <select
        className="lonaci-db-select"
        aria-label="Filtre agence"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {LONACI_AGENCES.map((a) => (
          <option key={a.value || "all"} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="lonaci-db-shell-agence-filter" ref={wrapRef}>
      <button
        type="button"
        className="lonaci-db-shell-agence-trigger"
        aria-expanded={open ? "true" : "false"}
        aria-haspopup="listbox"
        aria-label="Filtre agence"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="lonaci-db-shell-agence-trigger-text">{triggerLabel(value, kpi)}</span>
        <svg className="lonaci-db-shell-agence-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="lonaci-db-shell-agence-panel" role="listbox" aria-label="Choisir une agence">
          {kpiError ? (
            <p className="lonaci-db-shell-agence-panel-hint">
              Données partielles
            </p>
          ) : null}
          <div className="lonaci-db-shell-agence-list">
            <button
              type="button"
              role="option"
              aria-selected={value === "" ? "true" : "false"}
              className={`lonaci-db-shell-agence-option${value === "" ? " lonaci-db-shell-agence-option--selected" : ""}`}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <span className="lonaci-db-shell-agence-option-title">Toutes les agences</span>
            </button>

            {sorted.map((a) => {
              const id = a.agenceId as string;
              const selected = value === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={selected ? "true" : "false"}
                  className={`lonaci-db-shell-agence-option${selected ? " lonaci-db-shell-agence-option--selected" : ""}`}
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                >
                  <span className="lonaci-db-shell-agence-option-title" title={a.agenceLabel}>
                    {shortLibelle(a.agenceLabel)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
