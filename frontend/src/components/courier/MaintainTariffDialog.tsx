/**
 * MaintainTariffDialog — full tariff maintenance modal.
 *
 * Lets the broker edit a single THN's tariff entry: description, duty %,
 * exemption class. Saves go to /courier/tariff and /courier/rules/exemptions,
 * which means edits PERSIST across manifests as user-level overrides without
 * touching the bundled CET data.
 *
 * Opened from ThnClassifyCell via the "Maintain THN" action.
 */
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  lookupThn,
  addTariffEntry,
  addExemption,
  removeExemption,
  addCorrection,
} from "@/services/courierApi";
import { C, ratePillStyle } from "./tokens";

type ExemptionClass = "none" | "duty_free_only" | "full_exempt";

type Props = {
  thn: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type LookupState = {
  loading: boolean;
  thn: string;
  description: string;
  dutyPct: number;
  exemptionClass: ExemptionClass;
  isCorrected: boolean;
  isUnknown: boolean;
  originalThn: string;
  notes: string;
  isUserEntry: boolean;
  chapter: number | null;
  unit: string | null;
};

const EMPTY_STATE: LookupState = {
  loading: true,
  thn: "",
  description: "",
  dutyPct: 0,
  exemptionClass: "none",
  isCorrected: false,
  isUnknown: false,
  originalThn: "",
  notes: "",
  isUserEntry: false,
  chapter: null,
  unit: null,
};

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    letterSpacing: "0.1em", color: C.amber, textTransform: "uppercase",
    fontWeight: 700, marginBottom: 10, marginTop: 4,
  }}>
    {children}
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <label style={{
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    letterSpacing: "0.08em", color: C.inkLight, textTransform: "uppercase",
    fontWeight: 600, display: "block", marginBottom: 4,
  }}>
    {children}
  </label>
);

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
  padding: "8px 10px",
  border: `1px solid ${C.paperBorder}`, borderRadius: 4,
  background: "#fff", color: C.ink, outline: "none",
};

