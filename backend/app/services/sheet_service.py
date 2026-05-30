"""
sheet_service.py — Stallion "Sheet" engine.

The simplified replacement for the Workbench. A declaration is now a flat
document: a header strip + a list of line rows, recomputed server-side on
every edit. Mirrors the proven courier_service pattern (create / add_line /
update_line / recompute_all) but uses Stallion's CIF→duty→surcharge→VAT math
and carries the extra C82-only fields each line needs for XML generation.

Persistence: data/declaration_sheets.json via the common store helpers.

Drop into backend/app/services/sheet_service.py
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..store import _safe_read, _safe_write, DATA
from . import concession_service

SHEETS_FILE = DATA / "declaration_sheets.json"

# Seed an empty store on fresh checkout/deploy. _safe_read() does a bare
# read_text() with no existence guard (same as the other stores), and unlike
# templates.json / declarations.json this file is not seeded in store.py — so
# without this the first /sheets call 500s with FileNotFoundError.
if not SHEETS_FILE.exists():
    SHEETS_FILE.write_text("[]", encoding="utf-8")


# ── small helpers ────────────────────────────────────────────────────────────
def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _f(v: Any, default: float = 0.0) -> float:
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# ── per-line compute (Stallion duty math) ────────────────────────────────────
def _compute_line(line: Dict[str, Any], exch: float, factor: float,
                  relieved: bool = False) -> Dict[str, Any]:
    """
    Recompute one line using the ACE single-factor method.

    cif_ttd   = exworks_usd * factor              (factor already folds freight+FX)
    freight_usd = exworks_usd * (factor/exch - 1) -> informational split only
    cif_usd   = cif_ttd / exch

    Tax treatment, in priority order:
      1. A C84 concession_code on the line -> route through concession_service,
         which computes the payable/relieved split (full | capped | rate).
      2. Legacy `relieved` flag (returning-resident effects, whole-entry relief)
         -> duty/surcharge/vat all zero. Equivalent to a FULL concession.
      3. Otherwise -> full assessment.

    The concession path additionally writes relief_* and full_* fields so the
    C84 form and the relief totals have the per-line breakdown.
    """
    exworks = _f(line.get("exworks_usd"))

    cif_ttd = round(exworks * factor, 2)
    cif_usd = round(cif_ttd / exch, 2) if exch else 0.0
    freight_usd = round(cif_usd - exworks, 2)  # informational: freight+ins+other share

    duty_pct = _f(line.get("duty_pct"))
    surch_pct = _f(line.get("surcharge_pct"))
    vat_pct = _f(line.get("vat_pct"), 12.5)
    mvt = _f(line.get("mvt_ttd"))

    concession_code = (line.get("concession_code") or "").strip() or None

    line["freight_usd"] = freight_usd
    line["cif_usd"] = cif_usd
    line["cif_ttd"] = cif_ttd

    # Relief keys we may set; clear them first so toggling concession off resets.
    _relief_keys = ["mvt", "relief_duty", "relief_surcharge", "relief_vat",
                    "relief_mvt", "relief_total", "full_duty", "full_surcharge",
                    "full_vat", "full_mvt", "full_total", "cap_applied_ttd"]

    if concession_code:
        r = concession_service.compute_line_relief(
            cif_ttd=cif_ttd, duty_pct=duty_pct, surcharge_pct=surch_pct,
            vat_pct=vat_pct, concession_code=concession_code,
            engine_cc=_f(line.get("engine_cc")),
            cap_override_ttd=(None if line.get("cap_override_ttd") in (None, "", 0)
                              else _f(line.get("cap_override_ttd"))),
            conc_duty_pct=line.get("conc_duty_pct"),
            conc_vat_pct=line.get("conc_vat_pct"),
            mvt_ttd=mvt,
        )
        line["duty"] = r["duty"]
        line["surcharge"] = r["surcharge"]
        line["vat"] = r["vat"]
        line["total_tax"] = r["total_tax"]
        line["relieved"] = r["relief_total"] > 0
        for k in _relief_keys:
            line[k] = r[k]
        return line

    # No concession on the line. Legacy full-relief or full assessment.
    if relieved:
        duty = surcharge = vat = 0.0
    else:
        duty = round(cif_ttd * duty_pct / 100, 2)
        surcharge = round(cif_ttd * surch_pct / 100, 2)
        vat = round((cif_ttd + duty + surcharge + mvt) * vat_pct / 100, 2)
    total_tax = round(duty + surcharge + vat + (0.0 if relieved else mvt), 2)

    line["duty"] = duty
    line["surcharge"] = surcharge
    line["vat"] = vat
    line["mvt"] = 0.0 if relieved else round(mvt, 2)
    line["total_tax"] = total_tax
    line["relieved"] = relieved
    # Clear concession-only breakdown fields when no concession is active.
    for k in ["relief_duty", "relief_surcharge", "relief_vat", "relief_mvt",
              "relief_total", "full_duty", "full_surcharge", "full_vat",
              "full_mvt", "full_total", "cap_applied_ttd"]:
        line[k] = 0.0
    return line


def _renumber(lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for i, ln in enumerate(lines, start=1):
        ln["line_no"] = i
    return lines


def _factor(sheet: Dict[str, Any]) -> float:
    """
    ACE-style CIF factor = total CIF (TT$) / total ex-works value (USD).

    Folds freight + insurance + other + exchange rate into ONE multiplier.
    Each line's CIF TT$ = line ex-works value * factor. Matches ASYCUDA/ACE
    worksheet output exactly (e.g. 62,624.32 / 1,835.00 = 34.127694822888).
    """
    exch = _f(sheet.get("exchange_rate"), 1.0)
    base = sum(_f(ln.get("exworks_usd")) for ln in sheet.get("lines", []))
    if base <= 0:
        return 0.0
    freight = _f(sheet.get("freight_usd"))
    insurance = _f(sheet.get("insurance_usd"))
    other = _f(sheet.get("other_usd"))
    inland = _f(sheet.get("inland_usd"))
    uplift_pct = _f(sheet.get("uplift_pct"))
    fob = base + inland + (base * uplift_pct / 100)
    cif_usd = fob + freight + insurance + other
    cif_ttd = round(cif_usd * exch, 2)   # ACE derives the factor from the ROUNDED CIF total
    return cif_ttd / base   # e.g. 62,624.32 / 1,835 = 34.127694822888


def recompute(sheet: Dict[str, Any]) -> Dict[str, Any]:
    exch = _f(sheet.get("exchange_rate"), 1.0)
    factor = _factor(sheet)
    sheet["cif_factor"] = factor
    relieved = sheet.get("entry_mode") == "relieved"
    for ln in sheet.get("lines", []):
        # a line can be individually relieved, or the whole entry is relieved
        line_relief = relieved or bool(ln.get("relieved_override"))
        _compute_line(ln, exch, factor, relieved=line_relief)
    lines = sheet.get("lines", [])
    cfu = _f(sheet.get("customs_user_fee"), 80.0)
    totals = {
        "exworks_usd": round(sum(_f(l.get("exworks_usd")) for l in lines), 2),
        "cif_usd": round(sum(_f(l.get("cif_usd")) for l in lines), 2),
        "cif_ttd": round(sum(_f(l.get("cif_ttd")) for l in lines), 2),
        "duty": round(sum(_f(l.get("duty")) for l in lines), 2),
        "surcharge": round(sum(_f(l.get("surcharge")) for l in lines), 2),
        "vat": round(sum(_f(l.get("vat")) for l in lines), 2),
        "mvt": round(sum(_f(l.get("mvt")) for l in lines), 2),
        "customs_user_fee": round(cfu, 2),
    }
    # Relief vs payable. Concession lines already carry an exact relief_* split
    # from concession_service; legacy whole-entry relief lines (no concession
    # code, relieved=True) still need their notional relief derived here.
    relief_duty = relief_surch = relief_vat = relief_mvt = 0.0
    for l in lines:
        if l.get("concession_code"):
            relief_duty += _f(l.get("relief_duty"))
            relief_surch += _f(l.get("relief_surcharge"))
            relief_vat += _f(l.get("relief_vat"))
            relief_mvt += _f(l.get("relief_mvt"))
        elif l.get("relieved"):
            base = _f(l.get("cif_ttd"))
            d = round(base * _f(l.get("duty_pct")) / 100, 2)
            s = round(base * _f(l.get("surcharge_pct")) / 100, 2)
            v = round((base + d + s) * _f(l.get("vat_pct"), 12.5) / 100, 2)
            relief_duty += d
            relief_surch += s
            relief_vat += v
    totals["relief_duty"] = round(relief_duty, 2)
    totals["relief_surcharge"] = round(relief_surch, 2)
    totals["relief_vat"] = round(relief_vat, 2)
    totals["relief_mvt"] = round(relief_mvt, 2)
    totals["relief_total"] = round(relief_duty + relief_surch + relief_vat + relief_mvt, 2)
    totals["payable_taxes"] = round(
        totals["duty"] + totals["surcharge"] + totals["vat"] + totals["mvt"], 2)
    totals["total_payable"] = round(totals["payable_taxes"] + cfu, 2)
    sheet["totals"] = totals
    sheet["updated_at"] = _utcnow()
    return sheet


# ── default shapes ───────────────────────────────────────────────────────────
def _blank_line() -> Dict[str, Any]:
    return {
        "id": _new_id(),
        "line_no": 0,
        # grid fields
        "cpc": "4000",
        "hs_code": "",
        "description": "",
        "exworks_usd": 0.0,
        "insurance_usd": 0.0,
        "other_usd": 0.0,
        "freight_usd_override": None,
        "duty_pct": 0.0,
        "surcharge_pct": 0.0,
        "vat_pct": 12.5,
        # C82-only fields (edited in the row drawer, dropdown-driven)
        "country_of_origin": "TT",
        "supplementary_qty": 0,
        "supplementary_unit": "",
        "package_count": 1,
        "package_type": "PK",
        "licence_no": "",
        # returning-resident handling
        "relieved_override": False,        # relieve this line individually
        "effects_group": "household",      # household | personal -> rolls to 9898 code on XML
        # C84 concession handling (see concession_service)
        "concession_code": "",             # "" | RR_EFFECTS | RR_VEHICLE | DIPLOMATIC | …
        "engine_cc": 0.0,                  # vehicle: drives the relief cap band
        "cap_override_ttd": 0.0,           # vehicle: override the default cap (0 = use band)
        "conc_duty_pct": None,             # rate concession: concessionary duty %
        "conc_vat_pct": None,              # rate concession: concessionary VAT %
        "mvt_ttd": 0.0,                    # vehicle: Motor Vehicle Tax in TT$
        # computed (filled by _compute_line)
        "freight_usd": 0.0, "cif_usd": 0.0, "cif_ttd": 0.0,
        "duty": 0.0, "surcharge": 0.0, "vat": 0.0, "mvt": 0.0, "total_tax": 0.0,
        "relieved": False,
        # concession breakdown (filled when concession_code set)
        "relief_duty": 0.0, "relief_surcharge": 0.0, "relief_vat": 0.0,
        "relief_mvt": 0.0, "relief_total": 0.0,
        "full_duty": 0.0, "full_surcharge": 0.0, "full_vat": 0.0,
        "full_mvt": 0.0, "full_total": 0.0, "cap_applied_ttd": 0.0,
    }


def _blank_sheet() -> Dict[str, Any]:
    now = _utcnow()
    return {
        "id": _new_id(),
        "reference": "",
        "status": "draft",
        # lifecycle: draft -> pending -> approved -> submitted -> receipted
        #            (or -> correction from pending/approved)
        "client_id": "",
        "reviewed_at": "",
        "reviewed_by": "",
        "submitted_at": "",
        "receipt_number": "",
        "status_history": [],
        # header strip
        "consignee": "", "consignee_tin": "",
        "consignor": "",
        "vessel": "", "bl_number": "",
        "port": "TTPTS",
        "arrival_date": "",
        "rotation_no": "",
        "invoice_no": "",
        "invoice_date": "",
        "currency": "USD",
        "incoterm": "CFR",
        "exchange_rate": 0.0,
        "freight_usd": 0.0,
        "insurance_usd": 0.0,
        "other_usd": 0.0,
        "inland_usd": 0.0,
        "uplift_pct": 0.0,
        "customs_user_fee": 80.0,
        # entry treatment: "dutiable" (default) | "relieved" (returning resident)
        "entry_mode": "dutiable",
        "rollup_9898": True,   # on XML, consolidate to 9898 personal/household codes
        # declaration-level C82 fields (generate-XML modal)
        "customs_regime": "C4",
        "nature_of_transaction": "1",
        "total_packages": 0,
        "gross_weight": 0.0,
        # declaration type (set by the New Declaration chooser on the frontend)
        "declaration_type": "import_c82",
        # C84 concession header (the beneficiary / qualification block)
        "concession": {
            "active": False,
            "code": "",                 # primary concession on the declaration
            "beneficiary_name": "",
            "beneficiary_id": "",       # passport / national ID / mission ref
            "approval_ref": "",         # Cabinet/Customs approval or grant reference
            "residence_abroad_from": "",
            "residence_abroad_to": "",
            "return_date": "",
            "declaration_no": "",       # the C84 form serial once filed
            "notes": "",
        },
        # data
        "cif_factor": 0.0,
        "lines": [],
        "totals": {},
        "broker_notes": "",
        "created_at": now, "updated_at": now,
    }


# ── store CRUD ───────────────────────────────────────────────────────────────
def _migrate_sheet(sheet: Dict[str, Any]) -> Dict[str, Any]:
    """
    Backfill fields added after a sheet was first written, so older records in
    the JSON store don't KeyError when the new concession code touches them.
    Idempotent; safe to call on every read/update.
    """
    blank = _blank_sheet()
    for k, v in blank.items():
        if k in ("id", "created_at", "updated_at"):
            continue
        if k not in sheet:
            sheet[k] = v
    # concession sub-keys
    if isinstance(sheet.get("concession"), dict):
        for k, v in blank["concession"].items():
            sheet["concession"].setdefault(k, v)
    blank_line = _blank_line()
    for ln in sheet.get("lines", []):
        for k, v in blank_line.items():
            if k not in ln:
                ln[k] = v
    return sheet


def _load() -> List[Dict[str, Any]]:
    return _safe_read(SHEETS_FILE)


def _save(items: List[Dict[str, Any]]) -> None:
    _safe_write(SHEETS_FILE, items)


def list_sheets() -> List[Dict[str, Any]]:
    return _load()


def get_sheet(sheet_id: str) -> Optional[Dict[str, Any]]:
    s = next((s for s in _load() if s["id"] == sheet_id), None)
    return _migrate_sheet(s) if s else None


def create_sheet(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    sheet = _blank_sheet()
    if payload:
        for k, v in payload.items():
            if k in sheet and k not in ("id", "lines", "totals"):
                sheet[k] = v
        for ln in payload.get("lines", []):
            row = _blank_line()
            row.update({k: v for k, v in ln.items() if k in row})
            sheet["lines"].append(row)
        _renumber(sheet["lines"])
    recompute(sheet)
    items = _load()
    items.append(sheet)
    _save(items)
    return sheet


def update_header(sheet_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    items = _load()
    sheet = next((s for s in items if s["id"] == sheet_id), None)
    if not sheet:
        return None
    _migrate_sheet(sheet)
    for k, v in patch.items():
        if k in ("id", "lines", "totals", "created_at", "status",
                 "status_history", "reviewed_at", "submitted_at"):
            continue
        # Deep-merge the concession block so partial updates don't wipe fields.
        if k == "concession" and isinstance(v, dict):
            sheet.setdefault("concession", {}).update(v)
        elif k in sheet:
            sheet[k] = v
    recompute(sheet)
    _save(items)
    return sheet


# Allowed lifecycle transitions. draft -> pending -> approved -> submitted -> receipted,
# with correction reachable from pending/approved and re-openable to pending.
_TRANSITIONS = {
    "draft": {"pending"},
    "pending": {"approved", "correction", "draft"},
    "correction": {"pending", "draft"},
    "approved": {"submitted", "correction"},
    "submitted": {"receipted"},
    "receipted": set(),
}


def set_status(sheet_id: str, new_status: str, *, actor: str = "broker",
               notes: str = "", receipt_number: str = "") -> Optional[Dict[str, Any]]:
    """Move a sheet through its lifecycle, recording history + timestamps."""
    items = _load()
    sheet = next((s for s in items if s["id"] == sheet_id), None)
    if not sheet:
        return None
    cur = sheet.get("status", "draft")
    if new_status not in _TRANSITIONS.get(cur, set()):
        raise ValueError(f"Illegal transition {cur} -> {new_status}")

    now = _utcnow()
    sheet["status"] = new_status
    sheet.setdefault("status_history", []).append({
        "from": cur, "to": new_status, "at": now, "actor": actor, "notes": notes,
    })
    if new_status in ("approved", "correction", "pending"):
        sheet["reviewed_at"] = now
        sheet["reviewed_by"] = actor
    if new_status == "submitted":
        sheet["submitted_at"] = now
    if new_status == "receipted" and receipt_number:
        sheet["receipt_number"] = receipt_number
    sheet["updated_at"] = now
    _save(items)
    return sheet


def add_line(sheet_id: str, payload: Dict[str, Any] | None = None) -> Optional[Dict[str, Any]]:
    items = _load()
    sheet = next((s for s in items if s["id"] == sheet_id), None)
    if not sheet:
        return None
    row = _blank_line()
    if payload:
        row.update({k: v for k, v in payload.items() if k in row})
    sheet["lines"].append(row)
    _renumber(sheet["lines"])
    recompute(sheet)
    _save(items)
    return sheet


def update_line(sheet_id: str, line_no: int, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    items = _load()
    sheet = next((s for s in items if s["id"] == sheet_id), None)
    if not sheet:
        return None
    line = next((l for l in sheet["lines"] if l["line_no"] == line_no), None)
    if not line:
        return None
    for k, v in patch.items():
        if k in line and k not in ("id", "line_no"):
            line[k] = v
    recompute(sheet)
    _save(items)
    return sheet


def delete_line(sheet_id: str, line_no: int) -> Optional[Dict[str, Any]]:
    items = _load()
    sheet = next((s for s in items if s["id"] == sheet_id), None)
    if not sheet:
        return None
    sheet["lines"] = [l for l in sheet["lines"] if l["line_no"] != line_no]
    _renumber(sheet["lines"])
    recompute(sheet)
    _save(items)
    return sheet


def delete_sheet(sheet_id: str) -> bool:
    items = _load()
    new = [s for s in items if s["id"] != sheet_id]
    if len(new) == len(items):
        return False
    _save(new)
    return True


# ── adapters to existing generators ──────────────────────────────────────────
def to_worksheet_dict(sheet: Dict[str, Any]) -> Dict[str, Any]:
    """Shape the sheet header into the worksheet dict calculate_from_dict expects."""
    t = sheet.get("totals", {})
    return {
        "invoice_value_foreign": t.get("exworks_usd", 0),
        "freight_foreign": t.get("freight_usd", 0),
        "insurance_foreign": _f(sheet.get("insurance_usd")),
        "exchange_rate": _f(sheet.get("exchange_rate"), 1.0),
        "customs_user_fee": _f(sheet.get("customs_user_fee"), 80.0),
    }


# 9898 consolidated returning-resident effects codes (ACE national tariff)
HS_HOUSEHOLD_EFFECTS = "9898.03.00.201"   # Used Household Effects
HS_PERSONAL_EFFECTS  = "9898.02.00.000"   # Used Personal Effects


def _rollup_9898(sheet: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Consolidate itemized lines into the two ACE 9898 effects lines for the XML.
    Grid stays itemized; only the XML payload is rolled up. Groups by each
    line's effects_group (household|personal).
    """
    groups = {"household": [], "personal": []}
    for ln in sheet.get("lines", []):
        g = ln.get("effects_group", "household")
        groups.get(g, groups["household"]).append(ln)

    rolled: List[Dict[str, Any]] = []
    spec = [
        ("household", HS_HOUSEHOLD_EFFECTS, "USED HOUSEHOLD EFFECTS"),
        ("personal", HS_PERSONAL_EFFECTS, "USED PERSONAL EFFECTS"),
    ]
    for key, hs, desc in spec:
        rows = groups[key]
        if not rows:
            continue
        rolled.append({
            "cpc": "4000",
            "additionalCpc": "000",
            "extendedCustomsProcedure": 4000,
            "nationalCustomsProcedure": 0,
            "hsCode": hs,
            "description": desc,
            # builder reads itemValue (CIF foreign) + itemValueLocal (CIF national)
            "itemValue": round(sum(_f(r.get("cif_usd")) for r in rows), 2),
            "itemValueLocal": round(sum(_f(r.get("cif_ttd")) for r in rows), 2),
            "currency": sheet.get("currency", "USD"),
            "exchangeRate": _f(sheet.get("exchange_rate"), 1.0),
            "dutyRate": 0,
            "vatRate": 0,
            "duty": round(sum(_f(r.get("duty")) for r in rows), 2),
            "vat": round(sum(_f(r.get("vat")) for r in rows), 2),
            "countryOfOrigin": rows[0].get("country_of_origin", "TT"),
            "natureOfTransaction": sheet.get("nature_of_transaction", "1"),
            "packageCount": sum(int(_f(r.get("package_count"), 1)) for r in rows),
            "packageType": rows[0].get("package_type", "PK"),
            "relieved": all(r.get("relieved") for r in rows),
        })
    return rolled


