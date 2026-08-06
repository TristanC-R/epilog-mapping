export type ToolId =
  | "pan"
  | "measure"
  | "select"
  | "box-select"
  | "freehand-select"
  | "circle-select"
  | "add-feature"
  | "draw-grave"
  | "draw-base"
  | "draw-rect"
  | "draw-circle"
  | "draw-freehand"
  | "move"
  | "reshape"
  | "rotate"
  | "split"
  | "merge"
  | "add-ring"
  | "delete-ring"
  | "add-part"
  | "delete-part"
  | "simplify"
  | "offset"
  | "row-count"
  | "row-size"
  | "grid"
  | "continue-row"
  | "regenerate"
  | "batch-row"
  | "number-freehand"
  | "number-line"
  | "references"
  | "duplicates"
  | "quality";

export type ToolGroupId =
  | "navigate"
  | "select"
  | "draw"
  | "modify"
  | "layout"
  | "records"
  | "review";

export type ToolDef = {
  id: ToolId;
  label: string;
  shortLabel: string;
  group: ToolGroupId;
  hint: string;
  /** Single-key shortcut, matched case-insensitively outside text inputs. */
  shortcut?: string;
};

export const TOOL_GROUPS: Array<{
  id: ToolGroupId;
  label: string;
  blurb: string;
}> = [
  { id: "navigate", label: "Map", blurb: "Move around and take measurements" },
  { id: "select", label: "Select", blurb: "Build a working list of plots" },
  { id: "draw", label: "Draw", blurb: "Digitise new plots and base areas" },
  { id: "modify", label: "Modify", blurb: "Adjust existing geometry" },
  { id: "layout", label: "Layouts", blurb: "Generate rows and grids" },
  { id: "records", label: "Records", blurb: "Number plots and link records" },
  { id: "review", label: "Review", blurb: "Check the survey before publishing" },
];

export const TOOLS: ToolDef[] = [
  {
    id: "pan",
    label: "Pan",
    shortLabel: "Pan",
    group: "navigate",
    hint: "Drag to move around the map.",
    shortcut: "h",
  },
  {
    id: "measure",
    label: "Measure",
    shortLabel: "Measure",
    group: "navigate",
    hint: "Click points to measure distance; close the shape for an area.",
    shortcut: "m",
  },
  {
    id: "select",
    label: "Select",
    shortLabel: "Select",
    group: "select",
    hint: "Click a plot to open its record. Shift-click to build a list.",
    shortcut: "v",
  },
  {
    id: "box-select",
    label: "Box select",
    shortLabel: "Box",
    group: "select",
    hint: "Drag a box to select every grave inside it. Shift adds to the list.",
    shortcut: "b",
  },
  {
    id: "freehand-select",
    label: "Freehand select",
    shortLabel: "Freehand",
    group: "select",
    hint:
      "Drag a freehand boundary to select features from the active layer. Shift adds to the current list.",
  },
  {
    id: "circle-select",
    label: "Circular select",
    shortLabel: "Circle",
    group: "select",
    hint:
      "Click the centre, then click a second point to select within that radius. The live radius is shown in metres.",
  },
  {
    id: "add-feature",
    label: "Add feature",
    shortLabel: "Add",
    group: "draw",
    hint: "Create a point, line or polygon in the active editable layer.",
    shortcut: "a",
  },
  {
    id: "draw-grave",
    label: "Draw grave",
    shortLabel: "Grave",
    group: "draw",
    hint: "Click vertices for a grave polygon. Enter or double-click to finish.",
    shortcut: "g",
  },
  {
    id: "draw-base",
    label: "Draw base area",
    shortLabel: "Base",
    group: "draw",
    hint: "Click vertices for a base polygon. Enter or double-click to finish.",
  },
  {
    id: "draw-rect",
    label: "Rectangle",
    shortLabel: "Rect",
    group: "draw",
    hint: "Drag corner to corner. Rectangles are true to the ground, in metres.",
    shortcut: "r",
  },
  {
    id: "draw-circle",
    label: "Circle",
    shortLabel: "Circle",
    group: "draw",
    hint: "Drag out from the centre to place a circular plot or feature.",
    shortcut: "c",
  },
  {
    id: "draw-freehand",
    label: "Freehand area",
    shortLabel: "Freehand",
    group: "draw",
    hint: "Press and drag to trace an outline; releasing closes the shape.",
    shortcut: "f",
  },
  {
    id: "move",
    label: "Move feature",
    shortLabel: "Move",
    group: "modify",
    hint: "Select a feature, then click its new centre.",
  },
  {
    id: "reshape",
    label: "Edit vertices",
    shortLabel: "Vertices",
    group: "modify",
    hint: "Drag vertices to reshape. Alt-click removes one; click an edge adds one.",
    shortcut: "e",
  },
  {
    id: "rotate",
    label: "Rotate",
    shortLabel: "Rotate",
    group: "modify",
    hint: "Drag around the selected plot, or type an exact angle.",
  },
  {
    id: "split",
    label: "Split polygon",
    shortLabel: "Split",
    group: "modify",
    hint: "Draw a two-point cut line across the selected plots.",
  },
  {
    id: "merge",
    label: "Merge plots",
    shortLabel: "Merge",
    group: "modify",
    hint: "Combine two or more selected graves into a single plot outline.",
  },
  {
    id: "add-ring",
    label: "Add ring",
    shortLabel: "Add ring",
    group: "modify",
    hint: "Draw a hole inside the selected polygon.",
  },
  {
    id: "delete-ring",
    label: "Delete ring",
    shortLabel: "Delete ring",
    group: "modify",
    hint: "Click an interior ring to remove that hole from its polygon.",
  },
  {
    id: "add-part",
    label: "Add part",
    shortLabel: "Add part",
    group: "modify",
    hint: "Draw another point, line or polygon part for the selected feature.",
  },
  {
    id: "delete-part",
    label: "Delete part",
    shortLabel: "Delete part",
    group: "modify",
    hint: "Click a multipart geometry part to remove it.",
  },
  {
    id: "simplify",
    label: "Simplify feature",
    shortLabel: "Simplify",
    group: "modify",
    hint: "Reduce unnecessary vertices while preserving the feature shape.",
  },
  {
    id: "offset",
    label: "Offset curve",
    shortLabel: "Offset",
    group: "modify",
    hint: "Create a parallel copy of the selected line at a measured offset.",
  },
  {
    id: "row-count",
    label: "Row by count",
    shortLabel: "Count row",
    group: "layout",
    hint: "Draw a centre-line, then create an exact number of graves.",
  },
  {
    id: "row-size",
    label: "Fixed-size row",
    shortLabel: "Fixed row",
    group: "layout",
    hint: "Draw a centre-line, then pack graves of fixed length.",
  },
  {
    id: "grid",
    label: "Grave grid",
    shortLabel: "Grid",
    group: "layout",
    hint: "Draw a boundary polygon and fill it with graves.",
  },
  {
    id: "continue-row",
    label: "Continue selected row",
    shortLabel: "Continue",
    group: "layout",
    hint: "Select a grave from a generated row, then extend its centre-line.",
  },
  {
    id: "regenerate",
    label: "Regenerate layout",
    shortLabel: "Regenerate",
    group: "layout",
    hint: "Rebuild the generated layout containing the selected grave.",
  },
  {
    id: "batch-row",
    label: "Batch grave rows",
    shortLabel: "Batch rows",
    group: "layout",
    hint: "Capture several centre-lines and create rows with shared settings.",
  },
  {
    id: "number-freehand",
    label: "Free-hand numbering",
    shortLabel: "Free-hand",
    group: "records",
    hint: "Drag across graves to number them in encounter order.",
  },
  {
    id: "number-line",
    label: "Segmented line numbering",
    shortLabel: "Line number",
    group: "records",
    hint: "Click line vertices through graves, then finish to number them.",
  },
  {
    id: "references",
    label: "Grave references",
    shortLabel: "References",
    group: "records",
    hint: "Build the Cem~Sect~SubSect~Grave~SubGrave key that links cloud records.",
  },
  {
    id: "duplicates",
    label: "Duplicate references",
    shortLabel: "Duplicates",
    group: "review",
    hint: "Find graves that share the same non-empty reference.",
  },
  {
    id: "quality",
    label: "Quality control",
    shortLabel: "Quality",
    group: "review",
    hint: "Check geometry, numbering, references, overlaps and spacing.",
  },
];

