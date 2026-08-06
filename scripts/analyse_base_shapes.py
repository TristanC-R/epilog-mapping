"""Print geometry metrics to retune grass vs path classification."""

from __future__ import annotations

from pathlib import Path

import pyogrio.raw
from shapely import from_wkb

GPKG = Path(
    r"C:\Users\trist\Documents\Software Development\Gower Mapping concept\map_files\UPMINSTER Base.gpkg"
)
BNG_BOUNDS = (550000, 180000, 565000, 195000)


def metrics(geom):
    area = geom.area
    length = geom.length
    compactness = (length * length) / area if area else 0
    minx, miny, maxx, maxy = geom.bounds
    width = max(maxx - minx, 1e-6)
    height = max(maxy - miny, 1e-6)
    elongation = max(width, height) / min(width, height)
    # Mean width estimate for roughly rectangular ribbons: area / centreline ~= 2*area/perimeter for thin strips
    mean_width = (2 * area / length) if length else 0
    return area, length, compactness, elongation, mean_width


def main() -> None:
    _meta, _fids, geometry_wkb, _fields = pyogrio.raw.read(
        GPKG, layer="upminster_base"
    )
    rows = []
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
        area, length, compactness, elongation, mean_width = metrics(geom)
        rows.append((index + 1, area, length, compactness, elongation, mean_width))

    rows.sort(key=lambda r: r[1], reverse=True)
    print("fid area length compactness elongation mean_width")
    for row in rows:
        print(
            f"{row[0]:4d}  {row[1]:10.1f}  {row[2]:8.1f}  {row[3]:8.1f}  {row[4]:6.2f}  {row[5]:6.2f}"
        )


if __name__ == "__main__":
    main()
