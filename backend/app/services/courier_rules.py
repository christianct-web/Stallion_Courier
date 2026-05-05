"""
Editable courier rules store.

Manages user-editable operational rules and tariff overrides through a
layered file architecture:

  bundled (read-only seed)  +  user (read-write overrides)  =  effective rules

Files
-----
data/courier_rules_bundled.json   — Default ruleset shipped with the code.
                                    Read-only at runtime; replaced only via
                                    code release.
data/courier_rules_user.json      — User edits. Add/remove/modify exemptions,
                                    corrections, and keyword aliases. Audit
                                    log of every change is kept inline.
data/tt_tariff_db_2024.json       — Bundled CET 2024 tariff (5,240 entries).
                                    Treated as immutable reference data.
data/tariff_overrides.json        — User-added or corrected THN entries.
                                    For codes the OCR missed, or local
                                    corrections (e.g. brokers' chamber rate
                                    differs from CET).

Schema (rules files)
--------------------
{
  "version": 1,
  "updated_at": "ISO8601",
  "exemptions": [
    {
      "thn": "85171300",
      "class": "full_exempt",        // or "duty_free_only"
      "notes": "Smartphones (breakout exemption)",
      "added_by": "system" | "<user_id>",
      "added_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ],
  "thn_corrections": [
    {
      "wrong_thn": "85171200",
      "correct_thn": "85171300",
      "reason": "85171200 does not exist; use 85171300 for smartphones",
      "added_by": "system" | "<user_id>",
      "added_at": "ISO8601"
    }
  ],
  "audit": [
    {
      "at": "ISO8601",
      "by": "<user_id>",
      "action": "add_exemption" | "update_exemption" | "remove_exemption" |
                "add_correction" | "update_correction" | "remove_correction" |
                "add_tariff" | "update_tariff" | "remove_tariff",
      "target": "<thn>",
      "before": <prior value or null>,
      "after": <new value or null>,
      "comment": "<optional reason>"
    }
  ]
}

Schema (tariff_overrides.json)
------------------------------
{
  "version": 1,
  "updated_at": "ISO8601",
  "entries": [
    {
      "thn": "83062900",
      "code": "8306.29.00",
      "description": "Decorations of base metal, other",
      "dutyPct": 20,
      "vatPct": 12.5,
      "surchargePct": 0,
      "isExempt": false,
      "chapter": 83,
      "unit": "kg",
      "added_by": "<user_id>",
      "added_at": "ISO8601"
    }
  ]
}
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..store import _safe_read, _safe_write, _file_lock, DATA

logger = logging.getLogger("stallion.courier.rules")


# ── Configurable paths ───────────────────────────────────────────────────────

_paths = {
    "bundled_rules": DATA / "courier_rules_bundled.json",
    "user_rules":    DATA / "courier_rules_user.json",
    "bundled_tariff": DATA / "tt_tariff_db_2024.json",
    "tariff_overrides": DATA / "tariff_overrides.json",
}


def configure_paths(
    *,
    bundled_rules_path: Optional[Path] = None,
    user_rules_path: Optional[Path] = None,
    bundled_tariff_path: Optional[Path] = None,
    tariff_overrides_path: Optional[Path] = None,
) -> None:
    """Override default file paths. Useful for tests."""
    if bundled_rules_path is not None:
        _paths["bundled_rules"] = Path(bundled_rules_path)
    if user_rules_path is not None:
        _paths["user_rules"] = Path(user_rules_path)
    if bundled_tariff_path is not None:
        _paths["bundled_tariff"] = Path(bundled_tariff_path)
    if tariff_overrides_path is not None:
        _paths["tariff_overrides"] = Path(tariff_overrides_path)
    _invalidate_cache()


# ── Module cache ─────────────────────────────────────────────────────────────
# We cache the merged rules and tariff in memory and invalidate on every
# write. Reads are cheap; writes are rare (admin-only).

_cache: Dict[str, Any] = {
    "rules": None,
    "tariff_by_thn": None,
    "rules_mtime": None,
    "tariff_mtime": None,
}
_cache_lock = threading.Lock()


def _invalidate_cache() -> None:
    with _cache_lock:
        _cache["rules"] = None
        _cache["tariff_by_thn"] = None
        _cache["rules_mtime"] = None
        _cache["tariff_mtime"] = None


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ── File I/O ─────────────────────────────────────────────────────────────────


def _empty_rules() -> Dict[str, Any]:
    return {
        "version": 1,
        "updated_at": _utcnow(),
        "exemptions": [],
        "thn_corrections": [],
        "audit": [],
    }


def _empty_tariff_overrides() -> Dict[str, Any]:
    return {
        "version": 1,
        "updated_at": _utcnow(),
        "entries": [],
    }


def _read_json(path: Path, default_factory) -> Dict[str, Any]:
    """Read a JSON file under advisory lock; return default if missing."""
    if not path.exists():
        return default_factory()
    try:
        with _file_lock(path):
            with open(path, encoding="utf-8") as f:
                return json.load(f)
    except json.JSONDecodeError as exc:
        logger.error("Corrupt rules file %s: %s", path, exc)
        return default_factory()


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    """Atomic write of a JSON dict under advisory lock."""
    import os
    import tempfile
    path.parent.mkdir(parents=True, exist_ok=True)
    with _file_lock(path):
        fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp", prefix=path.stem)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp, path)
        except Exception:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise


# ── Rules (load + merge) ─────────────────────────────────────────────────────


def load_rules() -> Dict[str, Any]:
    """
    Load the merged effective ruleset.

    Returns a single dict with `exemptions` and `thn_corrections` lists
    that combine bundled defaults with user overrides. User entries take
    precedence — if both define an exemption for THN X, the user one wins.
    """
    with _cache_lock:
        bundled_path = _paths["bundled_rules"]
        user_path = _paths["user_rules"]
        bundled_mtime = bundled_path.stat().st_mtime if bundled_path.exists() else 0
        user_mtime = user_path.stat().st_mtime if user_path.exists() else 0
        current_mtime = (bundled_mtime, user_mtime)
        if _cache["rules"] is not None and _cache["rules_mtime"] == current_mtime:
            return _cache["rules"]

        bundled = _read_json(bundled_path, _empty_rules)
        user = _read_json(user_path, _empty_rules)

        # Merge: user entries replace bundled by THN / wrong_thn key
        merged_exemptions: Dict[str, Dict[str, Any]] = {}
        for e in bundled.get("exemptions", []):
            merged_exemptions[e["thn"]] = {**e, "is_user": False}
        for e in user.get("exemptions", []):
            merged_exemptions[e["thn"]] = {**e, "is_user": True}

        merged_corrections: Dict[str, Dict[str, Any]] = {}
        for c in bundled.get("thn_corrections", []):
            merged_corrections[c["wrong_thn"]] = {**c, "is_user": False}
        for c in user.get("thn_corrections", []):
            merged_corrections[c["wrong_thn"]] = {**c, "is_user": True}

        merged = {
            "exemptions": list(merged_exemptions.values()),
            "thn_corrections": list(merged_corrections.values()),
            "audit": user.get("audit", []),  # only user file holds the audit log
        }
        _cache["rules"] = merged
        _cache["rules_mtime"] = current_mtime
        return merged


def get_exemption(thn: str) -> Optional[Dict[str, Any]]:
    """Return the active exemption rule for a THN, or None."""
    rules = load_rules()
    raw = thn.replace(".", "").strip()
    return next((e for e in rules["exemptions"] if e["thn"] == raw), None)


def get_correction(thn: str) -> Optional[Dict[str, Any]]:
    """Return the active THN correction rule, or None."""
    rules = load_rules()
    raw = thn.replace(".", "").strip()
    return next((c for c in rules["thn_corrections"] if c["wrong_thn"] == raw), None)


# ── Tariff lookup ────────────────────────────────────────────────────────────


def _load_tariff_index() -> Dict[str, Dict[str, Any]]:
    """
    Load and index the merged tariff DB by 8-digit THN.

    User overrides shadow bundled entries; user-added entries that don't
    exist in the bundled DB are simply additions.
    """
    with _cache_lock:
        bundled_path = _paths["bundled_tariff"]
        ovr_path = _paths["tariff_overrides"]
        bundled_mtime = bundled_path.stat().st_mtime if bundled_path.exists() else 0
        ovr_mtime = ovr_path.stat().st_mtime if ovr_path.exists() else 0
        current_mtime = (bundled_mtime, ovr_mtime)
        if _cache["tariff_by_thn"] is not None and _cache["tariff_mtime"] == current_mtime:
            return _cache["tariff_by_thn"]

        index: Dict[str, Dict[str, Any]] = {}

        # Load bundled
        if bundled_path.exists():
            try:
                with open(bundled_path, encoding="utf-8") as f:
                    bundled = json.load(f)
                for entry in bundled.get("entries", []):
                    thn = entry.get("thn") or entry["code"].replace(".", "")
                    index[thn] = {**entry, "is_override": False}
                logger.info(
                    "Loaded %d THN entries from bundled tariff %s",
                    len(index), bundled_path.name,
                )
            except Exception as exc:
                logger.error("Failed to load bundled tariff: %s", exc)

        # Apply user overrides
        ovr = _read_json(ovr_path, _empty_tariff_overrides)
        ovr_count = 0
        for entry in ovr.get("entries", []):
            thn = entry.get("thn") or entry["code"].replace(".", "")
            index[thn] = {**entry, "is_override": True}
            ovr_count += 1
        if ovr_count:
            logger.info("Applied %d user tariff overrides", ovr_count)

        _cache["tariff_by_thn"] = index
        _cache["tariff_mtime"] = current_mtime
        return index


def lookup_thn(thn: str) -> Optional[Dict[str, Any]]:
    """Look up a single THN in the merged tariff index."""
    raw = thn.replace(".", "").strip()
    return _load_tariff_index().get(raw)


def list_tariff_entries(
    chapter: Optional[int] = None,
    query: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Paginated tariff browse — for the admin UI.

    chapter: filter by chapter (1-99)
    query  : substring match on description
    """
    index = _load_tariff_index()
    items = list(index.values())
    if chapter is not None:
        items = [e for e in items if e.get("chapter") == chapter]
    if query:
        q = query.lower().strip()
        items = [e for e in items if q in (e.get("description") or "").lower() or q in e.get("thn", "")]
    items.sort(key=lambda e: e.get("thn", ""))
    total = len(items)
    page = items[offset : offset + limit]
    return {"items": page, "total": total, "limit": limit, "offset": offset}


