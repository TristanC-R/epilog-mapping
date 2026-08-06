export type GraveColorId =
  | "terracotta"
  | "amber"
  | "coral"
  | "plum"
  | "slate"
  | "teal"
  | "forest"
  | "charcoal";

export type GraveColor = {
  id: GraveColorId;
  label: string;
  fill: string;
  line: string;
};

export type GraveColorModeId =
  | "solid"
  | "occupancy"
  | "status"
  | "inspection";

export type GraveColorMode = {
  id: GraveColorModeId;
  label: string;
  hint: string;
};

export type OccupancyGradientId =
  | "forest"
  | "terracotta"
  | "ocean"
  | "sunset"
  | "violet";

export type OccupancyGradient = {
  id: OccupancyGradientId;
  label: string;
  /** Six fill colours for burial counts 0–5. */
  fills: [string, string, string, string, string, string];
  /** Matching outline colours. */
  lines: [string, string, string, string, string, string];
};

export type GraveLegendStop = {
  id: string;
  label: string;
  fill: string;
  line: string;
};

export const GRAVE_COLORS: GraveColor[] = [
  {
    id: "terracotta",
    label: "Terracotta",
    fill: "#c45c26",
    line: "#6b2f12",
  },
  {
    id: "amber",
    label: "Amber",
    fill: "#d4a017",
    line: "#7a5a0a",
  },
  {
    id: "coral",
    label: "Coral",
    fill: "#e07a5f",
    line: "#8f3f2d",
  },
  {
    id: "plum",
    label: "Plum",
    fill: "#8b5a7a",
    line: "#4f2f44",
  },
  {
    id: "slate",
    label: "Slate",
    fill: "#4a6fa5",
    line: "#243a5c",
  },
  {
    id: "teal",
    label: "Teal",
    fill: "#2a9d8f",
    line: "#145e56",
  },
  {
    id: "forest",
    label: "Forest",
    fill: "#3d7a5c",
    line: "#1f4231",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    fill: "#5a5a5a",
    line: "#2e2e2e",
  },
];

export const GRAVE_COLOR_MODES: GraveColorMode[] = [
  {
    id: "solid",
    label: "Single",
    hint: "One colour for every grave",
  },
  {
    id: "occupancy",
    label: "Occupancy",
    hint: "Colour by number of burials (0–5)",
  },
  {
    id: "status",
    label: "Status",
    hint: "Colour by Available, Reserved or Occupied",
  },
  {
    id: "inspection",
    label: "Inspection",
    hint: "Colour by Erasmus inspection due status",
  },
];

export const OCCUPANCY_GRADIENTS: OccupancyGradient[] = [
  {
    id: "forest",
    label: "Forest",
    fills: ["#e8f0ea", "#b7d4c0", "#7fb892", "#4f9470", "#2f7354", "#1a4d38"],
    lines: ["#7d9585", "#4f7a5d", "#3a6b4f", "#2d5c45", "#1f4a37", "#0f2f22"],
  },
  {
    id: "terracotta",
    label: "Terracotta",
    fills: ["#f6ebe3", "#ecc3a8", "#e09a6c", "#c45c26", "#8f3b14", "#5c240c"],
    lines: ["#b08972", "#a56a45", "#8f4f28", "#6b2f12", "#4a1f0c", "#2e1408"],
  },
  {
    id: "ocean",
    label: "Ocean",
    fills: ["#e7f1f7", "#b5d4e8", "#6fa9cf", "#3d7eb0", "#245f8f", "#143d5c"],
    lines: ["#7a97a8", "#4f7a96", "#3a6480", "#2a4f6b", "#1c3a52", "#102636"],
  },
  {
    id: "sunset",
    label: "Sunset",
    fills: ["#f7f0e4", "#f0d39a", "#e7a84a", "#d4733a", "#b4452c", "#7a2418"],
    lines: ["#b59a72", "#a07a3a", "#8f5f22", "#7a3f1c", "#5c2816", "#3a160e"],
  },
  {
    id: "violet",
    label: "Violet",
    fills: ["#f1eaf2", "#d5bdd8", "#b38cba", "#8b5a7a", "#643f5a", "#3f2738"],
    lines: ["#9a849c", "#7a5f80", "#654a68", "#4f2f44", "#382232", "#24161f"],
  },
];

export const STATUS_STOPS: GraveLegendStop[] = [
  { id: "Available", label: "Available", fill: "#8fc5a5", line: "#3f6654" },
  { id: "Reserved", label: "Reserved", fill: "#d4a017", line: "#7a5a0a" },
  { id: "Occupied", label: "Occupied", fill: "#c45c26", line: "#6b2f12" },
];

