/**
 * CourierExam - record officer examination corrections after physical inspection.
 *
 * Each existing line gets a "Has correction?" toggle. Toggling reveals the
 * Section 3 entry: officer THN, new description, add cost USD, adjusted CIF,
 * add duty/OPT/VAT/total. Below the lines, a separate "Officer-discovered"
 * area lets the broker add lines with line_no=null.
 *
 * "Apply tax removal" button on each correction auto-fills negative add_*
 * values when the officer's THN is exempt and the original line was not.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import {
  getManifest, recordExamination, lookupThn,
  CourierManifest, CourierLine, OfficerCorrection,
} from "@/services/courierApi";
import { C, fmtTtd, fmtUsd, ratePillStyle } from "@/components/courier/tokens";

interface DraftCorrection {
  id: string;            // local-only; used for React key
  line_no: number | null;
  kind: "uplift" | "reclass" | "new_line" | "description" | "seizure";
  officer_thn: string;
  new_description: string;
  add_cost_usd: string;
  adjusted_cif_ttd: string;
  add_duty: string;
  add_opt: string;
  add_vat: string;
  detained_seized: boolean;
  dep_in_tshed: boolean;
}

function makeDraft(correction?: OfficerCorrection, lineNo?: number | null): DraftCorrection {
  return {
    id: Math.random().toString(36).slice(2),
    line_no: correction?.line_no ?? lineNo ?? null,
    kind: correction?.kind || "uplift",
    officer_thn: correction?.officer_thn || "",
    new_description: correction?.new_description || "",
    add_cost_usd: String(correction?.add_cost_usd ?? ""),
    adjusted_cif_ttd: String(correction?.adjusted_cif_ttd ?? ""),
    add_duty: String(correction?.add_duty ?? ""),
    add_opt: String(correction?.add_opt ?? ""),
    add_vat: String(correction?.add_vat ?? ""),
    detained_seized: !!correction?.detained_seized,
    dep_in_tshed: !!correction?.dep_in_tshed,
  };
}

function draftToCorrection(d: DraftCorrection): OfficerCorrection {
  const num = (s: string) => (s === "" ? 0 : parseFloat(s) || 0);
  return {
    line_no: d.line_no,
    kind: d.kind,
    officer_thn: d.officer_thn.trim(),
    new_description: d.new_description.trim(),
    add_cost_usd: num(d.add_cost_usd),
    adjusted_cif_ttd: num(d.adjusted_cif_ttd),
    add_duty: num(d.add_duty),
    add_opt: num(d.add_opt),
    add_vat: num(d.add_vat),
    add_total: num(d.add_duty) + num(d.add_opt) + num(d.add_vat),
    detained_seized: d.detained_seized,
    dep_in_tshed: d.dep_in_tshed,
  };
}

// Helper: compute uplift values from add_cost and exch rate

function computeUpliftFromCost(addCostUsd: number, exchRate: number, dutyPct: number): {
  adj_cif: number; add_duty: number; add_opt: number; add_vat: number;
} {
  const cif = +(addCostUsd * exchRate).toFixed(2);
  const duty = +(cif * dutyPct).toFixed(2);
  const opt = +(cif * 0.07).toFixed(2);
  const vat = +((cif + duty + opt) * 0.125).toFixed(2);
  return { adj_cif: cif, add_duty: duty, add_opt: opt, add_vat: vat };
}

// Correction card

function CorrectionCard({
  draft, line, exchRate, onChange, onRemove, isMobile,
}: {
  draft: DraftCorrection;
  line?: CourierLine;
  exchRate: number;
  onChange: (d: DraftCorrection) => void;
  onRemove: () => void;
  isMobile?: boolean;
}) {
  const isNewLine = draft.line_no == null;

  // Recompute helper: when officer_thn or add_cost_usd changes, re-derive
  // the tax fields from the looked-up THN's duty rate AND exemption class.
  const recomputeFromCost = useCallback(async () => {
    if (!draft.officer_thn) { toast.error("Set officer THN first"); return; }
    const cost = parseFloat(draft.add_cost_usd);
    const hasCostInput = Number.isFinite(cost) && cost !== 0;
    const isZeroUpliftReclass = draft.kind === "reclass" && !hasCostInput;
    if (!hasCostInput && !isZeroUpliftReclass) { toast.error("Set add cost USD first"); return; }
    try {
      const res = await lookupThn(draft.officer_thn);
      const cls = res.exemption_class;
      const dutyRate = res.duty_rate || 0;

      if (isZeroUpliftReclass) {
        if (!line) { toast.error("Reclass preview needs an existing line"); return; }
        const baseCif = Number(line.cif_ttd || 0);
        const oldDuty = Number(line.duty || 0);
        const oldOpt = Number(line.opt || 0);
        const oldVat = Number(line.vat || 0);

        let newDuty = 0;
        let newOpt = 0;
        let newVat = 0;

        if (cls === "full_exempt") {
          newDuty = 0; newOpt = 0; newVat = 0;
        } else if (cls === "duty_free_only") {
          newDuty = 0;
          newOpt = +(baseCif * 0.07).toFixed(2);
          newVat = +((baseCif + newDuty + newOpt) * 0.125).toFixed(2);
        } else {
          newDuty = +(baseCif * dutyRate).toFixed(2);
          newOpt = +(baseCif * 0.07).toFixed(2);
          newVat = +((baseCif + newDuty + newOpt) * 0.125).toFixed(2);
        }

        onChange({
          ...draft,
          adjusted_cif_ttd: "0",
          add_duty: String((newDuty - oldDuty).toFixed(2)),
          add_opt: String((newOpt - oldOpt).toFixed(2)),
          add_vat: String((newVat - oldVat).toFixed(2)),
        });

        const label = cls === "full_exempt" ? "EXEMPT"
          : cls === "duty_free_only" ? "FREE (OPT+VAT only)"
          : `${Math.round(dutyRate * 100)}%`;
        toast.success(`Reclass preview at ${label}`);
        return;
      }

      const r = computeUpliftFromCost(cost, exchRate, dutyRate);

      // Existing line corrections must recalc from NEW total value + NEW THN,
      // then write Section 3 as deltas vs original assessed taxes.
      if (line) {
        const baseCostUsd = Number(line.cost_usd || 0);
        const baseCifTtd = Number(line.cif_ttd || 0);
        const oldDuty = Number(line.duty || 0);
        const oldOpt = Number(line.opt || 0);
        const oldVat = Number(line.vat || 0);

        const newCostUsd = baseCostUsd + cost;
        const newCifTtd = +(newCostUsd * exchRate).toFixed(2);

        let newDuty = 0;
        let newOpt = 0;
        let newVat = 0;

        if (cls === "full_exempt") {
          newDuty = 0;
          newOpt = 0;
          newVat = 0;
        } else if (cls === "duty_free_only") {
          newDuty = 0;
          newOpt = +(newCifTtd * 0.07).toFixed(2);
          newVat = +((newCifTtd + 0 + newOpt) * 0.125).toFixed(2);
        } else {
          newDuty = +(newCifTtd * dutyRate).toFixed(2);
          newOpt = +(newCifTtd * 0.07).toFixed(2);
          newVat = +((newCifTtd + newDuty + newOpt) * 0.125).toFixed(2);
        }

        onChange({
          ...draft,
          adjusted_cif_ttd: String((newCifTtd - baseCifTtd).toFixed(2)),
          add_duty: String((newDuty - oldDuty).toFixed(2)),
          add_opt: String((newOpt - oldOpt).toFixed(2)),
          add_vat: String((newVat - oldVat).toFixed(2)),
        });
      } else {
        // Officer-discovered line (no baseline): Section 3 values are absolute adds.
        // Apply exemption class to the uplift-derived tax values.
        let addDuty = r.add_duty;
        let addOpt = r.add_opt;
        let addVat = r.add_vat;
        if (cls === "full_exempt") {
          addDuty = 0;
          addOpt = 0;
          addVat = 0;
        } else if (cls === "duty_free_only") {
          addDuty = 0;
          addOpt = +(r.adj_cif * 0.07).toFixed(2);
          addVat = +((r.adj_cif + 0 + addOpt) * 0.125).toFixed(2);
        }

        onChange({
          ...draft,
          adjusted_cif_ttd: String(r.adj_cif),
          add_duty: String(addDuty),
          add_opt: String(addOpt),
          add_vat: String(addVat),
        });
      }
      const label = cls === "full_exempt" ? "EXEMPT"
        : cls === "duty_free_only" ? "FREE (OPT+VAT only)"
        : `${Math.round(dutyRate * 100)}%`;
      toast.success(`Recomputed at ${label}`);
    } catch (e: any) {
      toast.error(e.message || "Lookup failed");
    }
  }, [draft, exchRate, onChange]);

  // Apply tax removal: if officer_thn is exempt and original was not,
  // populate add_duty/opt/vat as negatives of the original line's values.
  const applyTaxRemoval = useCallback(async () => {
    if (!line) { toast.error("Tax removal only applies to existing lines"); return; }
    if (!draft.officer_thn) { toast.error("Set officer THN first"); return; }
    try {
      const res = await lookupThn(draft.officer_thn);
      if (res.exemption_class === "full_exempt") {
        onChange({
          ...draft,
          adjusted_cif_ttd: "0",
          add_duty: String(-line.duty),
          add_opt: String(-line.opt),
          add_vat: String(-line.vat),
        });
        toast.success("Removed all taxes for this line");
      } else if (res.exemption_class === "duty_free_only") {
        onChange({
          ...draft,
          adjusted_cif_ttd: "0",
          add_duty: String(-line.duty),
          add_opt: "0",
          add_vat: "0",
        });
        toast.success("Removed duty (OPT and VAT remain)");
      } else {
      toast.error(`THN ${draft.officer_thn} is not exempt - manual entry required`);
      }
    } catch (e: any) {
      toast.error(e.message || "Lookup failed");
    }
  }, [draft, line, onChange]);

  const inputStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
    padding: "6px 8px",
    border: `1px solid ${C.paperBorder}`, borderRadius: 3,
    background: "#fff", color: C.ink, outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
    letterSpacing: "0.08em", color: C.inkLight, textTransform: "uppercase",
    marginBottom: 3, fontWeight: 600,
  };

  return (
    <div style={{
      background: isNewLine ? "#FFF8E8" : "#FFFAEC",
      border: `1px solid ${isNewLine ? C.amber + "44" : C.paperBorder}`,
      borderRadius: 4, padding: 14, marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", color: isNewLine ? C.amber : C.ink, textTransform: "uppercase",
        }}>
          {isNewLine
            ? "+ Officer-discovered line"
            : `Correction on Line ${draft.line_no}`}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <select
            value={draft.kind}
            onChange={e => onChange({ ...draft, kind: e.target.value as any })}
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              padding: "4px 8px", borderRadius: 3,
              border: `1px solid ${C.paperBorder}`, background: "#fff",
              color: C.inkMid, textTransform: "uppercase", letterSpacing: "0.06em",
            }}
          >
            <option value="uplift">Uplift</option>
            <option value="reclass">Reclass</option>
            <option value="description">Description</option>
            <option value="new_line">New Line</option>
            <option value="seizure">Seizure</option>
          </select>
          <button onClick={onRemove} style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            padding: "4px 8px", color: C.critBorder, background: "transparent",
            border: `1px solid ${C.critBorder}33`, borderRadius: 3, cursor: "pointer",
          }}>
            Remove
          </button>
        </div>
      </div>

      {line && (
        <div style={{
          background: "#fff", border: `1px solid ${C.paperBorder}`, borderRadius: 3,
          padding: 8, marginBottom: 12, fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkMid,
        }}>
          <strong>Original:</strong> {line.description} / THN {line.thn} / ${fmtUsd(line.cost_usd)} /
          CIF ${fmtTtd(line.cif_ttd)} / Total taxes ${fmtTtd(line.total_taxes)}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "150px 1fr", gap: 10 }}>
        <div>
          <div style={labelStyle}>Officer THN</div>
          <input style={inputStyle} value={draft.officer_thn}
            onChange={e => onChange({ ...draft, officer_thn: e.target.value })}
            placeholder="e.g. 33049990" />
        </div>
        <div>
          <div style={labelStyle}>New Description</div>
          <input style={inputStyle} value={draft.new_description}
            onChange={e => onChange({ ...draft, new_description: e.target.value })}
            placeholder="Officer's revised description" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10, marginTop: 10 }}>
        <div>
          <div style={labelStyle}>Add Cost USD</div>
          <input style={inputStyle} type="number" value={draft.add_cost_usd}
            onChange={e => onChange({ ...draft, add_cost_usd: e.target.value })} />
        </div>
        <div>
          <div style={labelStyle}>Adj. CIF TTD</div>
          <input style={inputStyle} type="number" value={draft.adjusted_cif_ttd}
            onChange={e => onChange({ ...draft, adjusted_cif_ttd: e.target.value })} />
        </div>
        <div>
          <div style={labelStyle}>Add Duty</div>
          <input style={inputStyle} type="number" value={draft.add_duty}
            onChange={e => onChange({ ...draft, add_duty: e.target.value })} />
        </div>
        <div>
          <div style={labelStyle}>Add OPT</div>
          <input style={inputStyle} type="number" value={draft.add_opt}
            onChange={e => onChange({ ...draft, add_opt: e.target.value })} />
        </div>
        <div>
          <div style={labelStyle}>Add VAT</div>
          <input style={inputStyle} type="number" value={draft.add_vat}
            onChange={e => onChange({ ...draft, add_vat: e.target.value })} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkMid, cursor: "pointer" }}>
          <input type="checkbox" checked={draft.detained_seized}
            onChange={e => onChange({ ...draft, detained_seized: e.target.checked })} />
          Detained / Seized
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkMid, cursor: "pointer" }}>
          <input type="checkbox" checked={draft.dep_in_tshed}
            onChange={e => onChange({ ...draft, dep_in_tshed: e.target.checked })} />
          Dep. in T/Shed
        </label>
        <div style={{ marginLeft: isMobile ? 0 : "auto", display: "flex", gap: 6, width: isMobile ? "100%" : "auto" }}>
          <button onClick={recomputeFromCost} style={{
            padding: isMobile ? "9px 10px" : "5px 10px", flex: isMobile ? 1 : "0 0 auto",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600,
            background: "transparent", color: C.amber,
            border: `1px solid ${C.amber}`, borderRadius: 3, cursor: "pointer",
          }}>
            Recompute from Cost
          </button>
          {line && (
            <button onClick={applyTaxRemoval} style={{
              padding: isMobile ? "9px 10px" : "5px 10px", flex: isMobile ? 1 : "0 0 auto",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600,
              background: "transparent", color: C.green,
              border: `1px solid ${C.green}`, borderRadius: 3, cursor: "pointer",
            }}>
              Apply Tax Removal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Main page

export default function CourierExam() {
  const isMobile = useIsMobile();
  const { manifestId } = useParams<{ manifestId: string }>();
  const navigate = useNavigate();
  const [manifest, setManifest] = useState<CourierManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [examiningOfficer, setExaminingOfficer] = useState("");
  const [examinedAt, setExaminedAt] = useState(new Date().toISOString().slice(0, 10));
  const [drafts, setDrafts] = useState<DraftCorrection[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!manifestId) return;
    setLoading(true);
    try {
      const m = await getManifest(manifestId);
      setManifest(m);
      const exam = m.officer_examination;
      if (exam) {
        setExaminingOfficer(exam.examining_officer || "");
        setExaminedAt(exam.examined_at || new Date().toISOString().slice(0, 10));
        setDrafts((exam.corrections || []).map(c => makeDraft(c)));
      } else {
        setDrafts([]);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load manifest");
      navigate("/stallion/courier");
    } finally {
      setLoading(false);
    }
  }, [manifestId, navigate]);

  useEffect(() => { load(); }, [load]);

  const lineMap = manifest
    ? Object.fromEntries(manifest.lines.map(l => [l.line_no, l]))
    : {};

  const addCorrectionForLine = (lineNo: number) => {
    if (drafts.some(d => d.line_no === lineNo)) {
      toast.info(`Line ${lineNo} already has a correction`);
      return;
    }
    setDrafts([...drafts, makeDraft(undefined, lineNo)]);
  };

  const addNewOfficerLine = () => {
    setDrafts([...drafts, makeDraft(undefined, null)]);
  };

  const updateDraft = (id: string, d: DraftCorrection) => {
    setDrafts(drafts.map(x => x.id === id ? d : x));
  };

  const removeDraft = (id: string) => {
    setDrafts(drafts.filter(x => x.id !== id));
  };

  const save = async () => {
    if (!manifestId) return;
    setSaving(true);
    try {
      await recordExamination(manifestId, {
        examined_at: examinedAt,
        examining_officer: examiningOfficer,
        corrections: drafts.map(draftToCorrection),
      });
      toast.success("Examination recorded");
      navigate(`/stallion/courier/${manifestId}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to save examination");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !manifest) {
    return (
      <div style={{ minHeight: "100vh", background: C.paperAlt }}>
        <div style={{ padding: 60, textAlign: "center", fontFamily: "'Fraunces', serif", color: C.inkLight }}>
          Loading...
        </div>
      </div>
    );
  }

  // Lines without a correction yet (so we can show "Add correction" buttons)
  const linesWithoutCorrection = manifest.lines.filter(
    l => !drafts.some(d => d.line_no === l.line_no)
  );

  return (
    <div style={{ minHeight: "100vh", background: C.paperAlt }}>
      {/* Header strip */}
      <div style={{
        background: C.amber, borderBottom: `1px solid ${C.amber}88`,
        padding: isMobile ? "14px 16px" : "16px 28px",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 12 : 24, flexWrap: "wrap" }}>
          <div>
            <button onClick={() => navigate(`/stallion/courier/${manifest.id}`)} style={{
              background: "transparent", border: "none", padding: 0, cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.08em", textTransform: "uppercase", color: "#fff8",
              marginBottom: 6, display: "block",
            }}>
              Workbench
            </button>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.12em", color: "#fff8", textTransform: "uppercase",
              marginBottom: 4,
            }}>
              Officer Examination
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#fff", lineHeight: 1 }}>
              {manifest.manifest_no}
            </div>
          </div>
          {!isMobile && <div style={{ width: 1, alignSelf: "stretch", background: "#fff4" }} />}
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#fff8", textTransform: "uppercase", marginBottom: 3 }}>
              Examined At
            </div>
            <input type="date" value={examinedAt} onChange={e => setExaminedAt(e.target.value)}
              style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                padding: "5px 8px", border: "1px solid #fff4", borderRadius: 3,
                background: "rgba(255,255,255,0.15)", color: "#fff", outline: "none",
              }} />
          </div>
          <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#fff8", textTransform: "uppercase", marginBottom: 3 }}>
              Examining Officer
            </div>
            <input value={examiningOfficer} onChange={e => setExaminingOfficer(e.target.value)}
              placeholder="Officer name & licence #"
              style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                padding: "5px 8px", width: isMobile ? "100%" : 240, boxSizing: "border-box",
                border: "1px solid #fff4", borderRadius: 3,
                background: "rgba(255,255,255,0.15)", color: "#fff", outline: "none",
              }} />
          </div>
          <div style={{ marginLeft: isMobile ? 0 : "auto", width: isMobile ? "100%" : "auto" }}>
            <button onClick={save} disabled={saving} style={{
              padding: "10px 24px", width: isMobile ? "100%" : "auto",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700,
              background: "#fff", color: C.amber,
              border: "1px solid #fff", borderRadius: 3,
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
            }}>
              {saving ? "Saving..." : "Save Examination"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "16px 16px" : "24px 28px" }}>
        {/* Lines without corrections - quick-add buttons */}
        {linesWithoutCorrection.length > 0 && (
          <div style={{
            background: C.paper, border: `1px solid ${C.paperBorder}`,
            borderRadius: 4, padding: 14, marginBottom: 24,
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.1em", color: C.inkLight, textTransform: "uppercase",
              fontWeight: 700, marginBottom: 10,
            }}>
              Lines without corrections - click to add
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {linesWithoutCorrection.map(l => {
                const pill = ratePillStyle(l.exemption_class, l.duty_rate);
                return (
                  <button
                    key={l.id}
                    onClick={() => addCorrectionForLine(l.line_no)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 10px",
                      background: C.paperAlt, border: `1px solid ${C.paperBorder}`,
                      borderRadius: 3, cursor: "pointer",
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: C.inkMid, transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = C.amberLight}
                    onMouseLeave={e => e.currentTarget.style.background = C.paperAlt}
                  >
                    <span style={{ fontWeight: 700, color: C.ink }}>#{l.line_no}</span>
                    <span style={{
                      fontFamily: "'Fraunces', serif", fontSize: 12, maxWidth: 200,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {l.description}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: pill.color, background: pill.bg,
                      padding: "1px 4px", borderRadius: 2,
                    }}>
                      {pill.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Existing corrections */}
        {drafts.length === 0 ? (
          <div style={{
            background: C.paper, border: `1px solid ${C.paperBorder}`, borderRadius: 4,
            padding: 40, textAlign: "center", marginBottom: 16,
          }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: C.inkLight, marginBottom: 4 }}>
              No corrections yet
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: C.inkLight, fontStyle: "italic" }}>
              Click a line above to add a correction, or "+ Add Officer-Discovered Line" below.
            </div>
          </div>
        ) : drafts.map(d => (
          <CorrectionCard
            key={d.id}
            draft={d}
            line={d.line_no != null ? lineMap[d.line_no] : undefined}
            exchRate={manifest.exch_rate}
            onChange={(updated) => updateDraft(d.id, updated)}
            onRemove={() => removeDraft(d.id)}
            isMobile={isMobile}
          />
        ))}

        {/* Add new officer line */}
        <button onClick={addNewOfficerLine} style={{
          width: "100%", padding: "14px",
          background: "transparent", border: `2px dashed ${C.amber}66`, borderRadius: 4,
          color: C.amber, fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700,
          cursor: "pointer", transition: "all 0.1s",
        }}
          onMouseEnter={e => {
            e.currentTarget.style.background = C.amberLight;
            e.currentTarget.style.borderColor = C.amber;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = C.amber + "66";
          }}>
          + Add Officer-Discovered Line
        </button>
      </div>
    </div>
  );
}
