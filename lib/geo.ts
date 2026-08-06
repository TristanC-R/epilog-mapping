import type { Feature, FeatureCollection, Polygon, Position } from "geojson";

import { normalizeSurface } from "@/lib/base-style";
import { bngToLngLat, lngLatToBng, type LngLat } from "@/lib/crs";
import type { Point } from "@/lib/grave-geometry";

/** Logical project layer id. Legacy code still uses the stable base/graves ids. */
export type EditLayer = string;

export type CemeteryFeature = Feature<Polygon, Record<string, unknown>> & {
  id: string | number;
};

export type CemeteryCollection = {
  type: "FeatureCollection";
  features: CemeteryFeature[];
};

export function emptyCollection(): CemeteryCollection {
  return { type: "FeatureCollection", features: [] };
}

export function normalizeCollection(data: FeatureCollection): CemeteryCollection {
  const features: CemeteryFeature[] = [];

  data.features.forEach((feature, index) => {
    if (!feature.geometry) {
      return;
    }
    if (feature.geometry.type === "Polygon") {
      const id = String(feature.id ?? feature.properties?.fid ?? `f-${index}`);
      const props = feature.properties ?? {};
      features.push({
        type: "Feature",
        id,
        properties: {
          ...props,
          ...("surface" in props
            ? { surface: normalizeSurface(props.surface) }
            : {}),
          epilog_id: id,
        },
        geometry: feature.geometry,
      });
      return;
    }
    if (feature.geometry.type === "MultiPolygon") {
      feature.geometry.coordinates.forEach((coords, part) => {
        const id = String(
          feature.id != null ? `${feature.id}-${part}` : `f-${index}-${part}`,
        );
        const props = feature.properties ?? {};
        features.push({
          type: "Feature",
          id,
          properties: {
            ...props,
            ...("surface" in props
              ? { surface: normalizeSurface(props.surface) }
              : {}),
            epilog_id: id,
          },
          geometry: { type: "Polygon", coordinates: coords },
        });
      });
    }
  });

  return { type: "FeatureCollection", features };
}

export function polygonFromLngLatRing(ring: LngLat[]): CemeteryFeature {
  const closed =
    ring.length &&
    (ring[0][0] !== ring[ring.length - 1][0] ||
      ring[0][1] !== ring[ring.length - 1][1])
      ? [...ring, ring[0]]
      : ring;
  const id = crypto.randomUUID();
  return {
    type: "Feature",
    id,
    properties: { epilog_id: id },
    geometry: {
      type: "Polygon",
      coordinates: [closed],
    },
  };
}

export function polygonsFromBngRings(
  rings: Point[][],
  extras: Record<string, unknown> = {},
  layoutId = crypto.randomUUID(),
): CemeteryFeature[] {
  return rings.map((ring, index) => {
    const lngLatRing = ring.map(([x, y]) => bngToLngLat(x, y));
    const id = crypto.randomUUID();
    return {
      type: "Feature",
      id,
      properties: {
        ...extras,
        epilog_id: id,
        cds_id: layoutId,
        cds_idx: index,
      },
      geometry: {
        type: "Polygon",
        coordinates: [lngLatRing],
      },
    };
  });
}

export function draftCollection(
  points: LngLat[],
  cursor: LngLat | null,
  mode: "line" | "polygon",
): FeatureCollection {
  if (points.length === 0 && !cursor) {
    return emptyCollection();
  }

  const line = cursor ? [...points, cursor] : [...points];
  const features: Feature[] = [];

  if (line.length >= 1) {
    features.push({
      type: "Feature",
      properties: { role: "vertices" },
      geometry: {
        type: "MultiPoint",
        coordinates: line,
      },
    });
  }

  if (line.length >= 2) {
    features.push({
      type: "Feature",
      properties: { role: "path" },
      geometry: {
        type: "LineString",
        coordinates: line,
      },
    });
  }

  if (mode === "polygon" && line.length >= 3) {
    const ring = [...line, line[0]];
    features.push({
      type: "Feature",
      properties: { role: "fill" },
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
    });
  }

  return { type: "FeatureCollection", features };
}

export function addFeatures(
  collection: CemeteryCollection,
  features: CemeteryFeature[],
): CemeteryCollection {
  return {
    type: "FeatureCollection",
    features: [...collection.features, ...features],
  };
}

