import { normalizeSurface } from "@/lib/base-style";
import { featuresOverlap } from "@/lib/cemetery-operations";
import { lngLatToBng, type LngLat } from "@/lib/crs";
import {
  orderGeneratedFeatures,
  pathToBng,
  polygonsFromBngRings,
  type CemeteryCollection,
  type CemeteryFeature,
} from "@/lib/geo";
import { gravesAlongPath, gravesInGrid } from "@/lib/grave-geometry";
import type { GridParams, RowParams } from "@/lib/tools";

export type LayoutMode = "row-count" | "row-size" | "grid";

/** `key=value` lines from the attribute preset box. */
function parseAttributePreset(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const fieldValue = line.slice(separator + 1).trim();
    if (key) {
      result[key] = fieldValue;
    }
  }
  return result;
}

/** Stored on every generated grave so a layout can be continued or rebuilt. */
export function layoutProperties(
  mode: LayoutMode,
  points: LngLat[],
  params: RowParams | GridParams,
): Record<string, unknown> {
  return {
    cds_mode: mode,
    cds_points: JSON.stringify(points),
    cds_params: JSON.stringify(params),
  };
}

/** Preserve map/cloud identity and manual attributes for regenerated cells. */
export function preserveGeneratedLayoutRecords(
  existing: readonly CemeteryFeature[],
  generated: readonly CemeteryFeature[],
): CemeteryFeature[] {
  const existingByIndex = new Map(
    existing.map((feature) => [Number(feature.properties.cds_idx), feature]),
  );
  return generated.map((feature) => {
    const previous = existingByIndex.get(Number(feature.properties.cds_idx));
    if (!previous) return feature;
    return {
      ...feature,
      id: previous.id,
      properties: {
        ...previous.properties,
        ...feature.properties,
        epilog_id: String(previous.id),
      },
    };
  });
}

/** Continue after the highest number already present in this generated layout. */
export function nextLayoutNumber(
  features: readonly CemeteryFeature[],
  layoutId: string,
  field: string,
  fallback: number,
): number {
  const values = features
    .filter((feature) => String(feature.properties.cds_id) === layoutId)
    .map((feature) => Number(feature.properties[field]))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? Math.max(...values) + 1 : fallback;
}

function excludeBaseObstacles(
  features: CemeteryFeature[],
  base: CemeteryCollection,
  enabled: boolean,
): CemeteryFeature[] {
  if (!enabled) {
    return features;
  }
  const obstacles = base.features.filter((feature) => {
    const surface = normalizeSurface(feature.properties.surface);
    return surface === "building" || surface === "flower_bed";
  });
  return features.filter(
    (feature) =>
      !obstacles.some((obstacle) => featuresOverlap(feature, obstacle)),
  );
}

function indexLayoutFeatures(
  features: CemeteryFeature[],
): CemeteryFeature[] {
  return features.map((feature, index) => ({
    ...feature,
    properties: { ...feature.properties, cds_idx: index },
  }));
}

/** Bearing of a feature's longest edge, used to align new rows to it. */
function graveBearing(feature: CemeteryFeature | null): number | null {
  if (!feature) {
    return null;
  }
  const ring = feature.geometry.coordinates[0];
  let longest = 0;
  let bearing: number | null = null;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = lngLatToBng(ring[index][0], ring[index][1]);
    const end = lngLatToBng(ring[index + 1][0], ring[index + 1][1]);
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length > longest) {
      longest = length;
      bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    }
  }
  return bearing;
}

function resolvedRowBearing(
  params: RowParams,
  selected: CemeteryFeature | null,
): number | null {
  if (params.alignment === "bearing") {
    return params.bearing;
  }
  if (params.alignment === "selected") {
    return graveBearing(selected);
  }
  return null;
}

function rowRings(
  points: LngLat[],
  params: RowParams,
  mode: "row-count" | "row-size",
  alignTo: CemeteryFeature | null,
) {
  return gravesAlongPath(pathToBng(points), {
    along: params.along,
    depth: params.depth,
    gap: params.gap,
    count: mode === "row-count" ? params.count : null,
    smoothing: params.smoothing,
    placement: params.placement,
    offset: params.offset,
    bearing: resolvedRowBearing(params, alignTo),
  });
}

type BuildOptions = {
  base: CemeteryCollection;
  layoutId?: string;
  /** Path recorded on the features, which may be longer than the drawn path. */
  storedPoints?: LngLat[];
  alignTo?: CemeteryFeature | null;
};

function finishLayout(
  features: CemeteryFeature[],
  base: CemeteryCollection,
  excludeObstacles: boolean,
  pattern: RowParams["numberPattern"],
): CemeteryFeature[] {
  return indexLayoutFeatures(
    orderGeneratedFeatures(
      excludeBaseObstacles(features, base, excludeObstacles),
      pattern,
    ),
  );
}

export function buildRowFeatures(
  points: LngLat[],
  params: RowParams,
  mode: "row-count" | "row-size",
  options: BuildOptions,
): CemeteryFeature[] {
  const rings = rowRings(points, params, mode, options.alignTo ?? null);
  const features = polygonsFromBngRings(
    rings,
    {
      Cem: "Upminster",
      ...parseAttributePreset(params.attributes),
      ...layoutProperties(mode, options.storedPoints ?? points, params),
    },
    options.layoutId,
  );
  return finishLayout(
    features,
    options.base,
    params.excludeObstacles,
    params.numberPattern,
  );
}

export function buildGridFeatures(
  points: LngLat[],
  params: GridParams,
  options: BuildOptions,
): CemeteryFeature[] {
  const bng = pathToBng(points);
  const rings = gravesInGrid([...bng, bng[0]], params);
  const features = polygonsFromBngRings(
    rings,
    {
      Cem: "Upminster",
      ...parseAttributePreset(params.attributes),
      ...layoutProperties("grid", points, params),
    },
    options.layoutId,
  );
  return finishLayout(
    features,
    options.base,
    params.excludeObstacles,
    params.numberPattern,
  );
}

/** Writes sequential numbers in place and returns the next free number. */
export function applyAutoNumbers(
  features: CemeteryFeature[],
  params: Pick<RowParams, "autoNumber" | "numberField" | "numberStart">,
): number {
  if (!params.autoNumber) {
    return params.numberStart;
  }
  features.forEach((feature, index) => {
    feature.properties[params.numberField] = params.numberStart + index;
  });
  return params.numberStart + features.length;
}
