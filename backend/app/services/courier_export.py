"""
Courier Worksheet v3 + Hazmat XLSX generators.

Layouts are matched against the real broker templates:
  Worksheet_106-31245034_FINAL_v3.xlsx  (AWB 5034 reference)
  Courier_Data_Form_Hazmat_5034_v2.xlsx (AWB 5034 reference)

Worksheet layout
----------------
Title row 1:   "EXPRESS CONSIGNMENTS WORKSHEET"   (merged A1:X1)
Row 2:         "NON-COMMERCIAL CONSIGNMENTS"      (merged A2:X2)
Row 3:         A3 cargo reporter,  J3:X3 master waybill
Row 4:         A4 VAT no.,         F4 R.O.E.,    J4 freight
Row 5:         CBTT note (long)    (merged A5:X5)
Row 6:         A6:P6 "SECTION 2",  Q6:X6 "SECTION 3 — FOR OFFICIAL USE ONLY"
Row 7:         Column headers (multi-line)
Row 8+:        Data rows
TOTALS row:    after data, columns F G J L M N O P R S T U V W use SUM
Row +1:        "TOTAL TAXES ==>" merged A:O,  P=P{totals},
               "TOTAL INCL. OFFICER UPLIFTS ==>" merged Q:V,  W=P{totals}+W{totals}
Signature row: after a blank row

Section 2 columns: A B C D E F G H I J K L M N O P
                   line hawb shipper importer desc pkgs wt thn rate cost frgt cif duty opt vat total
Section 3 columns: Q R S T U V W X Y
                   officer-thn add-cost adj-cif add-duty add-opt add-vat add-total det/seized t-shed

Hazmat layout (Swissport Transit Shed)
--------------------------------------
This is NOT a per-line table. It is a transit shed manifest summary
with Trade and Non-Trade sections. Each section has three sub-rows:
Original Declared / Additional Taxes / Final Assessed. The Additional
row is a formula = Final - Original.

Tax columns at row 22:  F=CIF  H=OPT  J=DUTY  L=VAT  N=TOTAL
Trade section:          rows 23, 25 (formula), 27  (typically all zero for TTPOST)
Non-Trade section:      rows 31, 33 (formula), 35  (the manifest values)
Summary rows 38, 41, 42: copies of additional/final to dedicated summary lines.
"""
from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional, Tuple

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.worksheet import Worksheet

logger = logging.getLogger("stallion.courier.export")


# ── Style tokens ─────────────────────────────────────────────────────────────

FONT_TITLE = Font(name="Arial", size=14, bold=True)
FONT_HEADER = Font(name="Arial", size=10, bold=True, color="FFFFFF")
FONT_BANNER = Font(name="Arial", size=11, bold=True, color="FFFFFF")
FONT_BODY = Font(name="Arial", size=9)
FONT_BODY_BOLD = Font(name="Arial", size=9, bold=True)
FONT_META = Font(name="Arial", size=10, bold=True)

FILL_TITLE = PatternFill("solid", start_color="1F4E78")  # navy
FILL_S2 = PatternFill("solid", start_color="2E75B6")     # mid-blue
FILL_S3 = PatternFill("solid", start_color="C65911")     # amber
FILL_HEADER = PatternFill("solid", start_color="305496")
FILL_ROW_ALT = PatternFill("solid", start_color="F2F2F2")
FILL_TOTALS = PatternFill("solid", start_color="FFE699")
FILL_HAZMAT_HEADER = PatternFill("solid", start_color="305496")
FILL_HAZMAT_FINAL = PatternFill("solid", start_color="D9E1F2")

THIN = Side(style="thin", color="808080")
BORDER_THIN = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

ALIGN_CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
ALIGN_LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)
ALIGN_RIGHT = Alignment(horizontal="right", vertical="center", wrap_text=True)

FMT_TTD = "#,##0.00"
FMT_USD = "#,##0.00"


# ── Worksheet v3 layout ──────────────────────────────────────────────────────
# 25 columns (A–Y). Section 2 = A–P, Section 3 = Q–Y.
# Multi-line headers use \n; row height for the header row is 31.5pt
# to accommodate the wrapped text.

