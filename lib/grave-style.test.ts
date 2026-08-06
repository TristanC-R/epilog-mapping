import { describe, expect, it } from "vitest";

import {
  graveColorLegend,
  gravePaintExpression,
  getOccupancyGradient,
  occupancyStopsFor,
} from "@/lib/grave-style";

describe("grave colour modes", () => {
  it("builds an occupancy match expression for burial_count 0–5", () => {
    const expression = gravePaintExpression(
      "occupancy",
      "fill",
      "terracotta",
      "ocean",
    );
    expect(Array.isArray(expression)).toBe(true);
    expect(expression[0]).toBe("match");
    expect(expression).toContain(0);
    expect(expression).toContain(5);
    expect(expression).toContain(getOccupancyGradient("ocean").fills[0]);
  });

  it("exposes five occupancy gradient presets", () => {
    expect(occupancyStopsFor("forest")).toHaveLength(6);
    expect(graveColorLegend("occupancy", "terracotta", "sunset")[5].fill).toBe(
      getOccupancyGradient("sunset").fills[5],
    );
  });

  it("returns a legend for occupancy and status", () => {
    expect(graveColorLegend("occupancy")).toHaveLength(6);
    expect(graveColorLegend("status").map((stop) => stop.id)).toEqual([
      "Available",
      "Reserved",
      "Occupied",
    ]);
  });

  it("builds the Erasmus inspection legend and paint expression", () => {
    expect(graveColorLegend("inspection").map((stop) => stop.id)).toEqual([
      "current",
      "due",
      "overdue",
      "no_monument",
    ]);
    const expression = gravePaintExpression("inspection", "fill");
    expect(Array.isArray(expression)).toBe(true);
    expect(JSON.stringify(expression)).toContain("erasmus_status");
    expect(JSON.stringify(expression)).toContain("overdue");
  });
});
