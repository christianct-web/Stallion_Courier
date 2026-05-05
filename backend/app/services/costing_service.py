from __future__ import annotations

"""
Stallion Costing Document
-------------------------
A pre-declaration shareable estimate that a broker sends to an importer
BEFORE filing the formal C82.  Shows the full landed cost breakdown:
   Consignee / Consignor / shipment details
   EX-WORKS → FOB → CIF calculation
   Per-item duty summary table
   Grand total duties / taxes / fees
   Prepared-by block with broker firm details
   Confidentiality footer

Layout mirrors the Worksheet PDF style (same fonts, same dark title bar)
but is clearly labelled "COSTING / ESTIMATE — NOT AN OFFICIAL CUSTOMS DOCUMENT".
"""

import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .worksheet_service import calculate_from_dict

GENERATED_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ────────────────────────────────────────────────────────────────────
def _n(v: Any) -> str:
    try:
        return f"{float(v):,.2f}"
    except (TypeError, ValueError):
        return "—"


def _pct(v: Any) -> str:
    try:
        return f"{float(v):.2f}%"
    except (TypeError, ValueError):
        return "—"


def generate_costing_pdf(
    header: Dict[str, Any],
    worksheet: Dict[str, Any],
    items: List[Dict[str, Any]],
    broker_firm: str = "",
    broker_address: str = "",
    broker_phone: str = "",
    notes: str = "",
) -> tuple[str, str]:
    """
    Generate a costing / landed-cost estimate PDF.
    Broker details fall back to the centralized broker profile if not provided.
    Returns (doc_id, file_path).
    """
    from ..broker_profile import get_broker_profile
    bp = get_broker_profile()
    broker_firm    = broker_firm    or bp["firm"]
    broker_address = broker_address or bp["address"]
    broker_phone   = broker_phone   or bp["phone"]
    doc_id = f"costing-{uuid.uuid4().hex[:10]}"
    out = GENERATED_DIR / f"{doc_id}.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    W, H = A4  # 595.3 x 841.9

    ML = 30.0
    MR = 565.0
    PW = MR - ML  # 535 pts

    # ── Design tokens ─────────────────────────────────────────────────────────
    DARK_BG   = 0.10   # near-black for title bars
    MID_BG    = 0.82   # column headers
    LIGHT_BG  = 0.93   # alt rows
    WARN_BG   = 0.88   # amber-ish (greyscale)
    TOTAL_BG  = 0.15   # dark total bar

    def bg(x, y, w, h_r, grey=LIGHT_BG):
        c.setFillGray(grey)
        c.rect(x, y, w, h_r, fill=1, stroke=0)
        c.setFillGray(0)

    def bx(x, y, w, h_r, lw=0.4, grey=0.45):
        c.setLineWidth(lw)
        c.setStrokeGray(grey)
        c.rect(x, y, w, h_r, fill=0, stroke=1)
        c.setStrokeGray(0)

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

    def t(x, y, s, font="Helvetica", sz=8.5, align="left", grey=0, clip_w=None):
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

    # ── Pull figures ───────────────────────────────────────────────────────────
    consignor    = header.get("consignorName", "")
    consignee_nm = header.get("consigneeName") or header.get("consigneeCode") or ""
    consignee_cd = header.get("consigneeCode", "")
    work_ref     = header.get("declarationRef", "")
    invoice_no   = header.get("invoiceNumber", "")
    invoice_date = header.get("invoiceDate", "")
    vessel       = header.get("vesselName", "")
    port         = header.get("port", "")
    currency     = header.get("currency", "USD")
    eta          = header.get("etaDate", "")
    awb          = header.get("blAwbNumber", "")

    # ── Centralized calculation ────────────────────────────────────────────
    calc = calculate_from_dict(worksheet)
    exch         = calc["exch"]
    exworks_f    = calc["exworks_f"]
    inland_f     = calc["inland_f"]
    fob_f        = calc["fob_f"]
    freight_f    = calc["freight_f"]
    insurance_f  = calc["insurance_f"]
    other_f      = calc["other_f"]
    deduct_f     = calc["deduct_f"]
    cif_f        = calc["cif_f"]
    cif_l        = calc["cif_l"]
    fob_l        = calc["fob_l"]

    duty_pct     = calc["duty_pct"]
    surcharge_pct= calc["surcharge_pct"]
    vat_pct      = calc["vat_pct"]
    duty         = calc["duty"]
    surcharge    = calc["surcharge"]
    vat          = calc["vat"]
    cfu          = calc["cfu"]
    ces1         = calc["ces1"]
    ces2         = calc["ces2"]
    total_govt   = calc["total_taxes"]
    grand_total  = calc["grand_total"]

    now_str = datetime.utcnow().strftime("%d %B %Y")
    today   = datetime.utcnow().strftime("%Y/%m/%d")

    # ══════════════════════════════════════════════════════════════════════════
    # TITLE BAR
    # ══════════════════════════════════════════════════════════════════════════
    TH = 36
    ty = H - TH - 12
    bg(ML, ty, PW, TH, grey=DARK_BG)
    c.setFillGray(1)
    t(ML + 5,  ty + 22, "STALLION", "Helvetica-Bold", 14, grey=1)
    t(ML + 5,  ty + 9,  "COSTING ESTIMATE", "Helvetica-Bold", 8.5, grey=1)
    t(MR - 5,  ty + 22, work_ref or "DRAFT", "Helvetica-Bold", 11, align="right", grey=1)
    t(MR - 5,  ty + 9,  f"Prepared: {now_str}", "Helvetica", 8, align="right", grey=1)
    c.setFillGray(0)

    # Warning banner — NOT an official document
    WARN_H = 13
    wy = ty - WARN_H
    bg(ML, wy, PW, WARN_H, grey=WARN_BG)
    bx(ML, wy, PW, WARN_H, lw=0.5)
    t(W / 2, wy + 4, "ESTIMATE ONLY — NOT AN OFFICIAL CUSTOMS DOCUMENT — SUBJECT TO CHANGE",
      "Helvetica-Bold", 7, align="center", grey=0.15)
    y = wy - 2

    # ══════════════════════════════════════════════════════════════════════════
    # SHIPMENT IDENTITY BLOCK  (2 columns)
    # ══════════════════════════════════════════════════════════════════════════
    IH = 52
    bx(ML, y - IH, PW, IH)
    mid = ML + PW * 0.50
    vln(mid, y - IH, y)

    # Left col
    t(ML + 4, y - 10, "CONSIGNEE",   "Helvetica-Bold", 7, grey=0.4)
    t(ML + 4, y - 21, consignee_nm,  "Helvetica-Bold", 9, clip_w=mid - ML - 8)
    t(ML + 4, y - 32, consignee_cd,  "Helvetica", 8, grey=0.3)
    t(ML + 4, y - 44, f"Ref: {work_ref}", "Helvetica", 8, grey=0.35)

    # Right col
    t(mid + 4, y - 10, "CONSIGNOR",   "Helvetica-Bold", 7, grey=0.4)
    t(mid + 4, y - 21, consignor,     "Helvetica-Bold", 9, clip_w=MR - mid - 8)
    t(mid + 4, y - 32, f"Invoice: {invoice_no}  {invoice_date}", "Helvetica", 8, grey=0.35)
    t(mid + 4, y - 44, f"Vessel: {vessel}  |  Port: {port}", "Helvetica", 8, grey=0.35,
      clip_w=MR - mid - 8)
    y -= IH

    # Transport strip
    TRPH = 14
    bx(ML, y - TRPH, PW, TRPH)
    bg(ML, y - TRPH, PW, TRPH, grey=LIGHT_BG)
    q1 = ML + PW * 0.25
    q2 = ML + PW * 0.50
    q3 = ML + PW * 0.75
    for qx in (q1, q2, q3):
        vln(qx, y - TRPH, y)

    for lbl, val, lx in [
        ("AWB / B/L", awb,      ML),
        ("ETA",       eta,      q1),
        ("Currency",  currency, q2),
        ("Rate",      f"{exch:.5f}", q3),
    ]:
        t(lx + 3, y - 5,  lbl, "Helvetica-Bold", 6.5, grey=0.4)
        t(lx + 3, y - 12, val, "Helvetica", 8)
    y -= TRPH
    y -= 4

    # ══════════════════════════════════════════════════════════════════════════
    # VALUATION SECTION
    # ══════════════════════════════════════════════════════════════════════════
    # Section header
    SEC_H = 13
    bx(ML, y - SEC_H, PW, SEC_H)
    bg(ML, y - SEC_H, PW, SEC_H, grey=MID_BG)
    t(ML + 4, y - 9, "VALUATION", "Helvetica-Bold", 8)
    t(MR - 4, y - 9, f"Exchange Rate: {currency} 1.00 = TT$ {exch:.5f}", "Helvetica", 7.5,
      align="right", grey=0.25)
    y -= SEC_H

    # Column layout: label | foreign | TTD
    vc_lbl = ML + PW * 0.52
    vc_for = ML + PW * 0.76
    vc_ttd = MR

    # Column header row
    VAL_HDR = 12
    bx(ML, y - VAL_HDR, PW, VAL_HDR)
    bg(ML, y - VAL_HDR, PW, VAL_HDR, grey=0.90)
    vln(vc_lbl, y - VAL_HDR, y)
    vln(vc_for, y - VAL_HDR, y)
    t(ML + 4,   y - 8, "COMPONENT",             "Helvetica-Bold", 7)
    t(vc_for - 3, y - 8, f"FOREIGN ({currency})", "Helvetica-Bold", 7, align="right")
    t(vc_ttd - 3, y - 8, "TTD",                   "Helvetica-Bold", 7, align="right")
    y -= VAL_HDR

    val_rows = [
        ("EX-WORKS / Invoice Value", exworks_f, exworks_f * exch),
        ("Inland Charges",           inland_f,  inland_f * exch) if inland_f else None,
        ("FOB Total",                fob_f,     fob_l),
        ("Freight",                  freight_f, freight_f * exch),
        ("Insurance",                insurance_f, insurance_f * exch),
        ("Other Charges",            other_f,   other_f * exch) if other_f else None,
        ("Deductions",               -deduct_f, -deduct_f * exch) if deduct_f else None,
    ]

    VRH = 13
    for i, row in enumerate(r for r in val_rows if r is not None):
        label, foreign, local = row
        is_fob = "FOB" in label
        bx(ML, y - VRH, PW, VRH)
        if i % 2 == 0:
            bg(ML, y - VRH, PW, VRH, grey=0.96)
        if is_fob:
            bg(ML, y - VRH, PW, VRH, grey=0.88)
        vln(vc_lbl, y - VRH, y)
        vln(vc_for, y - VRH, y)
        font = "Helvetica-Bold" if is_fob else "Helvetica"
        t(ML + 4,     y - 9, label,         font, 8)
        t(vc_for - 3, y - 9, _n(foreign),   font, 8, align="right")
        t(vc_ttd - 3, y - 9, _n(local),     font, 8, align="right")
        y -= VRH

    # CIF Total row — highlighted
    CIF_H = 15
    bx(ML, y - CIF_H, PW, CIF_H, lw=0.8)
    bg(ML, y - CIF_H, PW, CIF_H, grey=0.82)
    vln(vc_lbl, y - CIF_H, y)
    vln(vc_for, y - CIF_H, y)
    t(ML + 4,     y - 10, "CIF TOTAL (Customs Value)", "Helvetica-Bold", 8.5)
    t(vc_for - 3, y - 10, _n(cif_f),   "Helvetica-Bold", 8.5, align="right")
    t(vc_ttd - 3, y - 10, _n(cif_l),   "Helvetica-Bold", 8.5, align="right")
    y -= CIF_H
    y -= 5

    # ══════════════════════════════════════════════════════════════════════════
    # PER-ITEM DUTY SUMMARY TABLE
    # ══════════════════════════════════════════════════════════════════════════
    bx(ML, y - SEC_H, PW, SEC_H)
    bg(ML, y - SEC_H, PW, SEC_H, grey=MID_BG)
    t(ML + 4, y - 9, "DUTY & TAX SUMMARY PER LINE ITEM", "Helvetica-Bold", 8)
    y -= SEC_H

    # Item table columns
    IC = {
        "num":   ML,
        "hs":    ML + 14,
        "desc":  ML + 80,
        "cif":   ML + 245,
        "duty":  ML + 315,
        "surch": ML + 375,
        "vat":   ML + 430,
        "total": MR,
    }
    ICR = {
        "hs":    ML + 80,
        "desc":  ML + 245,
        "cif":   ML + 315,
        "duty":  ML + 375,
        "surch": ML + 430,
        "vat":   MR - 40,
        "total": MR,
    }

    def draw_item_vlines(y_top, h_r):
        for key in ("hs", "desc", "cif", "duty", "surch", "vat", "total"):
            vln(IC[key], y_top - h_r, y_top)

    # Header row
    ITH = 13
    bx(ML, y - ITH, PW, ITH)
    bg(ML, y - ITH, PW, ITH, grey=0.88)
    draw_item_vlines(y, ITH)
    for key, lbl in [("hs", "HS CODE"), ("desc", "DESCRIPTION"), ("cif", f"CIF TT$"),
                     ("duty", f"DUTY\n{_pct(duty_pct)}"), ("surch", f"SRCHG\n{_pct(surcharge_pct)}"),
                     ("vat", f"VAT\n{_pct(vat_pct)}"), ("total", "TOTAL TTD")]:
        align = "right" if key in ("cif", "duty", "surch", "vat", "total") else "left"
        xpos = ICR[key] - 2 if align == "right" else IC[key] + 2
        first_line = lbl.split("\n")[0]
        second_line = lbl.split("\n")[1] if "\n" in lbl else ""
        t(xpos, y - 5,  first_line,  "Helvetica-Bold", 6, align=align)
        if second_line:
            t(xpos, y - 11, second_line, "Helvetica-Bold", 6, align=align, grey=0.35)
    y -= ITH

    # Item rows
    item_total_duty = item_total_srch = item_total_vat = item_total_all = 0.0
    ITMH = 14
    for idx, item in enumerate(items[:15], start=1):
        bx(ML, y - ITMH, PW, ITMH)
        if idx % 2 == 0:
            bg(ML, y - ITMH, PW, ITMH, grey=0.96)
        draw_item_vlines(y, ITMH)

        hs      = str(item.get("hsCode") or item.get("tarification_hscode_commodity_code") or "")
        desc    = str(item.get("description") or "")
        i_val   = float(item.get("itemValue") or 0)
        i_cif   = float(item.get("cifValue") or (i_val * exch))
        if i_cif == 0:
            i_cif = i_val * exch
        i_duty  = float(item.get("dutyAmount") or (i_cif * duty_pct / 100))
        i_srch  = float(item.get("otherTax")   or (i_cif * surcharge_pct / 100))
        i_vat   = float(item.get("vatAmount")  or ((i_cif + i_duty + i_srch) * vat_pct / 100))
        i_total = i_duty + i_srch + i_vat

        item_total_duty += i_duty
        item_total_srch += i_srch
        item_total_vat  += i_vat
        item_total_all  += i_total

        t(IC["num"] + 2,  y - 9, f"{idx}.", "Helvetica-Bold", 7.5)
        t(IC["hs"]  + 2,  y - 9, hs[:12],   "Helvetica", 7.5)
        t(IC["desc"]+ 2,  y - 9, desc,       "Helvetica", 7.5, clip_w=IC["cif"] - IC["desc"] - 4)
        t(ICR["cif"]  - 2, y - 9, _n(i_cif),   "Helvetica", 7.5, align="right")
        t(ICR["duty"] - 2, y - 9, _n(i_duty),  "Helvetica", 7.5, align="right")
        t(ICR["surch"]- 2, y - 9, _n(i_srch) if i_srch else "", "Helvetica", 7.5, align="right")
        t(ICR["vat"]  - 2, y - 9, _n(i_vat),   "Helvetica", 7.5, align="right")
        t(ICR["total"]- 2, y - 9, _n(i_total), "Helvetica-Bold", 7.5, align="right")
        y -= ITMH
        if y < 210:
            break

    # Items totals row
    ITOTH = 14
    bx(ML, y - ITOTH, PW, ITOTH, lw=0.7)
    bg(ML, y - ITOTH, PW, ITOTH, grey=0.85)
    draw_item_vlines(y, ITOTH)
    t(ML + 4,          y - 9, "SUBTOTALS", "Helvetica-Bold", 8)
    t(ICR["duty"] - 2, y - 9, _n(item_total_duty), "Helvetica-Bold", 8, align="right")
    t(ICR["surch"]- 2, y - 9, _n(item_total_srch) if item_total_srch else "", "Helvetica-Bold", 8, align="right")
    t(ICR["vat"]  - 2, y - 9, _n(item_total_vat),  "Helvetica-Bold", 8, align="right")
    t(ICR["total"]- 2, y - 9, _n(item_total_all),  "Helvetica-Bold", 8, align="right")
    y -= ITOTH
    y -= 5

    # ══════════════════════════════════════════════════════════════════════════
    # CHARGES SUMMARY
    # ══════════════════════════════════════════════════════════════════════════
    bx(ML, y - SEC_H, PW, SEC_H)
    bg(ML, y - SEC_H, PW, SEC_H, grey=MID_BG)
    t(ML + 4, y - 9, "ESTIMATED CHARGES SUMMARY", "Helvetica-Bold", 8)
    y -= SEC_H

    chg_mid = ML + PW * 0.65

    def charge_row(label, amount, bold=False, i=0):
        nonlocal y
        CH = 13
        bx(ML, y - CH, PW, CH)
        if i % 2 == 0:
            bg(ML, y - CH, PW, CH, grey=0.96)
        vln(chg_mid, y - CH, y)
        font = "Helvetica-Bold" if bold else "Helvetica"
        t(ML + 4,       y - 9, label,      font, 8)
        t(MR - 3,       y - 9, _n(amount), font, 8, align="right")
        y -= CH

    charge_row("CIF Value (Customs Base)",           cif_l,      i=0)
    charge_row(f"Import Duty ({_pct(duty_pct)})",    duty,       i=1)
    if surcharge:
        charge_row(f"Import Surcharge ({_pct(surcharge_pct)})", surcharge, i=2)
    charge_row(f"Value Added Tax ({_pct(vat_pct)})", vat,        i=3)

    # Divider before fees
    bx(ML, y - 13, PW, 13)
    bg(ML, y - 13, PW, 13, grey=0.90)
    vln(chg_mid, y - 13, y)
    t(ML + 4, y - 9, "GOVT DUTIES & TAXES TOTAL", "Helvetica-Bold", 8)
    t(MR - 3, y - 9, _n(total_govt), "Helvetica-Bold", 8, align="right")
    y -= 13

    fee_i = 4
    if ces1:
        charge_row("CES — Container Examination Fee",   ces1, i=fee_i); fee_i += 1
    if ces2:
        charge_row("CES — Container Examination Fee 2", ces2, i=fee_i); fee_i += 1
    charge_row("CFU — Customs User Fee",               cfu,  i=fee_i)

    # Grand total
    GTH = 18
    bx(ML, y - GTH, PW, GTH, lw=1.0)
    bg(ML, y - GTH, PW, GTH, grey=TOTAL_BG)
    c.setFillGray(1)
    t(ML + 5, y - 12, "ESTIMATED TOTAL AMOUNT DUE TO CUSTOMS", "Helvetica-Bold", 9.5, grey=1)
    t(MR - 5, y - 12, f"TT$ {_n(grand_total)}", "Helvetica-Bold", 11, align="right", grey=1)
    c.setFillGray(0)
    y -= GTH
    y -= 6

    # ══════════════════════════════════════════════════════════════════════════
    # NOTES (optional)
    # ══════════════════════════════════════════════════════════════════════════
    if notes.strip():
        bx(ML, y - SEC_H, PW, SEC_H)
        bg(ML, y - SEC_H, PW, SEC_H, grey=0.90)
        t(ML + 4, y - 9, "NOTES", "Helvetica-Bold", 8)
        y -= SEC_H
        NOTE_H = 12
        for line in notes.strip().split("\n")[:4]:
            bx(ML, y - NOTE_H, PW, NOTE_H)
            t(ML + 4, y - 8, line.strip(), "Helvetica", 8, clip_w=PW - 8)
            y -= NOTE_H
        y -= 4

    # ══════════════════════════════════════════════════════════════════════════
    # PREPARED BY BLOCK
    # ══════════════════════════════════════════════════════════════════════════
    PBH = 36
    pb_y = max(y - PBH - 4, 70)
    bx(ML, pb_y, PW * 0.50, PBH)
    t(ML + 4, pb_y + PBH - 8,  "PREPARED BY",    "Helvetica-Bold", 7, grey=0.4)
    t(ML + 4, pb_y + PBH - 19, broker_firm,       "Helvetica-Bold", 9, clip_w=PW * 0.48)
    t(ML + 4, pb_y + PBH - 29, broker_address,    "Helvetica", 7.5, grey=0.3, clip_w=PW * 0.48)
    t(ML + 4, pb_y + 4,        broker_phone,       "Helvetica", 7.5, grey=0.3)

    # Signature area
    bx(ML + PW * 0.52, pb_y, PW * 0.48, PBH)
    t(ML + PW * 0.52 + 4, pb_y + PBH - 8, "AUTHORISED SIGNATURE / STAMP", "Helvetica-Bold", 7, grey=0.4)
    hln(pb_y + 8, x1=ML + PW * 0.56, x2=MR - 4, lw=0.4, grey=0.6)

    # ══════════════════════════════════════════════════════════════════════════
    # FOOTER
    # ══════════════════════════════════════════════════════════════════════════
    hln(32)
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    t(ML, 22, f"Stallion · {timestamp} · This is a cost estimate only. Final duties are determined by Customs & Excise Division.",
      "Helvetica", 6.5, grey=0.45)
    t(MR, 22, "Page 1", "Helvetica", 6.5, align="right", grey=0.45)

    c.showPage()
    c.save()
    return doc_id, str(out)
