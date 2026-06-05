/**
 * StallionSheetList.tsx — "Trade Declarations" module landing page.
 *
 * Redesigned to match the operational weight of CourierManifests:
 *   header eyebrow + title + subtitle, primary/secondary actions,
 *   stat cards, status tabs, search + filters, and a full declaration table.
 *
 * Lives at /stallion/sheets inside StallionShell (which already provides TopNav),
 * so this component does NOT render its own TopNav — it starts at the content band.
 *
 * Positioning:
 *   Trade Declarations  = full customs entries (C82 / C84 / C75 / C76 / C86), ASYCUDA output
 *   Courier Worksheets  = non-trade express shipments
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listSheets, createSheet, deleteSheet, Sheet } from "@/services/sheetApi";

/* ------------------------------------------------------------------ tokens */
const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6", paperMid: "#CCC7BE",
  ink: "#18150F", inkMid: "#2C2820", inkLight: "#4A453D",
  green: "#1A5C3A", greenLight: "#EBF5EE",
  amber: "#C65911", amberLight: "#FDF2E5",
  blue: "#1E4A8C", blueLight: "#EEF2FA",
  gold: "#B8860B",
  warn: "#FEF3DC", warnBorder: "#D4A020", warnText: "#7A5000",
  critical: "#FEE8E8", critBorder: "#B02020",
  purple: "#5A3A8A", purpleLight: "#F0EBF7",
};
const MONO = "'JetBrains Mono', monospace";
const SERIF = "'Fraunces', serif";

