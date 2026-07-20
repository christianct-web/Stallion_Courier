"""
Courier manifest service — orchestration layer for the courier module.

Coordinates between the duty engine, the matcher, and the persistence
store to produce a single coherent API for routes/courier.py.

Concepts
--------
A `CourierManifest` represents one TTPOST express consignment manifest
(typically one AWB number e.g. 106-31245034). It contains:
  - header fields (manifest_no, arrival_date, exch_rate, cargo_reporter)
  - a list of `CourierLine` objects (line entries from the worksheet)
  - an optional `OfficerExamination` block (post-exam corrections)
  - status: draft | submitted | examined | finalised

A `CourierLine` is one line item with:
  - identification: line_no, hawb, shipper, importer
  - classification: description, thn, duty_rate (raw)
  - valuation: cost_usd, freight_usd, packages, weight_kg
  - computed (read-only): cif_ttd, duty, opt, vat, total_taxes,
    exemption_class
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from . import courier_duty, courier_matcher
from ..repository import manifests_repo
from ..store_courier import load_manifests

logger = logging.getLogger("stallion.courier.service")


# ── Defaults ─────────────────────────────────────────────────────────────────

DEFAULT_CARGO_REPORTER = "TTPOST"


# ── Helpers ──────────────────────────────────────────────────────────────────


class _LineNotFound(Exception):
    """Raised inside an atomic manifest mutation when the target line is absent.

    Signals the repository transaction to roll back so the caller can return the
    original not-found result without persisting a partial change.
    """


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id() -> str:
    return str(uuid.uuid4())


def _ensure_float(v: Any, default: float = 0.0) -> float:
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _compute_line(line: Dict[str, Any], exch_rate: float) -> Dict[str, Any]:
    """
    Recompute CIF, duty, OPT, VAT and total_taxes for a line.
    Mutates and returns the line.
    """
    thn = (line.get("thn") or "").strip().replace(".", "")
    cost_usd = _ensure_float(line.get("cost_usd"))
    freight_usd = _ensure_float(line.get("freight_usd"))

    # Only compute if we have what we need
    if not thn or cost_usd <= 0 or exch_rate <= 0:
        line["cif_ttd"] = 0.0
        line["duty"] = 0.0
        line["opt"] = 0.0
        line["vat"] = 0.0
        line["total_taxes"] = 0.0
        line["exemption_class"] = "none"
        line["duty_rate"] = 0.0
        line["classifier_notes"] = "Awaiting THN and cost"
        line["thn_was_corrected"] = False
        line["thn_unknown"] = False
        return line

    duty_rate_override = line.get("duty_rate_override")
    exemption_override = line.get("exemption_override")

    result = courier_duty.calculate_line(
        cost_usd=cost_usd,
        freight_usd=freight_usd,
        exch_rate=exch_rate,
        thn=thn,
        duty_rate_override=_ensure_float(duty_rate_override) if duty_rate_override is not None else None,
        exemption_override=exemption_override,
    )

    # If the THN was auto-corrected, persist the corrected one
    if result["thn_was_corrected"]:
        line["thn"] = result["thn"]
        line["thn_original"] = result["thn_original"]

    line["cif_ttd"] = result["cif_ttd"]
    line["duty"] = result["duty"]
    line["opt"] = result["opt"]
    line["vat"] = result["vat"]
    line["total_taxes"] = result["total_taxes"]
    line["exemption_class"] = result["exemption_class"]
    line["duty_rate"] = result["duty_rate"]
    line["classifier_notes"] = result["classifier_notes"]
    line["thn_was_corrected"] = result["thn_was_corrected"]
    line["thn_unknown"] = result["thn_unknown"]

    return line


def _renumber_lines(lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Reassign sequential line_no values starting at 1."""
    for i, line in enumerate(lines, start=1):
        line["line_no"] = i
    return lines


