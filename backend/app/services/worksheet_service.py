from __future__ import annotations

from typing import Any, Dict

from ..models import WorksheetInput


def calculate_from_dict(worksheet: Dict[str, Any]) -> Dict[str, Any]:
    """
    Shared duty/tax calculation from a raw worksheet dict.

    This is the single source of truth for CIF, duty, surcharge, and VAT
    calculations. Used by both the API endpoint and PDF generators
    (pack_service, costing_service, invoice_service).
    """
    exworks   = float(worksheet.get("invoice_value_foreign") or 0)
    inland    = float(worksheet.get("inland_foreign") or 0)
    uplift_pct= float(worksheet.get("uplift_pct") or 0)
    exch      = float(worksheet.get("exchange_rate") or 1.0)
    fob_f     = float(worksheet.get("fob_foreign") or 0)
    if not fob_f:
        fob_f = exworks + inland + (exworks * uplift_pct / 100)

    freight_f   = float(worksheet.get("freight_foreign") or 0)
    insurance_f = float(worksheet.get("insurance_foreign") or 0)
    other_f     = float(worksheet.get("other_charges_foreign") or worksheet.get("other_foreign") or 0)
    deduct_f    = float(worksheet.get("deduction_foreign") or 0)
    cif_f       = fob_f + freight_f + insurance_f + other_f - deduct_f
    cif_l       = cif_f * exch

    duty_pct      = float(worksheet.get("duty_rate_pct") or 0)
    surcharge_pct = float(worksheet.get("surcharge_rate_pct") or 0)
    vat_pct       = float(worksheet.get("vat_rate_pct") or 0)

    duty      = float(worksheet.get("duty") or cif_l * duty_pct / 100)
    surcharge = float(worksheet.get("surcharge") or cif_l * surcharge_pct / 100)
    vat       = float(worksheet.get("vat") or ((cif_l + duty + surcharge) * vat_pct / 100))

    cfu   = float(worksheet.get("customs_user_fee") or worksheet.get("extra_fees_local") or 80)
    ces1  = float(worksheet.get("ces_fee_1") or worksheet.get("ces_fees") or 0)
    ces2  = float(worksheet.get("ces_fee_2") or 0)

    total_taxes  = duty + surcharge + vat
    grand_total  = total_taxes + cfu + ces1 + ces2

    return {
        "exworks_f":      round(exworks, 2),
        "inland_f":       round(inland, 2),
        "uplift_pct":     round(uplift_pct, 4),
        "fob_f":          round(fob_f, 2),
        "fob_l":          round(fob_f * exch, 2),
        "freight_f":      round(freight_f, 2),
        "insurance_f":    round(insurance_f, 2),
        "other_f":        round(other_f, 2),
        "deduct_f":       round(deduct_f, 2),
        "exch":           round(exch, 6),
        "cif_f":          round(cif_f, 2),
        "cif_l":          round(cif_l, 2),
        "duty_pct":       round(duty_pct, 4),
        "surcharge_pct":  round(surcharge_pct, 4),
        "vat_pct":        round(vat_pct, 4),
        "duty":           round(duty, 2),
        "surcharge":      round(surcharge, 2),
        "vat":            round(vat, 2),
        "total_taxes":    round(total_taxes, 2),
        "cfu":            round(cfu, 2),
        "ces1":           round(ces1, 2),
        "ces2":           round(ces2, 2),
        "grand_total":    round(grand_total, 2),
    }


def calculate_worksheet(req: WorksheetInput) -> dict:
    """API-facing calculation from a Pydantic model."""
    # FOB = invoice value + inland charges + uplift
    inland    = float(getattr(req, "inland_foreign", 0) or 0)
    uplift_pct= float(getattr(req, "uplift_pct", 0) or 0)
    exworks   = req.invoice_value_foreign
    fob       = exworks + inland + (exworks * uplift_pct / 100)

    cif_foreign = fob + req.freight_foreign + req.insurance_foreign + req.other_foreign - req.deduction_foreign
    cif_local   = cif_foreign * req.exchange_rate

    duty        = cif_local * (req.duty_rate_pct / 100)
    surcharge   = cif_local * (req.surcharge_rate_pct / 100)
    vat_base    = cif_local + duty + surcharge
    vat         = vat_base * (req.vat_rate_pct / 100)

    ces_fee_1   = float(getattr(req, "ces_fee_1", 0) or 0)
    ces_fee_2   = float(getattr(req, "ces_fee_2", 0) or 0)
    customs_user_fee = req.extra_fees_local  # CFU

    total = duty + surcharge + vat + customs_user_fee + ces_fee_1 + ces_fee_2

    return {
        "invoice_value_foreign": round(exworks, 2),
        "inland_foreign":        round(inland, 2),
        "uplift_pct":            round(uplift_pct, 4),
        "fob_foreign":           round(fob, 2),
        "fob_local":             round(fob * req.exchange_rate, 2),
        "freight_foreign":       round(req.freight_foreign, 2),
        "insurance_foreign":     round(req.insurance_foreign, 2),
        "exchange_rate":         round(req.exchange_rate, 6),
        "cif_foreign":           round(cif_foreign, 2),
        "cif_local":             round(cif_local, 2),
        "duty_rate_pct":         round(req.duty_rate_pct, 4),
        "surcharge_rate_pct":    round(req.surcharge_rate_pct, 4),
        "vat_rate_pct":          round(req.vat_rate_pct, 4),
        "duty":                  round(duty, 2),
        "surcharge":             round(surcharge, 2),
        "vat":                   round(vat, 2),
        "extra_fees_local":      round(customs_user_fee, 2),
        "customs_user_fee":      round(customs_user_fee, 2),
        "ces_fee_1":             round(ces_fee_1, 2),
        "ces_fee_2":             round(ces_fee_2, 2),
        "total_assessed":        round(total, 2),
    }
