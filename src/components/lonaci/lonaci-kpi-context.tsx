"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { lonaciFetch } from "@/lib/lonaci-client-fetch";
import type { LonaciKpiPayload } from "@/lib/lonaci/lonaci-kpi-types";

type Ctx = {
  kpi: LonaciKpiPayload | null;
  error: string | null;
  refresh: (agenceId?: string) => Promise<void>;
};

const LonaciKpiContext = createContext<Ctx>({ kpi: null, error: null, refresh: async () => {} });

function isForcedPasswordChangeRoute() {
  if (typeof window === "undefined") return false;
  const isParametres = window.location.pathname.startsWith("/parametres");
  if (!isParametres) return false;
  const search = new URLSearchParams(window.location.search);
  return search.get("motDePasse") === "obligatoire";
}

export function LonaciKpiProvider({ children }: { children: ReactNode }) {
  const [kpi, setKpi] = useState<LonaciKpiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const agenceIdRef = useRef("");

  async function refresh(agenceId?: string) {
    if (isForcedPasswordChangeRoute()) {
      setKpi(null);
      setError(null);
      return;
    }
    if (agenceId !== undefined) agenceIdRef.current = agenceId;
    const selectedAgenceId = agenceId ?? agenceIdRef.current;
    try {
      const query = selectedAgenceId ? `?agenceId=${encodeURIComponent(selectedAgenceId)}` : "";
      const res = await lonaciFetch(`/api/dashboard/kpi${query}`);
      if (!res.ok) throw new Error("Données tableau de bord indisponibles");
      const next = (await res.json()) as LonaciKpiPayload;
      setKpi((current) => {
        if (!selectedAgenceId || !current?.agencesOverview30j?.length) return next;
        return { ...next, agencesOverview30j: current.agencesOverview30j };
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const onDataImported = () => {
      void refresh();
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    window.addEventListener("lonaci:data-changed", onDataImported);
    return () => {
      window.removeEventListener("lonaci:data-imported", onDataImported);
      window.removeEventListener("lonaci:data-changed", onDataImported);
    };
  }, []);

  const value = useMemo(() => ({ kpi, error, refresh }), [kpi, error]);
  return <LonaciKpiContext.Provider value={value}>{children}</LonaciKpiContext.Provider>;
}

export function useLonaciKpi() {
  return useContext(LonaciKpiContext);
}
