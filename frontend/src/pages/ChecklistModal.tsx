/**
 * ChecklistModal — shared checklist UI for Stallion Sheets.
 *
 * Renders a ChecklistReport in two contexts:
 *   mode="extraction"     after a document upload — "what we pulled, what needs you"
 *   mode="presubmission"  before Generate C82 XML — the readiness gate
 *
 * Same data shape, slightly different framing/CTA. Items are grouped by status
 * so the broker's eye lands on problems first.
 */
import { ChecklistReport, ChecklistItem } from "@/services/sheetApi";

const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6", paperMid: "#CCC7BE",
  ink: "#18150F", inkMid: "#2C2820", inkLight: "#4A453D",
  void: "#111318", ghost: "#B8C0CE", ghostDim: "#8A93A3",
  amber: "#C65911", green: "#1A5C3A", red: "#B02020", gold: "#B8860B",
};
const SERIF = "'Fraunces', Georgia, serif";
const MONO = "'JetBrains Mono', 'SFMono-Regular', monospace";

const STATUS_STYLE: Record<string, { fg: string; bg: string; glyph: string }> = {
  ok:      { fg: C.green, bg: "#EDF3EC", glyph: "✓" },
  missing: { fg: C.red,   bg: "#FBEAEA", glyph: "✕" },
  review:  { fg: C.gold,  bg: "#FAF3E2", glyph: "!" },
};

export function ChecklistModal({ report, mode, onClose, onProceed, busy }: {
  report: ChecklistReport;
  mode: "extraction" | "presubmission";
  onClose: () => void;
  onProceed?: () => void;   // extraction: "Continue"; presubmission: "Generate XML anyway"/"Generate XML"
  busy?: boolean;
}) {
  const isExtract = mode === "extraction";
  const { counts, ready, confidence } = report;

  // Order: criticals, then reviews/warns, then OK — problems first.
  const order = (i: ChecklistItem) =>
    i.status === "missing" ? 0 : i.status === "review" ? 1 : 2;
  const items = [...report.items].sort((a, b) => order(a) - order(b));

  const title = isExtract ? "Extraction review" : "Pre-submission check";
  const eyebrow = isExtract ? "Stallion · Document extracted" : "Stallion · Ready to submit?";
  const sub = isExtract
    ? "Here's what we pulled from your document — and what still needs your attention."
    : "A quick scan of this declaration before generating the C82 XML.";

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(17,19,24,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 560, maxWidth: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: C.paper, borderRadius: 10, border: `1px solid ${C.paperMid}`,
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)", overflow: "hidden",
      }}>
        {/* header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.paperBorder}` }}>
          <div style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            color: C.amber, textTransform: "uppercase", marginBottom: 9,
          }}>{eyebrow}</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: "-0.01em" }}>
              {title}</h2>
            {confidence != null && (
              <span style={{
                fontFamily: MONO, fontSize: 11, fontWeight: 700,
                color: confidence >= 0.85 ? C.green : confidence >= 0.7 ? C.gold : C.red,
              }}>{Math.round(confidence * 100)}% confidence</span>
            )}
          </div>
          <p style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.inkMid, margin: "7px 0 0 0", lineHeight: 1.5 }}>
            {sub}</p>

          {/* count chips */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Chip n={counts.critical} label="missing" tone={C.red} active={counts.critical > 0} />
            <Chip n={counts.warn} label="to review" tone={C.gold} active={counts.warn > 0} />
            <Chip n={counts.ok} label="found" tone={C.green} active />
          </div>
        </div>

        {/* item list */}
        <div style={{ padding: "12px 16px", overflowY: "auto", flex: 1 }}>
          {items.map((it, i) => {
            const st = STATUS_STYLE[it.status] || STATUS_STYLE.review;
            return (
              <div key={i} style={{ display: "flex", gap: 11, padding: "9px 8px", alignItems: "flex-start" }}>
                <span style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: 5, marginTop: 1,
                  background: st.bg, color: st.fg, display: "flex", alignItems: "center",
                  justifyContent: "center", fontFamily: MONO, fontSize: 12, fontWeight: 700,
                }}>{st.glyph}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: MONO, fontSize: 12, fontWeight: 600,
                    color: it.status === "ok" ? C.inkMid : C.ink,
                  }}>{it.label}</div>
                  {it.detail && (
                    <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: C.inkLight, marginTop: 2, lineHeight: 1.4 }}>
                      {it.detail}</div>
                  )}
                </div>
                {it.severity === "critical" && it.status !== "ok" && (
                  <span style={{
                    marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontSize: 8, fontWeight: 700,
                    letterSpacing: "0.08em", textTransform: "uppercase", color: "#fff",
                    background: C.red, padding: "2px 6px", borderRadius: 3, marginTop: 2,
                  }}>required</span>
                )}
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div style={{
          padding: "14px 24px", borderTop: `1px solid ${C.paperBorder}`,
          display: "flex", alignItems: "center", gap: 10, background: C.paperAlt,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: ready ? C.green : C.gold }}>
            {ready ? "✓ No blocking issues" : `${counts.critical} item(s) need attention`}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={onClose} disabled={busy} style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase", padding: "9px 16px", cursor: "pointer", borderRadius: 4,
              border: `1px solid ${C.paperMid}`, background: "#fff", color: C.inkMid,
            }}>{isExtract ? "Review later" : "Back"}</button>
            {onProceed && (
              <button onClick={onProceed} disabled={busy} style={{
                fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", padding: "9px 18px", cursor: "pointer", borderRadius: 4,
                border: "none",
                background: isExtract ? C.ink : (ready ? C.amber : C.gold),
                color: "#fff",
              }}>
                {isExtract ? "Start working" : (ready ? "Generate C82 XML" : "Generate anyway")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ n, label, tone, active }: { n: number; label: string; tone: string; active: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 6, padding: "5px 11px", borderRadius: 6,
      background: active ? tone + "14" : "#fff", border: `1px solid ${active ? tone + "44" : C.paperBorder}`,
    }}>
      <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: active ? tone : C.inkLight, lineHeight: 1 }}>{n}</span>
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: active ? tone : C.inkLight }}>{label}</span>
    </div>
  );
}
