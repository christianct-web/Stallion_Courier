/**
 * CourierTariff — the T&T HS Tariff database / lookup page.
 *
 * Issue #6: a dedicated page where the broker can browse and search the
 * full CET 2024 tariff (5,810 HS codes) plus any user overrides. The same
 * MaintainTariffDialog used elsewhere is wired here, so any edit made on
 * this page (duty %, exemption class, description) persists as a user
 * override and is immediately reflected in the table.
 *
 * Lookup modes:
 *   - free-text search (matches THN or description substring)
 *   - chapter filter (1–99)
 *   - "overrides only" toggle (show just the broker's customisations)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { TopNav } from "@/components/TopNav";
import { browseTariff } from "@/services/courierApi";
import { C } from "@/components/courier/tokens";
import { MaintainTariffDialog } from "@/components/courier/MaintainTariffDialog";

interface TariffEntry {
  code: string;
  description: string;
  dutyPct: number;
  vatPct: number;
  surchargePct: number;
  dutyRate: string;
  notes: string;
  thn: string;
  isExempt: boolean;
  chapter: number;
  unit: string | null;
  is_override: boolean;
}

const PAGE_SIZE = 50;

export default function CourierTariff() {
  const [entries, setEntries] = useState<TariffEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState<string>("");
  const [overridesOnly, setOverridesOnly] = useState(false);

  // THN currently open in the maintain dialog (null = closed)
  const [editThn, setEditThn] = useState<string | null>(null);

  // Debounce the free-text search so we don't fire a request per keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(
    async (opts: { q: string; chap: string; off: number }) => {
      setLoading(true);
      try {
        const res = await browseTariff({
          q: opts.q || undefined,
          chapter: opts.chap ? Number(opts.chap) : undefined,
          limit: PAGE_SIZE,
          offset: opts.off,
        });
        setEntries(res.items as TariffEntry[]);
        setTotal(res.total);
      } catch (e: any) {
        toast.error(e.message || "Failed to load tariff");
        setEntries([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Initial + reactive load (search / chapter / page change)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPage({ q: query, chap: chapter, off: offset });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, chapter, offset, fetchPage]);

  // Reset to first page whenever the filters change
  useEffect(() => {
    setOffset(0);
  }, [query, chapter]);

  const shown = overridesOnly
    ? entries.filter((e) => e.is_override)
    : entries;

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  const refreshAfterSave = useCallback(async () => {
    await fetchPage({ q: query, chap: chapter, off: offset });
  }, [fetchPage, query, chapter, offset]);

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.08em",
    color: C.inkLight,
    fontWeight: 700,
    textTransform: "uppercase",
    borderBottom: `1px solid ${C.paperBorder}`,
  };
  const tdStyle: React.CSSProperties = {
    padding: "9px 12px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: C.inkMid,
    borderBottom: `1px solid ${C.paperBorder}`,
    verticalAlign: "middle",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.paperAlt }}>
      <TopNav />

      {/* Header strip */}
      <div style={{
        background: C.voidMid, borderBottom: `1px solid ${C.voidBorder}`,
        padding: "28px 0",
      }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 28px" }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            letterSpacing: "0.16em", color: C.amber, textTransform: "uppercase",
            marginBottom: 8,
          }}>
            Stallion · Courier Module
          </div>
          <div style={{
            fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 600,
            color: C.paper, lineHeight: 1.1,
          }}>
            T&amp;T HS Tariff Database
          </div>
          <div style={{
            fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ghost,
            marginTop: 8, maxWidth: 640,
          }}>
            Browse and search the CET 2024 tariff. Click any row to maintain
            its duty rate or exemption — your overrides persist and are used
            for all future classification.
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 28px" }}>
        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end",
          marginBottom: 16,
        }}>
          <div style={{ flex: "1 1 320px" }}>
            <label style={{
              display: "block", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: "0.08em", color: C.inkLight,
              textTransform: "uppercase", fontWeight: 600, marginBottom: 4,
            }}>
              Search (THN or description)
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. 61046900, phone case, plastics…"
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                padding: "9px 12px", border: `1px solid ${C.paperBorder}`,
                borderRadius: 4, background: "#fff", color: C.ink,
                outline: "none",
              }}
            />
          </div>
          <div style={{ width: 130 }}>
            <label style={{
              display: "block", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: "0.08em", color: C.inkLight,
              textTransform: "uppercase", fontWeight: 600, marginBottom: 4,
            }}>
              Chapter
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              placeholder="1–99"
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                padding: "9px 12px", border: `1px solid ${C.paperBorder}`,
                borderRadius: 4, background: "#fff", color: C.ink,
                outline: "none",
              }}
            />
          </div>
          <button
            onClick={() => setOverridesOnly((v) => !v)}
            style={{
              padding: "9px 16px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
              borderRadius: 4, cursor: "pointer", fontWeight: 600,
              background: overridesOnly ? C.amber : "transparent",
              border: `1px solid ${overridesOnly ? C.amber : C.paperBorder}`,
              color: overridesOnly ? "#fff" : C.inkMid,
            }}
          >
            {overridesOnly ? "✓ Overrides Only" : "Overrides Only"}
          </button>
          {(query || chapter || overridesOnly) && (
            <button
              onClick={() => {
                setQuery(""); setChapter(""); setOverridesOnly(false);
              }}
              style={{
                padding: "9px 16px", fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, letterSpacing: "0.06em",
                textTransform: "uppercase", borderRadius: 4, cursor: "pointer",
                background: "transparent", border: `1px solid ${C.paperBorder}`,
                color: C.inkLight,
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Result count + paging */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 10,
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: C.inkLight,
          }}>
            {loading ? "Loading…"
              : total === 0 ? "No matching tariff entries"
              : `Showing ${pageStart}–${pageEnd} of ${total.toLocaleString()}`}
            {overridesOnly && !loading
              && ` · ${shown.length} override(s) on this page`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              style={{
                padding: "6px 14px", fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, borderRadius: 4,
                cursor: offset === 0 ? "not-allowed" : "pointer",
                background: "transparent",
                border: `1px solid ${C.paperBorder}`,
                color: offset === 0 ? C.paperMid : C.inkMid,
                opacity: offset === 0 ? 0.5 : 1,
              }}
            >
              ← Prev
            </button>
            <button
              disabled={pageEnd >= total || loading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              style={{
                padding: "6px 14px", fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, borderRadius: 4,
                cursor: pageEnd >= total ? "not-allowed" : "pointer",
                background: "transparent",
                border: `1px solid ${C.paperBorder}`,
                color: pageEnd >= total ? C.paperMid : C.inkMid,
                opacity: pageEnd >= total ? 0.5 : 1,
              }}
            >
              Next →
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{
          background: C.paper, border: `1px solid ${C.paperBorder}`,
          borderRadius: 4, overflow: "hidden",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%", borderCollapse: "collapse", minWidth: 820,
            }}>
              <thead>
                <tr style={{ background: C.paperAlt }}>
                  <th style={thStyle}>THN</th>
                  <th style={thStyle}>Code</th>
                  <th style={thStyle}>Description</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Duty %</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>VAT %</th>
                  <th style={thStyle}>Class</th>
                  <th style={thStyle}>Ch.</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8} style={{
                      ...tdStyle, textAlign: "center", padding: 32,
                      fontFamily: "'Fraunces', serif", fontStyle: "italic",
                      color: C.inkLight,
                    }}>
                      {overridesOnly
                        ? "No overrides on this page — try clearing the filter."
                        : "No tariff entries match your search."}
                    </td>
                  </tr>
                ) : (
                  shown.map((e) => {
                    const cls = e.isExempt
                      ? (e.dutyPct === 0 ? "EXEMPT" : "—")
                      : `${e.dutyPct}%`;
                    return (
                      <tr
                        key={e.thn}
                        onClick={() => setEditThn(e.thn)}
                        style={{
                          cursor: "pointer",
                          background: e.is_override ? "#FFF7E8" : "transparent",
                        }}
                        onMouseEnter={(ev) => {
                          (ev.currentTarget as HTMLElement).style.background =
                            C.paperAlt;
                        }}
                        onMouseLeave={(ev) => {
                          (ev.currentTarget as HTMLElement).style.background =
                            e.is_override ? "#FFF7E8" : "transparent";
                        }}
                      >
                        <td style={{ ...tdStyle, fontWeight: 600, color: C.ink }}>
                          {e.thn}
                        </td>
                        <td style={tdStyle}>{e.code}</td>
                        <td style={{
                          ...tdStyle, fontFamily: "'Fraunces', serif",
                          fontSize: 12, maxWidth: 420,
                        }}>
                          {e.description}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {e.dutyPct}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {e.vatPct}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10, fontWeight: 700,
                            padding: "2px 8px", borderRadius: 3,
                            background: e.isExempt ? "#E8F3EC" : C.amberLight,
                            color: e.isExempt ? "#2E7D4F" : C.amber,
                          }}>
                            {cls}
                          </span>
                        </td>
                        <td style={tdStyle}>{e.chapter}</td>
                        <td style={tdStyle}>
                          {e.is_override && (
                            <span style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 9, fontWeight: 700,
                              padding: "2px 6px", borderRadius: 3,
                              background: C.amber, color: "#fff",
                              letterSpacing: "0.06em",
                            }}>
                              OVERRIDE
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editThn && (
        <MaintainTariffDialog
          thn={editThn}
          onClose={() => setEditThn(null)}
          onSaved={refreshAfterSave}
        />
      )}
    </div>
  );
}
