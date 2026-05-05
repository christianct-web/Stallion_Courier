from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from .store import _safe_read, _safe_write, DATA

CLIENTS_FILE = DATA / "clients.json"
if not CLIENTS_FILE.exists():
    CLIENTS_FILE.write_text("[]", encoding="utf-8")


def load_clients() -> List[Dict[str, Any]]:
    return _safe_read(CLIENTS_FILE)


def save_clients(items: List[Dict[str, Any]]) -> None:
    _safe_write(CLIENTS_FILE, items)
