import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { TopNav } from "@/components/TopNav";
import { STALLION_BASE_URL } from "@/services/stallionApi";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6",
  paperMid: "#CCC7BE", ink: "#18150F", inkMid: "#3D3830", inkLight: "#6B6560",
  void_: "#111318", voidSurface: "#1F2430", voidBorder: "#2E3748",
  ghost: "#A0AABB", ghostDim: "#6B7585",
  approved: "#1A5E3A", pending: "#96700A", correction: "#963A10",
  rejected: "#7A1E1E", submitted: "#1E4A8C", receipted: "#1E4A8C",
  extracted: "#1A5E3A",
};

type LogEvent = {
  event: string;
  declaration_id: string;
  reference: string;
  consignee: string;
  source: string;
  confidence: number | null;
  timestamp: string;
  actor: string;
  notes: string;
};

const EVENT_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  created:          { label: "CREATED",    color: C.inkMid,     bg: "#F0F0F0",      dot: C.inkMid },
  extracted:        { label: "EXTRACTED",  color: "#2BB673",    bg: "#E8F8F2",      dot: "#2BB673" },
  pending_review:   { label: "PENDING",    color: C.pending,    bg: "#FEF3DC",      dot: C.pending },
  approved:         { label: "APPROVED",   color: C.approved,   bg: "#EBF7F1",      dot: C.approved },
  needs_correction: { label: "CORRECTION", color: C.correction, bg: "#FEF0E8",      dot: C.correction },
  rejected:         { label: "REJECTED",   color: C.rejected,   bg: "#FEE8E8",      dot: C.rejected },
  submitted:        { label: "SUBMITTED",  color: "#1E4A8C",    bg: "#EEF2FA",      dot: "#1E4A8C" },
  receipted:        { label: "RECEIPTED",  color: "#1E4A8C",    bg: "#EEF2FA",      dot: "#1E4A8C" },
};

function eventCfg(event: string) {
  return EVENT_CFG[event] ?? EVENT_CFG.created;
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  if (isToday(d)) return `Today · ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday · ${format(d, "HH:mm")}`;
  return format(d, "dd MMM yyyy · HH:mm");
}

function formatRelative(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return formatDistanceToNow(d, { addSuffix: true });
}

const ALL_EVENTS = ["all", "extracted", "created", "approved", "needs_correction", "rejected", "submitted", "receipted"];

