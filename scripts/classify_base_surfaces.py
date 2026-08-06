"""Heuristic surface classification for Upminster base polygons (no type field in source)."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pyogrio.raw
from pyproj import Transformer
from shapely import from_wkb
from shapely.ops import transform as shp_transform

ROOT = Path(__file__).resolve().parents[2]
GPKG = ROOT / "map_files" / "UPMINSTER Base.gpkg"
OUT = Path(__file__).resolve().parents[1] / "public" / "data" / "upminster-base.geojson"
BNG_BOUNDS = (550000, 180000, 565000, 195000)


def classify(geom) -> str:
    area = geom.area
    length = geom.length
    if area <= 0:
        return "grass"

    # Compactness: circle ~= 12.6; thin / complex outlines much higher.
    compactness = (length * length) / area
    # Effective width for ribbon-like polygons (≈ path width).
    mean_width = (2.0 * area / length) if length else 0.0
    minx, miny, maxx, maxy = geom.bounds
    width = max(maxx - minx, 1e-6)
    height = max(maxy - miny, 1e-6)
    elongation = max(width, height) / min(width, height)

    # Compact planting beds first (small, chunky — not thin ribbons).
    if area < 55 and compactness < 36 and elongation < 3.2:
        return "flower_bed"
    if area < 140 and compactness < 26 and elongation < 2.8 and mean_width >= 2.4:
        return "flower_bed"

    # Paths / hardstanding: thin effective width, including large path networks.
    if mean_width < 3.2:
        return "path"
    if mean_width < 5.5 and compactness > 40:
        return "path"
    if mean_width < 8.0 and compactness > 150:
        return "path"

    # Open lawn / grass (including lawns with cut-out beds → high perimeter).
    if area >= 70 and mean_width >= 5.5:
        return "grass"
    if area >= 200:
        return "grass"

    # Remaining small chunks.
    if area < 45:
        return "flower_bed"

    return "grass"


def main() -> None:
    meta, _fids, geometry_wkb, field_arrays = pyogrio.raw.read(
        GPKG, layer="upminster_base"
    )
    field_names = list(meta["fields"])
    to_wgs84 = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True).transform

    features = []
    counts: dict[str, int] = {}
    for index, wkb in enumerate(geometry_wkb):
        if wkb is None:
            continue
        geom = from_wkb(wkb)
        if geom is None or geom.is_empty:
            continue
        minx, miny, maxx, maxy = geom.bounds
        if not (
            BNG_BOUNDS[0] <= minx <= BNG_BOUNDS[2]
            and BNG_BOUNDS[0] <= maxx <= BNG_BOUNDS[2]
            and BNG_BOUNDS[1] <= miny <= BNG_BOUNDS[3]
            and BNG_BOUNDS[1] <= maxy <= BNG_BOUNDS[3]
        ):
            continue

        surface = classify(geom)
        counts[surface] = counts.get(surface, 0) + 1
        geom_ll = shp_transform(to_wgs84, geom)
        props = {"surface": surface, "epilog_id": str(index + 1)}
        for name_i, name in enumerate(field_names):
            value = field_arrays[name_i][index]
            if hasattr(value, "item"):
                value = value.item()
            props[name] = value
        features.append(
            {
                "type": "Feature",
                "id": str(index + 1),
                "properties": props,
                "geometry": geom_ll.__geo_interface__,
            }
        )

    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
        encoding="utf-8",
    )
    print("wrote", OUT)
    print("counts", dict(sorted(counts.items(), key=lambda item: (-item[1], item[0]))))
    # Print a few size stats per class for tuning
    by_class: dict[str, list[float]] = {}
    meta2, _a, gwkb, _b = pyogrio.raw.read(GPKG, layer="upminster_base")
    for index, wkb in enumerate(gwkb):
        if wkb is None:
            continue
        geom = from_wkb(wkb)
        if geom is None or geom.is_empty:
            continue
        surface = classify(geom)
        by_class.setdefault(surface, []).append(geom.area)
    for surface, areas in sorted(by_class.items()):
        areas.sort()
        print(
            surface,
            "n=",
            len(areas),
            "min=",
            round(areas[0], 1),
            "median=",
            round(areas[len(areas) // 2], 1),
            "max=",
            round(areas[-1], 1),
        )


if __name__ == "__main__":
    main()