export function removeFeatures(
  collection: CemeteryCollection,
  featureIds: Iterable<string | number>,
): CemeteryCollection {
  const ids = new Set(Array.from(featureIds, String));
  return {
    type: "FeatureCollection",
    features: collection.features.filter(
      (feature) => !ids.has(String(feature.id)),
    ),
  };
}

export function replaceFeatures(
  collection: CemeteryCollection,
  featureIds: Iterable<string | number>,
  replacements: CemeteryFeature[],
): CemeteryCollection {
  return addFeatures(removeFeatures(collection, featureIds), replacements);
}

export function duplicateFeature(
  feature: CemeteryFeature,
  offsetMetres = 0.35,
): CemeteryFeature {
  const id = crypto.randomUUID();
  const ring = feature.geometry.coordinates[0].map(([lng, lat]) => {
    const [x, y] = lngLatToBng(lng, lat);
    return bngToLngLat(x + offsetMetres, y + offsetMetres);
  });
  return {
    ...feature,
    id,
    properties: {
      ...feature.properties,
      epilog_id: id,
      cds_id: undefined,
      cds_idx: undefined,
      epilog_record_id: undefined,
    },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

export function featureCentroid(feature: CemeteryFeature): LngLat {
  const ring = feature.geometry.coordinates[0];
  const count = Math.max(1, ring.length - 1);
  let lng = 0;
  let lat = 0;
  for (let index = 0; index < count; index += 1) {
    lng += ring[index][0];
    lat += ring[index][1];
  }
  return [lng / count, lat / count];
}

export function moveFeatureTo(
  collection: CemeteryCollection,
  featureId: string | number,
  target: LngLat,
): CemeteryCollection {
  const id = String(featureId);
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => {
      if (String(feature.id) !== id) {
        return feature;
      }
      const centre = featureCentroid(feature);
      const [centreX, centreY] = lngLatToBng(centre[0], centre[1]);
      const [targetX, targetY] = lngLatToBng(target[0], target[1]);
      const dx = targetX - centreX;
      const dy = targetY - centreY;
      const coordinates = feature.geometry.coordinates.map((ring) =>
        ring.map(([lng, lat]) => {
          const [x, y] = lngLatToBng(lng, lat);
          return bngToLngLat(x + dx, y + dy);
        }),
      );
      return {
        ...feature,
        geometry: { type: "Polygon", coordinates },
      };
    }),
  };
}

export function updateFeatureGeometry(
  collection: CemeteryCollection,
  featureId: string | number,
  ring: LngLat[],
): CemeteryCollection {
  const id = String(featureId);
  const closed =
    ring.length > 0 &&
    (ring[0][0] !== ring[ring.length - 1][0] ||
      ring[0][1] !== ring[ring.length - 1][1])
      ? [...ring, ring[0]]
      : ring;
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) =>
      String(feature.id) === id
        ? {
            ...feature,
            geometry: {
              type: "Polygon",
              coordinates: [closed],
            },
          }
        : feature,
    ),
  };
}

export type NumberPattern =
  | "forward"
  | "reverse"
  | "snake"
  | "columns"
  | "column_snake";

export function orderGeneratedFeatures(
  features: CemeteryFeature[],
  pattern: NumberPattern,
): CemeteryFeature[] {
  if (pattern === "forward") {
    return features;
  }
  if (pattern === "reverse") {
    return [...features].reverse();
  }

  const records = features.map((feature) => {
    const [lng, lat] = featureCentroid(feature);
    const [x, y] = lngLatToBng(lng, lat);
    return { feature, x, y };
  });
  if (pattern === "columns") {
    return records
      .sort((left, right) => left.x - right.x || left.y - right.y)
      .map((record) => record.feature);
  }

  const byColumns = pattern === "column_snake";
  records.sort((left, right) =>
    byColumns
      ? left.x - right.x || left.y - right.y
      : left.y - right.y || left.x - right.x,
  );
  const groups: typeof records[] = [];
  const tolerance = 0.4;
  for (const record of records) {
    const primary = byColumns ? record.x : record.y;
    const group = groups.at(-1);
    const groupPrimary = group?.length
      ? byColumns
        ? group[0].x
        : group[0].y
      : null;
    if (!group || groupPrimary == null || Math.abs(primary - groupPrimary) > tolerance) {
      groups.push([record]);
    } else {
      group.push(record);
    }
  }
  return groups.flatMap((group, index) => {
    const ordered = group
      .sort((left, right) =>
        byColumns ? left.y - right.y : left.x - right.x,
      )
      .map((record) => record.feature);
    return index % 2 === 1 ? ordered.reverse() : ordered;
  });
}

