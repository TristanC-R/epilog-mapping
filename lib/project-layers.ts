import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type {
  FilterSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
  StyleSpecification,
  ExpressionSpecification,
} from "maplibre-gl";

import { BASE_FILL_COLOR, BASE_LINE_COLOR } from "@/lib/base-style";
import {
  DEFAULT_GRAVE_COLOR_ID,
  getGraveColor,
  gravePaintExpression,
  type GraveColorId,
  type GraveColorModeId,
  type OccupancyGradientId,
} from "@/lib/grave-style";
import { MAP_LABEL_FONT } from "@/lib/map";
import type {
  GenericFeature,
  GeometryFamily,
  MapLayer,
  MapProject,
} from "@/lib/project-model";

const ID_PREFIX = "epilog-project:";
const SOURCE_PREFIX = `${ID_PREFIX}source:`;
const RENDER_PREFIX = `${ID_PREFIX}layer:`;
const DRAFT_SOURCE_ID = `${ID_PREFIX}draft-source`;
const DRAFT_LAYER_IDS = [
  `${ID_PREFIX}draft-fill`,
  `${ID_PREFIX}draft-line`,
  `${ID_PREFIX}draft-points`,
] as const;
/** Bump when normalizeCollection output shape changes (invalidates WeakMap cache). */
const NORMALIZE_CACHE_VERSION = 3;
const normalizedCollectionCache = new WeakMap<
  object,
  { version: number; data: FeatureCollection }
>();
const labelPointCollectionCache = new WeakMap<
  object,
  { version: number; data: FeatureCollection }
>();
const LABEL_POINT_CACHE_VERSION = 2;
const sourceDataCache = new WeakMap<
  MapLibreMap,
  Map<string, FeatureCollection>
>();
const NO_MATCH: FilterSpecification = [
  "==",
  ["get", "epilog_id"],
  "\u0000",
];

export type GraveLabelMode = "none" | "number" | "reference";

type LooseLayer = MapLayer & {
  id: string;
  kind?: string;
  geometryFamily?: GeometryFamily;
  geometry?: GeometryFamily;
  geometryType?: GeometryFamily;
  visible?: boolean;
  visibility?: boolean | "visible" | "none";
  features?: GenericFeature[] | FeatureCollection;
  featureCollection?: FeatureCollection;
  data?: GenericFeature[] | FeatureCollection;
  style?: Record<string, unknown>;
};

type LooseProject = MapProject & {
  layers?: MapLayer[];
};

type SelectedIdsByLayer =
  | ReadonlyMap<string, readonly string[]>
  | Readonly<Record<string, readonly string[] | undefined>>;

export type ProjectLayerSyncOptions = {
  /** Selected feature ids, keyed by project layer id. */
  selectedIdsByLayer?: SelectedIdsByLayer;
  /** Alias accepted by stores that call the selection collection `selectedIds`. */
  selectedIds?: SelectedIdsByLayer;
  /** Grave feature ids highlighted by validation/review. */
  flaggedGraveIds?: readonly string[];
  /** Alias retained for the cemetery UI. */
  flaggedIds?: readonly string[];
  /** Erasmus results highlighted independently from quality-control review. */
  inspectionHighlightedIds?: readonly string[];
  /** Show Erasmus result and inspection-queue overlays. */
  showInspectionOverlays?: boolean;
  /** When set, only graves in this `Sect` are drawn (Erasmus section focus). */
  visibleGraveSection?: string | null;
  graveLabelMode?: GraveLabelMode;
  /** Alias retained for the cemetery UI. */
  labelMode?: GraveLabelMode;
  graveColorId?: GraveColorId;
  /** Colour graves by a record field instead of a solid swatch. */
  graveColorMode?: GraveColorModeId;
  /** Alias retained for the cemetery UI. */
  colorMode?: GraveColorModeId;
  /** Sequential palette used when colouring by occupancy. */
  occupancyGradientId?: OccupancyGradientId;
  gradientId?: OccupancyGradientId;
  /** Per-class visibility for cemetery base surface polygons. */
  surfaceVisibility?: Readonly<Record<string, boolean>>;
  /** Shared edit/digitising overlay, rendered above every project layer. */
  draft?: FeatureCollection;
  draftFeatureCollection?: FeatureCollection;
};

type RenderRole =
  | "circle"
  | "line"
  | "fill"
  | "outline"
  | "flagged"
  | "flagged-outline"
  | "inspection-highlight"
  | "inspection-highlight-outline"
  | "inspection-queue"
  | "selected"
  | "selected-fill"
  | "label";

function encodedLayerId(layerId: string): string {
  return encodeURIComponent(layerId);
}

/** Stable GeoJSON source id for a logical project layer. */
export function managedSourceId(layerId: string): string {
  return `${SOURCE_PREFIX}${encodedLayerId(layerId)}`;
}

