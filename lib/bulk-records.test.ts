import { describe, expect, it } from "vitest";

import {
  gravesRecordsCsv,
  ownerEmailsForGraves,
} from "@/lib/bulk-records";
import { demoCloudRecordForGrave } from "@/lib/demo-records";

const feature = {
  id: "grave-export-1",
  properties: {
    epilog_id: "grave-export-1",
    Sect: "A",
    Grave: 12,
    GraveRef: "A-12",
    status: "Occupied",
    burial_count: 2,
    epilog_record_id: "EPL-TEST",
  },
};

describe("bulk records export", () => {
  it("exports memorial, deceased, and owner columns by default", () => {
    const csv = gravesRecordsCsv([feature]);
    const header = csv.split("\n")[0];
    expect(header).toContain("Sect");
    expect(header).toContain("deceased_1_forename");
    expect(header).toContain("owner_email");
    expect(csv).toContain("A-12");
  });

  it("exports only selected sections", () => {
    const ownerOnly = gravesRecordsCsv([feature], {
      memorial: false,
      deceased: false,
      owner: true,
    });
    const header = ownerOnly.split("\n")[0].split(",");
    expect(header[0]).toBe("GraveRef");
    expect(header).toContain("owner_email");
    expect(header).not.toContain("Sect");
    expect(header).not.toContain("deceased_1_forename");
    expect(ownerOnly.split("\n")[1]?.startsWith("A-12,")).toBe(true);
  });

  it("keeps GraveRef first when memorial is omitted", () => {
    const csv = gravesRecordsCsv([feature], {
      memorial: false,
      deceased: true,
      owner: false,
    });
    expect(csv.split("\n")[0].startsWith("GraveRef,")).toBe(true);
  });

  it("collects unique owner emails", () => {
    const ids = ["sample-1", "sample-2", "sample-3", "sample-4", "sample-5"];
    const features = ids.map((id) => ({
      id,
      properties: { epilog_id: id },
    }));
    const emails = ownerEmailsForGraves(features);
    const expected = new Set(
      features
        .map((item) => demoCloudRecordForGrave(item.id).owner?.email)
        .filter((email): email is string => Boolean(email))
        .map((email) => email.toLowerCase()),
    );
    expect(emails.length).toBe(expected.size);
    for (const email of emails) {
      expect(expected.has(email)).toBe(true);
      expect(email).toContain("@");
    }
  });
});
