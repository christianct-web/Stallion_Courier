"""One-time import of the legacy JSON stores into the database.

Phase 3B moves the transactional collections (declarations, templates, clients,
courier manifests, declaration sheets) out of ``data/*.json`` and into the
database. This module copies any existing JSON contents into the tables the
first time it runs, then drops a marker file so it never re-imports — deleting
every row later must not resurrect the old JSON data.

Run standalone via ``python scripts/migrate_json_to_db.py``; also invoked on
application startup (see ``main.py`` lifespan) so a fresh deploy migrates itself.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .db import DATA
from .repository import (
    Repository,
    clients_repo,
    declarations_repo,
    manifests_repo,
    sheets_repo,
    templates_repo,
)

logger = logging.getLogger("stallion.backfill")

# (repository, source JSON file, human name)
_COLLECTIONS: List[Tuple[Repository, Path, str]] = [
    (declarations_repo, DATA / "declarations.json", "declarations"),
    (templates_repo, DATA / "templates.json", "templates"),
    (clients_repo, DATA / "clients.json", "clients"),
    (manifests_repo, DATA / "courier_manifests.json", "courier_manifests"),
    (sheets_repo, DATA / "declaration_sheets.json", "declaration_sheets"),
]

_MARKER_DIR = DATA / ".migrated"


def _marker(name: str) -> Path:
    return _MARKER_DIR / name


def _read_json_list(path: Path) -> List[Dict[str, Any]]:
    """Read a JSON array from ``path``.

    A missing file is an empty collection (nothing to migrate). Anything else
    that isn't a valid JSON array raises — the caller must NOT mark the
    collection migrated, so fixing the file and restarting retries the import
    instead of silently dropping the data.
    """
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8") or "[]")
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{path} is not valid JSON: {exc}") from exc
    if not isinstance(data, list):
        raise RuntimeError(f"{path} must contain a JSON array, got {type(data).__name__}")
    return data


def _write_marker(name: str, note: str) -> None:
    _MARKER_DIR.mkdir(parents=True, exist_ok=True)
    _marker(name).write_text(note + "\n", encoding="utf-8")


def migrate_collection(repo: Repository, path: Path, name: str, *, force: bool = False) -> int:
    """Import one collection. Returns the number of records imported.

    Idempotent: skips if already migrated (marker present) or the table already
    holds rows, unless ``force`` is set. Raises (without marking migrated) if the
    source JSON is invalid or any record lacks an id, so no legacy data is
    silently omitted.
    """
    if not force and _marker(name).exists():
        return 0
    if not force and repo.count() > 0:
        # Table already populated by a prior run; record the marker and move on.
        _write_marker(name, "skipped: table already populated")
        return 0

    records = _read_json_list(path)
    missing_id = [
        i for i, r in enumerate(records)
        if not (isinstance(r, dict) and str(r.get("id") or "").strip())
    ]
    if missing_id:
        # Fail loud rather than drop rows — the marker is not written, so the
        # import retries once the source is fixed.
        raise RuntimeError(
            f"{name}: {len(missing_id)} record(s) in {path} are missing an id "
            f"(indexes {missing_id[:10]}); refusing to migrate"
        )

    if records:
        repo.replace_all(records)

    # Marker is written only after a verified import (or a legitimate skip).
    _write_marker(name, f"migrated {len(records)} record(s)")
    logger.info("Migrated %d %s record(s) into the database", len(records), name)
    return len(records)


def run_backfill(*, force: bool = False) -> Dict[str, int]:
    """Migrate every collection. Safe to call on every startup (idempotent)."""
    return {
        name: migrate_collection(repo, path, name, force=force)
        for repo, path, name in _COLLECTIONS
    }
