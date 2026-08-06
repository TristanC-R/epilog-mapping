import type { FeatureCollection } from "geojson";
import type {
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  StyleSpecification,
} from "maplibre-gl";

import {
  BASE_FILL_COLOR,
  BASE_LINE_COLOR,
  SURFACE_ORDER,
  type SurfaceClass,
} from "@/lib/base-style";
import type { CemeteryCollection } from "@/lib/geo";
import {
  DEFAULT_GRAVE_COLOR_ID,
  getGraveColor,
  type GraveColorId,
} from "@/lib/grave-style";
import { MAP_LABEL_FONT } from "@/lib/map";

const CEMETERY_DATA = {
  base: "/data/upminster-base.geojson",
  graves: "/data/upminster-graves.geojson",
  meta: "/data/upminster-meta.json",
} as const;

export const UPMINSTER_VIEW = {
  longitude: 0.26035,
  latitude: 51.54476,
  zoom: 18,
} as const;

export const LAYER_IDS = {
  baseSource: "cemetery-base",
  gravesSource: "cemetery-graves",
  draftSource: "cemetery-draft",
  baseFill: "cemetery-base-fill",
  baseLine: "cemetery-base-line",
  gravesFill: "cemetery-graves-fill",
  gravesLine: "cemetery-graves-line",
  gravesFlagged: "cemetery-graves-flagged",
  gravesFlaggedLine: "cemetery-graves-flagged-line",
  gravesSelected: "cemetery-graves-selected",
  gravesSelectedFill: "cemetery-graves-selected-fill",
  baseSelected: "cemetery-base-selected",
  gravesLabel: "cemetery-graves-label",
  draftLine: "cemetery-draft-line",
  draftFill: "cemetery-draft-fill",
  draftPoints: "cemetery-draft-points",
} as const;

const CEMETERY_SOURCE_IDS = new Set<string>([
  LAYER_IDS.baseSource,
  LAYER_IDS.gravesSource,
  LAYER_IDS.draftSource,
]);

/** Bottom → top. Graves sit above base so plots stay visible and selectable. */
const CEMETERY_STACK_ORDER = [
  LAYER_IDS.baseFill,
  LAYER_IDS.baseLine,
  LAYER_IDS.gravesFill,
  LAYER_IDS.gravesLine,
  LAYER_IDS.gravesFlagged,
  LAYER_IDS.gravesFlaggedLine,
  LAYER_IDS.baseSelected,
  LAYER_IDS.gravesSelectedFill,
  LAYER_IDS.gravesSelected,
  LAYER_IDS.gravesLabel,
  LAYER_IDS.draftFill,
  LAYER_IDS.draftLine,
  LAYER_IDS.draftPoints,
] as const;

const CEMETERY_LAYER_IDS = new Set<string>(CEMETERY_STACK_ORDER);

const NO_MATCH: FilterSpecification = ["==", ["get", "epilog_id"], "\u0000"];

/** What the optional grave label shows. */
export type GraveLabelMode = "none" | "number" | "reference";

export const GRAVE_LABEL_MODES: Array<{
  id: GraveLabelMode;
  label: string;
}> = [
  { id: "none", label: "Off" },
  { id: "number", label: "Number" },
  { id: "reference", label: "Reference" },
];

type Bounds = [number, number, number, number];

type CemeteryMeta = {
  bounds?: number[];
  layers?: Array<{ file?: string; bounds?: number[] }>;
};

function asBounds(value: number[] | undefined): Bounds | null {
  if (!value || value.length !== 4) return null;
  const [west, south, east, north] = value;
  if (
    ![west, south, east, north].every((part) => typeof part === "number") ||
    !(east > west) ||
    !(north > south)
  ) {
    return null;
  }
  return [west, south, east, north];
}