/* ------------------------------------------------------------- status model */
const STATUS_STYLE: Record<string, { fg: string; bg: string; border: string; label: string }> = {
  draft:      { fg: C.inkLight,  bg: C.paperAlt,    border: C.paperBorder,  label: "DRAFT" },
  pending:    { fg: C.warnText,  bg: C.warn,        border: C.warnBorder,   label: "BROKER REVIEW" },
  correction: { fg: C.critBorder, bg: C.critical,   border: C.critBorder,   label: "CORRECTION" },
  approved:   { fg: C.green,     bg: C.greenLight,  border: C.green + "55", label: "APPROVED" },
  submitted:  { fg: C.blue,      bg: C.blueLight,   border: C.blue + "55",  label: "SUBMITTED" },
  receipted:  { fg: C.purple,    bg: C.purpleLight, border: C.purple + "55", label: "RECEIPTED" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.draft;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
      color: s.fg, background: s.bg, border: `1px solid ${s.border}`,
      padding: "3px 8px", borderRadius: 3, display: "inline-block", whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

/* ------------------------------------------------- declaration-type derivation */
const REGIME_LABEL: Record<string, string> = {
  C4: "Import C82", C7: "Warehouse C75", C5: "Temp Import",
  E1: "Export C82", E2: "Temp Export", E3: "Re-Export",
};
const TYPE_LABEL: Record<string, string> = {
  import_c82: "Import C82", export_c82: "Export C82",
  c84: "C84 Concession", c75: "C75 Warehouse", c76: "C76 Ex-Warehouse",
  c86: "C86 Bill of Sight", manual: "Worksheet",
};
function declType(s: Sheet & { declaration_type?: string }): string {
  if (s.declaration_type && TYPE_LABEL[s.declaration_type]) return TYPE_LABEL[s.declaration_type];
  return REGIME_LABEL[s.customs_regime] || "Import C82";
}

/* -------------------------------------------------------------- confidence */
function rowConfidence(s: Sheet): { label: string; fg: string; bg: string } | null {
  const cs = (s.lines || [])
    .map(l => (l as any).thn_confidence ?? (l as any).confidence)
    .filter((c): c is number => typeof c === "number");
  if (!cs.length) return null;
  const min = Math.min(...cs);
  if (min >= 0.85) return { label: `HIGH ${Math.round(min * 100)}%`, fg: C.green, bg: C.greenLight };
  if (min >= 0.65) return { label: `REVIEW ${Math.round(min * 100)}%`, fg: C.warnText, bg: C.warn };
  return { label: `LOW ${Math.round(min * 100)}%`, fg: C.critBorder, bg: C.critical };
}

/* --------------------------------------------------------------- utilities */
function relTime(iso?: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "—";
  const d = Math.round((Date.now() - then) / 86400000);
  const h = Math.round((Date.now() - then) / 3600000);
  const m = Math.round((Date.now() - then) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return new Date(iso).toLocaleDateString();
}
function fmtTtd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ===================================================== New Declaration modal */
type DeclChoice = {
  key: string; title: string; desc: string;
  regime: string; declaration_type: string; accent: string;
};
const DECL_CHOICES: DeclChoice[] = [
  { key: "import", title: "Import Declaration",
    desc: "C82 home-use entry — invoice extraction, classification, duty cascade, ASYCUDA XML.",
    regime: "C4", declaration_type: "import_c82", accent: C.green },
  { key: "export", title: "Export Declaration",
    desc: "C82 export (EX1/EX3) — outbound shipment documentation and declaration.",
    regime: "E1", declaration_type: "export_c82", accent: C.blue },
  { key: "c84", title: "C84 — Duty Concession",
    desc: "Returning nationals, vehicles, diplomats and approved-undertaking waivers.",
    regime: "C4", declaration_type: "c84", accent: C.green },
  { key: "c75", title: "C75 — Warehousing",
    desc: "Goods entering a bonded warehouse with duty deferred until removal.",
    regime: "C7", declaration_type: "c75", accent: C.amber },
  { key: "c76", title: "C76 — Ex-Warehouse",
    desc: "Removal from bond — triggers the duty deferred at C75 entry.",
    regime: "C7", declaration_type: "c76", accent: C.amber },
  { key: "c86", title: "C86 — Bill of Sight",
    desc: "Provisional clearance under bond when documents are incomplete; perfected later.",
    regime: "C4", declaration_type: "c86", accent: C.purple },
  { key: "manual", title: "Manual Worksheet",
    desc: "Start from a blank costing worksheet and build the declaration by hand.",
    regime: "C4", declaration_type: "manual", accent: C.inkLight },
];

function NewDeclarationModal({ onPick, onClose, busy }: {
  onPick: (c: DeclChoice) => void; onClose: () => void; busy: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 620, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto",
        background: C.paper, borderRadius: 6, border: `1px solid ${C.paperBorder}`,
        padding: 28, boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
      }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
          color: C.amber, textTransform: "uppercase", marginBottom: 9 }}>
          Stallion · Trade Module
        </div>
        <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, color: C.ink, margin: 0, letterSpacing: "-0.01em" }}>
          New Declaration
        </h2>
        <p style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.inkMid, margin: "7px 0 20px 0", lineHeight: 1.5 }}>
          Choose a declaration type. Stallion routes you into the right workflow and
          pre-sets the ASYCUDA regime.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {DECL_CHOICES.map(c => (
            <button key={c.key} disabled={busy} onClick={() => onPick(c)}
              style={{
                textAlign: "left", cursor: busy ? "wait" : "pointer",
                background: "#fff", border: `1px solid ${C.paperBorder}`,
                borderLeft: `4px solid ${c.accent}`, borderRadius: 6, padding: "14px 16px",
                transition: "background 0.12s, transform 0.12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.paperAlt; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
            >
              <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 5, letterSpacing: "-0.01em" }}>
                {c.title}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: C.inkMid, lineHeight: 1.5 }}>
                {c.desc}
              </div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
          <button onClick={onClose} disabled={busy} style={{
            padding: "8px 16px", fontFamily: MONO, fontSize: 12, letterSpacing: "0.06em",
            textTransform: "uppercase", background: "transparent",
            border: `1px solid ${C.paperBorder}`, borderRadius: 4, color: C.inkMid,
            cursor: "pointer",
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ main component */
const TABS: { key: string; label: string; match: (s: Sheet) => boolean }[] = [
  { key: "all",        label: "All",            match: () => true },
  { key: "draft",      label: "Draft",          match: s => s.status === "draft" },
  { key: "pending",    label: "Broker Review",  match: s => s.status === "pending" },
  { key: "correction", label: "Corrections",    match: s => s.status === "correction" },
  { key: "submitted",  label: "Submitted",      match: s => s.status === "submitted" },
  { key: "approved",   label: "Approved",       match: s => s.status === "approved" },
  { key: "receipted",  label: "Receipted",      match: s => s.status === "receipted" },
];

export default function StallionSheetList() {
  const nav = useNavigate();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    listSheets().then(setSheets).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const createFrom = async (c: DeclChoice) => {
    setCreating(true);
    try {
      const s = await createSheet({
        customs_regime: c.regime,
        ...( { declaration_type: c.declaration_type } as Partial<Sheet> ),
      });
      nav(`/stallion/sheet/${s.id}`);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this declaration?")) return;
    await deleteSheet(id); load();
  };

  const summary = useMemo(() => ({
    total:      sheets.length,
    draft:      sheets.filter(s => s.status === "draft").length,
    pending:    sheets.filter(s => s.status === "pending").length,
    correction: sheets.filter(s => s.status === "correction").length,
    approved:   sheets.filter(s => s.status === "approved").length,
    receipted:  sheets.filter(s => s.status === "receipted").length,
  }), [sheets]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    sheets.forEach(s => set.add(declType(s)));
    return Array.from(set).sort();
  }, [sheets]);

  const rows = useMemo(() => {
    const tabDef = TABS.find(t => t.key === tab)!;
    const needle = q.trim().toLowerCase();
    return sheets
      .filter(tabDef.match)
      .filter(s => !typeFilter || declType(s) === typeFilter)
      .filter(s => {
        if (!needle) return true;
        return [s.reference, s.consignee, s.consignor, s.bl_number, s.vessel, s.port]
          .filter(Boolean).join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        if (a.status === "draft" && b.status !== "draft") return -1;
        if (b.status === "draft" && a.status !== "draft") return 1;
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      });
  }, [sheets, tab, q, typeFilter]);

  return (
    <div style={{ background: C.paperAlt, minHeight: "100%" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "32px 28px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap", marginBottom: 26 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
              color: C.amber, textTransform: "uppercase", marginBottom: 8 }}>
              Stallion · Trade Module
            </div>
            <h1 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 40, color: C.ink,
              margin: 0, letterSpacing: "-0.02em", lineHeight: 1.02 }}>
              Trade Declarations
            </h1>
            <p style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.inkMid,
              margin: "8px 0 0 0", maxWidth: 660, lineHeight: 1.5 }}>
              Prepare import/export declarations, C82 worksheets, C84 concessions,
              C75/C76 warehousing, and ASYCUDA-ready submissions.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => nav("/stallion/courier/tariff")} style={{
              padding: "10px 16px", fontFamily: MONO, fontSize: 12, letterSpacing: "0.08em",
              textTransform: "uppercase", background: "transparent",
              border: `1px solid ${C.paperMid}`, borderRadius: 4, color: C.inkMid,
              cursor: "pointer", fontWeight: 700,
            }}>⊞ Tariff Database</button>
            <button onClick={() => setShowNew(true)} style={{
              padding: "10px 18px", fontFamily: MONO, fontSize: 12, letterSpacing: "0.08em",
              textTransform: "uppercase", background: C.amber, border: `1px solid ${C.amber}`,
              borderRadius: 4, color: "#fff", cursor: "pointer", fontWeight: 700,
            }}>+ New Declaration</button>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 22 }}>
          {[
            { label: "Total",         value: summary.total,      color: C.ink },
            { label: "Draft",         value: summary.draft,      color: C.inkLight },
            { label: "Broker Review", value: summary.pending,    color: C.warnText },
            { label: "Corrections",   value: summary.correction, color: C.critBorder },
            { label: "Approved",      value: summary.approved,   color: C.green },
            { label: "Receipted",     value: summary.receipted,  color: C.purple },
          ].map(card => (
            <div key={card.label} style={{
              background: C.paper, border: `1px solid ${C.paperBorder}`,
              borderRadius: 4, padding: "13px 16px",
            }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em",
                color: C.inkLight, textTransform: "uppercase", marginBottom: 4 }}>
                {card.label}
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, color: card.color }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* Status tabs */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
          {TABS.map(t => {
            const active = tab === t.key;
            const count = t.key === "all" ? sheets.length : sheets.filter(t.match).length;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase",
                padding: "7px 13px", borderRadius: 4, cursor: "pointer", fontWeight: active ? 700 : 500,
                background: active ? C.ink : "transparent",
                color: active ? C.paper : C.inkMid,
                border: `1px solid ${active ? C.ink : C.paperMid}`,
              }}>
                {t.label}<span style={{ opacity: 0.6, marginLeft: 6 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search + filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search reference, client, consignor, BL, vessel…"
            style={{
              flex: 1, minWidth: 260, fontFamily: MONO, fontSize: 13, padding: "9px 12px",
              border: `1px solid ${C.paperBorder}`, borderRadius: 4, background: "#fff",
              color: C.ink, outline: "none",
            }}
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{
            fontFamily: MONO, fontSize: 12, padding: "9px 12px",
            border: `1px solid ${C.paperBorder}`, borderRadius: 4, background: "#fff",
            color: C.inkMid, cursor: "pointer",
          }}>
            <option value="">All types</option>
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Declaration table */}
        <div style={{ background: C.paper, border: `1px solid ${C.paperBorder}`,
          borderRadius: 4, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: "center", fontFamily: SERIF, color: C.inkLight }}>
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontFamily: SERIF, fontSize: 20, color: C.inkLight, marginBottom: 8 }}>
                {sheets.length === 0 ? "No trade declarations yet" : "Nothing matches this view"}
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 13, color: C.inkLight,
                fontStyle: "italic", maxWidth: 460, margin: "0 auto 18px" }}>
                {sheets.length === 0
                  ? "Create your first import/export declaration. Stallion will extract the invoice, classify items, and prepare the worksheet."
                  : "Try clearing the search box, the type filter, or switching tabs."}
              </div>
              {sheets.length === 0 && (
                <button onClick={() => setShowNew(true)} style={{
                  padding: "10px 18px", fontFamily: MONO, fontSize: 12, letterSpacing: "0.08em",
                  textTransform: "uppercase", background: C.ink, border: `1px solid ${C.ink}`,
                  borderRadius: 4, color: C.paper, cursor: "pointer", fontWeight: 600,
                }}>+ New Declaration</button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1040 }}>
                <thead>
                  <tr style={{ background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}` }}>
                    {["REFERENCE", "CLIENT / CONSIGNEE", "TYPE", "PORT", "STATUS",
                      "LINES", "CIF (TTD)", "TAXES (TTD)", "CONF.", "UPDATED", ""]
                      .map((h, i) => (
                        <th key={h + i} style={{
                          textAlign: i >= 5 && i <= 7 ? "right" : "left",
                          padding: "10px 14px", fontFamily: MONO, fontSize: 9.5,
                          letterSpacing: "0.07em", color: C.inkLight, fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => {
                    const conf = rowConfidence(s);
                    const cifTtd = (s.totals as any)?.cif_ttd;
                    const taxes = (s.totals?.duty ?? 0) + (s.totals?.surcharge ?? 0) + (s.totals?.vat ?? 0);
                    return (
                      <tr key={s.id}
                        onClick={() => nav(`/stallion/sheet/${s.id}`)}
                        onMouseEnter={e => e.currentTarget.style.background = C.paperAlt}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        style={{ borderBottom: `1px solid ${C.paperBorder}`, cursor: "pointer",
                          transition: "background 0.1s" }}
                      >
                        <td style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 13,
                          color: C.ink, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {s.reference || <span style={{ color: C.inkLight, fontWeight: 400 }}>(untitled)</span>}
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: SERIF, fontSize: 13,
                          color: C.inkMid, maxWidth: 220, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.consignee || "—"}
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 11.5,
                          color: C.inkMid, whiteSpace: "nowrap" }}>
                          {declType(s)}
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 12,
                          color: C.inkMid }}>
                          {s.port || "—"}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <StatusPill status={s.status} />
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 13,
                          color: C.inkMid, textAlign: "right" }}>
                          {s.lines?.length ?? 0}
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 12.5,
                          color: C.inkMid, textAlign: "right" }}>
                          {fmtTtd(cifTtd)}
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 12.5,
                          color: C.ink, textAlign: "right" }}>
                          {fmtTtd(taxes || s.totals?.total_payable)}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          {conf ? (
                            <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700,
                              letterSpacing: "0.05em", color: conf.fg, background: conf.bg,
                              padding: "3px 7px", borderRadius: 3, whiteSpace: "nowrap" }}>
                              {conf.label}
                            </span>
                          ) : <span style={{ color: C.inkLight, fontFamily: MONO, fontSize: 11 }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 11,
                          color: C.inkLight, whiteSpace: "nowrap" }}>
                          {relTime(s.updated_at)}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}
                          onClick={e => e.stopPropagation()}>
                          <button onClick={e => remove(s.id, e)} title="Delete declaration" style={{
                            fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em",
                            textTransform: "uppercase", color: C.critBorder, background: "transparent",
                            padding: "4px 8px", border: `1px solid ${C.critBorder}33`,
                            borderRadius: 3, cursor: "pointer",
                          }}>Del</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkLight, marginTop: 12 }}>
          {rows.length} of {sheets.length} declaration{sheets.length === 1 ? "" : "s"}
          {tab !== "all" || typeFilter || q ? " (filtered)" : ""}
        </div>
      </div>

      {showNew && (
        <NewDeclarationModal
          busy={creating}
          onPick={createFrom}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