/** Point source used for grave labels (centroids of plot polygons). */
export function managedLabelSourceId(layerId: string): string {
  return `${SOURCE_PREFIX}${encodedLayerId(layerId)}:labels`;
}

function renderLayerId(layerId: string, role: RenderRole): string {
  return `${RENDER_PREFIX}${encodedLayerId(layerId)}:${role}`;
}

function familyOf(layer: MapLayer | LooseLayer): GeometryFamily {
  const loose = layer as LooseLayer;
  const value =
    loose.geometryFamily ?? loose.geometry ?? loose.geometryType ?? "polygon";
  const normalized = String(value).toLowerCase();
  if (normalized.includes("point")) return "point" as GeometryFamily;
  if (normalized.includes("line")) return "line" as GeometryFamily;
  return "polygon" as GeometryFamily;
}

/**
 * Every possible MapLibre layer id owned by a project layer, in bottom-to-top
 * render order. Returning overlay ids even when currently unused makes style
 * preservation and stale-layer cleanup deterministic.
 */
export function managedRenderLayerIds(
  layer: MapLayer | string,
  geometryFamily?: GeometryFamily,
): string[] {
  const layerId = typeof layer === "string" ? layer : String((layer as LooseLayer).id);
  const family =
    geometryFamily ??
    (typeof layer === "string"
      ? ("polygon" as GeometryFamily)
      : familyOf(layer));

  if (String(family).toLowerCase().includes("point")) {
    return [
      renderLayerId(layerId, "circle"),
      renderLayerId(layerId, "flagged"),
      renderLayerId(layerId, "selected"),
      renderLayerId(layerId, "label"),
    ];
  }
  if (String(family).toLowerCase().includes("line")) {
    return [
      renderLayerId(layerId, "line"),
      renderLayerId(layerId, "flagged"),
      renderLayerId(layerId, "selected"),
      renderLayerId(layerId, "label"),
    ];
  }
  return [
    renderLayerId(layerId, "fill"),
    renderLayerId(layerId, "outline"),
    renderLayerId(layerId, "flagged"),
    renderLayerId(layerId, "flagged-outline"),
    renderLayerId(layerId, "inspection-highlight"),
    renderLayerId(layerId, "inspection-highlight-outline"),
    renderLayerId(layerId, "inspection-queue"),
    renderLayerId(layerId, "selected-fill"),
    renderLayerId(layerId, "selected"),
    renderLayerId(layerId, "label"),
  ];
}

/** Resolve a project layer id from one of its MapLibre render layer ids. */
export function layerIdFromRenderLayer(renderId: string): string | null {
  if (!renderId.startsWith(RENDER_PREFIX)) return null;
  const remainder = renderId.slice(RENDER_PREFIX.length);
  const separator = remainder.lastIndexOf(":");
  if (separator < 1) return null;
  try {
    return decodeURIComponent(remainder.slice(0, separator));
  } catch {
    return null;
  }
}

/** Render layers that should participate in map hit-testing. */
export function selectableRenderLayerIds(project: MapProject): string[] {
  return projectLayers(project)
    .filter(isVisible)
    .map((layer) => {
      const family = familyOf(layer);
      if (String(family).toLowerCase().includes("point")) {
        return renderLayerId(layer.id, "circle");
      }
      if (String(family).toLowerCase().includes("line")) {
        return renderLayerId(layer.id, "line");
      }
      return renderLayerId(layer.id, "fill");
    });
}

function projectLayers(project: MapProject): LooseLayer[] {
  return (((project as LooseProject).layers ?? []) as LooseLayer[]).filter(
    (layer) => Boolean(layer && layer.id),
  );
}

function isVisible(layer: LooseLayer): boolean {
  if (layer.visible === false || layer.visibility === false) return false;
  return layer.visibility !== "none";
}

function layerKind(layer: LooseLayer): string {
  return String(layer.kind ?? "").toLowerCase();
}

function isGraveLayer(layer: LooseLayer): boolean {
  return layerKind(layer).includes("grave");
}

function isBaseSurfaceLayer(layer: LooseLayer): boolean {
  const kind = layerKind(layer);
  return (
    kind.includes("base") ||
    kind.includes("surface") ||
    kind.includes("cemetery")
  ) && !kind.includes("grave");
}

function collectionForLayer(layer: LooseLayer): FeatureCollection {
  const candidate = layer.featureCollection ?? layer.features ?? layer.data;
  if (
    candidate &&
    !Array.isArray(candidate) &&
    candidate.type === "FeatureCollection"
  ) {
    const cached = normalizedCollectionCache.get(candidate);
    if (cached && cached.version === NORMALIZE_CACHE_VERSION) {
      return cached.data;
    }
    const normalized = normalizeCollection(
      candidate.features as GenericFeature[],
      layer.id,
    );
    normalizedCollectionCache.set(candidate, {
      version: NORMALIZE_CACHE_VERSION,
      data: normalized,
    });
    return normalized;
  }
  const features = Array.isArray(candidate)
    ? candidate
    : [];
  return normalizeCollection(features as GenericFeature[], layer.id);
}

