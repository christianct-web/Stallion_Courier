from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Set

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .declaration_service import build_complete_declaration, validate_decl, export_xml
from .worksheet_service import calculate_from_dict

APP_ROOT = Path(__file__).resolve().parent.parent
GENERATED_DIR = APP_ROOT.parent / "data" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)


def _write_lb01_worksheet_pdf(header: Dict[str, Any], worksheet: Dict[str, Any], items: List[Dict[str, Any]]) -> tuple[str, str]:
    """
    Stallion Worksheet PDF — matches reference layout exactly.
    All numeric columns right-aligned; text truncated to fit its column width.
    """
    doc_id = f"worksheet-lb01-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    W, H = A4  # 595.3 x 841.9

    # ── Page margins ──────────────────────────────────────────────────────────
    ML  = 28.0    # left margin x
    MR  = 567.0   # right margin x
    PW  = MR - ML # 539 pts printable width

    # ── Column x-positions for item table (left edge of each column) ──────────
    # Numeric columns are right-aligned; left edge is the *start* of their slot.
    # Right edge of each slot: cpc→68, hs→134, desc→217, exw→263,
    # inl→303, fob→351, cif→399, duty→443, other→481, vat→523, total→567
    CX = {
        "num":    28.0,   # right-align to 38
        "cpc":    40.0,   # right-align to 68
        "hs":     68.0,   # left-align, 66pt wide
        "desc":  134.0,   # left-align, 83pt wide (~15 chars @ 7.5pt)
        "exw":   217.0,   # right-align to 263
        "inl":   263.0,   # right-align to 303
        "fob":   303.0,   # right-align to 351
        "cif":   351.0,   # right-align to 399
        "duty":  399.0,   # right-align to 443
        "other": 443.0,   # right-align to 481
        "vat":   481.0,   # right-align to 523
        "total": 523.0,   # right-align to 567 (MR)
    }
    # Right edges for each column
    CR = {
        "num":    38.0,
        "cpc":    68.0,
        "hs":    134.0,
        "desc":  217.0,
        "exw":   263.0,
        "inl":   303.0,
        "fob":   351.0,
        "cif":   399.0,
        "duty":  443.0,
        "other": 481.0,
        "vat":   523.0,
        "total": MR,
    }

    # ── Helpers ───────────────────────────────────────────────────────────────
    def bg(x, y, w, h_r, grey=0.88):
        c.setFillGray(grey)
        c.rect(x, y, w, h_r, fill=1, stroke=0)
        c.setFillGray(0)

    def hln(y_val, x1=ML, x2=MR, lw=0.4, grey=0.5):
        c.setLineWidth(lw)
        c.setStrokeGray(grey)
        c.line(x1, y_val, x2, y_val)
        c.setStrokeGray(0)

    def vln(x_val, y1, y2, lw=0.4, grey=0.5):
        c.setLineWidth(lw)
        c.setStrokeGray(grey)
        c.line(x_val, y1, x_val, y2)
        c.setStrokeGray(0)

    def bx(x, y, w, h_r, lw=0.4):
        c.setLineWidth(lw)
        c.setStrokeGray(0.4)
        c.rect(x, y, w, h_r, fill=0, stroke=1)
        c.setStrokeGray(0)

    def t(x, y, s, font="Helvetica", sz=8, align="left", grey=0, clip_w=None):
        """Draw text, optionally clipped to clip_w points wide."""
        c.setFont(font, sz)
        c.setFillGray(grey)
        s = str(s)
        if clip_w:
            from reportlab.pdfbase.pdfmetrics import stringWidth as sw
            while s and sw(s, font, sz) > clip_w:
                s = s[:-1]
        if align == "right":
            c.drawRightString(x, y, s)
        elif align == "center":
            c.drawCentredString(x, y, s)
        else:
            c.drawString(x, y, s)
        c.setFillGray(0)

    def n(v):
        try:    return f"{float(v):,.2f}"
        except: return "—"

    def col_right(key):
        return CR[key]

    # ── Pull header data ──────────────────────────────────────────────────────
    consignor    = header.get("consignorName", "")
    consignee_nm = header.get("consigneeName") or header.get("consigneeCode") or ""
    work_ref     = header.get("declarationRef", "")
    invoice_no   = header.get("invoiceNumber", "")
    invoice_date = header.get("invoiceDate", "")
    vessel       = header.get("vesselName", "")
    rotation_no  = header.get("rotationNumber", "")
    arrival_date = header.get("blAwbDate") or header.get("etaDate", "")
    port         = header.get("port", "")
    currency     = header.get("currency", "USD")

    # ── Pull worksheet figures (centralized calculation) ───────────────────
    calc = calculate_from_dict(worksheet)
    ex_rate       = calc["exch"]
    exworks_f     = calc["exworks_f"]
    inland_f      = calc["inland_f"]
    uplift_pct    = calc["uplift_pct"]
    fob_f         = calc["fob_f"]
    freight_f     = calc["freight_f"]
    insurance_f   = calc["insurance_f"]
    other_f       = calc["other_f"]
    deduct_f      = calc["deduct_f"]
    cif_f         = calc["cif_f"]
    cif_l         = calc["cif_l"]
    exworks_l     = exworks_f * ex_rate
    inland_l      = inland_f  * ex_rate
    fob_l         = calc["fob_l"]
    freight_l     = freight_f * ex_rate

    duty_pct      = calc["duty_pct"]
    surcharge_pct = calc["surcharge_pct"]
    vat_pct       = calc["vat_pct"]
    duty          = calc["duty"]
    surcharge     = calc["surcharge"]
    vat           = calc["vat"]
    total_taxes   = calc["total_taxes"]

    cfu           = calc["cfu"]
    ces1          = calc["ces1"]
    ces2          = calc["ces2"]
    grand_total   = calc["grand_total"]

    factor        = cif_f / exworks_f if exworks_f else 0
    now_str       = datetime.utcnow().strftime("%Y/%m/%d")

    # ════════════════════════════════════════════════════════════════════════
    # TITLE BAR
    # ════════════════════════════════════════════════════════════════════════
    TH = 17
    title_y = H - TH - 12
    bg(ML, title_y, PW, TH, grey=0.12)
    c.setFillGray(1)
    t(ML + 4, title_y + 5, "STALLION WORKSHEET", "Helvetica-Bold", 10, grey=1)
    t(MR - 4, title_y + 5, f"DATE:{now_str}    Page:1", "Helvetica", 8, align="right", grey=1)
    c.setFillGray(0)
    y = title_y - 1

    # ════════════════════════════════════════════════════════════════════════
    # ROW 1 — Work Sheet Ref | Consignee | Consignor
    # ════════════════════════════════════════════════════════════════════════
    RH = 22
    bx(ML, y - RH, PW, RH)
    c1 = ML + PW * 0.28
    c2 = ML + PW * 0.54
    vln(c1, y - RH, y)
    vln(c2, y - RH, y)

    t(ML+3, y-8,  "Work Sheet Ref:",  "Helvetica-Bold", 7)
    t(ML+3, y-18, work_ref,            "Helvetica", 8)
    t(c1+3, y-8,  "Consignee:",        "Helvetica-Bold", 7)
    t(c1+3, y-18, consignee_nm,        "Helvetica", 8, clip_w=c2-c1-8)
    t(c2+3, y-8,  "Consignor:",        "Helvetica-Bold", 7)
    t(c2+3, y-18, consignor,           "Helvetica", 8, clip_w=MR-c2-6)
    y -= RH

    # ════════════════════════════════════════════════════════════════════════
    # ROW 2 — Vessel | Rotation No. | Date of Arrival | Port
    # ════════════════════════════════════════════════════════════════════════
    RH2 = 22
    bx(ML, y - RH2, PW, RH2)
    v1 = ML + PW * 0.28
    v2 = ML + PW * 0.50
    v3 = ML + PW * 0.70
    for vx in (v1, v2, v3):
        vln(vx, y - RH2, y)

    for hdr, val, lx, rp in [
        ("Name of Vessel",  vessel,      ML, v1),
        ("Rotation No.",    rotation_no, v1, v2),
        ("Date of Arrival", arrival_date,v2, v3),
        ("Port",            port,        v3, MR),
    ]:
        t(lx+3, y-8,  hdr, "Helvetica-Bold", 7)
        t(lx+3, y-18, val, "Helvetica", 8, clip_w=rp-lx-6)
    y -= RH2

    # ════════════════════════════════════════════════════════════════════════
    # CURRENCY HEADER ROW (column labels)
    # ════════════════════════════════════════════════════════════════════════
    CHH = 13
    bx(ML, y-CHH, PW, CHH)
    bg(ML, y-CHH, PW, CHH, grey=0.90)
    ch1 = ML + PW * 0.16
    ch2 = ML + PW * 0.40
    ch3 = ML + PW * 0.65
    for cx in (ch1, ch2, ch3):
        vln(cx, y-CHH, y)

    t(ML+3,  y-9, "Curr. of Payment", "Helvetica-Bold", 7)
    t(ch1+3, y-9, "TT$ Equivalent",   "Helvetica-Bold", 7)
    t(ch2+3, y-9, "INVOICE VALUE",    "Helvetica-Bold", 7)
    t(ch3+3, y-9, "LOCAL VALUE",      "Helvetica-Bold", 7)
    y -= CHH

    # ════════════════════════════════════════════════════════════════════════
    # VALUATION BLOCK — 8 rows, 2 sub-columns each side
    # Left: label | foreign value    Right: label | local value
    # ════════════════════════════════════════════════════════════════════════
    # Left side uses ch1 as divider, ch2 as mid-divider, ch3 as centre divider
    # Numeric values: foreign right-aligns to ch2-3, local right-aligns to MR-3
    VRH = 13

    val_rows = [
        ("EX-WORKS:",        exworks_f, "EX-WORKS LOCAL:",    exworks_l),
        ("INLAND CHARGES:",  inland_f,  "INLAND LOCAL:",      inland_l),
        (f"% UPLIFT: {uplift_pct:.1f}%" if uplift_pct else "% UPLIFT:", None, "Company Information:", None),
        ("FOB:",             fob_f,     "FOB LOCAL:",         fob_l),
        ("FREIGHT:",         freight_f, "FREIGHT LOCAL:",     freight_l),
        ("OTHER CHARGES:",   other_f,   "FACTOR:",            factor if factor else None),
        ("INSURANCE:",       insurance_f, "",                 None),
        ("TOTAL",            cif_f,     "TOTAL",              cif_l),
    ]

    for i, (lbl1, v1, lbl2, v2) in enumerate(val_rows):
        is_total = (i == len(val_rows) - 1)
        bx(ML, y-VRH, PW, VRH, lw=0.7 if is_total else 0.4)
        if is_total:
            bg(ML, y-VRH, PW, VRH, grey=0.85)
        vln(ch2, y-VRH, y)   # divides left label from left value
        vln(ch3, y-VRH, y)   # divides left side from right side

        fnt  = "Helvetica-Bold" if is_total else "Helvetica"
        fsz  = 8 if is_total else 7.5
        lsz  = 7 if is_total else 7

        # Left label — clipped to fit before ch2
        t(ML+3, y-9, lbl1, fnt, lsz, clip_w=ch2-ML-36)
        # Left value — right-aligned just before ch2
        if v1 is not None:
            t(ch2-3, y-9, n(v1), fnt, fsz, align="right")
        # Right label — clipped to fit before MR
        if lbl2:
            t(ch3+3, y-9, lbl2, "Helvetica", lsz, clip_w=MR-ch3-50)
        # Right value — right-aligned to MR
        if v2 is not None:
            if isinstance(v2, float) and lbl2 == "FACTOR:":
                t(MR-3, y-9, f"{v2:.9f}", "Helvetica", 7, align="right")
            elif v2 is not None:
                t(MR-3, y-9, n(v2), fnt, fsz, align="right")
        y -= VRH

    y -= 4

    # ════════════════════════════════════════════════════════════════════════
    # ITEM TABLE — header rows then per-item rows
    # ════════════════════════════════════════════════════════════════════════
    HDR_H  = 14
    RATE_H = 11
    ITEM_H = 24   # two sub-rows of 12pt each

    # Draw all column vertical lines for the header + rate rows
    def draw_col_vlines(y_top, height):
        for key in ("cpc","hs","desc","exw","inl","fob","cif","duty","other","vat","total"):
            vln(CX[key], y_top - height, y_top)

    # — Column header row —
    bx(ML, y-HDR_H, PW, HDR_H)
    bg(ML, y-HDR_H, PW, HDR_H, grey=0.80)
    draw_col_vlines(y, HDR_H)

    hdrs = [
        ("num",   "",               "left"),
        ("cpc",   "CPC",            "left"),
        ("hs",    "HS CODE",        "left"),
        ("desc",  "ITEM DESCRIPTION","left"),
        ("exw",   "EX-WORKS",       "right"),
        ("inl",   "INLAND",         "right"),
        ("fob",   "FOB USD",        "right"),
        ("cif",   "CIF TT$",        "right"),
        ("duty",  "IMPORT",         "right"),
        ("other", "OTHER",          "right"),
        ("vat",   "VAT",            "right"),
        ("total", "TOTAL",          "right"),
    ]
    for key, label, align in hdrs:
        x_pos = CR[key] - 2 if align == "right" else CX[key] + 2
        t(x_pos, y-10, label, "Helvetica-Bold", 6.5, align=align)
    y -= HDR_H

    # — Rate sub-header row —
    bx(ML, y-RATE_H, PW, RATE_H)
    bg(ML, y-RATE_H, PW, RATE_H, grey=0.92)
    draw_col_vlines(y, RATE_H)
    rate_duty  = f"{duty_pct:.0f}%"  if duty_pct  else ""
    rate_surge = f"{surcharge_pct:.0f}%" if surcharge_pct else ""
    rate_vat   = f"{vat_pct:.0f}%"   if vat_pct   else ""
    t(CR["duty"]-2,  y-7, rate_duty,  "Helvetica-Bold", 7, align="right")
    t(CR["other"]-2, y-7, rate_surge, "Helvetica-Bold", 7, align="right")
    t(CR["vat"]-2,   y-7, rate_vat,   "Helvetica-Bold", 7, align="right")
    y -= RATE_H

    # — Item rows —
    for idx, item in enumerate(items[:10], start=1):
        bx(ML, y-ITEM_H, PW, ITEM_H)
        if idx % 2 == 0:
            bg(ML, y-ITEM_H, PW, ITEM_H, grey=0.96)
        draw_col_vlines(y, ITEM_H)

        # Sub-row 1: consignor name + invoice ref (6.5pt)
        sub1 = y - 9
        item_consignor = item.get("consignorName") or consignor
        inv_label      = f"Inv No: {invoice_no}  {invoice_date}"
        t(CX["cpc"]+2,  sub1, item_consignor, "Helvetica", 6.5, clip_w=CX["desc"]-CX["cpc"]-4)
        t(CX["desc"]+2, sub1, inv_label,       "Helvetica", 6.5, clip_w=CX["exw"]-CX["desc"]-4)

        # Sub-row 2: line item values (7.5pt)
        sub2 = y - 19
        hs_code   = str(item.get("hsCode") or item.get("tarification_hscode_commodity_code") or "")
        desc      = str(item.get("description") or "")
        i_cpc     = str(item.get("cpc") or "4000")
        i_exw     = float(item.get("itemValue") or 0)
        i_inl     = float(item.get("inlandValue") or 0)
        i_fob     = i_exw + i_inl
        i_cif     = float(item.get("cifValue") or (i_fob * ex_rate))
        if i_cif == 0:
            i_cif = i_fob * ex_rate
        i_duty    = float(item.get("dutyAmount") or (i_cif * duty_pct / 100))
        i_other   = float(item.get("otherTax")   or (i_cif * surcharge_pct / 100))
        i_vat     = float(item.get("vatAmount")  or ((i_cif + i_duty + i_other) * vat_pct / 100))
        i_total   = i_duty + i_other + i_vat

        t(CR["num"]-2,   sub2, f"{idx}.",     "Helvetica-Bold", 7.5, align="right")
        t(CX["cpc"]+2,   sub2, i_cpc,         "Helvetica",      7.5)
        t(CX["hs"]+2,    sub2, hs_code,        "Helvetica",      7.5, clip_w=CX["desc"]-CX["hs"]-4)
        t(CX["desc"]+2,  sub2, desc,           "Helvetica",      7.5, clip_w=CX["exw"]-CX["desc"]-4)
        t(CR["exw"]-2,   sub2, n(i_exw),       "Helvetica",      7.5, align="right")
        t(CR["inl"]-2,   sub2, n(i_inl) if i_inl else "", "Helvetica", 7.5, align="right")
        t(CR["fob"]-2,   sub2, n(i_fob),       "Helvetica",      7.5, align="right")
        t(CR["cif"]-2,   sub2, n(i_cif),       "Helvetica",      7.5, align="right")
        t(CR["duty"]-2,  sub2, n(i_duty),      "Helvetica",      7.5, align="right")
        t(CR["other"]-2, sub2, n(i_other) if i_other else "", "Helvetica", 7.5, align="right")
        t(CR["vat"]-2,   sub2, n(i_vat),       "Helvetica",      7.5, align="right")
        t(CR["total"]-2, sub2, n(i_total),     "Helvetica-Bold", 7.5, align="right")
        y -= ITEM_H

        if y < 200:
            break

    # — WORKSHEET TOTALS row —
    TOT_H = 14
    bx(ML, y-TOT_H, PW, TOT_H, lw=0.8)
    bg(ML, y-TOT_H, PW, TOT_H, grey=0.84)
    draw_col_vlines(y, TOT_H)
    t(ML+3,          y-10, "WORKSHEET TOTALS =", "Helvetica-Bold", 8)
    t(CR["exw"]-2,   y-10, n(exworks_f),  "Helvetica-Bold", 8, align="right")
    t(CR["inl"]-2,   y-10, n(inland_f) if inland_f else "", "Helvetica-Bold", 8, align="right")
    t(CR["fob"]-2,   y-10, n(fob_f),      "Helvetica-Bold", 8, align="right")
    t(CR["total"]-2, y-10, n(cif_l),      "Helvetica-Bold", 8, align="right")
    y -= TOT_H
    y -= 5

    # ════════════════════════════════════════════════════════════════════════
    # DUTIES/TAXES SUMMARY
    # ════════════════════════════════════════════════════════════════════════
    DH = 13

    # Title bar
    bx(ML, y-DH, PW, DH)
    bg(ML, y-DH, PW, DH, grey=0.12)
    c.setFillGray(1)
    t(ML+3,        y-9, "Work Sheet Reference Number:", "Helvetica-Bold", 7.5, grey=1)
    t(ML+162,      y-9, work_ref, "Helvetica", 7.5, grey=1)
    t(ML+PW*0.52,  y-9, "DUTIES/TAXES SUMMARY", "Helvetica-Bold", 8.5, grey=1)
    c.setFillGray(0)
    y -= DH

    # Column header row
    DC_MID = ML + PW * 0.62   # RELIEF column right edge
    DC_R   = MR                # PAYABLE column right edge

    bx(ML, y-DH, PW, DH)
    bg(ML, y-DH, PW, DH, grey=0.86)
    vln(DC_MID, y-DH, y)
    t(ML+3,      y-9, "DUTIES/TAXES DESCRIPTION", "Helvetica-Bold", 7.5)
    t(DC_MID-3,  y-9, "RELIEF (R)",               "Helvetica-Bold", 7.5, align="right")
    t(DC_R-3,    y-9, "PAYABLE (P)",              "Helvetica-Bold", 7.5, align="right")
    y -= DH

    # Duty rows
    duty_rows = []
    if duty:
        duty_rows.append(("01", "IM.DTY", "Import Duty",       duty))
    if surcharge:
        duty_rows.append(("05", "SU.CHG", "Import Surcharge",  surcharge))
    if vat:
        duty_rows.append(("20", "VAT",    "Value Added Tax",   vat))

    running = 0.0
    for i, (code, abbr, label, amount) in enumerate(duty_rows):
        bx(ML, y-DH, PW, DH)
        if i % 2 == 0:
            bg(ML, y-DH, PW, DH, grey=0.96)
        vln(DC_MID, y-DH, y)
        row_lbl = f"{code}  {abbr}  {label}"
        t(ML+3,     y-9, row_lbl, "Helvetica", 8)
        t(DC_MID-3, y-9, n(amount), "Helvetica", 8, align="right")
        t(DC_R-3,   y-9, n(amount), "Helvetica", 8, align="right")
        running += amount
        y -= DH

    # Summary totals
    bx(ML, y-DH, PW, DH, lw=0.7)
    bg(ML, y-DH, PW, DH, grey=0.84)
    vln(DC_MID, y-DH, y)
    t(ML+3,     y-9, "SUMMARY TOTALS", "Helvetica-Bold", 8)
    t(DC_R-3,   y-9, n(total_taxes),   "Helvetica-Bold", 8, align="right")
    y -= DH

    # CES / CFU extra rows
    extra = []
    if ces1: extra.append((" CES", "Container Ex Fee",     ces1))
    if ces2: extra.append((" CES", "Container Ex Fee (2)", ces2))
    extra.append((" CFU", "Customs User Fee", cfu))

    for i, (abbr, label, amount) in enumerate(extra):
        bx(ML, y-DH, PW, DH)
        bg(ML, y-DH, PW, DH, grey=0.96)
        vln(DC_MID, y-DH, y)
        t(ML+3,     y-9, f"{abbr}  {label}", "Helvetica", 8)
        t(DC_R-3,   y-9, n(amount),           "Helvetica", 8, align="right")
        y -= DH

    # TOTAL AMOUNT DUE
    TDUH = 16
    bx(ML, y-TDUH, PW, TDUH, lw=1.0)
    bg(ML, y-TDUH, PW, TDUH, grey=0.12)
    c.setFillGray(1)
    t(ML+4,   y-11, "TOTAL AMOUNT DUE", "Helvetica-Bold", 10, grey=1)
    t(DC_R-3, y-11, n(grand_total),      "Helvetica-Bold", 10, align="right", grey=1)
    c.setFillGray(0)
    y -= TDUH

    # ════════════════════════════════════════════════════════════════════════
    # FOOTER
    # ════════════════════════════════════════════════════════════════════════
    hln(28)
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    t(ML, 18, f"Stallion · {timestamp} · For broker use only", "Helvetica", 7, grey=0.45)
    t(MR, 18, "Page 1", "Helvetica", 7, align="right", grey=0.45)

    c.showPage()
    c.save()
    return doc_id, str(out)



