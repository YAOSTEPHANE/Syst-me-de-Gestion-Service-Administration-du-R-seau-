"use client";

import type { ConcessionnaireMapPointDto } from "@/lib/lonaci/concessionnaires-map-types";
import L from "leaflet";
import { useEffect, useRef } from "react";

import "leaflet/dist/leaflet.css";

/** Centre par défaut (Côte d’Ivoire) si aucun point. */
const DEFAULT_CENTER: L.LatLngExpression = [7.55, -5.55];
const DEFAULT_ZOOM = 7;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function PdvLeafletMap({
  points,
  highlightId,
  className = "",
}: {
  points: ConcessionnaireMapPointDto[];
  highlightId?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = group;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
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

    if (!points.length) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const bounds = L.latLngBounds([]);
    for (const p of points) {
      const hi = highlightId && p.id === highlightId;
      const circle = L.circleMarker([p.lat, p.lng], {
        radius: hi ? 11 : 7,
        stroke: true,
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillColor: hi ? "#0891b2" : "#2563eb",
        fillOpacity: 0.88,
      });
      circle.bindPopup(
        `<div class="text-xs leading-snug">
          <div class="font-semibold">${escapeHtml(p.codePdv)}</div>
          <div class="mt-0.5 text-slate-700">${escapeHtml(p.label)}</div>
        </div>`,
        { className: "pdv-map-popup", maxWidth: 260 },
      );
      circle.addTo(group);
      bounds.extend([p.lat, p.lng]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
    }
  }, [points, highlightId]);

  return (
    <div
      ref={containerRef}
      className={`z-0 min-h-[280px] w-full rounded-xl border border-slate-200 bg-slate-100 ${className}`}
      style={{ height: "min(42vh, 420px)" }}
      role="region"
      aria-label="Carte des points de vente géolocalisés"
    />
  );
}
