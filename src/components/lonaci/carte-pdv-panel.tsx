"use client";

import type { ConcessionnaireMapPointDto } from "@/lib/lonaci/concessionnaires-map-types";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const PdvLeafletMap = dynamic(() => import("@/components/lonaci/pdv-leaflet-map"), {
  ssr: false,
  loading: () => (
    <div
      className="min-h-[280px] w-full animate-pulse rounded-xl border border-slate-700 bg-slate-800/40"
      style={{ height: "min(42vh, 420px)" }}
    />
  ),
});

export default function CartePdvPanel() {
  const searchParams = useSearchParams();
  const highlightRaw =
    searchParams.get("concessionnaireId")?.trim() ?? searchParams.get("focusId")?.trim() ?? "";
  const highlightId = /^[a-f\d]{24}$/i.test(highlightRaw) ? highlightRaw : "";

  const agenceId = searchParams.get("agenceId") ?? "";
  const produitCode = searchParams.get("produitCode") ?? "";
  const statut = searchParams.get("statut") ?? "";
  const q = searchParams.get("q")?.trim() ?? "";

  /** Clé stable pour le chargement carte (hors highlight) — évite [searchParams] instable avec Next 16. */
  const mapFiltersKey = [agenceId, produitCode, statut, q].join("\0");

  const [points, setPoints] = useState<ConcessionnaireMapPointDto[]>([]);
  const [totalWithGps, setTotalWithGps] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const params = new URLSearchParams();
        if (agenceId) params.set("agenceId", agenceId);
        if (produitCode) params.set("produitCode", produitCode);
        if (statut) params.set("statut", statut);
        if (q) params.set("q", q);

        const res = await fetch(`/api/concessionnaires/map-points?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Chargement impossible");
        const data = (await res.json()) as {
          points: ConcessionnaireMapPointDto[];
          totalWithGps: number;
          truncated: boolean;
        };
        if (cancelled) return;
        setPoints(data.points);
        setTotalWithGps(data.totalWithGps);
        setTruncated(data.truncated);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapFiltersKey, agenceId, produitCode, statut, q]);

  const sortedList = useMemo(() => {
    if (!highlightId) return points;
    return [...points].sort((a, b) => {
      if (a.id === highlightId) return -1;
      if (b.id === highlightId) return 1;
      return 0;
    });
  }, [points, highlightId]);

  if (loading) return <p className="text-sm text-slate-400">Chargement des PDV géolocalisés...</p>;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="text-sm font-semibold text-slate-200">Carte interactive</h3>
        <p className="mt-1 text-xs text-slate-500">
          OpenStreetMap · zoom et déplacement libres. Pop-up au clic sur un point.
          {truncated ? (
            <span className="mt-1 block text-amber-400/90">
              Affichage tronqué : affinez les filtres pour charger moins de points.
            </span>
          ) : null}
        </p>
        {totalWithGps === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Aucun concessionnaire avec coordonnées GPS renseignées.</p>
        ) : (
          <>
            <div className="mt-3">
              <PdvLeafletMap points={points} highlightId={highlightId || undefined} className="border-slate-700" />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-300 tabular-nums">{points.length}</span> point
              {points.length > 1 ? "s" : ""} sur la carte
              {totalWithGps > points.length || truncated ? (
                <>
                  {" "}
                  · <span className="tabular-nums">{totalWithGps}</span> PDV avec GPS (filtres)
                </>
              ) : null}
            </p>
          </>
        )}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="text-sm font-semibold text-slate-200">Liste</h3>
        <p className="mt-1 text-xs text-slate-500">Même jeu que la carte (ordre : point mis en avant en tête).</p>
        <ul className="mt-2 max-h-[min(70vh,520px)] space-y-2 overflow-auto text-sm text-slate-300">
          {sortedList.map((c) => (
            <li
              key={c.id}
              className={`border-b pb-2 ${
                c.id === highlightId ? "border-cyan-600 text-cyan-100" : "border-slate-800 text-slate-300"
              }`}
            >
              <span className="font-mono text-xs text-slate-400">{c.codePdv}</span> {c.label}
            </li>
          ))}
          {!sortedList.length ? (
            <li className="text-sm text-slate-500">Aucun point à afficher.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
