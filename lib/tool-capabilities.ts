import type { GeometryFamily, MapLayer } from "@/lib/project-model";

export type StandardToolId =
  | "add-feature"
  | "vertex"
  | "move"
  | "rotate"
  | "reshape"
  | "split"
  | "merge"
  | "duplicate"
  | "delete"
  | "add-ring"
  | "delete-ring"
  | "add-part"
  | "delete-part"
  | "simplify"
  | "offset"
  | "select"
  | "box-select"
  | "freehand-select"
  | "circle-select";

export type ToolCapability = {
  enabled: boolean;
  reason: string;
};

const MUTATION_TOOLS = new Set<StandardToolId>([
  "add-feature",
  "vertex",
  "move",
  "rotate",
  "reshape",
  "split",
  "merge",
  "duplicate",
  "delete",
  "add-ring",
  "delete-ring",
  "add-part",
  "delete-part",
  "simplify",
  "offset",
]);

const SELECTION_TOOLS = new Set<StandardToolId>([
  "vertex",
  "move",
  "rotate",
  "reshape",
  "split",
  "duplicate",
  "delete",
  "add-ring",
  "delete-ring",
  "add-part",
  "delete-part",
  "simplify",
  "offset",
]);

const LINE_OR_POLYGON = new Set<GeometryFamily>(["line", "polygon"]);

function available(reason: string): ToolCapability {
  return { enabled: true, reason };
}

function unavailable(reason: string): ToolCapability {
  return { enabled: false, reason };
}

/**
 * Report whether a standard editing tool can operate on the active layer.
 * Cemetery-specific policy is intentionally handled by
 * `cemeteryToolCapability`.
 */
export function toolCapability(
  tool: StandardToolId,
  activeLayer: MapLayer | null | undefined,
  selectionCount: number,
): ToolCapability {
  if (!activeLayer) {
    return unavailable("Choose an active layer first.");
  }

  if (MUTATION_TOOLS.has(tool) && !activeLayer.editable) {
    return unavailable(`Make “${activeLayer.name}” editable to use this tool.`);
  }

  const family = activeLayer.geometryFamily;

  if (tool === "split" && !LINE_OR_POLYGON.has(family)) {
    return unavailable("Split is available for line and polygon layers.");
  }

  if ((tool === "add-ring" || tool === "delete-ring") && family !== "polygon") {
    return unavailable("Ring tools are available only for polygon layers.");
  }

  if (tool === "simplify" && !LINE_OR_POLYGON.has(family)) {
    return unavailable("Simplify is available for line and polygon layers.");
  }

  if (tool === "offset" && family !== "line") {
    return unavailable("Offset is available only for line layers.");
  }

  if (tool === "merge" && selectionCount < 2) {
    return unavailable("Select at least two features from the active layer.");
  }

  if (SELECTION_TOOLS.has(tool) && selectionCount < 1) {
    return unavailable("Select at least one feature from the active layer.");
  }

  if (
    tool === "select" ||
    tool === "box-select" ||
    tool === "freehand-select" ||
    tool === "circle-select"
  ) {
    return available(`Ready to select features from “${activeLayer.name}”.`);
  }

  if (tool === "add-feature") {
    return available(`Ready to add a ${family} feature.`);
  }

  return available(`Ready to edit the selected ${family} feature${selectionCount === 1 ? "" : "s"}.`);
}

const GRAVE_ONLY_TOOLS = new Set<string>([
  "draw-grave",
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
]);

const BASE_ONLY_TOOLS = new Set<string>(["draw-base"]);

const READ_ONLY_CEMETERY_TOOLS = new Set<string>(["duplicates", "quality"]);

/**
 * Apply semantic restrictions for specialist cemetery tools separately from
 * the standard geometry capability matrix.
 */
export function cemeteryToolCapability(
  toolId: string,
  layer: MapLayer | null | undefined,
): ToolCapability {
  if (!GRAVE_ONLY_TOOLS.has(toolId) && !BASE_ONLY_TOOLS.has(toolId)) {
    return available("This tool has no cemetery-specific layer restriction.");
  }

  if (!layer) {
    return unavailable("Choose an active cemetery layer first.");
  }

  if (GRAVE_ONLY_TOOLS.has(toolId) && layer.kind !== "graves") {
    return unavailable("This cemetery tool is available only on the Graves layer.");
  }

  if (BASE_ONLY_TOOLS.has(toolId) && layer.kind !== "base") {
    return unavailable("This cemetery tool is available only on the Cemetery base layer.");
  }

  if (!READ_ONLY_CEMETERY_TOOLS.has(toolId) && !layer.editable) {
    return unavailable(`Make “${layer.name}” editable to use this cemetery tool.`);
  }

  return available(`Ready to use this cemetery tool on “${layer.name}”.`);
}