export const INSPECTION_STOPS: GraveLegendStop[] = [
  { id: "current", label: "Current", fill: "#72b58a", line: "#285b3a" },
  { id: "due", label: "Due within 90 days", fill: "#e2b64c", line: "#7b5811" },
  { id: "overdue", label: "Overdue", fill: "#d9685d", line: "#7d2822" },
  {
    id: "no_monument",
    label: "No monument",
    fill: "#9aa4ad",
    line: "#46515a",
  },
];

export const DEFAULT_GRAVE_COLOR_ID: GraveColorId = "terracotta";
export const DEFAULT_GRAVE_COLOR_MODE: GraveColorModeId = "solid";
export const DEFAULT_OCCUPANCY_GRADIENT_ID: OccupancyGradientId = "forest";

/** @deprecated Prefer occupancyStopsFor(gradientId). */
export const OCCUPANCY_STOPS = occupancyStopsFor(DEFAULT_OCCUPANCY_GRADIENT_ID);

export function getGraveColor(id: GraveColorId | string): GraveColor {
  return (
    GRAVE_COLORS.find((color) => color.id === id) ??
    GRAVE_COLORS.find((color) => color.id === DEFAULT_GRAVE_COLOR_ID)!
  );
}

export function getGraveColorMode(
  id: GraveColorModeId | string,
): GraveColorMode {
  return (
    GRAVE_COLOR_MODES.find((mode) => mode.id === id) ??
    GRAVE_COLOR_MODES.find((mode) => mode.id === DEFAULT_GRAVE_COLOR_MODE)!
  );
}

export function getOccupancyGradient(
  id: OccupancyGradientId | string,
): OccupancyGradient {
  return (
    OCCUPANCY_GRADIENTS.find((gradient) => gradient.id === id) ??
    OCCUPANCY_GRADIENTS.find(
      (gradient) => gradient.id === DEFAULT_OCCUPANCY_GRADIENT_ID,
    )!
  );
}

export function occupancyStopsFor(
  gradientId: OccupancyGradientId | string = DEFAULT_OCCUPANCY_GRADIENT_ID,
): GraveLegendStop[] {
  const gradient = getOccupancyGradient(gradientId);
  const labels = [
    "0 empty",
    "1 burial",
    "2 burials",
    "3 burials",
    "4 burials",
    "5 burials",
  ];
  return gradient.fills.map((fill, index) => ({
    id: String(index),
    label: labels[index],
    fill,
    line: gradient.lines[index],
  }));
}

export function graveColorLegend(
  mode: GraveColorModeId | string,
  solidId: GraveColorId | string = DEFAULT_GRAVE_COLOR_ID,
  gradientId: OccupancyGradientId | string = DEFAULT_OCCUPANCY_GRADIENT_ID,
): GraveLegendStop[] {
  if (mode === "occupancy") {
    return occupancyStopsFor(gradientId);
  }
  if (mode === "status") {
    return STATUS_STOPS;
  }
  if (mode === "inspection") {
    return INSPECTION_STOPS;
  }
  const color = getGraveColor(solidId);
  return [
    { id: color.id, label: color.label, fill: color.fill, line: color.line },
  ];
}

/**
 * MapLibre paint expression for grave fill / stroke based on record fields.
 * Falls back to the solid colour when a property is missing.
 */
export function gravePaintExpression(
  mode: GraveColorModeId | string,
  channel: "fill" | "line",
  solidId: GraveColorId | string = DEFAULT_GRAVE_COLOR_ID,
  gradientId: OccupancyGradientId | string = DEFAULT_OCCUPANCY_GRADIENT_ID,
): string | ["match", ...unknown[]] {
  const solid = getGraveColor(solidId);
  const solidValue = channel === "fill" ? solid.fill : solid.line;

  if (mode === "occupancy") {
    const stops = occupancyStopsFor(gradientId).flatMap((stop) => [
      Number(stop.id),
      channel === "fill" ? stop.fill : stop.line,
    ]);
    return [
      "match",
      ["to-number", ["coalesce", ["get", "burial_count"], 0]],
      ...stops,
      solidValue,
    ];
  }

  if (mode === "status") {
    const stops = STATUS_STOPS.flatMap((stop) => [
      stop.id,
      channel === "fill" ? stop.fill : stop.line,
    ]);
    return [
      "match",
      ["coalesce", ["get", "status"], "Available"],
      ...stops,
      solidValue,
    ];
  }

  if (mode === "inspection") {
    const stops = INSPECTION_STOPS.flatMap((stop) => [
      stop.id,
      channel === "fill" ? stop.fill : stop.line,
    ]);
    return [
      "match",
      ["coalesce", ["get", "erasmus_status"], "no_monument"],
      ...stops,
      solidValue,
    ];
  }

  return solidValue;
}

/** CSS linear-gradient preview for a preset swatch. */
export function occupancyGradientCss(
  gradientId: OccupancyGradientId | string,
): string {
  const fills = getOccupancyGradient(gradientId).fills;
  return `linear-gradient(90deg, ${fills.join(", ")})`;
}
