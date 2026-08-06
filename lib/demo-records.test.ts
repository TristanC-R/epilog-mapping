import { describe, expect, it } from "vitest";

import {
  attachDemoRecordsToGraves,
  demoCloudRecordForGrave,
} from "@/lib/demo-records";

describe("demo cloud records", () => {
  it("is deterministic for a given grave id", () => {
    expect(demoCloudRecordForGrave("grave-42")).toEqual(
      demoCloudRecordForGrave("grave-42"),
    );
  });

  it("keeps 0–5 interments and owners only for the latest burial", () => {
    for (let index = 0; index < 40; index += 1) {
      const record = demoCloudRecordForGrave(`sample-${index}`);
      expect(record.interments.length).toBeGreaterThanOrEqual(0);
      expect(record.interments.length).toBeLessThanOrEqual(5);

      if (record.interments.length === 0) {
        expect(record.owner).toBeNull();
        expect(["Available", "Reserved"]).toContain(record.status);
      } else {
        expect(record.status).toBe("Occupied");
        expect(record.owner).not.toBeNull();
        expect(record.owner?.relatedIntermentId).toBe(
          record.interments[record.interments.length - 1].id,
        );
        expect(record.owner?.email).toMatch(
          /^[a-z.]+\d{1,2}@(example\.com|mail\.test|epilog-demo\.local|outlook\.test|gmail\.test)$/,
        );
        const dates = record.interments.map((person) => person.burialDate);
        expect(dates).toEqual([...dates].sort());
      }
    }
  });

  it("stamps lightweight cloud fields onto unmarked graves", () => {
    const [feature] = attachDemoRecordsToGraves([
      {
        id: "abc",
        properties: { Sect: "A", Grave: 12 } as Record<string, unknown>,
      },
    ]);
    expect(feature.properties.epilog_record_id).toMatch(/^EPL-UPM-/);
    expect(feature.properties.status).toBeTruthy();
    expect(typeof feature.properties.burial_count).toBe("number");
  });
});
