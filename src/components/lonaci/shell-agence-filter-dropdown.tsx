"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<number | null>(null);
  const listboxId = useId();

  const sorted = useMemo(() => {
    const list = kpi?.agencesOverview30j?.filter((a) => a.agenceId) ?? [];
    return [...list].sort((a, b) => {
      const ca = a.agenceCode ?? a.agenceLabel;
      const cb = b.agenceCode ?? b.agenceLabel;
      return ca.localeCompare(cb, "fr", { sensitivity: "base" });
    });
  }, [kpi?.agencesOverview30j]);

  const useKpiList = sorted.length > 0;
  const options = useMemo(
    () => [
      { value: "", label: "Toutes les agences" },
      ...sorted.map((agence) => ({
        value: agence.agenceId as string,
        label: shortLibelle(agence.agenceLabel),
      })),
    ],
    [sorted],
  );
  const [activeIndex, setActiveIndex] = useState(0);

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openAt(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  function selectOption(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeAndRestoreFocus();
  }

  function onListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      let next = activeIndex;
      if (event.key === "ArrowDown") next = (activeIndex + 1) % options.length;
      if (event.key === "ArrowUp") next = (activeIndex - 1 + options.length) % options.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = options.length - 1;
      setActiveIndex(next);
      optionRefs.current[next]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(activeIndex);
      return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    typeaheadRef.current += event.key.toLocaleLowerCase("fr");
    if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = window.setTimeout(() => {
      typeaheadRef.current = "";
      typeaheadTimerRef.current = null;
    }, 500);
    const match = options.findIndex((option) =>
      option.label.toLocaleLowerCase("fr").startsWith(typeaheadRef.current),
    );
    if (match >= 0) {
      setActiveIndex(match);
      optionRefs.current[match]?.focus();
    }
  }

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
    const frame = window.requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, open]);

  useEffect(
    () => () => {
      if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current);
    },
    [],
  );

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
        ref={triggerRef}
        type="button"
        className="lonaci-db-shell-agence-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-label="Filtre agence"
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openAt(Math.max(0, options.findIndex((option) => option.value === value)));
          }
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openAt(Math.max(0, options.findIndex((option) => option.value === value)));
          }
        }}
      >
        <span className="lonaci-db-shell-agence-trigger-text">{triggerLabel(value, kpi)}</span>
        <ChevronsUpDown className="lonaci-db-shell-agence-chevron" size={14} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={listboxId}
          className="lonaci-db-shell-agence-panel"
          role="listbox"
          aria-label="Choisir une agence"
          onKeyDown={onListKeyDown}
        >
          {kpiError ? (
            <p className="lonaci-db-shell-agence-panel-hint">
              Données partielles
            </p>
          ) : null}
          <div className="lonaci-db-shell-agence-list">
            <button
              ref={(element) => {
                optionRefs.current[0] = element;
              }}
              type="button"
              role="option"
              aria-selected={value === ""}
              tabIndex={activeIndex === 0 ? 0 : -1}
              className={`lonaci-db-shell-agence-option${value === "" ? " lonaci-db-shell-agence-option--selected" : ""}`}
              onClick={() => {
                selectOption(0);
              }}
            >
              <span className="lonaci-db-shell-agence-option-title">Toutes les agences</span>
              {value === "" ? <Check size={15} aria-hidden="true" /> : null}
            </button>

            {sorted.map((a, index) => {
              const id = a.agenceId as string;
              const selected = value === id;
              const optionIndex = index + 1;
              return (
                <button
                  key={id}
                  ref={(element) => {
                    optionRefs.current[optionIndex] = element;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={activeIndex === optionIndex ? 0 : -1}
                  className={`lonaci-db-shell-agence-option${selected ? " lonaci-db-shell-agence-option--selected" : ""}`}
                  onClick={() => {
                    selectOption(optionIndex);
                  }}
                >
                  <span className="lonaci-db-shell-agence-option-title" title={a.agenceLabel}>
                    {shortLibelle(a.agenceLabel)}
                  </span>
                  {selected ? <Check size={15} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
