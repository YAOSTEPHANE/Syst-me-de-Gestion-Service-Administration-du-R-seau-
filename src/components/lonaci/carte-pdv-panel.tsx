"use client";

import type { ConcessionnaireMapPointDto } from "@/lib/lonaci/concessionnaires-map-types";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const PdvLeafletMap = dynamic(() => import("@/components/lonaci/pdv-leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[min(60vh,680px)] min-h-[360px] w-full animate-pulse rounded-xl border border-slate-700 bg-slate-800/40" />
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
  const [localQuery, setLocalQuery] = useState("");
  const [sortMode, setSortMode] = useState<"code" | "label">("code");
  const [selectedPointId, setSelectedPointId] = useState("");
  const [focusNonce, setFocusNonce] = useState(0);
  const [mapRenderStats, setMapRenderStats] = useState<{
    mode: "clusters" | "points";
    renderedCount: number;
    groupedPoints: number;
    zoom: number;
  }>({
    mode: "points",
    renderedCount: 0,
    groupedPoints: 0,
    zoom: 7,
  });

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

  useEffect(() => {
    if (!points.length) {
      setSelectedPointId("");
      return;
    }
    if (highlightId && points.some((p) => p.id === highlightId)) {
      setSelectedPointId(highlightId);
      return;
    }
    setSelectedPointId((current) => (current && points.some((p) => p.id === current) ? current : points[0].id));
  }, [points, highlightId]);

  const filteredAndSorted = useMemo(() => {
    const normalized = localQuery.trim().toLowerCase();
    const filtered = normalized
      ? points.filter((p) => {
          const haystack = `${p.codePdv} ${p.label}`.toLowerCase();
          return haystack.includes(normalized);
        })
      : points;
    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "label") return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
      return a.codePdv.localeCompare(b.codePdv, "fr", { sensitivity: "base" });
    });
    return sorted.sort((a, b) => {
      if (a.id === selectedPointId) return -1;
      if (b.id === selectedPointId) return 1;
      return 0;
    });
  }, [localQuery, points, selectedPointId, sortMode]);

  const selectedPoint = useMemo(
    () => filteredAndSorted.find((p) => p.id === selectedPointId) ?? null,
    [filteredAndSorted, selectedPointId],
  );

  const geoStats = useMemo(() => {
    if (!points.length) return null;
    let north = points[0];
    let south = points[0];
    let east = points[0];
    let west = points[0];
    let latSum = 0;
    let lngSum = 0;
    for (const p of points) {
      if (p.lat > north.lat) north = p;
      if (p.lat < south.lat) south = p;
      if (p.lng > east.lng) east = p;
      if (p.lng < west.lng) west = p;
      latSum += p.lat;
      lngSum += p.lng;
    }
    return {
      north,
      south,
      east,
      west,
      centerLat: latSum / points.length,
      centerLng: lngSum / points.length,
    };
  }, [points]);

  if (loading) return <p className="text-sm text-slate-400">Chargement des PDV géolocalisés...</p>;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-200 bg-linear-to-r from-slate-900 via-slate-800 to-cyan-900 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-cyan-300/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-24 h-44 w-44 rounded-full bg-sky-300/20 blur-2xl" />
        <div className="relative">
          <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
            Géolocalisation premium
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Carte PDV ultra-premium</h2>
          <p className="mt-1 text-sm text-cyan-100/90">
            Vue opérationnelle enrichie : carte interactive, sélection guidée, métriques géospatiales et liste pilotable.
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-cyan-100 bg-linear-to-br from-cyan-50 to-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-cyan-700">Points affichés</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{points.length}</p>
          <p className="text-[11px] text-slate-600">Marqueurs rendus sur la carte</p>
        </article>
        <article className="rounded-2xl border border-indigo-100 bg-linear-to-br from-indigo-50 to-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-indigo-700">PDV GPS total</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{totalWithGps}</p>
          <p className="text-[11px] text-slate-600">Après filtres URL actifs</p>
        </article>
        <article className="rounded-2xl border border-violet-100 bg-linear-to-br from-violet-50 to-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-violet-700">Sélection active</p>
          <p className="mt-1 truncate text-lg font-bold tracking-tight text-slate-900">
            {selectedPoint?.codePdv ?? "—"}
          </p>
          <p className="truncate text-[11px] text-slate-600">{selectedPoint?.label ?? "Aucun point sélectionné"}</p>
        </article>
        <article className="rounded-2xl border border-amber-100 bg-linear-to-br from-amber-50 to-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-amber-700">Charge carte</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{truncated ? "Élevée" : "Normale"}</p>
          <p className="text-[11px] text-slate-600">
            {truncated ? "Affichage tronqué (affiner filtres)." : "Rendu complet des points."}
          </p>
        </article>
      </section>

      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Carte interactive</h3>
          <p className="mt-1 text-xs text-slate-600">
            OpenStreetMap, zoom libre, popup automatique sur la sélection.
            {truncated ? <span className="mt-1 block text-amber-700">Affichage tronqué : resserrez les filtres.</span> : null}
          </p>
          {totalWithGps === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Aucun concessionnaire avec coordonnées GPS valides.</p>
          ) : (
            <div className="mt-3">
              <PdvLeafletMap
                points={points}
                highlightId={selectedPointId || highlightId || undefined}
                focusNonce={focusNonce}
                onRenderStatsChange={setMapRenderStats}
                className="border-slate-200"
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-cyan-700">
              Mode: {mapRenderStats.mode === "clusters" ? "Clusters intelligents" : "Points individuels"}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
              Zoom: {mapRenderStats.zoom.toFixed(1)}
            </span>
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">
              Éléments rendus: {mapRenderStats.renderedCount}
            </span>
            {mapRenderStats.mode === "clusters" ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                PDV groupés: {mapRenderStats.groupedPoints}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Liste pilotée</h3>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
              {filteredAndSorted.length} visible(s)
            </span>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="Rechercher code PDV / libellé"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500"
            />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as "code" | "label")}
              aria-label="Mode de tri de la liste PDV"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 focus:ring-2 focus:ring-cyan-500"
            >
              <option value="code">Tri par code PDV</option>
              <option value="label">Tri par libellé</option>
            </select>
          </div>

          {geoStats ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
              <p className="font-semibold text-slate-800">Aperçu géospatial</p>
              <p className="mt-1">
                Centre moyen: {geoStats.centerLat.toFixed(4)}, {geoStats.centerLng.toFixed(4)}
              </p>
              <p>Nord: {geoStats.north.codePdv} · Sud: {geoStats.south.codePdv}</p>
              <p>Est: {geoStats.east.codePdv} · Ouest: {geoStats.west.codePdv}</p>
            </div>
          ) : null}

          <ul className="mt-3 max-h-[min(56vh,520px)] space-y-2 overflow-auto text-sm">
            {filteredAndSorted.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPointId(c.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    c.id === selectedPointId
                      ? "border-cyan-300 bg-cyan-50 text-cyan-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="block font-mono text-xs">{c.codePdv}</span>
                  <span className="mt-0.5 block text-sm">{c.label}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                  </span>
                </button>
              </li>
            ))}
            {!filteredAndSorted.length ? <li className="text-sm text-slate-500">Aucun point à afficher.</li> : null}
          </ul>
          <div className="sticky bottom-0 mt-3 border-t border-slate-200 bg-white/95 pt-3 backdrop-blur">
            <button
              type="button"
              onClick={() => setFocusNonce((n) => n + 1)}
              disabled={!selectedPointId}
              className="w-full rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              Centrer sur ma sélection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
