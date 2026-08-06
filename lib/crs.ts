import proj4 from "proj4";

/** British National Grid — metre CRS used by cemetery digitising maths. */
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);

export type LngLat = [number, number];
export type BngPoint = [number, number];

export function lngLatToBng(lng: number, lat: number): BngPoint {
  const [x, y] = proj4("EPSG:4326", "EPSG:27700", [lng, lat]);
  return [x, y];
}

export function bngToLngLat(x: number, y: number): LngLat {
  const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [x, y]);
  return [lng, lat];
}