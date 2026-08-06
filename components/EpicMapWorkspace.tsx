"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import maplibregl, { type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import BasemapSwitcher from "@/components/BasemapSwitcher";
import EpicBrand from "@/components/EpicBrand";
import ContextPanel from "@/components/ContextPanel";
import CreateLayerDialog, {
  type NewLayerOptions,
} from "@/components/CreateLayerDialog";
import LayerPanel from "@/components/LayerPanel";
import NorthArrow from "@/components/NorthArrow";
import ToolRail from "@/components/ToolRail";
import type { ReferenceRunResult } from "@/components/panels/ReferencePanel";
import { useCemeteryProject } from "@/hooks/useCemeteryProject";
import { useErasmusInspections } from "@/hooks/useErasmusInspections";
import {
  UPMINSTER_VIEW,
  fetchCemeteryBounds,
  fitCemeteryBounds,
  defaultCemeteryBounds,
  loadInitialCollections,
  type GraveLabelMode,
} from "@/lib/cemetery-layers";
import {
  SURFACE_STYLE,
  normalizeSurface,
  type SurfaceClass,
} from "@/lib/base-style";
import type { LngLat } from "@/lib/crs";
import {
  angleBetween,
  boundsOfFeatures,
  centreOfBounds,
  circleRing,
  convexHull,
  nearestEdgeIndex,
  pathLengthMetres,
  rectangleRing,
  ringAreaSquareMetres,
  rotateFeature,
  splitRingByLine,
} from "@/lib/digitising";
import {
  addPart as addGeometryPart,
  addRing as addGeometryRing,
  canSafelySplitPolygon,
  centroid as genericCentroid,
  createFeatureForFamily,
  deletePart as deleteGeometryPart,
  deleteRing as deleteGeometryRing,
  deleteVertex as deleteGeometryVertex,
  insertVertex as insertGeometryVertex,
  mergeCompatibleFeatures,
  listEditableVertices,
  offsetLineFeature,
  rotateGenericFeature,
  simplifyFeature,
  splitLineFeature,
  translateFeature,
  translateFeatureGroup,
  updateVertex as updateGeometryVertex,
  type EditableVertex,
} from "@/lib/geometry-operations";
import {
  addFeatures,
  downloadText,
  draftCollection,
  duplicateFeature,
  emptyCollection,
  featuresToCsv,
  findFeature,
  normalizeCollection,
  orderFeaturesAlongPath,
  polygonFromLngLatRing,
  removeFeatures,
  replaceFeatures,
  updateFeatureGeometry,
  updateFeatureProperties,
  updateManyFeatureProperties,
  type CemeteryCollection,
  type CemeteryFeature,
  type EditLayer,
} from "@/lib/geo";
import {
  DEFAULT_GRAVE_EXPORT_SECTIONS,
  emailOwnersOfGraves,
  gravesRecordsCsv,
  hasExportSection,
} from "@/lib/bulk-records";
import {
  duplicateReferenceGroups,
  generateGraveReferences,
  issueFeatureIds,
  makeGraveReference,
  runQualityChecks,
  summariseReferences,
  type QualityIssue,
  type ReferenceSummary,
} from "@/lib/cemetery-operations";
import {
  applyAutoNumbers,
  buildGridFeatures,
  buildRowFeatures,
  layoutProperties,
  nextLayoutNumber,
  preserveGeneratedLayoutRecords,
  type LayoutMode,
} from "@/lib/layout-tools";
import {
  graveListItem,
  graveRecordRows,
  graveRecordTitle,
} from "@/lib/grave-records";
import {
  DEFAULT_GRAVE_COLOR_ID,
  DEFAULT_GRAVE_COLOR_MODE,
  DEFAULT_OCCUPANCY_GRADIENT_ID,
  getGraveColor,
  getGraveColorMode,
  getOccupancyGradient,
  type GraveColorId,
  type GraveColorModeId,
  type OccupancyGradientId,
} from "@/lib/grave-style";
import {
  DEFAULT_BASEMAP_ID,
  MAP_MAX_ZOOM,
  getBasemap,
  type BasemapId,
} from "@/lib/map";
import { loadStoredProject } from "@/lib/project-store";
import { enrichProjectWithDemoRecords } from "@/lib/project-model";
import {
  layerIdFromRenderLayer,
  preserveProjectStyle,
  selectableRenderLayerIds,
  syncProjectDraft,
  syncProjectLayers,
} from "@/lib/project-layers";
import {
  extendSelection,
  primaryId,
  removeFromSelection,
  selectMany,
  selectOne,
  selectionSize,
  selectedProjectFeatures,
  toggleSelection,
  type Selection,
} from "@/lib/selection";
import {
  DEFAULT_GRID_PARAMS,
  DEFAULT_NUMBER_PARAMS,
  DEFAULT_ROW_PARAMS,
  getTool,
  toolForShortcut,
  type DrawTarget,
  type GridParams,
  type NumberParams,
  type RowParams,
  type ToolId,
} from "@/lib/tools";
import {
  cemeteryToolCapability,
  toolCapability,
  type StandardToolId,
} from "@/lib/tool-capabilities";

const GRAVE_COLOR_STORAGE_KEY = "epilog-grave-color";
const GRAVE_COLOR_MODE_STORAGE_KEY = "epilog-grave-color-mode";
const OCCUPANCY_GRADIENT_STORAGE_KEY = "epilog-occupancy-gradient";
const VERTEX_GRAB_PIXELS = 10;
const EDGE_INSERT_METRES = 0.6;

const EMPTY_REFERENCE_SUMMARY: ReferenceSummary = {
  total: 0,
  withReference: 0,
  missingReference: 0,
  outOfDate: 0,
  duplicated: 0,
};

/** Tools that close a polygon from clicked vertices. */
const POLYGON_PATH_TOOLS = new Set<ToolId>(["draw-grave", "draw-base", "grid"]);

/** Tools that build an open path from clicked vertices. */
const LINE_PATH_TOOLS = new Set<ToolId>([
  "row-count",
  "row-size",
  "continue-row",
  "batch-row",
  "number-line",
  "split",
  "add-feature",
  "add-ring",
  "add-part",
]);

/** Tools driven by press-drag-release rather than discrete clicks. */
const DRAG_TOOLS = new Set<ToolId>([
  "draw-rect",
  "draw-circle",
  "draw-freehand",
  "box-select",
  "freehand-select",
  "rotate",
  "number-freehand",
]);

function isPathTool(tool: ToolId): boolean {
  return POLYGON_PATH_TOOLS.has(tool) || LINE_PATH_TOOLS.has(tool);
}

type DragState = {
  mode: "rect" | "circle" | "box" | "freehand" | "lasso" | "rotate";
  /** Drag origin, or the rotation centre for the rotate tool. */
  start: LngLat;
  pointer: LngLat;
  points?: LngLat[];
  baseAngle?: number;
  angle?: number;
};

type LiveState = {
  tool: ToolId;
  selection: Selection | null;
  selectionCentre: LngLat | null;
  draftPoints: LngLat[];
  rowParams: RowParams;
  gridParams: GridParams;
  numberParams: NumberParams;
  drawTarget: DrawTarget;
  snapping: boolean;
  snapTolerance: number;
  circleSelectionCentre: LngLat | null;
};

function readStoredGraveColor(): GraveColorId {
  if (typeof window === "undefined") {
    return DEFAULT_GRAVE_COLOR_ID;
  }
  try {
    const stored = window.localStorage.getItem(GRAVE_COLOR_STORAGE_KEY);
    if (stored && getGraveColor(stored).id === stored) {
      return stored as GraveColorId;
    }
  } catch {
    // Ignore storage failures.
  }
  return DEFAULT_GRAVE_COLOR_ID;
}

function readStoredGraveColorMode(): GraveColorModeId {
  if (typeof window === "undefined") {
    return DEFAULT_GRAVE_COLOR_MODE;
  }
  try {
    const stored = window.localStorage.getItem(GRAVE_COLOR_MODE_STORAGE_KEY);
    if (stored && getGraveColorMode(stored).id === stored) {
      return stored as GraveColorModeId;
    }
  } catch {
    // Ignore storage failures.
  }
  return DEFAULT_GRAVE_COLOR_MODE;
}

