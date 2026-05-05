"""
Courier manifest persistence layer.

Mirrors the pattern used by store_clients.py — a thin wrapper around the
common atomic-write/file-locking helpers in store.py.

Note: As discussed in the Phase 1 plan, the JSON file store is fine for
MVP but will need to migrate to SQLite once monthly volume passes ~100
manifests. Schema design for that migration:

    CREATE TABLE courier_manifests (
        id            TEXT PRIMARY KEY,
        manifest_no   TEXT UNIQUE NOT NULL,
        arrival_date  TEXT NOT NULL,
        exch_rate     REAL NOT NULL,
        cargo_reporter TEXT,
        notes         TEXT,
        status        TEXT NOT NULL,
        created_at    TEXT, updated_at TEXT
    );
    CREATE TABLE courier_lines (
        id            TEXT PRIMARY KEY,
        manifest_id   TEXT NOT NULL REFERENCES courier_manifests(id),
        line_no       INTEGER NOT NULL,
        hawb, shipper, importer, description, thn, ...
    );
    CREATE TABLE courier_corrections (
        id            TEXT PRIMARY KEY,
        manifest_id   TEXT NOT NULL REFERENCES courier_manifests(id),
        line_no       INTEGER,
        kind          TEXT,
        ...
    );
"""
from __future__ import annotations

from typing import Any, Dict, List

from .store import _safe_read, _safe_write, DATA

COURIER_FILE = DATA / "courier_manifests.json"
if not COURIER_FILE.exists():
    COURIER_FILE.write_text("[]", encoding="utf-8")


def load_manifests() -> List[Dict[str, Any]]:
    """Load all courier manifests from the JSON store."""
    return _safe_read(COURIER_FILE)


def save_manifests(items: List[Dict[str, Any]]) -> None:
    """Persist all courier manifests to the JSON store."""
    _safe_write(COURIER_FILE, items)
