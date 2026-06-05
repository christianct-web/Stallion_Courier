/**
 * HsClassifyCell — Sheets (Stallion C82) HS-code cell with full parity to the
 * Courier Workbench's ThnClassifyCell.
 *
 * Brought to parity per the redesign: a description text input on the left and
 * a confidence-coloured HS code button that opens a portal popover offering:
 *   - ranked classifier suggestions (rate pill + confidence %)
 *   - free-text "search by description"
 *   - manual 8-digit code entry with live lookup + validation
 *   - "Maintain Tariff" inline add/override
 *
 * Tariff engine: reuses the courier classifier endpoints (classifyDescription,
 * lookupThn, addTariffEntry via MaintainTariffDialog). This is sound because
 * the backend Sheets classifier and the courier module resolve against the SAME
 * CET-2024 dataset (tt_tariff_db_2024.json) — see backend tariff_service.py.
 *
 * TODO (clean-up ticket): extract a shared tariffApi so Sheets no longer imports
 * from courierApi directly. Tracked separately; not in scope for this pass.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  classifyDescription,
  lookupThn,
  ThnSuggestion,
} from "@/services/courierApi";
import { SheetLine } from "@/services/sheetApi";
import { C, ratePillStyle, thnConfidenceStyle } from "@/components/courier/tokens";
import { MaintainTariffDialog } from "@/components/courier/MaintainTariffDialog";

type Props = {
  line: SheetLine;
  /** Persist the chosen HS code (and the derived duty/VAT) onto the line. */
  onUpdate: (patch: Partial<SheetLine>) => void | Promise<void>;
  /** Optional: re-fetch the sheet after a tariff override so duty/VAT recompute. */
  onReload?: () => Promise<void> | void;
};

// Local input cell that commits on blur/Enter (matches the Sheets Cell feel).
function DescInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      placeholder="describe the item…"
      style={{
        width: "100%", fontFamily: "'Fraunces', serif", fontSize: 13,
        padding: "5px 7px", border: `1px solid ${C.paperBorder}`, borderRadius: 3,
        background: "#fff", color: C.ink, outline: "none",
      }}
    />
  );
}

