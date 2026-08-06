import type { Position } from "geojson";

import type {
  CemeteryCollection,
  CemeteryFeature,
} from "@/lib/geo";
import { lngLatToBng } from "@/lib/crs";

type QualityIssueType =
  | "invalid-geometry"
  | "missing-number"
  | "duplicate-number"
  | "sequence-gap"
  | "duplicate-reference"
  | "overlap"
  | "insufficient-gap";

export type QualityIssue = {
  id: string;
  type: QualityIssueType;
  title: string;
  detail: string;
  featureIds: Array<string | number>;
  severity: "error" | "warning";
};

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function tupleKey(...values: unknown[]): string {
  return JSON.stringify(values.map(text));
}

export function makeGraveReference(
  properties: Record<string, unknown>,
): string | null {
  const grave = text(properties.Grave);
  if (!grave || Number(grave) === 0) {
    return null;
  }
  return [
    properties.Cem,
    properties.Sect,
    properties.SubSect,
    properties.Grave,
    properties.SubGrave,
  ]
    .map(text)
    .join("~");
}

export type ReferenceResult = {
  collection: CemeteryCollection;
  /** Graves whose GraveRef value actually changed. */
  changed: number;
  /** Graves that already held the correct reference. */
  unchanged: number;
  /** Graves left without a reference because they have no grave number. */
  skipped: number;
  /** Feature ids that changed, for map highlighting. */
  changedIds: Array<string | number>;
  /** A few finished references, so the panel can show what was written. */
  samples: string[];
};

export function generateGraveReferences(
  collection: CemeteryCollection,
  featureIds?: Iterable<string | number>,
): ReferenceResult {
  const selected = featureIds ? new Set(Array.from(featureIds, String)) : null;
  const changedIds: Array<string | number> = [];
  const samples: string[] = [];
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;

  const features = collection.features.map((feature) => {
    if (selected && !selected.has(String(feature.id))) {
      return feature;
    }
    const reference = makeGraveReference(feature.properties);
    if (reference == null) {
      skipped += 1;
      return feature;
    }
    if (text(feature.properties.GraveRef) === reference) {
      unchanged += 1;
      return feature;
    }
    changed += 1;
    changedIds.push(feature.id);
    if (samples.length < 3) {
      samples.push(reference);
    }
    return {
      ...feature,
      properties: { ...feature.properties, GraveRef: reference },
    };
  });

  return {
    collection: { type: "FeatureCollection", features },
    changed,
    unchanged,
    skipped,
    changedIds,
    samples,
  };
}

export type ReferenceSummary = {
  total: number;
  withReference: number;
  missingReference: number;
  outOfDate: number;
  duplicated: number;
};

/** Drives the reference panel so the tool reports state before and after a run. */
export function summariseReferences(
  collection: CemeteryCollection,
): ReferenceSummary {
  let withReference = 0;
  let outOfDate = 0;
  for (const feature of collection.features) {
    const current = text(feature.properties.GraveRef);
    if (current) {
      withReference += 1;
    }
    const expected = makeGraveReference(feature.properties);
    if (expected != null && expected !== current) {
      outOfDate += 1;
    }
  }
  let duplicated = 0;
  for (const [, features] of duplicateReferenceGroups(collection)) {
    duplicated += features.length;
  }
  return {
    total: collection.features.length,
    withReference,
    missingReference: collection.features.length - withReference,
    outOfDate,
    duplicated,
  };
}

export function duplicateReferenceGroups(
  collection: CemeteryCollection,
): Map<string, CemeteryFeature[]> {
  const groups = new Map<string, CemeteryFeature[]>();
  for (const feature of collection.features) {
    const reference = text(feature.properties.GraveRef);
    if (!reference) {
      continue;
    }
    const group = groups.get(reference) ?? [];
    group.push(feature);
    groups.set(reference, group);
  }
  return new Map(
    Array.from(groups.entries()).filter(([, features]) => features.length > 1),
  );
}