function expandBounds(bounds: Bounds, factor: number): Bounds {
  const midLng = (bounds[0] + bounds[2]) / 2;
  const midLat = (bounds[1] + bounds[3]) / 2;
  const halfLng = ((bounds[2] - bounds[0]) / 2) * factor;
  const halfLat = ((bounds[3] - bounds[1]) / 2) * factor;
  return [
    midLng - halfLng,
    midLat - halfLat,
    midLng + halfLng,
    midLat + halfLat,
  ];
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

function geometryBounds(geometry: {
  type: string;
  coordinates?: unknown;
  geometries?: Array<{ type: string; coordinates?: unknown }>;
} | null | undefined): Bounds | null {
  if (!geometry) return null;
  if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    let result: Bounds | null = null;
    for (const child of geometry.geometries) {
      const next = geometryBounds(child);
      if (!next) continue;
      result = result ? unionBounds(result, next) : next;
    }
    return result;
  }
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const visit = (value: unknown): void => {
    if (!Array.isArray(value) || value.length === 0) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      const lng = value[0];
      const lat = value[1];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const child of value) visit(child);
  };
  visit(geometry.coordinates);
  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function collectionBounds(
  collection: FeatureCollection | null | undefined,
): Bounds | null {
  if (!collection?.features?.length) return null;
  let result: Bounds | null = null;
  for (const feature of collection.features) {
    if (!feature.geometry) continue;
    const next = geometryBounds(feature.geometry);
    if (!next) continue;
    result = result ? unionBounds(result, next) : next;
  }
  return result;
}

/**
 * Frame graves plus surrounding base surfaces, while ignoring distant base
 * outliers that would shove the cemetery to the edge of the viewport.
 */
export function defaultCemeteryBounds(
  base: FeatureCollection,
  graves: FeatureCollection,
): Bounds | null {
  const graveBounds = collectionBounds(graves);
  if (!graveBounds) {
    return collectionBounds(base);
  }
  const envelope = expandBounds(graveBounds, 1.65);
  let nearbyBase: Bounds | null = null;
  for (const feature of base.features) {
    if (!feature.geometry) continue;
    const featureBox = geometryBounds(feature.geometry);
    if (!featureBox || !boundsOverlap(featureBox, envelope)) continue;
    nearbyBase = nearbyBase ? unionBounds(nearbyBase, featureBox) : featureBox;
  }
  return nearbyBase ? unionBounds(graveBounds, nearbyBase) : graveBounds;
}

export async function fetchCemeteryBounds(): Promise<Bounds | null> {
  try {
    const response = await fetch(CEMETERY_DATA.meta);
    if (!response.ok) {
      return null;
    }
    const meta = (await response.json()) as CemeteryMeta;
    const gravesLayer = meta.layers?.find((layer) =>
      String(layer.file ?? "").toLowerCase().includes("grave"),
    );
    const baseLayer = meta.layers?.find((layer) =>
      String(layer.file ?? "").toLowerCase().includes("base"),
    );
    const graves = asBounds(gravesLayer?.bounds);
    const base = asBounds(baseLayer?.bounds);
    if (graves && base) {
      // Approximate the post-load framing using meta only.
      const envelope = expandBounds(graves, 1.65);
      if (boundsOverlap(base, envelope)) {
        // Clip the base box to the graves envelope so distant outliers don't
        // dominate the first paint before feature data arrives.
        return unionBounds(graves, [
          Math.max(base[0], envelope[0]),
          Math.max(base[1], envelope[1]),
          Math.min(base[2], envelope[2]),
          Math.min(base[3], envelope[3]),
        ]);
      }
      return graves;
    }
    return graves ?? asBounds(meta.bounds) ?? base;
  } catch {
    return null;
  }
}

export async function loadInitialCollections(): Promise<{
  base: FeatureCollection;
  graves: FeatureCollection;
}> {
  const [base, graves] = await Promise.all([
    fetch(CEMETERY_DATA.base).then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load base GeoJSON");
      }
      return response.json();
    }),
    fetch(CEMETERY_DATA.graves).then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load graves GeoJSON");
      }
      return response.json();
    }),
  ]);
  return { base, graves };
}

