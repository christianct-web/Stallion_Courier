/**
 * ThnClassifyCell — a clickable table cell that shows a THN with its
 * classification confidence color, and opens a popover for the broker to
 * pick an alternative suggestion or type a manual THN.
 *
 * Used in the Courier Workbench line table.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CourierLine,
  ThnSuggestion,
  lookupThn,
  classifyDescription,
} from "@/services/courierApi";
import { C, ratePillStyle, thnConfidenceStyle } from "./tokens";
import { MaintainTariffDialog } from "./MaintainTariffDialog";
import { createPortal } from "react-dom";

type Props = {
  line: CourierLine;
  onUpdate: (patch: { thn: string }) => Promise<void>;
  /**
   * Called when the underlying data needs to be reloaded without a line-level
   * patch (e.g. after a tariff override is saved). The parent should refetch
   * the manifest so duty/OPT/VAT recompute against the new rule.
   */
  onReload?: () => Promise<void> | void;
};

export function ThnClassifyCell({ line, onUpdate, onReload }: Props) {
  const [open, setOpen] = useState(false);
  const [maintainOpen, setMaintainOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualThn, setManualThn] = useState("");
  const [manualLookup, setManualLookup] = useState<{
    description: string;
    exemption_class: string;
    duty_rate: number;
  } | null>(null);
  const [fresh, setFresh] = useState<ThnSuggestion[] | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [openUpward, setOpenUpward] = useState(false);

  // Keep popover anchored to the THN button and above scroll containers.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const updatePos = () => {
      const r = anchorRef.current!.getBoundingClientRect();
      const desiredLeft = r.left;
      const maxLeft = Math.max(8, window.innerWidth - 500);
      const left = Math.max(8, Math.min(desiredLeft, maxLeft));

      // If the anchor is low in the viewport, open the popover upward so
      // bottom rows remain usable.
      const shouldOpenUpward = r.bottom > window.innerHeight * 0.62;
      setOpenUpward(shouldOpenUpward);
      setPopoverPos({
        top: shouldOpenUpward ? r.top - 8 : r.bottom + 6,
        left,
      });
    };

    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const suggestions = fresh ?? line.thn_suggestions ?? [];
  const confidence = line.thn_confidence;
  const style = thnConfidenceStyle(confidence);

  const pickSuggestion = async (thn: string) => {
    setBusy(true);
    try {
      await onUpdate({ thn });
      setOpen(false);
      toast.success(`THN updated to ${thn}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update THN");
    } finally {
      setBusy(false);
    }
  };

  const lookupManual = async () => {
    const t = manualThn.replace(/\D/g, "").trim();
    if (t.length !== 8) {
      toast.error("THN must be 8 digits");
      return;
    }
    try {
      const res = await lookupThn(t);
      const entry = res.entry as any;
      setManualLookup({
        description: entry?.description ?? "(not in CET DB)",
        exemption_class: res.exemption_class,
        duty_rate: res.duty_rate,
      });
    } catch (e: any) {
      toast.error(e.message || "Lookup failed");
      setManualLookup(null);
    }
  };

  const applyManual = async () => {
    const t = manualThn.replace(/\D/g, "").trim();
    if (t.length !== 8) {
      toast.error("THN must be 8 digits");
      return;
    }
    setBusy(true);
    try {
      await onUpdate({ thn: t });
      setOpen(false);
      toast.success(`THN set to ${t}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update THN");
    } finally {
      setBusy(false);
    }
  };

  const reclassify = async () => {
    if (!line.description?.trim()) {
      toast.error("Description is empty");
      return;
    }
    setBusy(true);
    try {
      const res = await classifyDescription(line.description, 5);
      setFresh(res.suggestions || []);
      toast.success("Re-ran classifier");
    } catch (e: any) {
      toast.error(e.message || "Reclassify failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={anchorRef}
        onClick={() => setOpen(!open)}
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          fontWeight: 700,
          color: style.fg,
          background: style.bg,
          padding: "4px 8px",
          border: `1px solid ${style.border}`,
          borderRadius: 3,
          cursor: "pointer",
          minWidth: 100,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          textAlign: "left",
        }}
        title={
          line.thn_match_source === "manual"
            ? "Confirmed by you"
            : confidence != null
              ? `Classifier confidence: ${Math.round(confidence * 100)}%`
              : "No classification yet"
        }
      >
        <span>{line.thn || "—"}</span>
        <span style={{
          fontSize: 9, letterSpacing: "0.08em",
          background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 2,
          fontWeight: 600,
        }}>
          {style.label}
        </span>
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: openUpward ? undefined : popoverPos.top,
            bottom: openUpward ? Math.max(8, window.innerHeight - popoverPos.top) : undefined,
            left: popoverPos.left,
            zIndex: 9999,
            width: 480,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: "min(78vh, 720px)",
            overflowY: "auto",
            background: C.paper,
            border: `1px solid ${C.paperBorder}`,
            borderRadius: 4,
            boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            padding: 14,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                color: C.inkLight, fontWeight: 700,
              }}>
                Line {line.line_no}
              </div>
              {line.thn && (
                <button
                  onClick={() => {
                    setMaintainOpen(true);
                    setOpen(false);
                  }}
                  style={{
                    padding: "4px 10px", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                    fontWeight: 700,
                    background: C.amber, color: "#fff",
                    border: `1px solid ${C.amber}`, borderRadius: 3,
                    cursor: "pointer",
                  }}
                  title="Open the Maintain Tariff window to edit this THN's description, duty %, or exemption class"
                >
                  ✎ Maintain {line.thn}
                </button>
              )}
            </div>
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ink,
            }}>
              {line.description || "(no description)"}
            </div>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                letterSpacing: "0.1em", color: C.inkLight, textTransform: "uppercase",
                marginBottom: 6, fontWeight: 600,
              }}>
                Suggestions
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
                {suggestions.map((s, i) => {
                  const isCurrent = s.thn === line.thn;
                  const pill = ratePillStyle(s.exemption_class, s.duty_rate);
                  const conf = thnConfidenceStyle(s.confidence);
                  return (
                    <button
                      key={s.thn + i}
                      onClick={() => !isCurrent && pickSuggestion(s.thn)}
                      disabled={busy || isCurrent}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        background: isCurrent ? C.paperAlt : "transparent",
                        border: `1px solid ${isCurrent ? C.green : C.paperBorder}`,
                        borderRadius: 3,
                        cursor: isCurrent ? "default" : "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = C.paperAlt;
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 13, fontWeight: 700, color: C.ink,
                        }}>
                          {s.thn}
                        </span>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 9, fontWeight: 700,
                          color: pill.color, background: pill.bg,
                          padding: "1px 5px", borderRadius: 2,
                          letterSpacing: "0.06em",
                        }}>
                          {pill.label}
                        </span>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                          color: conf.fg, background: conf.bg,
                          padding: "1px 5px", borderRadius: 2, letterSpacing: "0.06em",
                          fontWeight: 600,
                        }}>
                          {Math.round(s.confidence * 100)}%
                        </span>
                        {isCurrent && (
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                            color: C.green, letterSpacing: "0.08em",
                            marginLeft: "auto", fontWeight: 700,
                          }}>
                            CURRENT
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontFamily: "'Fraunces', serif", fontSize: 11,
                        color: C.inkMid, marginBottom: 1, lineHeight: 1.3,
                      }}>
                        {s.description}
                      </div>
                      <div style={{
                        fontFamily: "'Fraunces', serif", fontSize: 10,
                        color: C.inkLight, fontStyle: "italic",
                      }}>
                        {s.match_reason}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual entry */}
          <div style={{
            paddingTop: 10, borderTop: `1px solid ${C.paperBorder}`,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              letterSpacing: "0.1em", color: C.inkLight, textTransform: "uppercase",
              fontWeight: 600,
            }}>
              Or set a THN manually
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={manualThn}
                onChange={(e) => {
                  setManualThn(e.target.value);
                  setManualLookup(null);
                }}
                placeholder="8-digit THN"
                style={{
                  flex: 1,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  padding: "6px 8px",
                  border: `1px solid ${C.paperBorder}`, borderRadius: 3,
                  background: "#fff", color: C.ink, outline: "none",
                }}
              />
              <button
                onClick={lookupManual}
                disabled={busy || manualThn.replace(/\D/g, "").length !== 8}
                style={{
                  padding: "6px 10px",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  background: "transparent", color: C.inkMid,
                  border: `1px solid ${C.paperBorder}`, borderRadius: 3,
                  letterSpacing: "0.06em", cursor: "pointer", textTransform: "uppercase",
                }}
              >
                Lookup
              </button>
              <button
                onClick={applyManual}
                disabled={busy || manualThn.replace(/\D/g, "").length !== 8}
                style={{
                  padding: "6px 14px", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, background: C.ink, color: C.paper,
                  border: `1px solid ${C.ink}`, borderRadius: 3,
                  letterSpacing: "0.06em", cursor: "pointer",
                  fontWeight: 600, textTransform: "uppercase",
                }}
              >
                Apply
              </button>
            </div>
            {manualLookup && (
              <div style={{
                fontFamily: "'Fraunces', serif", fontSize: 11, color: C.inkMid,
                background: C.paperAlt, padding: "6px 8px", borderRadius: 3,
              }}>
                <strong>{manualLookup.description}</strong> —{" "}
                {manualLookup.exemption_class === "full_exempt" ? "Exempt"
                  : manualLookup.exemption_class === "duty_free_only" ? "Duty-free"
                  : `${Math.round(manualLookup.duty_rate * 100)}% duty`}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "flex-end" }}>
            <button
              onClick={reclassify}
              disabled={busy || !line.description}
              style={{
                padding: "6px 10px", fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, background: "transparent", color: C.amber,
                border: `1px solid ${C.amber}`, borderRadius: 3,
                letterSpacing: "0.06em", cursor: "pointer",
                textTransform: "uppercase", fontWeight: 600,
              }}
            >
              Re-run Classifier
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: "6px 10px", fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, background: "transparent", color: C.inkMid,
                border: `1px solid ${C.paperBorder}`, borderRadius: 3,
                letterSpacing: "0.06em", cursor: "pointer", textTransform: "uppercase",
              }}
            >
              Close
            </button>
          </div>
        </div>,
        document.body,
      )}

      {maintainOpen && (
        <MaintainTariffDialog
          thn={line.thn}
          onClose={() => setMaintainOpen(false)}
          onSaved={async () => {
            // After the broker edits the tariff entry, the manifest needs to
            // be reloaded so duty/OPT/VAT recompute for every line using the
            // new rule. We call onReload (if provided) — the parent fetches
            // the manifest fresh and the new values flow back to this cell.
            if (onReload) {
              await onReload();
            }
          }}
        />
      )}
    </div>
  );
}