def _write_sad_xml(xml: str) -> tuple[str, str]:
    doc_id = f"sad_xml-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.xml"
    out.write_text(xml, encoding="utf-8")
    return doc_id, str(out)


def preflight_workbench(header: Dict[str, Any], worksheet: Dict[str, Any], items: List[Dict[str, Any]], containers: List[Dict[str, Any]]) -> Dict[str, Any]:
    errors: List[Dict[str, str]] = []
    warnings: List[Dict[str, str]] = []

    # Determine if this is an export declaration
    from ..store import LOOKUPS as _LOOKUPS
    selected_regime = str(header.get("customsRegime", "C4") or "C4")
    _regime_row = next((r for r in _LOOKUPS.get("customs_regimes", []) if str(r.get("regimeCode")) == selected_regime), None)
    is_export = (_regime_row or {}).get("asycudaCode", "IM") == "EX"

    required_header = [
        ("declarationRef",  "Declaration reference is required"),
        ("port",            "Port is required"),
        ("term",            "Terms are required"),
        ("modeOfTransport", "Mode of transport is required"),
        ("customsRegime",   "Customs regime is required"),
        ("consignorName",   "Consignor/company name is required"),
        ("invoiceNumber",   "Invoice number is required"),
        ("invoiceDate",     "Invoice date is required"),
    ]
    # consigneeCode required for imports; exports go to a foreign buyer
    if not is_export:
        required_header.append(("consigneeCode", "Consignee code is required"))

    for key, msg in required_header:
        if not str(header.get(key, "")).strip():
            errors.append({"path": f"header.{key}", "message": msg})

    if not items:
        errors.append({"path": "items", "message": "At least one item is required"})

    seen_hs_desc: Set[str] = set()
    for i, item in enumerate(items or []):
        hs = str(item.get("hsCode") or "").strip()
        desc = str(item.get("description") or "").strip()
        val = float(item.get("itemValue") or 0)
        qty = float(item.get("qty") or 0)
        gross = float(item.get("grossKg") or 0)
        net = float(item.get("netKg") or 0)

        if not hs:
            errors.append({"path": f"items[{i}].hsCode", "message": "HS code is required"})
        if hs and (not hs.replace(".", "").isdigit() or len(hs.replace(".", "")) < 6):
            errors.append({"path": f"items[{i}].hsCode", "message": "HS code must be numeric and at least 6 digits"})
        if not desc:
            errors.append({"path": f"items[{i}].description", "message": "Description is required"})
        if val <= 0:
            errors.append({"path": f"items[{i}].itemValue", "message": "Item value must be > 0"})
        if qty <= 0:
            errors.append({"path": f"items[{i}].qty", "message": "Quantity must be > 0"})
        if gross < 0 or net < 0:
            errors.append({"path": f"items[{i}]", "message": "Weights cannot be negative"})
        if net > 0 and gross > 0 and net > gross:
            warnings.append({"path": f"items[{i}]", "message": "Net weight is greater than gross weight"})

        k = f"{hs}|{desc.lower()}"
        if hs and desc and k in seen_hs_desc:
            warnings.append({"path": f"items[{i}]", "message": "Possible duplicate item (same HS + description)"})
        seen_hs_desc.add(k)

    for i, c in enumerate(containers or []):
        cno = str(c.get("containerNo") or "").strip().upper()
        if not cno:
            errors.append({"path": f"containers[{i}].containerNo", "message": "Container number is required"})
        if float(c.get("packages") or 0) < 0 or float(c.get("goodsWeight") or 0) < 0:
            errors.append({"path": f"containers[{i}]", "message": "Packages/weight cannot be negative"})

    duty = float(worksheet.get("duty", 0) or 0)
    surcharge = float(worksheet.get("surcharge", 0) or 0)
    vat = float(worksheet.get("vat", 0) or 0)
    fees = float(worksheet.get("extra_fees_local", 0) or 0)
    customs_user_fee = float(worksheet.get("customs_user_fee", 0) or 0)
    ces_fees = float(worksheet.get("ces_fees", 0) or 0)
    cf2_fee = float(worksheet.get("cf2_fee", 0) or 0)
    total = float(worksheet.get("total_assessed", 0) or 0)

    exch = float(worksheet.get("exchange_rate", 0) or 0)
    if exch <= 0:
        errors.append({"path": "worksheet.exchange_rate", "message": "Exchange rate must be > 0"})

    expected_total = round(duty + surcharge + vat + fees + customs_user_fee + ces_fees + cf2_fee, 2)
    if abs(expected_total - total) > 0.01:
        warnings.append({
            "path": "worksheet.total_assessed",
            "message": f"Total assessed ({total:.2f}) differs from computed sum ({expected_total:.2f})",
        })

    return {
        "status": "fail" if errors else "pass",
        "errors": errors,
        "warnings": warnings,
        "counts": {"errors": len(errors), "warnings": len(warnings)},
    }


