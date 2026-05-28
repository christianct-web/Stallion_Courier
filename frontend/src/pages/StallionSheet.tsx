/**
 * StallionSheet.tsx — the simplified single-page declaration editor.
 *
 * Replaces Workbench + Extract + the old BrokerReview body. Lives inside the
 * BrokerReview shell (keep the existing sidebar; render this where the old
 * review body was). Grid-first, modelled on CourierWorkbench:
 *
 *   ┌ Header strip (inline edit + dropdowns: port, incoterm) ──────────────┐
 *   │ Freight Factor (auto)                                                │
 *   ├ Line grid (inline edit; HS lookup on description; expand row ▸) ─────┤
 *   │   row drawer: CPC · country of origin · pkg type · supp. unit (all   │
 *   │   dropdowns) · licence no                                            │
 *   ├ Totals panel ───────────────────────────────────────────────────────┤
 *   └ Actions: Upload docs · Download Worksheet · Generate C82 XML ────────┘
 *
 * Wire route in App.tsx:
 *   <Route path="/stallion/sheet/:sheetId" element={<StallionSheet />} />
 * (and keep a thin list page mirroring CourierManifests — see StallionSheetList.tsx)
 */
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  getSheet, updateHeader, addLine, updateLine, deleteLine,
  classify, getReference, worksheetUrl, generateXml, uploadExtract,
  Sheet, SheetLine, RefOption, RefData,
} from "@/services/sheetApi";

// ── design tokens (match BrokerReview) ───────────────────────────────────────
const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6", paperMid: "#CCC7BE",
  ink: "#18150F", inkMid: "#3D3830", inkLight: "#6B6560",
  void: "#111318", voidMid: "#191D26", voidSurface: "#1F2430", voidBorder: "#2E3748",
  ghost: "#A0AABB", ghostDim: "#6B7585",
  gold: "#B8860B", amber: "#FFF4D6", amberText: "#8A6D00",
  approved: "#1A5E3A", warn: "#FEF3DC", warnBorder: "#D4A020",
};
const MONO = "'JetBrains Mono','SFMono-Regular',monospace";
const fmt = (n: number | undefined) =>
  (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── tiny inputs ───────────────────────────────────────────────────────────────
function Cell({ value, onCommit, align = "left", width, mono = true, type = "text" }: {
  value: string | number; onCommit: (v: string) => void; align?: "left" | "right" | "center";
  width?: number; mono?: boolean; type?: string;
}) {
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  return (
    <input
      type={type} value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== String(value ?? "")) onCommit(v); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{
        fontFamily: mono ? MONO : "inherit", fontSize: 12, textAlign: align,
        padding: "5px 7px", width: width ?? "100%", boxSizing: "border-box",
        border: `1px solid ${C.paperBorder}`, borderRadius: 3,
        background: "#fff", color: C.ink, outline: "none",
      }}
    />
  );
}

function Select({ value, options, onCommit, width }: {
  value: string; options: RefOption[]; onCommit: (v: string) => void; width?: number;
}) {
  return (
    <select
      value={value ?? ""} onChange={e => onCommit(e.target.value)}
      style={{
        fontFamily: MONO, fontSize: 12, padding: "5px 7px", width: width ?? "100%",
        boxSizing: "border-box", border: `1px solid ${C.paperBorder}`, borderRadius: 3,
        background: "#fff", color: C.ink, outline: "none",
      }}
    >
      {options.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 130 }}>
      <label style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em",
        color: C.inkLight, textTransform: "uppercase",
      }}>{label}</label>
      {children}
    </div>
  );
}

