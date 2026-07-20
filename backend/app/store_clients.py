from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from .store import DATA

CLIENTS_FILE = DATA / "clients.json"
if not CLIENTS_FILE.exists():
    CLIENTS_FILE.write_text("[]", encoding="utf-8")


def load_clients() -> List[Dict[str, Any]]:
    from .repository import clients_repo
    return clients_repo.list()


def save_clients(items: List[Dict[str, Any]]) -> None:
    from .repository import clients_repo
    clients_repo.replace_all(items)