/** Keep cemetery sources/layers when swapping Streets / Satellite / Light. */
export function preserveCemeteryStyle(
  previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  if (!previous) {
    return next;
  }

  const sources = { ...next.sources };
  for (const [id, source] of Object.entries(previous.sources ?? {})) {
    if (CEMETERY_SOURCE_IDS.has(id)) {
      sources[id] = source;
    }
  }

  const previousById = new Map(
    (previous.layers ?? [])
      .filter((layer) => CEMETERY_LAYER_IDS.has(layer.id))
      .map((layer) => [layer.id, layer]),
  );
  const layers = [...(next.layers ?? [])];
  for (const id of CEMETERY_STACK_ORDER) {
    const layer = previousById.get(id);
    if (layer) {
      layers.push(layer);
    }
  }

  return {
    ...next,
    sources,
    layers,
  };
}

function ensureSource(
  map: MapLibreMap,
  id: string,
  data: FeatureCollection,
  promoteId?: string,
): void {
  const existing = map.getSource(id) as GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
    return;
  }
  map.addSource(id, {
    type: "geojson",
    data,
    ...(promoteId ? { promoteId } : {}),
  });
}

function ensureLayer(
  map: MapLibreMap,
  layer: Parameters<MapLibreMap["addLayer"]>[0],
): void {
  if (!map.getLayer(layer.id)) {
    map.addLayer(layer);
  }
}

/** Re-assert draw order after sync / style restore. */
function orderCemeteryLayers(map: MapLibreMap): void {
  for (const id of CEMETERY_STACK_ORDER) {
    if (map.getLayer(id)) {
      map.moveLayer(id);
    }
  }
}

function idFilter(ids: readonly string[]): FilterSpecification {
  if (!ids.length) {
    return NO_MATCH;
  }
  return ["in", ["get", "epilog_id"], ["literal", [...ids]]];
}

function setPaint(
  map: MapLibreMap,
  layerId: string,
  paint: Record<string, unknown>,
): void {
  if (!map.getLayer(layerId)) {
    return;
  }
  for (const [property, value] of Object.entries(paint)) {
    map.setPaintProperty(layerId, property, value);
  }
}

export type CemeterySyncOptions = {
  base: CemeteryCollection;
  graves: CemeteryCollection;
  draft: FeatureCollection;
  /** Every currently selected feature id, across base and graves. */
  selectedIds?: readonly string[];
  /** Graves flagged by the review tools. */
  flaggedIds?: readonly string[];
  graveColorId?: GraveColorId;
  labelMode?: GraveLabelMode;
};

