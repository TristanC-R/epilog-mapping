import sqlite3
from pathlib import Path

path = Path(
    r"C:\Users\trist\Documents\Software Development\Gower Mapping concept\map_files\UPMINSTER Base.gpkg"
)
con = sqlite3.connect(path)
cur = con.cursor()
print("tables:", cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall())
print("contents:", cur.execute("SELECT table_name, data_type FROM gpkg_contents").fetchall())
cols = cur.execute("PRAGMA table_info(upminster_base)").fetchall()
print("columns:", cols)
names = [c[1] for c in cols if c[1] != "geom"]
sample = cur.execute(
    "SELECT " + ", ".join(f'"{n}"' for n in names) + " FROM upminster_base LIMIT 40"
).fetchall()
for row in sample:
    print(row)
print("--- distinct ---")
for name in names:
    if name == "fid":
        continue
    vals = cur.execute(
        f'SELECT "{name}", COUNT(*) FROM upminster_base GROUP BY "{name}" ORDER BY COUNT(*) DESC'
    ).fetchall()
    print(name, vals)
con.close()
