import { useState, useEffect, useRef } from "react";
import { hsSearch, HsResult } from "@/services/stallionApi";

interface HsLookupProps {
  defaultQuery?: string;
  onSelect: (code: string, description: string, dutyRate: string, result?: HsResult) => void;
  onClose: () => void;
  /** use "dark" for void/dark panels, default is paper */
  theme?: "paper" | "dark";
}

export function HsLookup({ defaultQuery = "", onSelect, onClose, theme = "paper" }: HsLookupProps) {
  const [query,   setQuery]   = useState(defaultQuery);
  const [lastSearchQuery, setLastSearchQuery] = useState<string>("");
  const [results, setResults] = useState<HsResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  const isDark = theme === "dark";

  const colors = isDark ? {
    bg:         "#191D26",
    border:     "#2E3748",
    input:      "#111318",
    inputBorder:"#2E3748",
    text:       "#E0E4EE",
    textLight:  "#A0AABB",
    textDim:    "#6B7585",
    resultHover:"#1F2430",
    codeFg:     "#7EC8E3",
    rateBg:     "#1F3A55",
    rateFg:     "#7EC8E3",
    closeFg:    "#6B7585",
  } : {
    bg:         "#F6F3EE",
    border:     "#E2DDD6",
    input:      "#FFFFFF",
    inputBorder:"#CCC7BE",
    text:       "#18150F",
    textLight:  "#6B6560",
    textDim:    "#9C9389",
    resultHover:"#EFECE6",
    codeFg:     "#1A4A8C",
    rateBg:     "#EEF2FA",
    rateFg:     "#1A4A8C",
    closeFg:    "#9C9389",
  };

  // Auto-focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Trigger search if defaultQuery is pre-filled
  useEffect(() => {
    if (defaultQuery.trim().length >= 2) {
      runSearch(defaultQuery.trim());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanSearchQuery(raw: string): string {
    const lowered = raw.toLowerCase();
    const compact = lowered
      .replace(/[()\[\]{}]/g, " ")
      .replace(/[—–-]/g, " ")
      .replace(/\b(power|supply|vendor|model|part|number|made|usa|po)\b/g, " ")
      .replace(/\b[a-z]*\d+[a-z\d]*\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const keep = compact.split(" ").filter(Boolean).filter(tok => tok.length >= 3);

    // prefer concise domain terms for tariff lookup
    const preferred = keep.filter(tok => [
      "ethernet", "network", "transmission", "communication", "apparatus",
      "module", "switch", "router", "cable", "machine", "electrical", "electronic",
    ].includes(tok));

    const finalTokens = preferred.length ? preferred : keep;
    const cleaned = finalTokens.slice(0, 6).join(" ").trim();
    return cleaned || raw.trim();
  }

  function runSearch(q: string) {
    const cleaned = cleanSearchQuery(q);
    setLastSearchQuery(cleaned);
    setLoading(true);
    setError(null);
    hsSearch(cleaned)
      .then(r => { setResults(r); setLoading(false); })
      .catch(e => { setError(e.message ?? "Search failed"); setLoading(false); });
  }

  function handleChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => runSearch(v.trim()), 500);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && query.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      runSearch(query.trim());
    }
  }

  return (
    <div style={{
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 4,
      padding: "12px 14px",
      marginTop: 8,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, letterSpacing: "0.12em",
          color: colors.textDim, fontWeight: 700, flex: 1,
        }}>
          HS CODE SEARCH · TT TARIFF
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: colors.closeFg, padding: "0 2px",
          }}
        >
          ✕ close
        </button>
      </div>

      {/* Search input */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the goods… e.g. frozen chicken thighs"
          style={{
            flex: 1,
            fontFamily: "'Fraunces', serif",
            fontSize: 13,
            color: colors.text,
            background: colors.input,
            border: `1px solid ${colors.inputBorder}`,
            borderRadius: 3,
            padding: "7px 10px",
          }}
        />
        <button
          onClick={() => { if (query.trim().length >= 2) { if (debounceRef.current) clearTimeout(debounceRef.current); runSearch(query.trim()); }}}
          disabled={loading || query.trim().length < 2}
          style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            padding: "7px 14px",
            background: loading ? colors.border : colors.codeFg,
            color: "#fff", border: "none", borderRadius: 3,
            cursor: loading || query.trim().length < 2 ? "not-allowed" : "pointer",
            opacity: query.trim().length < 2 ? 0.4 : 1,
          }}
        >
          {loading ? "…" : "Search"}
        </button>
      </div>

      {lastSearchQuery && lastSearchQuery.toLowerCase() !== query.trim().toLowerCase() && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: colors.textDim,
          marginBottom: 8,
        }}>
          Search query used: <span style={{ color: colors.textLight }}>{lastSearchQuery}</span>
        </div>
      )}

      {/* Status / results */}
      {loading && (
        <div style={{
          fontFamily: "'Fraunces', serif", fontStyle: "italic",
          fontSize: 12, color: colors.textLight, padding: "8px 0",
        }}>
          Asking Claude for TT tariff codes…
        </div>
      )}

      {error && !loading && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: "#963A10", padding: "6px 0",
        }}>
          {error}
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => { onSelect(r.code, r.description, r.dutyRate, r); onClose(); }}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                textAlign: "left", width: "100%",
                background: "transparent", border: `1px solid ${colors.border}`,
                borderRadius: 3, padding: "9px 12px", cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = colors.resultHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              {/* HS code */}
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14, fontWeight: 700,
                color: colors.codeFg, letterSpacing: "0.04em",
                minWidth: 130, flexShrink: 0,
              }}>
                {r.code}
              </div>

              {/* Description + notes */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Fraunces', serif", fontSize: 12,
                  color: colors.text, marginBottom: 2,
                }}>
                  {r.description}
                </div>
                {r.notes && (
                  <div style={{
                    fontFamily: "'Fraunces', serif", fontStyle: "italic",
                    fontSize: 11, color: colors.textLight,
                  }}>
                    {r.notes}
                  </div>
                )}
              </div>

              {/* Duty rate badge */}
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                fontWeight: 700, color: colors.rateFg,
                background: colors.rateBg,
                padding: "2px 7px", borderRadius: 3,
                flexShrink: 0, whiteSpace: "nowrap",
              }}>
                {r.dutyRate}
              </div>
            </button>
          ))}
          <div style={{
            fontFamily: "'Fraunces', serif", fontStyle: "italic",
            fontSize: 10, color: colors.textDim,
            marginTop: 4, padding: "0 2px",
          }}>
            Click a result to apply. Always verify against the official TT tariff schedule.
          </div>
        </div>
      )}

      {!loading && !error && results.length === 0 && query.trim().length >= 2 && (
        <div style={{
          fontFamily: "'Fraunces', serif", fontStyle: "italic",
          fontSize: 12, color: colors.textLight, padding: "6px 0",
        }}>
          No results yet. Press Search or Enter to look up.
        </div>
      )}
    </div>
  );
}