function normalizeCollection(
  features: readonly GenericFeature[],
  layerId: string,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.map((candidate, index) => {
      const feature = candidate as unknown as Feature<Geometry, GeoJsonProperties>;
      const properties = { ...(feature.properties ?? {}) };
      const id = String(
        properties.epilog_id ??
          feature.id ??
          properties.id ??
          `${layerId}:${index}`,
      );
      properties.epilog_id = id;
      if (
        feature.geometry &&
        (feature.geometry.type === "Polygon" ||
          feature.geometry.type === "MultiPolygon")
      ) {
        properties.cds_label_px20 = labelPxAtZoom20(feature.geometry);
      }
      return { ...feature, id, properties };
    }),
  };
}

/**
 * Pixel text size at zoom 20 that keeps a label tightly inside the plot.
 * Scaled later with 2^(zoom-20) so the label stays the same size relative
 * to the grave as the map zooms.
 */
function labelPxAtZoom20(geometry: Geometry): number {
  const ring =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates[0]?.[0]
        : null;
  if (!ring || ring.length < 3) {
    return 10;
  }

  let latSum = 0;
  let pointCount = 0;
  for (const position of ring) {
    if (position.length < 2) continue;
    latSum += position[1];
    pointCount += 1;
  }
  if (pointCount === 0) {
    return 10;
  }
  const midLat = (latSum / pointCount) * (Math.PI / 180);
  const metresPerDegLng = 111_320 * Math.cos(midLat);
  const metresPerDegLat = 110_540;

  // Minimum caliper width (not shortest edge): densified / jagged rings
  // otherwise pick tiny edge fragments and neighbouring identical plots
  // get different label sizes.
  const spanMetres = polygonMinWidthMetres(
    ring,
    metresPerDegLng,
    metresPerDegLat,
  );
  if (!(spanMetres > 0)) {
    return 10;
  }

  // World width in metres projected at this latitude, at zoom 0.
  const metresPerPixelAtZoom0 = 156_543.03392 * Math.cos(midLat);
  // ~40% of the short side — leaves room for multi-digit numbers.
  const targetMetres = spanMetres * 0.4;
  const pxAtZoom20 =
    (targetMetres * 2 ** 20) / metresPerPixelAtZoom0;
  // Snap so near-identical plots share one size (avoids float/MapLibre jitter).
  return Math.max(3, Math.min(28, Math.round(pxAtZoom20 * 2) / 2));
}

/** Shortest width of a ring across orientations taken from each edge normal. */
function polygonMinWidthMetres(
  ring: readonly (readonly number[])[],
  metresPerDegLng: number,
  metresPerDegLat: number,
): number {
  let minWidth = Infinity;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index];
    const b = ring[index + 1];
    if (!a || !b || a.length < 2 || b.length < 2) continue;
    const edgeX = (b[0] - a[0]) * metresPerDegLng;
    const edgeY = (b[1] - a[1]) * metresPerDegLat;
    const edgeLen = Math.hypot(edgeX, edgeY);
    if (edgeLen < 0.05) continue;
    const nx = -edgeY / edgeLen;
    const ny = edgeX / edgeLen;
    let minProj = Infinity;
    let maxProj = -Infinity;
    for (const position of ring) {
      if (!position || position.length < 2) continue;
      const px = (position[0] - a[0]) * metresPerDegLng;
      const py = (position[1] - a[1]) * metresPerDegLat;
      const proj = px * nx + py * ny;
      if (proj < minProj) minProj = proj;
      if (proj > maxProj) maxProj = proj;
    }
    const width = maxProj - minProj;
    if (width > 0.05 && width < minWidth) {
      minWidth = width;
    }
  }
  return Number.isFinite(minWidth) ? minWidth : 0;
}

function ensureSource(
  map: MapLibreMap,
  id: string,
  data: FeatureCollection,
): void {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  let cache = sourceDataCache.get(map);
  if (!cache) {
    cache = new Map();
    sourceDataCache.set(map, cache);
  }
  if (source) {
    if (cache.get(id) !== data) {
      source.setData(data);
      cache.set(id, data);
    }
    return;
  }
  map.addSource(id, {
    type: "geojson",
    data,
    promoteId: "epilog_id",
  });
  cache.set(id, data);
}

function ensureLayer(map: MapLibreMap, layer: LayerSpecification): void {
  if (!map.getLayer(layer.id)) map.addLayer(layer);
}

