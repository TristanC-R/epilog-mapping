/**
 * Port of cemetery_digitising_suite/grave_geometry.py
 * All coordinates are planar metres (EPSG:27700).
 */

export type Point = [number, number];
type Placement = "center" | "left" | "right" | "both";

function hypot(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

function offsetPoint(point: Point, normal: Point, distance: number): Point {
  return [point[0] + normal[0] * distance, point[1] + normal[1] * distance];
}

function smoothPath(
  points: Point[],
  iterations: number,
  closed = false,
): Point[] {
  let output = [...points];
  if (
    closed &&
    output.length > 1 &&
    output[0][0] === output[output.length - 1][0] &&
    output[0][1] === output[output.length - 1][1]
  ) {
    output.pop();
  }
  if (output.length < 3 || iterations <= 0) {
    if (
      closed &&
      output.length &&
      (output[0][0] !== output[output.length - 1][0] ||
        output[0][1] !== output[output.length - 1][1])
    ) {
      output.push(output[0]);
    }
    return output;
  }

  for (let i = 0; i < iterations; i += 1) {
    if (closed) {
      const smoothed: Point[] = [];
      for (let index = 0; index < output.length; index += 1) {
        const point = output[index];
        const following = output[(index + 1) % output.length];
        smoothed.push([
          0.75 * point[0] + 0.25 * following[0],
          0.75 * point[1] + 0.25 * following[1],
        ]);
        smoothed.push([
          0.25 * point[0] + 0.75 * following[0],
          0.25 * point[1] + 0.75 * following[1],
        ]);
      }
      output = smoothed;
    } else {
      const smoothed: Point[] = [output[0]];
      for (let index = 0; index < output.length - 1; index += 1) {
        const point = output[index];
        const following = output[index + 1];
        smoothed.push([
          0.75 * point[0] + 0.25 * following[0],
          0.75 * point[1] + 0.25 * following[1],
        ]);
        smoothed.push([
          0.25 * point[0] + 0.75 * following[0],
          0.25 * point[1] + 0.75 * following[1],
        ]);
      }
      output = [output[0], ...smoothed.slice(1, -1), output[output.length - 1]];
    }
  }

  if (closed) {
    output.push(output[0]);
  }
  return output;
}

function lineLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += hypot(
      points[i + 1][0] - points[i][0],
      points[i + 1][1] - points[i][1],
    );
  }
  return total;
}

function interpolate(points: Point[], distance: number): Point {
  if (points.length === 0) {
    return [0, 0];
  }
  if (distance <= 0) {
    return points[0];
  }
  let remaining = distance;
  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    const segment = hypot(dx, dy);
    if (remaining <= segment || i === points.length - 2) {
      const t = segment === 0 ? 0 : remaining / segment;
      return [points[i][0] + dx * t, points[i][1] + dy * t];
    }
    remaining -= segment;
  }
  return points[points.length - 1];
}

function normalAt(points: Point[], distance: number, closed: boolean): Point {
  const total = lineLength(points);
  const epsilon = Math.max(total * 1e-6, 1e-7);
  const before = closed
    ? (distance - epsilon + total) % total
    : Math.max(0, distance - epsilon);
  const after = closed
    ? (distance + epsilon) % total
    : Math.min(total, distance + epsilon);
  const a = interpolate(points, before);
  const b = interpolate(points, after);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = hypot(dx, dy);
  if (length === 0) {
    return [0, 0];
  }
  return [-dy / length, dx / length];
}

export type GravesAlongPathOptions = {
  along: number;
  depth: number;
  gap?: number;
  count?: number | null;
  smoothing?: number;
  closed?: boolean;
  placement?: Placement;
  offset?: number;
  bearing?: number | null;
};

export function gravesAlongPath(
  points: Point[],
  options: GravesAlongPathOptions,
): Point[][] {
  const {
    depth,
    gap = 0,
    count = null,
    smoothing = 0,
    closed = false,
    placement = "center",
    offset = 0,
    bearing = null,
  } = options;
  let { along } = options;

  const pathPoints = smoothPath(points, smoothing, closed);
  const total = lineLength(pathPoints);
  if (total <= 0 || depth <= 0) {
    throw new Error("The row path and grave depth must be greater than zero.");
  }

  let starts: number[];
  if (count != null) {
    const gapCount = closed ? count : Math.max(0, count - 1);
    const available = total - gapCount * gap;
    if (count < 1 || available <= 0) {
      throw new Error("The path is too short for that count and gap.");
    }
    along = available / count;
    starts = Array.from({ length: count }, (_, index) => index * (along + gap));
  } else {
    if (along <= 0) {
      throw new Error("Grave length must be greater than zero.");
    }
    starts = [];
    let distance = 0;
    while (distance + along <= total + 1e-9) {
      starts.push(distance);
      distance += along + gap;
    }
  }

  const lateralRanges: Record<Placement, Array<[number, number]>> = {
    center: [[-depth / 2, depth / 2]],
    left: [[offset, offset + depth]],
    right: [[-offset - depth, -offset]],
    both: [
      [offset, offset + depth],
      [-offset - depth, -offset],
    ],
  };
  const ranges = lateralRanges[placement];

  const polygonsBySide: Point[][][] = ranges.map(() => []);
  for (const startRaw of starts) {
    let start = startRaw;
    let end = start + along;
    let centreDistance = start + along / 2;
    if (closed) {
      start %= total;
      end %= total;
      centreDistance %= total;
    }

    let pointStart: Point;
    let pointEnd: Point;
    let normalStart: Point;
    let normalEnd: Point;

    if (bearing == null) {
      pointStart = interpolate(pathPoints, start);
      pointEnd = interpolate(pathPoints, end);
      normalStart = normalAt(pathPoints, start, closed);
      normalEnd = normalAt(pathPoints, end, closed);
    } else {
      const centre = interpolate(pathPoints, centreDistance);
      const radians = (bearing * Math.PI) / 180;
      const tangent: Point = [Math.sin(radians), Math.cos(radians)];
      const fixedNormal: Point = [-tangent[1], tangent[0]];
      pointStart = offsetPoint(centre, tangent, -along / 2);
      pointEnd = offsetPoint(centre, tangent, along / 2);
      normalStart = fixedNormal;
      normalEnd = fixedNormal;
    }

    ranges.forEach(([inner, outer], sideIndex) => {
      const corners: Point[] = [
        offsetPoint(pointStart, normalStart, outer),
        offsetPoint(pointEnd, normalEnd, outer),
        offsetPoint(pointEnd, normalEnd, inner),
        offsetPoint(pointStart, normalStart, inner),
      ];
      corners.push(corners[0]);
      if (Math.abs(polygonArea(corners)) > 0) {
        polygonsBySide[sideIndex].push(corners);
      }
    });
  }

  const polygons = polygonsBySide.flat();
  const expected = count != null ? count * ranges.length : null;
  if (expected != null && polygons.length !== expected) {
    throw new Error(
      `Only ${polygons.length} of ${expected} requested graves were valid.`,
    );
  }
  return polygons;
}

function polygonArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

function longestEdgeAngle(ring: Point[]): number {
  let longest = 0;
  let angle = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const dx = ring[i + 1][0] - ring[i][0];
    const dy = ring[i + 1][1] - ring[i][1];
    const length = hypot(dx, dy);
    if (length > longest) {
      longest = length;
      angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    }
  }
  return angle;
}

function rotatePoint(point: Point, centre: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point[0] - centre[0];
  const dy = point[1] - centre[1];
  return [centre[0] + dx * cos - dy * sin, centre[1] + dx * sin + dy * cos];
}

function ringCentroid(ring: Point[]): Point {
  let x = 0;
  let y = 0;
  const n = ring.length > 1 ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i += 1) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

function pointInRing(point: Point, ring: Point[]): boolean {
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

function ringContainsRing(outer: Point[], inner: Point[]): boolean {
  return inner.slice(0, -1).every((point) => pointInRing(point, outer));
}

function gridCells(
  boundary: Point[],
  along: number,
  depth: number,
  gap: number,
  angle: number,
): Point[][] {
  if (along <= 0 || depth <= 0) {
    return [];
  }
  const centre = ringCentroid(boundary);
  const rotatedBoundary = boundary.map((point) =>
    rotatePoint(point, centre, -angle),
  );
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of rotatedBoundary) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const columns = Math.floor((width + gap) / (along + gap));
  const rows = Math.floor((height + gap) / (depth + gap));
  if (columns < 1 || rows < 1) {
    return [];
  }

  const usedWidth = columns * along + (columns - 1) * gap;
  const usedDepth = rows * depth + (rows - 1) * gap;
  const originX = minX + (width - usedWidth) / 2;
  const originY = minY + (height - usedDepth) / 2;
  const cells: Point[][] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const xMin = originX + column * (along + gap);
      const yMin = originY + row * (depth + gap);
      const corners: Point[] = [
        [xMin, yMin],
        [xMin + along, yMin],
        [xMin + along, yMin + depth],
        [xMin, yMin + depth],
        [xMin, yMin],
      ];
      if (!ringContainsRing(rotatedBoundary, corners)) {
        continue;
      }
      cells.push(corners.map((point) => rotatePoint(point, centre, angle)));
    }
  }
  return cells;
}

export type GravesInGridOptions = {
  count: number;
  along: number;
  depth: number;
  gap?: number;
  adaptive?: boolean;
  lockRatio?: boolean;
};

export function gravesInGrid(
  boundaryPoints: Point[],
  options: GravesInGridOptions,
): Point[][] {
  let { along } = options;
  const {
    count,
    depth,
    gap = 0,
    adaptive = true,
    lockRatio = true,
  } = options;

  if (lockRatio) {
    along = depth * 2;
  }

  let boundary = [...boundaryPoints];
  if (
    boundary.length &&
    (boundary[0][0] !== boundary[boundary.length - 1][0] ||
      boundary[0][1] !== boundary[boundary.length - 1][1])
  ) {
    boundary = [...boundary, boundary[0]];
  }

  if (boundary.length < 4 || count < 1 || Math.abs(polygonArea(boundary)) <= 0) {
    throw new Error("Draw a valid, non-self-intersecting grid boundary.");
  }

  const angle = longestEdgeAngle(boundary);
  if (!adaptive) {
    return gridCells(boundary, along, depth, gap, angle).slice(0, count);
  }

  const centre = ringCentroid(boundary);
  const rotated = boundary.map((point) => rotatePoint(point, centre, -angle));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of rotated) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const maximum = Math.min(
    along ? (maxX - minX) / along : 0,
    depth ? (maxY - minY) / depth : 0,
  );
  let low = 0;
  let high = maximum;
  let best: Point[][] = [];
  for (let i = 0; i < 32; i += 1) {
    const scale = (low + high) / 2;
    const cells = gridCells(boundary, along * scale, depth * scale, gap, angle);
    if (cells.length >= count) {
      best = cells;
      low = scale;
    } else {
      high = scale;
    }
  }
  if (best.length < count) {
    return [];
  }
  return best.slice(0, count);
}
