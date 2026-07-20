"""Phase 3B backfill: invalid legacy data must fail loudly, never be dropped.

The migration writes a marker so it only runs once. These tests pin down that a
corrupt or malformed source is a hard error and leaves NO marker — so fixing the
file and restarting retries the import instead of silently omitting the data.
"""
from __future__ import annotations

import json

import pytest

from app.backfill import _marker, migrate_collection
from app.repository import declarations_repo


def test_corrupt_json_raises_and_writes_no_marker(tmp_path):
    bad = tmp_path / "declarations.json"
    bad.write_text("{ not valid json", encoding="utf-8")

    with pytest.raises(RuntimeError, match="not valid JSON"):
        migrate_collection(declarations_repo, bad, "unit_corrupt", force=True)

    assert not _marker("unit_corrupt").exists()


def test_non_array_json_raises(tmp_path):
    obj = tmp_path / "declarations.json"
    obj.write_text(json.dumps({"id": "x"}), encoding="utf-8")

    with pytest.raises(RuntimeError, match="JSON array"):
        migrate_collection(declarations_repo, obj, "unit_nonarray", force=True)
    assert not _marker("unit_nonarray").exists()


def test_record_without_id_raises_and_imports_nothing(tmp_path):
    src = tmp_path / "declarations.json"
    src.write_text(json.dumps([{"id": "a"}, {"no_id": True}]), encoding="utf-8")

    with pytest.raises(RuntimeError, match="missing an id"):
        migrate_collection(declarations_repo, src, "unit_missing_id", force=True)

    # Nothing partially imported, no marker written.
    assert declarations_repo.count() == 0
    assert not _marker("unit_missing_id").exists()


def test_valid_import_writes_marker_and_is_idempotent(tmp_path):
    src = tmp_path / "declarations.json"
    src.write_text(json.dumps([{"id": "a", "n": 1}, {"id": "b", "n": 2}]), encoding="utf-8")

    imported = migrate_collection(declarations_repo, src, "unit_ok", force=True)
    assert imported == 2
    assert declarations_repo.count() == 2
    assert _marker("unit_ok").exists()

    # Second run is a no-op (marker present) — does not re-import.
    assert migrate_collection(declarations_repo, src, "unit_ok") == 0


def test_missing_source_file_is_empty_collection(tmp_path):
    missing = tmp_path / "does_not_exist.json"
    assert migrate_collection(declarations_repo, missing, "unit_missing_file", force=True) == 0
    assert _marker("unit_missing_file").exists()