LAYOUT_V3_S2: List[Dict[str, Any]] = [
    {"col": "A", "label": "LINE\nNO.",        "width": 6.0,  "fmt": "0",       "align": ALIGN_CENTER},
    {"col": "B", "label": "HAWB",             "width": 10.0, "fmt": "@",       "align": ALIGN_CENTER},
    {"col": "C", "label": "SHIPPER",          "width": 20.0, "fmt": "@",       "align": ALIGN_LEFT},
    {"col": "D", "label": "NAME OF\nIMPORTER","width": 22.0, "fmt": "@",       "align": ALIGN_LEFT},
    {"col": "E", "label": "DESCRIPTION OF GOODS", "width": 35.0, "fmt": "@",   "align": ALIGN_LEFT},
    {"col": "F", "label": "NO.\nPKGS",        "width": 5.0,  "fmt": "0",       "align": ALIGN_CENTER},
    {"col": "G", "label": "WT\n(lbs)",        "width": 6.0,  "fmt": "0",       "align": ALIGN_CENTER},
    {"col": "H", "label": "THN",              "width": 12.0, "fmt": "@",       "align": ALIGN_CENTER},
    {"col": "I", "label": "RATE",             "width": 6.0,  "fmt": "@",       "align": ALIGN_CENTER},
    {"col": "J", "label": "COST\n(USD)",      "width": 8.0,  "fmt": FMT_USD,   "align": ALIGN_RIGHT},
    {"col": "K", "label": "FREIGHT",          "width": 8.0,  "fmt": FMT_USD,   "align": ALIGN_RIGHT},
    {"col": "L", "label": "CUSTOMS\nVALUE (TTD)", "width": 12.0, "fmt": FMT_TTD, "align": ALIGN_RIGHT},
    {"col": "M", "label": "DUTY",             "width": 10.0, "fmt": FMT_TTD,   "align": ALIGN_RIGHT},
    {"col": "N", "label": "OPT\n7%",          "width": 9.0,  "fmt": FMT_TTD,   "align": ALIGN_RIGHT},
    {"col": "O", "label": "VAT\n12.5%",       "width": 10.0, "fmt": FMT_TTD,   "align": ALIGN_RIGHT},
    {"col": "P", "label": "TOTAL\nTAXES",     "width": 10.0, "fmt": FMT_TTD,   "align": ALIGN_RIGHT},
]

LAYOUT_V3_S3: List[Dict[str, Any]] = [
    {"col": "Q", "label": "OFFICER\nTHN",      "width": 12.0, "fmt": "@",     "align": ALIGN_CENTER},
    {"col": "R", "label": "ADD.\nCOST (USD)",  "width": 11.0, "fmt": FMT_USD, "align": ALIGN_RIGHT},
    {"col": "S", "label": "ADJUSTED\nCIF (TTD)","width": 12.0, "fmt": FMT_TTD,"align": ALIGN_RIGHT},
    {"col": "T", "label": "ADD.\nDUTY",        "width": 10.0, "fmt": FMT_TTD, "align": ALIGN_RIGHT},
    {"col": "U", "label": "ADD.\nOPT",         "width": 9.0,  "fmt": FMT_TTD, "align": ALIGN_RIGHT},
    {"col": "V", "label": "ADD.\nVAT",         "width": 9.0,  "fmt": FMT_TTD, "align": ALIGN_RIGHT},
    {"col": "W", "label": "ADD.\nTOTAL",       "width": 10.0, "fmt": FMT_TTD, "align": ALIGN_RIGHT},
    {"col": "X", "label": "DETAINED/\nSEIZED", "width": 10.0, "fmt": "@",     "align": ALIGN_CENTER},
    {"col": "Y", "label": "DEP. IN\nT/SHED",   "width": 10.0, "fmt": "@",     "align": ALIGN_CENTER},
]

# Row layout
ROW_TITLE_1 = 1     # "EXPRESS CONSIGNMENTS WORKSHEET"
ROW_TITLE_2 = 2     # "NON-COMMERCIAL CONSIGNMENTS"
ROW_META_1 = 3      # cargo reporter / master waybill
ROW_META_2 = 4      # VAT / R.O.E. / freight
ROW_NOTE = 5        # CBTT formula explainer
ROW_BANNER = 6      # "SECTION 2" / "SECTION 3 — FOR OFFICIAL USE ONLY"
ROW_HEADERS = 7     # column headers
ROW_DATA_START = 8  # first data row

LAST_MERGE_COL = "X"  # title bar / banners merge to column X (not Y)


# ── Worksheet v3 builders ────────────────────────────────────────────────────


def _set_widths(ws: Worksheet) -> None:
    for item in LAYOUT_V3_S2 + LAYOUT_V3_S3:
        ws.column_dimensions[item["col"]].width = item["width"]


