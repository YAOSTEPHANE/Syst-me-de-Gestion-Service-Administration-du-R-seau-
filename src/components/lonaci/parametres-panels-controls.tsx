"use client";

import { useEffect } from "react";

const STORAGE_KEY = "lonaci:parametres:open-panels";

function readStoredOpenPanels(): { hasStoredValue: boolean; ids: Set<string> } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return { hasStoredValue: false, ids: new Set<string>() };
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { hasStoredValue: true, ids: new Set<string>() };
    return {
      hasStoredValue: true,
      ids: new Set(parsed.filter((value): value is string => typeof value === "string")),
    };
  } catch {
    return { hasStoredValue: true, ids: new Set<string>() };
  }
}

function writeStoredOpenPanels(ids: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

function getAllPanels(container: HTMLElement | null): HTMLDetailsElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLDetailsElement>("details[data-param-panel-id]"));
}

export default function ParametresPanelsControls() {
  useEffect(() => {
    const container = document.getElementById("parametres-content");
    const panels = getAllPanels(container);
    if (!panels.length) return;

    const stored = readStoredOpenPanels();
    if (stored.hasStoredValue) {
      for (const panel of panels) {
        const id = panel.dataset.paramPanelId;
        if (!id) continue;
        panel.open = stored.ids.has(id);
      }
    }

    const onToggle = (event: Event) => {
      const panel = event.currentTarget as HTMLDetailsElement;
      const id = panel.dataset.paramPanelId;
      if (!id) return;
      const latest = readStoredOpenPanels().ids;
      if (panel.open) latest.add(id);
      else latest.delete(id);
      writeStoredOpenPanels(latest);
    };

    for (const panel of panels) {
      panel.addEventListener("toggle", onToggle);
    }
    return () => {
      for (const panel of panels) {
        panel.removeEventListener("toggle", onToggle);
      }
    };
  }, []);

  function openAllPanels() {
    const panels = getAllPanels(document.getElementById("parametres-content"));
    const openIds = new Set<string>();
    for (const panel of panels) {
      panel.open = true;
      const id = panel.dataset.paramPanelId;
      if (id) openIds.add(id);
    }
    writeStoredOpenPanels(openIds);
  }

  function closeAllPanels() {
    const panels = getAllPanels(document.getElementById("parametres-content"));
    for (const panel of panels) panel.open = false;
    writeStoredOpenPanels(new Set<string>());
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={openAllPanels}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Ouvrir tout
      </button>
      <button
        type="button"
        onClick={closeAllPanels}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Fermer tout
      </button>
      <span className="text-xs text-slate-500">Les panneaux ouverts sont mémorisés sur cet appareil.</span>
    </div>
  );
}