export default function ActivityLog() {
  const navigate = useNavigate();
  const [events,    setEvents]    = useState<LogEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [filter,    setFilter]    = useState("all");
  const [search,    setSearch]    = useState("");
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month">("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${STALLION_BASE_URL}/log`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setEvents(data.events ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load log");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (dateRange !== "all") {
        const now = new Date();
        const d = new Date(e.timestamp);
        if (dateRange === "today" && !isToday(d)) return false;
        if (dateRange === "week") {
          const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
          if (d < weekAgo) return false;
        }
        if (dateRange === "month") {
          if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
        }
      }
      if (filter !== "all" && e.event !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.reference.toLowerCase().includes(q) ||
          e.consignee.toLowerCase().includes(q) ||
          e.actor.toLowerCase().includes(q) ||
          e.notes.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [events, filter, search, dateRange]);

  // Group filtered events by day label
  const grouped = useMemo(() => {
    const groups: { label: string; events: LogEvent[] }[] = [];
    let lastLabel = "";
    for (const e of filtered) {
      const d = new Date(e.timestamp);
      const label = isNaN(d.getTime()) ? "Unknown" : isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE, dd MMM yyyy");
      if (label !== lastLabel) {
        groups.push({ label, events: [] });
        lastLabel = label;
      }
      groups[groups.length - 1].events.push(e);
    }
    return groups;
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const e of events) c[e.event] = (c[e.event] || 0) + 1;
    return c;
  }, [events]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { background: ${C.paper}; }
        .log-row:hover { background: ${C.paperAlt} !important; }
        input::placeholder { color: ${C.inkLight}; opacity: 0.7; }
        input:focus { outline: none; border-color: ${C.inkLight} !important; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: ${C.paperBorder}; border-radius: 3px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: C.paper, fontFamily: "'Fraunces', serif", color: C.ink }}>
        <TopNav />

        {/* Page header */}
        <div style={{ borderBottom: `1px solid ${C.paperBorder}`, padding: "24px 32px 20px" }}>
          <div style={{ maxWidth: 1060, margin: "0 auto" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: C.inkLight, marginBottom: 8 }}>
              ACTIVITY LOG
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: C.ink, margin: 0, lineHeight: 1 }}>
                System Log
              </h1>
              <div style={{ display: "flex", gap: 24 }}>
                {[["TOTAL", events.length], ["TODAY", filtered.filter(e => isToday(new Date(e.timestamp))).length]].map(([l, v]) => (
                  <div key={l as string} style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: C.inkMid, lineHeight: 1 }}>{v}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: C.inkLight, letterSpacing: "0.12em", marginTop: 4 }}>{l as string}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ borderBottom: `1px solid ${C.paperBorder}`, padding: "12px 32px" }}>
          <div style={{ maxWidth: 1060, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {/* Search */}
              <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.inkLight, fontSize: 13 }}>⌕</span>
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search reference, consignee, actor…"
                  style={{
                    width: "100%", padding: "7px 10px 7px 28px",
                    background: C.paper, border: `1px solid ${C.paperBorder}`,
                    borderRadius: 3, color: C.ink, fontSize: 12,
                    fontFamily: "'Fraunces', serif",
                  }}
                />
              </div>
              {/* Date range filters */}
              <div style={{ display: "flex", gap: 4 }}>
                {(["all","today","week","month"] as const).map(range => {
                  const labels = { all: "ALL TIME", today: "TODAY", week: "THIS WEEK", month: "THIS MONTH" };
                  const active = dateRange === range;
                  return (
                    <button key={range} onClick={() => setDateRange(range)} style={{
                      padding: "4px 10px",
                      background: active ? C.inkMid : "transparent",
                      border: `1px solid ${active ? C.inkMid : C.paperBorder}`,
                      borderRadius: 3, cursor: "pointer",
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      fontWeight: 700, letterSpacing: "0.1em",
                      color: active ? C.paper : C.inkLight,
                      transition: "all 0.12s",
                    }}>
                      {labels[range]}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Event type filters */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {ALL_EVENTS.map(ev => {
                const cfg = ev === "all" ? null : eventCfg(ev);
                const active = filter === ev;
                return (
                  <button key={ev} onClick={() => setFilter(ev)} style={{
                    padding: "4px 10px",
                    background: active ? (cfg?.bg ?? C.paperAlt) : "transparent",
                    border: `1px solid ${active ? (cfg?.dot ?? C.inkMid) + "66" : C.paperBorder}`,
                    borderRadius: 3, cursor: "pointer",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    fontWeight: 700, letterSpacing: "0.1em",
                    color: active ? (cfg?.color ?? C.inkMid) : C.inkLight,
                    transition: "all 0.12s",
                  }}>
                    {ev.toUpperCase().replace("_", " ")}
                    {counts[ev] ? ` · ${counts[ev]}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ maxWidth: 1060, margin: "0 auto", padding: "24px 32px 48px" }}>
          {loading && (
            <div style={{ padding: "60px 0", textAlign: "center", fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.ghostDim }}>
              Loading log…
            </div>
          )}
          {error && (
            <div style={{ padding: "16px", background: "#2B0000", border: "1px solid #7A1E1E44", borderRadius: 3, color: "#ff8f8f", fontFamily: "'Fraunces', serif", fontSize: 13 }}>
              {error}
            </div>
          )}
          {!loading && !error && grouped.length === 0 && (
            <div style={{ padding: "60px 0", textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 32, color: C.paperMid, marginBottom: 16 }}>▤</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, color: C.inkMid, fontWeight: 600, marginBottom: 8 }}>No events found</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight }}>
                {search || filter !== "all" ? "Try clearing filters" : "Events will appear here as declarations are created and processed"}
              </div>
            </div>
          )}

          {grouped.map(group => (
            <div key={group.label} style={{ marginBottom: 32 }}>
              {/* Day header */}
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em",
                color: C.inkLight, marginBottom: 10,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                {group.label.toUpperCase()}
                <div style={{ flex: 1, height: 1, background: C.paperBorder }} />
                <span>{group.events.length}</span>
              </div>

              {/* Event rows */}
              <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
                {group.events.map((e, i) => {
                  const cfg = eventCfg(e.event);
                  return (
                    <div
                      key={`${e.declaration_id}-${e.event}-${i}`}
                      className="log-row"
                      onClick={() => navigate(`/stallion/brokerreview4?id=${e.declaration_id}`)}
                      style={{
                        display: "grid", gridTemplateColumns: "10px 120px 1fr 180px 140px",
                        alignItems: "center", gap: 16,
                        padding: "11px 16px",
                        borderBottom: i < group.events.length - 1 ? `1px solid ${C.paperBorder}` : "none",
                        cursor: "pointer", transition: "background 0.1s",
                        background: "transparent",
                      }}
                    >
                      {/* Colour dot */}
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />

                      {/* Event badge */}
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                        letterSpacing: "0.1em", color: cfg.color,
                        padding: "2px 7px", borderRadius: 2,
                        background: cfg.bg, border: `1px solid ${cfg.dot}33`,
                        whiteSpace: "nowrap",
                      }}>
                        {cfg.label}
                      </span>

                      {/* Reference + consignee */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: C.inkMid, letterSpacing: "0.04em", marginBottom: 2 }}>
                          {e.reference}
                        </div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.consignee || (e.source === "EXTRACT" ? "AI extracted" : "Manual entry")}
                          {e.confidence != null && (() => {
                            const raw = e.confidence!;
                            const pct = Math.min(100, raw > 1 ? Math.round(raw) : Math.round(raw * 100));
                            return <span style={{ marginLeft: 8, color: pct >= 90 ? "#1A5E3A" : pct >= 70 ? C.pending : "#963A10" }}>{pct}% conf.</span>;
                          })()}
                        </div>
                        {e.notes && (
                          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 10, color: C.inkLight, marginTop: 2, fontStyle: "italic" }}>
                            {e.notes}
                          </div>
                        )}
                      </div>

                      {/* Actor */}
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 11, color: C.inkLight, textAlign: "right" }}>
                        {e.actor}
                      </div>

                      {/* Timestamp */}
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkMid }}>
                          {format(new Date(e.timestamp), "HH:mm")}
                        </div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 10, color: C.inkLight, marginTop: 2 }}>
                          {formatRelative(e.timestamp)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filtered.length > 0 && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkLight, letterSpacing: "0.06em", marginTop: 8 }}>
              {filtered.length} event{filtered.length !== 1 ? "s" : ""}
              {(search || filter !== "all") && ` · filtered from ${events.length} total`}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