def _write_title_block(ws: Worksheet, manifest: Dict[str, Any]) -> None:
    """Rows 1–5: title, sub-title, meta block, formula explainer."""
    rate = float(manifest.get("exch_rate", 0))
    manifest_no = manifest.get("manifest_no", "")
    cargo_reporter = manifest.get("cargo_reporter", "TRINIDAD AND TOBAGO POSTAL CORPORATION")
    if cargo_reporter.upper() == "TTPOST":
        cargo_reporter = "TRINIDAD AND TOBAGO POSTAL CORPORATION"

    # Row 1 — main title
    ws.merge_cells(f"A{ROW_TITLE_1}:{LAST_MERGE_COL}{ROW_TITLE_1}")
    c = ws[f"A{ROW_TITLE_1}"]
    c.value = "EXPRESS CONSIGNMENTS WORKSHEET"
    c.font = Font(name="Arial", size=14, bold=True, color="FFFFFF")
    c.fill = FILL_TITLE
    c.alignment = ALIGN_CENTER
    ws.row_dimensions[ROW_TITLE_1].height = 22

    # Row 2 — sub-title
    ws.merge_cells(f"A{ROW_TITLE_2}:{LAST_MERGE_COL}{ROW_TITLE_2}")
    c = ws[f"A{ROW_TITLE_2}"]
    c.value = "NON-COMMERCIAL CONSIGNMENTS"
    c.font = Font(name="Arial", size=11, bold=True)
    c.alignment = ALIGN_CENTER
    ws.row_dimensions[ROW_TITLE_2].height = 18

    # Row 3 — cargo reporter (left) and master waybill (right)
    ws[f"A{ROW_META_1}"] = f"CARGO REPORTER: {cargo_reporter}"
    ws.merge_cells(f"J{ROW_META_1}:{LAST_MERGE_COL}{ROW_META_1}")
    ws[f"J{ROW_META_1}"] = f"MASTER WAY BILL NUMBER: {manifest_no}"
    for col in ("A", "J"):
        ws[f"{col}{ROW_META_1}"].font = FONT_META
        ws[f"{col}{ROW_META_1}"].alignment = ALIGN_LEFT

    # Row 4 — VAT no, R.O.E., freight
    vat_no = manifest.get("declarant_vat_no") or "V117369"
    ws[f"A{ROW_META_2}"] = f'VAT NO. / "N" NO.: {vat_no}'
    ws[f"F{ROW_META_2}"] = f"R.O.E.: {rate}"
    ws[f"J{ROW_META_2}"] = "FREIGHT:"
    for col in ("A", "F", "J"):
        ws[f"{col}{ROW_META_2}"].font = FONT_META
        ws[f"{col}{ROW_META_2}"].alignment = ALIGN_LEFT

    # Row 5 — CBTT note (formula explainer)
    note = (
        f"CBTT RATE: USD 1.00 = TT$ {rate}  |  "
        "CIF = Cost x Rate  |  ICD = CIF x Duty%  |  "
        "OPT = CIF x 7%  |  VAT = (CIF+ICD+OPT) x 12.5%  |  "
        "NOTE: THN 8517.13.00 (smartphones) assessed FREE of all taxes under breakout exemption code"
    )
    ws.merge_cells(f"A{ROW_NOTE}:{LAST_MERGE_COL}{ROW_NOTE}")
    c = ws[f"A{ROW_NOTE}"]
    c.value = note
    c.font = Font(name="Arial", size=8, italic=True)
    c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
    ws.row_dimensions[ROW_NOTE].height = 24


def _write_banner(ws: Worksheet) -> None:
    """Row 6 — SECTION 2 banner (A:P) and SECTION 3 banner (Q:X)."""
    ws.merge_cells(f"A{ROW_BANNER}:P{ROW_BANNER}")
    c = ws[f"A{ROW_BANNER}"]
    c.value = "SECTION 2"
    c.font = FONT_BANNER
    c.fill = FILL_S2
    c.alignment = ALIGN_CENTER

    ws.merge_cells(f"Q{ROW_BANNER}:{LAST_MERGE_COL}{ROW_BANNER}")
    c = ws[f"Q{ROW_BANNER}"]
    c.value = "SECTION 3 — FOR OFFICIAL USE ONLY"
    c.font = FONT_BANNER
    c.fill = FILL_S3
    c.alignment = ALIGN_CENTER

    ws.row_dimensions[ROW_BANNER].height = 18


def _write_column_headers(ws: Worksheet) -> None:
    """Row 7 — multi-line column headers for Section 2 + Section 3."""
    for item in LAYOUT_V3_S2 + LAYOUT_V3_S3:
        c = ws[f"{item['col']}{ROW_HEADERS}"]
        c.value = item["label"]
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.alignment = ALIGN_CENTER
        c.border = BORDER_THIN
    ws.row_dimensions[ROW_HEADERS].height = 31.5


def _rate_display(line: Dict[str, Any]) -> str:
    """Map line classification to the rate cell text."""
    cls = line.get("exemption_class", "none")
    rate = float(line.get("duty_rate") or 0)
    if cls == "full_exempt":
        return "FREE"  # real worksheet uses FREE for fully-exempt cell phones
    if cls == "duty_free_only":
        return "FREE"
    if rate > 0:
        return f"{int(round(rate * 100))}%"
    return "FREE"


