/**
 * UploadTemplateDialog - modal for uploading an express-consignment
 * Excel and creating a manifest with auto-classified lines.
 *
 * Used on the CourierManifests page.
 */
import { useState, useRef } from "react";
import { toast } from "sonner";
import { uploadTemplate, UploadTemplateResult } from "@/services/courierApi";
import { C } from "./tokens";

type Props = {
  onCreated: (result: UploadTemplateResult) => void;
  onClose: () => void;
};

export function UploadTemplateDialog({ onCreated, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().slice(0, 10));
  const [exchRate, setExchRate] = useState("6.78");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const submit = async () => {
    if (!file) {
      toast.error("Pick an Excel file to upload");
      return;
    }
    const rate = parseFloat(exchRate);
    if (!(rate > 0)) {
      toast.error("Exchange rate must be > 0");
      return;
    }
    setBusy(true);
    try {
      const result = await uploadTemplate(file, arrivalDate, rate);
      const s = result.summary;
      const msg = s.lines_skipped > 0
        ? `Imported ${s.lines_imported} of ${s.lines_in_file} lines (${s.lines_skipped} skipped)`
        : `Imported ${s.lines_imported} lines from ${s.manifest_no}`;
      toast.success(msg);
      onCreated(result);
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const acceptFile = (f: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx") && !f.name.toLowerCase().endsWith(".xls")) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }
    setFile(f);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520, background: C.paper, borderRadius: 6,
          border: `1px solid ${C.paperBorder}`, padding: 24,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        <h2 style={{
          fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 22,
          color: C.ink, margin: 0, marginBottom: 4,
        }}>
          Upload Express Worksheet
        </h2>
        <p style={{
          fontFamily: "'Fraunces', serif", fontSize: 13, color: C.inkLight,
          margin: 0, marginBottom: 20,
        }}>
          Upload the express-consignment Excel. We'll parse the lines and
          auto-classify each item against the T&T CET.
        </p>

        {/* Drop zone */}
        <label
          htmlFor="ttpost-file"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) acceptFile(e.dataTransfer.files[0]);
          }}
          style={{
            display: "block", padding: "20px 16px",
            border: `2px dashed ${dragOver ? C.amber : C.paperBorder}`,
            borderRadius: 6, background: dragOver ? C.amberLight : C.paperAlt,
            textAlign: "center", cursor: "pointer", marginBottom: 18,
            transition: "all 0.1s",
          }}
        >
          <input
            id="ttpost-file"
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
            style={{ display: "none" }}
          />
          {file ? (
            <>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                fontWeight: 700, color: C.ink, marginBottom: 4,
              }}>
                {file.name}
              </div>
              <div style={{
                fontFamily: "'Fraunces', serif", fontSize: 12,
                color: C.inkLight, fontStyle: "italic",
              }}>
                {(file.size / 1024).toFixed(1)} KB / click to change
              </div>
            </>
          ) : (
            <>
              <div style={{
                fontFamily: "'Fraunces', serif", fontSize: 14,
                color: C.inkMid, marginBottom: 4,
              }}>
                Drop the Excel file here, or click to browse
              </div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: C.inkLight, letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                .xlsx or .xls
              </div>
            </>
          )}
        </label>

        {/* Manifest metadata */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.08em", color: C.inkLight, textTransform: "uppercase",
              display: "block", marginBottom: 4,
            }}>
              Arrival Date
            </label>
            <input
              type="date"
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                padding: "8px 10px",
                border: `1px solid ${C.paperBorder}`, borderRadius: 4,
                background: C.paper, color: C.ink, outline: "none",
              }}
            />
          </div>
          <div>
            <label style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.08em", color: C.inkLight, textTransform: "uppercase",
              display: "block", marginBottom: 4,
            }}>
              Exchange Rate (TTD/USD)
            </label>
            <input
              type="number"
              step="0.0001"
              value={exchRate}
              onChange={(e) => setExchRate(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                padding: "8px 10px",
                border: `1px solid ${C.paperBorder}`, borderRadius: 4,
                background: C.paper, color: C.ink, outline: "none",
              }}
            />
          </div>
        </div>

        <p style={{
          fontFamily: "'Fraunces', serif", fontSize: 11,
          color: C.inkLight, fontStyle: "italic", margin: "14px 0 0 0",
        }}>
          The master waybill number is read from the file's header. Lines are
          color-coded by classification confidence - click any THN to review
          alternatives or set manually.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: "8px 16px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
              background: "transparent", border: `1px solid ${C.paperBorder}`,
              borderRadius: 4, color: C.inkMid, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !file}
            style={{
              padding: "8px 18px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
              background: C.amber, border: `1px solid ${C.amber}`, borderRadius: 4,
              color: "#fff", cursor: busy || !file ? "not-allowed" : "pointer",
              opacity: busy || !file ? 0.6 : 1, fontWeight: 600,
            }}
          >
            {busy ? "Uploading..." : "Upload & Classify"}
          </button>
        </div>
      </div>
    </div>
  );
}
