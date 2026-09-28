import type { StyleSpecification } from "maplibre-gl";

/** Allow zooming past native tile resolution (overzoom / enlarge tiles). */
export const MAP_MAX_ZOOM = 24;

const MAP_GLYPHS =
  "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/** Font stack served by every basemap style used here. */
export const MAP_LABEL_FONT = ["Noto Sans Regular"];

export type BasemapId = "streets" | "satellite" | "light";

export type BasemapOption = {
  id: BasemapId;
  label: string;
  style: string | StyleSpecification;
};

function rasterStyle(
  tiles: string[],
  attribution: string,
  options: { tileSize?: number; maxzoom?: number } = {},
): StyleSpecification {
  const tileSize = options.tileSize ?? 256;
  // Source maxzoom = highest zoom tiles actually exist. Beyond this, MapLibre
  // overzooms (scales) those tiles instead of requesting empty placeholders.
  const maxzoom = options.maxzoom ?? 22;

  return {
    version: 8,
    // Raster basemaps ship no fonts; borrow OpenFreeMap's so grave labels work.
    glyphs: MAP_GLYPHS,
    sources: {
      basemap: {
        type: "raster",
        tiles,
        tileSize,
        attribution,
        maxzoom,
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        minzoom: 0,
        maxzoom: MAP_MAX_ZOOM,
        paint: {
          // Smoother look when enlarging tiles past source maxzoom.
          "raster-resampling": "linear",
        },
      },
    ],
  };
}

export const BASEMAPS: readonly BasemapOption[] = [
  {
    id: "streets",
    label: "Streets",
    style: "https://tiles.openfreemap.org/styles/liberty",
  },
  {
    id: "satellite",
    label: "Satellite",
    style: rasterStyle(
      [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      // Esri World Imagery typically stops around z19; higher z returns
      // "Map data not yet available" placeholder tiles.
      { maxzoom: 19 },
    ),
  },
  {
    id: "light",
    label: "Light",
    style: rasterStyle(
      [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
      { maxzoom: 20 },
    ),
  },
] as const;

export const DEFAULT_BASEMAP_ID: BasemapId = "streets";

export function getBasemap(id: BasemapId): BasemapOption {
  return BASEMAPS.find((basemap) => basemap.id === id) ?? BASEMAPS[0];
}

/** Initial view: Upminster Cemetery (Upminster, Essex). */
export const UPMINSTER_VIEW = {
  longitude: 0.26035,
  latitude: 51.54476,
  zoom: 18,
} as const;
