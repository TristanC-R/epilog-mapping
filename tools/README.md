# Epic Mapping tools

Web ports of Cemetery Digitising Suite concepts, plus basic edit tools.

## Current tools

| Tool | Behaviour |
|------|-----------|
| Pan | Navigate the map |
| Select | Click base/grave features; Delete removes |
| Draw grave | Click polygon vertices; Enter / double-click / right-click finishes |
| Draw base | Same for base polygons |
| Row by count | Centre-line path → exact grave count (metres, EPSG:27700) |
| Fixed-size row | Centre-line path → pack fixed-length graves |
| Grave grid | Boundary polygon → adaptive/fixed grid |
| Number graves | Path across graves → sequential field values |
| Export GeoJSON | Downloads current base + graves |

## Geometry

Digitising maths runs in **British National Grid (EPSG:27700)** metres, matching the QGIS plugin, then displays in WGS84 on MapLibre.

Core port: `lib/grave-geometry.ts` ← `cemetery_digitising_suite/grave_geometry.py`

## Not yet ported

- Continue row / regenerate layout
- Batch from centre-lines
- QC checks
- Composite GraveRef / duplicate finder
- Obstacle layers / attribute presets / live preview dialog