export function HsClassifyCell({ line, onUpdate, onReload }: Props) {
  const [open, setOpen] = useState(false);
  const [maintainOpen, setMaintainOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Sheets doesn't persist confidence on the line, so we derive it live from
  // the most recent classify result for the current code and hold it here.
  const [liveConfidence, setLiveConfidence] = useState<number | null>(null);
  const [fresh, setFresh] = useState<ThnSuggestion[] | null>(null);

  const [manualThn, setManualThn] = useState("");
  const [manualLookup, setManualLookup] = useState<{
    description: string; exemption_class: string; duty_rate: number;
  } | null>(null);

  const [descQuery, setDescQuery] = useState("");
  const [descResults, setDescResults] = useState<ThnSuggestion[] | null>(null);
  const [descSearching, setDescSearching] = useState(false);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [openUpward, setOpenUpward] = useState(false);

  // Anchor the popover and keep it above scroll containers.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const updatePos = () => {
      const r = anchorRef.current!.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - 500);
      const left = Math.max(8, Math.min(r.left, maxLeft));
      const shouldOpenUpward = r.bottom > window.innerHeight * 0.62;
      setOpenUpward(shouldOpenUpward);
      setPopoverPos({ top: shouldOpenUpward ? r.top - 8 : r.bottom + 6, left });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current && !popoverRef.current.contains(t) &&
          anchorRef.current && !anchorRef.current.contains(t)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const suggestions = fresh ?? [];
  const style = thnConfidenceStyle(liveConfidence);

  // Apply a chosen suggestion: persist code + its duty/VAT onto the line.
  const applySuggestion = async (s: ThnSuggestion) => {
    setBusy(true);
    try {
      await onUpdate({
        hs_code: s.thn || s.code,
        duty_pct: Math.round((s.duty_rate ?? 0) * 100),
        vat_pct: s.exemption_class === "full_exempt" ? 0 : 12.5,
      });
      setLiveConfidence(s.confidence ?? null);
      setOpen(false);
      toast.success(`HS code set to ${s.thn || s.code}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to set HS code");
    } finally { setBusy(false); }
  };

  const lookupManual = async () => {
    const t = manualThn.replace(/\D/g, "").trim();
    if (t.length !== 8) { toast.error("HS code must be 8 digits"); return; }
    try {
      const res = await lookupThn(t);
      const entry = res.entry as any;
      setManualLookup({
        description: entry?.description ?? "(not in CET DB)",
        exemption_class: res.exemption_class,
        duty_rate: res.duty_rate,
      });
    } catch (e: any) {
      toast.error(e?.message || "Lookup failed");
      setManualLookup(null);
    }
  };

  const applyManual = async () => {
    const t = manualThn.replace(/\D/g, "").trim();
    if (t.length !== 8) { toast.error("HS code must be 8 digits"); return; }
    setBusy(true);
    try {
      // If we looked the code up we know its rate; otherwise just set the code.
      const patch: Partial<SheetLine> = { hs_code: t };
      if (manualLookup) {
        patch.duty_pct = Math.round((manualLookup.duty_rate ?? 0) * 100);
        patch.vat_pct = manualLookup.exemption_class === "full_exempt" ? 0 : 12.5;
      }
      await onUpdate(patch);
      setLiveConfidence(1); // manual = broker-confirmed
      setOpen(false);
      toast.success(`HS code set to ${t}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to set HS code");
    } finally { setBusy(false); }
  };

  const searchByDescription = async () => {
    const q = descQuery.trim();
    if (!q) { toast.error("Type what the item is"); return; }
    setDescSearching(true);
    try {
      const res = await classifyDescription(q, 8);
      setDescResults(res.suggestions || []);
      if (!res.suggestions?.length) toast.error("No matches — try simpler words");
    } catch (e: any) {
      toast.error(e?.message || "Search failed");
      setDescResults(null);
    } finally { setDescSearching(false); }
  };

  const reclassify = async () => {
    if (!line.description?.trim()) { toast.error("Description is empty"); return; }
    setBusy(true);
    try {
      const res = await classifyDescription(line.description, 5);
      setFresh(res.suggestions || []);
      if (res.best_match) setLiveConfidence(res.best_match.confidence ?? null);
      toast.success("Re-ran classifier");
    } catch (e: any) {
      toast.error(e?.message || "Reclassify failed");
    } finally { setBusy(false); }
  };

  const lbl = "'JetBrains Mono', monospace";

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <DescInput value={line.description} onCommit={(v) => onUpdate({ description: v })} />
      </div>

      {/* confidence-coloured HS code button */}
      <button
        ref={anchorRef}
        onClick={() => setOpen(!open)}
        title={
          liveConfidence === 1 ? "Confirmed by you"
            : liveConfidence != null ? `Classifier confidence: ${Math.round(liveConfidence * 100)}%`
            : "Click to classify"
        }
        style={{
          fontFamily: lbl, fontSize: 12, fontWeight: 700,
          color: style.fg, background: style.bg,
          padding: "4px 8px", border: `1px solid ${style.border}`, borderRadius: 3,
          cursor: "pointer", minWidth: 104, display: "inline-flex",
          alignItems: "center", gap: 6, textAlign: "left", whiteSpace: "nowrap",
        }}
      >
        <span>{line.hs_code || "— HS —"}</span>
        <span style={{
          fontSize: 9, letterSpacing: "0.08em", background: "rgba(0,0,0,0.06)",
          padding: "1px 4px", borderRadius: 2, fontWeight: 600,
        }}>{style.label}</span>
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: openUpward ? undefined : popoverPos.top,
            bottom: openUpward ? Math.max(8, window.innerHeight - popoverPos.top) : undefined,
            left: popoverPos.left, zIndex: 9999, width: 480, maxWidth: "calc(100vw - 16px)",
            maxHeight: "min(78vh, 720px)", overflowY: "auto",
            background: C.paper, border: `1px solid ${C.paperBorder}`, borderRadius: 4,
            boxShadow: "0 12px 40px rgba(0,0,0,0.18)", padding: 14,
          }}
        >
          {/* header */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
              <div style={{ fontFamily: lbl, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.inkLight, fontWeight: 700 }}>
                Line {line.line_no}
              </div>
              {line.hs_code && (
                <button
                  onClick={() => { setMaintainOpen(true); setOpen(false); }}
                  title="Edit this code's description, duty %, or exemption class"
                  style={{
                    padding: "4px 10px", fontFamily: lbl, fontSize: 9, letterSpacing: "0.08em",
                    textTransform: "uppercase", fontWeight: 700, background: C.amber, color: "#fff",
                    border: `1px solid ${C.amber}`, borderRadius: 3, cursor: "pointer",
                  }}
                >✎ Maintain {line.hs_code}</button>
              )}
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ink }}>
              {line.description || "(no description)"}
            </div>
          </div>

          {/* suggestions */}
          {suggestions.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: lbl, fontSize: 9, letterSpacing: "0.1em", color: C.inkLight, textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>
                Suggestions
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
                {suggestions.map((s, i) => {
                  const isCurrent = (s.thn || s.code) === line.hs_code;
                  const pill = ratePillStyle(s.exemption_class, s.duty_rate);
                  const conf = thnConfidenceStyle(s.confidence);
                  return (
                    <button
                      key={(s.thn || s.code) + i}
                      onClick={() => !isCurrent && applySuggestion(s)}
                      disabled={busy || isCurrent}
                      style={{
                        textAlign: "left", padding: "8px 10px",
                        background: isCurrent ? C.paperAlt : "transparent",
                        border: `1px solid ${isCurrent ? C.green : C.paperBorder}`,
                        borderRadius: 3, cursor: isCurrent ? "default" : "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = C.paperAlt; }}
                      onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontFamily: lbl, fontSize: 13, fontWeight: 700, color: C.ink }}>{s.thn || s.code}</span>
                        <span style={{ fontFamily: lbl, fontSize: 9, fontWeight: 700, color: pill.color, background: pill.bg, padding: "1px 5px", borderRadius: 2, letterSpacing: "0.06em" }}>{pill.label}</span>
                        <span style={{ fontFamily: lbl, fontSize: 9, color: conf.fg, background: conf.bg, padding: "1px 5px", borderRadius: 2, letterSpacing: "0.06em", fontWeight: 600 }}>{Math.round((s.confidence ?? 0) * 100)}%</span>
                        {isCurrent && <span style={{ fontFamily: lbl, fontSize: 9, color: C.green, letterSpacing: "0.08em", marginLeft: "auto", fontWeight: 700 }}>CURRENT</span>}
                      </div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 11, color: C.inkMid, marginBottom: 1, lineHeight: 1.3 }}>{s.description}</div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 10, color: C.inkLight, fontStyle: "italic" }}>{s.match_reason}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* search by description */}
          <div style={{ paddingTop: 10, borderTop: `1px solid ${C.paperBorder}`, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: lbl, fontSize: 9, letterSpacing: "0.1em", color: C.inkLight, textTransform: "uppercase", fontWeight: 600 }}>Search by description</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={descQuery}
                onChange={(e) => setDescQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") searchByDescription(); }}
                placeholder="e.g. refrigerator, phone case, yarn"
                style={{ flex: 1, fontFamily: lbl, fontSize: 12, padding: "6px 8px", border: `1px solid ${C.paperBorder}`, borderRadius: 3, background: "#fff", color: C.ink, outline: "none" }}
              />
              <button
                onClick={searchByDescription}
                disabled={descSearching || !descQuery.trim()}
                style={{ padding: "6px 14px", fontFamily: lbl, fontSize: 10, background: C.ink, color: C.paper, border: `1px solid ${C.ink}`, borderRadius: 3, letterSpacing: "0.06em", cursor: "pointer", fontWeight: 600, textTransform: "uppercase", opacity: descSearching || !descQuery.trim() ? 0.5 : 1 }}
              >{descSearching ? "…" : "Search"}</button>
            </div>
            {descResults && descResults.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto", marginTop: 2 }}>
                {descResults.map((s, i) => {
                  const pill = thnConfidenceStyle(s.confidence ?? 0);
                  return (
                    <button
                      key={`${s.thn || s.code}-${i}`}
                      onClick={() => applySuggestion(s)}
                      style={{ textAlign: "left", cursor: "pointer", background: C.paperAlt, border: `1px solid ${C.paperBorder}`, borderRadius: 3, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 2 }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: lbl, fontSize: 12, fontWeight: 700, color: C.ink }}>{s.thn || s.code}</span>
                        <span style={{ fontFamily: lbl, fontSize: 9, padding: "1px 6px", borderRadius: 2, background: pill.bg, color: pill.fg, fontWeight: 700 }}>
                          {Math.round((s.confidence ?? 0) * 100)}%{s.needs_review ? " · REVIEW" : ""}
                        </span>
                      </div>
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 11, color: C.inkMid }}>{s.description || s.match_reason}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* manual entry */}
          <div style={{ paddingTop: 10, borderTop: `1px solid ${C.paperBorder}`, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: lbl, fontSize: 9, letterSpacing: "0.1em", color: C.inkLight, textTransform: "uppercase", fontWeight: 600 }}>Or set an HS code manually</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={manualThn}
                onChange={(e) => { setManualThn(e.target.value); setManualLookup(null); }}
                placeholder="8-digit HS code"
                style={{ flex: 1, fontFamily: lbl, fontSize: 12, padding: "6px 8px", border: `1px solid ${C.paperBorder}`, borderRadius: 3, background: "#fff", color: C.ink, outline: "none" }}
              />
              <button onClick={lookupManual} disabled={busy || manualThn.replace(/\D/g, "").length !== 8}
                style={{ padding: "6px 10px", fontFamily: lbl, fontSize: 10, background: "transparent", color: C.inkMid, border: `1px solid ${C.paperBorder}`, borderRadius: 3, letterSpacing: "0.06em", cursor: "pointer", textTransform: "uppercase" }}>Lookup</button>
              <button onClick={applyManual} disabled={busy || manualThn.replace(/\D/g, "").length !== 8}
                style={{ padding: "6px 14px", fontFamily: lbl, fontSize: 10, background: C.ink, color: C.paper, border: `1px solid ${C.ink}`, borderRadius: 3, letterSpacing: "0.06em", cursor: "pointer", fontWeight: 600, textTransform: "uppercase" }}>Apply</button>
            </div>
            {manualLookup && (
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 11, color: C.inkMid, background: C.paperAlt, padding: "6px 8px", borderRadius: 3 }}>
                <strong>{manualLookup.description}</strong> —{" "}
                {manualLookup.exemption_class === "full_exempt" ? "Exempt"
                  : manualLookup.exemption_class === "duty_free_only" ? "Duty-free"
                  : `${Math.round(manualLookup.duty_rate * 100)}% duty`}
              </div>
            )}
          </div>

          {/* actions */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "flex-end" }}>
            <button onClick={reclassify} disabled={busy || !line.description}
              style={{ padding: "6px 10px", fontFamily: lbl, fontSize: 10, background: "transparent", color: C.amber, border: `1px solid ${C.amber}`, borderRadius: 3, letterSpacing: "0.06em", cursor: "pointer", textTransform: "uppercase", fontWeight: 600 }}>Re-run Classifier</button>
            <button onClick={() => setOpen(false)}
              style={{ padding: "6px 10px", fontFamily: lbl, fontSize: 10, background: "transparent", color: C.inkMid, border: `1px solid ${C.paperBorder}`, borderRadius: 3, letterSpacing: "0.06em", cursor: "pointer", textTransform: "uppercase" }}>Close</button>
          </div>
        </div>,
        document.body,
      )}

      {maintainOpen && (
        <MaintainTariffDialog
          thn={line.hs_code}
          onClose={() => setMaintainOpen(false)}
          onSaved={async () => { if (onReload) await onReload(); }}
        />
      )}
    </div>
  );
}