function readStoredOccupancyGradient(): OccupancyGradientId {
  if (typeof window === "undefined") {
    return DEFAULT_OCCUPANCY_GRADIENT_ID;
  }
  try {
    const stored = window.localStorage.getItem(OCCUPANCY_GRADIENT_STORAGE_KEY);
    if (stored && getOccupancyGradient(stored).id === stored) {
      return stored as OccupancyGradientId;
    }
  } catch {
    // Ignore storage failures.
  }
  return DEFAULT_OCCUPANCY_GRADIENT_ID;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function newGraveProperties(): Record<string, unknown> {
  return {
    Cem: "Upminster",
    Sect: "",
    SubSect: "",
    Grave: null,
    SubGrave: "",
    GraveRef: "",
    status: "Available",
  };
}

function previewRings(rings: LngLat[][]): Feature[] {
  return rings.map((ring) => ({
    type: "Feature",
    properties: { role: "fill" },
    geometry: { type: "Polygon", coordinates: [ring] },
  }));
}

function boxRing(start: LngLat, end: LngLat): LngLat[] {
  return [
    start,
    [end[0], start[1]],
    end,
    [start[0], end[1]],
    start,
  ];
}

function pointInCoordinateRing(point: LngLat, ring: number[][]): boolean {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const [x, y] = ring[index];
    const [px, py] = ring[previous];
    if (
      y > point[1] !== py > point[1] &&
      point[0] < ((px - x) * (point[1] - y)) / (py - y || Number.EPSILON) + x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export default function MapWorkspace() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const skipInitialStyleSync = useRef(true);
  const draftCollectionRef = useRef<FeatureCollection>(emptyCollection());
  const draggedVertexRef = useRef<number | null>(null);
  const reshapeVerticesRef = useRef<EditableVertex[]>([]);
  const suppressClickRef = useRef(false);
  /** Middle-button pan remains available while tools temporarily disable left-drag pan. */
  const middlePanCleanupRef = useRef<(() => void) | null>(null);

  const [status, setStatus] = useState("Loading cemetery data…");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const onAutosaveError = useCallback(() => {
    setStatus("Could not autosave locally. Export a backup before leaving.");
  }, []);
  const project = useCemeteryProject({ autosave: ready, onAutosaveError });
  const {
    base,
    graves,
    baseRef,
    gravesRef,
    commit,
    layers,
    activeLayer,
    activeLayerId,
  } = project;

  const [basemapId, setBasemapId] = useState<BasemapId>(DEFAULT_BASEMAP_ID);
  const [surfaceVisibility, setSurfaceVisibility] = useState<
    Record<SurfaceClass, boolean>
  >({
    grass: true,
    flower_bed: true,
    path: true,
    building: true,
  });
  const [showCreateLayer, setShowCreateLayer] = useState(false);
  const [graveColorId, setGraveColorId] = useState<GraveColorId>(
    readStoredGraveColor,
  );
  const [graveColorMode, setGraveColorMode] = useState<GraveColorModeId>(
    readStoredGraveColorMode,
  );
  const mappingColorModeRef = useRef<GraveColorModeId>(
    graveColorMode === "inspection" ? "solid" : graveColorMode,
  );
  const [occupancyGradientId, setOccupancyGradientId] =
    useState<OccupancyGradientId>(readStoredOccupancyGradient);
  const [labelMode, setLabelMode] = useState<GraveLabelMode>("none");

  const [workspaceModule, setWorkspaceModule] = useState<
    "mapping" | "erasmus"
  >("mapping");
  const [tool, setTool] = useState<ToolId>("select");
  const [dockView, setDockView] = useState<"layers" | "details">("details");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draftPoints, setDraftPoints] = useState<LngLat[]>([]);
  const [cursor, setCursor] = useState<LngLat | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [circleSelectionCentre, setCircleSelectionCentre] =
    useState<LngLat | null>(null);
  const [measurePoints, setMeasurePoints] = useState<LngLat[]>([]);
  const [batchPaths, setBatchPaths] = useState<LngLat[][]>([]);

  const [rowParams, setRowParams] = useState<RowParams>(DEFAULT_ROW_PARAMS);
  const [gridParams, setGridParams] = useState<GridParams>(DEFAULT_GRID_PARAMS);
  const [numberParams, setNumberParams] =
    useState<NumberParams>(DEFAULT_NUMBER_PARAMS);
  const [drawTarget, setDrawTarget] = useState<DrawTarget>("graves");
  const [snapping, setSnapping] = useState(true);
  const [snapTolerance, setSnapTolerance] = useState(10);

  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [reviewHasRun, setReviewHasRun] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);
  const [referenceRun, setReferenceRun] = useState<ReferenceRunResult | null>(
    null,
  );

  // ---------------------------------------------------------------- derived

  const selectedIds = useMemo(() => selection?.ids ?? [], [selection]);

  const selectedLayerFeatures = useMemo(
    () => selectedProjectFeatures(selection, project.project),
    [project.project, selection],
  );

  const selectedFeatures = useMemo(
    () =>
      selection?.layer === "base" || selection?.layer === "graves"
        ? (selectedLayerFeatures as CemeteryFeature[])
        : [],
    [selectedLayerFeatures, selection?.layer],
  );

  const primaryFeature = selectedFeatures[0] ?? null;

  const selectionCentre = useMemo(() => {
    const bounds = boundsOfFeatures(selectedFeatures);
    return bounds ? centreOfBounds(bounds) : null;
  }, [selectedFeatures]);

  const selectedSurface = useMemo((): SurfaceClass | null => {
    if (selection?.layer !== "base" || !primaryFeature) {
      return null;
    }
    return normalizeSurface(primaryFeature.properties.surface);
  }, [primaryFeature, selection]);

  const selectionItems = useMemo(
    () =>
      selection?.layer === "graves"
        ? selectedFeatures.map((feature) => graveListItem(feature))
        : [],
    [selectedFeatures, selection],
  );

  const primaryRecord = useMemo(() => {
    if (selection?.layer !== "graves" || !primaryFeature) {
      return null;
    }
    return {
      title: graveRecordTitle(primaryFeature.properties),
      rows: graveRecordRows(primaryFeature.properties),
      properties: primaryFeature.properties,
    };
  }, [primaryFeature, selection]);

  const referenceSummary = useMemo(
    () =>
      tool === "references"
        ? summariseReferences(graves)
        : EMPTY_REFERENCE_SUMMARY,
    [graves, tool],
  );

  const measurement = useMemo(() => {
    const points =
      cursor && measurePoints.length ? [...measurePoints, cursor] : measurePoints;
    return {
      points: measurePoints.length,
      length: pathLengthMetres(points),
      area: points.length >= 3 ? ringAreaSquareMetres(points) : null,
    };
  }, [cursor, measurePoints]);

  const selectionRadiusMetres = useMemo(
    () =>
      tool === "circle-select" && circleSelectionCentre && cursor
        ? pathLengthMetres([circleSelectionCentre, cursor])
        : null,
    [circleSelectionCentre, cursor, tool],
  );

  const disabledTools = useMemo(() => {
    const reasons: Record<string, string> = {};
    const standard = new Set<StandardToolId>([
      "add-feature",
      "move",
      "rotate",
      "reshape",
      "split",
      "merge",
      "add-ring",
      "delete-ring",
      "add-part",
      "delete-part",
      "simplify",
      "offset",
      "select",
      "box-select",
      "freehand-select",
      "circle-select",
    ]);
    const ids: ToolId[] = [
      "add-feature",
      "move",
      "rotate",
      "reshape",
      "split",
      "merge",
      "add-ring",
      "delete-ring",
      "add-part",
      "delete-part",
      "simplify",
      "offset",
      "select",
      "box-select",
      "freehand-select",
      "circle-select",
      "draw-grave",
      "draw-base",
      "row-count",
      "row-size",
      "grid",
      "continue-row",
      "regenerate",
      "batch-row",
      "number-freehand",
      "number-line",
      "references",
      "duplicates",
      "quality",
      "draw-rect",
      "draw-circle",
      "draw-freehand",
    ];
    for (const id of ids) {
      let capability;
      if (standard.has(id as StandardToolId)) {
        capability = toolCapability(
          id as StandardToolId,
          activeLayer,
          selectionSize(selection),
        );
      } else if (
        id === "draw-rect" ||
        id === "draw-circle" ||
        id === "draw-freehand"
      ) {
        capability =
          activeLayer?.geometryFamily === "polygon" && activeLayer.editable
            ? { enabled: true, reason: "" }
            : {
                enabled: false,
                reason: "Choose an active editable polygon layer.",
              };
      } else {
        capability = cemeteryToolCapability(id, activeLayer);
      }
      if (!capability.enabled) reasons[id] = capability.reason;
    }
    return reasons;
  }, [activeLayer, selection]);

  const regenerateMode = useMemo((): LayoutMode | null => {
    if (!primaryFeature?.properties.cds_id) {
      return null;
    }
    const mode = primaryFeature.properties.cds_mode;
    return mode === "grid" || mode === "row-count" || mode === "row-size"
      ? mode
      : null;
  }, [primaryFeature]);

  // ----------------------------------------------------------- live mirrors

  const live = useRef<LiveState>({
    tool,
    selection,
    selectionCentre,
    draftPoints,
    rowParams,
    gridParams,
    numberParams,
    drawTarget,
    snapping,
    snapTolerance,
    circleSelectionCentre,
  });
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    live.current = {
      tool,
      selection,
      selectionCentre,
      draftPoints,
      rowParams,
      gridParams,
      numberParams,
      drawTarget,
      snapping,
      snapTolerance,
      circleSelectionCentre,
    };
  }, [
    draftPoints,
    drawTarget,
    gridParams,
    numberParams,
    rowParams,
    selection,
    selectionCentre,
    snapTolerance,
    snapping,
    circleSelectionCentre,
    tool,
  ]);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // ------------------------------------------------------------ draft layer

  const draft = useMemo((): FeatureCollection => {
    const features: Feature[] = [];

    if (tool === "measure") {
      features.push(...draftCollection(measurePoints, cursor, "line").features);
    }

    if (tool === "circle-select" && circleSelectionCentre && cursor) {
      const ring = circleRing(circleSelectionCentre, cursor);
      if (ring.length) {
        features.push(...previewRings([ring]));
      }
    }

    if (isPathTool(tool)) {
      features.push(
        ...draftCollection(
          draftPoints,
          cursor,
          POLYGON_PATH_TOOLS.has(tool) ||
            tool === "add-ring" ||
            ((tool === "add-feature" || tool === "add-part") &&
              activeLayer?.geometryFamily === "polygon")
            ? "polygon"
            : "line",
        ).features,
      );

      const preview = cursor ? [...draftPoints, cursor] : draftPoints;
      try {
        if (
          (tool === "row-count" ||
            tool === "row-size" ||
            tool === "continue-row") &&
          preview.length >= 2
        ) {
          features.push(
            ...previewRings(
              buildRowFeatures(
                preview,
                rowParams,
                tool === "row-size" ? "row-size" : "row-count",
                { base, alignTo: primaryFeature },
              ).map((feature) => feature.geometry.coordinates[0] as LngLat[]),
            ),
          );
        } else if (tool === "grid" && preview.length >= 3) {
          features.push(
            ...previewRings(
              buildGridFeatures(preview, gridParams, { base }).map(
                (feature) => feature.geometry.coordinates[0] as LngLat[],
              ),
            ),
          );
        }
      } catch {
        // Keep the captured path visible until it is long enough to build.
      }
    }

    if (tool === "reshape" && draftPoints.length) {
      features.push(...draftCollection(draftPoints, null, "polygon").features);
    }

    if (tool === "batch-row") {
      for (const path of batchPaths) {
        features.push(...draftCollection(path, null, "line").features);
      }
    }

    if (drag) {
      if (drag.mode === "rect") {
        features.push(...previewRings([rectangleRing(drag.start, drag.pointer)]));
      } else if (drag.mode === "box") {
        features.push(...previewRings([boxRing(drag.start, drag.pointer)]));
      } else if (drag.mode === "circle") {
        const ring = circleRing(drag.start, drag.pointer);
        if (ring.length) {
          features.push(...previewRings([ring]));
        }
      } else if (drag.mode === "freehand" && drag.points?.length) {
        features.push(...draftCollection(drag.points, null, "line").features);
      } else if (drag.mode === "lasso" && (drag.points?.length ?? 0) > 2) {
        const points = drag.points ?? [];
        features.push(...previewRings([[...points, points[0]]]));
      } else if (drag.mode === "rotate" && drag.angle) {
        features.push(
          ...previewRings(
            selectedFeatures.map(
              (feature) =>
                rotateFeature(feature, drag.angle ?? 0, drag.start).geometry
                  .coordinates[0] as LngLat[],
            ),
          ),
        );
      }
    }

    return { type: "FeatureCollection", features };
  }, [
    base,
    batchPaths,
    activeLayer,
    circleSelectionCentre,
    cursor,
    draftPoints,
    drag,
    gridParams,
    measurePoints,
    primaryFeature,
    rowParams,
    selectedFeatures,
    tool,
  ]);

  useEffect(() => {
    draftCollectionRef.current = draft;
  }, [draft]);

  // ---------------------------------------------------------------- actions

  const clearDraft = useCallback(() => {
    setDraftPoints([]);
    setCursor(null);
    setDrag(null);
  }, []);

  const zoomToFeatures = useCallback((features: CemeteryFeature[]) => {
    const bounds = boundsOfFeatures(features);
    if (!bounds) {
      return;
    }
    mapRef.current?.fitBounds(bounds, {
      padding: 140,
      maxZoom: 21,
      duration: 350,
    });
  }, []);

  const zoomToIds = useCallback(
    (ids: Array<string | number>, layer: EditLayer = "graves") => {
      const wanted = new Set(ids.map(String));
      const source = layer === "graves" ? gravesRef.current : baseRef.current;
      zoomToFeatures(
        source.features.filter((feature) => wanted.has(String(feature.id))),
      );
    },
    [baseRef, gravesRef, zoomToFeatures],
  );

  const handleSetInspectionFlag = useCallback(
    (ids: readonly string[], flagged: boolean) => {
      if (!ids.length) return;
      commit(
        baseRef.current,
        updateManyFeatureProperties(gravesRef.current, ids, {
          erasmus_flagged: flagged,
          erasmus_flagged_at: flagged ? new Date().toISOString() : undefined,
        }),
        flagged
          ? "Flag graves for Erasmus inspection"
          : "Remove Erasmus inspection flags",
      );
      setStatus(
        `${flagged ? "Flagged" : "Unflagged"} ${ids.length.toLocaleString()} grave${ids.length === 1 ? "" : "s"} for inspection.`,
      );
    },
    [baseRef, commit, gravesRef],
  );

  const erasmus = useErasmusInspections({
    features: graves.features,
    selectedIds: selection?.layer === "graves" ? selectedIds : [],
    onSelect: (ids) =>
      setSelection(ids.length ? selectMany("graves", ids) : null),
    onZoom: (ids) => zoomToIds(ids),
    onSetFlag: handleSetInspectionFlag,
    onStatus: setStatus,
  });

  const createPolygon = useCallback(
    (ring: LngLat[], target: string, label: string) => {
      if (ring.length < 4) {
        setStatus("That shape was too small to keep.");
        return;
      }
      const feature = polygonFromLngLatRing(ring);
      if (target !== "graves" && target !== "base") {
        const layer = project.projectRef.current.layers.find(
          (candidate) => candidate.id === target,
        );
        if (!layer?.editable || layer.geometryFamily !== "polygon") {
          setStatus("Choose an active editable polygon layer.");
          return;
        }
        const created = createFeatureForFamily("polygon", ring);
        if (!created.ok) {
          setStatus(created.error);
          return;
        }
        project.updateLayer(
          layer.id,
          (targetLayer) => ({
            ...targetLayer,
            data: {
              ...targetLayer.data,
              features: [...targetLayer.data.features, created.value],
            },
          }),
          label,
        );
        setSelection(selectOne(layer.id, created.value.id));
        setStatus(`${label} in the active layer.`);
      } else if (target === "graves") {
        feature.properties = { ...feature.properties, ...newGraveProperties() };
        commit(
          baseRef.current,
          addFeatures(gravesRef.current, [feature]),
          label,
        );
        setSelection(selectOne("graves", feature.id));
        setStatus(`${label}. Switch to Select to fill in its record.`);
      } else {
        feature.properties = { ...feature.properties, surface: "grass" };
        commit(
          addFeatures(baseRef.current, [feature]),
          gravesRef.current,
          label,
        );
        setSelection(selectOne("base", feature.id));
        setStatus(`${label}. Switch to Select to assign a surface class.`);
      }
    },
    [baseRef, commit, gravesRef, project],
  );

  const addFeatureToLayer = useCallback(
    (
      layerId: string,
      feature: import("@/lib/project-model").GenericFeature,
      label: string,
    ) => {
      project.updateLayer(
        layerId,
        (layer) => ({
          ...layer,
          data: {
            ...layer.data,
            features: [...layer.data.features, feature],
          },
        }),
        label,
      );
      setSelection(selectOne(layerId, feature.id));
      setStatus(`${label} in the active layer.`);
    },
    [project],
  );

  const numberAlongPath = useCallback(
    (points: LngLat[], label: string) => {
      const params = live.current.numberParams;
      const ordered = orderFeaturesAlongPath(gravesRef.current.features, points);
      if (!ordered.length) {
        setStatus("No graves intersected that path.");
        return;
      }
      let next = gravesRef.current;
      ordered.forEach((feature, index) => {
        next = updateFeatureProperties(next, feature.id, {
          [params.field]: params.start + index,
        });
      });
      commit(baseRef.current, next, label);
      setNumberParams((current) => ({
        ...current,
        start: current.start + ordered.length,
      }));
      setSelection(
        selectMany(
          "graves",
          ordered.map((feature) => feature.id),
        ),
      );
      setStatus(
        `Numbered ${ordered.length} graves (${params.field} ${params.start}–${
          params.start + ordered.length - 1
        }). Rebuild references so records stay linked.`,
      );
    },
    [baseRef, commit, gravesRef],
  );

  const applySplit = useCallback(
    (from: LngLat, to: LngLat) => {
      const current = live.current.selection;
      const layer: EditLayer = current?.layer ?? "graves";
      if (layer !== "base" && layer !== "graves") {
        const target = project.projectRef.current.layers.find(
          (candidate) => candidate.id === layer,
        );
        if (!target?.editable || !current?.ids.length) {
          setStatus("Select editable line features to split.");
          return;
        }
        const wanted = new Set(current.ids);
        const replacements: import("@/lib/project-model").GenericFeature[] = [];
        const removed = new Set<string>();
        for (const feature of target.data.features) {
          if (!wanted.has(String(feature.id))) continue;
          if (target.geometryFamily === "line") {
            const result = splitLineFeature(feature, [from, to]);
            if (result.ok) {
              removed.add(String(feature.id));
              replacements.push(...result.value);
            }
          } else if (
            feature.geometry.type === "Polygon" ||
            feature.geometry.type === "MultiPolygon"
          ) {
            const splitSupport = canSafelySplitPolygon(feature);
            if (!splitSupport.ok) {
              setStatus(
                `${splitSupport.error} The feature was left unchanged.`,
              );
              return;
            }
            const polygons = [feature.geometry.coordinates];
            const nextParts: import("@/lib/project-model").GenericFeature[] = [];
            let didSplit = false;
            for (const polygon of polygons) {
              const halves = splitRingByLine(
                polygon[0] as LngLat[],
                from,
                to,
              );
              if (!halves) {
                const unchanged = createFeatureForFamily(
                  "polygon",
                  polygon[0] as LngLat[],
                  feature.properties,
                );
                if (unchanged.ok) nextParts.push(unchanged.value);
                continue;
              }
              didSplit = true;
              for (const ring of halves) {
                const half = createFeatureForFamily(
                  "polygon",
                  ring,
                  feature.properties,
                );
                if (half.ok) nextParts.push(half.value);
              }
            }
            if (didSplit) {
              removed.add(String(feature.id));
              replacements.push(...nextParts);
            }
          }
        }
        if (!replacements.length) {
          setStatus("The cut line did not cross a selected feature.");
          return;
        }
        project.updateLayer(
          target.id,
          (currentLayer) => ({
            ...currentLayer,
            data: {
              ...currentLayer.data,
              features: [
                ...currentLayer.data.features.filter(
                  (feature) => !removed.has(String(feature.id)),
                ),
                ...replacements,
              ],
            },
          }),
          "Split line features",
        );
        setSelection(selectMany(target.id, replacements.map((item) => item.id)));
        setStatus(`Split into ${replacements.length} line features.`);
        return;
      }
      const source = layer === "graves" ? gravesRef.current : baseRef.current;
      const wanted = current?.ids.length ? new Set(current.ids) : null;
      const candidates = wanted
        ? source.features.filter((feature) => wanted.has(String(feature.id)))
        : source.features;
      const unsupported = candidates
        .map((feature) => canSafelySplitPolygon(feature))
        .find((result) => !result.ok);
      if (unsupported && !unsupported.ok) {
        setStatus(
          `${unsupported.error} The selected plots were left unchanged.`,
        );
        return;
      }

      const removed: Array<string | number> = [];
      const added: CemeteryFeature[] = [];
      for (const feature of candidates) {
        const halves = splitRingByLine(
          feature.geometry.coordinates[0] as LngLat[],
          from,
          to,
        );
        if (!halves) {
          continue;
        }
        removed.push(feature.id);
        for (const ring of halves) {
          const half = polygonFromLngLatRing(ring);
          half.properties = {
            ...feature.properties,
            epilog_id: half.properties.epilog_id,
            cds_id: undefined,
            cds_idx: undefined,
            epilog_record_id: undefined,
          };
          added.push(half);
        }
      }

      if (!removed.length) {
        setStatus("That line did not cross any plot. Try again.");
        return;
      }
      const next = replaceFeatures(source, removed, added);
      commit(
        layer === "graves" ? baseRef.current : next,
        layer === "graves" ? next : gravesRef.current,
        "Split plots",
      );
      setSelection(
        selectMany(
          layer,
          added.map((feature) => feature.id),
        ),
      );
      setStatus(
        `Split ${removed.length} plot${removed.length === 1 ? "" : "s"} into ${added.length}.`,
      );
    },
    [baseRef, commit, gravesRef, project],
  );

  const finishDraft = useCallback(() => {
    const active = live.current.tool;
    const points = live.current.draftPoints;

    try {
      if (active === "add-feature") {
        const layer = projectRef.current.activeLayer;
        if (!layer?.editable) {
          setStatus("Choose an active editable layer before adding a feature.");
          return;
        }
        const created = createFeatureForFamily(layer.geometryFamily, points);
        if (!created.ok) {
          setStatus(created.error);
          return;
        }
        addFeatureToLayer(layer.id, created.value, "Added feature");
        clearDraft();
        return;
      }

      if (active === "add-ring" || active === "add-part") {
        const current = live.current.selection;
        const layer = current
          ? projectRef.current.project.layers.find(
              (candidate) => candidate.id === current.layer,
            )
          : null;
        const feature = layer?.data.features.find(
          (candidate) => String(candidate.id) === current?.ids[0],
        );
        if (!layer?.editable || !feature) {
          setStatus("Select one editable feature first.");
          return;
        }
        const result =
          active === "add-ring"
            ? addGeometryRing(feature, points)
            : addGeometryPart(feature, points);
        if (!result.ok) {
          setStatus(result.error);
          return;
        }
        projectRef.current.updateLayer(
          layer.id,
          (target) => ({
            ...target,
            data: {
              ...target.data,
              features: target.data.features.map((candidate) =>
                String(candidate.id) === String(feature.id)
                  ? result.value
                  : candidate,
              ),
            },
          }),
          active === "add-ring" ? "Add polygon ring" : "Add geometry part",
        );
        setStatus(active === "add-ring" ? "Ring added." : "Part added.");
        clearDraft();
        return;
      }

      if (active === "draw-grave" || active === "draw-base") {
        if (points.length < 3) {
          setStatus("Need at least 3 vertices for a polygon.");
          return;
        }
        createPolygon(
          [...points, points[0]],
          active === "draw-grave" ? "graves" : "base",
          active === "draw-grave" ? "Drew grave plot" : "Drew base area",
        );
        clearDraft();
        return;
      }

      if (active === "split") {
        if (points.length < 2) {
          setStatus("Click two points to define the cut line.");
          return;
        }
        applySplit(points[0], points[points.length - 1]);
        clearDraft();
        return;
      }

      if (
        active === "row-count" ||
        active === "row-size" ||
        active === "continue-row"
      ) {
        if (points.length < 2) {
          setStatus("Need at least 2 points for a row path.");
          return;
        }
        const anchor = findFeature(
          gravesRef.current,
          primaryId(live.current.selection),
        );
        let params = live.current.rowParams;
        let mode: "row-count" | "row-size" =
          active === "row-count" ? "row-count" : "row-size";
        let layoutId: string | undefined;
        let storedPoints: LngLat[] = points;

        if (active === "continue-row") {
          if (!anchor?.properties.cds_id) {
            setStatus("Select a grave from a generated row first.");
            return;
          }
          layoutId = String(anchor.properties.cds_id);
          mode =
            anchor.properties.cds_mode === "row-count"
              ? "row-count"
              : "row-size";
          try {
            params = {
              ...params,
              ...(JSON.parse(
                String(anchor.properties.cds_params ?? "{}"),
              ) as Partial<RowParams>),
            };
            const original = JSON.parse(
              String(anchor.properties.cds_points ?? "[]"),
            ) as LngLat[];
            storedPoints = [...original, ...points.slice(1)];
            if (params.autoNumber) {
              params = {
                ...params,
                numberStart: nextLayoutNumber(
                  gravesRef.current.features,
                  layoutId,
                  params.numberField,
                  params.numberStart,
                ),
              };
            }
          } catch {
            setStatus("The selected row has invalid layout metadata.");
            return;
          }
        }

        const features = buildRowFeatures(points, params, mode, {
          base: baseRef.current,
          layoutId,
          storedPoints,
          alignTo: anchor,
        });
        if (!features.length) {
          setStatus("All generated graves touched an excluded obstacle.");
          return;
        }
        const nextStart = applyAutoNumbers(features, params);
        if (params.autoNumber) {
          setRowParams((current) => ({ ...current, numberStart: nextStart }));
        }

        let next = addFeatures(gravesRef.current, features);
        if (layoutId) {
          const metadata = layoutProperties(mode, storedPoints, params);
          for (const feature of next.features) {
            if (String(feature.properties.cds_id) === layoutId) {
              next = updateFeatureProperties(next, feature.id, metadata);
            }
          }
        }
        commit(
          baseRef.current,
          next,
          active === "continue-row" ? "Continue grave row" : "Create grave row",
        );
        setSelection(
          selectMany(
            "graves",
            features.map((feature) => feature.id),
          ),
        );
        setStatus(
          active === "continue-row"
            ? `Extended the row with ${features.length} graves.`
            : `Created ${features.length} graves.`,
        );
        clearDraft();
        return;
      }

      if (active === "grid") {
        if (points.length < 3) {
          setStatus("Need at least 3 vertices for a grid boundary.");
          return;
        }
        const params = live.current.gridParams;
        const features = buildGridFeatures(points, params, {
          base: baseRef.current,
        });
        if (!features.length) {
          setStatus("Could not fit graves inside that boundary.");
          return;
        }
        const nextStart = applyAutoNumbers(features, params);
        if (params.autoNumber) {
          setGridParams((current) => ({ ...current, numberStart: nextStart }));
        }
        commit(
          baseRef.current,
          addFeatures(gravesRef.current, features),
          "Create grave grid",
        );
        setSelection(
          selectMany(
            "graves",
            features.map((feature) => feature.id),
          ),
        );
        setStatus(`Created ${features.length} grid graves.`);
        clearDraft();
        return;
      }

      if (active === "batch-row") {
        if (points.length < 2) {
          setStatus("Need at least 2 points for a centre-line.");
          return;
        }
        setBatchPaths((current) => [...current, points]);
        setStatus("Centre-line captured. Draw another, or create the batch.");
        clearDraft();
        return;
      }

      if (active === "number-line") {
        if (points.length < 2) {
          setStatus("Need at least 2 points for a numbering path.");
          return;
        }
        numberAlongPath(points, "Number graves along line");
        clearDraft();
      }
    } catch (finishError) {
      const message =
        finishError instanceof Error
          ? finishError.message
          : "Could not finish drawing.";
      setStatus(message);
      setError(message);
    }
  }, [
    addFeatureToLayer,
    applySplit,
    baseRef,
    clearDraft,
    commit,
    createPolygon,
    gravesRef,
    numberAlongPath,
  ]);

  const commitReshape = useCallback(
    (points: LngLat[]) => {
      const current = live.current.selection;
      if (!current?.ids.length) {
        return;
      }
      const id = current.ids[0];
      if (current.layer !== "base" && current.layer !== "graves") {
        const layer = project.projectRef.current.layers.find(
          (candidate) => candidate.id === current.layer,
        );
        if (!layer?.editable) return;
        const required =
          layer.geometryFamily === "point"
            ? 1
            : layer.geometryFamily === "line"
              ? 2
              : 3;
        if (points.length < required) return;
        const original = layer.data.features.find(
          (feature) => String(feature.id) === id,
        );
        const rebuilt = createFeatureForFamily(
          layer.geometryFamily,
          points,
          original?.properties ?? {},
        );
        if (!rebuilt.ok || !original) {
          setStatus(rebuilt.ok ? "Feature not found." : rebuilt.error);
          return;
        }
        project.updateLayer(
          layer.id,
          (target) => ({
            ...target,
            data: {
              ...target.data,
              features: target.data.features.map((feature) =>
                String(feature.id) === id
                  ? {
                      ...rebuilt.value,
                      id: original.id,
                      properties: {
                        ...rebuilt.value.properties,
                        epilog_id: String(original.id),
                      },
                    }
                  : feature,
              ),
            },
          }),
          "Edit vertices",
        );
        return;
      }
      if (points.length < 3) return;
      if (current.layer === "graves") {
        commit(
          baseRef.current,
          updateFeatureGeometry(gravesRef.current, id, points),
          "Reshape grave",
        );
      } else {
        commit(
          updateFeatureGeometry(baseRef.current, id, points),
          gravesRef.current,
          "Reshape base polygon",
        );
      }
    },
    [baseRef, commit, gravesRef, project],
  );

  const commitGenericVertexEdit = useCallback(
    (
      operation: "update" | "insert" | "delete",
      flatIndex: number,
      coordinate?: LngLat,
    ) => {
      const current = live.current.selection;
      if (
        !current?.ids.length ||
        current.layer === "base" ||
        current.layer === "graves"
      ) {
        return false;
      }
      const layer = project.projectRef.current.layers.find(
        (candidate) => candidate.id === current.layer,
      );
      const feature = layer?.data.features.find(
        (candidate) => String(candidate.id) === current.ids[0],
      );
      const vertex = reshapeVerticesRef.current[flatIndex];
      if (!layer?.editable || !feature || !vertex) return false;
      const path = {
        partIndex: vertex.partIndex,
        ringIndex: vertex.ringIndex,
        vertexIndex: vertex.vertexIndex,
      };
      const result =
        operation === "delete"
          ? deleteGeometryVertex(feature, path)
          : operation === "insert" && coordinate
            ? insertGeometryVertex(feature, path, coordinate)
            : coordinate
              ? updateGeometryVertex(feature, path, coordinate)
              : null;
      if (!result) return false;
      if (!result.ok) {
        setStatus(result.error);
        return false;
      }
      project.updateLayer(
        layer.id,
        (target) => ({
          ...target,
          data: {
            ...target.data,
            features: target.data.features.map((candidate) =>
              String(candidate.id) === String(feature.id)
                ? result.value
                : candidate,
            ),
          },
        }),
        `${operation === "delete" ? "Delete" : operation === "insert" ? "Insert" : "Move"} vertex`,
      );
      const vertices = listEditableVertices(result.value);
      reshapeVerticesRef.current = vertices;
      setDraftPoints(vertices.map((candidate) => candidate.coordinate));
      return true;
    },
    [project],
  );

  const handleDelete = useCallback(() => {
    const current = live.current.selection;
    if (!current?.ids.length) {
      return;
    }
    const count = current.ids.length;
    if (current.layer !== "base" && current.layer !== "graves") {
      const wanted = new Set(current.ids);
      project.updateLayer(
        current.layer,
        (layer) => ({
          ...layer,
          data: {
            ...layer.data,
            features: layer.data.features.filter(
              (feature) => !wanted.has(String(feature.id)),
            ),
          },
        }),
        "Delete features",
      );
      setSelection(null);
      setStatus(`Deleted ${count} feature${count === 1 ? "" : "s"}.`);
      return;
    }
    if (current.layer === "graves") {
      commit(
        baseRef.current,
        removeFeatures(gravesRef.current, current.ids),
        "Delete graves",
      );
    } else {
      commit(
        removeFeatures(baseRef.current, current.ids),
        gravesRef.current,
        "Delete base polygons",
      );
    }
    setSelection(null);
    setStatus(`Deleted ${count} feature${count === 1 ? "" : "s"}.`);
  }, [baseRef, commit, gravesRef, project]);

  const handleDuplicate = useCallback(() => {
    const current = live.current.selection;
    if (!current?.ids.length) {
      return;
    }
    if (current.layer !== "base" && current.layer !== "graves") {
      const layer = project.projectRef.current.layers.find(
        (candidate) => candidate.id === current.layer,
      );
      if (!layer?.editable) return;
      const wanted = new Set(current.ids);
      const copies = layer.data.features
        .filter((feature) => wanted.has(String(feature.id)))
        .map((feature) => {
          const copy = translateFeature(feature, [0.000004, 0.000004]);
          const id = crypto.randomUUID();
          return {
            ...copy,
            id,
            properties: {
              ...copy.properties,
              epilog_id: id,
              epilog_record_id: undefined,
            },
          };
        });
      project.updateLayer(
        layer.id,
        (target) => ({
          ...target,
          data: {
            ...target.data,
            features: [...target.data.features, ...copies],
          },
        }),
        "Duplicate features",
      );
      setSelection(selectMany(layer.id, copies.map((copy) => copy.id)));
      setStatus(`Duplicated ${copies.length} features.`);
      return;
    }
    const source =
      current.layer === "graves" ? gravesRef.current : baseRef.current;
    const wanted = new Set(current.ids);
    const copies = source.features
      .filter((feature) => wanted.has(String(feature.id)))
      .map((feature) => duplicateFeature(feature));
    if (!copies.length) {
      return;
    }
    if (current.layer === "graves") {
      commit(
        baseRef.current,
        addFeatures(gravesRef.current, copies),
        "Duplicate graves",
      );
    } else {
      commit(
        addFeatures(baseRef.current, copies),
        gravesRef.current,
        "Duplicate base polygons",
      );
    }
    setSelection(
      selectMany(
        current.layer,
        copies.map((copy) => copy.id),
      ),
    );
    setStatus(
      `Duplicated ${copies.length} feature${copies.length === 1 ? "" : "s"} with a small offset.`,
    );
  }, [baseRef, commit, gravesRef, project]);

  const handleUndo = useCallback(() => {
    const label = project.undo();
    if (label) {
      setSelection(null);
      setStatus(`Undid: ${label}.`);
    }
  }, [project]);

  const handleRedo = useCallback(() => {
    const label = project.redo();
    if (label) {
      setSelection(null);
      setStatus(`Redid: ${label}.`);
    }
  }, [project]);

  const handleRotate = useCallback(
    (degrees: number) => {
      const current = live.current.selection;
      const centre = live.current.selectionCentre;
      if (!current?.ids.length || !centre || !degrees) {
        if (!current?.ids.length || !degrees) return;
      }
      if (current.layer !== "base" && current.layer !== "graves") {
        const layer = project.projectRef.current.layers.find(
          (candidate) => candidate.id === current.layer,
        );
        if (!layer?.editable) return;
        const wanted = new Set(current.ids);
        const centres = layer.data.features
          .filter((feature) => wanted.has(String(feature.id)))
          .map(genericCentroid)
          .filter((point): point is LngLat => point != null);
        const rotationCentre: LngLat = centres.length
          ? [
              centres.reduce((sum, point) => sum + point[0], 0) / centres.length,
              centres.reduce((sum, point) => sum + point[1], 0) / centres.length,
            ]
          : [0, 0];
        project.updateLayer(
          layer.id,
          (target) => ({
            ...target,
            data: {
              ...target.data,
              features: target.data.features.map((feature) =>
                wanted.has(String(feature.id))
                  ? rotateGenericFeature(feature, degrees, rotationCentre)
                  : feature,
              ),
            },
          }),
          "Rotate features",
        );
        setStatus(`Rotated ${current.ids.length} features by ${degrees}°.`);
        return;
      }
      if (!centre) return;
      const source =
        current.layer === "graves" ? gravesRef.current : baseRef.current;
      const wanted = new Set(current.ids);
      const rotated: CemeteryCollection = {
        type: "FeatureCollection",
        features: source.features.map((feature) =>
          wanted.has(String(feature.id))
            ? rotateFeature(feature, degrees, centre)
            : feature,
        ),
      };
      if (current.layer === "graves") {
        commit(baseRef.current, rotated, "Rotate graves");
      } else {
        commit(rotated, gravesRef.current, "Rotate base polygons");
      }
      setStatus(
        `Rotated ${current.ids.length} feature${current.ids.length === 1 ? "" : "s"} by ${degrees.toFixed(1)}°.`,
      );
    },
    [baseRef, commit, gravesRef, project],
  );

  const handleMerge = useCallback(() => {
    const current = live.current.selection;
    if (
      current &&
      current.layer !== "base" &&
      current.layer !== "graves" &&
      current.ids.length >= 2
    ) {
      const layer = project.projectRef.current.layers.find(
        (candidate) => candidate.id === current.layer,
      );
      if (!layer?.editable) return;
      const wanted = new Set(current.ids);
      const targets = layer.data.features.filter((feature) =>
        wanted.has(String(feature.id)),
      );
      const result = mergeCompatibleFeatures(targets);
      if (!result.ok) {
        setStatus(result.error);
        return;
      }
      project.updateLayer(
        layer.id,
        (target) => ({
          ...target,
          data: {
            ...target.data,
            features: [
              ...target.data.features.filter(
                (feature) => !wanted.has(String(feature.id)),
              ),
              result.value,
            ],
          },
        }),
        "Merge features",
      );
      setSelection(selectOne(layer.id, result.value.id));
      setStatus(`Merged ${targets.length} features.`);
      return;
    }
    if (!current || current.layer !== "graves" || current.ids.length < 2) {
      setStatus("Select at least two graves to merge.");
      return;
    }
    const wanted = new Set(current.ids);
    const targets = gravesRef.current.features.filter((feature) =>
      wanted.has(String(feature.id)),
    );
    const hull = convexHull(
      targets.flatMap((feature) => feature.geometry.coordinates[0] as LngLat[]),
    );
    if (!hull.length) {
      setStatus("Those plots could not be merged.");
      return;
    }
    const merged = polygonFromLngLatRing(hull);
    merged.properties = {
      ...targets[0].properties,
      epilog_id: merged.properties.epilog_id,
      cds_id: undefined,
      cds_idx: undefined,
    };
    commit(
      baseRef.current,
      replaceFeatures(gravesRef.current, current.ids, [merged]),
      "Merge graves",
    );
    setSelection(selectOne("graves", merged.id));
    setStatus(`Merged ${targets.length} graves into one plot.`);
  }, [baseRef, commit, gravesRef, project]);

  const handleSimplify = useCallback(
    (tolerance: number) => {
      const current = live.current.selection;
      if (!current?.ids.length) return;
      const layer = project.projectRef.current.layers.find(
        (candidate) => candidate.id === current.layer,
      );
      if (!layer?.editable) {
        setStatus("Toggle editing on for this layer first.");
        return;
      }
      const wanted = new Set(current.ids);
      let failure: string | null = null;
      project.updateLayer(
        layer.id,
        (target) => ({
          ...target,
          data: {
            ...target.data,
            features: target.data.features.map((feature) => {
              if (!wanted.has(String(feature.id))) return feature;
              const result = simplifyFeature(feature, tolerance);
              if (!result.ok) {
                failure = result.error;
                return feature;
              }
              return result.value;
            }),
          },
        }),
        "Simplify features",
      );
      setStatus(
        failure ??
          `Simplified ${current.ids.length} feature${current.ids.length === 1 ? "" : "s"}.`,
      );
    },
    [project],
  );

  const handleOffset = useCallback(
    (distance: number) => {
      const current = live.current.selection;
      if (!current?.ids.length) return;
      const layer = project.projectRef.current.layers.find(
        (candidate) => candidate.id === current.layer,
      );
      if (!layer?.editable) {
        setStatus("Toggle editing on for this layer first.");
        return;
      }
      const wanted = new Set(current.ids);
      const copies = layer.data.features.flatMap((feature) => {
        if (!wanted.has(String(feature.id))) return [];
        const result = offsetLineFeature(feature, distance);
        if (!result.ok) return [];
        const id = crypto.randomUUID();
        return [
          {
            ...result.value,
            id,
            properties: { ...result.value.properties, epilog_id: id },
          },
        ];
      });
      if (!copies.length) {
        setStatus("Offset curve requires a selected line feature.");
        return;
      }
      project.updateLayer(
        layer.id,
        (target) => ({
          ...target,
          data: {
            ...target.data,
            features: [...target.data.features, ...copies],
          },
        }),
        "Create offset curve",
      );
      setSelection(selectMany(layer.id, copies.map((copy) => copy.id)));
      setStatus(`Created ${copies.length} offset curve${copies.length === 1 ? "" : "s"}.`);
    },
    [project],
  );

  const handleAssignSurface = useCallback(
    (surface: SurfaceClass) => {
      const current = live.current.selection;
      if (current?.layer !== "base") {
        return;
      }
      commit(
        updateManyFeatureProperties(baseRef.current, current.ids, { surface }),
        gravesRef.current,
        "Classify base polygon",
      );
      setStatus(`Assigned ${SURFACE_STYLE[surface].label}.`);
    },
    [baseRef, commit, gravesRef],
  );

  const handleUpdateGrave = useCallback(
    (patch: Record<string, unknown>) => {
      const current = live.current.selection;
      const id = primaryId(current);
      if (!id || current?.layer !== "graves") {
        return;
      }
      commit(
        baseRef.current,
        updateFeatureProperties(gravesRef.current, id, patch),
        "Update grave record",
      );
      setStatus(
        "Grave record saved. Rebuild its reference if the numbering changed.",
      );
    },
    [baseRef, commit, gravesRef],
  );

  const handleBulkUpdate = useCallback(
    (patch: Record<string, unknown>) => {
      const current = live.current.selection;
      if (current?.layer !== "graves" || !current.ids.length) {
        return;
      }
      commit(
        baseRef.current,
        updateManyFeatureProperties(gravesRef.current, current.ids, patch),
        "Bulk edit graves",
      );
      const [field] = Object.keys(patch);
      setStatus(`Set ${field} on ${current.ids.length.toLocaleString()} graves.`);
    },
    [baseRef, commit, gravesRef],
  );

  const handleGenerateReferences = useCallback(
    (scope: "all" | "selection") => {
      const current = live.current.selection;
      const ids =
        scope === "selection" && current?.layer === "graves"
          ? current.ids
          : undefined;
      const result = generateGraveReferences(gravesRef.current, ids);
      setReferenceRun({
        changed: result.changed,
        unchanged: result.unchanged,
        skipped: result.skipped,
        samples: result.samples,
        scope,
      });

      if (!result.changed) {
        setStatus(
          result.skipped
            ? `Nothing to write — ${result.unchanged.toLocaleString()} already correct, ${result.skipped.toLocaleString()} have no grave number.`
            : "Every reference was already up to date.",
        );
        return;
      }

      commit(baseRef.current, result.collection, "Generate grave references");
      setFlaggedIds(result.changedIds.map(String));
      setLabelMode((mode) => (mode === "none" ? "reference" : mode));
      setStatus(
        `Wrote ${result.changed.toLocaleString()} references — updated graves are highlighted and labelled on the map.`,
      );
    },
    [baseRef, commit, gravesRef],
  );

  const handleGeneratePrimaryReference = useCallback(() => {
    const feature = findFeature(
      gravesRef.current,
      primaryId(live.current.selection),
    );
    if (!feature) {
      return;
    }
    const reference = makeGraveReference(feature.properties);
    if (!reference) {
      setStatus("Give this plot a grave number before creating a reference.");
      return;
    }
    commit(
      baseRef.current,
      updateFeatureProperties(gravesRef.current, feature.id, {
        GraveRef: reference,
      }),
      "Generate grave reference",
    );
    setStatus(`Reference set to ${reference}.`);
  }, [baseRef, commit, gravesRef]);

  const handleRunReview = useCallback(
    (mode: "duplicates" | "quality", minimumGap: number) => {
      const found =
        mode === "quality"
          ? runQualityChecks(gravesRef.current, minimumGap)
          : Array.from(duplicateReferenceGroups(gravesRef.current)).map(
              ([reference, features]): QualityIssue => ({
                id: `duplicate-${reference}`,
                type: "duplicate-reference",
                title: "Duplicate grave reference",
                detail: `${reference} is used by ${features.length} graves.`,
                featureIds: features.map((feature) => feature.id),
                severity: "error",
              }),
            );
      const flagged = issueFeatureIds(found);
      setIssues(found);
      setReviewHasRun(true);
      setFlaggedIds(flagged);
      setStatus(
        found.length
          ? `${found.length.toLocaleString()} issues · ${flagged.length.toLocaleString()} graves highlighted in red.`
          : "No issues found.",
      );
    },
    [gravesRef],
  );

  const handleSelectIssue = useCallback(
    (issue: QualityIssue) => {
      if (!issue.featureIds.length) {
        setStatus(issue.detail);
        return;
      }
      setSelection(selectMany("graves", issue.featureIds));
      setDockView("details");
      zoomToIds(issue.featureIds);
      setStatus(issue.detail);
    },
    [zoomToIds],
  );

  const handleCreateBatch = useCallback(() => {
    if (!batchPaths.length) {
      setStatus("Add at least one centre-line first.");
      return;
    }
    const params = live.current.rowParams;
    const created = batchPaths.flatMap((path) =>
      buildRowFeatures(path, params, "row-count", { base: baseRef.current }),
    );
    if (!created.length) {
      setStatus("No graves could be created from those centre-lines.");
      return;
    }
    const nextStart = applyAutoNumbers(created, params);
    if (params.autoNumber) {
      setRowParams((current) => ({ ...current, numberStart: nextStart }));
    }
    commit(
      baseRef.current,
      addFeatures(gravesRef.current, created),
      "Batch create grave rows",
    );
    setSelection(
      selectMany(
        "graves",
        created.map((feature) => feature.id),
      ),
    );
    setStatus(
      `Created ${created.length} graves from ${batchPaths.length} centre-lines.`,
    );
    setBatchPaths([]);
  }, [baseRef, batchPaths, commit, gravesRef]);

  const handleRegenerate = useCallback(() => {
    const anchor = primaryFeature;
    if (!anchor?.properties.cds_id || !regenerateMode) {
      setStatus("Select a grave from a generated layout first.");
      return;
    }
    const layoutId = String(anchor.properties.cds_id);
    try {
      const points = JSON.parse(
        String(anchor.properties.cds_points ?? "[]"),
      ) as LngLat[];
      const params =
        regenerateMode === "grid"
          ? live.current.gridParams
          : live.current.rowParams;
      const features =
        regenerateMode === "grid"
          ? buildGridFeatures(points, live.current.gridParams, {
              base: baseRef.current,
              layoutId,
            })
          : buildRowFeatures(points, live.current.rowParams, regenerateMode, {
              base: baseRef.current,
              layoutId,
              alignTo: anchor,
            });
      if (!features.length) {
        setStatus("No graves remain after applying the current settings.");
        return;
      }
      applyAutoNumbers(features, params);
      const existing = gravesRef.current.features.filter(
        (feature) => String(feature.properties.cds_id) === layoutId,
      );
      const retainedIndices = new Set(
        features.map((feature) => Number(feature.properties.cds_idx)),
      );
      const removed = existing.filter(
        (feature) => !retainedIndices.has(Number(feature.properties.cds_idx)),
      );
      if (
        removed.length &&
        !window.confirm(
          `The new layout has ${removed.length} fewer grave${removed.length === 1 ? "" : "s"}. Their linked records will be removed from the map. Continue?`,
        )
      ) {
        setStatus("Regeneration cancelled; linked grave records were preserved.");
        return;
      }
      const preserved = preserveGeneratedLayoutRecords(existing, features);
      const replaceIds = existing.map((feature) => feature.id);
      commit(
        baseRef.current,
        replaceFeatures(gravesRef.current, replaceIds, preserved),
        "Regenerate grave layout",
      );
      setSelection(
        selectMany(
          "graves",
          preserved.map((feature) => feature.id),
        ),
      );
      setStatus(
        `Regenerated ${preserved.length} graves; ${Math.min(existing.length, preserved.length)} existing record links were preserved.`,
      );
    } catch (regenerateError) {
      setStatus(
        regenerateError instanceof Error
          ? regenerateError.message
          : "Could not regenerate this layout.",
      );
    }
  }, [baseRef, commit, gravesRef, primaryFeature, regenerateMode]);

  const handleExport = useCallback(() => {
    for (const layer of layers) {
      const slug =
        layer.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || layer.id;
      downloadText(
        `${slug}.geojson`,
        JSON.stringify(layer.data, null, 2),
        "application/geo+json",
      );
    }
    downloadText(
      `${project.project.id}-project.json`,
      JSON.stringify(project.project, null, 2),
      "application/json",
    );
    project.markSaved();
    setStatus(`Exported ${layers.length} layers and a complete project backup.`);
  }, [layers, project]);

  const handleExportSelectionCsv = useCallback(
    (sections = DEFAULT_GRAVE_EXPORT_SECTIONS) => {
      if (!selectedLayerFeatures.length) {
        return;
      }
      const isGraves =
        selection?.layer === "graves" ||
        layers.find((layer) => layer.id === selection?.layer)?.kind === "graves";
      if (isGraves) {
        if (!hasExportSection(sections)) {
          setStatus("Choose at least one CSV section to export.");
          return;
        }
        const parts = [
          sections.memorial ? "memorial" : null,
          sections.deceased ? "deceased" : null,
          sections.owner ? "owner" : null,
        ].filter(Boolean);
        downloadText(
          "memorial-records.csv",
          gravesRecordsCsv(selectedLayerFeatures, sections),
        );
        setStatus(
          `Exported ${selectedLayerFeatures.length} record${selectedLayerFeatures.length === 1 ? "" : "s"} (${parts.join(", ")}).`,
        );
        return;
      }
      downloadText(
        "selected-features.csv",
        featuresToCsv(selectedLayerFeatures),
      );
      setStatus(`Exported ${selectedLayerFeatures.length} features as CSV.`);
    },
    [layers, selectedLayerFeatures, selection?.layer],
  );

  const handleEmailOwners = useCallback(async () => {
    const isGraves =
      selection?.layer === "graves" ||
      layers.find((layer) => layer.id === selection?.layer)?.kind === "graves";
    if (!isGraves || !selectedLayerFeatures.length) {
      setStatus("Select one or more graves to email their owners.");
      return;
    }
    const result = await emailOwnersOfGraves(selectedLayerFeatures);
    if (result.mode === "empty") {
      setStatus(
        result.missing
          ? "None of the selected graves have an owner email."
          : "No owner emails found for this selection.",
      );
      return;
    }
    if (result.mode === "mailto") {
      setStatus(
        `Opened mail draft for ${result.emailed} owner${result.emailed === 1 ? "" : "s"}${
          result.missing ? ` (${result.missing} without email skipped)` : ""
        }.`,
      );
      return;
    }
    setStatus(
      result.copied
        ? `Selection too large for mailto — copied ${result.emailed} owner emails to the clipboard.`
        : `Selection too large for mailto — export CSV to get the ${result.emailed} owner emails.`,
    );
  }, [layers, selectedLayerFeatures, selection?.layer]);

  const handleGraveColorChange = useCallback((id: GraveColorId) => {
    setGraveColorId(id);
    try {
      window.localStorage.setItem(GRAVE_COLOR_STORAGE_KEY, id);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const handleGraveColorModeChange = useCallback((mode: GraveColorModeId) => {
    setGraveColorMode(mode);
    if (mode !== "inspection") mappingColorModeRef.current = mode;
    try {
      window.localStorage.setItem(GRAVE_COLOR_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const handleWorkspaceModuleChange = useCallback(
    (next: "mapping" | "erasmus") => {
      setWorkspaceModule(next);
      setTool(next === "erasmus" ? "select" : "pan");
      setDockView("details");
      project.setActiveLayer("graves");
      if (next === "erasmus") {
        if (graveColorMode !== "inspection") {
          mappingColorModeRef.current = graveColorMode;
        }
        setGraveColorMode("inspection");
        setStatus("Erasmus inspection view ready. Choose a section or select graves.");
      } else {
        setGraveColorMode(mappingColorModeRef.current);
        setStatus("Returned to the Mapping workspace.");
      }
    },
    [graveColorMode, project],
  );

  const handleOccupancyGradientChange = useCallback(
    (id: OccupancyGradientId) => {
      setOccupancyGradientId(id);
      try {
        window.localStorage.setItem(OCCUPANCY_GRADIENT_STORAGE_KEY, id);
      } catch {
        // Ignore storage failures.
      }
    },
    [],
  );

  // Map handlers reach the latest actions through a ref so the map builds once.
  const actions = useRef({
    finishDraft,
    numberAlongPath,
    createPolygon,
    addFeatureToLayer,
    commitReshape,
    commitGenericVertexEdit,
    handleRotate,
    commit,
  });
  useEffect(() => {
    actions.current = {
      finishDraft,
      numberAlongPath,
      createPolygon,
      addFeatureToLayer,
      commitReshape,
      commitGenericVertexEdit,
      handleRotate,
      commit,
    };
  }, [
    commit,
    commitReshape,
    commitGenericVertexEdit,
    createPolygon,
    addFeatureToLayer,
    finishDraft,
    handleRotate,
    numberAlongPath,
  ]);

  const projectRef = useRef(project);
  useEffect(() => {
    // This ref deliberately exposes the latest project API to MapLibre's
    // long-lived event handlers; it is not read during React rendering.
    projectRef.current = project;
  }, [project]);

  // ------------------------------------------------------------------- map

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;
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

    map.once("load", async () => {
      if (cancelled) {
        return;
      }
      try {
        // Size the canvas to the laid-out shell before framing the cemetery.
        map.resize();
        const bounds = await fetchCemeteryBounds();
        if (cancelled) {
          return;
        }
        if (bounds) {
          fitCemeteryBounds(map, bounds);
        }
        const initial = await loadInitialCollections();
        if (cancelled) {
          return;
        }
        let stored = null;
        try {
          stored = await loadStoredProject();
        } catch {
          // Static source data remains available when browser storage fails.
        }
        const nextBase = stored?.base ?? normalizeCollection(initial.base);
        const nextGraves = stored?.graves ?? normalizeCollection(initial.graves);
        if (stored) {
          projectRef.current.resetProject(
            enrichProjectWithDemoRecords(stored),
          );
        } else {
          projectRef.current.reset(nextBase, nextGraves);
        }
        projectRef.current.setLastSaved(stored?.savedAt ?? null);
        syncProjectLayers(map, projectRef.current.projectRef.current, {
          draft: emptyCollection(),
        });
        // Refit to graves + surrounding base once real geometry is available.
        map.resize();
        const framed =
          defaultCemeteryBounds(nextBase, nextGraves) ?? bounds;
        if (framed) {
          fitCemeteryBounds(map, framed);
        }
        setReady(true);
        setStatus(
          `${stored ? "Restored your local project" : "Loaded source data"} · ${nextBase.features.length.toLocaleString()} base areas, ${nextGraves.features.length.toLocaleString()} graves.`,
        );
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load cemetery data";
        setError(message);
        setStatus(message);
        setReady(true);
      }
    });

    map.on("error", (event) => {
      const message = event.error?.message ?? "Map failed to load";
      if (/image|sprite|glyph|font/i.test(message)) {
        return;
      }
      setError(message);
    });

    const eventPoint = (event: MapMouseEvent): LngLat => [
      event.lngLat.lng,
      event.lngLat.lat,
    ];

    const snappedPoint = (event: MapMouseEvent): LngLat => {
      const fallback = eventPoint(event);
      if (!live.current.snapping) {
        return fallback;
      }
      const layers = selectableRenderLayerIds(
        projectRef.current.projectRef.current,
      ).filter((id) => Boolean(map.getLayer(id)));
      if (!layers.length) {
        return fallback;
      }
      const tolerance = live.current.snapTolerance;
      const hits = map.queryRenderedFeatures(
        [
          [event.point.x - tolerance, event.point.y - tolerance],
          [event.point.x + tolerance, event.point.y + tolerance],
        ],
        { layers },
      );
      let nearest: LngLat | null = null;
      let nearestDistance = tolerance;
      const visit = (value: unknown) => {
        if (
          Array.isArray(value) &&
          value.length >= 2 &&
          typeof value[0] === "number" &&
          typeof value[1] === "number"
        ) {
          const coordinate: LngLat = [value[0], value[1]];
          const distance = map.project(coordinate).dist(event.point);
          if (distance < nearestDistance) {
            nearest = coordinate;
            nearestDistance = distance;
          }
          return;
        }
        if (Array.isArray(value)) {
          value.forEach(visit);
        }
      };
      hits.forEach((feature) => {
        if ("coordinates" in feature.geometry) {
          visit(feature.geometry.coordinates);
        }
      });
      return nearest ?? fallback;
    };

    const hitTest = (event: MapMouseEvent) => {
      const currentProject = projectRef.current.projectRef.current;
      const targetLayerId = projectRef.current.activeLayerId;
      const layers = selectableRenderLayerIds(currentProject).filter(
        (id) =>
          Boolean(map.getLayer(id)) &&
          (!targetLayerId || layerIdFromRenderLayer(id) === targetLayerId),
      );
      if (!layers.length) {
        return null;
      }
      const hits = map.queryRenderedFeatures(event.point, { layers });
      if (!hits.length) {
        return null;
      }
      const hit = hits[0];
      const id = hit.properties?.epilog_id ?? hit.id;
      const layer = layerIdFromRenderLayer(hit.layer?.id ?? "");
      if (id == null || !layer) {
        return null;
      }
      return { layer, id: String(id), properties: hit.properties ?? {} };
    };

    const boxSelectIds = (
      start: LngLat,
      end: LngLat,
    ): { layer: string; ids: string[] } | null => {
      const currentProject = projectRef.current.projectRef.current;
      const targetLayerId = projectRef.current.activeLayerId;
      const layers = selectableRenderLayerIds(currentProject).filter(
        (id) =>
          Boolean(map.getLayer(id)) &&
          (!targetLayerId || layerIdFromRenderLayer(id) === targetLayerId),
      );
      if (!layers.length) return null;
      const a = map.project(start);
      const b = map.project(end);
      const hits = map.queryRenderedFeatures(
        [
          [Math.min(a.x, b.x), Math.min(a.y, b.y)],
          [Math.max(a.x, b.x), Math.max(a.y, b.y)],
        ],
        { layers },
      );
      const ids = new Set<string>();
      let layer: string | null = targetLayerId;
      for (const hit of hits) {
        layer ??= layerIdFromRenderLayer(hit.layer?.id ?? "");
        const id = hit.properties?.epilog_id ?? hit.id;
        if (id != null) {
          ids.add(String(id));
        }
      }
      return layer && ids.size ? { layer, ids: Array.from(ids) } : null;
    };

    const pointInScreenPolygon = (
      point: { x: number; y: number },
      polygon: Array<{ x: number; y: number }>,
    ) => {
      let inside = false;
      for (
        let index = 0, previous = polygon.length - 1;
        index < polygon.length;
        previous = index, index += 1
      ) {
        const a = polygon[index];
        const b = polygon[previous];
        if (
          a.y > point.y !== b.y > point.y &&
          point.x <
            ((b.x - a.x) * (point.y - a.y)) /
              (b.y - a.y || Number.EPSILON) +
              a.x
        ) {
          inside = !inside;
        }
      }
      return inside;
    };

    const shapeSelectIds = (
      boundary: LngLat[],
      circle?: { centre: LngLat; edge: LngLat },
    ): { layer: string; ids: string[] } | null => {
      if (boundary.length < 3) return null;
      const currentProject = projectRef.current.projectRef.current;
      const targetLayerId = projectRef.current.activeLayerId;
      const layers = selectableRenderLayerIds(currentProject).filter(
        (id) =>
          Boolean(map.getLayer(id)) &&
          (!targetLayerId || layerIdFromRenderLayer(id) === targetLayerId),
      );
      if (!layers.length) return null;

      const screenBoundary = boundary.map((coordinate) =>
        map.project(coordinate),
      );
      const minX = Math.min(...screenBoundary.map((point) => point.x));
      const minY = Math.min(...screenBoundary.map((point) => point.y));
      const maxX = Math.max(...screenBoundary.map((point) => point.x));
      const maxY = Math.max(...screenBoundary.map((point) => point.y));
      const hits = map.queryRenderedFeatures(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { layers },
      );
      const circleCentre = circle ? map.project(circle.centre) : null;
      const circleRadius =
        circleCentre && circle
          ? circleCentre.dist(map.project(circle.edge))
          : null;
      const contains = (point: { x: number; y: number }) =>
        circleCentre && circleRadius != null
          ? Math.hypot(
              circleCentre.x - point.x,
              circleCentre.y - point.y,
            ) <= circleRadius
          : pointInScreenPolygon(point, screenBoundary);
      const ids = new Set<string>();
      let layer = targetLayerId;

      for (const hit of hits) {
        const coordinates: LngLat[] = [];
        const visit = (value: unknown) => {
          if (
            Array.isArray(value) &&
            value.length >= 2 &&
            typeof value[0] === "number" &&
            typeof value[1] === "number"
          ) {
            coordinates.push([value[0], value[1]]);
          } else if (Array.isArray(value)) {
            value.forEach(visit);
          }
        };
        if ("coordinates" in hit.geometry) visit(hit.geometry.coordinates);
        const projected = coordinates.map((coordinate) =>
          map.project(coordinate),
        );
        const centre =
          projected.length > 0
            ? {
                x:
                  projected.reduce((sum, point) => sum + point.x, 0) /
                  projected.length,
                y:
                  projected.reduce((sum, point) => sum + point.y, 0) /
                  projected.length,
              }
            : null;
        const selectionCentreInsideFeature =
          circleCentre &&
          hit.geometry.type === "Polygon" &&
          projected.length > 2 &&
          pointInScreenPolygon(circleCentre, projected);
        if (
          projected.some(contains) ||
          (centre != null && contains(centre)) ||
          selectionCentreInsideFeature
        ) {
          const id = hit.properties?.epilog_id ?? hit.id;
          if (id != null) ids.add(String(id));
          layer ??= layerIdFromRenderLayer(hit.layer?.id ?? "");
        }
      }
      return layer && ids.size ? { layer, ids: Array.from(ids) } : null;
    };

    const nearestVertex = (event: MapMouseEvent): number => {
      let index = -1;
      let best = VERTEX_GRAB_PIXELS;
      live.current.draftPoints.forEach((coordinate, candidate) => {
        const distance = map.project(coordinate).dist(event.point);
        if (distance < best) {
          best = distance;
          index = candidate;
        }
      });
      return index;
    };

    const onClick = (event: MapMouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const active = live.current.tool;
      const modifiers = event.originalEvent;

      if (active === "pan") {
        return;
      }

      if (active === "measure") {
        const point = snappedPoint(event);
        setMeasurePoints((current) => [...current, point]);
        return;
      }

      if (
        active === "add-feature" &&
        projectRef.current.activeLayer?.geometryFamily === "point"
      ) {
        const layer = projectRef.current.activeLayer;
        if (!layer.editable) {
          setStatus("Toggle editing on for the active layer first.");
          return;
        }
        const created = createFeatureForFamily("point", [snappedPoint(event)]);
        if (created.ok) {
          actions.current.addFeatureToLayer(
            layer.id,
            created.value,
            "Added point",
          );
        }
        return;
      }

      if (active === "circle-select") {
        const centre = live.current.circleSelectionCentre;
        const point = eventPoint(event);
        if (!centre) {
          setCircleSelectionCentre(point);
          setCursor(point);
          setStatus(
            "Centre placed. Move the pointer to set the radius, then click again.",
          );
          return;
        }
        const ring = circleRing(centre, point);
        const result = shapeSelectIds(ring, { centre, edge: point });
        const additive =
          modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey;
        setCircleSelectionCentre(null);
        setCursor(null);
        if (!result) {
          if (!additive) setSelection(null);
          setStatus("No features from the active layer are inside that circle.");
          return;
        }
        setSelection((current) =>
          additive
            ? extendSelection(current, result.layer, result.ids)
            : selectMany(result.layer, result.ids),
        );
        setDockView("details");
        setStatus(
          `${result.ids.length.toLocaleString()} features selected within ${pathLengthMetres([centre, point]).toFixed(1)} m.`,
        );
        return;
      }

      if (active === "delete-ring" || active === "delete-part") {
        const current = live.current.selection;
        const layer = current
          ? projectRef.current.project.layers.find(
              (candidate) => candidate.id === current.layer,
            )
          : null;
        const feature = layer?.data.features.find(
          (candidate) => String(candidate.id) === current?.ids[0],
        );
        if (!layer?.editable || !feature) {
          setStatus("Select one editable multipart or polygon feature first.");
          return;
        }
        const point = eventPoint(event);
        let result:
          | ReturnType<typeof deleteGeometryRing>
          | ReturnType<typeof deleteGeometryPart>;
        if (active === "delete-ring") {
          let partIndex = 0;
          let ringIndex = -1;
          if (feature.geometry.type === "Polygon") {
            ringIndex = feature.geometry.coordinates.findIndex(
              (ring, index) =>
                index > 0 && pointInCoordinateRing(point, ring),
            );
          } else if (feature.geometry.type === "MultiPolygon") {
            feature.geometry.coordinates.some((polygon, candidatePart) => {
              const candidateRing = polygon.findIndex(
                (ring, index) =>
                  index > 0 && pointInCoordinateRing(point, ring),
              );
              if (candidateRing > 0) {
                partIndex = candidatePart;
                ringIndex = candidateRing;
                return true;
              }
              return false;
            });
          }
          result = deleteGeometryRing(feature, ringIndex, partIndex);
        } else {
          let partIndex = 0;
          if (feature.geometry.type === "MultiPolygon") {
            partIndex = Math.max(
              0,
              feature.geometry.coordinates.findIndex((polygon) =>
                pointInCoordinateRing(point, polygon[0]),
              ),
            );
          } else if (feature.geometry.type === "MultiPoint") {
            partIndex = feature.geometry.coordinates.reduce(
              (best, coordinate, index, all) =>
                map.project(coordinate as LngLat).dist(event.point) <
                map.project(all[best] as LngLat).dist(event.point)
                  ? index
                  : best,
              0,
            );
          } else if (feature.geometry.type === "MultiLineString") {
            partIndex = feature.geometry.coordinates.reduce(
              (best, line, index, all) => {
                const distance = Math.min(
                  ...line.map((coordinate) =>
                    map.project(coordinate as LngLat).dist(event.point),
                  ),
                );
                const bestDistance = Math.min(
                  ...all[best].map((coordinate) =>
                    map.project(coordinate as LngLat).dist(event.point),
                  ),
                );
                return distance < bestDistance ? index : best;
              },
              0,
            );
          }
          result = deleteGeometryPart(feature, partIndex);
        }
        if (!result.ok) {
          setStatus(result.error);
          return;
        }
        projectRef.current.updateLayer(
          layer.id,
          (target) => ({
            ...target,
            data: {
              ...target.data,
              features: target.data.features.map((candidate) =>
                String(candidate.id) === String(feature.id)
                  ? result.value
                  : candidate,
              ),
            },
          }),
          active === "delete-ring"
            ? "Delete polygon ring"
            : "Delete geometry part",
        );
        setStatus(active === "delete-ring" ? "Ring deleted." : "Part deleted.");
        return;
      }

      if (active === "select" || active === "box-select") {
        const hit = hitTest(event);
        const additive =
          modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey;
        if (!hit) {
          if (!additive) {
            setSelection(null);
            setStatus("Selection cleared.");
          }
          return;
        }
        setSelection((current) =>
          additive
            ? toggleSelection(current, hit.layer, hit.id)
            : selectOne(hit.layer, hit.id),
        );
        setDockView("details");
        setStatus(
          hit.layer === "base"
            ? `Selected base · ${SURFACE_STYLE[normalizeSurface(hit.properties.surface)].label}.`
            : `${graveRecordTitle(hit.properties)}${additive ? " added to the working list" : " selected"}.`,
        );
        return;
      }

      if (active === "move") {
        const current = live.current.selection;
        if (current?.ids.length) {
          const point = snappedPoint(event);
          const layer = projectRef.current.project.layers.find(
            (candidate) => candidate.id === current.layer,
          );
          if (layer && current.layer !== "base" && current.layer !== "graves") {
            if (!layer.editable) {
              setStatus("Toggle editing on for this layer first.");
              return;
            }
            const wanted = new Set(current.ids);
            const selected = layer.data.features.filter((feature) =>
              wanted.has(String(feature.id)),
            );
            const translated = translateFeatureGroup(selected, point);
            const translatedById = new Map(
              translated.map((feature) => [String(feature.id), feature]),
            );
            projectRef.current.updateLayer(
              layer.id,
              (targetLayer) => ({
                ...targetLayer,
                data: {
                  ...targetLayer.data,
                  features: targetLayer.data.features.map((feature) => {
                    return translatedById.get(String(feature.id)) ?? feature;
                  }),
                },
              }),
              "Move features",
            );
            setStatus("Feature moved.");
            return;
          }
          const source =
            current.layer === "graves" ? gravesRef.current : baseRef.current;
          const wanted = new Set(current.ids);
          const moving = source.features.filter((feature) =>
            wanted.has(String(feature.id)),
          );
          const translated = translateFeatureGroup(moving, point);
          const translatedById = new Map(
            translated.map((feature) => [String(feature.id), feature]),
          );
          const next: CemeteryCollection = {
            ...source,
            features: source.features.map((feature) =>
              (translatedById.get(String(feature.id)) as
                | CemeteryFeature
                | undefined) ?? feature,
            ),
          };
          actions.current.commit(
            current.layer === "graves" ? baseRef.current : next,
            current.layer === "graves" ? next : gravesRef.current,
            "Move feature",
          );
          setStatus("Feature moved. Click again to nudge it further.");
          return;
        }
        const hit = hitTest(event);
        if (!hit) {
          setStatus("Click a grave or base polygon to pick it up.");
          return;
        }
        setSelection(selectOne(hit.layer, hit.id));
        setStatus("Feature picked up. Click its new centre.");
        return;
      }

      if (active === "reshape") {
        const points = live.current.draftPoints;
        if (points.length) {
          const edge = nearestEdgeIndex(
            points,
            eventPoint(event),
            EDGE_INSERT_METRES,
          );
          if (edge >= 0 && nearestVertex(event) < 0) {
            const current = live.current.selection;
            if (
              current &&
              current.layer !== "base" &&
              current.layer !== "graves"
            ) {
              const vertex = reshapeVerticesRef.current[edge];
              const nextVertex = reshapeVerticesRef.current[edge + 1];
              const isSamePath =
                vertex &&
                nextVertex &&
                vertex.partIndex === nextVertex.partIndex &&
                vertex.ringIndex === nextVertex.ringIndex &&
                nextVertex.vertexIndex === vertex.vertexIndex + 1;
              if (
                isSamePath &&
                actions.current.commitGenericVertexEdit(
                  "insert",
                  edge,
                  eventPoint(event),
                )
              ) {
                setStatus("Vertex added without changing other parts or rings.");
              }
              return;
            }
            const inserted = [...points];
            inserted.splice(edge + 1, 0, eventPoint(event));
            setDraftPoints(inserted);
            actions.current.commitReshape(inserted);
            setStatus("Vertex added.");
            return;
          }
        }
        const hit = hitTest(event);
        if (!hit) {
          setSelection(null);
          setDraftPoints([]);
          setStatus("Click a feature in the active layer to edit its vertices.");
          return;
        }
        if (hit.layer !== "base" && hit.layer !== "graves") {
          const layer = projectRef.current.project.layers.find(
            (candidate) => candidate.id === hit.layer,
          );
          const feature = layer?.data.features.find(
            (candidate) => String(candidate.id) === hit.id,
          );
          if (!layer?.editable || !feature) {
            setStatus("Make the active layer editable first.");
            return;
          }
          setSelection(selectOne(hit.layer, hit.id));
          const vertices = listEditableVertices(feature);
          reshapeVerticesRef.current = vertices;
          setDraftPoints(vertices.map((vertex) => vertex.coordinate));
          setStatus("Drag a vertex. Alt-click removes; click an edge adds.");
          return;
        }
        const source =
          hit.layer === "graves" ? gravesRef.current : baseRef.current;
        const feature = findFeature(source, hit.id);
        if (!feature) {
          return;
        }
        reshapeVerticesRef.current = [];
        setSelection(selectOne(hit.layer, hit.id));
        setDraftPoints(feature.geometry.coordinates[0].slice(0, -1) as LngLat[]);
        setStatus("Drag a vertex to reshape. Alt-click one to remove it.");
        return;
      }

      if (isPathTool(active)) {
        const next = [...live.current.draftPoints, snappedPoint(event)];
        setDraftPoints(next);
        if (active === "split" && next.length === 2) {
          window.setTimeout(() => actions.current.finishDraft(), 0);
          return;
        }
        setStatus(
          `${next.length} point${next.length === 1 ? "" : "s"} placed · Enter or double-click to finish · Esc to cancel`,
        );
      }
    };

    const onDblClick = (event: MapMouseEvent) => {
      if (!isPathTool(live.current.tool)) {
        return;
      }
      event.preventDefault();
      actions.current.finishDraft();
    };

    const onContextMenu = (event: MapMouseEvent) => {
      if (!isPathTool(live.current.tool)) {
        return;
      }
      event.preventDefault();
      actions.current.finishDraft();
    };

    const onMouseDown = (event: MapMouseEvent) => {
      // Middle mouse always pans, even when left-drag pan is disabled for a tool.
      if (event.originalEvent.button === 1) {
        event.preventDefault();
        middlePanCleanupRef.current?.();
        let lastX = event.originalEvent.clientX;
        let lastY = event.originalEvent.clientY;
        const canvas = map.getCanvas();
        const previousCursor = canvas.style.cursor;
        canvas.style.cursor = "grabbing";

        const onMove = (moveEvent: MouseEvent) => {
          if ((moveEvent.buttons & 4) === 0) {
            cleanup();
            return;
          }
          map.panBy(
            [lastX - moveEvent.clientX, lastY - moveEvent.clientY],
            { animate: false },
          );
          lastX = moveEvent.clientX;
          lastY = moveEvent.clientY;
        };
        const cleanup = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          canvas.style.cursor = previousCursor;
          middlePanCleanupRef.current = null;
          suppressClickRef.current = true;
        };
        const onUp = (upEvent: MouseEvent) => {
          if (upEvent.button === 1) {
            cleanup();
          }
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        middlePanCleanupRef.current = cleanup;
        return;
      }

      const active = live.current.tool;
      const point = eventPoint(event);

      if (active === "reshape" && live.current.draftPoints.length) {
        const index = nearestVertex(event);
        if (index >= 0) {
          event.preventDefault();
          if (event.originalEvent.altKey) {
            const selection = live.current.selection;
            if (
              selection &&
              selection.layer !== "base" &&
              selection.layer !== "graves"
            ) {
              suppressClickRef.current = true;
              if (actions.current.commitGenericVertexEdit("delete", index)) {
                setStatus("Vertex removed without changing other parts or rings.");
              }
              return;
            }
            const points = live.current.draftPoints;
            const family = projectRef.current.activeLayer?.geometryFamily;
            const minimum = family === "point" ? 1 : family === "line" ? 2 : 3;
            if (points.length <= minimum) {
              setStatus(
                `${family ?? "polygon"} geometry needs at least ${minimum} ${minimum === 1 ? "vertex" : "vertices"}.`,
              );
              return;
            }
            const next = points.filter((_, candidate) => candidate !== index);
            suppressClickRef.current = true;
            setDraftPoints(next);
            actions.current.commitReshape(next);
            setStatus("Vertex removed.");
            return;
          }
          draggedVertexRef.current = index;
          map.dragPan.disable();
          setStatus("Moving vertex… release to save.");
          return;
        }
      }

      const shiftBox = active === "select" && event.originalEvent.shiftKey;
      if (active === "draw-rect" || active === "draw-circle") {
        event.preventDefault();
        map.dragPan.disable();
        setDrag({
          mode: active === "draw-rect" ? "rect" : "circle",
          start: snappedPoint(event),
          pointer: point,
        });
        return;
      }

      if (active === "box-select" || shiftBox) {
        event.preventDefault();
        map.dragPan.disable();
        setDrag({ mode: "box", start: point, pointer: point });
        return;
      }

      if (active === "freehand-select") {
        event.preventDefault();
        map.dragPan.disable();
        setDrag({
          mode: "lasso",
          start: point,
          pointer: point,
          points: [point],
        });
        setStatus("Tracing selection boundary… release to select.");
        return;
      }

      if (active === "draw-freehand" || active === "number-freehand") {
        event.preventDefault();
        map.dragPan.disable();
        setDrag({
          mode: "freehand",
          start: point,
          pointer: point,
          points: [point],
        });
        setStatus(
          active === "draw-freehand"
            ? "Tracing outline… release to close the shape."
            : "Drawing numbering path… release to apply.",
        );
        return;
      }

      if (active === "rotate") {
        const centre = live.current.selectionCentre;
        if (!centre) {
          setStatus("Select a plot before rotating.");
          return;
        }
        event.preventDefault();
        map.dragPan.disable();
        setDrag({
          mode: "rotate",
          start: centre,
          pointer: point,
          baseAngle: angleBetween(centre, point),
          angle: 0,
        });
      }
    };

    const onMouseMove = (event: MapMouseEvent) => {
      const point = eventPoint(event);

      if (live.current.tool === "reshape" && draggedVertexRef.current != null) {
        const index = draggedVertexRef.current;
        setDraftPoints((current) => {
          const next = [...current];
          next[index] = point;
          return next;
        });
        return;
      }

      const active = dragRef.current;
      if (active) {
        if (active.mode === "freehand" || active.mode === "lasso") {
          const previous = active.points?.at(-1);
          if (previous && map.project(previous).dist(event.point) < 4) {
            return;
          }
          setDrag({
            ...active,
            pointer: point,
            points: [...(active.points ?? []), point],
          });
          return;
        }
        if (active.mode === "rotate") {
          const angle =
            angleBetween(active.start, point) - (active.baseAngle ?? 0);
          setDrag({ ...active, pointer: point, angle });
          return;
        }
        setDrag({ ...active, pointer: point });
        return;
      }

      if (
        isPathTool(live.current.tool) ||
        live.current.tool === "measure" ||
        (live.current.tool === "circle-select" &&
          live.current.circleSelectionCentre)
      ) {
        setCursor(point);
      }
    };

    const onMouseUp = (event: MapMouseEvent) => {
      if (draggedVertexRef.current != null) {
        const index = draggedVertexRef.current;
        draggedVertexRef.current = null;
        suppressClickRef.current = true;
        map.dragPan.enable();
        const selection = live.current.selection;
        if (
          selection &&
          selection.layer !== "base" &&
          selection.layer !== "graves"
        ) {
          const coordinate = live.current.draftPoints[index];
          if (
            coordinate &&
            actions.current.commitGenericVertexEdit("update", index, coordinate)
          ) {
            setStatus("Vertex moved without changing other parts or rings.");
          }
        } else {
          actions.current.commitReshape(live.current.draftPoints);
          setStatus("Polygon reshaped.");
        }
        return;
      }

      const drop = dragRef.current;
      if (!drop) {
        return;
      }
      dragRef.current = null;
      setDrag(null);
      map.dragPan.enable();
      suppressClickRef.current = true;
      const end = eventPoint(event);

      if (drop.mode === "rect") {
        actions.current.createPolygon(
          rectangleRing(drop.start, end),
          projectRef.current.activeLayerId ?? live.current.drawTarget,
          "Drew rectangle",
        );
        return;
      }

      if (drop.mode === "circle") {
        const ring = circleRing(drop.start, end);
        if (!ring.length) {
          setStatus("Drag further from the centre to place a circle.");
          return;
        }
        actions.current.createPolygon(
          ring,
          projectRef.current.activeLayerId ?? live.current.drawTarget,
          "Drew circle",
        );
        return;
      }

      if (drop.mode === "box") {
        const result = boxSelectIds(drop.start, end);
        if (!result) {
          setStatus("No features from the active layer are inside that box.");
          return;
        }
        const { layer, ids } = result;
        const additive = event.originalEvent.shiftKey;
        setSelection((current) =>
          additive
            ? extendSelection(current, layer, ids)
            : selectMany(layer, ids),
        );
        setDockView("details");
        setStatus(
          `${ids.length.toLocaleString()} features selected from the active layer.`,
        );
        return;
      }

      if (drop.mode === "lasso") {
        const points = drop.points ?? [];
        const result =
          points.length > 2
            ? shapeSelectIds([...points, points[0]])
            : null;
        const additive = event.originalEvent.shiftKey;
        if (!result) {
          if (!additive) setSelection(null);
          setStatus(
            points.length > 2
              ? "No features from the active layer are inside that boundary."
              : "Trace a larger selection boundary.",
          );
          return;
        }
        setSelection((current) =>
          additive
            ? extendSelection(current, result.layer, result.ids)
            : selectMany(result.layer, result.ids),
        );
        setDockView("details");
        setStatus(
          `${result.ids.length.toLocaleString()} features selected with freehand selection.`,
        );
        return;
      }

      if (drop.mode === "freehand") {
        const points = drop.points ?? [];
        if (live.current.tool === "number-freehand") {
          if (points.length >= 2) {
            actions.current.numberAlongPath(points, "Free-hand numbering");
          } else {
            setStatus("Draw across at least one grave.");
          }
          return;
        }
        if (points.length < 3) {
          setStatus("Trace a longer outline.");
          return;
        }
        actions.current.createPolygon(
          [...points, points[0]],
          projectRef.current.activeLayerId ?? live.current.drawTarget,
          "Traced freehand area",
        );
        return;
      }

      if (drop.mode === "rotate" && drop.angle) {
        actions.current.handleRotate(drop.angle);
      }
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    map.on("mousemove", onMouseMove);
    map.on("mousedown", onMouseDown);
    map.on("mouseup", onMouseUp);
    map.on("contextmenu", onContextMenu);

    const canvas = map.getCanvas();
    const preventMiddleClickDefault = (event: MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault();
      }
    };
    canvas.addEventListener("auxclick", preventMiddleClickDefault);
    canvas.addEventListener("mousedown", preventMiddleClickDefault);

    const resize = () => map.resize();
    window.addEventListener("resize", resize);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && containerRef.current
        ? new ResizeObserver(() => resize())
        : null;
    if (containerRef.current && resizeObserver) {
      resizeObserver.observe(containerRef.current);
    }
    requestAnimationFrame(resize);

    return () => {
      cancelled = true;
      middlePanCleanupRef.current?.();
      canvas.removeEventListener("auxclick", preventMiddleClickDefault);
      canvas.removeEventListener("mousedown", preventMiddleClickDefault);
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; live state reaches handlers through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------- keyboard

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      const modified = event.ctrlKey || event.metaKey;

      if (event.key === "Escape") {
        if (live.current.circleSelectionCentre) {
          setCircleSelectionCentre(null);
          setCursor(null);
          setStatus("Circular selection cancelled.");
        } else if (live.current.draftPoints.length || measurePoints.length) {
          clearDraft();
          setMeasurePoints([]);
          setStatus("Drawing cancelled.");
        } else {
          setSelection(null);
          setStatus("Selection cleared.");
        }
        return;
      }

      if (modified && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (modified && event.key.toLowerCase() === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (modified) {
        return;
      }

      if (event.key === "Enter" && isPathTool(live.current.tool)) {
        event.preventDefault();
        finishDraft();
        return;
      }
      if (event.key === "Backspace" && live.current.draftPoints.length) {
        event.preventDefault();
        setDraftPoints((current) => current.slice(0, -1));
        setStatus("Removed the last vertex.");
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handleDelete();
        return;
      }

      const shortcut = toolForShortcut(event.key);
      if (shortcut) {
        event.preventDefault();
        setTool(shortcut);
        setStatus(getTool(shortcut)?.hint ?? "");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    clearDraft,
    finishDraft,
    handleDelete,
    handleRedo,
    handleUndo,
    measurePoints.length,
  ]);

  // ------------------------------------------------------------ map syncing

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }

    const apply = () => {
      map.resize();
      syncProjectLayers(map, project.project, {
        selectedIdsByLayer: selection
          ? { [selection.layer]: selectedIds }
          : {},
        flaggedGraveIds: flaggedIds,
        inspectionHighlightedIds: erasmus.highlightedIds,
        showInspectionOverlays: workspaceModule === "erasmus",
        visibleGraveSection:
          workspaceModule === "erasmus" ? erasmus.section : null,
        graveColorId,
        graveColorMode,
        occupancyGradientId,
        graveLabelMode: labelMode,
        surfaceVisibility,
      });
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("idle", apply);
    }

  }, [
    flaggedIds,
    erasmus.highlightedIds,
    erasmus.section,
    graveColorId,
    graveColorMode,
    occupancyGradientId,
    labelMode,
    project.project,
    ready,
    selection,
    selectedIds,
    surfaceVisibility,
    workspaceModule,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const apply = () => syncProjectDraft(map, draft);
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("idle", apply);
      return () => {
        map.off("idle", apply);
      };
    }
  }, [draft, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor =
      tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";
    if (isPathTool(tool) || DRAG_TOOLS.has(tool) || tool === "reshape") {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
  }, [ready, tool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    if (skipInitialStyleSync.current) {
      skipInitialStyleSync.current = false;
      return;
    }

    map.setStyle(
      getBasemap(basemapId).style as string | maplibregl.StyleSpecification,
      {
        transformStyle: (previous, next) =>
          preserveProjectStyle(
            previous,
            next,
            projectRef.current.projectRef.current,
          ),
      },
    );

    const restore = () => {
      const ids = live.current.selection?.ids ?? [];
      const currentProject = projectRef.current.projectRef.current;
      syncProjectLayers(map, currentProject, {
        draft: draftCollectionRef.current,
        selectedIdsByLayer: live.current.selection
          ? { [live.current.selection.layer]: ids }
          : {},
        flaggedGraveIds: flaggedIds,
        inspectionHighlightedIds: erasmus.highlightedIds,
        showInspectionOverlays: workspaceModule === "erasmus",
        visibleGraveSection:
          workspaceModule === "erasmus" ? erasmus.section : null,
        graveColorId,
        graveColorMode,
        occupancyGradientId,
        graveLabelMode: labelMode,
        surfaceVisibility,
      });
    };
    map.once("idle", restore);
    return () => {
      map.off("idle", restore);
    };
    // Only a basemap change should trigger a style swap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemapId, ready]);

  // --------------------------------------------------------------- handlers

  const handleToolChange = useCallback(
    (next: ToolId) => {
      setCircleSelectionCentre(null);
      if (next === "continue-row") {
        const anchor = primaryFeature;
        if (!anchor?.properties.cds_id) {
          setStatus("Select a grave from a generated row first.");
          return;
        }
        if (anchor.properties.cds_mode === "grid") {
          setStatus("Grids cannot be continued — use Regenerate layout.");
          return;
        }
        try {
          const points = JSON.parse(
            String(anchor.properties.cds_points ?? "[]"),
          ) as LngLat[];
          const params = JSON.parse(
            String(anchor.properties.cds_params ?? "{}"),
          ) as Partial<RowParams>;
          if (points.length < 2) {
            throw new Error("No row path");
          }
          setRowParams((current) => ({ ...current, ...params }));
          setDraftPoints([points[points.length - 1]]);
        } catch {
          setStatus("That grave has no valid stored row definition.");
          return;
        }
      }

      if (next === "regenerate") {
        const anchor = primaryFeature;
        if (!anchor?.properties.cds_id) {
          setStatus("Select a grave from a generated layout first.");
          return;
        }
        try {
          const params = JSON.parse(
            String(anchor.properties.cds_params ?? "{}"),
          ) as Partial<RowParams & GridParams>;
          if (anchor.properties.cds_mode === "grid") {
            setGridParams((current) => ({ ...current, ...params }));
          } else {
            setRowParams((current) => ({ ...current, ...params }));
          }
        } catch {
          setStatus("That grave has invalid stored layout settings.");
          return;
        }
      }

      if (next === "reshape") {
        if (primaryFeature) {
          setDraftPoints(
            primaryFeature.geometry.coordinates[0].slice(0, -1) as LngLat[],
          );
        } else if (selectedLayerFeatures[0]) {
          setDraftPoints(
            listEditableVertices(selectedLayerFeatures[0]).map(
              (vertex) => vertex.coordinate,
            ),
          );
        }
      }

      setTool(next);
      setDockView("details");
      if (next !== "continue-row" && next !== "reshape") {
        clearDraft();
      }
      if (next !== "measure") {
        setMeasurePoints([]);
      }
      setStatus(getTool(next)?.hint ?? "");
    },
    [clearDraft, primaryFeature, selectedLayerFeatures],
  );

  const clearHighlight = useCallback(() => {
    setFlaggedIds([]);
    setIssues([]);
    setReviewHasRun(false);
    setStatus("Cleared the map highlight.");
  }, []);

  const savedLabel = project.isDirty
    ? "Saving…"
    : project.lastSaved
      ? `Saved ${new Date(project.lastSaved).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "Not saved yet";

  return (
    <div className="workspace">
      <header className="workspace-toolbar">
        <EpicBrand />
        <div className="workspace-module-switch" role="group" aria-label="Workspace module">
          <button
            type="button"
            className={workspaceModule === "mapping" ? "is-active" : undefined}
            aria-pressed={workspaceModule === "mapping"}
            onClick={() => handleWorkspaceModuleChange("mapping")}
          >
            Mapping
          </button>
          <button
            type="button"
            className={workspaceModule === "erasmus" ? "is-active" : undefined}
            aria-pressed={workspaceModule === "erasmus"}
            onClick={() => handleWorkspaceModuleChange("erasmus")}
          >
            Erasmus
          </button>
        </div>
        <ToolRail
          workspaceModule={workspaceModule}
          value={tool}
          onChange={handleToolChange}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onExport={handleExport}
          canDelete={selectionSize(selection) > 0 && Boolean(activeLayer?.editable)}
          canUndo={project.canUndo}
          canRedo={project.canRedo}
          disabledTools={disabledTools}
        />
      </header>

      <nav className="workspace-dock-tabs" aria-label="Left panel">
        <button
          type="button"
          className={dockView === "layers" ? "is-active" : undefined}
          aria-pressed={dockView === "layers"}
          onClick={() => setDockView("layers")}
        >
          Layers
        </button>
        <button
          type="button"
          className={dockView === "details" ? "is-active" : undefined}
          aria-pressed={dockView === "details"}
          onClick={() => setDockView("details")}
        >
          {selectionSize(selection) > 0
            ? `Details · ${selectionSize(selection).toLocaleString()}`
            : "Details"}
        </button>
      </nav>

      <aside
        className="sidebar"
        aria-label="Map layers"
        hidden={dockView !== "layers"}
      >
        <div className="sidebar__body">
          <LayerPanel
            layers={layers}
            activeLayerId={activeLayerId}
            surfaceVisibility={surfaceVisibility}
            onSurfaceVisibility={setSurfaceVisibility}
            graveColorId={graveColorId}
            onGraveColorChange={handleGraveColorChange}
            graveColorMode={graveColorMode}
            onGraveColorModeChange={handleGraveColorModeChange}
            occupancyGradientId={occupancyGradientId}
            onOccupancyGradientChange={handleOccupancyGradientChange}
            labelMode={labelMode}
            onLabelMode={setLabelMode}
            flaggedCount={flaggedIds.length}
            onClearFlagged={clearHighlight}
            onActivate={project.setActiveLayer}
            onToggleVisible={(id) =>
              project.updateLayer(
                id,
                (layer) => ({ ...layer, visible: !layer.visible }),
                "Toggle layer visibility",
              )
            }
            onToggleEditable={project.toggleLayerEditable}
            onMove={(id, direction) => {
              const index = layers.findIndex((layer) => layer.id === id);
              project.reorderLayer(
                id,
                direction === "up" ? index + 1 : index - 1,
                "Reorder layers",
              );
            }}
            onRename={(id, name) =>
              project.updateLayer(
                id,
                (layer) => ({ ...layer, name }),
                "Rename layer",
              )
            }
            onStyle={(id, color) =>
              project.updateLayer(
                id,
                (layer) => ({
                  ...layer,
                  style: {
                    ...layer.style,
                    fillColor: color,
                    color:
                      layer.geometryFamily === "polygon"
                        ? layer.style.color
                        : color,
                  },
                }),
                "Change layer style",
              )
            }
            onDelete={(id) => {
              const layer = layers.find((candidate) => candidate.id === id);
              if (
                layer &&
                window.confirm(
                  `Delete “${layer.name}” and its ${layer.data.features.length.toLocaleString()} features? This can be undone.`,
                )
              ) {
                project.removeLayer(id, "Delete layer");
                setSelection(null);
              }
            }}
            onAdd={() => setShowCreateLayer(true)}
          />
        </div>

        <div className="sidebar__footer">
          <p className="sidebar__footer-label">Basemap</p>
          <BasemapSwitcher value={basemapId} onChange={setBasemapId} />
        </div>
      </aside>

      <section
        className={`map-shell${ready ? " map-shell--ready" : ""}`}
        aria-label="Map"
      >
        <div ref={containerRef} className="map-canvas" />

        <div className="map-workspace-status" role="status">
          <span
            className={`map-workspace-status__dot${project.isDirty ? " is-dirty" : ""}`}
            title={
              project.isDirty ? "Unsaved local changes" : "All changes saved"
            }
            aria-hidden
          />
          <div>
            <strong>Upminster Cemetery · {savedLabel}</strong>
            <span title={status}>{status}</span>
          </div>
        </div>

        {selectionRadiusMetres != null ? (
          <div className="map-selection-badge map-selection-badge--radius">
            <strong>
              {selectionRadiusMetres < 100
                ? selectionRadiusMetres.toFixed(1)
                : Math.round(selectionRadiusMetres).toLocaleString()}
            </strong>
            <span>m radius</span>
          </div>
        ) : null}

        {selectionSize(selection) > 0 ? (
          <div className="map-selection-badge">
            <strong>{selectionSize(selection).toLocaleString()}</strong>
            <span>
              {selection?.layer === "graves" ? "graves" : "base areas"} selected
            </span>
            <button
              type="button"
              onClick={() => zoomToFeatures(selectedFeatures)}
            >
              Zoom
            </button>
            <button type="button" onClick={() => setSelection(null)}>
              Clear
            </button>
          </div>
        ) : null}

        <NorthArrow mapRef={mapRef} ready={ready} />
        {error ? <p className="map-error">{error}</p> : null}
      </section>

      <aside
        className="context-panel"
        aria-label="Tool and record details"
        hidden={dockView !== "details"}
      >
        <ContextPanel
          workspaceModule={workspaceModule}
          tool={tool}
          status={status}
          selectionCount={selectionSize(selection)}
          selectionRadiusMetres={selectionRadiusMetres}
          selection={{
            layer: selection?.layer ?? null,
            layerMeta:
              layers.find((layer) => layer.id === selection?.layer) ?? null,
            genericFeatures: selectedLayerFeatures,
            items: selectionItems,
            primary: primaryRecord,
            selectedSurface,
            onAssignSurface: handleAssignSurface,
            onSavePrimary: handleUpdateGrave,
            onGeneratePrimaryReference: handleGeneratePrimaryReference,
            onZoomTo: (id) => zoomToIds([id]),
            onRemove: (id) =>
              setSelection((current) => removeFromSelection(current, id)),
            onClear: () => setSelection(null),
            onBulkUpdate: handleBulkUpdate,
            onBulkDelete: handleDelete,
            onBulkReferences: () => handleGenerateReferences("selection"),
            onExportCsv: handleExportSelectionCsv,
            onEmailOwners: () => {
              void handleEmailOwners();
            },
            onSaveGeneric: (patch) => {
              if (!selection?.layer || !selection.ids.length) return;
              const wanted = new Set(selection.ids);
              project.updateLayer(
                selection.layer,
                (layer) => ({
                  ...layer,
                  data: {
                    ...layer.data,
                    features: layer.data.features.map((feature) =>
                      wanted.has(String(feature.id))
                        ? {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              ...patch,
                              epilog_id: String(feature.id),
                            },
                          }
                        : feature,
                    ),
                  },
                }),
                "Update feature attributes",
              );
              setStatus("Feature attributes updated.");
            },
          }}
          rowParams={rowParams}
          gridParams={gridParams}
          numberParams={numberParams}
          onRowParams={setRowParams}
          onGridParams={setGridParams}
          onNumberParams={setNumberParams}
          draw={{
            target: drawTarget,
            onTarget: setDrawTarget,
            snapping,
            onSnapping: setSnapping,
            snapTolerance,
            onSnapTolerance: setSnapTolerance,
          }}
          batch={{
            count: batchPaths.length,
            onCreate: handleCreateBatch,
            onClear: () => {
              setBatchPaths([]);
              setStatus("Cleared captured centre-lines.");
            },
          }}
          regenerate={{ mode: regenerateMode, onRegenerate: handleRegenerate }}
          references={{
            summary: referenceSummary,
            lastRun: referenceRun,
            labelMode,
            onGenerate: handleGenerateReferences,
            onShowChanged: () => {
              setSelection(selectMany("graves", flaggedIds));
              zoomToIds(flaggedIds);
            },
            onLabelMode: setLabelMode,
          }}
          review={{
            issues,
            hasRun: reviewHasRun,
            flaggedCount: flaggedIds.length,
            onRun: (minimumGap) =>
              handleRunReview(
                tool === "quality" ? "quality" : "duplicates",
                minimumGap,
              ),
            onSelectIssue: handleSelectIssue,
            onSelectAllFlagged: () => {
              setSelection(selectMany("graves", flaggedIds));
              zoomToIds(flaggedIds);
            },
            onClear: clearHighlight,
          }}
          modify={{
            onRotate: handleRotate,
            onMerge: handleMerge,
            onSimplify: handleSimplify,
            onOffset: handleOffset,
          }}
          measure={{
            ...measurement,
            onClear: () => {
              setMeasurePoints([]);
              setCursor(null);
            },
          }}
          erasmus={erasmus}
        />
      </aside>

      {showCreateLayer ? (
        <CreateLayerDialog
          onCancel={() => setShowCreateLayer(false)}
          onCreate={(options: NewLayerOptions) => {
            project.addLayer(options, "Create layer");
            setShowCreateLayer(false);
            setDockView("layers");
            setStatus(
              `${options.name} is active and editable. Choose Add feature to digitise.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}