def generate_pack(req: Dict[str, Any]) -> Dict[str, Any]:
    header = (req or {}).get("header") or {}
    worksheet = (req or {}).get("worksheet") or {}
    items = (req or {}).get("items") or []
    containers = (req or {}).get("containers") or []

    preflight = preflight_workbench(header, worksheet, items, containers)
    if preflight["status"] != "pass":
        return {
            "status": "blocked",
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "preflight": preflight,
            "documents": [],
        }

    docs: List[Dict[str, str]] = []
    ws_id, _ = _write_lb01_worksheet_pdf(header, worksheet, items)
    docs.append({"name": "worksheet_pdf", "status": "generated", "ref": ws_id, "url": f"/pack/file/{ws_id}"})

    declaration = build_complete_declaration(header, worksheet, items, containers)
    c82_validation = validate_decl(declaration)

    # Hard gate XML generation on C82 validation so invalid declarations
    # cannot silently produce uploadable artifacts.
    if c82_validation.get("status") != "pass":
        return {
            "status": "blocked",
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "preflight": preflight,
            "c82Validation": c82_validation,
            "documents": docs,
        }

    sad_xml = export_xml(declaration)
    sad_xml_id, _ = _write_sad_xml(sad_xml)
    docs.append({"name": "c82_sad_xml", "status": "generated", "ref": sad_xml_id, "url": f"/pack/file/{sad_xml_id}"})

    return {
        "status": "generated",
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "preflight": preflight,
        "c82Validation": c82_validation,
        "documents": docs,
    }


def resolve_generated_file(doc_id: str) -> Path | None:
    # Sanitize doc_id: reject path traversal attempts
    if not doc_id or "/" in doc_id or "\\" in doc_id or ".." in doc_id:
        return None
    # Additional safety: only allow expected characters (alphanumeric, dash, underscore)
    import re
    if not re.match(r'^[a-zA-Z0-9_-]+$', doc_id):
        return None

    pdf_path = GENERATED_DIR / f"{doc_id}.pdf"
    xml_path = GENERATED_DIR / f"{doc_id}.xml"

    # Final check: resolved path must be inside GENERATED_DIR
    for candidate in (pdf_path, xml_path):
        if candidate.exists():
            try:
                candidate.resolve().relative_to(GENERATED_DIR.resolve())
                return candidate
            except ValueError:
                return None  # path escaped the generated dir
    return None
