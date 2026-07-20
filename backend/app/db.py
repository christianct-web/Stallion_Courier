"""Database engine and document-table schema for Stallion Courier.

Phase 3B replaces the whole-file JSON read-modify-write stores with a real
transactional database. Records keep their existing nested dict shape and live
in a JSON/JSONB ``data`` column; a per-row atomic update path (see
``repository.py``) removes the lost-update race the JSON stores suffered.

Configuration
    DATABASE_URL   SQLAlchemy URL. Defaults to a local SQLite file under
                   backend/data. In production set this to Postgres, e.g.
                   ``postgresql+psycopg://user:pass@host:5432/stallion``.

Both backends are supported unchanged: SQLite for local/dev/CI (always
available), PostgreSQL for production (the house stack). The ``data`` column is
plain JSON on SQLite and JSONB on PostgreSQL via a dialect variant.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
DATA.mkdir(parents=True, exist_ok=True)


def _database_url() -> str:
    configured = os.environ.get("DATABASE_URL", "").strip()
    if configured:
        return configured
    return f"sqlite:///{DATA / 'stallion.db'}"


DATABASE_URL = _database_url()
_IS_SQLITE = DATABASE_URL.startswith("sqlite")

# JSON on SQLite, JSONB on PostgreSQL — same Python dict either way.
_JSON = JSON().with_variant(JSONB, "postgresql")

metadata = MetaData()


def _document_table(name: str) -> Table:
    """A generic document row: app string id + full record in a JSON column.

    ``seq`` is an auto-increment surrogate key used purely to preserve
    insertion order (the JSON stores returned records in file order, and callers
    such as the activity log rely on that). ``version`` supports optimistic
    concurrency for the atomic update path.
    """
    return Table(
        name,
        metadata,
        Column("seq", Integer, primary_key=True, autoincrement=True),
        Column("id", String(64), nullable=False, unique=True, index=True),
        Column("data", _JSON, nullable=False),
        Column("version", Integer, nullable=False, default=1),
        Column("created_at", DateTime(timezone=True), server_default=func.now()),
        Column(
            "updated_at",
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
        ),
    )


declarations_table = _document_table("declarations")
templates_table = _document_table("templates")
clients_table = _document_table("clients")
manifests_table = _document_table("courier_manifests")
sheets_table = _document_table("declaration_sheets")


def _make_engine() -> Engine:
    if _IS_SQLITE:
        engine = create_engine(
            DATABASE_URL,
            future=True,
            # FastAPI runs sync endpoints across a threadpool; the connection
            # pool is shared between threads.
            connect_args={"check_same_thread": False},
            pool_pre_ping=True,
        )

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - trivial
            cursor = dbapi_conn.cursor()
            # WAL + a generous busy timeout let concurrent writers queue instead
            # of failing outright; foreign_keys for correctness parity with PG.
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
            # Hand transaction control to us so we can open every write
            # transaction with BEGIN IMMEDIATE (see the begin listener below).
            dbapi_conn.isolation_level = None

        @event.listens_for(engine, "begin")
        def _sqlite_begin(conn):  # pragma: no cover - trivial
            # Only writers take the reserved lock up front (BEGIN IMMEDIATE), so
            # a read-modify-write is exclusive and can't lose an update. Readers
            # autobegin DEFERRED and, under WAL, neither block nor serialize
            # against the writer. The write flag is set by write_transaction().
            mode = "IMMEDIATE" if conn.info.get("_stallion_write") else "DEFERRED"
            conn.exec_driver_sql(f"BEGIN {mode}")

        return engine

    return create_engine(DATABASE_URL, future=True, pool_pre_ping=True)


engine = _make_engine()


@contextmanager
def write_transaction():
    """A transaction for mutations.

    On SQLite it opens ``BEGIN IMMEDIATE`` so writers serialize and no
    read-modify-write is lost; reads (plain ``engine.connect()``) stay on
    DEFERRED and don't take the write lock. On PostgreSQL it is an ordinary
    transaction — row locking is handled by ``SELECT ... FOR UPDATE`` in the
    repository.
    """
    with engine.connect() as conn:
        if _IS_SQLITE:
            conn.info["_stallion_write"] = True
        with conn.begin():
            yield conn


def init_db() -> None:
    """Create any missing tables. Idempotent; safe to call on every startup."""
    metadata.create_all(engine)


# Create tables as soon as the schema is imported so the repositories are usable
# immediately — including under Starlette's TestClient, which does not run the
# app lifespan unless entered as a context manager.
init_db()