export function getTool(id: ToolId): ToolDef | undefined {
  return TOOLS.find((tool) => tool.id === id);
}

export function toolForShortcut(key: string): ToolId | null {
  const match = TOOLS.find((tool) => tool.shortcut === key.toLowerCase());
  return match?.id ?? null;
}

/** Which collection a generic draw tool writes into. */
export type DrawTarget = "graves" | "base";

export type NumberPattern =
  | "forward"
  | "reverse"
  | "snake"
  | "columns"
  | "column_snake";

export type RowParams = {
  template: "custom" | "adult" | "child" | "cremation" | "double";
  along: number;
  depth: number;
  gap: number;
  count: number;
  smoothing: number;
  placement: "center" | "left" | "right" | "both";
  offset: number;
  alignment: "path" | "bearing" | "selected";
  bearing: number;
  autoNumber: boolean;
  numberField: string;
  numberStart: number;
  numberPattern: NumberPattern;
  attributes: string;
  excludeObstacles: boolean;
};

export type GridParams = {
  along: number;
  depth: number;
  gap: number;
  count: number;
  adaptive: boolean;
  lockRatio: boolean;
  excludeObstacles: boolean;
  autoNumber: boolean;
  numberField: string;
  numberStart: number;
  numberPattern: NumberPattern;
  attributes: string;
};

export type NumberParams = {
  field: string;
  start: number;
};

export const DEFAULT_ROW_PARAMS: RowParams = {
  template: "adult",
  along: 2.4,
  depth: 1.2,
  gap: 0,
  count: 10,
  smoothing: 0,
  placement: "center",
  offset: 0,
  alignment: "path",
  bearing: 0,
  autoNumber: false,
  numberField: "Grave",
  numberStart: 1,
  numberPattern: "forward",
  attributes: "grave_type=Adult\nstatus=Available",
  excludeObstacles: false,
};

export const DEFAULT_GRID_PARAMS: GridParams = {
  along: 2.4,
  depth: 1.2,
  gap: 0.1,
  count: 20,
  adaptive: true,
  lockRatio: true,
  excludeObstacles: false,
  autoNumber: false,
  numberField: "Grave",
  numberStart: 1,
  numberPattern: "snake",
  attributes: "grave_type=Adult\nstatus=Available",
};

export const DEFAULT_NUMBER_PARAMS: NumberParams = {
  field: "Grave",
  start: 1,
};
