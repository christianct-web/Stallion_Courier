/**
 * StallionSheetList.tsx — list of declaration sheets.
 * Mirrors CourierManifests. Lives at /stallion/sheets inside StallionShell
 * (which provides TopNav). Shows status, totals, and last-updated time.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listSheets, createSheet, deleteSheet, Sheet } from "@/services/sheetApi";

const C = {
  paper: "#F6F3EE", paperBorder: "#E2DDD6", paperAlt: "#EFECE6",
  ink: "#18150F", inkMid: "#3D3830", inkLight: "#6B6560", gold: "#B8860B",
};
const MONO = "'JetBrains Mono',monospace";

const STATUS_COLOR: Record<string, string> = {
  draft: C.inkLight, pending: "#B8860B", correction: "#B02020",
  approved: "#1A5E3A", submitted: "#2A4D8F", receipted: "#5A3A8A",
};

function relTime(iso?: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "—";
  const diff = Date.now() - then;
  const m = Math.round(diff / 60000), h = Math.round(diff / 3600000), d = Math.round(diff / 86400000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function StallionSheetList() {
  const nav = useNavigate();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const load = () => listSheets().then(setSheets);
  useEffect(() => { load(); }, []);

  const create = async () => {
    const s = await createSheet({});
    nav(`/stallion/sheet/${s.id}`);
  };
  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this sheet?")) return;
    await deleteSheet(id); load();
  };

  // Sort: drafts first, then by most recently updated.
  const sorted = [...sheets].sort((a, b) => {
    if (a.status === "draft" && b.status !== "draft") return -1;
    if (b.status === "draft" && a.status !== "draft") return 1;
    return (b.updated_at || "").localeCompare(a.updated_at || "");
  });

  return (
    <div style={{ background: C.paper, minHeight: "100%", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h2 style={{ fontFamily: MONO, fontSize: 18, color: C.ink, margin: 0 }}>Declaration Sheets</h2>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkLight, marginTop: 4 }}>
            {sheets.length} sheet{sheets.length === 1 ? "" : "s"}
          </div>
        </div>
        <button onClick={create} style={{
          fontFamily: MONO, fontSize: 12, padding: "10px 18px", cursor: "pointer",
          border: "none", borderRadius: 4, background: C.ink, color: "#fff",
        }}>+ New Sheet</button>
      </div>
      <div style={{ background: "#fff", border: `1px solid ${C.paperBorder}`, borderRadius: 6 }}>
        {sorted.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.inkLight }}>
            No sheets yet. Create one to begin.
          </div>
        )}
        {sorted.map(s => (
          <div key={s.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 18px", borderBottom: `1px solid ${C.paperAlt}`, cursor: "pointer",
          }} onClick={() => nav(`/stallion/sheet/${s.id}`)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase",
                padding: "3px 8px", borderRadius: 3, color: "#fff", flexShrink: 0,
                background: STATUS_COLOR[s.status] || C.inkLight,
              }}>{s.status}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 13, color: C.ink, fontWeight: 700,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.reference || "(untitled)"}{s.consignee ? ` · ${s.consignee}` : ""}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkLight }}>
                  {s.lines?.length || 0} line{(s.lines?.length || 0) === 1 ? "" : "s"} ·
                  {" "}TTD {(s.totals?.total_payable ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ·
                  {" "}updated {relTime(s.updated_at)}</div>
              </div>
            </div>
            <button onClick={e => remove(s.id, e)} title="Delete sheet" style={{
              border: "none", background: "none", cursor: "pointer", color: "#B02020", fontSize: 16, flexShrink: 0,
            }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