# ── Mutating operations (user file only) ─────────────────────────────────────
# All edits go through these. They:
#   1. Validate input
#   2. Apply the change to the user file (atomic)
#   3. Append an audit record
#   4. Invalidate the cache

VALID_CLASSES = {"full_exempt", "duty_free_only"}


def _validate_thn(thn: str) -> str:
    raw = (thn or "").replace(".", "").strip()
    if not raw or not raw.isdigit():
        raise ValueError(f"THN must be all digits (got '{thn}')")
    if len(raw) != 8:
        raise ValueError(f"THN must be 8 digits (got '{thn}', {len(raw)} digits)")
    return raw


def _load_user_rules() -> Dict[str, Any]:
    return _read_json(_paths["user_rules"], _empty_rules)


def _save_user_rules(data: Dict[str, Any]) -> None:
    data["updated_at"] = _utcnow()
    _write_json(_paths["user_rules"], data)
    _invalidate_cache()


def _audit(data: Dict[str, Any], action: str, by: str, target: str,
           before: Any, after: Any, comment: str = "") -> None:
    data.setdefault("audit", []).append({
        "at": _utcnow(),
        "by": by or "anonymous",
        "action": action,
        "target": target,
        "before": before,
        "after": after,
        "comment": comment,
    })


# ── Exemption mutations ──────────────────────────────────────────────────────


