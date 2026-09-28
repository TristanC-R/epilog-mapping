"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import BasemapSwitcher from "@/components/BasemapSwitcher";
import NorthArrow from "@/components/NorthArrow";
import {
  DEFAULT_BASEMAP_ID,
  MAP_MAX_ZOOM,
  UPMINSTER_VIEW,
  getBasemap,
  type BasemapId,
} from "@/lib/map";

export default function MapApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [basemapId, setBasemapId] = useState<BasemapId>(DEFAULT_BASEMAP_ID);
  const [ready, setReady] = useState(false);

  // ------------------------------------------------------------------- map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getBasemap(DEFAULT_BASEMAP_ID).style,
      center: [UPMINSTER_VIEW.longitude, UPMINSTER_VIEW.latitude],
      zoom: UPMINSTER_VIEW.zoom,
      maxZoom: MAP_MAX_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }),
      "bottom-left",
    );

    map.once("load", () => {
      // Size the canvas to the laid-out shell before first paint.
      map.resize();
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Basemap switching (view position is preserved by MapLibre across setStyle).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const style = getBasemap(basemapId).style;
    if (typeof style === "string") {
      map.setStyle(style);
    } else {
      map.setStyle(style, { diff: true });
    }
  }, [basemapId]);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map-canvas" />
      <BasemapSwitcher value={basemapId} onChange={setBasemapId} />
      <NorthArrow mapRef={mapRef} ready={ready} />
    </div>
  );
}
