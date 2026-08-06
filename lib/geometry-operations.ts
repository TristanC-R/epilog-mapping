import type {
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";

import type { LngLat } from "@/lib/crs";
import type { GenericFeature, GeometryFamily } from "@/lib/project-model";

type SupportedGeometry =
  | Point
  | MultiPoint
  | LineString
  | MultiLineString
  | Polygon
  | MultiPolygon;

export type GeometryOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type EditableVertex = {
  coordinate: LngLat;
  partIndex: number;
  ringIndex: number | null;
  vertexIndex: number;
};

export type VertexPath = Pick<
  EditableVertex,
  "partIndex" | "ringIndex" | "vertexIndex"
>;

export type FeatureBounds = [southWest: LngLat, northEast: LngLat];

const EARTH_RADIUS_METRES = 6_378_137;
const EPSILON = 1e-10;

function success<T>(value: T): GeometryOperationResult<T> {
  return { ok: true, value };
}

function failure<T>(error: string): GeometryOperationResult<T> {
  return { ok: false, error };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `epilog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function asLngLat(position: Position): LngLat {
  return [position[0], position[1]];
}

function samePosition(left: Position, right: Position): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function closeRing(ring: Position[]): Position[] {
  if (!ring.length || samePosition(ring[0], ring[ring.length - 1])) {
    return ring.map((point) => [...point]);
  }
  return [...ring.map((point) => [...point]), [...ring[0]]];
}

function openRing(ring: Position[]): Position[] {
  const copy = ring.map((point) => [...point]);
  if (copy.length > 1 && samePosition(copy[0], copy[copy.length - 1])) {
    copy.pop();
  }
  return copy;
}

function isConvexRing(ring: Position[]): boolean {
  const open = openRing(ring);
  if (open.length < 3) return false;
  let sign = 0;
  for (let index = 0; index < open.length; index += 1) {
    const a = open[index];
    const b = open[(index + 1) % open.length];
    const c = open[(index + 2) % open.length];
    const cross =
      (b[0] - a[0]) * (c[1] - b[1]) -
      (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < EPSILON) continue;
    const nextSign = Math.sign(cross);
    if (sign && sign !== nextSign) return false;
    sign = nextSign;
  }
  return sign !== 0;
}

/** Guard the simple two-ring splitter from destroying holes or concave parts. */
export function canSafelySplitPolygon(
  feature: GenericFeature,
): GeometryOperationResult<true> {
  if (feature.geometry.type !== "Polygon") {
    return failure("Multipart polygons cannot yet be split safely.");
  }
  if (feature.geometry.coordinates.length !== 1) {
    return failure("Polygons with holes cannot yet be split safely.");
  }
  if (!isConvexRing(feature.geometry.coordinates[0])) {
    return failure("Concave polygons cannot yet be split safely.");
  }
  return success(true);
}

function geometryFamily(geometry: SupportedGeometry): GeometryFamily {
  switch (geometry.type) {
    case "Point":
    case "MultiPoint":
      return "point";
    case "LineString":
    case "MultiLineString":
      return "line";
    case "Polygon":
    case "MultiPolygon":
      return "polygon";
  }
}

function withGeometry(
  feature: GenericFeature,
  geometry: SupportedGeometry,
): GenericFeature {
  return { ...feature, geometry } as GenericFeature;
}

function newFeature(
  geometry: SupportedGeometry,
  properties: Record<string, unknown> = {},
): GenericFeature {
  const id = newId();
  return {
    type: "Feature",
    id,
    properties: { ...properties, epilog_id: id },
    geometry,
  } as GenericFeature;
}

function clonePosition(position: Position): Position {
  return [...position];
}

function mapPositions(
  geometry: SupportedGeometry,
  transform: (position: Position) => Position,
): SupportedGeometry {
  switch (geometry.type) {
    case "Point":
      return { type: "Point", coordinates: transform(geometry.coordinates) };
    case "MultiPoint":
      return {
        type: "MultiPoint",
        coordinates: geometry.coordinates.map(transform),
      };
    case "LineString":
      return {
        type: "LineString",
        coordinates: geometry.coordinates.map(transform),
      };
    case "MultiLineString":
      return {
        type: "MultiLineString",
        coordinates: geometry.coordinates.map((line) => line.map(transform)),
      };
    case "Polygon":
      return {
        type: "Polygon",
        coordinates: geometry.coordinates.map((ring) => ring.map(transform)),
      };
    case "MultiPolygon":
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => ring.map(transform)),
        ),
      };
  }
}

function allPositions(geometry: SupportedGeometry): Position[] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates];
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.flat();
    case "MultiPolygon":
      return geometry.coordinates.flat(2);
  }
}

function project(point: Position, origin: LngLat): [number, number] {
  const latitude = (origin[1] * Math.PI) / 180;
  return [
    ((point[0] - origin[0]) * Math.PI * EARTH_RADIUS_METRES * Math.cos(latitude)) /
      180,
    ((point[1] - origin[1]) * Math.PI * EARTH_RADIUS_METRES) / 180,
  ];
}

function unproject(
  point: [number, number],
  origin: LngLat,
  trailing: number[] = [],
): Position {
  const latitude = (origin[1] * Math.PI) / 180;
  return [
    origin[0] +
      (point[0] * 180) /
        (Math.PI * EARTH_RADIUS_METRES * Math.cos(latitude)),
    origin[1] + (point[1] * 180) / (Math.PI * EARTH_RADIUS_METRES),
    ...trailing,
  ];
}

/**
 * Creates the simplest geometry in a family that can represent `points`.
 * Multiple point-family coordinates become a MultiPoint.
 */
export function createFeatureForFamily(
  family: GeometryFamily,
  points: LngLat[],
  properties: Record<string, unknown> = {},
): GeometryOperationResult<GenericFeature> {
  if (!points.every((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))) {
    return failure("All coordinates must contain finite longitude and latitude values.");
  }
  if (family === "point") {
    if (!points.length) {
      return failure("A point feature requires at least one coordinate.");
    }
    const geometry: Point | MultiPoint =
      points.length === 1
        ? { type: "Point", coordinates: [...points[0]] }
        : {
            type: "MultiPoint",
            coordinates: points.map((point) => [...point]),
          };
    return success(newFeature(geometry, properties));
  }
  if (family === "line") {
    if (points.length < 2) {
      return failure("A line feature requires at least two coordinates.");
    }
    return success(
      newFeature(
        {
          type: "LineString",
          coordinates: points.map((point) => [...point]),
        },
        properties,
      ),
    );
  }
  if (points.length < 3) {
    return failure("A polygon feature requires at least three coordinates.");
  }
  return success(
    newFeature(
      {
        type: "Polygon",
        coordinates: [closeRing(points)],
      },
      properties,
    ),
  );
}

/** Translates in longitude/latitude coordinate units without mutating the input. */
export function translateFeature(
  feature: GenericFeature,
  delta: LngLat,
): GenericFeature;
export function translateFeature(
  feature: GenericFeature,
  deltaLongitude: number,
  deltaLatitude: number,
): GenericFeature;
export function translateFeature(
  feature: GenericFeature,
  deltaOrLongitude: LngLat | number,
  latitude = 0,
): GenericFeature {
  const [longitudeDelta, latitudeDelta] =
    typeof deltaOrLongitude === "number"
      ? [deltaOrLongitude, latitude]
      : deltaOrLongitude;
  const geometry = mapPositions(
    feature.geometry as SupportedGeometry,
    (position) => [
      position[0] + longitudeDelta,
      position[1] + latitudeDelta,
      ...position.slice(2),
    ],
  );
  return withGeometry(feature, geometry);
}

/**
 * Moves a selection as one rigid group. Every feature receives the same
 * translation delta, preserving relative spacing and multipart geometry.
 */
export function translateFeatureGroup(
  features: readonly GenericFeature[],
  targetCentre: LngLat,
): GenericFeature[] {
  const positions = features.flatMap((feature) =>
    allPositions(feature.geometry as SupportedGeometry),
  );
  if (!positions.length) return [...features];
  const longitudes = positions.map((position) => position[0]);
  const latitudes = positions.map((position) => position[1]);
  const centre: LngLat = [
    (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
  ];
  const delta: LngLat = [
    targetCentre[0] - centre[0],
    targetCentre[1] - centre[1],
  ];
  return features.map((feature) => translateFeature(feature, delta));
}

/** Rotates anticlockwise-positive map coordinates around `centre`, using local metres. */
export function rotateGenericFeature(
  feature: GenericFeature,
  degrees: number,
  centre: LngLat,
): GenericFeature {
  const angle = (degrees * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return withGeometry(
    feature,
    mapPositions(feature.geometry as SupportedGeometry, (position) => {
      const [x, y] = project(position, centre);
      return unproject(
        [x * cosine - y * sine, x * sine + y * cosine],
        centre,
        position.slice(2),
      );
    }),
  );
}

function squaredSegmentDistance(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): number {
  let x = start[0];
  let y = start[1];
  const dx = end[0] - x;
  const dy = end[1] - y;
  if (dx || dy) {
    const t =
      ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  const offsetX = point[0] - x;
  const offsetY = point[1] - y;
  return offsetX * offsetX + offsetY * offsetY;
}

function douglasPeucker(
  positions: Position[],
  toleranceMetres: number,
  closed: boolean,
): Position[] {
  const source = closed ? openRing(positions) : positions.map(clonePosition);
  if (source.length <= 2) {
    return closed ? closeRing(source) : source;
  }
  const origin = asLngLat(source[0]);
  const planar = source.map((point) => project(point, origin));
  const keep = new Uint8Array(source.length);
  keep[0] = 1;
  keep[source.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, source.length - 1]];
  const threshold = toleranceMetres * toleranceMetres;
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let farthest = threshold;
    let selected = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = squaredSegmentDistance(
        planar[index],
        planar[start],
        planar[end],
      );
      if (distance > farthest) {
        farthest = distance;
        selected = index;
      }
    }
    if (selected >= 0) {
      keep[selected] = 1;
      stack.push([start, selected], [selected, end]);
    }
  }
  let simplified = source.filter((_, index) => keep[index]);
  if (closed && simplified.length < 3) {
    simplified = source;
  }
  return closed ? closeRing(simplified) : simplified;
}

/** Douglas-Peucker simplification. Tolerance is measured in metres. */
export function simplifyFeature(
  feature: GenericFeature,
  toleranceMetres: number,
): GeometryOperationResult<GenericFeature> {
  if (!Number.isFinite(toleranceMetres) || toleranceMetres < 0) {
    return failure("Simplification tolerance must be a non-negative finite number.");
  }
  const geometry = feature.geometry as SupportedGeometry;
  switch (geometry.type) {
    case "Point":
    case "MultiPoint":
      return success(withGeometry(feature, mapPositions(geometry, clonePosition)));
    case "LineString":
      return success(
        withGeometry(feature, {
          type: "LineString",
          coordinates: douglasPeucker(
            geometry.coordinates,
            toleranceMetres,
            false,
          ),
        }),
      );
    case "MultiLineString":
      return success(
        withGeometry(feature, {
          type: "MultiLineString",
          coordinates: geometry.coordinates.map((line) =>
            douglasPeucker(line, toleranceMetres, false),
          ),
        }),
      );
    case "Polygon":
      return success(
        withGeometry(feature, {
          type: "Polygon",
          coordinates: geometry.coordinates.map((ring) =>
            douglasPeucker(ring, toleranceMetres, true),
          ),
        }),
      );
    case "MultiPolygon":
      return success(
        withGeometry(feature, {
          type: "MultiPolygon",
          coordinates: geometry.coordinates.map((polygon) =>
            polygon.map((ring) =>
              douglasPeucker(ring, toleranceMetres, true),
            ),
          ),
        }),
      );
  }
}

function offsetLine(line: Position[], distanceMetres: number): Position[] {
  if (line.length < 2) {
    return line.map(clonePosition);
  }
  const origin = asLngLat(line[0]);
  const planar = line.map((point) => project(point, origin));
  const normals: Array<[number, number]> = [];
  for (let index = 0; index < planar.length - 1; index += 1) {
    const dx = planar[index + 1][0] - planar[index][0];
    const dy = planar[index + 1][1] - planar[index][1];
    const length = Math.hypot(dx, dy);
    normals.push(length ? [-dy / length, dx / length] : [0, 0]);
  }
  return planar.map((point, index) => {
    const previous = normals[Math.max(0, index - 1)];
    const next = normals[Math.min(normals.length - 1, index)];
    let normalX = previous[0] + next[0];
    let normalY = previous[1] + next[1];
    const normalLength = Math.hypot(normalX, normalY);
    if (normalLength < EPSILON) {
      normalX = next[0];
      normalY = next[1];
    } else {
      normalX /= normalLength;
      normalY /= normalLength;
    }
    const dot = Math.max(0.25, normalX * next[0] + normalY * next[1]);
    const scale = distanceMetres / dot;
    return unproject(
      [point[0] + normalX * scale, point[1] + normalY * scale],
      origin,
      line[index].slice(2),
    );
  });
}

/** Offsets LineString/MultiLineString coordinates; positive distance is left. */
export function offsetLineFeature(
  feature: GenericFeature,
  distanceMetres: number,
): GeometryOperationResult<GenericFeature> {
  if (!Number.isFinite(distanceMetres)) {
    return failure("Offset distance must be finite.");
  }
  const geometry = feature.geometry as SupportedGeometry;
  if (geometry.type === "LineString") {
    return success(
      withGeometry(feature, {
        type: "LineString",
        coordinates: offsetLine(geometry.coordinates, distanceMetres),
      }),
    );
  }
  if (geometry.type === "MultiLineString") {
    return success(
      withGeometry(feature, {
        type: "MultiLineString",
        coordinates: geometry.coordinates.map((line) =>
          offsetLine(line, distanceMetres),
        ),
      }),
    );
  }
  return failure("Only line features can be offset.");
}

function segmentIntersection(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
): { point: Position; alongFirst: number } | null {
  const firstX = b[0] - a[0];
  const firstY = b[1] - a[1];
  const secondX = d[0] - c[0];
  const secondY = d[1] - c[1];
  const denominator = firstX * secondY - firstY * secondX;
  if (Math.abs(denominator) < EPSILON) {
    return null;
  }
  const offsetX = c[0] - a[0];
  const offsetY = c[1] - a[1];
  const t = (offsetX * secondY - offsetY * secondX) / denominator;
  const u = (offsetX * firstY - offsetY * firstX) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) {
    return null;
  }
  return {
    alongFirst: Math.max(0, Math.min(1, t)),
    point: [
      a[0] + t * firstX,
      a[1] + t * firstY,
      ...a.slice(2).map((value, index) => {
        const endValue = b[index + 2] ?? value;
        return value + t * (endValue - value);
      }),
    ],
  };
}

function splitLine(
  line: Position[],
  cutter: [LngLat, LngLat],
): Position[][] {
  const pieces: Position[][] = [];
  let current: Position[] = line.length ? [clonePosition(line[0])] : [];
  for (let index = 0; index < line.length - 1; index += 1) {
    const hit = segmentIntersection(
      line[index],
      line[index + 1],
      cutter[0],
      cutter[1],
    );
    if (
      hit &&
      hit.alongFirst > EPSILON &&
      hit.alongFirst < 1 - EPSILON
    ) {
      current.push(hit.point);
      if (current.length >= 2) {
        pieces.push(current);
      }
      current = [clonePosition(hit.point)];
    }
    current.push(clonePosition(line[index + 1]));
  }
  if (current.length >= 2) {
    pieces.push(current);
  }
  return pieces;
}

/**
 * Splits a line wherever it crosses the finite cutter segment.
 * Each returned piece is a new LineString feature.
 */
export function splitLineFeature(
  feature: GenericFeature,
  cutter: LngLat[],
): GeometryOperationResult<GenericFeature[]> {
  if (cutter.length !== 2) {
    return failure("The cutter must contain exactly two points.");
  }
  if (samePosition(cutter[0], cutter[1])) {
    return failure("The cutter must contain two distinct points.");
  }
  const geometry = feature.geometry as SupportedGeometry;
  if (geometry.type !== "LineString" && geometry.type !== "MultiLineString") {
    return failure("Only line features can be split with a cutter.");
  }
  const lines =
    geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const pieces = lines.flatMap((line) =>
    splitLine(line, [cutter[0], cutter[1]]),
  );
  if (pieces.length <= lines.length) {
    return failure("The cutter does not cross the interior of the line.");
  }
  return success(
    pieces.map((coordinates) =>
      newFeature(
        { type: "LineString", coordinates },
        { ...(feature.properties ?? {}) },
      ),
    ),
  );
}

/** Combines compatible geometries without attempting polygon union/dissolve. */
export function mergeCompatibleFeatures(
  features: GenericFeature[],
): GeometryOperationResult<GenericFeature> {
  if (!features.length) {
    return failure("Select at least one feature to merge.");
  }
  const geometries = features.map(
    (feature) => feature.geometry as SupportedGeometry,
  );
  const family = geometryFamily(geometries[0]);
  if (geometries.some((geometry) => geometryFamily(geometry) !== family)) {
    return failure("All merged features must belong to the same geometry family.");
  }
  const properties = { ...(features[0].properties ?? {}) };
  if (family === "point") {
    const coordinates: Position[] = [];
    geometries.forEach((geometry) => {
      if (geometry.type === "Point") {
        coordinates.push(geometry.coordinates);
      } else if (geometry.type === "MultiPoint") {
        coordinates.push(...geometry.coordinates);
      }
    });
    return success(newFeature({ type: "MultiPoint", coordinates }, properties));
  }
  if (family === "line") {
    const coordinates: Position[][] = [];
    geometries.forEach((geometry) => {
      if (geometry.type === "LineString") {
        coordinates.push(geometry.coordinates);
      } else if (geometry.type === "MultiLineString") {
        coordinates.push(...geometry.coordinates);
      }
    });
    return success(
      newFeature({ type: "MultiLineString", coordinates }, properties),
    );
  }
  const coordinates: Position[][][] = [];
  geometries.forEach((geometry) => {
    if (geometry.type === "Polygon") {
      coordinates.push(geometry.coordinates);
    } else if (geometry.type === "MultiPolygon") {
      coordinates.push(...geometry.coordinates);
    }
  });
  return success(newFeature({ type: "MultiPolygon", coordinates }, properties));
}

function normalisePartInput(
  coordinates: LngLat[] | LngLat[][],
): Position[][] {
  if (!coordinates.length) {
    return [];
  }
  return typeof coordinates[0][0] === "number"
    ? [coordinates as LngLat[]]
    : (coordinates as LngLat[][]);
}

/** Adds a same-family part, promoting a simple geometry to its Multi form. */
export function addPart(
  feature: GenericFeature,
  coordinates: LngLat[] | LngLat[][],
): GeometryOperationResult<GenericFeature> {
  const geometry = feature.geometry as SupportedGeometry;
  const parts = normalisePartInput(coordinates);
  if (!parts.length || !parts[0].length) {
    return failure("The new part has no coordinates.");
  }
  if (geometry.type === "Point" || geometry.type === "MultiPoint") {
    const points = parts.flat();
    const existing =
      geometry.type === "Point" ? [geometry.coordinates] : geometry.coordinates;
    return success(
      withGeometry(feature, {
        type: "MultiPoint",
        coordinates: [...existing.map(clonePosition), ...points.map(clonePosition)],
      }),
    );
  }
  if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
    const line = parts[0];
    if (line.length < 2) {
      return failure("A line part requires at least two coordinates.");
    }
    const existing =
      geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
    return success(
      withGeometry(feature, {
        type: "MultiLineString",
        coordinates: [
          ...existing.map((part) => part.map(clonePosition)),
          line.map(clonePosition),
        ],
      }),
    );
  }
  const rings = parts.map((ring) => closeRing(ring));
  if (rings[0].length < 4) {
    return failure("A polygon part requires at least three distinct coordinates.");
  }
  const existing =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return success(
    withGeometry(feature, {
      type: "MultiPolygon",
      coordinates: [
        ...existing.map((polygon) =>
          polygon.map((ring) => ring.map(clonePosition)),
        ),
        rings,
      ],
    }),
  );
}

/** Deletes a part from a Multi geometry; the final remaining part is retained. */
export function deletePart(
  feature: GenericFeature,
  partIndex: number,
): GeometryOperationResult<GenericFeature> {
  const geometry = feature.geometry as SupportedGeometry;
  if (
    geometry.type !== "MultiPoint" &&
    geometry.type !== "MultiLineString" &&
    geometry.type !== "MultiPolygon"
  ) {
    return failure("This feature does not have independently deletable parts.");
  }
  if (partIndex < 0 || partIndex >= geometry.coordinates.length) {
    return failure("Part index is outside the feature.");
  }
  if (geometry.coordinates.length <= 1) {
    return failure("Deleting the final part would create an empty geometry.");
  }
  const coordinates = geometry.coordinates.filter(
    (_, index) => index !== partIndex,
  );
  return success(
    withGeometry(feature, { ...geometry, coordinates } as SupportedGeometry),
  );
}

/** Adds a closed ring to a Polygon or to one part of a MultiPolygon. */
export function addRing(
  feature: GenericFeature,
  ring: LngLat[],
  partIndex = 0,
): GeometryOperationResult<GenericFeature> {
  const closed = closeRing(ring);
  if (closed.length < 4) {
    return failure("A ring requires at least three distinct coordinates.");
  }
  const geometry = feature.geometry as SupportedGeometry;
  if (geometry.type === "Polygon") {
    if (partIndex !== 0) {
      return failure("A Polygon has only part index 0.");
    }
    return success(
      withGeometry(feature, {
        type: "Polygon",
        coordinates: [...geometry.coordinates, closed],
      }),
    );
  }
  if (geometry.type === "MultiPolygon") {
    if (partIndex < 0 || partIndex >= geometry.coordinates.length) {
      return failure("Part index is outside the feature.");
    }
    return success(
      withGeometry(feature, {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((polygon, index) =>
          index === partIndex ? [...polygon, closed] : polygon,
        ),
      }),
    );
  }
  return failure("Only polygon features can contain rings.");
}

/** Deletes an interior ring. Exterior rings must be removed with deletePart. */
export function deleteRing(
  feature: GenericFeature,
  ringIndex: number,
  partIndex = 0,
): GeometryOperationResult<GenericFeature> {
  if (ringIndex <= 0) {
    return failure("The exterior ring cannot be deleted independently.");
  }
  const geometry = feature.geometry as SupportedGeometry;
  if (geometry.type === "Polygon") {
    if (partIndex !== 0 || ringIndex >= geometry.coordinates.length) {
      return failure("Ring index is outside the feature.");
    }
    return success(
      withGeometry(feature, {
        type: "Polygon",
        coordinates: geometry.coordinates.filter(
          (_, index) => index !== ringIndex,
        ),
      }),
    );
  }
  if (geometry.type === "MultiPolygon") {
    const polygon = geometry.coordinates[partIndex];
    if (!polygon || ringIndex >= polygon.length) {
      return failure("Ring index is outside the feature.");
    }
    return success(
      withGeometry(feature, {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((candidate, index) =>
          index === partIndex
            ? candidate.filter((_, candidateIndex) => candidateIndex !== ringIndex)
            : candidate,
        ),
      }),
    );
  }
  return failure("Only polygon features contain rings.");
}

/** Lists unique editable vertices; duplicate polygon closure points are omitted. */
export function listEditableVertices(feature: GenericFeature): EditableVertex[] {
  const geometry = feature.geometry as SupportedGeometry;
  const vertices: EditableVertex[] = [];
  const add = (
    positions: Position[],
    partIndex: number,
    ringIndex: number | null,
    closed = false,
  ) => {
    const source = closed ? openRing(positions) : positions;
    source.forEach((coordinate, vertexIndex) => {
      vertices.push({
        coordinate: asLngLat(coordinate),
        partIndex,
        ringIndex,
        vertexIndex,
      });
    });
  };
  switch (geometry.type) {
    case "Point":
      add([geometry.coordinates], 0, null);
      break;
    case "MultiPoint":
      geometry.coordinates.forEach((point, partIndex) =>
        add([point], partIndex, null),
      );
      break;
    case "LineString":
      add(geometry.coordinates, 0, null);
      break;
    case "MultiLineString":
      geometry.coordinates.forEach((line, partIndex) =>
        add(line, partIndex, null),
      );
      break;
    case "Polygon":
      geometry.coordinates.forEach((ring, ringIndex) =>
        add(ring, 0, ringIndex, true),
      );
      break;
    case "MultiPolygon":
      geometry.coordinates.forEach((polygon, partIndex) =>
        polygon.forEach((ring, ringIndex) =>
          add(ring, partIndex, ringIndex, true),
        ),
      );
      break;
  }
  return vertices;
}

function editVertex(
  feature: GenericFeature,
  path: VertexPath,
  operation: "update" | "insert" | "delete",
  coordinate?: LngLat,
): GeometryOperationResult<GenericFeature> {
  const geometry = feature.geometry as SupportedGeometry;
  let target: Position[] | null = null;
  let closed = false;
  switch (geometry.type) {
    case "Point":
      if (path.partIndex === 0 && path.vertexIndex === 0) {
        target = [geometry.coordinates];
      }
      break;
    case "MultiPoint":
      if (path.vertexIndex === 0 && geometry.coordinates[path.partIndex]) {
        target = geometry.coordinates;
        path = { ...path, vertexIndex: path.partIndex };
      }
      break;
    case "LineString":
      if (path.partIndex === 0) {
        target = geometry.coordinates;
      }
      break;
    case "MultiLineString":
      target = geometry.coordinates[path.partIndex] ?? null;
      break;
    case "Polygon":
      if (path.partIndex === 0 && path.ringIndex != null) {
        target = geometry.coordinates[path.ringIndex] ?? null;
        closed = true;
      }
      break;
    case "MultiPolygon":
      if (path.ringIndex != null) {
        target =
          geometry.coordinates[path.partIndex]?.[path.ringIndex] ?? null;
        closed = true;
      }
      break;
  }
  if (!target) {
    return failure("Vertex path is outside the feature.");
  }
  const editable = closed ? openRing(target) : target.map(clonePosition);
  if (path.vertexIndex < 0 || path.vertexIndex >= editable.length) {
    return failure("Vertex index is outside the selected part or ring.");
  }
  if (operation === "delete") {
    if (geometry.type === "Point") {
      return failure("A Point vertex cannot be deleted.");
    }
    const minimum = closed ? 3 : geometry.type === "MultiPoint" ? 1 : 2;
    if (editable.length <= minimum) {
      return failure(
        closed
          ? "A ring must retain at least three vertices."
          : "Deleting this vertex would create an invalid geometry.",
      );
    }
    editable.splice(path.vertexIndex, 1);
  } else if (!coordinate) {
    return failure("A coordinate is required for this vertex operation.");
  } else if (operation === "update") {
    editable[path.vertexIndex] = [
      coordinate[0],
      coordinate[1],
      ...editable[path.vertexIndex].slice(2),
    ];
  } else {
    if (geometry.type === "Point" || geometry.type === "MultiPoint") {
      return failure("Insertion between vertices is not defined for point features.");
    }
    editable.splice(path.vertexIndex + 1, 0, [...coordinate]);
  }
  const replacement = closed ? closeRing(editable) : editable;
  let updated: SupportedGeometry;
  switch (geometry.type) {
    case "Point":
      updated = { type: "Point", coordinates: replacement[0] };
      break;
    case "MultiPoint":
      updated = { type: "MultiPoint", coordinates: replacement };
      break;
    case "LineString":
      updated = { type: "LineString", coordinates: replacement };
      break;
    case "MultiLineString":
      updated = {
        type: "MultiLineString",
        coordinates: geometry.coordinates.map((line, index) =>
          index === path.partIndex ? replacement : line,
        ),
      };
      break;
    case "Polygon":
      updated = {
        type: "Polygon",
        coordinates: geometry.coordinates.map((ring, index) =>
          index === path.ringIndex ? replacement : ring,
        ),
      };
      break;
    case "MultiPolygon":
      updated = {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((polygon, partIndex) =>
          partIndex === path.partIndex
            ? polygon.map((ring, ringIndex) =>
                ringIndex === path.ringIndex ? replacement : ring,
              )
            : polygon,
        ),
      };
      break;
  }
  return success(withGeometry(feature, updated));
}

export function updateVertex(
  feature: GenericFeature,
  path: VertexPath,
  coordinate: LngLat,
): GeometryOperationResult<GenericFeature> {
  return editVertex(feature, path, "update", coordinate);
}

/** Inserts immediately after the referenced line/ring vertex. */
export function insertVertex(
  feature: GenericFeature,
  path: VertexPath,
  coordinate: LngLat,
): GeometryOperationResult<GenericFeature> {
  return editVertex(feature, path, "insert", coordinate);
}

export function deleteVertex(
  feature: GenericFeature,
  path: VertexPath,
): GeometryOperationResult<GenericFeature> {
  return editVertex(feature, path, "delete");
}

export function featureBounds(feature: GenericFeature): FeatureBounds | null {
  const positions = allPositions(feature.geometry as SupportedGeometry);
  if (!positions.length) {
    return null;
  }
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;
  for (const position of positions) {
    minLongitude = Math.min(minLongitude, position[0]);
    minLatitude = Math.min(minLatitude, position[1]);
    maxLongitude = Math.max(maxLongitude, position[0]);
    maxLatitude = Math.max(maxLatitude, position[1]);
  }
  return [
    [minLongitude, minLatitude],
    [maxLongitude, maxLatitude],
  ];
}

function lineCentroid(lines: Position[][]): LngLat | null {
  let weightedLongitude = 0;
  let weightedLatitude = 0;
  let totalLength = 0;
  for (const line of lines) {
    const origin = line[0] ? asLngLat(line[0]) : null;
    if (!origin) {
      continue;
    }
    for (let index = 0; index < line.length - 1; index += 1) {
      const start = project(line[index], origin);
      const end = project(line[index + 1], origin);
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      weightedLongitude +=
        ((line[index][0] + line[index + 1][0]) / 2) * length;
      weightedLatitude +=
        ((line[index][1] + line[index + 1][1]) / 2) * length;
      totalLength += length;
    }
  }
  return totalLength
    ? [weightedLongitude / totalLength, weightedLatitude / totalLength]
    : null;
}

function ringAreaCentroid(
  ring: Position[],
): { area: number; longitude: number; latitude: number } | null {
  const closed = closeRing(ring);
  let twiceArea = 0;
  let longitude = 0;
  let latitude = 0;
  for (let index = 0; index < closed.length - 1; index += 1) {
    const cross =
      closed[index][0] * closed[index + 1][1] -
      closed[index + 1][0] * closed[index][1];
    twiceArea += cross;
    longitude += (closed[index][0] + closed[index + 1][0]) * cross;
    latitude += (closed[index][1] + closed[index + 1][1]) * cross;
  }
  if (Math.abs(twiceArea) < EPSILON) {
    return null;
  }
  return {
    area: twiceArea / 2,
    longitude: longitude / (3 * twiceArea),
    latitude: latitude / (3 * twiceArea),
  };
}

function polygonCentroid(polygons: Position[][][]): LngLat | null {
  let weightedLongitude = 0;
  let weightedLatitude = 0;
  let totalArea = 0;
  for (const polygon of polygons) {
    polygon.forEach((ring, ringIndex) => {
      const result = ringAreaCentroid(ring);
      if (!result) {
        return;
      }
      const weight = ringIndex === 0 ? Math.abs(result.area) : -Math.abs(result.area);
      weightedLongitude += result.longitude * weight;
      weightedLatitude += result.latitude * weight;
      totalArea += weight;
    });
  }
  return Math.abs(totalArea) > EPSILON
    ? [weightedLongitude / totalArea, weightedLatitude / totalArea]
    : null;
}

/**
 * Returns an area-weighted polygon centroid, length-weighted line centroid,
 * or arithmetic mean for points. Empty/degenerate features return null.
 */
export function centroid(feature: GenericFeature): LngLat | null {
  const geometry = feature.geometry as SupportedGeometry;
  if (geometry.type === "Point") {
    return asLngLat(geometry.coordinates);
  }
  if (geometry.type === "MultiPoint") {
    if (!geometry.coordinates.length) {
      return null;
    }
    const sum = geometry.coordinates.reduce(
      (value, point) => [value[0] + point[0], value[1] + point[1]],
      [0, 0],
    );
    return [
      sum[0] / geometry.coordinates.length,
      sum[1] / geometry.coordinates.length,
    ];
  }
  if (geometry.type === "LineString") {
    return lineCentroid([geometry.coordinates]);
  }
  if (geometry.type === "MultiLineString") {
    return lineCentroid(geometry.coordinates);
  }
  if (geometry.type === "Polygon") {
    return polygonCentroid([geometry.coordinates]);
  }
  return polygonCentroid(geometry.coordinates);
}
