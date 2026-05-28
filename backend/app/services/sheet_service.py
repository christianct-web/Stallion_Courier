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

SHEETS_FILE = DATA / "declaration_sheets.json"


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
    duty      = 0 if relieved else cif_ttd * duty_pct/100
    surcharge = 0 if relieved else cif_ttd * surcharge_pct/100
    vat       = 0 if relieved else (cif_ttd + duty + surcharge) * vat_pct/100
    total_tax = duty + surcharge + vat
    """
    exworks = _f(line.get("exworks_usd"))

    cif_ttd = round(exworks * factor, 2)
    cif_usd = round(cif_ttd / exch, 2) if exch else 0.0
    freight_usd = round(cif_usd - exworks, 2)  # informational: freight+ins+other share

    duty_pct = _f(line.get("duty_pct"))
    surch_pct = _f(line.get("surcharge_pct"))
    vat_pct = _f(line.get("vat_pct"), 12.5)

    if relieved:
        duty = surcharge = vat = 0.0
    else:
        duty = round(cif_ttd * duty_pct / 100, 2)
        surcharge = round(cif_ttd * surch_pct / 100, 2)
        vat = round((cif_ttd + duty + surcharge) * vat_pct / 100, 2)
    total_tax = round(duty + surcharge + vat, 2)

    line["freight_usd"] = freight_usd
    line["cif_usd"] = cif_usd
    line["cif_ttd"] = cif_ttd
    line["duty"] = duty
    line["surcharge"] = surcharge
    line["vat"] = vat
    line["total_tax"] = total_tax
    line["relieved"] = relieved
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
        "customs_user_fee": round(cfu, 2),
    }
    # ACE-style relief vs payable: relieved lines' notional duty/VAT is "relief"
    relief_duty = relief_vat = 0.0
    for l in lines:
        if l.get("relieved"):
            base = _f(l.get("cif_ttd"))
            d = round(base * _f(l.get("duty_pct")) / 100, 2)
            v = round((base + d) * _f(l.get("vat_pct"), 12.5) / 100, 2)
            relief_duty += d
            relief_vat += v
    totals["relief_duty"] = round(relief_duty, 2)
    totals["relief_vat"] = round(relief_vat, 2)
    totals["relief_total"] = round(relief_duty + relief_vat, 2)
    totals["payable_taxes"] = round(totals["duty"] + totals["surcharge"] + totals["vat"], 2)
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
        # computed (filled by _compute_line)
        "freight_usd": 0.0, "cif_usd": 0.0, "cif_ttd": 0.0,
        "duty": 0.0, "surcharge": 0.0, "vat": 0.0, "total_tax": 0.0,
        "relieved": False,
    }


def _blank_sheet() -> Dict[str, Any]:
    now = _utcnow()
    return {
        "id": _new_id(),
        "reference": "",
        "status": "draft",
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
        # data
        "cif_factor": 0.0,
        "lines": [],
        "totals": {},
        "broker_notes": "",
        "created_at": now, "updated_at": now,
    }


# ── store CRUD ───────────────────────────────────────────────────────────────
def _load() -> List[Dict[str, Any]]:
    return _safe_read(SHEETS_FILE)


def _save(items: List[Dict[str, Any]]) -> None:
    _safe_write(SHEETS_FILE, items)


def list_sheets() -> List[Dict[str, Any]]:
    return _load()


def get_sheet(sheet_id: str) -> Optional[Dict[str, Any]]:
    return next((s for s in _load() if s["id"] == sheet_id), None)


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
    for k, v in patch.items():
        if k in sheet and k not in ("id", "lines", "totals", "created_at"):
            sheet[k] = v
    recompute(sheet)
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
            "hsCode": hs,
            "description": desc,
            "valueForeign": round(sum(_f(r.get("exworks_usd")) for r in rows), 2),
            "cifForeign": round(sum(_f(r.get("cif_usd")) for r in rows), 2),
            "cifLocal": round(sum(_f(r.get("cif_ttd")) for r in rows), 2),
            "dutyRate": 0,
            "vatRate": 0,
            "duty": round(sum(_f(r.get("duty")) for r in rows), 2),
            "vat": round(sum(_f(r.get("vat")) for r in rows), 2),
            "countryOfOrigin": rows[0].get("country_of_origin", "TT"),
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
    header = {
        "consignee": sheet.get("consignee"),
        "consigneeCode": sheet.get("consignee_tin"),
        "consignor": sheet.get("consignor"),
        "vessel": sheet.get("vessel"),
        "blNumber": sheet.get("bl_number"),
        "rotationNumber": sheet.get("rotation_no"),
        "invoiceNumber": sheet.get("invoice_no"),
        "invoiceDate": sheet.get("invoice_date"),
        "currency": sheet.get("currency", "USD"),
        "port": sheet.get("port"),
        "arrivalDate": sheet.get("arrival_date"),
        "term": sheet.get("incoterm"),
        "customsRegime": sheet.get("customs_regime", "C4"),
        "natureOfTransaction": sheet.get("nature_of_transaction", "1"),
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
        items = []
        for ln in sheet.get("lines", []):
            items.append({
                "cpc": ln.get("cpc"),
                "hsCode": ln.get("hs_code"),
                "description": ln.get("description"),
                "valueForeign": ln.get("exworks_usd"),
                "cifForeign": ln.get("cif_usd"),
                "cifLocal": ln.get("cif_ttd"),
                "dutyRate": ln.get("duty_pct"),
                "vatRate": ln.get("vat_pct"),
                "duty": ln.get("duty"),
                "vat": ln.get("vat"),
                "countryOfOrigin": ln.get("country_of_origin"),
                "qty": ln.get("supplementary_qty"),
                "supplementaryUnit": ln.get("supplementary_unit"),
                "packageCount": ln.get("package_count"),
                "packageType": ln.get("package_type"),
                "licenceNo": ln.get("licence_no"),
            })
    return {"header": header, "worksheet": worksheet, "items": items, "containers": []}