function signedArea(ring: Position[]): number {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    sum +=
      ring[index][0] * ring[index + 1][1] -
      ring[index + 1][0] * ring[index][1];
  }
  return sum / 2;
}

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function boundsOf(feature: CemeteryFeature): Bounds {
  const ring = feature.geometry.coordinates[0] ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function boundsOverlap(left: Bounds, right: Bounds): boolean {
  return !(
    left.maxX <= right.minX ||
    right.maxX <= left.minX ||
    left.maxY <= right.minY ||
    right.maxY <= left.minY
  );
}

function orientation(a: Position, b: Position, c: Position): number {
  return (b[1] - a[1]) * (c[0] - b[0]) -
    (b[0] - a[0]) * (c[1] - b[1]);
}

function segmentsCross(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
): boolean {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return first * second < 0 && third * fourth < 0;
}

function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if (
      y > point[1] !== previousY > point[1] &&
      point[0] <
        ((previousX - x) * (point[1] - y)) /
          (previousY - y || Number.EPSILON) +
          x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function featuresOverlap(
  left: CemeteryFeature,
  right: CemeteryFeature,
): boolean {
  const leftRing = left.geometry.coordinates[0] ?? [];
  const rightRing = right.geometry.coordinates[0] ?? [];
  if (leftRing.length < 4 || rightRing.length < 4) {
    return false;
  }
  for (let leftIndex = 0; leftIndex < leftRing.length - 1; leftIndex += 1) {
    for (
      let rightIndex = 0;
      rightIndex < rightRing.length - 1;
      rightIndex += 1
    ) {
      if (
        segmentsCross(
          leftRing[leftIndex],
          leftRing[leftIndex + 1],
          rightRing[rightIndex],
          rightRing[rightIndex + 1],
        )
      ) {
        return true;
      }
    }
  }
  return (
    pointInRing(leftRing[0], rightRing) ||
    pointInRing(rightRing[0], leftRing)
  );
}

function pointSegmentDistance(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
        (dx * dx + dy * dy),
    ),
  );
  return Math.hypot(
    point[0] - (start[0] + t * dx),
    point[1] - (start[1] + t * dy),
  );
}

function polygonDistanceMetres(
  left: CemeteryFeature,
  right: CemeteryFeature,
): number {
  const leftRing = left.geometry.coordinates[0].map(([lng, lat]) =>
    lngLatToBng(lng, lat),
  );
  const rightRing = right.geometry.coordinates[0].map(([lng, lat]) =>
    lngLatToBng(lng, lat),
  );
  let minimum = Infinity;
  for (const point of leftRing) {
    for (let index = 0; index < rightRing.length - 1; index += 1) {
      minimum = Math.min(
        minimum,
        pointSegmentDistance(point, rightRing[index], rightRing[index + 1]),
      );
    }
  }
  for (const point of rightRing) {
    for (let index = 0; index < leftRing.length - 1; index += 1) {
      minimum = Math.min(
        minimum,
        pointSegmentDistance(point, leftRing[index], leftRing[index + 1]),
      );
    }
  }
  return minimum;
}

/**
 * Browser-friendly cemetery checks. A lightweight grid keeps overlap checks
 * practical for the 10k+ Upminster plots without a quadratic scan.
 */
