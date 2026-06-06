/**
 * Dashboard.tsx — Stallion landing page.
 *
 * A 3×2 grid of module cards (per the approved layout): Trade Declarations,
 * Courier Worksheets, Review Queue, Tariff Database, Clients, Activity Log.
 * Each card shows live counts pulled from the existing list endpoints and a
 * primary action that routes into the module.
 *
 * Typography follows the heavier Stallion scale (Fraunces 700 masthead,
 * JetBrains Mono labels). No new backend — counts derive from listSheets,
 * listManifests, listClients, and getAuditLog.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listSheets } from "@/services/sheetApi";
import { listManifests, getAuditLog } from "@/services/courierApi";
import { listClients } from "@/services/stallionApi";

const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6", paperMid: "#CCC7BE",
  ink: "#18150F", inkMid: "#2C2820", inkLight: "#4A453D",
  void: "#111318", voidBorder: "#2E3748", ghost: "#B8C0CE", ghostDim: "#8A93A3",
  amber: "#C65911", green: "#1A5C3A", blue: "#1E4A8C", purple: "#5A3A8A",
  gold: "#B8860B", red: "#B02020",
};
const SERIF = "'Fraunces', Georgia, serif";
const MONO = "'JetBrains Mono', 'SFMono-Regular', monospace";

// Per-accent tint palette: soft fill + darker title ink + muted label ink.
// Keeps each card unmistakably its module colour without shouting.
const TINT: Record<string, { bg: string; border: string; title: string; label: string }> = {
  green:  { bg: "#EDF3EC", border: "#CFE1CC", title: "#143D28", label: "#3E6B52" },
  blue:   { bg: "#ECF1F8", border: "#C9D9EE", title: "#163963", label: "#3F608C" },
  amber:  { bg: "#FBEEE6", border: "#E5A06B", title: "#7A3A12", label: "#993C1D" },
  gold:   { bg: "#FAF3E2", border: "#E8D199", title: "#6B4E0A", label: "#8A6D00" },
  purple: { bg: "#F1ECF7", border: "#D6C7E8", title: "#3D2960", label: "#5A3A8A" },
  neutral:{ bg: "#EFECE6", border: "#D8D2C7", title: "#2C2820", label: "#4A453D" },
};

type Counts = {
  tradeTotal: number; tradeCorrections: number;
  courierTotal: number; courierExamined: number;
  reviewPending: number; reviewLowConf: number;
  clients: number; events: number;
  loaded: boolean;
};

const EMPTY: Counts = {
  tradeTotal: 0, tradeCorrections: 0, courierTotal: 0, courierExamined: 0,
  reviewPending: 0, reviewLowConf: 0, clients: 0, events: 0, loaded: false,
};

// Low confidence threshold for the review queue (matches the THN cell coloring).
const LOW_CONF = 0.5;

export default function Dashboard() {
  const nav = useNavigate();
  const [c, setC] = useState<Counts>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sheets, manifests, clients, audit] = await Promise.all([
        listSheets().catch(() => []),
        listManifests().then(r => r.items).catch(() => []),
        listClients().catch(() => []),
        getAuditLog(1).then((r: any) => r?.total ?? (r?.items?.length ?? 0)).catch(() => 0),
      ]);
      if (cancelled) return;

      const tradeTotal = sheets.length;
      const tradeCorrections = sheets.filter((s: any) => s.status === "correction").length;
      const reviewPending = sheets.filter((s: any) => s.status === "pending").length;

      const courierTotal = manifests.length;
      const courierExamined = manifests.filter((m: any) => m.status === "examined").length;

      // Low-confidence lines across courier manifests (THN classifier score).
      let reviewLowConf = 0;
      for (const m of manifests as any[]) {
        for (const ln of m.lines ?? []) {
          const conf = ln.thn_confidence;
          if (conf != null && conf < LOW_CONF) reviewLowConf++;
        }
      }

      setC({
        tradeTotal, tradeCorrections, courierTotal, courierExamined,
        reviewPending, reviewLowConf,
        clients: Array.isArray(clients) ? clients.length : 0,
        events: typeof audit === "number" ? audit : 0,
        loaded: true,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ background: C.paper, minHeight: "100%", padding: "32px 28px 48px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        {/* masthead */}
        <div style={{ marginBottom: 22, borderBottom: `1px solid ${C.paperBorder}`, paddingBottom: 18 }}>
          <div style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            color: C.amber, textTransform: "uppercase", marginBottom: 8,
          }}>Stallion · Operations</div>
          <h1 style={{
            fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: C.ink,
            margin: 0, letterSpacing: "-0.02em", lineHeight: 1.08,
          }}>Customs operations infrastructure</h1>
          <div style={{
            fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.inkLight,
            marginTop: 8, lineHeight: 1.5,
          }}>Live overview of declarations, courier worksheets, and the broker review queue.</div>
        </div>

        {/* ── attention strip: everything actionable in one place ── */}
        <div style={{
          background: C.void, borderRadius: 10, padding: "16px 22px",
          display: "flex", alignItems: "center", gap: 30, flexWrap: "wrap",
          marginBottom: 16,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
            color: C.ghostDim, textTransform: "uppercase", lineHeight: 1.3,
          }}>Needs<br />Attention</div>

          <AttnStat v={c.reviewLowConf} label="low confidence"
            tone={c.reviewLowConf > 0 ? "#F09595" : "#fff"}
            sub={c.reviewLowConf > 0 ? "#E5A06B" : C.ghostDim} loaded={c.loaded} />
          <AttnStat v={c.reviewPending} label="pending"
            tone={c.reviewPending > 0 ? "#FAC775" : "#fff"} sub={C.ghostDim} loaded={c.loaded} />
          <AttnStat v={c.tradeCorrections} label="corrections"
            tone={c.tradeCorrections > 0 ? "#F09595" : "#fff"} sub={C.ghostDim} loaded={c.loaded} />

          <button onClick={() => nav("/stallion/brokerreview4")} style={{
            marginLeft: "auto", fontFamily: MONO, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase", padding: "9px 18px",
            cursor: "pointer", borderRadius: 4, border: "none", background: C.amber, color: "#fff",
          }}>Review queue →</button>
        </div>

        {/* ── metric modules (tinted stat cards) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <ModuleCard
            tint="green" title="Trade Declarations" icon="▤"
            big={{ v: c.tradeTotal, l: "total" }}
            note={c.tradeCorrections > 0 ? `${c.tradeCorrections} corrections` : "0 corrections"}
            noteAlert={c.tradeCorrections > 0}
            onClick={() => nav("/stallion/sheets")} loaded={c.loaded}
          />
          <ModuleCard
            tint="blue" title="Courier Worksheets" icon="✈"
            big={{ v: c.courierTotal, l: "total" }}
            note={`${c.courierExamined} examined`}
            onClick={() => nav("/stallion/courier")} loaded={c.loaded}
          />
          <ModuleCard
            tint="amber" title="Review Queue"
            badge={c.reviewLowConf > 0 ? `${c.reviewLowConf} flagged` : undefined}
            big={{ v: c.reviewLowConf, l: "low confidence", alert: c.reviewLowConf > 0 }}
            note={c.reviewPending > 0 ? `${c.reviewPending} pending` : "0 pending"}
            onClick={() => nav("/stallion/brokerreview4")} loaded={c.loaded}
          />
        </div>

        {/* ── utility modules (slim rows) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 14 }}>
          <UtilityCard tint="gold" title="Tariff Database" right="Search →"
            onClick={() => nav("/stallion/courier/tariff")} />
          <UtilityCard tint="purple" title="Clients" count={c.loaded ? c.clients : undefined} right="Open →"
            onClick={() => nav("/stallion/clients")} />
          <UtilityCard tint="neutral" title="Activity Log" count={c.loaded ? c.events : undefined} right="View →"
            onClick={() => nav("/stallion/log")} />
        </div>
      </div>
    </div>
  );
}

// Stat shown in the dark attention strip.
function AttnStat({ v, label, tone, sub, loaded }: {
  v: number; label: string; tone: string; sub: string; loaded: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: tone, lineHeight: 1 }}>
        {loaded ? v : "—"}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: sub }}>{label}</span>
    </div>
  );
}

// Slim utility module row.
function UtilityCard({ tint, title, count, right, onClick }: {
  tint: string; title: string; count?: number; right: string; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const t = TINT[tint] || TINT.neutral;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10,
        padding: "16px 18px", cursor: "pointer", textAlign: "left",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        transition: "transform 0.14s, box-shadow 0.14s",
        transform: hover ? "translateY(-2px)" : "none",
        boxShadow: hover ? "0 6px 18px rgba(0,0,0,0.07)" : "none",
      }}
    >
      <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: t.title, letterSpacing: "-0.01em" }}>
        {title}{count != null ? ` · ${count}` : ""}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: t.label, letterSpacing: "0.04em" }}>
        {right}
      </span>
    </button>
  );
}

function ModuleCard({ tint, title, icon, badge, big, note, noteAlert, onClick, loaded }: {
  tint: string; title: string; icon?: string; badge?: string;
  big: { v: number; l: string; alert?: boolean };
  note?: string; noteAlert?: boolean; onClick: () => void; loaded: boolean;
}) {
  const [hover, setHover] = useState(false);
  const t = TINT[tint] || TINT.neutral;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: t.bg, border: `${big.alert ? 2 : 1}px solid ${big.alert ? t.border : t.border}`,
        borderRadius: 10, padding: "18px 20px", cursor: "pointer", textAlign: "left",
        display: "flex", flexDirection: "column", minHeight: 132,
        transition: "transform 0.14s, box-shadow 0.14s",
        transform: hover ? "translateY(-2px)" : "none",
        boxShadow: hover ? "0 8px 22px rgba(0,0,0,0.08)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: t.title, letterSpacing: "-0.01em" }}>{title}</span>
        {badge ? (
          <span style={{
            fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
            textTransform: "uppercase", background: C.red, color: "#fff",
            padding: "2px 8px", borderRadius: 10,
          }}>{badge}</span>
        ) : icon ? (
          <span style={{ color: t.label, fontSize: 16 }}>{icon}</span>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{
          fontFamily: SERIF, fontSize: 40, fontWeight: 700, lineHeight: 1,
          color: big.alert ? C.red : t.title,
        }}>{loaded ? big.v : "—"}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: big.alert ? "#993C1D" : t.label }}>
          {big.l}</span>
      </div>

      {note && (
        <div style={{
          fontFamily: MONO, fontSize: 11, fontWeight: 600, marginTop: 7,
          color: noteAlert ? C.red : t.label,
        }}>{note}</div>
      )}
    </button>
  );
}
