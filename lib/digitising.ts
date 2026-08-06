import { bngToLngLat, lngLatToBng, type BngPoint, type LngLat } from "@/lib/crs";
import { featureCentroid, type CemeteryFeature } from "@/lib/geo";

const TAU = Math.PI * 2;

function toBng(ring: LngLat[]): BngPoint[] {
  return ring.map(([lng, lat]) => lngLatToBng(lng, lat));
}

function toLngLat(ring: BngPoint[]): LngLat[] {
  return ring.map(([x, y]) => bngToLngLat(x, y));
}

function closeRing(ring: LngLat[]): LngLat[] {
  if (ring.length < 3) {
    return ring;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

/**
 * Axis-aligned in British National Grid metres, optionally rotated, so the
 * result is a true rectangle on the ground rather than in screen space.
 */
export function rectangleRing(
  corner: LngLat,
  opposite: LngLat,
  bearingDegrees = 0,
): LngLat[] {
  const [ax, ay] = lngLatToBng(corner[0], corner[1]);
  const [bx, by] = lngLatToBng(opposite[0], opposite[1]);
  const centreX = (ax + bx) / 2;
  const centreY = (ay + by) / 2;
  const angle = (bearingDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Measure the drag in the rotated frame so the box tracks the cursor.
  const dx = bx - ax;
  const dy = by - ay;
  const halfAlong = Math.abs(dx * cos + dy * sin) / 2;
  const halfAcross = Math.abs(-dx * sin + dy * cos) / 2;

  const corners: BngPoint[] = [
    [-halfAlong, -halfAcross],
    [halfAlong, -halfAcross],
    [halfAlong, halfAcross],
    [-halfAlong, halfAcross],
  ].map(([x, y]) => [
    centreX + x * cos - y * sin,
    centreY + x * sin + y * cos,
  ]);

  return closeRing(toLngLat(corners));
}

export function circleRing(
  centre: LngLat,
  edge: LngLat,
  segments = 48,
): LngLat[] {
  const [cx, cy] = lngLatToBng(centre[0], centre[1]);
  const [ex, ey] = lngLatToBng(edge[0], edge[1]);
  const radius = Math.hypot(ex - cx, ey - cy);
  if (radius < 0.05) {
    return [];
  }
  const points: BngPoint[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * TAU;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return closeRing(toLngLat(points));
}

function rotateRing(
  ring: LngLat[],
  centre: LngLat,
  degrees: number,
): LngLat[] {
  const [cx, cy] = lngLatToBng(centre[0], centre[1]);
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return ring.map(([lng, lat]) => {
    const [x, y] = lngLatToBng(lng, lat);
    const dx = x - cx;
    const dy = y - cy;
    return bngToLngLat(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
  });
}

export function rotateFeature(
  feature: CemeteryFeature,
  degrees: number,
  centre: LngLat = featureCentroid(feature),
): CemeteryFeature {
  return {
    ...feature,
    geometry: {
      type: "Polygon",
      coordinates: feature.geometry.coordinates.map((ring) =>
        rotateRing(ring as LngLat[], centre, degrees),
      ),
    },
  };
}

/** Signed distance of a point from the infinite line a→b, in metres. */
function sideOfLine(point: BngPoint, a: BngPoint, b: BngPoint): number {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
}

function intersectLine(
  start: BngPoint,
  end: BngPoint,
  a: BngPoint,
  b: BngPoint,
): BngPoint {
  const startSide = sideOfLine(start, a, b);
  const endSide = sideOfLine(end, a, b);
  const t = startSide / (startSide - endSide);
  return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
}

function clipToHalfPlane(
  ring: BngPoint[],
  a: BngPoint,
  b: BngPoint,
  keepPositive: boolean,
): BngPoint[] {
  const inside = (point: BngPoint) => {
    const side = sideOfLine(point, a, b);
    return keepPositive ? side >= 0 : side <= 0;
  };
  const output: BngPoint[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const previous = ring[(index + ring.length - 1) % ring.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside !== previousInside) {
      output.push(intersectLine(previous, current, a, b));
    }
    if (currentInside) {
      output.push(current);
    }
  }
  return output;
}

/**
 * Cuts a polygon with the infinite line through `from` and `to`.
 * Half-plane clipping is exact for convex plots, which covers every grave
 * shape the layout tools produce; concave base polygons are left untouched.
 */
export function splitRingByLine(
  ring: LngLat[],
  from: LngLat,
  to: LngLat,
): [LngLat[], LngLat[]] | null {
  const open = closeRing(ring).slice(0, -1);
  if (open.length < 3) {
    return null;
  }
  const bng = toBng(open);
  const a = lngLatToBng(from[0], from[1]);
  const b = lngLatToBng(to[0], to[1]);

  const sides = bng.map((point) => sideOfLine(point, a, b));
  if (!sides.some((side) => side > 1e-9) || !sides.some((side) => side < -1e-9)) {
    return null;
  }

  const left = clipToHalfPlane(bng, a, b, true);
  const right = clipToHalfPlane(bng, a, b, false);
  if (left.length < 3 || right.length < 3) {
    return null;
  }
  return [closeRing(toLngLat(left)), closeRing(toLngLat(right))];
}

/** Andrew's monotone chain, used to merge adjacent plots into one outline. */
export function convexHull(points: LngLat[]): LngLat[] {
  const bng = toBng(points);
  if (bng.length < 3) {
    return [];
  }
  const sorted = [...bng].sort(
    (left, right) => left[0] - right[0] || left[1] - right[1],
  );
  const cross = (o: BngPoint, a: BngPoint, b: BngPoint) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const build = (input: BngPoint[]) => {
    const chain: BngPoint[] = [];
    for (const point of input) {
      while (
        chain.length >= 2 &&
        cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0
      ) {
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };

  const hull = [...build(sorted), ...build([...sorted].reverse())];
  return hull.length < 3 ? [] : closeRing(toLngLat(hull));
}

/** Angle of `from`→`to` in ground degrees, anticlockwise from east. */
export function angleBetween(from: LngLat, to: LngLat): number {
  const [ax, ay] = lngLatToBng(from[0], from[1]);
  const [bx, by] = lngLatToBng(to[0], to[1]);
  return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
}

export function centreOfBounds(bounds: [LngLat, LngLat]): LngLat {
  return [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ];
}

/** Index of the ring edge within `tolerance` metres of a point, or -1. */
export function nearestEdgeIndex(
  ring: LngLat[],
  point: LngLat,
  toleranceMetres: number,
): number {
  const bng = toBng(ring);
  const [px, py] = lngLatToBng(point[0], point[1]);
  let best = -1;
  let bestDistance = toleranceMetres;
  for (let index = 0; index < bng.length; index += 1) {
    const start = bng[index];
    const end = bng[(index + 1) % bng.length];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      continue;
    }
    const t = Math.max(
      0,
      Math.min(1, ((px - start[0]) * dx + (py - start[1]) * dy) / lengthSquared),
    );
    const distance = Math.hypot(
      px - (start[0] + t * dx),
      py - (start[1] + t * dy),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

export function pathLengthMetres(points: LngLat[]): number {
  const bng = toBng(points);
  let total = 0;
  for (let index = 1; index < bng.length; index += 1) {
    total += Math.hypot(
      bng[index][0] - bng[index - 1][0],
      bng[index][1] - bng[index - 1][1],
    );
  }
  return total;
}

export function ringAreaSquareMetres(ring: LngLat[]): number {
  const bng = toBng(closeRing(ring));
  let sum = 0;
  for (let index = 0; index < bng.length - 1; index += 1) {
    sum +=
      bng[index][0] * bng[index + 1][1] - bng[index + 1][0] * bng[index][1];
  }
  return Math.abs(sum / 2);
}

export function formatDistance(metres: number): string {
  return metres >= 1000
    ? `${(metres / 1000).toFixed(3)} km`
    : `${metres.toFixed(2)} m`;
}

export function formatArea(squareMetres: number): string {
  return squareMetres >= 10_000
    ? `${(squareMetres / 10_000).toFixed(3)} ha`
    : `${squareMetres.toFixed(2)} m²`;
}

export function boundsOfFeatures(
  features: CemeteryFeature[],
): [LngLat, LngLat] | null {
  if (!features.length) {
    return null;
  }
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const feature of features) {
    for (const ring of feature.geometry.coordinates) {
      for (const [lng, lat] of ring) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