def add_exemption(thn: str, exemption_class: str, notes: str = "",
                  by: str = "anonymous", comment: str = "") -> Dict[str, Any]:
    """Add or override an exemption entry."""
    raw = _validate_thn(thn)
    if exemption_class not in VALID_CLASSES:
        raise ValueError(f"class must be one of {VALID_CLASSES} (got '{exemption_class}')")

    user = _load_user_rules()
    before = next((e for e in user["exemptions"] if e["thn"] == raw), None)
    new_entry = {
        "thn": raw,
        "class": exemption_class,
        "notes": notes.strip(),
        "added_by": by,
        "added_at": before["added_at"] if before else _utcnow(),
        "updated_at": _utcnow(),
    }
    user["exemptions"] = [e for e in user["exemptions"] if e["thn"] != raw]
    user["exemptions"].append(new_entry)
    _audit(user,
           action="update_exemption" if before else "add_exemption",
           by=by, target=raw, before=before, after=new_entry, comment=comment)
    _save_user_rules(user)
    return new_entry


def remove_exemption(thn: str, by: str = "anonymous", comment: str = "") -> bool:
    """Remove an exemption (only from the user file — bundled is read-only).

    If the exemption only exists in the bundled file, this is a no-op
    that returns False — to "remove" a bundled exemption, the user must
    instead add a user entry that overrides it.
    """
    raw = _validate_thn(thn)
    user = _load_user_rules()
    before = next((e for e in user["exemptions"] if e["thn"] == raw), None)
    if before is None:
        return False
    user["exemptions"] = [e for e in user["exemptions"] if e["thn"] != raw]
    _audit(user, action="remove_exemption", by=by, target=raw,
           before=before, after=None, comment=comment)
    _save_user_rules(user)
    return True


