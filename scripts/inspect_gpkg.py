import os
import sqlite3

base = r"C:\Users\trist\Documents\Software Development\Gower Mapping concept\map_files"

for name in ["UPMINSTER Base.gpkg", "UPMINSTER Graves.gpkg"]:
    path = os.path.join(base, name)
    print("===", name, "===")
    con = sqlite3.connect(path)
    cur = con.cursor()
    for row in cur.execute(
        "SELECT table_name, data_type, srs_id, min_x, min_y, max_x, max_y FROM gpkg_contents"
    ):
        print("contents:", row)
    for row in cur.execute(
        "SELECT srs_id, organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys"
    ):
        definition = (row[3] or "")[:160]
        print("srs:", row[0], row[1], row[2], definition)
    for row in cur.execute(
        "SELECT table_name, column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns"
    ):
        print("geom:", row)
    # sample attribute columns
    for (table_name,) in cur.execute(
        "SELECT table_name FROM gpkg_contents WHERE data_type = 'features'"
    ):
        cols = cur.execute(f'PRAGMA table_info("{table_name}")').fetchall()
        print("columns", table_name, [c[1] for c in cols])
        count = cur.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
        print("count", table_name, count)
    con.close()
    print()
