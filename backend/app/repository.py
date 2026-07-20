"""Per-record document repository over the tables in ``db.py``.

The JSON stores this replaces suffered a lost-update race: every mutation loaded
the whole list, changed one entry, and wrote the whole list back, so two
concurrent requests would clobber each other. The repository fixes that by
performing each mutation as a single atomic transaction. ``update`` in
particular re-reads the target row inside the transaction (``SELECT ... FOR
UPDATE`` on PostgreSQL, serialized by the write transaction on SQLite), applies
the caller's mutator, and writes only that row — so concurrent edits to
different records never interfere and edits to the same record serialize.

Reads still return whole lists (ordered by insertion) to preserve the exact
semantics callers previously got from the JSON files.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from sqlalchemy import Table, delete, func, insert, select, update as sql_update
from sqlalchemy.exc import IntegrityError

from .db import (
    clients_table,
    declarations_table,
    engine,
    manifests_table,
    sheets_table,
    templates_table,
    write_transaction,
)

# A concurrent create losing the insert race, or a row deleted between a
# get() and the follow-up update(), is retried this many times before giving up.
_UPSERT_RETRIES = 5

Record = Dict[str, Any]
Mutator = Callable[[Record], Record]


class Repository:
    """Atomic CRUD over a single document table, keyed by the app string id."""

    def __init__(self, table: Table, *, id_field: str = "id"):
        self.table = table
        self.id_field = id_field

    # ── Reads ────────────────────────────────────────────────────────────────
    def list(self) -> List[Record]:
        with engine.connect() as conn:
            rows = conn.execute(
                select(self.table.c.data).order_by(self.table.c.seq)
            ).all()
        return [dict(row[0]) for row in rows]

    def get(self, record_id: str) -> Optional[Record]:
        with engine.connect() as conn:
            row = conn.execute(
                select(self.table.c.data).where(self.table.c.id == str(record_id))
            ).first()
        return dict(row[0]) if row else None

    def count(self) -> int:
        with engine.connect() as conn:
            return int(
                conn.execute(select(func.count(self.table.c.seq))).scalar() or 0
            )

    # ── Writes (each in its own transaction) ─────────────────────────────────
    def insert(self, record: Record) -> Record:
        """Insert a new record. Its ``id`` must be present and unique."""
        record_id = str(record.get(self.id_field) or "").strip()
        if not record_id:
            raise ValueError(f"record is missing required field '{self.id_field}'")
        with write_transaction() as conn:
            conn.execute(
                insert(self.table).values(id=record_id, data=record, version=1)
            )
        return record

    def update(self, record_id: str, mutate: Mutator) -> Optional[Record]:
        """Atomically read-modify-write a single record.

        Returns the updated record, or ``None`` if it does not exist. The row is
        locked for the duration of the transaction, so concurrent updates to the
        same id serialize and no update is lost.
        """
        with write_transaction() as conn:
            stmt = select(self.table.c.data, self.table.c.version).where(
                self.table.c.id == str(record_id)
            )
            # Row-level lock on backends that support it (PostgreSQL); a no-op on
            # SQLite, where the enclosing write transaction already serializes.
            if engine.dialect.name != "sqlite":
                stmt = stmt.with_for_update()
            row = conn.execute(stmt).first()
            if row is None:
                return None
            new_record = mutate(dict(row[0]))
            conn.execute(
                sql_update(self.table)
                .where(self.table.c.id == str(record_id))
                .values(data=new_record, version=row[1] + 1)
            )
        return new_record

    def upsert(self, record_id: str, create: Callable[[], Record], mutate: Mutator) -> Record:
        """Insert the record if absent, otherwise atomically update it.

        On PostgreSQL ``SELECT ... FOR UPDATE`` cannot lock a not-yet-existent
        row, so two concurrent creators could both see ``None`` and one insert
        would then raise a unique violation. Rather than hold a lock across the
        gap, we try the insert and, if a concurrent creator won (IntegrityError)
        — or the row is deleted between our get and update — retry, converging on
        the surviving row via :meth:`update`.
        """
        record_id = str(record_id)
        for _ in range(_UPSERT_RETRIES):
            if self.get(record_id) is None:
                new_record = create()
                new_record[self.id_field] = record_id
                try:
                    with write_transaction() as conn:
                        conn.execute(
                            insert(self.table).values(id=record_id, data=new_record, version=1)
                        )
                    return new_record
                except IntegrityError:
                    # A concurrent creator inserted first — fall through and
                    # apply our change as an update on the next iteration.
                    continue
            updated = self.update(record_id, mutate)
            if updated is not None:
                return updated
            # Row vanished (deleted concurrently) between get and update; retry.
        raise RuntimeError(
            f"upsert for id={record_id!r} did not converge after {_UPSERT_RETRIES} attempts"
        )

    def delete(self, record_id: str) -> bool:
        with write_transaction() as conn:
            result = conn.execute(
                delete(self.table).where(self.table.c.id == str(record_id))
            )
        return result.rowcount > 0

    def replace_all(self, records: List[Record]) -> None:
        """Replace the entire table contents in one transaction.

        Retained only for whole-list callers (e.g. bulk import/backfill). Not a
        substitute for :meth:`update` on the concurrent mutation paths — it
        rewrites everything and would reintroduce the lost-update race if used
        for single-record edits.
        """
        with write_transaction() as conn:
            conn.execute(delete(self.table))
            for record in records:
                record_id = str(record.get(self.id_field) or "").strip()
                if not record_id:
                    raise ValueError(f"record is missing required field '{self.id_field}'")
                conn.execute(
                    insert(self.table).values(id=record_id, data=record, version=1)
                )


declarations_repo = Repository(declarations_table)
templates_repo = Repository(templates_table)
clients_repo = Repository(clients_table)
manifests_repo = Repository(manifests_table)
sheets_repo = Repository(sheets_table)
