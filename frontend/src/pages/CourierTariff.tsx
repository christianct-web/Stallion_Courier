/**
 * CourierTariff — the T&T HS Tariff database / lookup tool.
 *
 * Redesigned from a flat 5,800-row dump into a real working tool:
 *   - Browse-by-category (21 HS sections -> chapters) sidebar
 *   - Ranked search (THN/code/description, not just substring)
 *   - Duty-band filter chips (Free / Low / Mid / High)
 *   - Overrides-only view with count badges
 *   - Rich detail panel: HS breadcrumb, duty/VAT/OPT, live CIF calculator,
 *     override status, one-click maintain
 *   - Keyboard: "/" focuses search, Esc closes detail
 *
 * Works with both the legacy OCR tariff and the new TTBizLink dataset
 * (extra fields like optPct / restriction render when present).
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  browseTariff, tariffChapters,
  TariffEntry, TariffSection,
} from "@/services/courierApi";
import { C } from "@/components/courier/tokens";
import { MaintainTariffDialog } from "@/components/courier/MaintainTariffDialog";

const PAGE_SIZE = 40;

type Band = "free" | "low" | "mid" | "high";

function dutyBand(e: TariffEntry): Band {
  if (e.isExempt || (e.dutyPct || 0) === 0) return "free";
  const d = e.dutyPct || 0;
  if (d <= 15) return "low";
  if (d <= 25) return "mid";
  return "high";
}

const BAND_STYLE: Record<Band, { bg: string; fg: string; label: string }> = {
  free: { bg: "#E3F2E8", fg: "#2E7D4F", label: "FREE" },
  low: { bg: "#FFF3DD", fg: "#B07A1B", label: "LOW" },
  mid: { bg: "#FDEBD8", fg: "#C65911", label: "MID" },
  high: { bg: "#FBE2E0", fg: "#C0392B", label: "HIGH" },
};

function pagerStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 14px", fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11, borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    background: "transparent", border: `1px solid ${C.paperBorder}`,
    color: disabled ? C.paperMid : C.inkMid,
    opacity: disabled ? 0.5 : 1,
  };
}

function tdMono(color: string, weight = 400): React.CSSProperties {
  return {
    padding: "9px 12px", fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12, color, fontWeight: weight,
  };
}

export default function CourierTariff() {
  const isMobile = useIsMobile();
  const [entries, setEntries] = useState<TariffEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState<number | null>(null);
  const [band, setBand] = useState<Band | null>(null);
  const [overridesOnly, setOverridesOnly] = useState(false);

  const [sections, setSections] = useState<TariffSection[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const [selected, setSelected] = useState<TariffEntry | null>(null);
  const [editThn, setEditThn] = useState<string | null>(null);
  const [cifInput, setCifInput] = useState("");

  const searchRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tariffChapters()
      .then((r) => setSections(r.sections))
      .catch(() => {});
  }, []);

  const fetchPage = useCallback(
    async (o: number) => {
      setLoading(true);
      try {
        const res = await browseTariff({
          q: query || undefined,
          chapter: chapter ?? undefined,
          duty_band: band ?? undefined,
          overrides_only: overridesOnly || undefined,
          limit: PAGE_SIZE,
          offset: o,
        });
        setEntries(res.items);
        setTotal(res.total);
      } catch (e: any) {
        toast.error(e.message || "Failed to load tariff");
        setEntries([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [query, chapter, band, overridesOnly],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPage(offset), 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchPage, offset]);

  useEffect(() => {
    setOffset(0);
  }, [query, chapter, band, overridesOnly]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  const refreshAfterSave = useCallback(async () => {
    await fetchPage(offset);
    const r = await tariffChapters().catch(() => null);
    if (r) setSections(r.sections);
  }, [fetchPage, offset]);

  const totalOverrides = useMemo(
    () => sections.reduce(
      (s, sec) => s + sec.chapters.reduce((a, c) => a + c.overrides, 0), 0),
    [sections],
  );

  const clearFilters = () => {
    setQuery(""); setChapter(null); setBand(null); setOverridesOnly(false);
  };

  const calc = useMemo(() => {
    if (!selected) return null;
    const cif = parseFloat(cifInput);
    if (!(cif > 0)) return null;
    const dutyRate = selected.isExempt ? 0 : (selected.dutyPct || 0) / 100;
    const duty = cif * dutyRate;
    const opt = selected.isExempt ? 0 : cif * ((selected.optPct ?? 0) / 100);
    const vat = selected.isExempt
      ? 0 : (cif + duty + opt) * ((selected.vatPct ?? 12.5) / 100);
    return { cif, duty, opt, vat, total: duty + opt + vat };
  }, [selected, cifInput]);

  const eyebrowStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    letterSpacing: "0.1em", color: C.inkLight, textTransform: "uppercase",
    fontWeight: 700,
  };

  return (
    <div style={{ minHeight: "100vh", background: C.paperAlt }}>

      <div style={{
        background: C.voidMid, borderBottom: `1px solid ${C.voidBorder}`,
        padding: "26px 0",
      }}>
        <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 28px" }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            letterSpacing: "0.16em", color: C.amber, textTransform: "uppercase",
            marginBottom: 8,
          }}>
            Stallion · Courier Module
          </div>
          <div style={{
            display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap",
          }}>
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 600,
              color: C.paper, lineHeight: 1.1,
            }}>
              T&amp;T HS Tariff Database
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: C.ghost,
            }}>
              {total.toLocaleString()} codes
              {totalOverrides > 0 && (
                <span style={{ color: C.amber }}>
                  {" · "}{totalOverrides} override{totalOverrides === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
          <div style={{
            fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ghost,
            marginTop: 8, maxWidth: 680,
          }}>
            Search by code or description, browse by category, or filter by
            duty band. Click any code for the full breakdown and a live duty
            calculator. Press <kbd style={{
              background: C.voidBorder, padding: "1px 5px", borderRadius: 3,
              fontFamily: "monospace",
            }}>/</kbd> to search.
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: 1500, margin: "0 auto", padding: "20px 28px",
        display: "grid", gridTemplateColumns: "248px minmax(0,1fr)", gap: 20,
      }}>
        {/* Category browser */}
        <div style={{
          background: C.paper, border: `1px solid ${C.paperBorder}`,
          borderRadius: 6, padding: 14, height: "fit-content",
          position: "sticky", top: 16, maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
        }}>
          <div style={{ ...eyebrowStyle, marginBottom: 10 }}>Browse</div>
          <button
            onClick={() => { setChapter(null); setExpandedSection(null); }}
            style={{
              width: "100%", textAlign: "left", cursor: "pointer",
              background: chapter === null ? C.amberLight : "transparent",
              border: "none", borderRadius: 4, padding: "7px 8px",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
              color: chapter === null ? C.amber : C.inkMid,
              fontWeight: chapter === null ? 700 : 400, marginBottom: 4,
            }}
          >
            All chapters
          </button>
          {sections.map((sec) => {
            const open = expandedSection === sec.section;
            return (
              <div key={sec.section} style={{ marginBottom: 2 }}>
                <button
                  onClick={() => setExpandedSection(open ? null : sec.section)}
                  style={{
                    width: "100%", textAlign: "left", cursor: "pointer",
                    background: "transparent", border: "none",
                    borderRadius: 4, padding: "6px 8px",
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", gap: 6,
                  }}
                >
                  <span style={{
                    fontFamily: "'Fraunces', serif", fontSize: 12.5,
                    color: C.ink, fontWeight: open ? 700 : 500,
                  }}>
                    {sec.title}
                  </span>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: C.inkLight,
                  }}>
                    {open ? "−" : "+"}
                  </span>
                </button>
                {open && (
                  <div style={{ paddingLeft: 6, marginBottom: 6 }}>
                    {sec.chapters.map((ch) => (
                      <button
                        key={ch.chapter}
                        onClick={() => {
                          setChapter(ch.chapter);
                          setQuery(""); setBand(null);
                          setOverridesOnly(false);
                        }}
                        style={{
                          width: "100%", textAlign: "left", cursor: "pointer",
                          background: chapter === ch.chapter
                            ? C.amberLight : "transparent",
                          border: "none", borderRadius: 4,
                          padding: "5px 8px",
                          display: "flex", justifyContent: "space-between",
                          alignItems: "center", gap: 6,
                        }}
                      >
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11,
                          color: chapter === ch.chapter ? C.amber : C.inkMid,
                          fontWeight: chapter === ch.chapter ? 700 : 400,
                        }}>
                          {String(ch.chapter).padStart(2, "0")} {ch.title}
                        </span>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 9, color: C.inkLight, flexShrink: 0,
                        }}>
                          {ch.count}
                          {ch.overrides > 0 && (
                            <span style={{ color: C.amber }}> ·{ch.overrides}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Main column */}
        <div>
          <div style={{
            display: "flex", gap: 10, flexWrap: "wrap",
            alignItems: "center", marginBottom: 14,
          }}>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code or description — e.g. 6104, handbag, phone case"
              style={{
                flex: "1 1 360px",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                padding: "10px 13px", border: `1px solid ${C.paperBorder}`,
                borderRadius: 5, background: "#fff", color: C.ink,
                outline: "none",
              }}
            />
            {(["free", "low", "mid", "high"] as Band[]).map((b) => {
              const active = band === b;
              const st = BAND_STYLE[b];
              return (
                <button
                  key={b}
                  onClick={() => setBand(active ? null : b)}
                  style={{
                    padding: "8px 12px",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    letterSpacing: "0.06em", borderRadius: 5,
                    cursor: "pointer", fontWeight: 700,
                    background: active ? st.fg : st.bg,
                    color: active ? "#fff" : st.fg,
                    border: `1px solid ${active ? st.fg : "transparent"}`,
                  }}
                >
                  {st.label}
                </button>
              );
            })}
            <button
              onClick={() => setOverridesOnly((v) => !v)}
              style={{
                padding: "8px 14px",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                letterSpacing: "0.06em", borderRadius: 5, cursor: "pointer",
                fontWeight: 700,
                background: overridesOnly ? C.amber : "transparent",
                color: overridesOnly ? "#fff" : C.inkMid,
                border: `1px solid ${overridesOnly ? C.amber : C.paperBorder}`,
              }}
            >
              OVERRIDES{totalOverrides > 0 ? ` (${totalOverrides})` : ""}
            </button>
            {(query || chapter !== null || band || overridesOnly) && (
              <button
                onClick={clearFilters}
                style={{
                  padding: "8px 12px",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  letterSpacing: "0.06em", borderRadius: 5, cursor: "pointer",
                  background: "transparent", color: C.inkLight,
                  border: `1px solid ${C.paperBorder}`,
                }}
              >
                CLEAR
              </button>
            )}
          </div>

          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 8,
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: C.inkLight,
            }}>
              {loading ? "Loading…"
                : total === 0 ? "No matches"
                : `${pageStart}–${pageEnd} of ${total.toLocaleString()}`}
              {chapter !== null && (
                <span> · Chapter {String(chapter).padStart(2, "0")}</span>
              )}
              {query && <span> · search “{query}”</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                style={pagerStyle(offset === 0)}
              >
                ← Prev
              </button>
              <button
                disabled={pageEnd >= total || loading}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                style={pagerStyle(pageEnd >= total)}
              >
                Next →
              </button>
            </div>
          </div>

          <div style={{
            background: C.paper, border: `1px solid ${C.paperBorder}`,
            borderRadius: 6, overflow: "hidden",
          }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%", borderCollapse: "collapse", minWidth: 720,
              }}>
                <thead>
                  <tr style={{ background: C.paperAlt }}>
                    {["THN", "Code", "Description", "Duty", "Band", ""].map(
                      (h, i) => (
                        <th key={i} style={{
                          textAlign: h === "Duty" ? "right" : "left",
                          padding: "9px 12px",
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 9, letterSpacing: "0.08em",
                          color: C.inkLight, fontWeight: 700,
                          textTransform: "uppercase",
                          borderBottom: `1px solid ${C.paperBorder}`,
                        }}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={6} style={{
                        padding: 36, textAlign: "center",
                        fontFamily: "'Fraunces', serif", fontStyle: "italic",
                        color: C.inkLight,
                      }}>
                        Nothing matches. Try a broader term or clear filters.
                      </td>
                    </tr>
                  ) : (
                    entries.map((e) => {
                      const b = dutyBand(e);
                      const st = BAND_STYLE[b];
                      const isSel = selected?.thn === e.thn;
                      return (
                        <tr
                          key={e.thn}
                          onClick={() => { setSelected(e); setCifInput(""); }}
                          style={{
                            cursor: "pointer",
                            background: isSel ? C.amberLight
                              : e.is_override ? "#FFF7E8" : "transparent",
                            borderBottom: `1px solid ${C.paperBorder}`,
                          }}
                        >
                          <td style={tdMono(C.ink, 700)}>{e.thn}</td>
                          <td style={tdMono(C.inkLight)}>{e.code}</td>
                          <td style={{
                            padding: "9px 12px",
                            fontFamily: "'Fraunces', serif", fontSize: 12.5,
                            color: C.inkMid, maxWidth: 460,
                          }}>
                            {e.description || (
                              <span style={{ color: C.inkLight }}>—</span>
                            )}
                            {e.restriction && (
                              <span style={{
                                marginLeft: 8,
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 8.5, fontWeight: 700,
                                padding: "1px 5px", borderRadius: 3,
                                background: "#FBE2E0", color: "#C0392B",
                              }}>
                                RESTRICTED
                              </span>
                            )}
                          </td>
                          <td style={{
                            ...tdMono(C.inkMid), textAlign: "right",
                          }}>
                            {e.isExempt ? "0" : e.dutyPct}%
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 9, fontWeight: 700,
                              padding: "2px 7px", borderRadius: 3,
                              background: st.bg, color: st.fg,
                            }}>
                              {st.label}
                            </span>
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            {e.is_override && (
                              <span style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 8.5, fontWeight: 700,
                                padding: "2px 6px", borderRadius: 3,
                                background: C.amber, color: "#fff",
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
      </div>

      {/* Detail slide-over */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            zIndex: 90, display: "flex", justifyContent: "flex-end",
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: 440, maxWidth: "92vw", background: C.paper,
              height: "100%", overflowY: "auto",
              borderLeft: `1px solid ${C.paperBorder}`,
              boxShadow: "-12px 0 40px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{
              background: C.voidMid, color: C.paper, padding: "20px 22px",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "flex-start",
              }}>
                <div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    letterSpacing: "0.12em", color: C.amber,
                    textTransform: "uppercase", marginBottom: 6,
                  }}>
                    THN {selected.thn}
                  </div>
                  <div style={{
                    fontFamily: "'Fraunces', serif", fontSize: 18,
                    fontWeight: 600, lineHeight: 1.25,
                  }}>
                    {selected.description || "(no description)"}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    background: "transparent", border: "none",
                    color: C.ghost, fontSize: 20, cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: C.ghost, marginTop: 12, lineHeight: 1.6,
              }}>
                Ch {selected.thn.slice(0, 2)} › Heading{" "}
                {selected.thn.slice(0, 4)} › Sub {selected.thn.slice(0, 6)} ›{" "}
                <span style={{ color: C.amber }}>{selected.thn}</span>
              </div>
            </div>

            <div style={{ padding: 22 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
                marginBottom: 18,
              }}>
                {[
                  ["Duty", selected.isExempt ? "0%" : `${selected.dutyPct}%`],
                  ["VAT", `${selected.vatPct ?? 12.5}%`],
                  ...(selected.optPct != null
                    ? [["OPT", `${selected.optPct}%`]] : []),
                  ...(selected.surchargePct
                    ? [["Surcharge", `${selected.surchargePct}%`]] : []),
                  ["Status", selected.isExempt ? "EXEMPT" : "Dutiable"],
                  ["Chapter", String(selected.chapter)],
                ].map(([k, v]) => (
                  <div key={k as string} style={{
                    background: C.paperAlt, borderRadius: 5, padding: "10px 12px",
                  }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      letterSpacing: "0.08em", color: C.inkLight,
                      textTransform: "uppercase", marginBottom: 3,
                    }}>
                      {k as string}
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 15,
                      color: C.ink, fontWeight: 700,
                    }}>
                      {v as string}
                    </div>
                  </div>
                ))}
              </div>

              {selected.restriction && (
                <div style={{
                  background: "#FBE2E0", border: "1px solid #E8B5B0",
                  borderRadius: 5, padding: "10px 12px", marginBottom: 18,
                  fontFamily: "'Fraunces', serif", fontSize: 12,
                  color: "#A03224",
                }}>
                  <strong>Restriction:</strong> {selected.restriction}
                </div>
              )}

              <div style={{ marginBottom: 18 }}>
                <div style={{ ...eyebrowStyle, marginBottom: 8 }}>
                  Duty calculator
                </div>
                <input
                  value={cifInput}
                  onChange={(e) => setCifInput(e.target.value)}
                  type="number"
                  placeholder="CIF value (TTD)"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                    padding: "9px 12px", border: `1px solid ${C.paperBorder}`,
                    borderRadius: 5, background: "#fff", color: C.ink,
                    outline: "none",
                  }}
                />
                {calc && (
                  <div style={{
                    marginTop: 10, background: C.paperAlt, borderRadius: 5,
                    padding: "12px 14px",
                  }}>
                    {[
                      ["CIF", calc.cif],
                      ["Duty", calc.duty],
                      ["OPT", calc.opt],
                      ["VAT", calc.vat],
                    ].map(([k, v]) => (
                      <div key={k as string} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "3px 0",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12, color: C.inkMid,
                      }}>
                        <span>{k as string}</span>
                        <span>{(v as number).toFixed(2)}</span>
                      </div>
                    ))}
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      borderTop: `1px solid ${C.paperBorder}`,
                      marginTop: 6, paddingTop: 8,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 14, color: C.ink, fontWeight: 700,
                    }}>
                      <span>Total taxes</span>
                      <span>{calc.total.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={{
                background: selected.is_override ? "#FFF7E8" : "transparent",
                border: `1px solid ${selected.is_override ? C.amber : C.paperBorder}`,
                borderRadius: 5, padding: "12px 14px", marginBottom: 16,
              }}>
                <div style={{
                  fontFamily: "'Fraunces', serif", fontSize: 12,
                  color: C.inkMid, marginBottom: 10,
                }}>
                  {selected.is_override
                    ? "This entry has a broker override applied — it differs from the base CET and is used for all classification."
                    : "Base CET 2024 entry. Apply an override to change the duty rate or exemption for this code."}
                </div>
                <button
                  onClick={() => setEditThn(selected.thn)}
                  style={{
                    width: "100%", padding: "10px",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    background: C.amber, color: "#fff",
                    border: `1px solid ${C.amber}`, borderRadius: 5,
                    cursor: "pointer", fontWeight: 700,
                  }}
                >
                  {selected.is_override ? "Edit override" : "Maintain this THN"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editThn && (
        <MaintainTariffDialog
          thn={editThn}
          onClose={() => setEditThn(null)}
          onSaved={async () => {
            await refreshAfterSave();
            if (selected) {
              const r = await browseTariff({ q: selected.thn, limit: 1 })
                .catch(() => null);
              if (r && r.items[0]) setSelected(r.items[0]);
            }
          }}
        />
      )}
    </div>
  );
}
