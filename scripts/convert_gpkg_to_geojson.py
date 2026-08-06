"""Convert Upminster GeoPackages (EPSG:27700) to WGS84 GeoJSON for the web map."""

from __future__ import annotations

import json
from pathlib import Path

import pyogrio.raw
from pyproj import Transformer
from shapely import from_wkb
from shapely.ops import transform as shp_transform

ROOT = Path(__file__).resolve().parents[2]
MAP_FILES = ROOT / "map_files"
OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "data"

# Expected BNG envelope around Upminster cemetery (loose).
BNG_BOUNDS = (550000, 180000, 565000, 195000)

# Drop unused / empty source fields from exported GeoJSON.
DROP_FIELDS = {"Grave43"}

SOURCES = [
    ("UPMINSTER Base.gpkg", "upminster_base", "upminster-base.geojson"),
    ("UPMINSTER Graves.gpkg", "upminster_graves", "upminster-graves.geojson"),
]


def iter_coords(geometry_type: str, coordinates):
    if geometry_type == "Polygon":
        for ring in coordinates:
            for x, y in ring:
                yield x, y
    elif geometry_type == "MultiPolygon":
        for polygon in coordinates:
            for ring in polygon:
                for x, y in ring:
                    yield x, y


def convert_one(gpkg_name: str, layer: str, out_name: str) -> dict:
    path = MAP_FILES / gpkg_name
    meta, _fids, geometry_wkb, field_arrays = pyogrio.raw.read(path, layer=layer)
    field_names = list(meta["fields"])
    to_wgs84 = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True).transform

    features = []
    skipped = 0
    for index, wkb in enumerate(geometry_wkb):
        if wkb is None:
            skipped += 1
            continue
        geom = from_wkb(wkb)
        if geom is None or geom.is_empty:
            skipped += 1
            continue

        minx, miny, maxx, maxy = geom.bounds
        if not (
            BNG_BOUNDS[0] <= minx <= BNG_BOUNDS[2]
            and BNG_BOUNDS[0] <= maxx <= BNG_BOUNDS[2]
            and BNG_BOUNDS[1] <= miny <= BNG_BOUNDS[3]
            and BNG_BOUNDS[1] <= maxy <= BNG_BOUNDS[3]
        ):
            skipped += 1
            continue

        geom_ll = shp_transform(to_wgs84, geom)
        props = {}
        for name_index, name in enumerate(field_names):
            if name in DROP_FIELDS:
                continue
            value = field_arrays[name_index][index]
            if value is None:
                props[name] = None
            elif hasattr(value, "item"):
                item = value.item()
                props[name] = None if item != item else item  # NaN check
            elif isinstance(value, (str, int, float, bool)):
                props[name] = value
            else:
                text = str(value)
                props[name] = None if text == "nan" else text

        features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": geom_ll.__geo_interface__,
            }
        )

    collection = {"type": "FeatureCollection", "features": features}
    out_path = OUT_DIR / out_name
    out_path.write_text(json.dumps(collection, separators=(",", ":")), encoding="utf-8")

    xs: list[float] = []
    ys: list[float] = []
    for feature in features:
        for x, y in iter_coords(
            feature["geometry"]["type"], feature["geometry"]["coordinates"]
        ):
            xs.append(x)
            ys.append(y)

    bounds = [min(xs), min(ys), max(xs), max(ys)] if xs else None
    print(
        f"{out_name}: {len(features)} features, skipped {skipped}, "
        f"size {out_path.stat().st_size / 1_000_000:.2f} MB, bounds {bounds}"
    )
    return {"file": out_name, "count": len(features), "bounds": bounds}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = [convert_one(*source) for source in SOURCES]
    camera_bounds = next(
        (
            result["bounds"]
            for result in results
            if result["file"] == "upminster-base.geojson" and result["bounds"]
        ),
        results[-1]["bounds"],
    )
    meta_path = OUT_DIR / "upminster-meta.json"
    meta_path.write_text(
        json.dumps({"layers": results, "bounds": camera_bounds}, indent=2),
        encoding="utf-8",
    )
    print("wrote", meta_path)


if __name__ == "__main__":
    main()
