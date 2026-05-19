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
import re
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


# ── HS section / chapter reference (for the browse-by-category UI) ────────────
# The 21 sections of the Harmonized System and the chapters each contains.
# Used to render a category browser instead of a flat code list.

_HS_SECTIONS = [
    {"roman": "I", "title": "Live animals; animal products", "chapters": list(range(1, 6))},
    {"roman": "II", "title": "Vegetable products", "chapters": list(range(6, 15))},
    {"roman": "III", "title": "Animal/vegetable fats & oils", "chapters": [15]},
    {"roman": "IV", "title": "Prepared foodstuffs; beverages; tobacco", "chapters": list(range(16, 25))},
    {"roman": "V", "title": "Mineral products", "chapters": list(range(25, 28))},
    {"roman": "VI", "title": "Chemical & allied industries", "chapters": list(range(28, 39))},
    {"roman": "VII", "title": "Plastics & rubber", "chapters": [39, 40]},
    {"roman": "VIII", "title": "Hides, skins, leather, furs", "chapters": list(range(41, 44))},
    {"roman": "IX", "title": "Wood, cork, basketware", "chapters": list(range(44, 47))},
    {"roman": "X", "title": "Pulp, paper, paperboard", "chapters": list(range(47, 50))},
    {"roman": "XI", "title": "Textiles & textile articles", "chapters": list(range(50, 64))},
    {"roman": "XII", "title": "Footwear, headgear, umbrellas", "chapters": list(range(64, 68))},
    {"roman": "XIII", "title": "Stone, ceramic, glass", "chapters": list(range(68, 71))},
    {"roman": "XIV", "title": "Pearls, precious metals, jewellery", "chapters": [71]},
    {"roman": "XV", "title": "Base metals & articles thereof", "chapters": list(range(72, 84))},
    {"roman": "XVI", "title": "Machinery & electrical equipment", "chapters": [84, 85]},
    {"roman": "XVII", "title": "Vehicles, aircraft, vessels", "chapters": list(range(86, 90))},
    {"roman": "XVIII", "title": "Optical, medical, precision instruments", "chapters": list(range(90, 93))},
    {"roman": "XIX", "title": "Arms & ammunition", "chapters": [93]},
    {"roman": "XX", "title": "Miscellaneous manufactured articles", "chapters": list(range(94, 97))},
    {"roman": "XXI", "title": "Works of art, antiques", "chapters": [97]},
]

_CHAPTER_TITLES = {
    1: "Live animals", 2: "Meat & edible offal", 3: "Fish & seafood",
    4: "Dairy, eggs, honey", 5: "Other animal products",
    6: "Live trees & plants", 7: "Edible vegetables", 8: "Edible fruit & nuts",
    9: "Coffee, tea, spices", 10: "Cereals", 11: "Milling products",
    12: "Oil seeds & grains", 13: "Lac, gums, resins", 14: "Vegetable plaiting materials",
    15: "Fats & oils", 16: "Meat/fish preparations", 17: "Sugars & confectionery",
    18: "Cocoa & chocolate", 19: "Cereal/flour preparations", 20: "Vegetable/fruit preparations",
    21: "Miscellaneous edible preparations", 22: "Beverages & spirits",
    23: "Food industry residues", 24: "Tobacco", 25: "Salt, earth, stone",
    26: "Ores, slag, ash", 27: "Mineral fuels & oils", 28: "Inorganic chemicals",
    29: "Organic chemicals", 30: "Pharmaceuticals", 31: "Fertilizers",
    32: "Tanning/dyeing extracts", 33: "Cosmetics & perfumery", 34: "Soap, waxes",
    35: "Albuminoids, glues", 36: "Explosives, matches", 37: "Photographic goods",
    38: "Miscellaneous chemicals", 39: "Plastics & articles", 40: "Rubber & articles",
    41: "Raw hides & leather", 42: "Leather articles, handbags", 43: "Furskins",
    44: "Wood & wood articles", 45: "Cork", 46: "Basketware",
    47: "Wood pulp", 48: "Paper & paperboard", 49: "Books & printed matter",
    50: "Silk", 51: "Wool & animal hair", 52: "Cotton",
    53: "Other vegetable fibres", 54: "Man-made filaments", 55: "Man-made staple fibres",
    56: "Wadding, felt, nonwovens", 57: "Carpets & floor coverings", 58: "Special woven fabrics",
    59: "Coated textile fabrics", 60: "Knitted/crocheted fabrics",
    61: "Knitted apparel", 62: "Woven apparel", 63: "Other textile articles",
    64: "Footwear", 65: "Headgear", 66: "Umbrellas & walking sticks",
    67: "Feathers, artificial flowers", 68: "Stone, plaster, cement articles",
    69: "Ceramic products", 70: "Glass & glassware", 71: "Pearls, precious metals, jewellery",
    72: "Iron & steel", 73: "Iron/steel articles", 74: "Copper",
    75: "Nickel", 76: "Aluminium", 78: "Lead", 79: "Zinc", 80: "Tin",
    81: "Other base metals", 82: "Tools & cutlery", 83: "Miscellaneous metal articles",
    84: "Machinery & mechanical appliances", 85: "Electrical machinery & electronics",
    86: "Railway equipment", 87: "Vehicles", 88: "Aircraft",
    89: "Ships & boats", 90: "Optical/medical instruments", 91: "Clocks & watches",
    92: "Musical instruments", 93: "Arms & ammunition", 94: "Furniture, bedding, lighting",
    95: "Toys, games, sports equipment", 96: "Miscellaneous manufactured articles",
    97: "Works of art & antiques",
}