def _recompute_all_lines(manifest: Dict[str, Any]) -> Dict[str, Any]:
    """Recompute every line's tax fields and refresh manifest totals."""
    exch = _ensure_float(manifest.get("exch_rate"))
    for line in manifest.get("lines", []):
        _compute_line(line, exch)
    manifest["totals"] = courier_duty.calculate_manifest_totals(manifest["lines"])
    manifest["updated_at"] = _utcnow()
    return manifest


# ── Manifest CRUD ────────────────────────────────────────────────────────────


def create_manifest(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a new courier manifest.

    Required: manifest_no, arrival_date, exch_rate
    Optional: cargo_reporter (default "TTPOST"), notes
    """
    manifest_no = (payload.get("manifest_no") or "").strip()
    if not manifest_no:
        raise ValueError("manifest_no is required")

    exch_rate = _ensure_float(payload.get("exch_rate"))
    if exch_rate <= 0:
        raise ValueError("exch_rate must be > 0")

    arrival_date = (payload.get("arrival_date") or "").strip()
    if not arrival_date:
        raise ValueError("arrival_date is required (YYYY-MM-DD)")

    manifest = {
        "id": _new_id(),
        "manifest_no": manifest_no,
        "arrival_date": arrival_date,
        "exch_rate": exch_rate,
        "cargo_reporter": (payload.get("cargo_reporter") or DEFAULT_CARGO_REPORTER).strip(),
        "notes": (payload.get("notes") or "").strip(),
        "status": "draft",
        "lines": [],
        "officer_examination": None,
        "totals": {
            "total_cif_ttd": 0.0,
            "total_duty": 0.0,
            "total_opt": 0.0,
            "total_vat": 0.0,
            "total_taxes": 0.0,
        },
        "created_at": _utcnow(),
        "updated_at": _utcnow(),
    }

    if any(m.get("manifest_no") == manifest_no for m in load_manifests()):
        raise ValueError(f"Manifest with manifest_no '{manifest_no}' already exists")
    manifests_repo.insert(manifest)
    return manifest


def list_manifests() -> List[Dict[str, Any]]:
    """List all manifests (without full line detail in the long term — for now, full)."""
    return load_manifests()


def get_manifest(manifest_id: str) -> Optional[Dict[str, Any]]:
    items = load_manifests()
    return next((m for m in items if m.get("id") == manifest_id), None)


def recompute_manifest(manifest_id: str) -> Optional[Dict[str, Any]]:
    """
    Recompute every line in the manifest against the current rules/tariff.

    Useful after the broker edits a tariff entry (via the Maintain Tariff
    dialog) so duty / OPT / VAT pick up the new rate without requiring a
    manual line edit.
    """
    def _mutate(manifest: Dict[str, Any]) -> Dict[str, Any]:
        _recompute_all_lines(manifest)
        return manifest

    return manifests_repo.update(manifest_id, _mutate)


def update_manifest_header(manifest_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update manifest header fields. Recomputes lines if exch_rate changed."""
    allowed = {"manifest_no", "arrival_date", "exch_rate", "cargo_reporter", "notes", "status"}

    def _mutate(manifest: Dict[str, Any]) -> Dict[str, Any]:
        new_exch = manifest.get("exch_rate")
        for k, v in patch.items():
            if k not in allowed:
                continue
            if k == "exch_rate":
                v = _ensure_float(v)
                if v <= 0:
                    raise ValueError("exch_rate must be > 0")
                new_exch = v
            manifest[k] = v

        if new_exch != manifest.get("exch_rate"):
            manifest["exch_rate"] = new_exch
        _recompute_all_lines(manifest)
        return manifest

    return manifests_repo.update(manifest_id, _mutate)


def delete_manifest(manifest_id: str) -> bool:
    return manifests_repo.delete(manifest_id)


# ── Line CRUD ────────────────────────────────────────────────────────────────


def add_line(manifest_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Add a new line to a manifest.

    Required (effectively): description, thn, cost_usd
    Optional: hawb, shipper, importer, packages, weight_kg, freight_usd,
              duty_rate_override, exemption_override,
              thn_suggestions, thn_confidence, thn_match_source
    """
    created: Dict[str, Any] = {}

    def _mutate(manifest: Dict[str, Any]) -> Dict[str, Any]:
        line = {
            "id": _new_id(),
            "line_no": len(manifest["lines"]) + 1,
            "hawb": (payload.get("hawb") or "").strip(),
            "shipper": (payload.get("shipper") or "").strip(),
            "importer": (payload.get("importer") or "").strip(),
            "description": (payload.get("description") or "").strip(),
            "packages": int(_ensure_float(payload.get("packages"), default=1)),
            "weight_kg": _ensure_float(payload.get("weight_kg")),
            "thn": (payload.get("thn") or "").strip().replace(".", ""),
            "cost_usd": _ensure_float(payload.get("cost_usd")),
            "freight_usd": _ensure_float(payload.get("freight_usd")),
            "duty_rate_override": payload.get("duty_rate_override"),
            "exemption_override": payload.get("exemption_override"),
            # Auto-classification metadata. Persisted so the UI can show
            # confidence color and alternatives after page reload.
            "thn_suggestions": payload.get("thn_suggestions") or payload.get("_thn_suggestions") or [],
            "thn_confidence": payload.get("thn_confidence"),
            "thn_match_source": payload.get("thn_match_source") or payload.get("_thn_match_source") or "",
            # True when auto-classification deliberately withheld a quarantined
            # THN (unconfirmed OCR rate) — distinguishes "blocked pending broker
            # review" from "no match found" for API/UI clients.
            "thn_needs_review": bool(payload.get("thn_needs_review")),
        }

        _compute_line(line, _ensure_float(manifest.get("exch_rate")))
        manifest["lines"].append(line)
        manifest["totals"] = courier_duty.calculate_manifest_totals(manifest["lines"])
        manifest["updated_at"] = _utcnow()
        created["line"] = line
        return manifest

    updated = manifests_repo.update(manifest_id, _mutate)
    return created["line"] if updated is not None else None


def update_line(manifest_id: str, line_no: int, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a line by line_no. Recomputes its taxes."""
    allowed = {
        "hawb", "shipper", "importer", "description", "packages", "weight_kg",
        "thn", "cost_usd", "freight_usd",
        "duty_rate_override", "exemption_override",
    }
    result: Dict[str, Any] = {}

    def _mutate(manifest: Dict[str, Any]) -> Dict[str, Any]:
        line = next((l for l in manifest["lines"] if l.get("line_no") == line_no), None)
        if line is None:
            raise _LineNotFound
        thn_manually_set = False
        for k, v in patch.items():
            if k not in allowed:
                continue
            if k in ("packages",):
                line[k] = int(_ensure_float(v, default=1))
            elif k in ("weight_kg", "cost_usd", "freight_usd"):
                line[k] = _ensure_float(v)
            elif k == "thn":
                new_thn = (v or "").strip().replace(".", "")
                if new_thn != line.get("thn", ""):
                    thn_manually_set = True
                line[k] = new_thn
            else:
                line[k] = v

        # If the broker explicitly changed the THN, this is now a confirmed
        # human decision — clear the auto-classify confidence so the UI shows
        # it as confirmed rather than as a suggestion. The full suggestion
        # list is kept so the broker can still see alternatives.
        if thn_manually_set:
            line["thn_confidence"] = 1.0
            line["thn_match_source"] = "manual"

        _compute_line(line, _ensure_float(manifest.get("exch_rate")))
        manifest["totals"] = courier_duty.calculate_manifest_totals(manifest["lines"])
        manifest["updated_at"] = _utcnow()
        result["line"] = line
        return manifest

    try:
        updated = manifests_repo.update(manifest_id, _mutate)
    except _LineNotFound:
        return None
    return result["line"] if updated is not None else None


def delete_line(manifest_id: str, line_no: int) -> bool:
    def _mutate(manifest: Dict[str, Any]) -> Dict[str, Any]:
        new_lines = [l for l in manifest["lines"] if l.get("line_no") != line_no]
        if len(new_lines) == len(manifest["lines"]):
            raise _LineNotFound
        _renumber_lines(new_lines)
        manifest["lines"] = new_lines
        manifest["totals"] = courier_duty.calculate_manifest_totals(manifest["lines"])
        manifest["updated_at"] = _utcnow()
        return manifest

    try:
        updated = manifests_repo.update(manifest_id, _mutate)
    except _LineNotFound:
        return False
    return updated is not None


def add_line_with_auto_thn(manifest_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Convenience: add a line and auto-classify THN from the description if
    one wasn't supplied. Uses courier_matcher.

    The matched THN is taken from the highest-confidence suggestion. The
    full suggestion list is attached to the line as 'thn_suggestions' so
    the UI can offer alternatives.

    If the matched THN is not in the CET DB but the matcher provided an
    operationally-validated duty rate (via the keyword index's fallback
    rate), that rate is propagated to the line as `duty_rate_override` so
    the duty engine uses it for calculation.
    """
    description = (payload.get("description") or "").strip()
    if description and not (payload.get("thn") or "").strip():
        match = courier_matcher.suggest_thns(description, limit=5)
        best = match.get("best_match")
        if best and best.get("tariff_needs_review"):
            # The backing tariff entry is quarantined (OCR-recovered code or
            # unconfirmed rate). Don't auto-assign — leave the line
            # unclassified with the suggestions attached so a broker picks
            # explicitly; that selection is the confirmation.
            payload = dict(payload)
            payload["thn_suggestions"] = match["suggestions"]
            payload["thn_match_source"] = match["source"]
            payload["thn_needs_review"] = True
        elif best:
            payload = dict(payload)
            payload["thn"] = best["thn"]
            payload["thn_suggestions"] = match["suggestions"]
            payload["thn_match_source"] = match["source"]
            payload["thn_confidence"] = best.get("confidence")

            # If the matcher's best match has a non-zero rate but the THN
            # isn't in the CET DB (is_unknown), pass the rate as an
            # override so the duty engine uses it instead of defaulting
            # to 0. Exempt classes already work correctly without this.
            if (
                best.get("is_unknown")
                and best.get("exemption_class") == "none"
                and best.get("duty_rate", 0) > 0
            ):
                payload["duty_rate_override"] = best["duty_rate"]

            # Per-line exemption intent: for catch-all THNs (e.g. 39269090),
            # only THIS line gets exempted if the description genuinely
            # identifies a cellphone accessory. Generic items under the same
            # THN keep paying the normal rate. This replaces the old blanket
            # THN-level exemption that wrongly exempted every 39269090 line.
            if best.get("exemption_intent"):
                payload["exemption_override"] = best["exemption_intent"]

    line = add_line(manifest_id, payload)
    return line


# ── Officer examination ──────────────────────────────────────────────────────


def _recalc_correction(corr: Dict[str, Any], rate: float, manifest: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Recompute a correction's tax fields server-side from officer_thn +
    add_cost_usd, applying the THN's exemption class correctly.

    This is a safety net for Issue #5: the frontend computes these too,
    but if it sends stale/wrong values (e.g. after the officer changes the
    THN), the server is the source of truth. We only recompute when there's
    enough input (officer_thn + a positive add_cost_usd) AND the correction
    didn't explicitly supply negative adjustments (tax-removal corrections
    intentionally carry negative values — we leave those alone).
    """
    from . import courier_duty

    officer_thn = (corr.get("officer_thn") or "").replace(".", "").strip()
    add_cost = float(corr.get("add_cost_usd") or 0)

    # Tax-removal corrections (negative add_duty etc.) are intentional —
    # don't clobber them.
    if any(float(corr.get(k) or 0) < 0 for k in ("add_duty", "add_opt", "add_vat")):
        return corr

    if not officer_thn:
        return corr

    cls = courier_duty.classify(officer_thn)

    # RECLASS with zero uplift: recompute against the original line CIF and
    # return deltas (new taxes - original taxes), so officers can change THN
    # without inventing a fake uplift amount.
    kind = str(corr.get("kind") or "").strip().lower()
    if add_cost <= 0 and kind == "reclass" and manifest is not None:
        line_no = corr.get("line_no")
        line = next((ln for ln in (manifest.get("lines") or []) if ln.get("line_no") == line_no), None)
        if line:
            base_cif = float(line.get("cif_ttd") or 0)
            old_duty = float(line.get("duty") or 0)
            old_opt = float(line.get("opt") or 0)
            old_vat = float(line.get("vat") or 0)

            if cls.exemption_class == "full_exempt":
                new_duty = new_opt = new_vat = 0.0
            elif cls.exemption_class == "duty_free_only":
                new_duty = 0.0
                new_opt = round(base_cif * 0.07, 2)
                new_vat = round((base_cif + new_duty + new_opt) * 0.125, 2)
            else:
                new_duty = round(base_cif * cls.duty_rate, 2)
                new_opt = round(base_cif * 0.07, 2)
                new_vat = round((base_cif + new_duty + new_opt) * 0.125, 2)

            out = dict(corr)
            out["adjusted_cif_ttd"] = 0.0
            out["add_duty"] = round(new_duty - old_duty, 2)
            out["add_opt"] = round(new_opt - old_opt, 2)
            out["add_vat"] = round(new_vat - old_vat, 2)
            out["add_total"] = round(out["add_duty"] + out["add_opt"] + out["add_vat"], 2)
            return out

    # Uplift recompute path requires positive add cost.
    if add_cost <= 0:
        return corr

    cif = round(add_cost * rate, 2)

    if cls.exemption_class == "full_exempt":
        duty = opt = vat = 0.0
    elif cls.exemption_class == "duty_free_only":
        duty = 0.0
        opt = round(cif * 0.07, 2)
        vat = round((cif + duty + opt) * 0.125, 2)
    else:
        duty = round(cif * cls.duty_rate, 2)
        opt = round(cif * 0.07, 2)
        vat = round((cif + duty + opt) * 0.125, 2)

    out = dict(corr)
    out["adjusted_cif_ttd"] = cif
    out["add_duty"] = duty
    out["add_opt"] = opt
    out["add_vat"] = vat
    out["add_total"] = round(duty + opt + vat, 2)
    return out


def record_examination(manifest_id: str, exam: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Record officer examination corrections.

    Expected payload:
    {
      "examined_at": "YYYY-MM-DD",
      "examining_officer": "...",
      "corrections": [
        {
          "line_no": <int or null for new lines>,
          "kind": "uplift" | "reclass" | "new_line" | "description" | "seizure",
          "officer_thn": "...",
          "new_description": "...",
          "add_cost_usd": <float>,
          "adjusted_cif_ttd": <float>,
          "add_duty": <float>, "add_opt": <float>, "add_vat": <float>,
          "add_total": <float>,
          "detained_seized": <bool>,
          "dep_in_tshed": <bool>
        },
        ...
      ]
    }
    """
    def _mutate(manifest: Dict[str, Any]) -> Dict[str, Any]:
        rate = _ensure_float(manifest.get("exch_rate")) or 0.0
        raw_corrections = exam.get("corrections") or []
        # Recompute every correction server-side so officer THN changes always
        # produce correct duty/OPT/VAT, regardless of what the frontend sent.
        corrections = [_recalc_correction(c, rate, manifest) for c in raw_corrections]

        manifest["officer_examination"] = {
            "examined_at": (exam.get("examined_at") or "").strip(),
            "examining_officer": (exam.get("examining_officer") or "").strip(),
            "corrections": corrections,
            "recorded_at": _utcnow(),
        }
        manifest["status"] = "examined"
        manifest["updated_at"] = _utcnow()
        return manifest

    return manifests_repo.update(manifest_id, _mutate)


# ── Public surface ───────────────────────────────────────────────────────────

__all__ = [
    "create_manifest",
    "list_manifests",
    "get_manifest",
    "update_manifest_header",
    "delete_manifest",
    "add_line",
    "add_line_with_auto_thn",
    "update_line",
    "delete_line",
    "record_examination",
]