export function runQualityChecks(
  collection: CemeteryCollection,
  minimumGapMetres = 0,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const numberGroups = new Map<string, CemeteryFeature[]>();
  const sectionNumbers = new Map<string, Map<number, CemeteryFeature>>();
  const referenceGroups = duplicateReferenceGroups(collection);
  const bounds = new Map<string | number, Bounds>();

  for (const feature of collection.features) {
    const ring = feature.geometry.coordinates[0] ?? [];
    if (ring.length < 4 || Math.abs(signedArea(ring)) < 1e-14) {
      issues.push({
        id: `invalid-${feature.id}`,
        type: "invalid-geometry",
        title: "Invalid geometry",
        detail: "This grave does not contain a valid polygon.",
        featureIds: [feature.id],
        severity: "error",
      });
    }

    const grave = text(feature.properties.Grave);
    if (!grave || Number(grave) === 0) {
      issues.push({
        id: `missing-${feature.id}`,
        type: "missing-number",
        title: "Missing grave number",
        detail: "Assign a grave number before linking a cloud record.",
        featureIds: [feature.id],
        severity: "warning",
      });
    } else {
      const cemetery = text(feature.properties.Cem);
      const section = text(feature.properties.Sect);
      const subsection = text(feature.properties.SubSect);
      const subgrave = text(feature.properties.SubGrave);
      const key = tupleKey(
        cemetery,
        section,
        subsection,
        grave,
        subgrave,
      );
      const group = numberGroups.get(key) ?? [];
      group.push(feature);
      numberGroups.set(key, group);
      const numeric = Number(grave);
      if (Number.isInteger(numeric) && numeric > 0) {
        const sequenceKey = tupleKey(cemetery, section, subsection);
        const numbers =
          sectionNumbers.get(sequenceKey) ?? new Map<number, CemeteryFeature>();
        if (!numbers.has(numeric)) {
          numbers.set(numeric, feature);
        }
        sectionNumbers.set(sequenceKey, numbers);
      }
    }
    bounds.set(feature.id, boundsOf(feature));
  }

  for (const [key, features] of numberGroups) {
    if (features.length < 2) {
      continue;
    }
    const [cemetery, section, subsection, grave, subgrave] = JSON.parse(
      key,
    ) as string[];
    const location = [cemetery, section, subsection, grave, subgrave]
      .filter(Boolean)
      .join(" · ");
    issues.push({
      id: `duplicate-number-${encodeURIComponent(key)}`,
      type: "duplicate-number",
      title: "Duplicate grave number",
      detail: `${location || grave} is used by ${features.length} plots.`,
      featureIds: features.map((feature) => feature.id),
      severity: "error",
    });
  }

  for (const [sequenceKey, numbers] of sectionNumbers) {
    const [cemetery, section, subsection] = JSON.parse(
      sequenceKey,
    ) as string[];
    const location = [cemetery, section, subsection].filter(Boolean).join(" · ");
    if (numbers.size < 2) {
      continue;
    }
    const sorted = Array.from(numbers.keys()).sort(
      (left, right) => left - right,
    );
    const missing: number[] = [];
    for (
      let number = sorted[0];
      number < sorted[sorted.length - 1] && missing.length < 100;
      number += 1
    ) {
      if (!numbers.has(number)) {
        missing.push(number);
      }
    }
    if (!missing.length) {
      continue;
    }
    // Point at the plots either side of each gap so the map can still show it.
    const neighbours = new Set<string | number>();
    for (const number of missing.slice(0, 25)) {
      for (const offset of [-1, 1]) {
        const neighbour = numbers.get(number + offset);
        if (neighbour) {
          neighbours.add(neighbour.id);
        }
      }
    }
    issues.push({
      id: `sequence-${encodeURIComponent(sequenceKey)}`,
      type: "sequence-gap",
      title: "Grave number sequence gaps",
      detail: `${location || "No section"} is missing: ${missing
        .slice(0, 25)
        .join(", ")}${missing.length > 25 ? "…" : ""}`,
      featureIds: Array.from(neighbours),
      severity: "warning",
    });
  }

  for (const [reference, features] of referenceGroups) {
    issues.push({
      id: `duplicate-reference-${reference}`,
      type: "duplicate-reference",
      title: "Duplicate grave reference",
      detail: `${reference} is used by ${features.length} plots.`,
      featureIds: features.map((feature) => feature.id),
      severity: "error",
    });
  }

  const cellSize = Math.max(0.00004, minimumGapMetres / 60_000);
  const expansion = minimumGapMetres / 60_000;
  const cells = new Map<string, CemeteryFeature[]>();
  const checked = new Set<string>();
  for (const feature of collection.features) {
    const featureBounds = bounds.get(feature.id)!;
    const minColumn = Math.floor((featureBounds.minX - expansion) / cellSize);
    const maxColumn = Math.floor((featureBounds.maxX + expansion) / cellSize);
    const minRow = Math.floor((featureBounds.minY - expansion) / cellSize);
    const maxRow = Math.floor((featureBounds.maxY + expansion) / cellSize);
    const candidates = new Map<string | number, CemeteryFeature>();
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        const key = `${column}:${row}`;
        for (const candidate of cells.get(key) ?? []) {
          candidates.set(candidate.id, candidate);
        }
      }
    }
    for (const candidate of candidates.values()) {
      const pair = [String(feature.id), String(candidate.id)].sort().join(":");
      if (checked.has(pair)) {
        continue;
      }
      checked.add(pair);
      const candidateBounds = bounds.get(candidate.id)!;
      const nearby = boundsOverlap(
        {
          minX: featureBounds.minX - expansion,
          minY: featureBounds.minY - expansion,
          maxX: featureBounds.maxX + expansion,
          maxY: featureBounds.maxY + expansion,
        },
        candidateBounds,
      );
      const overlap =
        nearby &&
        boundsOverlap(featureBounds, candidateBounds) &&
        featuresOverlap(feature, candidate);
      if (overlap) {
        issues.push({
          id: `overlap-${pair}`,
          type: "overlap",
          title: "Overlapping graves",
          detail: "Two grave polygons overlap.",
          featureIds: [candidate.id, feature.id],
          severity: "error",
        });
      } else if (nearby && minimumGapMetres > 0) {
        const distance = polygonDistanceMetres(feature, candidate);
        if (distance < minimumGapMetres) {
          issues.push({
            id: `gap-${pair}`,
            type: "insufficient-gap",
            title: "Insufficient grave gap",
            detail: `Gap is ${distance.toFixed(2)}m; minimum is ${minimumGapMetres.toFixed(2)}m.`,
            featureIds: [candidate.id, feature.id],
            severity: "warning",
          });
        }
      }
    }
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        const key = `${column}:${row}`;
        const cell = cells.get(key) ?? [];
        cell.push(feature);
        cells.set(key, cell);
      }
    }
  }

  const severityRank = { error: 0, warning: 1 } as const;
  return issues.sort(
    (left, right) => severityRank[left.severity] - severityRank[right.severity],
  );
}

/** Every grave touched by a set of issues, for the map highlight layer. */
export function issueFeatureIds(issues: QualityIssue[]): string[] {
  const ids = new Set<string>();
  for (const issue of issues) {
    for (const id of issue.featureIds) {
      ids.add(String(id));
    }
  }
  return Array.from(ids);
}

