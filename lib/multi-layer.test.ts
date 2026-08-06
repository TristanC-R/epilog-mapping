import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  addPart,
  addRing,
  createFeatureForFamily,
  deletePart,
  deleteRing,
  mergeCompatibleFeatures,
  offsetLineFeature,
  simplifyFeature,
} from "@/lib/geometry-operations";
import { emptyCollection, polygonFromLngLatRing } from "@/lib/geo";
import {
  createMapProjectFromLegacy,
  type MapLayer,
} from "@/lib/project-model";
import { loadStoredProject } from "@/lib/project-store";
import { toolCapability } from "@/lib/tool-capabilities";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("epilog-mapping");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database deletion blocked"));
  });
}

function writeLegacyRecord(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("epilog-mapping", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("projects", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("projects", "readwrite");
      const grave = polygonFromLngLatRing([
        [-0.1, 51.5],
        [-0.0999, 51.5],
        [-0.0999, 51.5001],
      ]);
      transaction.objectStore("projects").put({
        id: "upminster",
        version: 1,
        savedAt: "2026-01-01T00:00:00.000Z",
        base: emptyCollection(),
        graves: { type: "FeatureCollection", features: [grave] },
      });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

describe("multi-layer project", () => {
  beforeEach(deleteDatabase);

  it("creates ordered base and graves layers without changing features", () => {
    const grave = polygonFromLngLatRing([
      [-0.1, 51.5],
      [-0.0999, 51.5],
      [-0.0999, 51.5001],
    ]);
    const graves = { type: "FeatureCollection" as const, features: [grave] };
    const project = createMapProjectFromLegacy(emptyCollection(), graves);

    expect(project.version).toBe(2);
    expect(project.layers.map((layer) => layer.id)).toEqual(["base", "graves"]);
    expect(project.layers[1].data.features[0].id).toBe(grave.id);
    expect(project.layers[1].data.features[0].properties.epilog_record_id).toBeTruthy();
    expect(project.layers[1].data.features[0].geometry).toEqual(grave.geometry);
  });

  it("migrates a v1 IndexedDB record losslessly on read", async () => {
    await writeLegacyRecord();
    const stored = await loadStoredProject();

    expect(stored?.version).toBe(2);
    expect(stored?.layers.map((layer) => layer.id)).toEqual(["base", "graves"]);
    expect(stored?.graves.features).toHaveLength(1);
    expect(stored?.graves.features[0].properties.epilog_id).toBeTruthy();
  });
});

describe("geometry editing", () => {
  it("creates every geometry family", () => {
    expect(createFeatureForFamily("point", [[0, 0]]).ok).toBe(true);
    expect(
      createFeatureForFamily("line", [
        [0, 0],
        [1, 1],
      ]).ok,
    ).toBe(true);
    expect(
      createFeatureForFamily("polygon", [
        [0, 0],
        [1, 0],
        [1, 1],
      ]).ok,
    ).toBe(true);
  });

  it("adds and deletes polygon rings and parts", () => {
    const polygon = createFeatureForFamily("polygon", [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]);
    expect(polygon.ok).toBe(true);
    if (!polygon.ok) return;

    const withRing = addRing(polygon.value, [
      [1, 1],
      [2, 1],
      [2, 2],
    ]);
    expect(withRing.ok).toBe(true);
    if (!withRing.ok) return;
    expect(deleteRing(withRing.value, 1).ok).toBe(true);

    const multipart = addPart(polygon.value, [
      [6, 0],
      [7, 0],
      [7, 1],
    ]);
    expect(multipart.ok).toBe(true);
    if (!multipart.ok) return;
    expect(deletePart(multipart.value, 1).ok).toBe(true);
  });

  it("merges, simplifies, and offsets compatible lines", () => {
    const first = createFeatureForFamily("line", [
      [0, 0],
      [0.00001, 0.000001],
      [0.00002, 0],
    ]);
    const second = createFeatureForFamily("line", [
      [1, 1],
      [2, 2],
    ]);
    if (!first.ok || !second.ok) throw new Error("Line setup failed");

    expect(mergeCompatibleFeatures([first.value, second.value]).ok).toBe(true);
    expect(simplifyFeature(first.value, 1).ok).toBe(true);
    expect(offsetLineFeature(first.value, 2).ok).toBe(true);
  });
});

describe("tool capabilities", () => {
  const lineLayer: MapLayer = {
    id: "line",
    name: "Paths",
    geometryFamily: "line",
    kind: "generic",
    visible: true,
    editable: true,
    style: {
      color: "#000000",
      fillColor: "#000000",
      opacity: 1,
      width: 2,
      radius: 5,
    },
    fields: [],
    data: { type: "FeatureCollection", features: [] },
  };

  it("explains incompatible and non-editable tools", () => {
    expect(toolCapability("offset", lineLayer, 1).enabled).toBe(true);
    expect(toolCapability("freehand-select", lineLayer, 0).enabled).toBe(true);
    expect(toolCapability("circle-select", lineLayer, 0).enabled).toBe(true);
    expect(toolCapability("add-ring", lineLayer, 1).enabled).toBe(false);
    expect(
      toolCapability("move", { ...lineLayer, editable: false }, 1).reason,
    ).toContain("editable");
  });
});
