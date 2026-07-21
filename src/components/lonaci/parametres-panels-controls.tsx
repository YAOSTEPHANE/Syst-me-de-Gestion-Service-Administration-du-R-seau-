"use client";

import { Button } from "@/components/lonaci/ui/button";
import { ChevronsDownUp, ChevronsUpDown, Info } from "lucide-react";
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
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={ChevronsUpDown}
        onClick={openAllPanels}
        className="w-full justify-center border-white/20 bg-white text-[#102a43] sm:w-auto"
      >
        Ouvrir tout
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={ChevronsDownUp}
        onClick={closeAllPanels}
        className="w-full justify-center border border-white/20 text-white hover:bg-white/10 sm:w-auto"
      >
        Fermer tout
      </Button>
      <p className="inline-flex items-center gap-1.5 text-xs leading-5 text-slate-300">
        <Info size={14} aria-hidden="true" className="shrink-0 text-orange-300" />
        Les panneaux ouverts sont mémorisés sur cet appareil.
      </p>
    </div>
  );
}