export function MaintainTariffDialog({ thn, onClose, onSaved }: Props) {
  const initialThn = thn.replace(/\D/g, "").trim();
  const [state, setState] = useState<LookupState>({
    ...EMPTY_STATE,
    thn: initialThn,
  });

  // Form fields (editable; initialised from lookup)
  const [description, setDescription] = useState("");
  const [dutyPct, setDutyPct] = useState("");
  const [exemptionClass, setExemptionClass] = useState<ExemptionClass>("none");

  // Correction (optional second section)
  const [correctionWrongThn, setCorrectionWrongThn] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "correction">("edit");

  const refresh = useCallback(async (targetThn: string) => {
    try {
      const res = await lookupThn(targetThn);
      const entry = res.entry as any;
      const desc = entry?.description ?? "";
      const dpct = (res.duty_rate || 0) * 100;
      const cls = (res.exemption_class as ExemptionClass) || "none";
      const isUserEntry = entry?.added_by != null;

      setState({
        loading: false,
        thn: res.thn,
        description: desc,
        dutyPct: dpct,
        exemptionClass: cls,
        isCorrected: res.is_corrected,
        isUnknown: res.is_unknown,
        originalThn: res.original_thn,
        notes: res.notes ?? entry?.notes ?? "",
        isUserEntry,
        chapter: entry?.chapter ?? null,
        unit: entry?.unit ?? null,
      });
      setDescription(desc);
      setDutyPct(String(Math.round(dpct)));
      setExemptionClass(cls);
    } catch (e: any) {
      setState({ ...EMPTY_STATE, loading: false, thn: targetThn });
      setDescription("");
      setDutyPct("0");
      setExemptionClass("none");
      toast.error(e.message || "Lookup failed");
    }
  }, []);

  useEffect(() => {
    refresh(initialThn);
  }, [initialThn, refresh]);

  const formDirty =
    !state.loading && (
      description !== state.description ||
      Number(dutyPct) !== state.dutyPct ||
      exemptionClass !== state.exemptionClass
    );

  const saveEdit = async () => {
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    const pct = Number(dutyPct);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Duty % must be between 0 and 100");
      return;
    }
    setSaving(true);
    try {
      // 1. Always upsert the tariff entry (description + dutyPct + exempt flag)
      await addTariffEntry(
        {
          thn: state.thn,
          description: description.trim(),
          duty_pct: pct,
          chapter: state.chapter ?? undefined,
          unit: state.unit ?? undefined,
          is_exempt: exemptionClass === "full_exempt" || pct === 0,
          comment: comment.trim() || undefined,
        },
        "broker",
      );

      // 2. If exemption class changed:
      //    - full_exempt / duty_free_only → add exemption rule
      //    - none → remove any existing exemption rule
      if (exemptionClass !== state.exemptionClass) {
        if (exemptionClass === "none") {
          // Best-effort remove. The endpoint 404s if there was none, which we
          // can safely ignore.
          try {
            await removeExemption(state.thn, comment.trim(), "broker");
          } catch {
            // ignore — there wasn't one
          }
        } else {
          await addExemption(
            {
              thn: state.thn,
              class: exemptionClass,
              notes: comment.trim() || description.trim(),
              comment: comment.trim() || undefined,
            },
            "broker",
          );
        }
      }

      toast.success(`Saved ${state.thn}`);
      await onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveCorrection = async () => {
    const wrong = correctionWrongThn.replace(/\D/g, "").trim();
    if (wrong.length !== 8) {
      toast.error("The wrong THN must be 8 digits");
      return;
    }
    if (wrong === state.thn) {
      toast.error("Wrong THN must differ from the correct THN");
      return;
    }
    if (!correctionReason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setSaving(true);
    try {
      await addCorrection(
        {
          wrong_thn: wrong,
          correct_thn: state.thn,
          reason: correctionReason.trim(),
          comment: comment.trim() || undefined,
        },
        "broker",
      );
      toast.success(`Mapped ${wrong} → ${state.thn}`);
      setCorrectionWrongThn("");
      setCorrectionReason("");
      await onSaved();
    } catch (e: any) {
      toast.error(e.message || "Correction save failed");
    } finally {
      setSaving(false);
    }
  };

  const pill = ratePillStyle(exemptionClass, Number(dutyPct) / 100);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600, maxHeight: "90vh", overflowY: "auto",
          background: C.paper, borderRadius: 6,
          border: `1px solid ${C.paperBorder}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header strip — same dark band as workbench top */}
        <div style={{
          background: C.voidMid, color: C.paper,
          padding: "18px 24px", borderRadius: "6px 6px 0 0",
          borderBottom: `1px solid ${C.voidBorder}`,
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            letterSpacing: "0.12em", color: C.amber, textTransform: "uppercase",
            marginBottom: 4,
          }}>
            Maintain Tariff
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600,
              lineHeight: 1,
            }}>
              {state.thn || "—"}
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: C.ghost,
            }}>
              {state.chapter != null ? `Chapter ${state.chapter}` : ""}
              {state.unit ? `  ·  unit: ${state.unit}` : ""}
            </div>
            <span style={{
              marginLeft: "auto", padding: "3px 8px", borderRadius: 3,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              letterSpacing: "0.1em", fontWeight: 700,
              color: state.isUserEntry ? C.amber : C.ghost,
              background: state.isUserEntry ? C.amberLight : "transparent",
              border: `1px solid ${state.isUserEntry ? C.amber : C.voidBorder}`,
            }}>
              {state.isUserEntry ? "USER OVERRIDE" : "BUNDLED CET"}
            </span>
          </div>
          {state.isCorrected && (
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 11,
              color: C.ghost, fontStyle: "italic", marginTop: 6,
            }}>
              Note: this THN resolves via a correction from {state.originalThn}.
            </div>
          )}
          {state.isUnknown && (
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 11,
              color: C.amber, fontStyle: "italic", marginTop: 6,
            }}>
              Not in the bundled CET. Saving will create a user override.
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", borderBottom: `1px solid ${C.paperBorder}`,
          padding: "0 24px",
        }}>
          {(["edit", "correction"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "12px 16px", background: "transparent", border: "none",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700,
                color: activeTab === tab ? C.ink : C.inkLight,
                borderBottom: `2px solid ${activeTab === tab ? C.amber : "transparent"}`,
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {tab === "edit" ? "Edit Tariff Entry" : "Add Correction"}
            </button>
          ))}
        </div>

        {state.loading ? (
          <div style={{
            padding: 40, textAlign: "center", fontFamily: "'Fraunces', serif",
            color: C.inkLight, fontStyle: "italic",
          }}>
            Looking up {state.thn}…
          </div>
        ) : activeTab === "edit" ? (
          <div style={{ padding: 24 }}>
            <SectionHeader>Tariff Entry</SectionHeader>

            <div style={{ marginBottom: 14 }}>
              <Label>Description</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ ...inputStyle, fontFamily: "'Fraunces', serif", fontSize: 13, resize: "vertical" }}
                placeholder="Cell phones; smartphones; …"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <Label>Duty %</Label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={dutyPct}
                  onChange={(e) => setDutyPct(e.target.value)}
                  style={inputStyle}
                  placeholder="20"
                />
              </div>
              <div>
                <Label>Exemption Class</Label>
                <select
                  value={exemptionClass}
                  onChange={(e) => setExemptionClass(e.target.value as ExemptionClass)}
                  style={inputStyle}
                >
                  <option value="none">None — pays duty/OPT/VAT</option>
                  <option value="duty_free_only">Duty-free only — pays OPT+VAT</option>
                  <option value="full_exempt">Full exempt — pays nothing</option>
                </select>
              </div>
            </div>

            <div style={{
              background: C.paperAlt, border: `1px solid ${C.paperBorder}`,
              borderRadius: 4, padding: "10px 12px", marginBottom: 14,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                letterSpacing: "0.1em", color: C.inkLight, textTransform: "uppercase",
                fontWeight: 600,
              }}>
                Preview rate pill
              </div>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                fontWeight: 700, color: pill.color, background: pill.bg,
                padding: "3px 9px", borderRadius: 3, letterSpacing: "0.08em",
              }}>
                {pill.label}
              </span>
              <div style={{
                fontFamily: "'Fraunces', serif", fontSize: 11,
                color: C.inkLight, fontStyle: "italic", marginLeft: "auto",
              }}>
                This is how the THN will show on manifest lines.
              </div>
            </div>

            <Label>Comment (audit log)</Label>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              style={{ ...inputStyle, marginBottom: 16 }}
              placeholder="e.g. 'Confirmed by Arnim 2026-05-12'"
            />

            {state.isUserEntry && (
              <div style={{
                fontFamily: "'Fraunces', serif", fontSize: 11,
                color: C.inkLight, fontStyle: "italic", marginBottom: 14,
              }}>
                You're editing an existing user override. Saving will update it.
              </div>
            )}
            {!state.isUserEntry && (
              <div style={{
                fontFamily: "'Fraunces', serif", fontSize: 11,
                color: C.inkLight, fontStyle: "italic", marginBottom: 14,
              }}>
                Saving will create a user-level override. The bundled CET entry stays untouched.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                disabled={saving}
                style={{
                  padding: "8px 16px", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
                  background: "transparent", border: `1px solid ${C.paperBorder}`,
                  borderRadius: 4, color: C.inkMid, cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || !formDirty}
                style={{
                  padding: "8px 20px", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
                  background: formDirty ? C.ink : "transparent",
                  border: `1px solid ${formDirty ? C.ink : C.paperBorder}`,
                  borderRadius: 4,
                  color: formDirty ? C.paper : C.inkLight,
                  cursor: saving || !formDirty ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1, fontWeight: 600,
                }}
              >
                {saving ? "Saving…" : "Save Tariff Entry"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            <SectionHeader>Add a Wrong-THN Correction</SectionHeader>
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 12,
              color: C.inkLight, marginBottom: 16,
            }}>
              Sometimes TTPOST or shippers consistently type a THN that doesn't exist or
              is the wrong digit (e.g. <code>85171200</code> instead of{" "}
              <code>{state.thn}</code>). Add a correction here and the system will
              automatically remap that wrong code to <strong>{state.thn}</strong> on every
              future manifest.
            </div>

            <div style={{ marginBottom: 14 }}>
              <Label>Wrong THN (the one shippers/TTPOST type)</Label>
              <input
                value={correctionWrongThn}
                onChange={(e) => setCorrectionWrongThn(e.target.value)}
                style={inputStyle}
                placeholder="8-digit THN"
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <Label>Correct THN (resolves to)</Label>
              <input
                value={state.thn}
                disabled
                style={{ ...inputStyle, background: C.paperAlt, color: C.inkLight }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <Label>Reason</Label>
              <textarea
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                rows={2}
                style={{ ...inputStyle, fontFamily: "'Fraunces', serif", fontSize: 13, resize: "vertical" }}
                placeholder="e.g. 'Typo: digit 2 dropped from the subcode'"
              />
            </div>

            <Label>Comment (audit log)</Label>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              style={{ ...inputStyle, marginBottom: 16 }}
              placeholder="Optional notes for the audit log"
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                disabled={saving}
                style={{
                  padding: "8px 16px", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
                  background: "transparent", border: `1px solid ${C.paperBorder}`,
                  borderRadius: 4, color: C.inkMid, cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                onClick={saveCorrection}
                disabled={saving || !correctionWrongThn.trim() || !correctionReason.trim()}
                style={{
                  padding: "8px 20px", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
                  background: C.ink, border: `1px solid ${C.ink}`, borderRadius: 4,
                  color: C.paper, cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1, fontWeight: 600,
                }}
              >
                {saving ? "Saving…" : "Save Correction"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
