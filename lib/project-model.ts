import type {
  Feature,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";

import { attachDemoRecordsToGraves } from "@/lib/demo-records";
import { enrichFeaturesWithInspectionSummaries } from "@/lib/erasmus-inspections";
import type { CemeteryCollection } from "@/lib/geo";

export const BASE_LAYER_ID = "base";
export const GRAVES_LAYER_ID = "graves";

export type GeometryFamily = "point" | "line" | "polygon";
export type LayerKind = "generic" | "base" | "graves";

export type GenericGeometry =
  | Point
  | MultiPoint
  | LineString
  | MultiLineString
  | Polygon
  | MultiPolygon;

export type GenericFeature = Feature<
  GenericGeometry,
  Record<string, unknown>
> & {
  id: string | number;
};

export type GenericFeatureCollection = {
  type: "FeatureCollection";
  features: GenericFeature[];
};

export type LayerStyle = {
  color: string;
  fillColor: string;
  opacity: number;
  width: number;
  radius: number;
};

export type LayerField = {
  name: string;
  label?: string;
  type?: "string" | "number" | "boolean" | "date";
};

export type MapLayer = {
  id: string;
  name: string;
  geometryFamily: GeometryFamily;
  kind: LayerKind;
  visible: boolean;
  editable: boolean;
  style: LayerStyle;
  fields: LayerField[];
  data: GenericFeatureCollection;
};

export type NewMapLayer = Omit<
  MapLayer,
  "id" | "visible" | "editable" | "fields" | "data"
> & {
  id?: string;
  visible?: boolean;
  editable?: boolean;
  fields?: LayerField[];
  data?: GenericFeatureCollection;
};

export type MapProject = {
  id: string;
  version: 2;
  layers: MapLayer[];
};

export const DEFAULT_LAYER_STYLES: Record<GeometryFamily, LayerStyle> = {
  point: {
    color: "#3f6654",
    fillColor: "#8fc5a5",
    opacity: 0.9,
    width: 2,
    radius: 6,
  },
  line: {
    color: "#3f6654",
    fillColor: "#8fc5a5",
    opacity: 0.9,
    width: 2.5,
    radius: 5,
  },
  polygon: {
    color: "#3f6654",
    fillColor: "#8fc5a5",
    opacity: 0.45,
    width: 1.2,
    radius: 5,
  },
};

const BASE_STYLE: LayerStyle = {
  color: "#5f7550",
  fillColor: "#7f9a68",
  opacity: 0.7,
  width: 1,
  radius: 5,
};

const GRAVES_STYLE: LayerStyle = {
  color: "#5c4638",
  fillColor: "#d8c0a8",
  opacity: 0.78,
  width: 1,
  radius: 5,
};

function asGenericCollection(
  collection: CemeteryCollection,
): GenericFeatureCollection {
  return collection as GenericFeatureCollection;
}

/** Build a v2 project without changing any legacy feature, property, or ID. */
export function createMapProjectFromLegacy(
  base: CemeteryCollection,
  graves: CemeteryCollection,
  id = "upminster",
): MapProject {
  return {
    id,
    version: 2,
    layers: [
      {
        id: BASE_LAYER_ID,
        name: "Cemetery base",
        geometryFamily: "polygon",
        kind: "base",
        visible: true,
        editable: true,
        style: BASE_STYLE,
        fields: [{ name: "surface", label: "Surface", type: "string" }],
        data: asGenericCollection(base),
      },
      {
        id: GRAVES_LAYER_ID,
        name: "Graves",
        geometryFamily: "polygon",
        kind: "graves",
        visible: true,
        editable: true,
        style: GRAVES_STYLE,
        fields: [],
        data: asGenericCollection({
          ...graves,
          features: enrichFeaturesWithInspectionSummaries(
            attachDemoRecordsToGraves(graves.features),
          ),
        }),
      },
    ],
  };
}

/** Ensure grave layers carry lightweight demo Cloud links for UX work. */
export function enrichProjectWithDemoRecords(project: MapProject): MapProject {
  return {
    ...project,
    layers: project.layers.map((layer) => {
      if (layer.kind !== "graves") {
        return layer;
      }
      return {
        ...layer,
        data: {
          ...layer.data,
          features: enrichFeaturesWithInspectionSummaries(
            attachDemoRecordsToGraves(layer.data.features),
          ),
        },
      };
    }),
  };
}

/** Short alias for consumers migrating legacy collection pairs. */
export const projectFromLegacy = createMapProjectFromLegacy;

export function getProjectLayer(
  project: MapProject,
  layerId: string,
): MapLayer | undefined {
  return project.layers.find((layer) => layer.id === layerId);
}

export function getLegacyCollections(project: MapProject): {
  base: CemeteryCollection;
  graves: CemeteryCollection;
} {
  const empty = (): CemeteryCollection => ({
    type: "FeatureCollection",
    features: [],
  });
  return {
    base:
      (getProjectLayer(project, BASE_LAYER_ID)?.data as CemeteryCollection) ??
      empty(),
    graves:
      (getProjectLayer(project, GRAVES_LAYER_ID)?.data as CemeteryCollection) ??
      empty(),
  };
}

export function geometryFamilyOf(
  geometry: GenericGeometry,
): GeometryFamily {
  if (geometry.type === "Point" || geometry.type === "MultiPoint") {
    return "point";
  }
  if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
    return "line";
  }
  return "polygon";
}
