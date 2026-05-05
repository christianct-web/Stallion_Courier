import { useState, useMemo } from "react";
import { getCbttRate } from "@/services/stallionApi";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  form: any;
  setForm: (fn: (f: any) => any) => void;
  calc: any;
  onCalculate: () => void;
  box23Types: Array<{ type: string; label: string; amount: number; auto: boolean }>;
  selectedBox23: string[];
  setSelectedBox23: (v: string[]) => void;
  shippedOnBoardDate: string;
  sectionErrors: number;
  sectionWarnings: number;
}

const Fmt = (n: number | undefined | null) =>
  n == null ? "—" : n.toLocaleString("en-TT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Reuse the same field component pattern as the rest of the workbench
function WbField({
  label, value, onChange, mono = false,
  warn = false, critical = false, note, placeholder, tooltip, type = "text", step,
}: {
  label: string; value: string | number; onChange: (v: string) => void;
  mono?: boolean; warn?: boolean; critical?: boolean;
  note?: string; placeholder?: string; tooltip?: string;
  type?: string; step?: string;
}) {
  const cls = critical ? "critical" : warn ? "warn" : "";
  return (
    <div className={`wb-field ${cls}`}>
      <div className="wb-field-label">
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span style={{ borderBottom: "1px dotted var(--wb-paper-mid)", cursor: "help" }}>
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" style={{ fontFamily: "var(--wb-font-serif)", fontSize: 12 }}>
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : label}
      </div>
      <input
        className={`wb-field-input mono`}
        type={type}
        step={step}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {note && <div className="wb-field-note">{note}</div>}
    </div>
  );
}

function SubHead({ label }: { label: string }) {
  return <div className="wb-subhead">{label}</div>;
}