# ── Correction mutations ─────────────────────────────────────────────────────


def add_correction(wrong_thn: str, correct_thn: str, reason: str = "",
                   by: str = "anonymous", comment: str = "") -> Dict[str, Any]:
    """Add or override a THN correction."""
    raw_wrong = _validate_thn(wrong_thn)
    raw_correct = _validate_thn(correct_thn)
    if raw_wrong == raw_correct:
        raise ValueError("wrong_thn and correct_thn cannot be the same")

    user = _load_user_rules()
    before = next((c for c in user["thn_corrections"] if c["wrong_thn"] == raw_wrong), None)
    new_entry = {
        "wrong_thn": raw_wrong,
        "correct_thn": raw_correct,
        "reason": reason.strip(),
        "added_by": by,
        "added_at": before["added_at"] if before else _utcnow(),
        "updated_at": _utcnow(),
    }
    user["thn_corrections"] = [c for c in user["thn_corrections"] if c["wrong_thn"] != raw_wrong]
    user["thn_corrections"].append(new_entry)
    _audit(user,
           action="update_correction" if before else "add_correction",
           by=by, target=raw_wrong, before=before, after=new_entry, comment=comment)
    _save_user_rules(user)
    return new_entry


def remove_correction(wrong_thn: str, by: str = "anonymous", comment: str = "") -> bool:
    """Remove a THN correction (user file only)."""
    raw = _validate_thn(wrong_thn)
    user = _load_user_rules()
    before = next((c for c in user["thn_corrections"] if c["wrong_thn"] == raw), None)
    if before is None:
        return False
    user["thn_corrections"] = [c for c in user["thn_corrections"] if c["wrong_thn"] != raw]
    _audit(user, action="remove_correction", by=by, target=raw,
           before=before, after=None, comment=comment)
    _save_user_rules(user)
    return True


# ── Tariff override mutations ────────────────────────────────────────────────


def _load_tariff_overrides() -> Dict[str, Any]:
    return _read_json(_paths["tariff_overrides"], _empty_tariff_overrides)


def _save_tariff_overrides(data: Dict[str, Any]) -> None:
    data["updated_at"] = _utcnow()
    _write_json(_paths["tariff_overrides"], data)
    _invalidate_cache()


def add_tariff_entry(
    thn: str,
    description: str,
    duty_pct: float,
    *,
    chapter: Optional[int] = None,
    unit: Optional[str] = None,
    is_exempt: Optional[bool] = None,
    by: str = "anonymous",
    comment: str = "",
) -> Dict[str, Any]:
    """Add or override a tariff entry."""
    raw = _validate_thn(thn)
    duty_pct = float(duty_pct)
    if duty_pct < 0 or duty_pct > 100:
        raise ValueError("dutyPct must be between 0 and 100")

    code = f"{raw[:4]}.{raw[4:6]}.{raw[6:]}"
    user = _load_tariff_overrides()
    before = next((e for e in user["entries"] if e["thn"] == raw), None)
    new_entry = {
        "thn": raw,
        "code": code,
        "description": description.strip(),
        "dutyPct": duty_pct,
        "vatPct": 12.5,
        "surchargePct": 0,
        "isExempt": bool(is_exempt) if is_exempt is not None else (duty_pct == 0),
        "chapter": chapter if chapter is not None else int(raw[:2]),
        "unit": unit,
        "dutyRate": "Free + 12.5% VAT" if duty_pct == 0 else f"{int(duty_pct)}% + 12.5% VAT",
        "notes": "User-added tariff override",
        "added_by": by,
        "added_at": before["added_at"] if before else _utcnow(),
        "updated_at": _utcnow(),
    }
    user["entries"] = [e for e in user["entries"] if e["thn"] != raw]
    user["entries"].append(new_entry)
    _save_tariff_overrides(user)

    # Append to user-rules audit so the trail is unified
    rules = _load_user_rules()
    _audit(rules,
           action="update_tariff" if before else "add_tariff",
           by=by, target=raw, before=before, after=new_entry, comment=comment)
    _save_user_rules(rules)
    return new_entry