export function syncCemeteryLayers(
  map: MapLibreMap,
  options: CemeterySyncOptions,
): void {
  if (!map.getStyle() || !map.isStyleLoaded()) {
    return;
  }

  const {
    base,
    graves,
    draft,
    selectedIds = [],
    flaggedIds = [],
    graveColorId = DEFAULT_GRAVE_COLOR_ID,
    labelMode = "none",
  } = options;
  const graveColor = getGraveColor(graveColorId);

  try {
    ensureSource(map, LAYER_IDS.baseSource, base, "epilog_id");
    ensureSource(map, LAYER_IDS.gravesSource, graves, "epilog_id");
    ensureSource(map, LAYER_IDS.draftSource, draft);

    ensureLayer(map, {
      id: LAYER_IDS.baseFill,
      type: "fill",
      source: LAYER_IDS.baseSource,
      paint: { "fill-color": BASE_FILL_COLOR, "fill-opacity": 0.62 },
    });
    ensureLayer(map, {
      id: LAYER_IDS.baseLine,
      type: "line",
      source: LAYER_IDS.baseSource,
      paint: {
        "line-color": BASE_LINE_COLOR,
        "line-width": 1.1,
        "line-opacity": 0.9,
      },
    });
    ensureLayer(map, {
      id: LAYER_IDS.baseSelected,
      type: "line",
      source: LAYER_IDS.baseSource,
      paint: { "line-color": "#1f3d30", "line-width": 2.8 },
      filter: NO_MATCH,
    });

    // Colours are re-applied because layers survive basemap style swaps.
    setPaint(map, LAYER_IDS.baseFill, {
      "fill-color": BASE_FILL_COLOR,
      "fill-opacity": 0.62,
    });
    setPaint(map, LAYER_IDS.baseLine, {
      "line-color": BASE_LINE_COLOR,
      "line-width": 1.1,
    });

    ensureLayer(map, {
      id: LAYER_IDS.gravesFill,
      type: "fill",
      source: LAYER_IDS.gravesSource,
      paint: { "fill-color": graveColor.fill, "fill-opacity": 0.35 },
    });
    ensureLayer(map, {
      id: LAYER_IDS.gravesLine,
      type: "line",
      source: LAYER_IDS.gravesSource,
      paint: {
        "line-color": graveColor.line,
        "line-width": 0.7,
        "line-opacity": 0.9,
      },
    });
    ensureLayer(map, {
      id: LAYER_IDS.gravesFlagged,
      type: "fill",
      source: LAYER_IDS.gravesSource,
      paint: { "fill-color": "#d64545", "fill-opacity": 0.42 },
      filter: NO_MATCH,
    });
    ensureLayer(map, {
      id: LAYER_IDS.gravesFlaggedLine,
      type: "line",
      source: LAYER_IDS.gravesSource,
      paint: { "line-color": "#8f1d1d", "line-width": 1.8 },
      filter: NO_MATCH,
    });
    ensureLayer(map, {
      id: LAYER_IDS.gravesSelectedFill,
      type: "fill",
      source: LAYER_IDS.gravesSource,
      paint: { "fill-color": "#ffb703", "fill-opacity": 0.3 },
      filter: NO_MATCH,
    });
    ensureLayer(map, {
      id: LAYER_IDS.gravesSelected,
      type: "line",
      source: LAYER_IDS.gravesSource,
      paint: { "line-color": "#ffb703", "line-width": 2.5 },
      filter: NO_MATCH,
    });
    ensureLayer(map, {
      id: LAYER_IDS.gravesLabel,
      type: "symbol",
      source: LAYER_IDS.gravesSource,
      minzoom: 17,
      layout: {
        "text-field": ["to-string", ["coalesce", ["get", "Grave"], ""]],
        "text-font": MAP_LABEL_FONT,
        "text-size": 11,
        "text-allow-overlap": false,
        visibility: "none",
      },
      paint: {
        "text-color": "#1a2420",
        "text-halo-color": "rgba(255,255,255,0.85)",
        "text-halo-width": 1.2,
      },
    });

    setPaint(map, LAYER_IDS.gravesFill, {
      "fill-color": graveColor.fill,
      "fill-opacity": 0.35,
    });
    setPaint(map, LAYER_IDS.gravesLine, {
      "line-color": graveColor.line,
      "line-width": 0.7,
    });

    ensureLayer(map, {
      id: LAYER_IDS.draftFill,
      type: "fill",
      source: LAYER_IDS.draftSource,
      filter: ["==", ["get", "role"], "fill"],
      paint: { "fill-color": "#4a6b5c", "fill-opacity": 0.18 },
    });
    ensureLayer(map, {
      id: LAYER_IDS.draftLine,
      type: "line",
      source: LAYER_IDS.draftSource,
      filter: ["==", ["get", "role"], "path"],
      paint: {
        "line-color": "#1a2420",
        "line-width": 2,
        "line-dasharray": [2, 1],
      },
    });
    ensureLayer(map, {
      id: LAYER_IDS.draftPoints,
      type: "circle",
      source: LAYER_IDS.draftSource,
      filter: ["==", ["get", "role"], "vertices"],
      paint: {
        "circle-radius": 4,
        "circle-color": "#1a2420",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#f2f5f3",
      },
    });

    const selectionFilter = idFilter(selectedIds);
    for (const layerId of [
      LAYER_IDS.gravesSelected,
      LAYER_IDS.gravesSelectedFill,
    ]) {
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, selectionFilter);
      }
    }

    const flagFilter = idFilter(flaggedIds);
    for (const layerId of [
      LAYER_IDS.gravesFlagged,
      LAYER_IDS.gravesFlaggedLine,
    ]) {
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, flagFilter);
      }
    }

    if (map.getLayer(LAYER_IDS.gravesLabel)) {
      map.setLayoutProperty(
        LAYER_IDS.gravesLabel,
        "visibility",
        labelMode === "none" ? "none" : "visible",
      );
      map.setLayoutProperty(LAYER_IDS.gravesLabel, "text-field", [
        "to-string",
        [
          "coalesce",
          ["get", labelMode === "reference" ? "GraveRef" : "Grave"],
          "",
        ],
      ]);
    }

    orderCemeteryLayers(map);
  } catch (error) {
    console.error("Failed to sync cemetery layers", error);
  }
}

