import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import { getCourierManifest, saveCourierExam } from "@/services/stallionApi";

export default function CourierExam() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [manifest, setManifest] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    const m = await getCourierManifest(id);
    setManifest(m);
    setRows(m?.officer_examination?.corrections || []);
  }

  useEffect(() => { if (id) load(); }, [id]);

  function addCorrection() {
    setRows((r) => [...r, {
      line_no: null,
      kind: "uplift",
      officer_thn: "",
      new_description: "",
      add_cost_usd: 0,
      add_duty: 0,
      add_opt: 0,
      add_vat: 0,
      add_total: 0,
      detained_seized: false,
      dep_in_tshed: false,
    }]);
  }

  function patch(i: number, key: string, val: any) {
    setRows((r) => r.map((x, idx) => idx === i ? { ...x, [key]: val } : x));
  }

  async function save() {
    await saveCourierExam(id, { corrections: rows });
    await load();
    alert("Officer exam saved");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f1115", color: "#eaeef5" }}>
      <TopNav rightSlot={<div style={{display:'flex',gap:8}}><button onClick={() => nav(`/stallion/courier/${id}`)}>← Back to Workbench</button><button onClick={addCorrection}>+ Add Correction</button><button onClick={save}>Save Exam</button></div>} />
      <div style={{ padding: 14 }}>
        <h3 style={{ marginTop: 0 }}>Courier Exam — {manifest?.manifest_no || id}</h3>
        <div style={{ overflow: "auto", border: "1px solid #2a3340", background: "#151922" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1700, width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                {['Line','Kind','Officer THN','New Description','Add Cost USD','Add Duty','Add OPT','Add VAT','Add Total','Detained','T-Shed'].map(h => (
                  <th key={h} style={{border:'1px solid #2f3b4f',padding:'8px 6px',textAlign:'left',background:'#1b2230'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={cell}><input value={r.line_no ?? ""} onChange={e => patch(i,'line_no', e.target.value === '' ? null : Number(e.target.value))} style={inp} /></td>
                  <td style={cell}><select value={r.kind || 'uplift'} onChange={e => patch(i,'kind',e.target.value)} style={inp}><option>uplift</option><option>reclass</option><option>new_line</option><option>description</option><option>seizure</option></select></td>
                  <td style={cell}><input value={r.officer_thn || ""} onChange={e => patch(i,'officer_thn',e.target.value)} style={inp}/></td>
                  <td style={cell}><input value={r.new_description || ""} onChange={e => patch(i,'new_description',e.target.value)} style={inp}/></td>
                  <td style={cell}><input value={r.add_cost_usd ?? 0} onChange={e => patch(i,'add_cost_usd',Number(e.target.value||0))} style={inp}/></td>
                  <td style={cell}><input value={r.add_duty ?? 0} onChange={e => patch(i,'add_duty',Number(e.target.value||0))} style={inp}/></td>
                  <td style={cell}><input value={r.add_opt ?? 0} onChange={e => patch(i,'add_opt',Number(e.target.value||0))} style={inp}/></td>
                  <td style={cell}><input value={r.add_vat ?? 0} onChange={e => patch(i,'add_vat',Number(e.target.value||0))} style={inp}/></td>
                  <td style={cell}><input value={r.add_total ?? 0} onChange={e => patch(i,'add_total',Number(e.target.value||0))} style={inp}/></td>
                  <td style={cell}><input type='checkbox' checked={!!r.detained_seized} onChange={e => patch(i,'detained_seized',e.target.checked)} /></td>
                  <td style={cell}><input type='checkbox' checked={!!r.dep_in_tshed} onChange={e => patch(i,'dep_in_tshed',e.target.checked)} /></td>
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
const inp: CSSProperties = { width: "100%", background: "#0f141d", color: "#fff", border: "1px solid #44556e", padding: "4px" };
