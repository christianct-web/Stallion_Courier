"""
concession_service.py — C84 duty/tax relief logic.

A C84 is filed alongside (or as) a customs entry to claim a duty/tax concession.
The three concession quantum types that cover virtually all T&T C84 work:

  1. FULL     — duty + surcharge + VAT all relieved to zero.
                (Returning-resident used personal/household effects; diplomatic
                 missions on most goods; approved-enterprise full waiver.)

  2. CAPPED   — relief is granted up to a TT$ ceiling; tax above the ceiling is
                payable. This is the returning-resident MOTOR VEHICLE concession:
                the first portion of the assessed tax is waived up to a cap that
                depends on engine size band, the remainder is paid.

  3. RATE     — the normal duty/VAT rates are replaced by concessionary rates
                (often 0% duty but VAT still applies, or a flat reduced rate).
                Used for some approved-undertaking and partial-relief grants.

The legacy/binary "relieved" path in sheet_service handles the FULL case for
effects. This module generalises it so a single C84 entry can mix, e.g., fully
relieved effects + a capped vehicle on the same declaration, and so the
relief-vs-payable split is computed correctly for the C84 form and the SAD.

NOTE ON CAPS: the engine-size cap bands below are stored as editable defaults.
T&T revises the returning-resident vehicle tax ceiling from time to time; the
broker can override the cap per line. The numbers here are sensible starting
defaults and MUST be confirmed against the current Customs notice before filing.
Treat them as a calculation scaffold, not legal advice.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def _f(v: Any, default: float = 0.0) -> float:
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# ── concession catalogue ─────────────────────────────────────────────────────
# Each concession code carries: a label, the quantum type, and the default
# treatment. `cpc` is the suggested ASYCUDA additional/national procedure hint
# the broker can accept or override. These are surfaced as a dropdown.
CONCESSIONS: List[Dict[str, Any]] = [
    {
        "code": "RR_EFFECTS",
        "label": "Returning Resident — Used Personal / Household Effects",
        "quantum": "full",
        "legal": "Customs Act 78:01; Returning Residents Concession",
        "applies_to": "effects",
        "notes": "Owned & used abroad ≥6 months; resident abroad ≥1 year; permanent return.",
    },
    {
        "code": "RR_VEHICLE",
        "label": "Returning Resident — Motor Vehicle (capped relief)",
        "quantum": "capped",
        "legal": "Motor Vehicles & Road Traffic Act 48:50; RR vehicle concession",
        "applies_to": "vehicle",
        "notes": "One vehicle; owned & used abroad ≥6 months. Relief capped by engine band.",
    },
    {
        "code": "DIPLOMATIC",
        "label": "Diplomatic / Consular Relief",
        "quantum": "full",
        "legal": "Diplomatic Privileges & Immunities Act; Vienna Convention",
        "applies_to": "any",
        "notes": "Accredited mission or qualifying personnel.",
    },
    {
        "code": "APPROVED_ENTERPRISE",
        "label": "Approved Enterprise / Undertaking (full waiver)",
        "quantum": "full",
        "legal": "Fiscal Incentives / Free Zone / Cabinet-approved undertaking",
        "applies_to": "any",
        "notes": "Carry the approval reference onto the C84.",
    },
    {
        "code": "RATE_CONCESSION",
        "label": "Concessionary Rate (partial relief)",
        "quantum": "rate",
        "legal": "Cabinet / Minister rate concession",
        "applies_to": "any",
        "notes": "Duty/VAT replaced by the concessionary rates entered on the line.",
    },
]

CONCESSION_BY_CODE = {c["code"]: c for c in CONCESSIONS}


# ── returning-resident vehicle relief cap bands (DEFAULTS — confirm currency) ──
# Cap is the maximum TT$ of (duty + MVT) relieved. Above the cap is payable.
# Bands keyed by engine displacement (cc). VAT is generally NOT relieved on the
# vehicle even when duty/MVT are capped, so VAT is computed on full CIF unless
# the line explicitly relieves it.
VEHICLE_CAP_BANDS: List[Dict[str, Any]] = [
    {"max_cc": 1599, "cap_ttd": 30000.0, "label": "≤1599cc"},
    {"max_cc": 1799, "cap_ttd": 40000.0, "label": "1600–1799cc"},
    {"max_cc": 1999, "cap_ttd": 50000.0, "label": "1800–1999cc"},
    {"max_cc": 2499, "cap_ttd": 60000.0, "label": "2000–2499cc"},
    {"max_cc": 10 ** 9, "cap_ttd": 0.0, "label": "≥2500cc (no concession)"},
]


def default_vehicle_cap(engine_cc: float) -> Dict[str, Any]:
    cc = _f(engine_cc)
    for band in VEHICLE_CAP_BANDS:
        if cc <= band["max_cc"]:
            return band
    return VEHICLE_CAP_BANDS[-1]


# ── core: compute relief for a single line under a concession ─────────────────
def compute_line_relief(
    *,
    cif_ttd: float,
    duty_pct: float,
    surcharge_pct: float,
    vat_pct: float,
    concession_code: Optional[str],
    engine_cc: float = 0.0,
    cap_override_ttd: Optional[float] = None,
    conc_duty_pct: Optional[float] = None,
    conc_vat_pct: Optional[float] = None,
    mvt_ttd: float = 0.0,
) -> Dict[str, float]:
    """
    Return the payable + relieved split for one line.

    Always computes the *notional full* tax first (what would be paid with no
    concession), then derives what the concession relieves. The caller writes
    `duty/surcharge/vat/total_tax` (payable) onto the line and uses the
    `relief_*` fields for the C84 form and the relief totals.

    Output keys (all TT$):
      duty, surcharge, vat, mvt, total_tax        -> PAYABLE
      relief_duty, relief_surcharge, relief_vat,
      relief_mvt, relief_total                    -> RELIEVED
      full_duty, full_surcharge, full_vat,
      full_mvt, full_total                        -> NOTIONAL (no concession)
      cap_applied_ttd                             -> cap used (capped type only)
    """
    cif = _f(cif_ttd)
    dp, sp, vp = _f(duty_pct), _f(surcharge_pct), _f(vat_pct)
    mvt = _f(mvt_ttd)

    # Notional full assessment (no concession).
    full_duty = round(cif * dp / 100, 2)
    full_surch = round(cif * sp / 100, 2)
    full_vat = round((cif + full_duty + full_surch + mvt) * vp / 100, 2)
    full_mvt = round(mvt, 2)
    full_total = round(full_duty + full_surch + full_vat + full_mvt, 2)

    conc = CONCESSION_BY_CODE.get(concession_code or "")
    quantum = conc["quantum"] if conc else None

    def _result(pay_duty, pay_surch, pay_vat, pay_mvt, cap_applied=0.0):
        pay_duty = round(pay_duty, 2)
        pay_surch = round(pay_surch, 2)
        pay_vat = round(pay_vat, 2)
        pay_mvt = round(pay_mvt, 2)
        pay_total = round(pay_duty + pay_surch + pay_vat + pay_mvt, 2)
        return {
            "duty": pay_duty, "surcharge": pay_surch, "vat": pay_vat,
            "mvt": pay_mvt, "total_tax": pay_total,
            "relief_duty": round(full_duty - pay_duty, 2),
            "relief_surcharge": round(full_surch - pay_surch, 2),
            "relief_vat": round(full_vat - pay_vat, 2),
            "relief_mvt": round(full_mvt - pay_mvt, 2),
            "relief_total": round(full_total - pay_total, 2),
            "full_duty": full_duty, "full_surcharge": full_surch,
            "full_vat": full_vat, "full_mvt": full_mvt, "full_total": full_total,
            "cap_applied_ttd": round(cap_applied, 2),
        }

    # No concession on this line -> everything payable.
    if quantum is None:
        return _result(full_duty, full_surch, full_vat, full_mvt)

    # FULL: relieve duty + surcharge + VAT (+ MVT if any).
    if quantum == "full":
        return _result(0.0, 0.0, 0.0, 0.0)

    # RATE: replace duty/VAT with concessionary rates; surcharge follows duty
    # relief convention (relieved unless a rate is given via conc_duty_pct path).
    if quantum == "rate":
        cdp = _f(conc_duty_pct, 0.0)
        cvp = conc_vat_pct if conc_vat_pct is not None else vp
        pay_duty = round(cif * cdp / 100, 2)
        pay_surch = 0.0
        pay_vat = round((cif + pay_duty) * _f(cvp) / 100, 2)
        pay_mvt = 0.0
        return _result(pay_duty, pay_surch, pay_vat, pay_mvt)

    # CAPPED (returning-resident vehicle): relief on (duty + surcharge + MVT)
    # capped at the band ceiling; VAT remains payable on full assessed value.
    if quantum == "capped":
        cap = cap_override_ttd
        if cap is None:
            cap = default_vehicle_cap(engine_cc)["cap_ttd"]
        cap = _f(cap)
        # Pool eligible for capped relief: duty + surcharge + MVT (NOT vat).
        eligible = full_duty + full_surch + full_mvt
        relieved_pool = min(cap, eligible)
        payable_pool = round(eligible - relieved_pool, 2)
        # Apportion the payable pool back across duty/surcharge/mvt pro-rata so
        # the C84 shows where the residual sits.
        if eligible > 0:
            pd = round(payable_pool * (full_duty / eligible), 2)
            ps = round(payable_pool * (full_surch / eligible), 2)
            pm = round(payable_pool - pd - ps, 2)  # remainder absorbs rounding
        else:
            pd = ps = pm = 0.0
        # VAT recomputed on (CIF + payable duty + payable surcharge + payable mvt).
        pay_vat = round((cif + pd + ps + pm) * vp / 100, 2)
        return _result(pd, ps, pay_vat, pm, cap_applied=relieved_pool)

    return _result(full_duty, full_surch, full_vat, full_mvt)


# ── sheet-level: is this a C84? does it carry a concession? ───────────────────
def sheet_is_c84(sheet: Dict[str, Any]) -> bool:
    return (sheet.get("declaration_type") == "c84"
            or bool(sheet.get("concession", {}).get("active")))


def concession_summary(sheet: Dict[str, Any]) -> Dict[str, Any]:
    """Roll the per-line relief into declaration totals for the C84 form."""
    lines = sheet.get("lines", [])
    keys = ["relief_duty", "relief_surcharge", "relief_vat", "relief_mvt",
            "relief_total", "full_total"]
    out = {k: round(sum(_f(l.get(k)) for l in lines), 2) for k in keys}
    out["payable_total"] = round(sum(_f(l.get("total_tax")) for l in lines), 2)
    out["lines_relieved"] = sum(
        1 for l in lines if _f(l.get("relief_total")) > 0
    )
    return out
