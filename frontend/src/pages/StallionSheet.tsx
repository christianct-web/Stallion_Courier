/**
 * StallionSheet.tsx — the simplified single-page declaration editor.
 *
 * Replaces Workbench + Extract + the old BrokerReview body. Lives inside the
 * BrokerReview shell (keep the existing sidebar; render this where the old
 * review body was). Grid-first, modelled on CourierWorkbench:
 *
 *   ┌ Header strip (inline edit + dropdowns: port, incoterm) ──────────────┐
 *   │ CIF Factor (auto)                                                    │
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
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  getSheet, updateHeader, addLine, updateLine, deleteLine,
  getReference, worksheetUrl, c84WorksheetUrl, generateXml, uploadExtract,
  getWarnings, setStatus, listClients,
  Sheet, SheetLine, RefOption, RefData, Client, Concession,
} from "@/services/sheetApi";
import { HsClassifyCell } from "./HsClassifyCell";

// ── design tokens (match BrokerReview) ───────────────────────────────────────
const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6", paperMid: "#CCC7BE",
  ink: "#18150F", inkMid: "#2C2820", inkLight: "#4A453D",
  void: "#111318", voidMid: "#191D26", voidSurface: "#1F2430", voidBorder: "#2E3748",
  ghost: "#B8C0CE", ghostDim: "#8A93A3",
  gold: "#B8860B", amber: "#FFF4D6", amberText: "#8A6D00", amberAction: "#C65911",
  approved: "#1A5E3A", warn: "#FEF3DC", warnBorder: "#D4A020",
};
const MONO = "'JetBrains Mono','SFMono-Regular',monospace";
const SERIF = "'Fraunces',Georgia,serif";
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

// HS lookup is handled by HsClassifyCell, matching the Courier Workbench picker.

// ── expandable row drawer (C82-only fields, all dropdowns) ─────────────────────
function RowDrawer({ line, refData, onUpdate }: {
  line: SheetLine; refData: RefData; onUpdate: (patch: Partial<SheetLine>) => void;
}) {
  return (
    <tr>
      <td colSpan={11} style={{ background: C.paperAlt, padding: "12px 16px" }}>
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

        {/* C84 concession block */}
        {(refData.concessions?.length ?? 0) > 0 && (
          <ConcessionRow line={line} refData={refData} onUpdate={onUpdate} />
        )}
      </td>
    </tr>
  );
}

