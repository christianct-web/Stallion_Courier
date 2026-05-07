import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import { addCourierLine, courierHazmatUrl, courierWorksheetUrl, deleteCourierLine, getCourierManifest, updateCourierLine } from "@/services/stallionApi";

const columns = ["#","HAWB","Shipper","Importer","Description","Pkgs","Weight","THN","Rate","Cost USD","Freight","CIF TTD","Duty","OPT","VAT","Total","Actions"];

export default function CourierWorkbench() {
  const { id = "" } = useParams();
  const [manifest, setManifest] = useState<any>(null);

  async function load() {
    const m = await getCourierManifest(id);
    setManifest(m);
  }

  useEffect(() => { if (id) load(); }, [id]);

  async function addLine() {
    const description = prompt("Description") || "";
    if (!description) return;
    const thn = prompt("THN (optional)") || undefined;
    const cost_usd = Number(prompt("Cost USD", "0") || "0");
    await addCourierLine(id, { description, thn, cost_usd, auto_classify: !thn });
    await load();
  }

  const lines = useMemo(() => manifest?.lines || [], [manifest]);

  async function quickEdit(r: any) {
    const description = prompt("Description", r.description || "") ?? r.description;
    const thn = prompt("THN", r.thn || "") ?? r.thn;
    const cost_usd = Number(prompt("Cost USD", String(r.cost_usd ?? 0)) || r.cost_usd || 0);
    await updateCourierLine(id, r.line_no, { description, thn, cost_usd });
    await load();
  }

  async function removeLine(r: any) {
    if (!confirm(`Delete line ${r.line_no}?`)) return;
    await deleteCourierLine(id, r.line_no);
    await load();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f1115", color: "#eaeef5" }}>
      <TopNav rightSlot={<div style={{display:'flex',gap:8}}><button onClick={addLine}>+ Add Line</button><a href={courierWorksheetUrl(id)} target="_blank"><button>Worksheet v3</button></a><a href={courierHazmatUrl(id)} target="_blank"><button>Hazmat</button></a></div>} />
      <div style={{ padding: 14 }}>
        <h3 style={{ marginTop: 0 }}>Courier Workbench — {manifest?.manifest_no || id}</h3>
        <div style={{ overflow: "auto", border: "1px solid #2a3340", background: "#151922" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1600, width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} style={{ position: "sticky", top: 0, background: "#1b2230", border: "1px solid #2f3b4f", padding: "8px 6px", textAlign: "left", whiteSpace: "nowrap" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((r: any, idx: number) => (
                <tr key={idx}>
                  <td style={cell}>{r.line_no ?? idx + 1}</td>
                  <td style={cell}>{r.hawb || ""}</td>
                  <td style={cell}>{r.shipper || ""}</td>
                  <td style={cell}>{r.importer || ""}</td>
                  <td style={cell}>{r.description || ""}</td>
                  <td style={cell}>{r.packages ?? ""}</td>
                  <td style={cell}>{r.weight_kg ?? ""}</td>
                  <td style={cell}>{r.thn || ""}</td>
                  <td style={cell}>{r.duty_rate ?? ""}</td>
                  <td style={cell}>{r.cost_usd ?? ""}</td>
                  <td style={cell}>{r.freight_usd ?? 0}</td>
                  <td style={num}>{r.customs_value_ttd ?? r.cif_ttd ?? ""}</td>
                  <td style={num}>{r.duty ?? ""}</td>
                  <td style={num}>{r.opt ?? ""}</td>
                  <td style={num}>{r.vat ?? ""}</td>
                  <td style={num}>{r.total_taxes ?? ""}</td>
                  <td style={cell}><button onClick={() => quickEdit(r)}>Edit</button> <button onClick={() => removeLine(r)}>Del</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const cell: CSSProperties = { border: "1px solid #273241", padding: "6px", whiteSpace: "nowrap" };
const num: CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };
