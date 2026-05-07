import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import {
  addCourierLine,
  courierHazmatUrl,
  courierWorksheetUrl,
  deleteCourierLine,
  getCourierManifest,
  updateCourierLine,
} from "@/services/stallionApi";

const columns = [
  "#",
  "HAWB",
  "Shipper",
  "Importer",
  "Description",
  "Pkgs",
  "Weight",
  "THN",
  "Rate",
  "Cost USD",
  "Freight",
  "CIF TTD",
  "Duty",
  "OPT",
  "VAT",
  "Total",
  "Actions",
];

const editableFields = [
  "hawb",
  "shipper",
  "importer",
  "description",
  "packages",
  "weight_kg",
  "thn",
  "cost_usd",
  "freight_usd",
] as const;

type EditableField = (typeof editableFields)[number];

type GridPos = { row: number; col: number };

export default function CourierWorkbench() {
  const { id = "" } = useParams();
  const [manifest, setManifest] = useState<any>(null);
  const [editing, setEditing] = useState<{ lineNo: number; field: EditableField } | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [activeCell, setActiveCell] = useState<GridPos | null>(null);

  async function load() {
    const m = await getCourierManifest(id);
    setManifest(m);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function addLine() {
    const description = prompt("Description") || "";
    if (!description) return;
    const thn = prompt("THN (optional)") || undefined;
    const cost_usd = Number(prompt("Cost USD", "0") || "0");
    await addCourierLine(id, { description, thn, cost_usd, auto_classify: !thn });
    await load();
  }

  const lines = useMemo(() => manifest?.lines || [], [manifest]);

  function beginInlineEdit(r: any, field: EditableField) {
    setEditing({ lineNo: r.line_no, field });
    const v = r?.[field];
    setDraft(v === null || v === undefined ? "" : String(v));
  }

  async function commitInlineEdit(r: any, field: EditableField) {
    const payload: Record<string, unknown> = {};
    if (["packages", "weight_kg", "cost_usd", "freight_usd"].includes(field)) {
      payload[field] = draft.trim() === "" ? 0 : Number(draft);
    } else {
      payload[field] = draft;
    }

    await updateCourierLine(id, r.line_no, payload);
    setEditing(null);
    setDraft("");
    await load();
  }

  async function removeLine(r: any) {
    if (!confirm(`Delete line ${r.line_no}?`)) return;
    await deleteCourierLine(id, r.line_no);
    await load();
  }

  function renderEditableCell(r: any, field: EditableField, style: CSSProperties = cell, rowIdx = 0, colIdx = 0) {
    const isEditing = editing?.lineNo === r.line_no && editing?.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitInlineEdit(r, field)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitInlineEdit(r, field);
            if (e.key === "Escape") {
              setEditing(null);
              setDraft("");
            }
          }}
          style={{ width: "100%", background: "#0f141d", color: "#fff", border: "1px solid #4b5e7b", padding: "4px" }}
        />
      );
    }
    const value = r?.[field] ?? "";
    const isActive = activeCell?.row === rowIdx && activeCell?.col === colIdx;
    return (
      <div
        tabIndex={0}
        onFocus={() => setActiveCell({ row: rowIdx, col: colIdx })}
        onClick={() => beginInlineEdit(r, field)}
        onKeyDown={(e) => {
          if (e.key === "Enter") beginInlineEdit(r, field);
          if (e.key === "Tab") return;
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            const delta = e.key === "ArrowLeft" ? [-1, 0] : e.key === "ArrowRight" ? [1, 0] : e.key === "ArrowUp" ? [0, -1] : [0, 1];
            setActiveCell({ row: Math.max(0, rowIdx + delta[1]), col: Math.max(0, colIdx + delta[0]) });
          }
        }}
        style={{ cursor: "text", minHeight: 18, outline: isActive ? "1px solid #4b5e7b" : "none" }}
        title="Click to edit"
      >
        {String(value)}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f1115", color: "#eaeef5" }}>
      <TopNav
        rightSlot={
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addLine}>+ Add Line</button>
            <a href={courierWorksheetUrl(id)} target="_blank">
              <button>Worksheet v3</button>
            </a>
            <a href={courierHazmatUrl(id)} target="_blank">
              <button>Hazmat</button>
            </a>
          </div>
        }
      />

      <div style={{ padding: 14 }}>
        <h3 style={{ marginTop: 0 }}>Courier Workbench — {manifest?.manifest_no || id}</h3>
        <div style={{ marginBottom: 8, color: "#9eb0c8", fontSize: 12 }}>
          Spreadsheet mode: click a cell to edit, Enter to save, Esc to cancel.
        </div>

        <div style={{ overflow: "auto", border: "1px solid #2a3340", background: "#151922" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 1750, width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    style={{
                      position: "sticky",
                      top: 0,
                      background: "#1b2230",
                      border: "1px solid #2f3b4f",
                      padding: "8px 6px",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((r: any, idx: number) => (
                <tr key={idx}>
                  <td style={cell}>{r.line_no ?? idx + 1}</td>
                  <td style={cell}>{renderEditableCell(r, "hawb", cell, idx, 0)}</td>
                  <td style={cell}>{renderEditableCell(r, "shipper", cell, idx, 1)}</td>
                  <td style={cell}>{renderEditableCell(r, "importer", cell, idx, 2)}</td>
                  <td style={cell}>{renderEditableCell(r, "description", cell, idx, 3)}</td>
                  <td style={cell}>{renderEditableCell(r, "packages", cell, idx, 4)}</td>
                  <td style={cell}>{renderEditableCell(r, "weight_kg", cell, idx, 5)}</td>
                  <td style={cell}>{renderEditableCell(r, "thn", cell, idx, 6)}</td>
                  <td style={cell}>{r.duty_rate ?? ""}</td>
                  <td style={cell}>{renderEditableCell(r, "cost_usd", num, idx, 7)}</td>
                  <td style={cell}>{renderEditableCell(r, "freight_usd", num, idx, 8)}</td>
                  <td style={num}>{r.customs_value_ttd ?? r.cif_ttd ?? ""}</td>
                  <td style={num}>{r.duty ?? ""}</td>
                  <td style={num}>{r.opt ?? ""}</td>
                  <td style={num}>{r.vat ?? ""}</td>
                  <td style={num}>{r.total_taxes ?? ""}</td>
                  <td style={cell}>
                    <button onClick={() => removeLine(r)}>Del</button>
                  </td>
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