// ── per-line C84 concession controls ──────────────────────────────────────────
function ConcessionRow({ line, refData, onUpdate }: {
  line: SheetLine; refData: RefData; onUpdate: (patch: Partial<SheetLine>) => void;
}) {
  const cat = refData.concessions?.find(c => c.code === line.concession_code);
  const quantum = cat?.quantum;
  const relief = line.relief_total ?? 0;
  const fmt = (n?: number) =>
    (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{
      marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.paperBorder}`,
      display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end",
    }}>
      <Field label="C84 Concession">
        <Select
          value={line.concession_code || ""}
          options={[{ code: "", label: "— none (dutiable) —" },
            ...(refData.concessions || []).map(c => ({ code: c.code, label: c.label }))]}
          onCommit={v => onUpdate({ concession_code: v })} width={320} />
      </Field>

      {quantum === "capped" && (
        <>
          <Field label="Engine (cc)">
            <Cell value={line.engine_cc ?? 0} type="number" align="right" width={90}
              onCommit={v => onUpdate({ engine_cc: Number(v) })} />
          </Field>
          <Field label="Motor Veh. Tax (TT$)">
            <Cell value={line.mvt_ttd ?? 0} type="number" align="right" width={120}
              onCommit={v => onUpdate({ mvt_ttd: Number(v) })} />
          </Field>
          <Field label="Cap Override (TT$, 0=band)">
            <Cell value={line.cap_override_ttd ?? 0} type="number" align="right" width={150}
              onCommit={v => onUpdate({ cap_override_ttd: Number(v) })} />
          </Field>
        </>
      )}

      {quantum === "rate" && (
        <>
          <Field label="Conc. Duty %">
            <Cell value={line.conc_duty_pct ?? 0} type="number" align="right" width={100}
              onCommit={v => onUpdate({ conc_duty_pct: Number(v) })} />
          </Field>
          <Field label="Conc. VAT %">
            <Cell value={line.conc_vat_pct ?? line.vat_pct} type="number" align="right" width={100}
              onCommit={v => onUpdate({ conc_vat_pct: Number(v) })} />
          </Field>
        </>
      )}

      {line.concession_code && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.inkMid,
          background: "#EBF5EE", border: "1px solid #1A5C3A33", borderRadius: 4,
          padding: "8px 12px",
        }}>
          <span style={{ color: "#1A5C3A", fontWeight: 700 }}>Relief TT$ {fmt(relief)}</span>
          {quantum === "capped" && (line.cap_applied_ttd ?? 0) > 0 && (
            <span> · cap applied TT$ {fmt(line.cap_applied_ttd)}</span>
          )}
          <span> · payable TT$ {fmt(line.total_tax)}</span>
        </div>
      )}
    </div>
  );
}

// ── C84 concession header panel (beneficiary + qualification) ──────────────────
function ConcessionHeaderPanel({ sheet, refData, onPatch }: {
  sheet: Sheet; refData: RefData;
  onPatch: (patch: Partial<Concession>) => void;
}) {
  const c = sheet.concession || ({} as Concession);
  const t = sheet.totals || ({} as any);
  const codes = refData.concessions || [];
  return (
    <div style={{
      background: "#fff", border: `1px solid ${C.approved}44`,
      borderLeft: `3px solid ${C.approved}`, borderRadius: 6, padding: 16, marginBottom: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", color: C.approved }}>
          C84 — DUTY / TAX CONCESSION
        </div>
        {(t.relief_total ?? 0) > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.approved, fontWeight: 700 }}>
            Total relief: TT$ {fmt(t.relief_total)}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Field label="Primary Concession">
          <Select value={c.code || ""} width={300}
            options={[{ code: "", label: "— select —" },
              ...codes.map(x => ({ code: x.code, label: x.label }))]}
            onCommit={v => onPatch({ code: v, active: !!v })} />
        </Field>
        <Field label="Beneficiary Name">
          <Cell value={c.beneficiary_name || ""} mono={false} width={220}
            onCommit={v => onPatch({ beneficiary_name: v })} /></Field>
        <Field label="ID / Passport">
          <Cell value={c.beneficiary_id || ""} width={160}
            onCommit={v => onPatch({ beneficiary_id: v })} /></Field>
        <Field label="C84 No.">
          <Cell value={c.declaration_no || ""} width={130}
            onCommit={v => onPatch({ declaration_no: v })} /></Field>
        <Field label="Approval Ref">
          <Cell value={c.approval_ref || ""} width={150}
            onCommit={v => onPatch({ approval_ref: v })} /></Field>
        <Field label="Return Date">
          <Cell value={c.return_date || ""} type="date" width={150}
            onCommit={v => onPatch({ return_date: v })} /></Field>
        <Field label="Abroad From">
          <Cell value={c.residence_abroad_from || ""} width={110}
            onCommit={v => onPatch({ residence_abroad_from: v })} /></Field>
        <Field label="Abroad To">
          <Cell value={c.residence_abroad_to || ""} width={110}
            onCommit={v => onPatch({ residence_abroad_to: v })} /></Field>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.inkLight, marginTop: 10, fontStyle: "italic" }}>
        Set the concession per line in each row's drawer. Vehicle relief caps are
        defaults — confirm against the current Customs notice before filing.
      </div>
    </div>
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
  const [warnings, setWarnings] = useState<string[] | null>(null);
  useEffect(() => {
    getWarnings(sheet.id).then(r => setWarnings(r.warnings)).catch(() => setWarnings([]));
  }, [sheet.id]);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.paper, borderRadius: 8, padding: 24, width: 480, maxHeight: "88vh",
        overflowY: "auto", border: `1px solid ${C.paperBorder}`,
      }}>
        <h3 style={{ fontFamily: MONO, fontSize: 15, color: C.ink, margin: "0 0 4px" }}>
          Generate C82 XML
        </h3>
        <p style={{ fontFamily: "inherit", fontSize: 12, color: C.inkLight, margin: "0 0 18px" }}>
          Confirm the declaration-level fields the SAD needs before export.
        </p>
        {warnings && warnings.length > 0 && (
          <div style={{
            background: C.warn, border: `1px solid ${C.warnBorder}`, borderRadius: 6,
            padding: "12px 14px", marginBottom: 18,
          }}>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.amberText,
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              ⚠ {warnings.length} issue{warnings.length === 1 ? "" : "s"} — XML will still
              generate, but these may make the declaration wrong
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontFamily: "inherit", fontSize: 12,
              color: C.inkMid, lineHeight: 1.6 }}>
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        {warnings && warnings.length === 0 && (
          <div style={{
            background: "#EBF5EE", border: "1px solid #1A5E3A33", borderRadius: 6,
            padding: "10px 14px", marginBottom: 18, fontFamily: MONO, fontSize: 12,
            color: C.approved, fontWeight: 700,
          }}>✓ Preflight checks passed</div>
        )}
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
  const nav = useNavigate();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [refData, setRefData] = useState<RefData | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showGen, setShowGen] = useState(false);
  const [loadError, setLoadError] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getReference().then(setRefData); }, []);
  useEffect(() => { listClients().then(setClients).catch(() => {}); }, []);
  useEffect(() => {
    if (!sheetId) return;
    setLoadError("");
    getSheet(sheetId)
      .then(setSheet)
      .catch((e: any) => setLoadError(e?.message ? String(e.message) : "Failed to load sheet"));
  }, [sheetId]);

  const patchHeader = useCallback(async (patch: Partial<Sheet>) => {
    const s = await updateHeader(sheetId, patch); setSheet(s);
  }, [sheetId]);
  const patchConcession = useCallback(async (patch: Partial<Concession>) => {
    const merged = { ...(sheet?.concession || {}), ...patch } as Concession;
    const s = await updateHeader(sheetId, { concession: merged }); setSheet(s);
  }, [sheetId, sheet]);
  const patchLine = useCallback(async (lineNo: number, patch: Partial<SheetLine>) => {
    const s = await updateLine(sheetId, lineNo, patch); setSheet(s);
  }, [sheetId]);
  const addRow = useCallback(async () => { setSheet(await addLine(sheetId, {})); }, [sheetId]);
  const removeRow = useCallback(async (n: number) => { setSheet(await deleteLine(sheetId, n)); }, [sheetId]);

  // Pick a client -> autofill consignee, TIN, default brokerage fee.
  const pickClient = useCallback(async (clientId: string) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) { await patchHeader({ client_id: "" }); return; }
    await patchHeader({
      client_id: c.id,
      consignee: c.name,
      consignee_tin: c.tin || c.consigneeCode || "",
      consignee_address: c.address || "",
    });
    toast.success(`Loaded ${c.name}`);
  }, [clients, patchHeader]);

  const advance = useCallback(async (status: string) => {
    try {
      let extra: any = {};
      if (status === "receipted") {
        const rn = window.prompt("Receipt number?") || "";
        extra.receipt_number = rn;
      }
      const s = await setStatus(sheetId, status, extra); setSheet(s);
      toast.success(`Marked ${status}`);
    } catch (e: any) {
      toast.error(`Could not change status (${e?.message || "error"})`);
    }
  }, [sheetId]);

  const onUpload = useCallback(async (file: File) => {
    const s = await uploadExtract(sheetId, file); setSheet(s);  // auto-populates grid
    toast.success("Documents extracted");
  }, [sheetId]);

  const onGenerate = useCallback(async (patch: Partial<Sheet>) => {
    setShowGen(false);
    try { await generateXml(sheetId, patch); toast.success("C82 XML generated"); }
    catch (e: any) { toast.error(`XML failed: ${e?.message || "preflight error"}`); }
  }, [sheetId]);

  const toggle = (n: number) => setExpanded(p => {
    const next = new Set(p); next.has(n) ? next.delete(n) : next.add(n); return next;
  });

  if (loadError) {
    return <div style={{ padding: 40, fontFamily: MONO, color: C.critBorder }}>
      Could not load sheet: {loadError}
    </div>;
  }
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

  // Lifecycle: which transitions are offered from the current status.
  const NEXT: Record<string, { to: string; label: string }[]> = {
    draft: [{ to: "pending", label: "Submit for review" }],
    pending: [{ to: "approved", label: "Approve" }, { to: "correction", label: "Send back" }],
    correction: [{ to: "pending", label: "Re-submit" }],
    approved: [{ to: "submitted", label: "Mark submitted" }, { to: "correction", label: "Send back" }],
    submitted: [{ to: "receipted", label: "Mark receipted" }],
    receipted: [],
  };
  const statusColor: Record<string, string> = {
    draft: C.inkLight, pending: "#B8860B", correction: "#B02020",
    approved: "#1A5E3A", submitted: "#2A4D8F", receipted: "#5A3A8A",
  };

  // Lifecycle track shown as a stepper in the status bar.
  const LIFECYCLE = ["draft", "pending", "approved", "submitted", "receipted"];
  const curIdx = LIFECYCLE.indexOf(sheet.status);

  return (
    <div style={{ background: C.paper, minHeight: "100%", padding: 20 }}>
      {/* ── two-tier status bar: breadcrumb + lifecycle track + actions ── */}
      <div style={{
        background: C.void, borderRadius: 8, padding: "14px 18px", marginBottom: 16,
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <button onClick={() => nav("/stallion/sheets")} style={{
          fontFamily: MONO, fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer",
          border: `1px solid ${C.voidBorder}`, borderRadius: 4, background: "transparent", color: C.ghost,
        }}>‹ Declarations</button>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
            {sheet.reference || "(untitled)"}</span>
          {sheet.consignee && (
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.ghost }}>
              · {sheet.consignee}</span>
          )}
        </div>
        {/* lifecycle stepper */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          {curIdx >= 0 && LIFECYCLE.map((st, i) => (
            <div key={st} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", padding: "3px 9px", borderRadius: 3,
                color: i === curIdx ? "#fff" : i < curIdx ? C.ghost : C.ghostDim,
                background: i === curIdx ? (statusColor[st] || C.inkLight) : "transparent",
                border: i === curIdx ? "none" : `1px solid ${C.voidBorder}`,
              }}>{st}</span>
              {i < LIFECYCLE.length - 1 && (
                <span style={{ color: i < curIdx ? C.ghost : C.voidBorder, fontSize: 11 }}>›</span>
              )}
            </div>
          ))}
          {sheet.status === "correction" && (
            <span style={{
              fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", padding: "3px 9px", borderRadius: 3, color: "#fff",
              background: statusColor.correction,
            }}>correction</span>
          )}
        </div>
        {/* action buttons */}
        {(NEXT[sheet.status] || []).length > 0 && (
          <div style={{ display: "flex", gap: 8, width: "100%", justifyContent: "flex-end" }}>
            {(NEXT[sheet.status] || []).map(t => (
              <button key={t.to} onClick={() => advance(t.to)} style={{
                fontFamily: MONO, fontSize: 12, fontWeight: 600, padding: "7px 16px", cursor: "pointer",
                borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em",
                border: t.to === "correction" ? `1px solid ${C.voidBorder}` : "none",
                background: t.to === "correction" ? "transparent" : C.amberAction,
                color: t.to === "correction" ? C.ghost : "#fff",
              }}>{t.label}</button>
            ))}
          </div>
        )}
      </div>
      {/* ── header strip ── */}
      <div style={{
        background: "#fff", border: `1px solid ${C.paperBorder}`, borderRadius: 6,
        padding: 16, marginBottom: 14,
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12 }}>
          <Field label="Client">
            <Select value={sheet.client_id || ""} width={220}
              options={[{ code: "", label: "— select client —" },
                ...clients.map(c => ({ code: c.id, label: c.name }))]}
              onCommit={pickClient} />
          </Field>
          <Field label="Consignee"><Cell value={sheet.consignee} mono={false} width={220}
            onCommit={v => patchHeader({ consignee: v })} /></Field>
          <Field label="Consignee TIN / Code"><Cell value={sheet.consignee_tin} width={140}
            onCommit={v => patchHeader({ consignee_tin: v })} /></Field>
          <Field label="Consignee Address"><Cell value={sheet.consignee_address || ""} mono={false} width={240}
            onCommit={v => patchHeader({ consignee_address: v })} /></Field>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12 }}>
          <Field label="Consignor / Supplier"><Cell value={sheet.consignor} mono={false} width={220}
            onCommit={v => patchHeader({ consignor: v })} /></Field>
          <Field label="Consignor Address"><Cell value={sheet.consignor_address || ""} mono={false} width={240}
            onCommit={v => patchHeader({ consignor_address: v })} /></Field>
          <Field label="Declarant Name"><Cell value={sheet.declarant_name || ""} mono={false} width={180}
            onCommit={v => patchHeader({ declarant_name: v })} /></Field>
          <Field label="Declarant TIN"><Cell value={sheet.declarant_tin || ""} width={130}
            onCommit={v => patchHeader({ declarant_tin: v })} /></Field>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Field label="Incoterm"><Select value={sheet.incoterm} options={refData.incoterms} width={150}
            onCommit={v => patchHeader({ incoterm: v })} /></Field>
          <Field label="Exchange Rate"><Cell value={sheet.exchange_rate} type="number" align="right" width={120}
            onCommit={v => patchHeader({ exchange_rate: Number(v) })} /></Field>
          <Field label="Freight (USD)"><Cell value={sheet.freight_usd} type="number" align="right" width={120}
            onCommit={v => patchHeader({ freight_usd: Number(v) })} /></Field>
          <Field label="Insurance (USD)"><Cell value={sheet.insurance_usd} type="number" align="right" width={120}
            onCommit={v => patchHeader({ insurance_usd: Number(v) })} /></Field>
          <Field label="Gross Weight (kg)"><Cell value={sheet.gross_weight} type="number" align="right" width={120}
            onCommit={v => patchHeader({ gross_weight: Number(v) })} /></Field>
          <Field label="Total Packages"><Cell value={sheet.total_packages} type="number" align="right" width={110}
            onCommit={v => patchHeader({ total_packages: Number(v) })} /></Field>
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

      {/* ── C84 concession panel (shown for C84 declarations) ── */}
      {(sheet.declaration_type === "c84" || sheet.concession?.active) &&
        (refData.concessions?.length ?? 0) > 0 && (
        <ConcessionHeaderPanel sheet={sheet} refData={refData} onPatch={patchConcession} />
      )}

      {/* ── grid + sticky duty rail: true two-column layout ── */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* ── line grid (left column) ── */}
      <div style={{ flex: "1 1 520px", minWidth: 0, background: "#fff", border: `1px solid ${C.paperBorder}`, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {TH("", 28)}{TH("#", 32, "center")}
              {TH("Description & HS Code")}{TH("EX-WORKS", 90, "right")}{TH("Freight", 80, "right")}
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
                    <td style={{ ...cellTd, minWidth: 320 }}>
                      <HsClassifyCell
                        line={ln}
                        onUpdate={p => patchLine(ln.line_no, p)}
                        onReload={() => getSheet(sheetId).then(setSheet)}
                      />
                    </td>
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
        </div>
        <button onClick={addRow} style={{
          width: "100%", padding: "10px", fontFamily: MONO, fontSize: 12, cursor: "pointer",
          border: "none", borderTop: `1px solid ${C.paperBorder}`, background: C.paperAlt, color: C.inkMid,
        }}>+ Add line</button>
      </div>

      {/* ── sticky dark duty rail (right column) ── */}
        <div style={{
          width: 264, flexShrink: 0, position: "sticky", top: 16,
          background: C.void, borderRadius: 8, padding: "18px 18px", color: C.ghost,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", color: C.ghostDim, marginBottom: 14,
          }}>Duties &amp; Totals</div>

          {[["Total CIF", t.cif_ttd], ["Import Duty", t.duty], ["Surcharge", t.surcharge],
            ...((t.mvt ?? 0) > 0 ? [["Motor Vehicle Tax", t.mvt] as [string, number]] : []),
            ["VAT", t.vat], ["Customs User Fee", t.customs_user_fee]].map(([l, v]) => (
            <div key={l as string} style={{
              display: "flex", justifyContent: "space-between", marginBottom: 9,
              fontFamily: MONO, fontSize: 11, fontWeight: 600,
            }}>
              <span style={{ color: C.ghostDim }}>{l}</span>
              <span style={{ color: "#fff" }}>{fmt(v as number)}</span>
            </div>
          ))}

          {(t.relief_total ?? 0) > 0 && (
            <div style={{
              display: "flex", justifyContent: "space-between", marginBottom: 9,
              fontFamily: MONO, fontSize: 11, fontWeight: 700,
            }}>
              <span style={{ color: "#5DCAA5" }}>C84 Relief (R)</span>
              <span style={{ color: "#5DCAA5" }}>− {fmt(t.relief_total)}</span>
            </div>
          )}

          <div style={{ height: 1, background: C.voidBorder, margin: "14px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
            <span style={{
              fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: C.ghostDim,
            }}>Payable</span>
            <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: C.amberAction, letterSpacing: "-0.01em" }}>
              {fmt(t.total_payable)}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg"
              onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
            <button onClick={() => fileRef.current?.click()} style={railBtn(C, "ghost")}>Upload documents</button>
            <a href={worksheetUrl(sheetId)} style={{ ...railBtn(C, "ghost"), textAlign: "center", textDecoration: "none" }}>
              Download worksheet</a>
            {(sheet.declaration_type === "c84" || sheet.concession?.active ||
              sheet.lines?.some(l => l.concession_code)) && (
              <a href={c84WorksheetUrl(sheetId)} style={{
                ...railBtn(C, "ghost"), textAlign: "center", textDecoration: "none",
                borderColor: "#2E7D52", color: "#5DCAA5",
              }}>Download C84 claim</a>
            )}
            <button onClick={() => setShowGen(true)} style={railBtn(C, "solid")}>Generate C82 XML</button>
          </div>
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

function railBtn(c: typeof C, kind: "solid" | "ghost"): React.CSSProperties {
  return {
    fontFamily: MONO, fontSize: 10, fontWeight: 600, padding: kind === "solid" ? "10px 12px" : "9px 12px",
    cursor: "pointer", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase",
    textAlign: "center" as const, display: "block",
    border: kind === "solid" ? "none" : `1px solid ${c.voidBorder}`,
    background: kind === "solid" ? c.amberAction : "transparent",
    color: kind === "solid" ? "#fff" : c.ghost,
  };
}
