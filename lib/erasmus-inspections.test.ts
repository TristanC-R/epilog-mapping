import { describe, expect, it } from "vitest";

import {
  enrichFeaturesWithInspectionSummaries,
  inspectionCounts,
  inspectionRecordForFeature,
  inspectionStatus,
  listInspectionSections,
} from "@/lib/erasmus-inspections";

const feature = (id: string, section = "A") => ({
  id,
  properties: {
    epilog_id: id,
    epilog_record_id: `EPL-${id}`,
    Cem: "Upminster",
    Sect: section,
    GraveRef: `${section}-${id}`,
  } as Record<string, unknown>,
});

describe("Erasmus inspections", () => {
  it("is deterministic and links to the memorial record", () => {
    const first = inspectionRecordForFeature(feature("42"));
    expect(first).toEqual(inspectionRecordForFeature(feature("42")));
    if (first) {
      expect(first.memorialRecordId).toBe("EPL-42");
      expect(first.nextDueAt.slice(0, 4)).toBe(
        String(Number(first.inspectedAt.slice(0, 4)) + 2),
      );
    }
  });

  it("applies current, due, overdue, and no-monument boundaries", () => {
    const now = new Date("2026-07-26T12:00:00Z");
    expect(inspectionStatus(null, now)).toBe("no_monument");
    expect(inspectionStatus("2025-01-01", now)).toBe("current");
    expect(inspectionStatus("2024-09-01", now)).toBe("due");
    expect(inspectionStatus("2024-07-25", now)).toBe("overdue");
  });

  it("keeps section campaigns grouped within a few days", () => {
    const now = new Date("2026-07-26T12:00:00Z");
    const dates = Array.from({ length: 20 }, (_, index) =>
      inspectionRecordForFeature(feature(`A-${index}`, "A"), now),
    )
      .filter((record): record is NonNullable<typeof record> => Boolean(record))
      .map((record) => Date.parse(record.inspectedAt));
    expect(Math.max(...dates) - Math.min(...dates)).toBeLessThanOrEqual(
      3 * 24 * 60 * 60 * 1000,
    );
  });

  it("includes due-soon sections alongside current and overdue", () => {
    const now = new Date("2026-07-26T12:00:00Z");
    const sections = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    const features = sections.flatMap((section, sectionIndex) =>
      Array.from({ length: 8 }, (_, graveIndex) =>
        feature(`${section}-${graveIndex}`, section),
      ),
    );
    const counts = inspectionCounts(features, null, now);
    expect(counts.due).toBeGreaterThan(0);
    expect(counts.current).toBeGreaterThan(0);
    expect(counts.overdue).toBeGreaterThan(0);
  });

  it("summarises sections and preserves queue flags while enriching", () => {
    const input = [
      feature("1", "B"),
      {
        ...feature("2", "A"),
        properties: {
          ...feature("2", "A").properties,
          erasmus_flagged: true,
        },
      },
    ];
    const enriched = enrichFeaturesWithInspectionSummaries(input);
    expect(listInspectionSections(enriched)).toEqual(["A", "B"]);
    expect(enriched[1].properties.erasmus_flagged).toBe(true);
    expect(typeof enriched[0].properties.erasmus_status).toBe("string");
    expect(inspectionCounts(enriched).flagged).toBeGreaterThanOrEqual(1);
  });

  it("seeds a synthetic inspection queue for due and overdue memorials", () => {
    const now = new Date("2026-07-26T12:00:00Z");
    const sections = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const features = sections.flatMap((section, sectionIndex) =>
      Array.from({ length: 20 }, (_, graveIndex) =>
        feature(`${section}-${graveIndex}`, section),
      ),
    );
    const enriched = enrichFeaturesWithInspectionSummaries(features, now);
    const counts = inspectionCounts(enriched, null, now);
    expect(counts.flagged).toBeGreaterThan(0);
    for (const item of enriched) {
      if (item.properties.erasmus_flagged === true) {
        expect(item.properties.erasmus_status).not.toBe("no_monument");
        expect(item.properties.erasmus_flagged_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
      }
    }
  });
});
