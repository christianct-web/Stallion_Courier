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
        def _sqlite_begin_immediate(conn):  # pragma: no cover - trivial
            # pysqlite otherwise defers the write lock until the first write,
            # after the read in a read-modify-write has already happened — which
            # reintroduces the lost-update race. BEGIN IMMEDIATE takes the write
            # lock up front so update()'s SELECT+UPDATE is exclusive. Reads use
            # engine.connect() (no begin) and stay lock-free.
            conn.exec_driver_sql("BEGIN IMMEDIATE")

        return engine

    return create_engine(DATABASE_URL, future=True, pool_pre_ping=True)


engine = _make_engine()


def init_db() -> None:
    """Create any missing tables. Idempotent; safe to call on every startup."""
    metadata.create_all(engine)


# Create tables as soon as the schema is imported so the repositories are usable
# immediately — including under Starlette's TestClient, which does not run the
# app lifespan unless entered as a context manager.
init_db()
