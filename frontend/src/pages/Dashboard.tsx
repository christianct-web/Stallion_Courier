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
        <div style={{ marginBottom: 30 }}>
          <div style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
            color: C.amber, textTransform: "uppercase", marginBottom: 8,
          }}>Stallion</div>
          <h1 style={{
            fontFamily: SERIF, fontSize: 42, fontWeight: 700, color: C.ink,
            margin: 0, letterSpacing: "-0.02em", lineHeight: 1.02,
          }}>Customs operations infrastructure</h1>
        </div>

        {/* 3×2 module grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16,
        }}>
          <ModuleCard
            accent={C.green} title="Trade Declarations"
            stats={[
              { v: c.tradeTotal, l: "total" },
              { v: c.tradeCorrections, l: "corrections", tone: c.tradeCorrections > 0 ? C.red : undefined },
            ]}
            action="Open" onClick={() => nav("/stallion/sheets")} loaded={c.loaded}
          />
          <ModuleCard
            accent={C.blue} title="Courier Worksheets"
            stats={[
              { v: c.courierTotal, l: "total" },
              { v: c.courierExamined, l: "examined" },
            ]}
            action="Open" onClick={() => nav("/stallion/courier")} loaded={c.loaded}
          />
          <ModuleCard
            accent={C.amber} title="Review Queue"
            stats={[
              { v: c.reviewPending, l: "pending", tone: c.reviewPending > 0 ? C.gold : undefined },
              { v: c.reviewLowConf, l: "low confidence", tone: c.reviewLowConf > 0 ? C.red : undefined },
            ]}
            action="Review" onClick={() => nav("/stallion/brokerreview4")} loaded={c.loaded}
          />
          <ModuleCard
            accent={C.gold} title="Tariff Database"
            subtitle="Search HS codes"
            action="Search" onClick={() => nav("/stallion/courier/tariff")} loaded={c.loaded}
          />
          <ModuleCard
            accent={C.purple} title="Clients"
            stats={[{ v: c.clients, l: "registered" }]}
            action="Open" onClick={() => nav("/stallion/clients")} loaded={c.loaded}
          />
          <ModuleCard
            accent={C.inkLight} title="Activity Log"
            stats={[{ v: c.events, l: "events" }]}
            action="View" onClick={() => nav("/stallion/log")} loaded={c.loaded}
          />
        </div>
      </div>
    </div>
  );
}

function ModuleCard({ accent, title, subtitle, stats, action, onClick, loaded }: {
  accent: string; title: string; subtitle?: string;
  stats?: { v: number; l: string; tone?: string }[];
  action: string; onClick: () => void; loaded: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: "#fff", border: `1px solid ${C.paperBorder}`,
        borderLeft: `4px solid ${accent}`, borderRadius: 8,
        padding: "20px 22px", display: "flex", flexDirection: "column",
        minHeight: 168, transition: "box-shadow 0.14s, transform 0.14s",
        boxShadow: hover ? "0 8px 24px rgba(0,0,0,0.08)" : "none",
        transform: hover ? "translateY(-2px)" : "none",
      }}
    >
      <h2 style={{
        fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: C.ink,
        margin: "0 0 14px 0", letterSpacing: "-0.01em",
      }}>{title}</h2>

      <div style={{ flex: 1 }}>
        {subtitle && (
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.inkMid }}>
            {subtitle}
          </div>
        )}
        {stats && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {stats.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{
                  fontFamily: MONO, fontSize: 20, fontWeight: 700,
                  color: s.tone || C.ink, lineHeight: 1, minWidth: 28,
                }}>{loaded ? s.v : "—"}</span>
                <span style={{
                  fontFamily: MONO, fontSize: 11, fontWeight: 600,
                  color: s.tone || C.inkMid, letterSpacing: "0.02em",
                }}>{s.l}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={onClick} style={{
        marginTop: 16, alignSelf: "flex-start",
        fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", padding: "8px 18px", cursor: "pointer",
        borderRadius: 4, border: "none", background: C.ink, color: "#fff",
      }}>{action}</button>
    </div>
  );
}