def to_decl_inputs(sheet: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build the (header, worksheet, items, containers) tuple-shaped dict that
    declaration_service.build_complete_declaration expects.

    If rollup_9898 is on, items are consolidated into the two ACE 9898 effects
    lines; otherwise every grid line is emitted individually.
    """
    t = sheet.get("totals", {})
    nature = sheet.get("nature_of_transaction", "1")
    header = {
        # builder reads consigneeName / consignorName / vesselName / blAwbNumber
        "consigneeName": sheet.get("consignee"),
        "consigneeCode": sheet.get("consignee_tin"),
        "consignorName": sheet.get("consignor"),
        "vesselName": sheet.get("vessel"),
        "blAwbNumber": sheet.get("bl_number"),
        "blAwbDate": sheet.get("bl_date", ""),
        "rotationNumber": sheet.get("rotation_no"),
        "invoiceNumber": sheet.get("invoice_no"),
        "invoiceDate": sheet.get("invoice_date"),
        "currency": sheet.get("currency", "USD"),
        "port": sheet.get("port"),
        "arrivalDate": sheet.get("arrival_date"),
        "etaDate": sheet.get("arrival_date"),
        "term": sheet.get("incoterm"),
        "customsRegime": sheet.get("customs_regime", "C4"),
        "natureOfTransaction": nature,
        "totalPackages": sheet.get("total_packages", 0),
        "grossWeight": sheet.get("gross_weight", 0),
        "reference": sheet.get("reference"),
    }
    worksheet = {
        "invoice_value_foreign": t.get("exworks_usd", 0),
        "fob_foreign": t.get("exworks_usd", 0),
        "freight_foreign": _f(sheet.get("freight_usd")),
        "insurance_foreign": _f(sheet.get("insurance_usd")),
        "exchange_rate": _f(sheet.get("exchange_rate"), 1.0),
    }

    if sheet.get("rollup_9898"):
        items = _rollup_9898(sheet)
    else:
        conc = sheet.get("concession", {}) or {}
        c84_no = conc.get("declaration_no", "")
        items = []
        for ln in sheet.get("lines", []):
            item = {
                "cpc": ln.get("cpc"),
                "extendedCustomsProcedure": int(_f(ln.get("cpc"), 4000)) or 4000,
                "nationalCustomsProcedure": 0,
                "hsCode": ln.get("hs_code"),
                "description": ln.get("description"),
                # builder reads itemValue (CIF foreign) + itemValueLocal (CIF national)
                "itemValue": ln.get("cif_usd"),
                "itemValueLocal": ln.get("cif_ttd"),
                "currency": sheet.get("currency", "USD"),
                "exchangeRate": _f(sheet.get("exchange_rate"), 1.0),
                "dutyRate": ln.get("duty_pct"),
                "vatRate": ln.get("vat_pct"),
                # duty/vat reflect PAYABLE amounts after any C84 concession.
                "duty": ln.get("duty"),
                "vat": ln.get("vat"),
                "natureOfTransaction": nature,
                "countryOfOrigin": ln.get("country_of_origin"),
                "qty": ln.get("supplementary_qty"),
                "supplementaryUnit": ln.get("supplementary_unit"),
                "packageCount": ln.get("package_count"),
                "packageType": ln.get("package_type"),
                "licenceNo": ln.get("licence_no"),
            }
            # When a concession is claimed on the line, attach the C84 linkage so
            # the SAD references the supporting concession document, and surface
            # the relieved amount for downstream consumers.
            if ln.get("concession_code"):
                item["concessionCode"] = ln.get("concession_code")
                item["reliefTotal"] = _f(ln.get("relief_total"))
                if c84_no:
                    item["c84Reference"] = c84_no
            items.append(item)
    return {"header": header, "worksheet": worksheet, "items": items, "containers": []}


def sheet_events() -> List[Dict[str, Any]]:
    """
    Flatten all sheets into activity-log events, shaped like the declarations
    /log feed so the Log page can merge them. One 'created' event per sheet,
    plus one event per status_history entry.
    """
    events: List[Dict[str, Any]] = []
    for s in _load():
        ref = s.get("reference") or s.get("id", "")[:12] or "—"
        consignee = s.get("consignee", "")
        sid = s.get("id", "")
        if s.get("created_at"):
            events.append({
                "event": "created", "declaration_id": sid, "reference": ref,
                "consignee": consignee, "source": "SHEET", "confidence": None,
                "timestamp": s["created_at"], "actor": "ops", "notes": "Sheet created",
            })
        for h in s.get("status_history", []):
            note = h.get("notes", "")
            if h.get("to") == "receipted" and s.get("receipt_number"):
                note = f"Receipt #{s['receipt_number']}"
            events.append({
                "event": h.get("to"), "declaration_id": sid, "reference": ref,
                "consignee": consignee, "source": "SHEET", "confidence": None,
                "timestamp": h.get("at", ""), "actor": h.get("actor", "broker"),
                "notes": note,
            })
    return events
