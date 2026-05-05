from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Table, TableStyle

from ..broker_profile import get_broker_profile

GENERATED_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

# ── Design constants ──────────────────────────────────────────────────────────
GREEN_DARK  = colors.HexColor("#1A5C3A")
GREEN_MID   = colors.HexColor("#2E7D52")
GREEN_LIGHT = colors.HexColor("#EBF5EE")
INK         = colors.HexColor("#111827")
INK_MID     = colors.HexColor("#374151")
INK_LIGHT   = colors.HexColor("#6B7280")
BORDER      = colors.HexColor("#D1D5DB")
PAGE_BG     = colors.HexColor("#F9FAFB")
WHITE       = colors.white


def _fmt(v: float, prefix: str = "TT$") -> str:
    return f"{prefix} {v:,.2f}"


def _fmt_usd(v: float) -> str:
    return f"USD {v:,.2f}"


def generate_brokerage_invoice(
    declaration: Dict[str, Any],
    client: Dict[str, Any],
    brokerage_fee_ttd: float = 0.0,
    invoice_number: str = "",
    notes: str = "",
) -> tuple[str, str]:
    """
    Generate a brokerage invoice PDF for a cleared declaration.
    Returns (doc_id, file_path_str).
    """
    doc_id = f"brokerage-inv-{uuid.uuid4().hex[:10]}"
    out_path = GENERATED_DIR / f"{doc_id}.pdf"

    header    = declaration.get("header", {})
    worksheet = declaration.get("worksheet", {})
    items     = declaration.get("items", [])
    decl_ref  = declaration.get("reference_number") or header.get("declarationRef", "—")

    # ── Financial figures ─────────────────────────────────────────────────────
    ex_rate          = float(worksheet.get("exchange_rate", 6.77) or 6.77)
    fob_foreign      = float(worksheet.get("fob_foreign") or worksheet.get("invoice_value_foreign", 0) or 0)
    freight_foreign  = float(worksheet.get("freight_foreign", 0) or 0)
    ins_foreign      = float(worksheet.get("insurance_foreign", 0) or 0)
    other_foreign    = float(worksheet.get("other_foreign", 0) or 0)
    deduction_foreign= float(worksheet.get("deduction_foreign", 0) or 0)
    cif_foreign      = fob_foreign + freight_foreign + ins_foreign + other_foreign - deduction_foreign
    cif_ttd          = cif_foreign * ex_rate
    duty             = float(worksheet.get("duty", 0) or 0)
    surcharge        = float(worksheet.get("surcharge", 0) or 0)
    vat              = float(worksheet.get("vat", 0) or 0)
    extra_fees       = float(worksheet.get("extra_fees_local", 0) or 0)
    total_assessed   = float(worksheet.get("total_assessed", 0) or (duty + surcharge + vat + extra_fees))
    customs_user_fee = float(worksheet.get("customs_user_fee", 40) or 40)
    grand_total_govt = total_assessed + customs_user_fee
    grand_total_all  = grand_total_govt + brokerage_fee_ttd

    # ── Date / reference ──────────────────────────────────────────────────────
    now_str   = datetime.now().strftime("%d %B %Y")
    inv_no    = invoice_number or f"FFF-{datetime.now().strftime('%Y%m')}-{doc_id[-6:].upper()}"
    receipt_no = declaration.get("receipt_number", "")

    # ── Canvas setup ──────────────────────────────────────────────────────────
    w_pt, h_pt = A4
    c = canvas.Canvas(str(out_path), pagesize=A4)

    def line(x1, y1, x2, y2, color=BORDER, width=0.5):
        c.setStrokeColor(color)
        c.setLineWidth(width)
        c.line(x1, y1, x2, y2)

    def text(x, y, s, font="Helvetica", size=9, color=INK, align="left"):
        c.setFont(font, size)
        c.setFillColor(color)
        if align == "right":
            c.drawRightString(x, y, str(s))
        elif align == "center":
            c.drawCentredString(x, y, str(s))
        else:
            c.drawString(x, y, str(s))

    L, R = 40, w_pt - 40  # left / right margin x positions
    y = h_pt - 40

    # ── GREEN HEADER BAND ─────────────────────────────────────────────────────
    c.setFillColor(GREEN_DARK)
    c.rect(0, h_pt - 90, w_pt, 90, fill=1, stroke=0)

    text(L, h_pt - 32, "STALLION", "Helvetica-Bold", 22, WHITE)
    text(L, h_pt - 50, "Brokerage Invoice", "Helvetica", 11, colors.HexColor("#9DC8AC"))
    text(R, h_pt - 32, inv_no, "Helvetica-Bold", 11, WHITE, align="right")
    text(R, h_pt - 50, now_str, "Helvetica", 9, colors.HexColor("#9DC8AC"), align="right")

    # ── GREEN ACCENT LINE ─────────────────────────────────────────────────────
    c.setFillColor(GREEN_MID)
    c.rect(0, h_pt - 94, w_pt, 4, fill=1, stroke=0)

    y = h_pt - 115

    # ── ADDRESS BLOCK ─────────────────────────────────────────────────────────
    # Bill To (left)
    text(L, y, "BILL TO", "Helvetica-Bold", 7, INK_LIGHT)
    y -= 14
    client_name = client.get("name", header.get("consigneeName", "—"))
    text(L, y, client_name, "Helvetica-Bold", 10, INK)
    y -= 13
    if client.get("tin"):
        text(L, y, f"TIN: {client['tin']}", "Helvetica", 9, INK_MID)
        y -= 12
    if client.get("address"):
        for addr_line in client["address"].split("\n")[:3]:
            text(L, y, addr_line.strip(), "Helvetica", 9, INK_MID)
            y -= 12
    if client.get("contact_name"):
        text(L, y, f"Attn: {client['contact_name']}", "Helvetica", 9, INK_LIGHT)
        y -= 12

    # Prepared by (right col)
    bp = get_broker_profile()
    rx = w_pt / 2 + 10
    ry = h_pt - 115
    text(rx, ry, "PREPARED BY", "Helvetica-Bold", 7, INK_LIGHT)
    ry -= 14
    text(rx, ry, bp["firm"], "Helvetica-Bold", 10, INK)
    ry -= 13
    text(rx, ry, bp["address"], "Helvetica", 9, INK_MID)
    ry -= 12
    text(rx, ry, f"Tel: {bp['phone']}", "Helvetica", 9, INK_MID)

    y = min(y, ry) - 18
    line(L, y, R, y)
    y -= 16

    # ── DECLARATION SUMMARY BOX ───────────────────────────────────────────────
    c.setFillColor(GREEN_LIGHT)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.rect(L, y - 58, R - L, 64, fill=1, stroke=1)

    text(L + 10, y - 8,  "Declaration Reference",  "Helvetica-Bold", 8, INK_LIGHT)
    text(L + 10, y - 20, decl_ref,                 "Helvetica-Bold", 10, GREEN_DARK)

    col2 = L + (R - L) / 4
    text(col2, y - 8,  "Consignee Code",            "Helvetica-Bold", 8, INK_LIGHT)
    text(col2, y - 20, header.get("consigneeCode", "—"), "Helvetica", 10, INK)

    col3 = L + (R - L) / 2
    text(col3, y - 8,  "Port of Entry",             "Helvetica-Bold", 8, INK_LIGHT)
    text(col3, y - 20, header.get("port", "—"),     "Helvetica", 10, INK)

    col4 = L + (R - L) * 3 / 4
    text(col4, y - 8,  "ASYCUDA Receipt No.",       "Helvetica-Bold", 8, INK_LIGHT)
    text(col4, y - 20, receipt_no or "Pending",      "Helvetica", 10, INK)

    # Row 2
    text(L + 10, y - 36, "Invoice No.",              "Helvetica-Bold", 8, INK_LIGHT)
    text(L + 10, y - 48, header.get("invoiceNumber","—"), "Helvetica", 9, INK_MID)
    text(col2,   y - 36, "Vessel / Flight",          "Helvetica-Bold", 8, INK_LIGHT)
    text(col2,   y - 48, header.get("vesselName","—"), "Helvetica", 9, INK_MID)
    text(col3,   y - 36, "AWB / B/L",                "Helvetica-Bold", 8, INK_LIGHT)
    text(col3,   y - 48, header.get("blAwbNumber","—"), "Helvetica", 9, INK_MID)
    text(col4,   y - 36, "Rotation No.",             "Helvetica-Bold", 8, INK_LIGHT)
    text(col4,   y - 48, header.get("rotationNumber","—"), "Helvetica", 9, INK_MID)

    y -= 74
    line(L, y, R, y)
    y -= 16

    # ── GOODS TABLE ───────────────────────────────────────────────────────────
    text(L, y, "GOODS / LINE ITEMS", "Helvetica-Bold", 8, INK_LIGHT)
    y -= 12

    # Header row
    c.setFillColor(GREEN_DARK)
    c.rect(L, y - 14, R - L, 18, fill=1, stroke=0)
    cols_x = [L + 4, L + 200, L + 290, L + 360, L + 440]
    col_hdrs = ["Description", "HS Code", "Qty", "Gross KG", "Item Value (USD)"]
    for cx, ch in zip(cols_x, col_hdrs):
        text(cx, y - 10, ch, "Helvetica-Bold", 7, WHITE)
    y -= 18

    for i, item in enumerate(items[:20]):  # cap at 20 line items
        row_bg = GREEN_LIGHT if i % 2 == 0 else WHITE
        c.setFillColor(colors.HexColor("#EBF5EE") if i % 2 == 0 else colors.white)
        c.rect(L, y - 13, R - L, 16, fill=1, stroke=0)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.3)
        c.rect(L, y - 13, R - L, 16, fill=0, stroke=1)

        desc = str(item.get("description", "—"))[:55]
        hs   = str(item.get("hsCode") or item.get("tarification_hscode_commodity_code", "—"))
        qty  = str(item.get("qty", "—"))
        gkg  = f"{float(item.get('grossKg', 0) or 0):,.1f}"
        val  = f"{float(item.get('itemValue', 0) or 0):,.2f}"

        text(cols_x[0], y - 9, desc, "Helvetica", 7.5, INK)
        text(cols_x[1], y - 9, hs,   "Helvetica", 7.5, INK_MID)
        text(cols_x[2], y - 9, qty,  "Helvetica", 7.5, INK_MID)
        text(cols_x[3], y - 9, gkg,  "Helvetica", 7.5, INK_MID)
        text(R - 4,     y - 9, val,  "Helvetica", 7.5, INK_MID, align="right")
        y -= 16

    y -= 10
    line(L, y, R, y)
    y -= 18

    # ── DUTY / TAX BREAKDOWN ──────────────────────────────────────────────────
    text(L, y, "DUTY & TAX ASSESSMENT", "Helvetica-Bold", 8, INK_LIGHT)
    y -= 14

    col_l = L + 10
    col_r = R - 10
    row_h = 15

    def fin_row(label, amount_str, bold=False, green=False):
        nonlocal y
        font = "Helvetica-Bold" if bold else "Helvetica"
        col = GREEN_DARK if green else (INK if bold else INK_MID)
        text(col_l, y, label, font, 9, col)
        text(col_r, y, amount_str, font, 9, col, align="right")
        y -= row_h

    fin_row("Invoice Value (FOB)",    _fmt_usd(fob_foreign))
    if freight_foreign:
        fin_row("Freight",            _fmt_usd(freight_foreign))
    if ins_foreign:
        fin_row("Insurance",          _fmt_usd(ins_foreign))
    fin_row(f"CIF Value (USD × {ex_rate:.5f})", _fmt_usd(cif_foreign))
    fin_row("CIF Value (TTD)",        _fmt(cif_ttd))
    y -= 4
    line(col_l, y, col_r, y, BORDER, 0.3)
    y -= 10
    if duty:
        fin_row("Import Duty",        _fmt(duty))
    if surcharge:
        fin_row("Import Surcharge",   _fmt(surcharge))
    if vat:
        fin_row("Value Added Tax (VAT)", _fmt(vat))
    if extra_fees:
        fin_row("Port / Other Fees",  _fmt(extra_fees))
    fin_row("Customs User Fee",       _fmt(customs_user_fee))

    y -= 4
    line(col_l, y, col_r, y, GREEN_DARK, 0.8)
    y -= 12
    fin_row("Total Government Charges", _fmt(grand_total_govt), bold=True)

    y -= 8
    line(L, y, R, y, BORDER, 0.5)
    y -= 16

    # ── BROKERAGE FEE SECTION ─────────────────────────────────────────────────
    text(L, y, "BROKERAGE SERVICES", "Helvetica-Bold", 8, INK_LIGHT)
    y -= 14

    fin_row("Customs Clearance & Documentation Services", _fmt(brokerage_fee_ttd))

    if notes:
        for note_line in notes.split("\n")[:3]:
            text(col_l, y, note_line.strip(), "Helvetica-Oblique", 8, INK_LIGHT)
            y -= 12

    y -= 6
    line(col_l, y, col_r, y, BORDER, 0.3)
    y -= 12

    # ── GRAND TOTAL BOX ───────────────────────────────────────────────────────
    c.setFillColor(GREEN_DARK)
    c.rect(L, y - 22, R - L, 28, fill=1, stroke=0)
    text(L + 14, y - 10, "TOTAL AMOUNT DUE", "Helvetica-Bold", 10, WHITE)
    text(R - 14, y - 10, _fmt(grand_total_all), "Helvetica-Bold", 13, WHITE, align="right")
    text(L + 14, y - 20, "Government charges + brokerage fee", "Helvetica", 7.5, colors.HexColor("#9DC8AC"))
    y -= 36

    # ── FOOTER ────────────────────────────────────────────────────────────────
    line(L, 52, R, 52, BORDER, 0.5)
    text(L,  40, f"{bp['firm']}  |  Registered Customs Broker  |  T&T", "Helvetica", 7.5, INK_LIGHT)
    text(R,  40, f"Generated by Stallion  ·  {now_str}", "Helvetica", 7.5, INK_LIGHT, align="right")
    text(w_pt / 2, 28, "This document is a brokerage invoice only. ASYCUDA SAD C82 is the official customs declaration.", "Helvetica-Oblique", 7, INK_LIGHT, align="center")

    c.save()
    return doc_id, str(out_path)
