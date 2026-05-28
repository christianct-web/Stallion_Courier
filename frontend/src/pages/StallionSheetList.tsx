/**
 * StallionSheetList.tsx — thin list of declaration sheets.
 * Mirrors CourierManifests: shows existing sheets, opens one, or creates a new
 * blank sheet. Lives at /stallion/sheets, rendered inside the BrokerReview shell.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listSheets, createSheet, deleteSheet, Sheet } from "@/services/sheetApi";

const C = {
  paper: "#F6F3EE", paperBorder: "#E2DDD6", paperAlt: "#EFECE6",
  ink: "#18150F", inkLight: "#6B6560", gold: "#B8860B",
};
const MONO = "'JetBrains Mono',monospace";

export default function StallionSheetList() {
  const nav = useNavigate();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const load = () => listSheets().then(setSheets);
  useEffect(() => { load(); }, []);

  const create = async () => {
    const s = await createSheet({});
    nav(`/stallion/sheet/${s.id}`);
  };
  const remove = async (id: string) => { await deleteSheet(id); load(); };

  return (
    <div style={{ background: C.paper, minHeight: "100%", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontFamily: MONO, fontSize: 18, color: C.ink, margin: 0 }}>Declaration Sheets</h2>
        <button onClick={create} style={{
          fontFamily: MONO, fontSize: 12, padding: "10px 18px", cursor: "pointer",
          border: "none", borderRadius: 4, background: C.ink, color: "#fff",
        }}>+ New Sheet</button>
      </div>
      <div style={{ background: "#fff", border: `1px solid ${C.paperBorder}`, borderRadius: 6 }}>
        {sheets.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.inkLight }}>
            No sheets yet. Create one to begin.
          </div>
        )}
        {sheets.map(s => (
          <div key={s.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 18px", borderBottom: `1px solid ${C.paperAlt}`, cursor: "pointer",
          }} onClick={() => nav(`/stallion/sheet/${s.id}`)}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 13, color: C.ink, fontWeight: 700 }}>
                {s.reference || "(untitled)"} · {s.consignee || "—"}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkLight }}>
                {s.lines?.length || 0} lines · TTD {(s.totals?.total_payable ?? 0).toLocaleString()} · {s.status}</div>
            </div>
            <button onClick={e => { e.stopPropagation(); remove(s.id); }} style={{
              border: "none", background: "none", cursor: "pointer", color: "#B02020", fontSize: 16,
            }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