export function fitCemeteryBounds(map: MapLibreMap, bounds: Bounds): void {
  map.resize();
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    { padding: 56, maxZoom: 19, duration: 0 },
  );
}

export type CemeteryLayerVisibility = {
  base: boolean;
  graves: boolean;
  surfaces: Record<SurfaceClass, boolean>;
};

const BASE_LAYER_IDS = [
  LAYER_IDS.baseFill,
  LAYER_IDS.baseLine,
  LAYER_IDS.baseSelected,
] as const;

const GRAVES_LAYER_IDS = [
  LAYER_IDS.gravesFill,
  LAYER_IDS.gravesLine,
  LAYER_IDS.gravesFlagged,
  LAYER_IDS.gravesFlaggedLine,
  LAYER_IDS.gravesSelectedFill,
  LAYER_IDS.gravesSelected,
] as const;

function enabledSurfaces(visibility: CemeteryLayerVisibility): SurfaceClass[] {
  return SURFACE_ORDER.filter((surface) => visibility.surfaces[surface]);
}

function surfaceFilter(surfaces: SurfaceClass[]): FilterSpecification {
  if (!surfaces.length) {
    return ["==", true, false];
  }
  // Legacy "other" polygons are treated as grass.
  const values = surfaces.includes("grass") ? [...surfaces, "other"] : surfaces;
  return ["in", ["get", "surface"], ["literal", values]];
}

export function applyLayerVisibility(
  map: MapLibreMap,
  visibility: CemeteryLayerVisibility,
  selectedIds: readonly string[] = [],
): void {
  if (!map.getStyle()) {
    return;
  }

  const setGroup = (ids: readonly string[], visible: boolean) => {
    const value = visible ? "visible" : "none";
    for (const id of ids) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", value);
      }
    }
  };

  const surfaces = enabledSurfaces(visibility);
  const baseVisible = visibility.base && surfaces.length > 0;
  setGroup(BASE_LAYER_IDS, baseVisible);
  setGroup(GRAVES_LAYER_IDS, visibility.graves);
  // Labels are owned by syncCemeteryLayers; only force them off with the layer.
  if (!visibility.graves && map.getLayer(LAYER_IDS.gravesLabel)) {
    map.setLayoutProperty(LAYER_IDS.gravesLabel, "visibility", "none");
  }

  const baseSurfaceFilter = surfaceFilter(surfaces);
  if (map.getLayer(LAYER_IDS.baseFill)) {
    map.setFilter(LAYER_IDS.baseFill, baseSurfaceFilter);
  }
  if (map.getLayer(LAYER_IDS.baseLine)) {
    map.setFilter(LAYER_IDS.baseLine, baseSurfaceFilter);
  }

  if (map.getLayer(LAYER_IDS.baseSelected)) {
    map.setFilter(
      LAYER_IDS.baseSelected,
      selectedIds.length
        ? ([
            "all",
            idFilter(selectedIds),
            baseSurfaceFilter,
          ] as FilterSpecification)
        : NO_MATCH,
    );
  }
}
