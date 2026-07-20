"""Import the legacy data/*.json stores into the database (one-time).

Usage (from backend/):
    python scripts/migrate_json_to_db.py           # migrate anything not yet done
    python scripts/migrate_json_to_db.py --force   # re-import, replacing table rows

Set DATABASE_URL first to target Postgres; otherwise the local SQLite database
under backend/data is used.
"""
from __future__ import annotations

import logging
import pathlib
import sys

# Allow "python scripts/migrate_json_to_db.py" from backend/ to import the app.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.backfill import run_backfill

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    force = "--force" in sys.argv[1:]
    results = run_backfill(force=force)
    total = sum(results.values())
    for name, count in results.items():
        print(f"  {name}: {count} record(s)")
    print(f"Done. {total} record(s) imported.")
