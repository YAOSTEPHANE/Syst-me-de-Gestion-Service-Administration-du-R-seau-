"use client";

import type { ConcessionnaireMapPointDto } from "@/lib/lonaci/concessionnaires-map-types";
import { lonaciFetch } from "@/lib/lonaci-client-fetch";
import { Crosshair, ExternalLink, Map, MapPin, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";

const PdvLeafletMap = dynamic(() => import("@/components/lonaci/pdv-leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[min(60vh,680px)] min-h-90 w-full rounded-xl border border-slate-200 bg-slate-100 p-6">
      <Skeleton lines={5} />
    </div>
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
  const [reloadNonce, setReloadNonce] = useState(0);
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

        const res = await lonaciFetch(`/api/concessionnaires/map-points?${params.toString()}`);
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
  }, [mapFiltersKey, agenceId, produitCode, statut, q, reloadNonce]);

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

  const selectedGoogleMapsHref = selectedPoint
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${selectedPoint.lat},${selectedPoint.lng}`)}`
    : null;

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

  return (
    <div className="space-y-6" aria-live="polite" aria-busy={loading}>
      <PageHeader
        eyebrow="Géolocalisation PDV"
        title="Carte des points de vente"
        description="Explorez les implantations, sélectionnez un PDV et analysez la couverture géographique."
        actions={
          <Button variant="secondary" leadingIcon={RefreshCw} onClick={() => setReloadNonce((value) => value + 1)}>
            Rafraîchir
          </Button>
        }
      />

      {loading ? (
        <Surface padding="lg"><Skeleton lines={6} /></Surface>
      ) : error ? (
        <FeedbackState
          tone="danger"
          title="Carte indisponible"
          description={error}
          aria-live="assertive"
          action={<Button leadingIcon={RefreshCw} onClick={() => setReloadNonce((value) => value + 1)}>Réessayer</Button>}
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs de la carte">
            <MapMetric icon={MapPin} label="Points affichés" value={String(points.length)} detail="Marqueurs disponibles" />
            <MapMetric icon={Map} label="PDV GPS total" value={String(totalWithGps)} detail="Après filtres actifs" />
            <MapMetric icon={Crosshair} label="Sélection active" value={selectedPoint?.codePdv ?? "—"} detail={selectedPoint?.label ?? "Aucun point"} />
            <MapMetric icon={RefreshCw} label="Charge carte" value={truncated ? "Élevée" : "Normale"} detail={truncated ? "Affinez les filtres" : "Rendu complet"} />
          </section>

          <Surface padding="md">
            <SectionHeader
              title="Carte interactive"
              description="OpenStreetMap, zoom libre et accès à Google Maps depuis les points."
              action={<Badge tone={truncated ? "warning" : "success"}>{truncated ? "Affichage tronqué" : "Données complètes"}</Badge>}
            />
            {totalWithGps === 0 ? (
              <FeedbackState title="Aucun PDV géolocalisé" description="Aucun concessionnaire avec des coordonnées GPS valides." />
            ) : (
              <PdvLeafletMap
                points={points}
                highlightId={selectedPointId || highlightId || undefined}
                focusNonce={focusNonce}
                onRenderStatsChange={setMapRenderStats}
              />
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="brand">Mode : {mapRenderStats.mode === "clusters" ? "Clusters" : "Points"}</Badge>
              <Badge>Zoom : {mapRenderStats.zoom.toFixed(1)}</Badge>
              <Badge tone="info">{mapRenderStats.renderedCount} élément(s) rendu(s)</Badge>
              {mapRenderStats.mode === "clusters" ? <Badge tone="warning">{mapRenderStats.groupedPoints} PDV groupés</Badge> : null}
            </div>
          </Surface>

          <Surface padding="md">
            <SectionHeader
              title="Liste des points de vente"
              description="Recherchez, triez et choisissez le point à mettre en avant."
              action={<Badge>{filteredAndSorted.length} visible(s)</Badge>}
            />
            <FilterBar
              search={{
                value: localQuery,
                onChange: setLocalQuery,
                placeholder: "Code PDV ou libellé…",
                label: "Rechercher un point de vente",
              }}
              filters={
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as "code" | "label")}
                  aria-label="Mode de tri de la liste PDV"
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="code">Tri par code PDV</option>
                  <option value="label">Tri par libellé</option>
                </select>
              }
            />

            {geoStats ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <strong className="text-(--lonaci-navy-900)">Aperçu géospatial</strong>
                <p className="mt-1">Centre moyen : {geoStats.centerLat.toFixed(4)}, {geoStats.centerLng.toFixed(4)}</p>
                <p>Nord : {geoStats.north.codePdv} · Sud : {geoStats.south.codePdv} · Est : {geoStats.east.codePdv} · Ouest : {geoStats.west.codePdv}</p>
              </div>
            ) : null}

            {filteredAndSorted.length ? (
              <ul className="mt-3 grid max-h-[min(56vh,520px)] gap-2 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
                {filteredAndSorted.map((point) => (
                  <li key={point.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedPointId(point.id)}
                      aria-pressed={point.id === selectedPointId}
                      className={`min-h-24 w-full rounded-xl border px-3 py-3 text-left transition ${
                        point.id === selectedPointId
                          ? "border-orange-400 bg-orange-50 text-(--lonaci-navy-950) shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      <span className="block font-mono text-xs font-bold">{point.codePdv}</span>
                      <span className="mt-1 block">{point.label}</span>
                      <span className="mt-1 block text-xs text-slate-500">{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <FeedbackState className="mt-3" title="Aucun point à afficher" description="Modifiez votre recherche pour retrouver un PDV." />
            )}

            <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row">
              <Button className="flex-1" leadingIcon={Crosshair} onClick={() => setFocusNonce((value) => value + 1)} disabled={!selectedPointId}>
                Centrer sur la sélection
              </Button>
              {selectedGoogleMapsHref ? (
                <a href={selectedGoogleMapsHref} target="_blank" rel="noopener noreferrer" className="lonaci-ui-button lonaci-ui-button--secondary lonaci-ui-button--md flex-1">
                  <ExternalLink size={18} aria-hidden="true" />
                  Ouvrir dans Google Maps
                </a>
              ) : null}
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}

function MapMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Surface padding="md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <span className="rounded-lg bg-orange-50 p-2 text-orange-700"><Icon size={18} aria-hidden="true" /></span>
      </div>
      <p className="mt-3 truncate text-2xl font-extrabold tracking-tight text-(--lonaci-navy-950)">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-600">{detail}</p>
    </Surface>
  );
}