function setPaint(
  map: MapLibreMap,
  id: string,
  paint: Record<string, unknown>,
): void {
  if (!map.getLayer(id)) return;
  for (const [property, value] of Object.entries(paint)) {
    map.setPaintProperty(id, property, value);
  }
}

function setVisibility(map: MapLibreMap, id: string, visible: boolean): void {
  if (map.getLayer(id)) {
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

function idFilter(ids: readonly string[]): FilterSpecification {
  return ids.length
    ? ["in", ["get", "epilog_id"], ["literal", ids.map(String)]]
    : NO_MATCH;
}

function graveSectionFilter(
  section: string | null | undefined,
): FilterSpecification | null {
  if (!section) return null;
  return ["==", ["coalesce", ["get", "Sect"], ""], section];
}

function combineFilters(
  ...filters: Array<FilterSpecification | null | undefined>
): FilterSpecification | null {
  const active = filters.filter(Boolean) as FilterSpecification[];
  if (!active.length) return null;
  if (active.length === 1) return active[0];
  return ["all", ...active] as FilterSpecification;
}

function applyFilter(
  map: MapLibreMap,
  layerId: string,
  filter: FilterSpecification | null,
): void {
  if (!map.getLayer(layerId)) return;
  map.setFilter(layerId, filter);
}

function selectedFor(
  selected: SelectedIdsByLayer | undefined,
  layerId: string,
): readonly string[] {
  if (!selected) return [];
  if (selected instanceof Map) return selected.get(layerId) ?? [];
  return (
    (selected as Readonly<Record<string, readonly string[] | undefined>>)[
      layerId
    ] ?? []
  );
}

function stringStyle(
  style: Record<string, unknown>,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    if (typeof style[key] === "string") return style[key] as string;
  }
  return fallback;
}

function numberStyle(
  style: Record<string, unknown>,
  keys: string[],
  fallback: number,
): number {
  for (const key of keys) {
    if (typeof style[key] === "number") return style[key] as number;
  }
  return fallback;
}

function addProjectLayer(
  map: MapLibreMap,
  layer: LooseLayer,
  options: ProjectLayerSyncOptions,
): void {
  const source = managedSourceId(layer.id);
  const style = layer.style ?? {};
  const family = familyOf(layer);
  const visible = isVisible(layer);
  const selected = selectedFor(
    options.selectedIdsByLayer ?? options.selectedIds,
    layer.id,
  );
  const flagged = isGraveLayer(layer)
    ? (options.flaggedGraveIds ?? options.flaggedIds ?? [])
    : [];
  const inspectionHighlighted = isGraveLayer(layer)
    ? (options.inspectionHighlightedIds ?? [])
    : [];
  const sectionFilter = isGraveLayer(layer)
    ? graveSectionFilter(options.visibleGraveSection)
    : null;
  const graveColor = getGraveColor(
    String(style.graveColorId ?? options.graveColorId ?? DEFAULT_GRAVE_COLOR_ID),
  );
  const graveColorMode = String(
    style.graveColorMode ??
      options.graveColorMode ??
      options.colorMode ??
      "solid",
  ) as GraveColorModeId;
  const occupancyGradientId = String(
    style.occupancyGradientId ??
      options.occupancyGradientId ??
      options.gradientId ??
      "forest",
  ) as OccupancyGradientId;
  const defaultFill = isGraveLayer(layer) ? graveColor.fill : "#4a6b5c";
  const defaultLine = isGraveLayer(layer) ? graveColor.line : "#294a3d";
  const fillColor: string | ExpressionSpecification = isBaseSurfaceLayer(layer)
    ? BASE_FILL_COLOR
    : isGraveLayer(layer)
      ? (gravePaintExpression(
          graveColorMode,
          "fill",
          graveColor.id,
          occupancyGradientId,
        ) as ExpressionSpecification | string)
      : stringStyle(style, ["fillColor", "fill", "color"], defaultFill);
  const lineColor: string | ExpressionSpecification = isBaseSurfaceLayer(layer)
    ? BASE_LINE_COLOR
    : isGraveLayer(layer)
      ? (gravePaintExpression(
          graveColorMode,
          "line",
          graveColor.id,
          occupancyGradientId,
        ) as ExpressionSpecification | string)
      : stringStyle(style, ["lineColor", "strokeColor", "stroke", "color"], defaultLine);
  const fillOpacity = numberStyle(
    style,
    ["fillOpacity", "opacity"],
    isGraveLayer(layer) ? 0.35 : 0.5,
  );
  const lineOpacity = numberStyle(style, ["lineOpacity", "opacity"], 0.9);
  const lineWidth = numberStyle(style, ["lineWidth", "strokeWidth", "width"], 1.1);

  ensureSource(map, source, collectionForLayer(layer));

  if (String(family).toLowerCase().includes("point")) {
    const main = renderLayerId(layer.id, "circle");
    ensureLayer(map, {
      id: main,
      type: "circle",
      source,
      paint: {
        "circle-radius": numberStyle(style, ["circleRadius", "radius"], 5),
        "circle-color": stringStyle(style, ["circleColor", "fillColor", "color"], defaultFill),
        "circle-opacity": fillOpacity,
        "circle-stroke-color": stringStyle(style, ["circleStrokeColor", "lineColor"], defaultLine),
        "circle-stroke-width": numberStyle(style, ["circleStrokeWidth", "lineWidth"], 1.2),
      },
    });
    setPaint(map, main, {
      "circle-radius": numberStyle(style, ["circleRadius", "radius"], 5),
      "circle-color": stringStyle(style, ["circleColor", "fillColor", "color"], defaultFill),
      "circle-opacity": fillOpacity,
      "circle-stroke-color": stringStyle(style, ["circleStrokeColor", "lineColor"], defaultLine),
      "circle-stroke-width": numberStyle(style, ["circleStrokeWidth", "lineWidth"], 1.2),
    });
    addPointHighlight(map, source, renderLayerId(layer.id, "flagged"), flagged, "#d64545", 8);
    addPointHighlight(map, source, renderLayerId(layer.id, "selected"), selected, "#ffb703", 8);
  } else if (String(family).toLowerCase().includes("line")) {
    const main = renderLayerId(layer.id, "line");
    ensureLayer(map, {
      id: main,
      type: "line",
      source,
      paint: {
        "line-color": lineColor,
        "line-width": lineWidth,
        "line-opacity": lineOpacity,
      },
    });
    setPaint(map, main, {
      "line-color": lineColor,
      "line-width": lineWidth,
      "line-opacity": lineOpacity,
    });
    addLineHighlight(map, source, renderLayerId(layer.id, "flagged"), flagged, "#8f1d1d", 3.4);
    addLineHighlight(map, source, renderLayerId(layer.id, "selected"), selected, "#ffb703", 3.4);
  } else {
    const fill = renderLayerId(layer.id, "fill");
    const outline = renderLayerId(layer.id, "outline");
    ensureLayer(map, {
      id: fill,
      type: "fill",
      source,
      paint: { "fill-color": fillColor, "fill-opacity": fillOpacity },
    });
    ensureLayer(map, {
      id: outline,
      type: "line",
      source,
      paint: {
        "line-color": lineColor,
        "line-width": lineWidth,
        "line-opacity": lineOpacity,
      },
    });
    setPaint(map, fill, {
      "fill-color": fillColor,
      "fill-opacity": fillOpacity,
    });
    setPaint(map, outline, {
      "line-color": lineColor,
      "line-width": lineWidth,
      "line-opacity": lineOpacity,
    });
    if (isBaseSurfaceLayer(layer) && options.surfaceVisibility) {
      const visibleSurfaces = Object.entries(options.surfaceVisibility)
        .filter(([, isOn]) => isOn)
        .map(([surface]) => surface);
      const surfaceFilter: FilterSpecification = visibleSurfaces.length
        ? [
            "in",
            ["coalesce", ["get", "surface"], "grass"],
            ["literal", visibleSurfaces],
          ]
        : NO_MATCH;
      map.setFilter(fill, surfaceFilter);
      map.setFilter(outline, surfaceFilter);
    } else if (isGraveLayer(layer)) {
      applyFilter(map, fill, sectionFilter);
      applyFilter(map, outline, sectionFilter);
    }
    addFillHighlight(
      map,
      source,
      renderLayerId(layer.id, "flagged"),
      renderLayerId(layer.id, "flagged-outline"),
      flagged,
      "#d64545",
      "#8f1d1d",
      sectionFilter,
    );
    if (isGraveLayer(layer)) {
      const queueId = renderLayerId(layer.id, "inspection-queue");
      ensureLayer(map, {
        id: queueId,
        type: "line",
        source,
        filter: ["==", ["get", "erasmus_flagged"], true],
        paint: {
          "line-color": "#7b3fc6",
          "line-width": 3,
          "line-opacity": 1,
          "line-dasharray": [2, 1],
        },
      });
      applyFilter(
        map,
        queueId,
        combineFilters(sectionFilter, [
          "==",
          ["get", "erasmus_flagged"],
          true,
        ]),
      );
      addFillHighlight(
        map,
        source,
        renderLayerId(layer.id, "inspection-highlight"),
        renderLayerId(layer.id, "inspection-highlight-outline"),
        inspectionHighlighted,
        "#6b4bb8",
        "#3b236f",
        sectionFilter,
      );
    }
    addFillHighlight(
      map,
      source,
      renderLayerId(layer.id, "selected-fill"),
      renderLayerId(layer.id, "selected"),
      selected,
      "#ffb703",
      "#ffb703",
      sectionFilter,
    );
  }

  addGraveLabel(map, layer, options);
  for (const id of managedRenderLayerIds(layer)) {
    const labelVisible =
      id === renderLayerId(layer.id, "label")
        ? isGraveLayer(layer) &&
          (options.graveLabelMode ?? options.labelMode ?? "none") !== "none"
        : true;
    const inspectionOverlay =
      id === renderLayerId(layer.id, "inspection-highlight") ||
      id === renderLayerId(layer.id, "inspection-highlight-outline") ||
      id === renderLayerId(layer.id, "inspection-queue");
    setVisibility(
      map,
      id,
      visible &&
        labelVisible &&
        (!inspectionOverlay || options.showInspectionOverlays === true),
    );
  }
}

function addPointHighlight(
  map: MapLibreMap,
  source: string,
  id: string,
  ids: readonly string[],
  color: string,
  radius: number,
): void {
  ensureLayer(map, {
    id,
    type: "circle",
    source,
    filter: NO_MATCH,
    paint: {
      "circle-radius": radius,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": color,
      "circle-stroke-width": 2.5,
    },
  });
  map.setFilter(id, idFilter(ids));
}

function addLineHighlight(
  map: MapLibreMap,
  source: string,
  id: string,
  ids: readonly string[],
  color: string,
  width: number,
): void {
  ensureLayer(map, {
    id,
    type: "line",
    source,
    filter: NO_MATCH,
    paint: { "line-color": color, "line-width": width },
  });
  map.setFilter(id, idFilter(ids));
}

function addFillHighlight(
  map: MapLibreMap,
  source: string,
  fillId: string,
  lineId: string,
  ids: readonly string[],
  fillColor: string,
  lineColor: string,
  extraFilter: FilterSpecification | null = null,
): void {
  ensureLayer(map, {
    id: fillId,
    type: "fill",
    source,
    filter: NO_MATCH,
    paint: { "fill-color": fillColor, "fill-opacity": 0.3 },
  });
  ensureLayer(map, {
    id: lineId,
    type: "line",
    source,
    filter: NO_MATCH,
    paint: { "line-color": lineColor, "line-width": 2.5 },
  });
  const filter = combineFilters(extraFilter, idFilter(ids));
  applyFilter(map, fillId, filter);
  applyFilter(map, lineId, filter);
}

function addGraveLabel(
  map: MapLibreMap,
  layer: LooseLayer,
  options: ProjectLayerSyncOptions,
): void {
  if (!isGraveLayer(layer)) return;
  const id = renderLayerId(layer.id, "label");
  const labelSource = managedLabelSourceId(layer.id);
  const polygons = collectionForLayer(layer);
  ensureSource(map, labelSource, labelPointsForPolygons(polygons));

  // Symbol layers cannot change source after creation — recreate if needed.
  const existing = map.getLayer(id) as { source?: string } | undefined;
  if (existing && existing.source !== labelSource) {
    map.removeLayer(id);
  }

  const mode = options.graveLabelMode ?? options.labelMode ?? "none";
  const property =
    mode === "reference"
      ? ["GraveRef", "graveReference", "reference"]
      : ["Grave", "graveNumber", "number"];
  const textField = [
    "to-string",
    ["coalesce", ...property.map((key) => ["get", key]), ""],
  ] as ExpressionSpecification;
  // IMPORTANT: text-size must be camera-only (zoom). Mixing ["get", …] with
  // zoom creates a composite expression; MapLibre’s symbol shader packs those
  // incorrectly and neighbouring graves get random sizes/placement.
  const sizeFactor = mode === "reference" ? 0.72 : 1;
  const basePx = medianLabelPx(polygons) * sizeFactor;
  const textSize = cameraGeographicTextSize(basePx);

  ensureLayer(map, {
    id,
    type: "symbol",
    source: labelSource,
    minzoom: 17,
    layout: {
      "symbol-placement": "point",
      "symbol-z-order": "viewport-y",
      "text-field": textField,
      "text-font": MAP_LABEL_FONT,
      "text-size": textSize,
      "text-anchor": "center",
      "text-justify": "center",
      "text-offset": [0, 0],
      "text-rotate": 0,
      // Keep labels upright on screen regardless of map bearing / plot angle.
      "text-rotation-alignment": "viewport",
      "text-pitch-alignment": "viewport",
      "text-max-width": 24,
      "text-line-height": 1,
      "text-padding": 0,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-optional": false,
      visibility: mode === "none" ? "none" : "visible",
    },
    paint: {
      "text-color": stringStyle(
        layer.style ?? {},
        ["labelColor", "textColor"],
        "#1a2420",
      ),
      "text-halo-color": "rgba(255,255,255,0.92)",
      "text-halo-width": 0.75,
    },
  });

  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, "symbol-placement", "point");
  map.setLayoutProperty(id, "text-field", textField);
  map.setLayoutProperty(id, "text-size", textSize);
  map.setLayoutProperty(id, "text-anchor", "center");
  map.setLayoutProperty(id, "text-justify", "center");
  map.setLayoutProperty(id, "text-offset", [0, 0]);
  map.setLayoutProperty(id, "text-rotate", 0);
  map.setLayoutProperty(id, "text-rotation-alignment", "viewport");
  map.setLayoutProperty(id, "text-pitch-alignment", "viewport");
  map.setLayoutProperty(id, "text-max-width", 24);
  map.setLayoutProperty(id, "text-line-height", 1);
  map.setLayoutProperty(id, "text-padding", 0);
  map.setLayoutProperty(id, "text-allow-overlap", true);
  map.setLayoutProperty(id, "text-ignore-placement", true);
  map.setLayoutProperty(
    id,
    "visibility",
    mode === "none" ? "none" : "visible",
  );
  applyFilter(map, id, graveSectionFilter(options.visibleGraveSection));
  map.setPaintProperty(id, "text-halo-width", 0.75);
}