export function updateFeatureProperties(
  collection: CemeteryCollection,
  featureId: string | number,
  patch: Record<string, unknown>,
): CemeteryCollection {
  const id = String(featureId);
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) =>
      String(feature.id) === id
        ? {
            ...feature,
            properties: { ...feature.properties, ...patch },
          }
        : feature,
    ),
  };
}

export function updateManyFeatureProperties(
  collection: CemeteryCollection,
  featureIds: Iterable<string | number>,
  patch: Record<string, unknown>,
): CemeteryCollection {
  const ids = new Set(Array.from(featureIds, String));
  if (!ids.size) {
    return collection;
  }
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) =>
      ids.has(String(feature.id))
        ? { ...feature, properties: { ...feature.properties, ...patch } }
        : feature,
    ),
  };
}

export function findFeature(
  collection: CemeteryCollection,
  featureId: string | number | null | undefined,
): CemeteryFeature | null {
  if (featureId == null) {
    return null;
  }
  const id = String(featureId);
  return (
    collection.features.find((feature) => String(feature.id) === id) ?? null
  );
}

export function featuresToCsv(
  features: Array<{ properties: Record<string, unknown> }>,
): string {
  const columns = Array.from(
    features.reduce((keys, feature) => {
      for (const key of Object.keys(feature.properties)) {
        if (!key.startsWith("cds_")) {
          keys.add(key);
        }
      }
      return keys;
    }, new Set<string>(["epilog_id"])),
  );
  const escape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = features.map((feature) =>
    columns.map((column) => escape(feature.properties[column])).join(","),
  );
  return [columns.join(","), ...rows].join("\n");
}

export function downloadText(
  filename: string,
  contents: string,
  type = "text/csv",
): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function segmentIntersectionT(
  a1: Position,
  a2: Position,
  b1: Position,
  b2: Position,
): number | null {
  const dax = a2[0] - a1[0];
  const day = a2[1] - a1[1];
  const dbx = b2[0] - b1[0];
  const dby = b2[1] - b1[1];
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-12) {
    return null;
  }
  const t = ((b1[0] - a1[0]) * dby - (b1[1] - a1[1]) * dbx) / denom;
  const u = ((b1[0] - a1[0]) * day - (b1[1] - a1[1]) * dax) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return null;
  }
  return t;
}

function pointInPolygon(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/** Order grave features by first intersection along a drawn path (lng/lat). */
export function orderFeaturesAlongPath(
  features: CemeteryFeature[],
  path: LngLat[],
): CemeteryFeature[] {
  if (path.length < 2) {
    return [];
  }

  type Hit = { feature: CemeteryFeature; distance: number };
  const hits: Hit[] = [];
  const seen = new Set<string | number>();

  let travelled = 0;
  for (let segment = 0; segment < path.length - 1; segment += 1) {
    const a = path[segment];
    const b = path[segment + 1];
    const segmentLength = Math.hypot(b[0] - a[0], b[1] - a[1]);

    for (const feature of features) {
      if (seen.has(feature.id)) {
        continue;
      }
      const ring = feature.geometry.coordinates[0];
      let bestT: number | null = null;

      if (pointInPolygon(a, ring)) {
        bestT = 0;
      } else {
        for (let i = 0; i < ring.length - 1; i += 1) {
          const t = segmentIntersectionT(a, b, ring[i], ring[i + 1]);
          if (t != null && (bestT == null || t < bestT)) {
            bestT = t;
          }
        }
      }

      if (bestT != null) {
        hits.push({ feature, distance: travelled + bestT * segmentLength });
        seen.add(feature.id);
      }
    }

    travelled += segmentLength;
  }

  hits.sort((left, right) => left.distance - right.distance);
  return hits.map((hit) => hit.feature);
}

export function pathToBng(points: LngLat[]): Point[] {
  return points.map(([lng, lat]) => lngLatToBng(lng, lat));
}

export function downloadGeoJson(filename: string, data: CemeteryCollection): void {
  const blob = new Blob([JSON.stringify(data)], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
