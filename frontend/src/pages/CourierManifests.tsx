import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import { createCourierManifest, listCourierManifests } from "@/services/stallionApi";

export default function CourierManifests() {
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await listCourierManifests();
      setItems(res.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createNew() {
    const manifest_no = prompt("Manifest number (e.g. 106-31245034)") || "";
    if (!manifest_no.trim()) return;
    const arrival_date = prompt("Arrival date (YYYY-MM-DD)") || "";
    const exch_rate = Number(prompt("Exchange rate", "6.78") || "6.78");
    const created = await createCourierManifest({ manifest_no, arrival_date, exch_rate });
    nav(`/stallion/courier/${created.id}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f1115", color: "#eaeef5" }}>
      <TopNav />
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Courier Manifests</h2>
          <button onClick={createNew}>+ New Manifest</button>
        </div>
        {loading ? <div>Loading...</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#171b22" }}>
            <thead>
              <tr>
                {['Manifest','Arrival','Rate','Status','Lines'].map(h => <th key={h} style={{border:'1px solid #2a3340',padding:8,textAlign:'left'}}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} style={{ cursor: "pointer" }} onClick={() => nav(`/stallion/courier/${m.id}`)}>
                  <td style={{border:'1px solid #2a3340',padding:8}}>{m.manifest_no}</td>
                  <td style={{border:'1px solid #2a3340',padding:8}}>{m.arrival_date || '-'}</td>
                  <td style={{border:'1px solid #2a3340',padding:8}}>{m.exch_rate ?? '-'}</td>
                  <td style={{border:'1px solid #2a3340',padding:8}}>{m.status || 'draft'}</td>
                  <td style={{border:'1px solid #2a3340',padding:8}}>{(m.lines || []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