/** Point features at each polygon’s bbox centre for stable label anchors. */
function labelPointsForPolygons(
  collection: FeatureCollection,
): FeatureCollection {
  const cached = labelPointCollectionCache.get(collection);
  if (cached && cached.version === LABEL_POINT_CACHE_VERSION) {
    return cached.data;
  }
  const points: FeatureCollection = {
    type: "FeatureCollection",
    features: collection.features.flatMap((feature) => {
      const ring = exteriorRing(feature.geometry);
      if (!ring) return [];
      const coordinates = ringBboxCenter(ring);
      if (!coordinates) return [];
      return [
        {
          type: "Feature" as const,
          id: feature.id,
          properties: feature.properties ?? {},
          geometry: { type: "Point" as const, coordinates },
        },
      ];
    }),
  };
  labelPointCollectionCache.set(collection, {
    version: LABEL_POINT_CACHE_VERSION,
    data: points,
  });
  return points;
}

function exteriorRing(
  geometry: Geometry | null | undefined,
): readonly (readonly number[])[] | null {
  if (!geometry) return null;
  if (geometry.type === "Polygon") return geometry.coordinates[0] ?? null;
  if (geometry.type === "MultiPolygon") {
    let best: readonly (readonly number[])[] | null = null;
    let bestArea = -1;
    for (const polygon of geometry.coordinates) {
      const ring = polygon[0];
      const area = Math.abs(ringSignedArea(ring));
      if (area > bestArea) {
        bestArea = area;
        best = ring ?? null;
      }
    }
    return best;
  }
  return null;
}

