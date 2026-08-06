import { describe, expect, it } from "vitest";

import { coerceLayerAttributeValues } from "@/components/panels/GenericFeatureInspector";
import { runQualityChecks } from "@/lib/cemetery-operations";
import {
  canSafelySplitPolygon,
  listEditableVertices,
  translateFeatureGroup,
  updateVertex,
} from "@/lib/geometry-operations";
import {
  nextLayoutNumber,
  preserveGeneratedLayoutRecords,
} from "@/lib/layout-tools";
import type { CemeteryCollection, CemeteryFeature } from "@/lib/geo";
import type { GenericFeature } from "@/lib/project-model";

function polygonFeature(
  id: string,
  properties: Record<string, unknown> = {},
  x = 0,
): CemeteryFeature {
  return {
    type: "Feature",
    id,
    properties: { epilog_id: id, ...properties },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x, 0],
          [x + 0.00001, 0],
          [x + 0.00001, 0.00001],
          [x, 0.00001],
          [x, 0],
        ],
      ],
    },
  };
}

describe("audited correctness regressions", () => {
  it("edits a vertex by path without flattening multipart rings", () => {
    const feature = {
      type: "Feature",
      id: "multi",
      properties: { epilog_id: "multi" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
            [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
          ],
          [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]],
        ],
      },
    } as GenericFeature;
    const vertex = listEditableVertices(feature).find(
      (candidate) =>
        candidate.partIndex === 0 &&
        candidate.ringIndex === 1 &&
        candidate.vertexIndex === 1,
    )!;
    const result = updateVertex(feature, vertex, [2.5, 1]);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.geometry.type !== "MultiPolygon") return;
    expect(result.value.geometry.coordinates).toHaveLength(2);
    expect(result.value.geometry.coordinates[0]).toHaveLength(2);
    expect(result.value.geometry.coordinates[0][1][1]).toEqual([2.5, 1]);
    expect(result.value.geometry.coordinates[1][0][0]).toEqual([10, 10]);
  });

  it("moves a selection with one shared translation delta", () => {
    const first = polygonFeature("one", {}, 0) as GenericFeature;
    const second = polygonFeature("two", {}, 0.0001) as GenericFeature;
    const moved = translateFeatureGroup([first, second], [1, 1]);
    if (
      moved[0].geometry.type !== "Polygon" ||
      moved[1].geometry.type !== "Polygon"
    ) {
      throw new Error("Expected polygons");
    }
    const firstX = moved[0].geometry.coordinates[0][0][0];
    const secondX = moved[1].geometry.coordinates[0][0][0];
    expect(secondX - firstX).toBeCloseTo(0.0001, 10);
  });

  it("rejects destructive splits for holed and concave polygons", () => {
    const holed = {
      ...polygonFeature("holed"),
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
          [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
        ],
      },
    } as GenericFeature;
    const concave = {
      ...polygonFeature("concave"),
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [[0, 0], [4, 0], [2, 1], [4, 4], [0, 4], [0, 0]],
        ],
      },
    } as GenericFeature;
    expect(canSafelySplitPolygon(holed)).toEqual({
      ok: false,
      error: "Polygons with holes cannot yet be split safely.",
    });
    expect(canSafelySplitPolygon(concave)).toEqual({
      ok: false,
      error: "Concave polygons cannot yet be split safely.",
    });
  });

  it("preserves record identity by cds_idx and continues numbering", () => {
    const existing = [
      polygonFeature("old-0", {
        cds_id: "layout",
        cds_idx: 0,
        Grave: 40,
        GraveRef: "C~A~~40~",
        epilog_record_id: "EPL-40",
        manual_note: "keep",
      }),
      polygonFeature("old-1", {
        cds_id: "layout",
        cds_idx: 1,
        Grave: 41,
      }),
    ];
    const generated = [
      polygonFeature("new-0", { cds_id: "layout", cds_idx: 0, Grave: 50 }),
      polygonFeature("new-1", { cds_id: "layout", cds_idx: 1, Grave: 51 }),
    ];
    const preserved = preserveGeneratedLayoutRecords(existing, generated);
    expect(preserved[0].id).toBe("old-0");
    expect(preserved[0].properties.epilog_record_id).toBe("EPL-40");
    expect(preserved[0].properties.manual_note).toBe("keep");
    expect(preserved[0].properties.Grave).toBe(50);
    expect(nextLayoutNumber(existing, "layout", "Grave", 1)).toBe(42);
  });

  it("does not merge ambiguous cemetery identity tuples", () => {
    const collection: CemeteryCollection = {
      type: "FeatureCollection",
      features: [
        polygonFeature("one", {
          Cem: "C",
          Sect: "A",
          Grave: "12",
          SubGrave: "3",
        }),
        polygonFeature("two", {
          Cem: "C",
          Sect: "A",
          Grave: "1",
          SubGrave: "23",
        }, 0.001),
      ],
    };
    expect(
      runQualityChecks(collection).filter(
        (issue) => issue.type === "duplicate-number",
      ),
    ).toHaveLength(0);
  });

  it("coerces declared generic attributes to their native values", () => {
    const layer = {
      fields: [
        { name: "count", type: "number" as const },
        { name: "active", type: "boolean" as const },
        { name: "visited", type: "date" as const },
      ],
    };
    expect(
      coerceLayerAttributeValues(layer, {
        count: "12.5",
        active: "true",
        visited: "2026-07-26",
        note: "unchanged",
      }),
    ).toEqual({
      count: 12.5,
      active: true,
      visited: "2026-07-26",
      note: "unchanged",
    });
  });
});
