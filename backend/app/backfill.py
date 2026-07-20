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
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8") or "[]")
    except json.JSONDecodeError:
        logger.warning("Skipping %s — not valid JSON", path)
        return []
    return data if isinstance(data, list) else []


def migrate_collection(repo: Repository, path: Path, name: str, *, force: bool = False) -> int:
    """Import one collection. Returns the number of records imported.

    Idempotent: skips if already migrated (marker present) or the table already
    holds rows, unless ``force`` is set.
    """
    if not force and _marker(name).exists():
        return 0
    if not force and repo.count() > 0:
        # Table already populated by a prior run; record the marker and move on.
        _MARKER_DIR.mkdir(parents=True, exist_ok=True)
        _marker(name).write_text("skipped: table already populated\n", encoding="utf-8")
        return 0

    records = _read_json_list(path)
    usable = [r for r in records if isinstance(r, dict) and str(r.get("id") or "").strip()]
    skipped = len(records) - len(usable)
    if skipped:
        logger.warning("%s: skipped %d record(s) without an id", name, skipped)

    if usable:
        repo.replace_all(usable)

    _MARKER_DIR.mkdir(parents=True, exist_ok=True)
    _marker(name).write_text(f"migrated {len(usable)} record(s)\n", encoding="utf-8")
    logger.info("Migrated %d %s record(s) into the database", len(usable), name)
    return len(usable)


def run_backfill(*, force: bool = False) -> Dict[str, int]:
    """Migrate every collection. Safe to call on every startup (idempotent)."""
    return {
        name: migrate_collection(repo, path, name, force=force)
        for repo, path, name in _COLLECTIONS
    }