export function WorkbenchWorksheet({
  form, setForm, calc, onCalculate,
  box23Types, selectedBox23, setSelectedBox23,
  shippedOnBoardDate,
  sectionErrors, sectionWarnings,
}: Props) {
  const [cbttLoading, setCbttLoading] = useState(false);
  const [cbttSource,  setCbttSource]  = useState<string | null>(null);
  const [cbttWarning, setCbttWarning] = useState<string | null>(null);

  const handleCbttLookup = async () => {
    setCbttLoading(true);
    setCbttWarning(null);
    try {
      const dateStr = shippedOnBoardDate || new Date().toISOString().slice(0, 10);
      const result  = await getCbttRate(dateStr);
      if (!result) { setCbttWarning("CBTT lookup unavailable — check backend connection"); return; }
      setForm((f: any) => ({ ...f, exchange_rate: result.rate }));
      setCbttSource(result.source);
      if (result.source === "fallback") {
        setCbttWarning(`Rate from fallback cache — couldn't reach Central Bank (${result.rate})`);
      } else {
        setCbttWarning(null);
      }
    } catch {
      setCbttWarning("CBTT lookup failed");
    } finally {
      setCbttLoading(false);
    }
  };

  const toggleBox23 = (type: string) => {
    setSelectedBox23(
      selectedBox23.includes(type)
        ? selectedBox23.filter(t => t !== type)
        : [...selectedBox23, type]
    );
  };

  const N = (k: string) => Number((form as any)[k]) || 0;
  const set = (k: string) => (v: string) => setForm((f: any) => ({ ...f, [k]: parseFloat(v) || 0 }));

  // Live estimate — pure client-side, no API round-trip
  const liveCalc = useMemo(() => {
    const iv = N("invoice_value_foreign");
    if (iv <= 0) return null;
    const fob         = iv + N("inland_foreign") * (1 + N("uplift_pct") / 100);
    const cif_foreign = Math.max(0, fob + N("freight_foreign") + N("insurance_foreign") + N("other_foreign") - N("deduction_foreign"));
    const xr          = N("exchange_rate") || 6.77;
    const cif_local   = cif_foreign * xr;
    const duty        = cif_local * N("duty_rate_pct") / 100;
    const surcharge   = cif_local * N("surcharge_rate_pct") / 100;
    const vat         = (cif_local + duty + surcharge) * N("vat_rate_pct") / 100;
    const total       = duty + surcharge + vat + N("extra_fees_local");
    return { fob, cif_foreign, cif_local, duty, surcharge, vat, total };
  }, [form]);

  const hasIssue = sectionErrors > 0 || sectionWarnings > 0;
  const titleCls = sectionErrors > 0 ? "has-errors" : sectionWarnings > 0 ? "has-warnings" : "";

  return (
    <div className="wb-card" id="section-worksheet">
      <div className="wb-card-header">
        <span className={`wb-card-title ${titleCls}`}>
          Worksheet · Valuation · Duties
          {hasIssue && (
            <span style={{ marginLeft: 8 }}>({sectionErrors}E / {sectionWarnings}W)</span>
          )}
        </span>
      </div>

      <div className="wb-card-body">

        {/* ── Exchange Rate ── */}
        <SubHead label="Exchange Rate" />

        {/* Exchange rate field with inline CBTT button */}
        <div className="wb-field">
          <div className="wb-field-label">
            <Tooltip>
              <TooltipTrigger asChild>
                <span style={{ borderBottom: "1px dotted var(--wb-paper-mid)", cursor: "help" }}>
                  USD / TTD Rate
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" style={{ fontFamily: "var(--wb-font-serif)", fontSize: 12 }}>
                Central Bank of Trinidad & Tobago weighted average rate for the shipped-on-board date
              </TooltipContent>
            </Tooltip>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              className="wb-field-input mono"
              type="number" step="0.0001"
              value={form.exchange_rate ?? ""}
              onChange={e => set("exchange_rate")(e.target.value)}
              placeholder="6.7700"
              style={{ flex: 1 }}
            />
            <button
              onClick={handleCbttLookup}
              disabled={cbttLoading}
              title={shippedOnBoardDate ? `Lookup CBTT rate for ${shippedOnBoardDate}` : "Lookup today's CBTT rate"}
              style={{
                flexShrink: 0, padding: "0 12px", height: "100%",
                background: "transparent",
                border: "none",
                borderLeft: "1px solid var(--wb-paper-border)",
                fontFamily: "var(--wb-font-mono)", fontSize: 9,
                fontWeight: 700, letterSpacing: "0.1em",
                color: cbttLoading ? "var(--wb-paper-mid)" : "var(--wb-approved)",
                cursor: cbttLoading ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {cbttLoading ? "LOOKING UP…" : "CBTT LOOKUP"}
            </button>
          </div>
        </div>

        {(cbttSource || cbttWarning) && (
          <div style={{
            padding: "6px 16px",
            background: cbttWarning ? "var(--wb-warn)" : "#EBF7F1",
            borderBottom: `1px solid ${cbttWarning ? "var(--wb-warn-border)" : "var(--wb-approved)"}`,
            fontFamily: "var(--wb-font-mono)", fontSize: 10,
            color: cbttWarning ? "var(--wb-warn-text)" : "var(--wb-approved)",
          }}>
            {cbttWarning
              ? `⚠ ${cbttWarning}`
              : `✓ CBTT rate ${form.exchange_rate} (${cbttSource}${shippedOnBoardDate ? ` · SOB ${shippedOnBoardDate}` : ""})`}
          </div>
        )}

        {/* ── EX-WORKS / FOB ── */}
        <SubHead label="Ex-Works / FOB" />
        <WbField
          label="Invoice Value"
          value={form.invoice_value_foreign ?? 0}
          onChange={set("invoice_value_foreign")}
          type="number" step="0.01"
          placeholder="0.00"
          tooltip="Supplier's ex-works or FOB price on the commercial invoice (foreign currency)"
        />
        <WbField
          label="Inland Charges"
          value={form.inland_foreign ?? 0}
          onChange={set("inland_foreign")}
          type="number" step="0.01"
          placeholder="0.00"
          tooltip="Inland freight / trucking from factory to port of export — added to ex-works to arrive at FOB"
        />
        <WbField
          label="Uplift %"
          value={form.uplift_pct ?? 0}
          onChange={set("uplift_pct")}
          type="number" step="0.01"
          placeholder="0.00"
          tooltip="Percentage uplift applied to ex-works for statistical or insurance purposes"
        />

        {/* ── CIF Components ── */}
        <SubHead label="CIF Components" />
        <WbField
          label="Freight"
          value={form.freight_foreign ?? 0}
          onChange={set("freight_foreign")}
          type="number" step="0.01"
          placeholder="0.00"
          tooltip="Ocean or air freight charge (foreign currency)"
        />
        <WbField
          label="Insurance"
          value={form.insurance_foreign ?? 0}
          onChange={set("insurance_foreign")}
          type="number" step="0.01"
          placeholder="0.00"
        />
        <WbField
          label="Other Charges"
          value={form.other_foreign ?? 0}
          onChange={set("other_foreign")}
          type="number" step="0.01"
          placeholder="0.00"
        />
        <WbField
          label="Deductions"
          value={form.deduction_foreign ?? 0}
          onChange={set("deduction_foreign")}
          type="number" step="0.01"
          placeholder="0.00"
          tooltip="Any deductions to be subtracted from the CIF value"
        />

        {/* ── Duty & Tax Rates ── */}
        <SubHead label="Duty & Tax Rates" />
        <WbField
          label="Duty Rate %"
          value={form.duty_rate_pct ?? 0}
          onChange={set("duty_rate_pct")}
          type="number" step="0.01"
          placeholder="0.00"
          tooltip="Import duty rate from the HS tariff schedule"
        />
        <WbField
          label="Surcharge %"
          value={form.surcharge_rate_pct ?? 0}
          onChange={set("surcharge_rate_pct")}
          type="number" step="0.01"
          placeholder="0.00"
        />
        <WbField
          label="VAT Rate %"
          value={form.vat_rate_pct ?? 0}
          onChange={set("vat_rate_pct")}
          type="number" step="0.01"
          placeholder="12.50"
          tooltip="Value Added Tax — standard rate is 12.5%"
        />

        {/* ── Fees ── */}
        <SubHead label="Fees (TTD)" />
        <WbField
          label="Customs User Fee"
          value={form.extra_fees_local ?? 0}
          onChange={set("extra_fees_local")}
          type="number" step="0.01"
          placeholder="80.00"
          tooltip="Standard Customs User Fee (CFU) — typically TT$80"
        />
        <WbField
          label="CES Fee 1"
          value={form.ces_fee_1 ?? 0}
          onChange={set("ces_fee_1")}
          type="number" step="0.01"
          placeholder="0.00"
          tooltip="Container Examination Fee (first line) — typically TT$1,050"
        />
        <WbField
          label="CES Fee 2"
          value={form.ces_fee_2 ?? 0}
          onChange={set("ces_fee_2")}
          type="number" step="0.01"
          placeholder="0.00"
          tooltip="Container Examination Fee (second line) — typically TT$750"
        />

        {/* ── Live Estimate ── */}
        {liveCalc && (
          <>
            <SubHead label="Live Estimate" />
            <div style={{ padding: "12px 16px", background: "var(--wb-paper-alt)" }}>
              <table className="wb-calc-table" style={{ marginBottom: 0 }}>
                <tbody>
                  {[
                    ["FOB",       liveCalc.fob,         "USD"],
                    ["CIF",       liveCalc.cif_foreign, "USD"],
                    ["CIF (TTD)", liveCalc.cif_local,   "TTD"],
                    ["Duty",      liveCalc.duty,        "TTD"],
                    ["Surcharge", liveCalc.surcharge,   "TTD"],
                    ["VAT",       liveCalc.vat,         "TTD"],
                  ].map(([label, val, ccy]) => (
                    <tr key={label as string}>
                      <td>{label as string}</td>
                      <td style={{ textAlign: "right", color: "var(--wb-ink-mid)" }}>
                        {(val as number).toLocaleString("en-TT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span style={{ color: "var(--wb-paper-mid)", marginLeft: 4, fontSize: 10 }}>{ccy as string}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total Due</td>
                    <td style={{ textAlign: "right" }}>
                      {liveCalc.total.toLocaleString("en-TT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span style={{ color: "var(--wb-paper-mid)", marginLeft: 4, fontSize: 10 }}>TTD</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{ marginTop: 8, fontFamily: "var(--wb-font-mono)", fontSize: 9, color: "var(--wb-paper-mid)", fontStyle: "italic" }}>
                Live estimate · updates as you type · click Calculate to confirm
              </div>
            </div>
          </>
        )}

        {/* ── Calculate Button ── */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--wb-paper-border)" }}>
          <button
            className="wb-btn wb-btn-primary"
            onClick={onCalculate}
            style={{ width: "100%" }}
          >
            Calculate Worksheet
          </button>
        </div>

        {/* ── Confirmed Results ── */}
        {calc && (
          <>
            <SubHead label="Confirmed Calculation" />
            <div style={{ padding: "12px 16px", background: "var(--wb-paper)" }}>
              <table className="wb-calc-table">
                <tbody>
                  {([
                    ["FOB",             calc.fob_foreign],
                    ["CIF (Foreign)",   calc.cif_foreign],
                    ["CIF (TTD)",       calc.cif_local],
                    ["Duty",            calc.duty],
                    ["Surcharge",       calc.surcharge],
                    ["VAT",             calc.vat],
                    ["Customs User Fee",calc.customs_user_fee ?? calc.extra_fees_local],
                    ["CES Fees",        (calc.ces_fee_1 ?? 0) + (calc.ces_fee_2 ?? 0)],
                  ] as [string, number][]).map(([label, val]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td style={{ textAlign: "right" }}>{Fmt(val)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total Amount Due (TTD)</td>
                    <td style={{ textAlign: "right", fontSize: 15 }}>{Fmt(calc.total_assessed)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Box 23 Charges ── */}
        {box23Types.length > 0 && (
          <>
            <SubHead label="Box 23 Charges" />
            <div style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {box23Types.map(b => (
                <button
                  key={b.type}
                  onClick={() => toggleBox23(b.type)}
                  className={selectedBox23.includes(b.type) ? "wb-tag wb-tag-active" : "wb-tag"}
                >
                  {b.label} · {b.amount}
                </button>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
