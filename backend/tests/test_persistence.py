"""Phase 3B: database-backed stores and the atomic mutation guarantee.

The JSON stores this replaced suffered a lost-update race — every mutation
rewrote the whole list, so concurrent writers clobbered each other. These tests
pin down the replacement: per-record CRUD, insertion ordering, and — the point
of the migration — that concurrent read-modify-write updates to one record do
not lose writes.
"""
from __future__ import annotations

import threading

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
