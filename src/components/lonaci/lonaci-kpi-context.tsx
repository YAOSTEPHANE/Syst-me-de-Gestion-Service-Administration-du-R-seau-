"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { LonaciKpiPayload } from "@/lib/lonaci/lonaci-kpi-types";

type Ctx = {
  kpi: LonaciKpiPayload | null;
  error: string | null;
  refresh: () => Promise<void>;
};

const LonaciKpiContext = createContext<Ctx>({ kpi: null, error: null, refresh: async () => {} });

export function LonaciKpiProvider({ children }: { children: ReactNode }) {
  const [kpi, setKpi] = useState<LonaciKpiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/dashboard/kpi", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Données tableau de bord indisponibles");
      setKpi((await res.json()) as LonaciKpiPayload);
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
    return () => {
      window.removeEventListener("lonaci:data-imported", onDataImported);
    };
  }, []);

  const value = useMemo(() => ({ kpi, error, refresh }), [kpi, error]);
  return <LonaciKpiContext.Provider value={value}>{children}</LonaciKpiContext.Provider>;
}

export function useLonaciKpi() {
  return useContext(LonaciKpiContext);
}