function ringBboxCenter(
  ring: readonly (readonly number[])[],
): [number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let count = 0;
  for (const position of ring) {
    if (!position || position.length < 2) continue;
    const lng = position[0];
    const lat = position[1];
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
    count += 1;
  }
  if (count === 0 || !Number.isFinite(minLng) || !Number.isFinite(minLat)) {
    return null;
  }
  // For rectangles (including rotated ones) the AABB centre is the true centre.
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

function ringSignedArea(
  ring: readonly (readonly number[])[] | undefined,
): number {
  if (!ring || ring.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index];
    const b = ring[index + 1];
    if (!a || !b || a.length < 2 || b.length < 2) continue;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area * 0.5;
}

function medianLabelPx(collection: FeatureCollection): number {
  const values: number[] = [];
  for (const feature of collection.features) {
    const value = feature.properties?.cds_label_px20;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      values.push(value);
    }
  }
  if (!values.length) return 8;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 8;
}

/**
 * Screen pixel size that tracks map scale: doubles every zoom level.
 * Camera-only (no feature properties) — required for correct MapLibre text-size.
 */
function cameraGeographicTextSize(basePxAtZoom20: number): ExpressionSpecification {
  const base = Math.max(3, Math.min(28, basePxAtZoom20));
  const stop = (zoom: number) =>
    Math.max(2, Math.min(64, base * 2 ** (zoom - 20)));
  return [
    "interpolate",
    ["exponential", 2],
    ["zoom"],
    16,
    stop(16),
    17,
    stop(17),
    18,
    stop(18),
    19,
    stop(19),
    20,
    stop(20),
    21,
    stop(21),
    22,
    stop(22),
    23,
    stop(23),
  ];
}

