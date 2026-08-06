import type { ExpressionSpecification } from "maplibre-gl";

export type SurfaceClass = "grass" | "flower_bed" | "path" | "building";

export const SURFACE_STYLE: Record<
  SurfaceClass,
  { label: string; fill: string; line: string }
> = {
  grass: {
    label: "Grass",
    fill: "#7f9a68",
    line: "#5f7550",
  },
  flower_bed: {
    label: "Flower beds",
    fill: "#5fbf4a",
    line: "#3f8f32",
  },
  path: {
    label: "Paths",
    fill: "#9a9a9a",
    line: "#6e6e6e",
  },
  building: {
    label: "Buildings",
    fill: "#d48a96",
    line: "#a85f6d",
  },
};

export const SURFACE_ORDER: SurfaceClass[] = [
  "grass",
  "flower_bed",
  "path",
  "building",
];

/** Map legacy / unknown surface values onto the current classes. */
export function normalizeSurface(value: unknown): SurfaceClass {
  const surface = String(value ?? "grass");
  if (surface === "flower_bed" || surface === "path" || surface === "building") {
    return surface;
  }
  // "other" and anything unrecognized count as grass.
  return "grass";
}

export const BASE_FILL_COLOR: ExpressionSpecification = [
  "match",
  ["get", "surface"],
  "grass",
  SURFACE_STYLE.grass.fill,
  "flower_bed",
  SURFACE_STYLE.flower_bed.fill,
  "path",
  SURFACE_STYLE.path.fill,
  "building",
  SURFACE_STYLE.building.fill,
  "other",
  SURFACE_STYLE.grass.fill,
  SURFACE_STYLE.grass.fill,
];

export const BASE_LINE_COLOR: ExpressionSpecification = [
  "match",
  ["get", "surface"],
  "grass",
  SURFACE_STYLE.grass.line,
  "flower_bed",
  SURFACE_STYLE.flower_bed.line,
  "path",
  SURFACE_STYLE.path.line,
  "building",
  SURFACE_STYLE.building.line,
  "other",
  SURFACE_STYLE.grass.line,
  SURFACE_STYLE.grass.line,
];
