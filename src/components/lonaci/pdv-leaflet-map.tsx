"use client";

import type { ConcessionnaireMapPointDto } from "@/lib/lonaci/concessionnaires-map-types";
import L from "leaflet";
import { useEffect, useId, useRef, useState } from "react";

import "leaflet/dist/leaflet.css";

/** Centre par défaut (Côte d’Ivoire) si aucun point. */
const DEFAULT_CENTER: L.LatLngExpression = [7.55, -5.55];
const DEFAULT_ZOOM = 7;
const CLUSTER_MIN_POINTS = 180;
const CLUSTER_MAX_ZOOM = 10;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function googleMapsLinkHtml(lat: number, lng: number): string {
  const href = escapeHtml(googleMapsUrl(lat, lng));
  return `<div class="mt-2"><a class="text-orange-700 underline" href="${href}" target="_blank" rel="noopener noreferrer">Ouvrir dans Google Maps</a></div>`;
}

export default function PdvLeafletMap({
  points,
  highlightId,
  className = "",
  focusNonce = 0,
  onRenderStatsChange,
}: {
  points: ConcessionnaireMapPointDto[];
  highlightId?: string;
  className?: string;
  focusNonce?: number;
  onRenderStatsChange?: (stats: {
    mode: "clusters" | "points";
    renderedCount: number;
    groupedPoints: number;
    zoom: number;
  }) => void;
}) {
  const instructionsId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  /** Évite de rappeler `fitBounds` à chaque zoom (sinon la vue est réinitialisée et le zoom « ne marche pas »). */
  const lastPointsIdsRef = useRef<string>("");
  const lastFocusNonceRef = useRef(0);
  const lastHighlightIdRef = useRef<string | undefined>(undefined);

  function cellSizeForZoom(zoom: number): number {
    if (zoom <= 6) return 0.8;
    if (zoom <= 7) return 0.5;
    if (zoom <= 8) return 0.35;
    if (zoom <= 9) return 0.22;
    return 0.14;
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      scrollWheelZoom: true,
      zoomControl: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
      touchZoom: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = group;
    setZoomLevel(map.getZoom());

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    const onZoomEnd = () => {
      setZoomLevel(map.getZoom());
    };
    map.on("zoomend", onZoomEnd);

    return () => {
      ro.disconnect();
      map.off("zoomend", onZoomEnd);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;

    group.clearLayers();
    markersRef.current.clear();

    if (!points.length) {
      lastPointsIdsRef.current = "";
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      onRenderStatsChange?.({ mode: "points", renderedCount: 0, groupedPoints: 0, zoom: map.getZoom() });
      return;
    }

    const bounds = L.latLngBounds([]);
    const shouldCluster = points.length >= CLUSTER_MIN_POINTS && zoomLevel <= CLUSTER_MAX_ZOOM;
    let renderedCount = 0;
    let groupedPoints = 0;
    let focusLayer: L.CircleMarker | null = null;
    let focusLatLng: L.LatLng | null = null;

    if (shouldCluster) {
      const cellSize = cellSizeForZoom(zoomLevel);
      const clusters = new Map<
        string,
        { lat: number; lng: number; members: ConcessionnaireMapPointDto[]; highlight: boolean }
      >();
      for (const p of points) {
        const latBucket = Math.round(p.lat / cellSize);
        const lngBucket = Math.round(p.lng / cellSize);
        const key = `${latBucket}:${lngBucket}`;
        const existing = clusters.get(key);
        if (existing) {
          const nextSize = existing.members.length + 1;
          existing.lat = (existing.lat * existing.members.length + p.lat) / nextSize;
          existing.lng = (existing.lng * existing.members.length + p.lng) / nextSize;
          existing.members.push(p);
          existing.highlight = existing.highlight || Boolean(highlightId && p.id === highlightId);
        } else {
          clusters.set(key, {
            lat: p.lat,
            lng: p.lng,
            members: [p],
            highlight: Boolean(highlightId && p.id === highlightId),
          });
        }
      }

      for (const cluster of clusters.values()) {
        const size = cluster.members.length;
        renderedCount += 1;
        if (size > 1) groupedPoints += size;

        const radius = size > 1 ? Math.min(30, 11 + Math.round(Math.log2(size) * 4)) : 7;
        const fillColor =
          cluster.highlight && size > 1
            ? "#ea580c"
            : size > 1
              ? "#12304f"
              : cluster.highlight
                ? "#f97316"
                : "#0b1d33";

        const marker = L.circleMarker([cluster.lat, cluster.lng], {
          radius,
          stroke: true,
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillColor,
          fillOpacity: 0.92,
        });

        if (size > 1) {
          const preview = cluster.members
            .slice(0, 4)
            .map((m) => `<li>${escapeHtml(m.codePdv)} · ${escapeHtml(m.label)}</li>`)
            .join("");
          const more = size > 4 ? `<div class="mt-1 text-slate-500">+${size - 4} autre(s)</div>` : "";
          marker.bindPopup(
            `<div class="text-xs leading-snug">
              <div class="font-semibold">Cluster: ${size} PDV</div>
              <ul class="mt-1 list-inside list-disc text-slate-700">${preview}</ul>
              ${more}
              <div class="mt-1 text-slate-500">Zoomez pour dissocier les points.</div>
              ${googleMapsLinkHtml(cluster.lat, cluster.lng)}
            </div>`,
            { className: "pdv-map-popup", maxWidth: 300 },
          );
        } else {
          const only = cluster.members[0];
          marker.bindPopup(
            `<div class="text-xs leading-snug">
              <div class="font-semibold">${escapeHtml(only.codePdv)}</div>
              <div class="mt-0.5 text-slate-700">${escapeHtml(only.label)}</div>
              ${googleMapsLinkHtml(only.lat, only.lng)}
            </div>`,
            { className: "pdv-map-popup", maxWidth: 260 },
          );
          markersRef.current.set(only.id, marker);
        }

        marker.addTo(group);
        bounds.extend([cluster.lat, cluster.lng]);
        if (cluster.highlight) {
          focusLayer = marker;
          focusLatLng = marker.getLatLng();
        }
      }
    } else {
      for (const p of points) {
        renderedCount += 1;
        const hi = highlightId && p.id === highlightId;
        const circle = L.circleMarker([p.lat, p.lng], {
          radius: hi ? 11 : 7,
          stroke: true,
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillColor: hi ? "#f97316" : "#0b1d33",
          fillOpacity: 0.88,
        });
        circle.bindPopup(
          `<div class="text-xs leading-snug">
            <div class="font-semibold">${escapeHtml(p.codePdv)}</div>
            <div class="mt-0.5 text-slate-700">${escapeHtml(p.label)}</div>
            ${googleMapsLinkHtml(p.lat, p.lng)}
          </div>`,
          { className: "pdv-map-popup", maxWidth: 260 },
        );
        circle.addTo(group);
        markersRef.current.set(p.id, circle);
        bounds.extend([p.lat, p.lng]);
      }
    }

    if (bounds.isValid()) {
      const idsKey = points.map((p) => p.id).join(",");
      const shouldFitBounds = lastPointsIdsRef.current !== idsKey;
      if (shouldFitBounds) {
        lastPointsIdsRef.current = idsKey;
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
      }

      const focusBump = lastFocusNonceRef.current !== focusNonce;
      lastFocusNonceRef.current = focusNonce;
      const highlightBump = (highlightId ?? "") !== (lastHighlightIdRef.current ?? "");
      lastHighlightIdRef.current = highlightId;

      if (highlightId) {
        const highlighted = markersRef.current.get(highlightId) ?? focusLayer;
        const target = highlighted?.getLatLng() ?? focusLatLng;
        if (target && highlighted) {
          if (shouldFitBounds || focusBump || highlightBump) {
            map.panTo(target, { animate: true });
          }
          highlighted.openPopup();
        }
      }

      onRenderStatsChange?.({
        mode: shouldCluster ? "clusters" : "points",
        renderedCount,
        groupedPoints,
        zoom: map.getZoom(),
      });
    }
  }, [points, highlightId, zoomLevel, focusNonce, onRenderStatsChange]);

  return (
    <div
      className={`isolate z-0 h-[min(60vh,680px)] min-h-90 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm ${className}`}
    >
      <p id={instructionsId} className="lonaci-ui-sr-only">
        Carte interactive. Utilisez les touches fléchées pour vous déplacer et les touches plus et moins pour zoomer.
      </p>
      <div
        ref={containerRef}
        className="h-full min-h-90 w-full rounded-[inherit] focus-visible:ring-4 focus-visible:ring-orange-300"
        role="region"
        aria-label="Carte des points de vente géolocalisés"
        aria-describedby={instructionsId}
      />
    </div>
  );
}