function syncDraft(
  map: MapLibreMap,
  draft: FeatureCollection | undefined,
): void {
  if (!draft) return;
  ensureSource(
    map,
    DRAFT_SOURCE_ID,
    normalizeCollection(draft.features as GenericFeature[], "draft"),
  );
  ensureLayer(map, {
    id: DRAFT_LAYER_IDS[0],
    type: "fill",
    source: DRAFT_SOURCE_ID,
    filter: [
      "any",
      ["==", ["geometry-type"], "Polygon"],
      ["==", ["get", "role"], "fill"],
    ],
    paint: { "fill-color": "#4a6b5c", "fill-opacity": 0.18 },
  });
  ensureLayer(map, {
    id: DRAFT_LAYER_IDS[1],
    type: "line",
    source: DRAFT_SOURCE_ID,
    filter: [
      "any",
      ["==", ["geometry-type"], "LineString"],
      ["==", ["get", "role"], "path"],
    ],
    paint: {
      "line-color": "#1a2420",
      "line-width": 2,
      "line-dasharray": [2, 1],
    },
  });
  ensureLayer(map, {
    id: DRAFT_LAYER_IDS[2],
    type: "circle",
    source: DRAFT_SOURCE_ID,
    filter: [
      "any",
      ["==", ["geometry-type"], "Point"],
      ["==", ["get", "role"], "vertices"],
    ],
    paint: {
      "circle-radius": 4,
      "circle-color": "#1a2420",
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#f2f5f3",
    },
  });
}