def _write_data_row(
    ws: Worksheet,
    row: int,
    line: Dict[str, Any],
    rate: float,
    correction: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Write one Section 2 + Section 3 data row matching the real layout.

    Tax formulas mirror the real worksheet exactly:
      L = J*<rate>     (CIF)
      M = L*<duty_pct> (Duty)
      N = L*0.07       (OPT)
      O = (L+M+N)*0.125 (VAT)
      P = M+N+O        (Total)
      W = T+U+V        (Add Total — Section 3)
    """
    # Section 2 — identification
    ws[f"A{row}"] = line.get("line_no")
    ws[f"B{row}"] = line.get("hawb", "")
    ws[f"C{row}"] = line.get("shipper", "")
    ws[f"D{row}"] = line.get("importer", "")
    ws[f"E{row}"] = line.get("description", "")
    ws[f"F{row}"] = int(line.get("packages") or 1)
    ws[f"G{row}"] = float(line.get("weight_kg") or 0)  # column header says "lbs"; value as-stored
    ws[f"H{row}"] = line.get("thn", "")
    ws[f"I{row}"] = _rate_display(line)
    ws[f"J{row}"] = float(line.get("cost_usd") or 0)
    if line.get("freight_usd"):
        ws[f"K{row}"] = float(line["freight_usd"])

    # Section 2 — tax formulas
    cls = line.get("exemption_class", "none")
    duty_rate = float(line.get("duty_rate") or 0)

    # CIF formula: matches real worksheet's =J{row}*<rate> pattern but
    # gracefully handles freight in column K when set. The IF guard means
    # if a user later types a value into K{row}, the CIF picks it up
    # automatically without breaking the formula.
    ws[f"L{row}"] = f"=(J{row}+IF(K{row}=\"\",0,K{row}))*{rate}"

    if cls == "full_exempt":
        ws[f"M{row}"] = 0
        ws[f"N{row}"] = 0
        ws[f"O{row}"] = 0
    elif cls == "duty_free_only":
        ws[f"M{row}"] = 0
        ws[f"N{row}"] = f"=L{row}*0.07"
        ws[f"O{row}"] = f"=(L{row}+M{row}+N{row})*0.125"
    else:
        ws[f"M{row}"] = f"=L{row}*{round(duty_rate, 4)}"
        ws[f"N{row}"] = f"=L{row}*0.07"
        ws[f"O{row}"] = f"=(L{row}+M{row}+N{row})*0.125"

    ws[f"P{row}"] = f"=M{row}+N{row}+O{row}"

    # Section 3 — officer columns
    if correction:
        # Note: real worksheet preserves the officer's THN verbatim,
        # including codes that look "wrong" (e.g. 83062990). We do the same.
        ws[f"Q{row}"] = correction.get("officer_thn", "")
        ws[f"R{row}"] = float(correction.get("add_cost_usd") or 0)
        adj = correction.get("adjusted_cif_ttd")
        if adj is not None:
            ws[f"S{row}"] = float(adj)
        else:
            ws[f"S{row}"] = f"=R{row}*{rate}"
        ws[f"T{row}"] = float(correction.get("add_duty") or 0)
        ws[f"U{row}"] = float(correction.get("add_opt") or 0)
        ws[f"V{row}"] = float(correction.get("add_vat") or 0)
        ws[f"W{row}"] = f"=T{row}+U{row}+V{row}"
        if correction.get("detained_seized"):
            ws[f"X{row}"] = "Yes"
        if correction.get("dep_in_tshed"):
            ws[f"Y{row}"] = "Yes"

    # Apply formatting + alternating fill
    is_alt = (row % 2 == 0)
    for item in LAYOUT_V3_S2 + LAYOUT_V3_S3:
        c = ws[f"{item['col']}{row}"]
        c.font = FONT_BODY
        c.alignment = item["align"]
        c.border = BORDER_THIN
        if item["fmt"] not in ("@", None):
            c.number_format = item["fmt"]
        if is_alt:
            c.fill = FILL_ROW_ALT

    ws.row_dimensions[row].height = 27.75


def _write_totals_row(ws: Worksheet, row: int, first: int, last: int) -> None:
    """Write the TOTALS row matching the real worksheet."""
    # "TOTALS" label spans A:E
    ws.merge_cells(f"A{row}:E{row}")
    ws[f"A{row}"] = "TOTALS"
    ws[f"A{row}"].font = FONT_BODY_BOLD
    ws[f"A{row}"].alignment = ALIGN_CENTER

    sum_cols = ["F", "G", "J", "L", "M", "N", "O", "P",
                "R", "S", "T", "U", "V", "W"]
    for col in sum_cols:
        ws[f"{col}{row}"] = f"=SUM({col}{first}:{col}{last})"

    # Apply formatting
    for item in LAYOUT_V3_S2 + LAYOUT_V3_S3:
        c = ws[f"{item['col']}{row}"]
        c.font = FONT_BODY_BOLD
        c.fill = FILL_TOTALS
        c.border = BORDER_THIN
        c.alignment = item["align"]
        if item["fmt"] not in ("@", None):
            c.number_format = item["fmt"]

    ws.row_dimensions[row].height = 18


def _write_grand_total_row(ws: Worksheet, row: int, totals_row: int) -> None:
    """
    Row after totals: 'TOTAL TAXES ==>' merged A:O, P=P{totals_row},
    'TOTAL INCL. OFFICER UPLIFTS ==>' merged Q:V, W=P{totals_row}+W{totals_row}.
    """
    ws.merge_cells(f"A{row}:O{row}")
    ws[f"A{row}"] = "TOTAL TAXES ==>"
    ws[f"A{row}"].font = FONT_BODY_BOLD
    ws[f"A{row}"].alignment = Alignment(horizontal="right", vertical="center")
    ws[f"P{row}"] = f"=P{totals_row}"
    ws[f"P{row}"].font = FONT_BODY_BOLD
    ws[f"P{row}"].fill = FILL_TOTALS
    ws[f"P{row}"].number_format = FMT_TTD
    ws[f"P{row}"].alignment = ALIGN_RIGHT

    ws.merge_cells(f"Q{row}:V{row}")
    ws[f"Q{row}"] = "TOTAL INCL. OFFICER UPLIFTS ==>"
    ws[f"Q{row}"].font = FONT_BODY_BOLD
    ws[f"Q{row}"].alignment = Alignment(horizontal="right", vertical="center")
    ws[f"W{row}"] = f"=P{totals_row}+W{totals_row}"
    ws[f"W{row}"].font = FONT_BODY_BOLD
    ws[f"W{row}"].fill = FILL_TOTALS
    ws[f"W{row}"].number_format = FMT_TTD
    ws[f"W{row}"].alignment = ALIGN_RIGHT

    ws.row_dimensions[row].height = 18


def _write_signature_row(ws: Worksheet, row: int) -> None:
    """Final signature row — empty row above, then signature placeholders."""
    ws[f"A{row}"] = "Signature of Examining Officer: ______________________________"
    ws[f"A{row}"].font = FONT_BODY
    ws[f"J{row}"] = "SIGNATURE, NAME & LICENCE NO OF DECLARANT: ______________________________"
    ws[f"J{row}"].font = FONT_BODY


def _correction_for(manifest: Dict[str, Any], line_no: int) -> Optional[Dict[str, Any]]:
    exam = manifest.get("officer_examination") or {}
    for c in exam.get("corrections", []):
        if c.get("line_no") == line_no:
            return c
    return None


def build_worksheet_v3(manifest: Dict[str, Any]) -> bytes:
    """Build the Worksheet v3 XLSX as bytes, matching the real broker template."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"

    rate = float(manifest.get("exch_rate", 0))
    if rate <= 0:
        raise ValueError("exch_rate must be > 0")

    # Page setup: portrait, fit-to-page, A4 — matches real broker template.
    ws.page_setup.orientation = ws.ORIENTATION_PORTRAIT
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = 0.3
    ws.page_margins.right = 0.3
    ws.page_margins.top = 0.5
    ws.page_margins.bottom = 0.5

    _set_widths(ws)
    _write_title_block(ws, manifest)
    _write_banner(ws)
    _write_column_headers(ws)

    lines = manifest.get("lines", []) or []
    for i, line in enumerate(lines):
        row = ROW_DATA_START + i
        correction = _correction_for(manifest, line.get("line_no"))
        _write_data_row(ws, row, line, rate, correction)

    if lines:
        first_data = ROW_DATA_START
        last_data = ROW_DATA_START + len(lines) - 1
        totals_row = last_data + 1
        grand_row = totals_row + 1
        sig_row = grand_row + 2

        _write_totals_row(ws, totals_row, first_data, last_data)
        _write_grand_total_row(ws, grand_row, totals_row)
        _write_signature_row(ws, sig_row)

    # Officer-discovered new lines (line_no=null) appended below signature
    exam = manifest.get("officer_examination") or {}
    new_corrs = [c for c in exam.get("corrections", []) if c.get("line_no") is None]
    if new_corrs:
        anchor_row = (ROW_DATA_START + len(lines) + 4) if lines else ROW_DATA_START
        ws.merge_cells(f"A{anchor_row}:{LAST_MERGE_COL}{anchor_row}")
        c = ws[f"A{anchor_row}"]
        c.value = "OFFICER-DISCOVERED LINES (Section 3 only)"
        c.font = FONT_BANNER
        c.fill = FILL_S3
        c.alignment = ALIGN_CENTER
        for i, corr in enumerate(new_corrs):
            r = anchor_row + 1 + i
            ws[f"Q{r}"] = corr.get("officer_thn", "")
            ws[f"R{r}"] = float(corr.get("add_cost_usd") or 0)
            adj = corr.get("adjusted_cif_ttd")
            ws[f"S{r}"] = float(adj) if adj is not None else f"=R{r}*{rate}"
            ws[f"T{r}"] = float(corr.get("add_duty") or 0)
            ws[f"U{r}"] = float(corr.get("add_opt") or 0)
            ws[f"V{r}"] = float(corr.get("add_vat") or 0)
            ws[f"W{r}"] = f"=T{r}+U{r}+V{r}"
            for item in LAYOUT_V3_S3:
                cell = ws[f"{item['col']}{r}"]
                cell.font = FONT_BODY
                cell.alignment = item["align"]
                cell.border = BORDER_THIN
                if item["fmt"] not in ("@", None):
                    cell.number_format = item["fmt"]
            ws.row_dimensions[r].height = 27.75

    # Freeze the top header rows so scrolling keeps them visible
    ws.freeze_panes = f"B{ROW_DATA_START}"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── Hazmat (Swissport Transit Shed Form) ─────────────────────────────────────
# This is a manifest-level form, NOT a per-line block layout. It contains
# Trade and Non-Trade sections with three sub-rows each:
#   - Original Declared on Worksheet
#   - Additional Taxes (formula = Final - Original)
#   - Final Assessed Values
#
# For TTPOST the Trade section is all-zero by convention (TTPOST express
# is non-commercial).
#
# Tax columns at row 22:  F=CIF  H=OPT  J=DUTY  L=VAT  N=TOTAL

HAZMAT_TAX_COLS = {
    "cif":   "F",
    "opt":   "H",
    "duty":  "J",
    "vat":   "L",
    "total": "N",
}

# Trade section (typically zero for TTPOST express)
HAZMAT_TRADE_ORIGINAL = 23
HAZMAT_TRADE_ADDITIONAL = 25
HAZMAT_TRADE_FINAL = 27

# Non-Trade section (the manifest values land here)
HAZMAT_NT_ORIGINAL = 31
HAZMAT_NT_ADDITIONAL = 33
HAZMAT_NT_FINAL = 35

# Summary footer
HAZMAT_TOTAL_ADDITIONAL = 38   # = Non-Trade Additional row (38 cells reference 33)
HAZMAT_TOTAL_TAXES = 41        # = Non-Trade Final row (41 cells reference 35)


def _hzm_sum_total(ws: Worksheet, row: int) -> None:
    """N column total for one tax row = F + H + J + L."""
    cols = HAZMAT_TAX_COLS
    ws[f"{cols['total']}{row}"] = (
        f"={cols['cif']}{row}+{cols['opt']}{row}+"
        f"{cols['duty']}{row}+{cols['vat']}{row}"
    )


def _hzm_apply_money_format(ws: Worksheet, rows: List[int]) -> None:
    for r in rows:
        for col in HAZMAT_TAX_COLS.values():
            cell = ws[f"{col}{r}"]
            cell.number_format = FMT_TTD
            cell.font = FONT_BODY
            cell.alignment = ALIGN_RIGHT
            cell.border = BORDER_THIN


def _write_hazmat_meta(ws: Worksheet, manifest: Dict[str, Any]) -> None:
    """Top of Hazmat form: title block, courier, AWB, package counts."""
    rate = float(manifest.get("exch_rate", 0))
    awb = manifest.get("manifest_no", "")
    arrival = manifest.get("arrival_date", "")
    cargo_reporter = manifest.get("cargo_reporter", "TTPOST")
    if cargo_reporter == "TRINIDAD AND TOBAGO POSTAL CORPORATION":
        cargo_reporter = "TTPOST"

    # Big title (rows 2-4 merged)
    ws.merge_cells("B2:O4")
    c = ws["B2"]
    c.value = "SWISSPORT TRANSIT SHED COURIER DATA FORM"
    c.font = Font(name="Arial", size=14, bold=True, color="FFFFFF")
    c.fill = FILL_TITLE
    c.alignment = ALIGN_CENTER
    ws.row_dimensions[2].height = 22
    ws.row_dimensions[3].height = 22
    ws.row_dimensions[4].height = 22

    # Row 5 — Date / NTDE No / CED Receipt / VAT No
    ws["B5"] = "Date:"
    ws["C5"] = arrival
    ws["E5"] = "NTDE No:"
    ws["F5"] = ""  # broker fills in
    ws["I5"] = "CED Receipt No."
    ws["M5"] = "VAT No:"
    ws["N5"] = manifest.get("declarant_vat_no") or "V117369"
    for col in ("B", "E", "I", "M"):
        ws[f"{col}5"].font = FONT_META

    # Row 7 — Name of courier / AWB
    ws["B7"] = "NAME OF COURIER:"
    ws["D7"] = cargo_reporter
    ws["J7"] = "AWB/BL #"
    ws["K7"] = awb
    for col in ("B", "J"):
        ws[f"{col}7"].font = FONT_META

    # Row 8 — Date of arrival / Rot. No / Carrier
    ws["B8"] = "Date of Arrival:"
    ws["D8"] = arrival
    ws["G8"] = "Rot. No"
    ws["K8"] = "Carrier:"
    ws["L8"] = ""  # broker fills in
    for col in ("B", "G", "K"):
        ws[f"{col}8"].font = FONT_META

    # Rows 9–18 — package counts
    ws["B9"] = "No. of Skids."
    ws["B10"] = "No. of Boxes."
    ws["D10"] = ""  # broker fills count
    ws["G10"] = "No. of Commercial Pcs"

    n_pkgs = sum(int(l.get("packages") or 0) for l in manifest.get("lines", []))
    ws["E11"] = "Total No of Pkgs"
    ws["F11"] = "=I13+I10"   # commercial + non-commercial

    ws["B13"] = "No. of bags"
    ws["G13"] = "No. of Non Commercial Pcs"
    ws["I13"] = n_pkgs

    ws["B16"] = "No. of Pkgs Detained"
    ws["G16"] = "No. of Pkgs Seized"

    ws["B18"] = "No. of Pkgs Bonded"

    for r in (5, 7, 8, 9, 10, 11, 13, 16, 18):
        for col in "BCDEFGHIJKLMN":
            cell = ws[f"{col}{r}"]
            if cell.value is not None and not cell.font.bold:
                cell.font = FONT_BODY


def _write_hazmat_tax_table(
    ws: Worksheet,
    manifest: Dict[str, Any],
) -> None:
    """Write the Trade + Non-Trade tax sections."""
    cols = HAZMAT_TAX_COLS
    totals = manifest.get("totals", {}) or {}

    # Tax column headers at row 22
    ws[f"{cols['cif']}22"] = "CIF"
    ws[f"{cols['opt']}22"] = "OPT"
    ws[f"{cols['duty']}22"] = "DUTY"
    ws[f"{cols['vat']}22"] = "VAT"
    ws[f"{cols['total']}22"] = "TOTAL"
    for col in cols.values():
        c = ws[f"{col}22"]
        c.font = FONT_HEADER
        c.fill = FILL_HAZMAT_HEADER
        c.alignment = ALIGN_CENTER
        c.border = BORDER_THIN
    ws.row_dimensions[22].height = 22

    # ─── Trade section (typically zero for TTPOST) ──────────────────────────
    ws[f"B{HAZMAT_TRADE_ORIGINAL}"] = "Original Values Declared"
    ws[f"B{HAZMAT_TRADE_ORIGINAL + 1}"] = "on Worksheet"
    ws[f"E{HAZMAT_TRADE_ORIGINAL}"] = "Trade"
    for col in cols.values():
        if col != cols["total"]:
            ws[f"{col}{HAZMAT_TRADE_ORIGINAL}"] = 0
    _hzm_sum_total(ws, HAZMAT_TRADE_ORIGINAL)

    ws[f"B{HAZMAT_TRADE_ADDITIONAL + 1}"] = "Additional Taxes"
    for col in cols.values():
        if col != cols["total"]:
            ws[f"{col}{HAZMAT_TRADE_ADDITIONAL}"] = (
                f"={col}{HAZMAT_TRADE_FINAL}-{col}{HAZMAT_TRADE_ORIGINAL}"
            )
    _hzm_sum_total(ws, HAZMAT_TRADE_ADDITIONAL)

    ws[f"B{HAZMAT_TRADE_FINAL + 1}"] = "Final Assessed Values"
    for col in cols.values():
        if col != cols["total"]:
            ws[f"{col}{HAZMAT_TRADE_FINAL}"] = 0
    _hzm_sum_total(ws, HAZMAT_TRADE_FINAL)

    # ─── Non-Trade section (the manifest values) ────────────────────────────
    # Original = the totals from the Worksheet (declared)
    orig_cif = float(totals.get("total_cif_ttd") or 0)
    orig_duty = float(totals.get("total_duty") or 0)
    orig_opt = float(totals.get("total_opt") or 0)
    orig_vat = float(totals.get("total_vat") or 0)

    # Additional = sum of officer correction add_* values
    add_duty = 0.0
    add_opt = 0.0
    add_vat = 0.0
    add_cif = 0.0
    exam = manifest.get("officer_examination") or {}
    for c in exam.get("corrections", []) or []:
        add_duty += float(c.get("add_duty") or 0)
        add_opt += float(c.get("add_opt") or 0)
        add_vat += float(c.get("add_vat") or 0)
        add_cif += float(c.get("adjusted_cif_ttd") or 0)

    ws[f"B{HAZMAT_NT_ORIGINAL}"] = "Original Values Declared"
    ws[f"B{HAZMAT_NT_ORIGINAL + 1}"] = "on Worksheet"
    ws[f"E{HAZMAT_NT_ORIGINAL}"] = "Non-Trade"
    ws[f"{cols['cif']}{HAZMAT_NT_ORIGINAL}"] = round(orig_cif, 2)
    ws[f"{cols['opt']}{HAZMAT_NT_ORIGINAL}"] = round(orig_opt, 2)
    ws[f"{cols['duty']}{HAZMAT_NT_ORIGINAL}"] = round(orig_duty, 2)
    ws[f"{cols['vat']}{HAZMAT_NT_ORIGINAL}"] = round(orig_vat, 2)
    _hzm_sum_total(ws, HAZMAT_NT_ORIGINAL)

    ws[f"B{HAZMAT_NT_ADDITIONAL + 1}"] = "Additional Taxes"
    for col in cols.values():
        if col != cols["total"]:
            ws[f"{col}{HAZMAT_NT_ADDITIONAL}"] = (
                f"={col}{HAZMAT_NT_FINAL}-{col}{HAZMAT_NT_ORIGINAL}"
            )
    _hzm_sum_total(ws, HAZMAT_NT_ADDITIONAL)

    ws[f"B{HAZMAT_NT_FINAL + 1}"] = "Final Assessed Values"
    final_cif = round(orig_cif + add_cif, 2)
    final_duty = round(orig_duty + add_duty, 2)
    final_opt = round(orig_opt + add_opt, 2)
    final_vat = round(orig_vat + add_vat, 2)
    ws[f"{cols['cif']}{HAZMAT_NT_FINAL}"] = final_cif
    ws[f"{cols['opt']}{HAZMAT_NT_FINAL}"] = final_opt
    ws[f"{cols['duty']}{HAZMAT_NT_FINAL}"] = final_duty
    ws[f"{cols['vat']}{HAZMAT_NT_FINAL}"] = final_vat
    _hzm_sum_total(ws, HAZMAT_NT_FINAL)

    # ─── Summary footer ─────────────────────────────────────────────────────
    ws[f"B{HAZMAT_TOTAL_ADDITIONAL + 1}"] = "Total Additional Taxes"
    for col in cols.values():
        if col != cols["total"]:
            ws[f"{col}{HAZMAT_TOTAL_ADDITIONAL}"] = f"={col}{HAZMAT_NT_ADDITIONAL}"
    _hzm_sum_total(ws, HAZMAT_TOTAL_ADDITIONAL)

    ws[f"B{HAZMAT_TOTAL_TAXES + 1}"] = "TOTAL TAXES"
    for col in cols.values():
        if col != cols["total"]:
            ws[f"{col}{HAZMAT_TOTAL_TAXES}"] = f"={col}{HAZMAT_NT_FINAL}"
    _hzm_sum_total(ws, HAZMAT_TOTAL_TAXES)

    # Apply money formatting + boldness
    money_rows = [
        HAZMAT_TRADE_ORIGINAL, HAZMAT_TRADE_ADDITIONAL, HAZMAT_TRADE_FINAL,
        HAZMAT_NT_ORIGINAL, HAZMAT_NT_ADDITIONAL, HAZMAT_NT_FINAL,
        HAZMAT_TOTAL_ADDITIONAL, HAZMAT_TOTAL_TAXES,
    ]
    _hzm_apply_money_format(ws, money_rows)

    # Highlight final-assessed and total-taxes rows
    for r in (HAZMAT_NT_FINAL, HAZMAT_TOTAL_TAXES):
        for col in cols.values():
            ws[f"{col}{r}"].fill = FILL_HAZMAT_FINAL
            ws[f"{col}{r}"].font = FONT_BODY_BOLD

    # Section labels
    for r in money_rows:
        for col in ("B",):
            cell = ws[f"{col}{r + 1}" if r in (
                HAZMAT_TRADE_ORIGINAL, HAZMAT_TRADE_ADDITIONAL, HAZMAT_TRADE_FINAL,
                HAZMAT_NT_ORIGINAL, HAZMAT_NT_ADDITIONAL, HAZMAT_NT_FINAL,
                HAZMAT_TOTAL_ADDITIONAL, HAZMAT_TOTAL_TAXES,
            ) else f"{col}{r}"]
            if cell.value:
                cell.font = FONT_BODY
        for col in ("B",):
            ws[f"{col}{r}"].font = FONT_BODY_BOLD


def _set_hazmat_widths(ws: Worksheet) -> None:
    widths = {
        "A": 3, "B": 18, "C": 11, "D": 11, "E": 11, "F": 11, "G": 13,
        "H": 11, "I": 11, "J": 11, "K": 11, "L": 11, "M": 11, "N": 11, "O": 11,
    }
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


def build_hazmat(manifest: Dict[str, Any]) -> bytes:
    """Build the Swissport Transit Shed Courier Data Form XLSX as bytes."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"

    # Page setup: portrait, fit-to-page, A4 — matches real broker template.
    ws.page_setup.orientation = ws.ORIENTATION_PORTRAIT
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = 0.4
    ws.page_margins.right = 0.4
    ws.page_margins.top = 0.5
    ws.page_margins.bottom = 0.5

    _set_hazmat_widths(ws)
    _write_hazmat_meta(ws, manifest)
    _write_hazmat_tax_table(ws, manifest)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── Public surface ───────────────────────────────────────────────────────────

__all__ = [
    "build_worksheet_v3",
    "build_hazmat",
    "LAYOUT_V3_S2",
    "LAYOUT_V3_S3",
]