def remove_tariff_entry(thn: str, by: str = "anonymous", comment: str = "") -> bool:
    """Remove a user tariff override. Bundled entries cannot be removed."""
    raw = _validate_thn(thn)
    user = _load_tariff_overrides()
    before = next((e for e in user["entries"] if e["thn"] == raw), None)
    if before is None:
        return False
    user["entries"] = [e for e in user["entries"] if e["thn"] != raw]
    _save_tariff_overrides(user)

    rules = _load_user_rules()
    _audit(rules, action="remove_tariff", by=by, target=raw,
           before=before, after=None, comment=comment)
    _save_user_rules(rules)
    return True


# ── Audit log read ───────────────────────────────────────────────────────────


def get_audit_log(limit: int = 100, offset: int = 0) -> Dict[str, Any]:
    """Return paginated audit history (newest first)."""
    user = _load_user_rules()
    log = list(reversed(user.get("audit", [])))
    total = len(log)
    page = log[offset : offset + limit]
    return {"items": page, "total": total, "limit": limit, "offset": offset}


# ── Bulk export / import ─────────────────────────────────────────────────────


def export_user_rules() -> Dict[str, Any]:
    """Export the entire user rules + tariff overrides bundle for backup."""
    return {
        "rules": _load_user_rules(),
        "tariff_overrides": _load_tariff_overrides(),
        "exported_at": _utcnow(),
    }


def import_user_rules(payload: Dict[str, Any], by: str = "anonymous",
                      comment: str = "Bulk import") -> Dict[str, Any]:
    """
    Replace user rules and tariff overrides with the contents of `payload`.

    `payload` should be the same shape as `export_user_rules()` returned.
    The audit log is preserved and a single audit entry is appended for
    the bulk import.
    """
    if not isinstance(payload, dict):
        raise ValueError("payload must be a dict")
    rules_in = payload.get("rules") or _empty_rules()
    tariff_in = payload.get("tariff_overrides") or _empty_tariff_overrides()

    # Validate basic shape
    if not isinstance(rules_in.get("exemptions", []), list):
        raise ValueError("rules.exemptions must be a list")
    if not isinstance(rules_in.get("thn_corrections", []), list):
        raise ValueError("rules.thn_corrections must be a list")

    existing = _load_user_rules()
    new_rules = {
        "version": 1,
        "updated_at": _utcnow(),
        "exemptions": rules_in.get("exemptions", []),
        "thn_corrections": rules_in.get("thn_corrections", []),
        "audit": existing.get("audit", []),  # preserve old log
    }
    _audit(new_rules, action="bulk_import", by=by, target="rules",
           before={"counts": {
               "exemptions": len(existing.get("exemptions", [])),
               "thn_corrections": len(existing.get("thn_corrections", [])),
           }},
           after={"counts": {
               "exemptions": len(new_rules["exemptions"]),
               "thn_corrections": len(new_rules["thn_corrections"]),
           }},
           comment=comment)
    _save_user_rules(new_rules)

    new_tariff = {
        "version": 1,
        "updated_at": _utcnow(),
        "entries": tariff_in.get("entries", []),
    }
    _save_tariff_overrides(new_tariff)
    return {"ok": True, "imported_at": _utcnow()}


# ── Public surface ───────────────────────────────────────────────────────────

__all__ = [
    "configure_paths",
    "load_rules",
    "get_exemption",
    "get_correction",
    "lookup_thn",
    "list_tariff_entries",
    "add_exemption",
    "remove_exemption",
    "add_correction",
    "remove_correction",
    "add_tariff_entry",
    "remove_tariff_entry",
    "get_audit_log",
    "export_user_rules",
    "import_user_rules",
]
