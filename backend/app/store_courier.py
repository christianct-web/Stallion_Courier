"""
Courier manifest persistence layer.

Phase 3B: manifests now live in the transactional database (see db.py /
repository.py). These functions delegate to ``manifests_repo`` so per-record
mutations are atomic and the whole-file lost-update race is gone. The record
shape is unchanged — a manifest dict with nested ``lines`` and
``officer_examination`` — stored in a JSON/JSONB column rather than normalized
tables, so no service or export code had to change.

``COURIER_FILE`` is retained only as the JSON→DB backfill source.
"""
from __future__ import annotations

from typing import Any, Dict, List

from .store import DATA

COURIER_FILE = DATA / "courier_manifests.json"
if not COURIER_FILE.exists():
    COURIER_FILE.write_text("[]", encoding="utf-8")


def load_manifests() -> List[Dict[str, Any]]:
    """Load all courier manifests from the transactional store."""
    from .repository import manifests_repo
    return manifests_repo.list()


def save_manifests(items: List[Dict[str, Any]]) -> None:
    """Persist all courier manifests (whole-list; backfill/bulk callers only)."""
    from .repository import manifests_repo
    manifests_repo.replace_all(items)
