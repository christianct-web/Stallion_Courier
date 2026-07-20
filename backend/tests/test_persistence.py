"""Phase 3B: database-backed stores and the atomic mutation guarantee.

The JSON stores this replaced suffered a lost-update race — every mutation
rewrote the whole list, so concurrent writers clobbered each other. These tests
pin down the replacement: per-record CRUD, insertion ordering, and — the point
of the migration — that concurrent read-modify-write updates to one record do
not lose writes.
"""
from __future__ import annotations

import json
import threading

import pytest

from app.repository import declarations_repo


def test_insert_get_list_delete_roundtrip():
    declarations_repo.insert({"id": "d1", "status": "draft", "n": 1})
    declarations_repo.insert({"id": "d2", "status": "draft", "n": 2})

    assert declarations_repo.get("d1") == {"id": "d1", "status": "draft", "n": 1}
    assert [r["id"] for r in declarations_repo.list()] == ["d1", "d2"]  # insertion order

    assert declarations_repo.delete("d1") is True
    assert declarations_repo.get("d1") is None
    assert declarations_repo.delete("d1") is False  # already gone


def test_update_missing_returns_none():
    assert declarations_repo.update("nope", lambda r: r) is None


def test_update_is_atomic_under_concurrency():
    """Four threads each apply 50 increments to the same record.

    With the old whole-list read-modify-write, threads would read stale copies
    and overwrite each other, losing increments. The atomic per-row update must
    preserve every one: 4 * 50 == 200.
    """
    declarations_repo.insert({"id": "counter", "n": 0})

    def bump():
        for _ in range(50):
            declarations_repo.update("counter", lambda r: {**r, "n": r["n"] + 1})

    threads = [threading.Thread(target=bump) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert declarations_repo.get("counter")["n"] == 200


def test_write_flag_does_not_leak_to_pooled_reads():
    """A read reusing a connection returned by a write must begin DEFERRED.

    The SQLite write lock is opted into via a flag on ``Connection.info``, which
    is backed by the pooled DBAPI connection and survives check-in. If the flag
    isn't cleared, a later read reusing that connection would re-acquire the
    write lock. This captures the BEGIN mode of a post-write read and asserts it
    is DEFERRED, never IMMEDIATE.
    """
    from sqlalchemy import event, text

    from app.db import _IS_SQLITE, engine

    if not _IS_SQLITE:
        import pytest
        pytest.skip("BEGIN IMMEDIATE lock scoping is SQLite-specific")

    modes = []

    def _capture(conn):
        modes.append("IMMEDIATE" if conn.info.get("_stallion_write") else "DEFERRED")

    event.listen(engine, "begin", _capture)
    try:
        declarations_repo.insert({"id": "w1", "n": 1})  # a write: sets then clears the flag
        modes.clear()
        # A read that reuses the just-returned pooled connection.
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        assert modes, "read did not open a transaction"
        assert all(m == "DEFERRED" for m in modes), f"read took the write lock: {modes}"
    finally:
        event.remove(engine, "begin", _capture)


def test_upsert_creates_then_updates():
    def create():
        return {"id": "u1", "status": "draft", "hits": 1}

    def bump(row):
        return {**row, "hits": row["hits"] + 1}

    first = declarations_repo.upsert("u1", create, bump)
    assert first["hits"] == 1  # created
    second = declarations_repo.upsert("u1", create, bump)
    assert second["hits"] == 2  # updated in place
    assert declarations_repo.get("u1")["hits"] == 2


def test_upsert_same_new_id_converges_under_concurrency():
    """Many threads upserting the SAME not-yet-existent id must all succeed.

    On PostgreSQL the old SELECT ... FOR UPDATE upsert let two creators both see
    None and one insert then raised IntegrityError. The retry-based upsert must
    converge: exactly one create, the rest updates, and no error surfaces.
    (On SQLite writers serialize, so this also passes — a portable guard.)
    """
    errors = []

    def worker(i):
        try:
            declarations_repo.upsert(
                "shared",
                lambda: {"id": "shared", "hits": 1},
                lambda r: {**r, "hits": r.get("hits", 0) + 1},
            )
        except Exception as exc:  # pragma: no cover - failure path
            errors.append(repr(exc))

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(16)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, errors[:3]
    assert declarations_repo.get("shared")["hits"] == 16  # 1 create + 15 updates


def test_update_rollback_on_exception_leaves_record_unchanged():
    declarations_repo.insert({"id": "keep", "status": "draft"})

    class Boom(Exception):
        pass

    def explode(_row):
        raise Boom

    try:
        declarations_repo.update("keep", explode)
    except Boom:
        pass

    # The failed mutation must not have partially written anything.
    assert declarations_repo.get("keep") == {"id": "keep", "status": "draft"}


def test_concurrent_declaration_reviews_do_not_lose_each_other(monkeypatch):
    """Two different declarations reviewed at once both persist their result.

    Exercises the review path end-to-end through the app: with the old store a
    concurrent whole-list save could drop one record's update entirely.
    """
    from fastapi.testclient import TestClient

    monkeypatch.delenv("STALLION_ENV", raising=False)
    from app.main import app

    client = TestClient(app)
    ids = []
    for i in range(6):
        did = f"race-{i}"
        r = client.post("/declarations", json={
            "id": did, "status": "draft",
            "header": {"consigneeName": "X"}, "items": [],
            "worksheet": {"invoice_value_foreign": 100},
        })
        assert r.status_code == 200, r.text
        # draft -> pending_review so the next transition to approved is legal
        assert client.patch(f"/declarations/{did}/review",
                            json={"action": "pending_review"}).status_code == 200
        ids.append(did)

    def approve(did):
        client.patch(f"/declarations/{did}/review", json={"action": "approved"})

    threads = [threading.Thread(target=approve, args=(d,)) for d in ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    for did in ids:
        row = client.get(f"/declarations/{did}").json()
        assert row["status"] == "approved", f"{did} lost its review: {row['status']}"