// ── HS lookup popover on the description cell ──────────────────────────────────
function DescriptionCell({ line, sheetId, onUpdate, refData }: {
  line: SheetLine; sheetId: string; onUpdate: (patch: Partial<SheetLine>) => void; refData: RefData;
}) {
  const [open, setOpen] = useState(false);
  const [sug, setSug] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const runClassify = useCallback(async () => {
    if (!line.description?.trim()) return;
    setBusy(true);
    try {
      const r = await classify(sheetId, line.description);
      setSug(r.suggestions || []); setOpen(true);
    } finally { setBusy(false); }
  }, [sheetId, line.description]);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 4 }}>
        <Cell value={line.description}
          onCommit={v => onUpdate({ description: v })} mono={false} />
        <button onClick={runClassify} disabled={busy} title="Classify (HS lookup)"
          style={{
            fontFamily: MONO, fontSize: 10, padding: "0 8px", cursor: "pointer",
            border: `1px solid ${C.gold}`, borderRadius: 3, background: C.amber,
            color: C.amberText, whiteSpace: "nowrap",
          }}>{busy ? "…" : "HS"}</button>
      </div>
      {open && sug.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60,
          background: "#fff", border: `1px solid ${C.paperBorder}`, borderRadius: 4,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)", maxHeight: 280, overflowY: "auto",
        }}>
          {sug.map((s, i) => (
            <button key={i} onClick={() => {
              onUpdate({
                hs_code: s.code, duty_pct: s.dutyPct ?? s.duty_rate ?? 0,
                vat_pct: s.vatPct ?? 12.5,
              });
              setOpen(false);
            }} style={{
              display: "block", width: "100%", textAlign: "left", padding: "7px 10px",
              border: "none", borderBottom: `1px solid ${C.paperAlt}`, cursor: "pointer",
              background: "#fff", fontFamily: MONO, fontSize: 11,
            }}>
              <strong>{s.code}</strong> · {(s.dutyPct ?? s.duty_rate ?? 0)}% duty
              <div style={{ color: C.inkLight, fontSize: 10 }}>{(s.description || "").slice(0, 70)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── expandable row drawer (C82-only fields, all dropdowns) ─────────────────────
function RowDrawer({ line, refData, onUpdate }: {
  line: SheetLine; refData: RefData; onUpdate: (patch: Partial<SheetLine>) => void;
}) {
  return (
    <tr>
      <td colSpan={12} style={{ background: C.paperAlt, padding: "12px 16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <Field label="CPC">
            <Select value={line.cpc} options={refData.cpc}
              onCommit={v => onUpdate({ cpc: v })} width={300} />
          </Field>
          <Field label="Country of Origin">
            <Select value={line.country_of_origin} options={refData.countries}
              onCommit={v => onUpdate({ country_of_origin: v })} width={200} />
          </Field>
          <Field label="Package Type">
            <Select value={line.package_type} options={refData.package_types}
              onCommit={v => onUpdate({ package_type: v })} width={160} />
          </Field>
          <Field label="Package Count">
            <Cell value={line.package_count} type="number" align="right" width={90}
              onCommit={v => onUpdate({ package_count: Number(v) })} />
          </Field>
          <Field label="Supp. Unit">
            <Select value={line.supplementary_unit} options={refData.supplementary_units}
              onCommit={v => onUpdate({ supplementary_unit: v })} width={180} />
          </Field>
          <Field label="Supp. Qty">
            <Cell value={line.supplementary_qty} type="number" align="right" width={90}
              onCommit={v => onUpdate({ supplementary_qty: Number(v) })} />
          </Field>
          <Field label="Licence No.">
            <Cell value={line.licence_no} width={160}
              onCommit={v => onUpdate({ licence_no: v })} />
          </Field>
          <Field label="Effects Group">
            <Select value={line.effects_group || "household"}
              options={[
                { code: "household", label: "household" },
                { code: "personal", label: "personal" },
              ]}
              onCommit={v => onUpdate({ effects_group: v as any })} width={160} />
          </Field>
          <Field label="Relieved Override">
            <Select value={line.relieved_override ? "yes" : "no"}
              options={[
                { code: "no", label: "No" },
                { code: "yes", label: "Yes" },
              ]}
              onCommit={v => onUpdate({ relieved_override: v === "yes" })} width={110} />
          </Field>
        </div>
      </td>
    </tr>
  );
}

// ── generate-XML modal (declaration-level dropdowns) ───────────────────────────
function GenerateModal({ sheet, refData, onClose, onGenerate }: {
  sheet: Sheet; refData: RefData; onClose: () => void;
  onGenerate: (patch: Partial<Sheet>) => void;
}) {
  const [regime, setRegime] = useState(sheet.customs_regime || "C4");
  const [nature, setNature] = useState(sheet.nature_of_transaction || "1");
  const [tin, setTin] = useState(sheet.consignee_tin || "");
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.paper, borderRadius: 8, padding: 24, width: 460,
        border: `1px solid ${C.paperBorder}`,
      }}>
        <h3 style={{ fontFamily: MONO, fontSize: 15, color: C.ink, margin: "0 0 4px" }}>
          Generate C82 XML
        </h3>
        <p style={{ fontFamily: "inherit", fontSize: 12, color: C.inkLight, margin: "0 0 18px" }}>
          Confirm the declaration-level fields the SAD needs before export.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Customs Regime">
            <Select value={regime} options={refData.customs_regimes} onCommit={setRegime} />
          </Field>
          <Field label="Nature of Transaction (Box 24)">
            <Select value={nature} options={refData.nature_of_transaction} onCommit={setNature} />
          </Field>
          <Field label="Consignee TIN / Code">
            <Cell value={tin} onCommit={setTin} />
          </Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{
            fontFamily: MONO, fontSize: 12, padding: "8px 16px", cursor: "pointer",
            border: `1px solid ${C.paperBorder}`, borderRadius: 4, background: "#fff", color: C.ink,
          }}>Cancel</button>
          <button onClick={() => onGenerate({
            customs_regime: regime, nature_of_transaction: nature, consignee_tin: tin,
          })} style={{
            fontFamily: MONO, fontSize: 12, padding: "8px 16px", cursor: "pointer",
            border: "none", borderRadius: 4, background: C.ink, color: "#fff",
          }}>Generate & Download</button>
        </div>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function StallionSheet() {
  const { sheetId = "" } = useParams();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [refData, setRefData] = useState<RefData | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showGen, setShowGen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getReference().then(setRefData); }, []);
  useEffect(() => { if (sheetId) getSheet(sheetId).then(setSheet); }, [sheetId]);

  const patchHeader = useCallback(async (patch: Partial<Sheet>) => {
    const s = await updateHeader(sheetId, patch); setSheet(s);
  }, [sheetId]);
  const patchLine = useCallback(async (lineNo: number, patch: Partial<SheetLine>) => {
    const s = await updateLine(sheetId, lineNo, patch); setSheet(s);
  }, [sheetId]);
  const addRow = useCallback(async () => { setSheet(await addLine(sheetId, {})); }, [sheetId]);
  const removeRow = useCallback(async (n: number) => { setSheet(await deleteLine(sheetId, n)); }, [sheetId]);

  const onUpload = useCallback(async (file: File) => {
    const s = await uploadExtract(sheetId, file); setSheet(s);  // auto-populates grid
  }, [sheetId]);

  const onGenerate = useCallback(async (patch: Partial<Sheet>) => {
    setShowGen(false);
    await generateXml(sheetId, patch); // triggers download
  }, [sheetId]);

  const toggle = (n: number) => setExpanded(p => {
    const next = new Set(p); next.has(n) ? next.delete(n) : next.add(n); return next;
  });

  if (!sheet || !refData) {
    return <div style={{ padding: 40, fontFamily: MONO, color: C.inkLight }}>Loading sheet…</div>;
  }
  const t = sheet.totals || {} as any;

  const TH = (label: string, w?: number, align: any = "left") => (
    <th style={{
      fontFamily: MONO, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase",
      color: "#fff", background: C.ink, padding: "8px 7px", textAlign: align,
      width: w, position: "sticky", top: 0,
    }}>{label}</th>
  );

  return (
    <div style={{ background: C.paper, minHeight: "100%", padding: 20 }}>
      {/* ── header strip ── */}
      <div style={{
        background: "#fff", border: `1px solid ${C.paperBorder}`, borderRadius: 6,
        padding: 16, marginBottom: 14,
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12 }}>
          <Field label="Consignee"><Cell value={sheet.consignee} mono={false} width={220}
            onCommit={v => patchHeader({ consignee: v })} /></Field>
          <Field label="Reference #"><Cell value={sheet.reference} width={130}
            onCommit={v => patchHeader({ reference: v })} /></Field>
          <Field label="Vessel"><Cell value={sheet.vessel} width={140}
            onCommit={v => patchHeader({ vessel: v })} /></Field>
          <Field label="Bill of Lading"><Cell value={sheet.bl_number} width={150}
            onCommit={v => patchHeader({ bl_number: v })} /></Field>
          <Field label="Port"><Select value={sheet.port} options={refData.ports} width={170}
            onCommit={v => patchHeader({ port: v })} /></Field>
          <Field label="Arrival Date"><Cell value={sheet.arrival_date} type="date" width={150}
            onCommit={v => patchHeader({ arrival_date: v })} /></Field>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Field label="Incoterm"><Select value={sheet.incoterm} options={refData.incoterms} width={150}
            onCommit={v => patchHeader({ incoterm: v })} /></Field>
          <Field label="Exchange Rate"><Cell value={sheet.exchange_rate} type="number" align="right" width={120}
            onCommit={v => patchHeader({ exchange_rate: Number(v) })} /></Field>
          <Field label="Freight (USD)"><Cell value={sheet.freight_usd} type="number" align="right" width={130}
            onCommit={v => patchHeader({ freight_usd: Number(v) })} /></Field>
          <Field label="Customs User Fee"><Cell value={sheet.customs_user_fee} type="number" align="right" width={120}
            onCommit={v => patchHeader({ customs_user_fee: Number(v) })} /></Field>
          <Field label="Entry Mode">
            <Select
              value={(sheet.entry_mode || "dutiable") as string}
              options={[
                { code: "dutiable", label: "Dutiable" },
                { code: "relieved", label: "Relieved" },
              ]}
              width={150}
              onCommit={v => patchHeader({ entry_mode: v as any })}
            />
          </Field>
          <div style={{
            display: "flex", flexDirection: "column", gap: 3, justifyContent: "flex-end",
            padding: "0 12px", background: C.amber, borderRadius: 4, border: `1px solid ${C.warnBorder}`,
          }}>
            <label style={{ fontFamily: MONO, fontSize: 9, color: C.amberText, textTransform: "uppercase", paddingTop: 6 }}>
              CIF Factor</label>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: C.amberText, paddingBottom: 6 }}>
              {(sheet.cif_factor ?? 0).toFixed(12)}</div>
          </div>
        </div>
      </div>

      {/* ── line grid ── */}
      <div style={{ background: "#fff", border: `1px solid ${C.paperBorder}`, borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {TH("", 28)}{TH("#", 32, "center")}{TH("HS Code", 100, "center")}
              {TH("Description")}{TH("EX-WORKS", 90, "right")}{TH("Freight", 80, "right")}
              {TH("CIF USD", 90, "right")}{TH("CIF TTD", 100, "right")}
              {TH("Duty %", 60, "center")}{TH("Duty", 90, "right")}{TH("VAT", 90, "right")}
              {TH("Total Tax", 100, "right")}
            </tr>
          </thead>
          <tbody>
            {sheet.lines.map((ln, i) => {
              const cellTd: React.CSSProperties = { padding: "3px 5px", borderBottom: `1px solid ${C.paperAlt}`, verticalAlign: "middle" };
              const num = (v: number) => (
                <td style={{ ...cellTd, textAlign: "right", fontFamily: MONO, fontSize: 12, color: C.inkMid }}>{fmt(v)}</td>
              );
              return (
                <>
                  <tr key={ln.id} style={{ background: i % 2 ? C.paperAlt + "55" : "#fff" }}>
                    <td style={{ ...cellTd, textAlign: "center" }}>
                      <button onClick={() => toggle(ln.line_no)} title="More fields"
                        style={{ border: "none", background: "none", cursor: "pointer", color: C.gold, fontSize: 13 }}>
                        {expanded.has(ln.line_no) ? "▾" : "▸"}</button>
                    </td>
                    <td style={{ ...cellTd, textAlign: "center", fontFamily: MONO, fontSize: 11, color: C.inkLight }}>{ln.line_no}</td>
                    <td style={cellTd}><Cell value={ln.hs_code} align="center"
                      onCommit={v => patchLine(ln.line_no, { hs_code: v })} /></td>
                    <td style={cellTd}><DescriptionCell line={ln} sheetId={sheetId} refData={refData}
                      onUpdate={p => patchLine(ln.line_no, p)} /></td>
                    <td style={cellTd}><Cell value={ln.exworks_usd} type="number" align="right"
                      onCommit={v => patchLine(ln.line_no, { exworks_usd: Number(v) })} /></td>
                    {num(ln.freight_usd)}{num(ln.cif_usd)}{num(ln.cif_ttd)}
                    <td style={cellTd}><Cell value={ln.duty_pct} type="number" align="center"
                      onCommit={v => patchLine(ln.line_no, { duty_pct: Number(v) })} /></td>
                    {num(ln.duty)}{num(ln.vat)}
                    <td style={{ ...cellTd, textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.ink }}>
                      {fmt(ln.total_tax)}
                      <button onClick={() => removeRow(ln.line_no)} title="Delete line"
                        style={{ border: "none", background: "none", cursor: "pointer", color: "#B02020", marginLeft: 8 }}>×</button>
                    </td>
                  </tr>
                  {expanded.has(ln.line_no) &&
                    <RowDrawer key={ln.id + "-d"} line={ln} refData={refData}
                      onUpdate={p => patchLine(ln.line_no, p)} />}
                </>
              );
            })}
          </tbody>
        </table>
        <button onClick={addRow} style={{
          width: "100%", padding: "10px", fontFamily: MONO, fontSize: 12, cursor: "pointer",
          border: "none", borderTop: `1px solid ${C.paperBorder}`, background: C.paperAlt, color: C.inkMid,
        }}>+ Add line</button>
      </div>

      {/* ── totals + actions ── */}
      <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
        <div style={{
          flex: 1, minWidth: 280, background: "#fff", border: `1px solid ${C.paperBorder}`,
          borderRadius: 6, padding: 16,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: C.gold, marginBottom: 10 }}>
            ASSESSMENT SUMMARY (TTD)</div>
          {[["Total CIF", t.cif_ttd], ["Import Duty", t.duty], ["Surcharge", t.surcharge],
            ["VAT", t.vat], ["Customs User Fee", t.customs_user_fee]].map(([l, v]) => (
            <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontFamily: MONO, fontSize: 12, color: C.inkMid }}>
              <span>{l}</span><span>{fmt(v as number)}</span>
            </div>
          ))}
          <div style={{
            display: "flex", justifyContent: "space-between", marginTop: 8, padding: "10px 12px",
            background: C.ink, color: "#fff", borderRadius: 4, fontFamily: MONO, fontSize: 14, fontWeight: 700,
          }}>
            <span>TOTAL PAYABLE</span><span>{fmt(t.total_payable)}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
          <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg"
            onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} style={btn(C, "outline")}>Upload documents</button>
          <a href={worksheetUrl(sheetId)} style={{ ...btn(C, "outline"), textAlign: "center", textDecoration: "none" }}>
            Download Worksheet</a>
          <button onClick={() => setShowGen(true)} style={btn(C, "solid")}>Generate C82 XML</button>
        </div>
      </div>

      {showGen && <GenerateModal sheet={sheet} refData={refData}
        onClose={() => setShowGen(false)} onGenerate={onGenerate} />}
    </div>
  );
}

function btn(c: typeof C, kind: "solid" | "outline"): React.CSSProperties {
  return {
    fontFamily: MONO, fontSize: 12, padding: "11px 16px", cursor: "pointer", borderRadius: 4,
    border: kind === "solid" ? "none" : `1px solid ${c.paperMid}`,
    background: kind === "solid" ? c.ink : "#fff",
    color: kind === "solid" ? "#fff" : c.ink,
  };
}