function removeStaleManagedObjects(
  map: MapLibreMap,
  project: MapProject,
): void {
  const sourceIds = new Set(
    projectLayers(project).flatMap((layer) => [
      managedSourceId(layer.id),
      managedLabelSourceId(layer.id),
    ]),
  );
  const renderIds = new Set(
    projectLayers(project).flatMap((layer) => managedRenderLayerIds(layer)),
  );
  const style = map.getStyle();
  for (const layer of style.layers ?? []) {
    if (
      layer.id.startsWith(RENDER_PREFIX) &&
      !renderIds.has(layer.id)
    ) {
      map.removeLayer(layer.id);
    }
  }
  for (const sourceId of Object.keys(style.sources ?? {})) {
    if (sourceId.startsWith(SOURCE_PREFIX) && !sourceIds.has(sourceId)) {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      sourceDataCache.get(map)?.delete(sourceId);
    }
  }
}

function orderManagedLayers(map: MapLibreMap, project: MapProject): void {
  for (const layer of projectLayers(project)) {
    for (const id of managedRenderLayerIds(layer)) {
      if (map.getLayer(id)) map.moveLayer(id);
    }
  }
  for (const id of DRAFT_LAYER_IDS) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

/**
 * Synchronise all logical project layers into MapLibre. The operation is
 * idempotent: sources are updated in place and render layers survive style
 * changes when used with preserveProjectStyle.
 */
export function syncProjectLayers(
  map: MapLibreMap,
  project: MapProject,
  options: ProjectLayerSyncOptions = {},
): void {
  if (!map.getStyle() || !map.isStyleLoaded()) return;
  removeStaleManagedObjects(map, project);
  for (const layer of projectLayers(project)) addProjectLayer(map, layer, options);
  if (
    options.draft !== undefined ||
    options.draftFeatureCollection !== undefined
  ) {
    syncDraft(map, options.draft ?? options.draftFeatureCollection);
  }
  orderManagedLayers(map, project);
}

/** Update only the lightweight edit preview without touching project sources. */
export function syncProjectDraft(
  map: MapLibreMap,
  draft?: FeatureCollection,
): void {
  if (!map.getStyle() || !map.isStyleLoaded()) return;
  syncDraft(map, draft);
  for (const id of DRAFT_LAYER_IDS) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

/**
 * Carry project-owned sources and layers across a basemap style swap.
 * Only ids belonging to the supplied project are retained.
 */
export function preserveProjectStyle(
  previous: StyleSpecification | undefined,
  next: StyleSpecification,
  project: MapProject,
): StyleSpecification {
  if (!previous) return next;
  const wantedSources = new Set([
    ...projectLayers(project).flatMap((layer) => [
      managedSourceId(layer.id),
      managedLabelSourceId(layer.id),
    ]),
    DRAFT_SOURCE_ID,
  ]);
  const wantedLayers = new Set([
    ...projectLayers(project).flatMap((layer) => managedRenderLayerIds(layer)),
    ...DRAFT_LAYER_IDS,
  ]);
  const sources = { ...next.sources };
  for (const [id, source] of Object.entries(previous.sources ?? {})) {
    if (wantedSources.has(id)) sources[id] = source;
  }
  const previousLayers = new Map(
    (previous.layers ?? [])
      .filter((layer) => wantedLayers.has(layer.id))
      .map((layer) => [layer.id, layer]),
  );
  const layers = (next.layers ?? []).filter((layer) => !wantedLayers.has(layer.id));
  for (const layer of projectLayers(project)) {
    for (const id of managedRenderLayerIds(layer)) {
      const previousLayer = previousLayers.get(id);
      if (previousLayer) layers.push(previousLayer);
    }
  }
  for (const id of DRAFT_LAYER_IDS) {
    const previousLayer = previousLayers.get(id);
    if (previousLayer) layers.push(previousLayer);
  }
  return { ...next, sources, layers };
}