def _rank_score(entry: Dict[str, Any], q: str, q_tokens: List[str]) -> float:
    """
    Relevance score for a tariff entry against a query. Higher = better.

    Tiers (so the broker sees the obvious match first, not alphabetical
    noise):
      - exact THN / code match            → huge
      - THN / code starts-with            → very high
      - whole-word description match      → high (scaled by token coverage)
      - substring description match       → medium
      - shorter descriptions slightly win (more specific)
    """
    thn = entry.get("thn", "")
    code = (entry.get("code") or "").replace(".", "")
    desc = (entry.get("description") or "").lower()

    if q == thn or q == code:
        return 1000.0
    score = 0.0
    if thn.startswith(q) or code.startswith(q):
        score += 400.0
    elif q.isdigit() and (q in thn or q in code):
        score += 120.0

    if q_tokens and desc:
        matched = 0
        for tok in q_tokens:
            if re.search(r"\b" + re.escape(tok) + r"\b", desc):
                score += 60.0
                matched += 1
            elif tok in desc:
                score += 20.0
        if matched == len(q_tokens) and matched > 0:
            score += 80.0  # all query words present

    if score > 0 and desc:
        # prefer specific (shorter, non-"other") descriptions
        if desc not in ("other", "- other", "+ other"):
            score += max(0.0, 40.0 - len(desc) / 4.0)
    return score


def list_tariff_entries(
    chapter: Optional[int] = None,
    query: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    duty_band: Optional[str] = None,
    overrides_only: bool = False,
    sort: str = "relevance",
) -> Dict[str, Any]:
    """
    Paginated tariff browse with ranked search.

    chapter        : filter by HS chapter (1-97)
    query          : THN/code/description search (ranked, not just substring)
    duty_band      : "free" (0%) | "low" (1-15%) | "mid" (16-25%) | "high" (>25%)
    overrides_only : only entries the broker has customised
    sort           : "relevance" (default when query set) | "thn"
    """
    index = _load_tariff_index()
    items = list(index.values())

    if chapter is not None:
        items = [e for e in items if e.get("chapter") == chapter]

    if overrides_only:
        items = [e for e in items if e.get("is_override")]

    if duty_band:
        def _band(e: Dict[str, Any]) -> str:
            if e.get("isExempt") or (e.get("dutyPct") or 0) == 0:
                return "free"
            d = e.get("dutyPct") or 0
            if d <= 15:
                return "low"
            if d <= 25:
                return "mid"
            return "high"
        items = [e for e in items if _band(e) == duty_band]

    if query:
        q = query.lower().strip()
        q_digits = re.sub(r"\D", "", q)
        q_tokens = [t for t in re.split(r"[^a-z0-9]+", q) if len(t) > 1]
        # search by the digit form if the query is numeric
        search_q = q_digits if q_digits and not q_tokens else q
        scored = []
        for e in items:
            s = _rank_score(e, search_q, q_tokens)
            if s > 0:
                scored.append((s, e))
        scored.sort(key=lambda x: (-x[0], x[1].get("thn", "")))
        items = [e for _, e in scored]
    else:
        items.sort(key=lambda e: e.get("thn", ""))

    if not query and sort == "thn":
        items.sort(key=lambda e: e.get("thn", ""))

    total = len(items)
    page = items[offset : offset + limit]
    return {"items": page, "total": total, "limit": limit, "offset": offset}


def tariff_chapter_summary() -> Dict[str, Any]:
    """
    Per-chapter counts for the browse-by-category UI. Returns the 21 HS
    sections with their chapters, entry counts, and override counts so the
    page can show a category browser instead of a flat 5,800-row scroll.
    """
    index = _load_tariff_index()
    by_chapter: Dict[int, Dict[str, int]] = {}
    for e in index.values():
        ch = e.get("chapter") or 0
        slot = by_chapter.setdefault(ch, {"count": 0, "overrides": 0})
        slot["count"] += 1
        if e.get("is_override"):
            slot["overrides"] += 1

    sections = []
    for sec in _HS_SECTIONS:
        chs = []
        for ch in sec["chapters"]:
            stats = by_chapter.get(ch, {"count": 0, "overrides": 0})
            chs.append({
                "chapter": ch,
                "title": _CHAPTER_TITLES.get(ch, f"Chapter {ch}"),
                "count": stats["count"],
                "overrides": stats["overrides"],
            })
        total = sum(c["count"] for c in chs)
        if total == 0:
            continue
        sections.append({
            "section": sec["roman"],
            "title": sec["title"],
            "chapters": chs,
            "count": total,
        })
    return {"sections": sections}


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
