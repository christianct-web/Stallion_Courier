import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { extractDocuments } from "@/services/stallionApi";
import { TopNav } from "@/components/TopNav";
import { HelpBox, HelpTip, HelpHeading } from "@/components/HelpBox";

// Design tokens (matching paper/void system from other pages)
const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6",
  paperMid: "#CCC7BE", ink: "#18150F", inkMid: "#3D3830", inkLight: "#6B6560",
  void_: "#111318", voidMid: "#191D26", voidSurface: "#1F2430",
  voidBorder: "#2E3748", ghost: "#A0AABB", ghostDim: "#6B7585",
  approved: "#1A5E3A", pending: "#96700A", warn: "#FEF3DC", warnBorder: "#D4A020",
};

type PermitFlag = {
  invoiceName: string;
  ttbizlinkName: string;
  category: string;
  sequence: number;
  permitType: string;
};

type Certificate = {
  type: string;
  number: string;
  issueDate: string | null;
  issuer: string;
  country: string;
};

type ExtractedItem = {
  id: string;
  consigneeName: string;
  consignorName: string;
  hsCode: string;
  invoiceValueForeign: number;
  currency: string;
  confidence: number;
  notes: string[];
  status: string;
  certificates: Certificate[];
  permitFlags: PermitFlag[];
  containerNumber: string;
};

function ConfidencePill({ confidence }: { confidence: number }) {
  const pct = Math.round((confidence || 0) * 100);
  const color = pct >= 90 ? C.approved : pct >= 70 ? C.pending : "#963A10";
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.1em", color, padding: "2px 8px", borderRadius: 3,
      background: color + "18", border: `1px solid ${color}44`,
    }}>
      {pct}% CONF
    </span>
  );
}

export default function DocumentUpload() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"batch" | "separate">("batch");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ExtractedItem[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);

  const onPick = (list: FileList | null) => {
    if (!list) return;
    setFiles(prev => [...prev, ...Array.from(list)]);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const list = e.dataTransfer.files;
    if (list) setFiles(prev => [...prev, ...Array.from(list)]);
  }, []);

  const onExtract = async () => {
    if (!files.length) return;
    setLoading(true);
    setError("");
    setResults([]);
    setProgressStep("Reading document…");

    const steps = ["Reading document…", "Extracting fields…", "Checking permit requirements…", "Finalising results…"];
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      setProgressStep(steps[stepIdx]);
    }, 1800);

    try {
      const res = await extractDocuments(files, mode);
      setResults(res.items || []);
    } catch (e: any) {
      setError(e?.message || "Extraction failed — check that files are valid PDFs");
    } finally {
      clearInterval(stepTimer);
      setLoading(false);
      setProgressStep(null);
    }
  };

  const clearFiles = () => { setFiles([]); setResults([]); setError(""); };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { background: ${C.paper}; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ minHeight: "100vh", background: C.paper, fontFamily: "'Fraunces', serif", color: C.ink }}>
        <TopNav />

        {/* Page header */}
        <div style={{ background: C.void_, borderBottom: `1px solid ${C.voidBorder}`, padding: "24px 32px 20px" }}>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: C.ghostDim, marginBottom: 8 }}>
              EXTRACTION
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1 }}>
              Document Extraction
            </h1>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 13, color: C.ghost, marginTop: 6 }}>
              Upload commercial invoices, AWBs, and packing lists — AI extracts declaration fields automatically
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 32px 48px" }}>

          {/* ─── Help ─────────────────────────────────────────────────────────── */}
          <HelpBox title="What to upload and how extraction works" defaultOpen={true}>
            <p style={{ margin: "0 0 10px" }}>
              Stallion uses AI to read your commercial documents and pre-fill the customs declaration form.
              You upload the documents — Stallion extracts the fields and sends them to broker review.
            </p>

            <HelpHeading>WHAT TO UPLOAD</HelpHeading>
            <div style={{ display: "grid", gap: 6 }}>
              {[
                ["Commercial Invoice", "Required. Provides consignee, consignor, HS code, description, invoice value, and currency. This is the most important document."],
                ["Air Waybill (AWB) or Bill of Lading (BL)", "Recommended. Adds AWB/BL number, shipped-on-board date, vessel or flight, and port of loading. Upload together with the invoice in Batch mode."],
                ["Packing List", "Recommended. Adds package count, gross weight, net weight, container number, and seal number — used for cross-checking against the BL."],
                ["Caricom Certificate of Origin", "If present, Stallion extracts the certificate number and issuing country for the declaration record."],
                ["Health / Free-Sale Certificate", "If present, certificate number and issuing authority are extracted and stored against the declaration."],
              ].map(([name, desc]) => (
                <div key={name} style={{ paddingLeft: 12, borderLeft: "2px solid #E2DDD6" }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 12, color: "#3D3830", marginBottom: 2 }}>{name}</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: "#6B6560" }}>{desc}</div>
                </div>
              ))}
            </div>

            <HelpHeading>BATCH vs SEPARATE MODE</HelpHeading>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ paddingLeft: 12, borderLeft: "2px solid #D4A020" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 12, color: "#3D3830", marginBottom: 2 }}>Batch mode</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: "#6B6560" }}>
                  All uploaded files relate to <strong>one shipment</strong>. Stallion reads them together and merges the data.
                  Use this when you have an invoice + AWB for the same consignment.
                </div>
              </div>
              <div style={{ paddingLeft: 12, borderLeft: "2px solid #E2DDD6" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 12, color: "#3D3830", marginBottom: 2 }}>Separate mode</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: "#6B6560" }}>
                  Each uploaded file is a <strong>different shipment</strong>. Stallion creates one declaration per file.
                  Use this when processing multiple invoices at once.
                </div>
              </div>
            </div>

            <HelpHeading>CONFIDENCE SCORE</HelpHeading>
            <p style={{ margin: "0 0 6px", fontStyle: "italic", color: "#6B6560", fontSize: 12 }}>
              After extraction, each result shows a confidence score (0–100%). This reflects how completely and clearly the AI could read the document.
            </p>
            <div style={{ display: "grid", gap: 4 }}>
              {[
                ["90–100%", "All critical fields found clearly. Broker review should be quick."],
                ["70–89%", "Most fields found. Some items may need broker attention — check the notes."],
                ["Below 70%", "Significant gaps. The document may be unclear, a scanned image, or missing key data. Broker will need to fill in missing fields."],
              ].map(([range, desc]) => (
                <div key={range} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#1A5E3A", minWidth: 70 }}>{range}</span>
                  <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "#6B6560" }}>{desc}</span>
                </div>
              ))}
            </div>

            <HelpTip>After extraction, click "Send to Review →" to pass the declaration to the broker queue. The broker will verify fields, set the duty rate, and approve before generating the C82 XML.</HelpTip>
          </HelpBox>

          {/* Mode toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: C.inkLight, marginRight: 4 }}>
              MODE
            </div>
            {(["batch", "separate"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "6px 16px",
                  background: mode === m ? C.ink : "transparent",
                  border: `1px solid ${mode === m ? C.ink : C.paperBorder}`,
                  borderRadius: 3, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, letterSpacing: "0.08em", fontWeight: 700,
                  color: mode === m ? C.paper : C.inkLight,
                  transition: "all 0.15s",
                }}
              >
                {m.toUpperCase()}
              </button>
            ))}
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.inkLight }}>
              {mode === "batch" ? "Multiple files → one declaration" : "One declaration per file"}
            </div>
          </div>

          {/* Upload zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById("file-input")?.click()}
            style={{
              border: `2px dashed ${dragging ? C.ink : C.paperMid}`,
              borderRadius: 4,
              padding: "40px 32px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? C.paperAlt : C.paper,
              transition: "all 0.15s",
              marginBottom: 16,
            }}
          >
            <input
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.xlsx,.csv"
              style={{ display: "none" }}
              onChange={e => onPick(e.target.files)}
            />
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, color: C.paperMid, marginBottom: 12, lineHeight: 1 }}>
              ⇪
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: C.inkMid, marginBottom: 6 }}>
              Drop invoices, AWBs, packing lists, certificates here
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight }}>
              or click to browse · PDF, XLSX, CSV accepted
            </div>
          </div>

          {/* File list + actions */}
          {files.length > 0 && (
            <div style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, marginBottom: 16, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: C.inkLight }}>
                  {files.length} FILE{files.length !== 1 ? "S" : ""} QUEUED
                </span>
                <button onClick={e => { e.stopPropagation(); clearFiles(); }} style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkLight }}>
                  Clear
                </button>
              </div>
              {files.map((f, i) => (
                <div key={i} style={{ padding: "8px 14px", borderBottom: i < files.length - 1 ? `1px solid ${C.paperBorder}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: C.inkMid }}>{f.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.inkLight }}>
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Extract button */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={onExtract}
                disabled={!files.length || loading}
                title={!files.length ? "Upload at least one document to run extraction" : loading ? "Extraction in progress…" : ""}
                style={{
                  padding: "10px 24px",
                  background: files.length && !loading ? C.ink : C.paperMid,
                  border: "none", borderRadius: 3, cursor: files.length && !loading ? "pointer" : "not-allowed",
                  fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 600,
                  color: files.length && !loading ? C.paper : C.inkLight,
                  transition: "background 0.15s",
                }}
              >
                {loading ? (progressStep || "Extracting…") : "Run Extraction"}
              </button>
            </div>
            {!files.length && !loading && (
              <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: C.inkLight, marginTop: 2 }}>
                ↑ Upload at least one document to enable extraction
              </div>
            )}
            {loading && progressStep && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, padding: "8px 12px", background: C.paperAlt, border: `1px solid ${C.paperBorder}`, borderRadius: 3 }}>
                <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 14 }}>⟳</span>
                <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkMid }}>
                  {progressStep}
                </span>
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: "12px 16px", background: "#FEE8E8", border: "1px solid #B0202044", borderRadius: 3, marginBottom: 20, fontFamily: "'Fraunces', serif", fontSize: 13, color: "#7A1E1E" }}>
              {error}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: C.inkLight, marginBottom: 12 }}>
                EXTRACTION RESULTS · {results.length}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {results.map(r => (
                  <div key={r.id} style={{ border: `1px solid ${C.paperBorder}`, borderRadius: 3, overflow: "hidden" }}>
                    {/* Card header */}
                    <div style={{ padding: "12px 16px", background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: C.ink }}>
                          {r.consigneeName || "(No consignee extracted)"}
                        </div>
                        {r.consignorName && (
                          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: C.inkLight, marginTop: 2 }}>
                            from {r.consignorName}
                          </div>
                        )}
                      </div>
                      <ConfidencePill confidence={r.confidence} />
                    </div>

                    {/* Card body */}
                    <div style={{ padding: "12px 16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 20px", marginBottom: 10 }}>
                        {[
                          ["HS CODE", r.hsCode || "—"],
                          ["VALUE", r.invoiceValueForeign ? `${r.currency} ${Number(r.invoiceValueForeign).toLocaleString()}` : "—"],
                          ["REF", r.id],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.12em", color: C.inkLight, marginBottom: 3 }}>{label}</div>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.inkMid, fontWeight: 700 }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* TTBizLink permit flags */}
                      {!!r.permitFlags?.length && (
                        <div style={{ marginBottom: 10 }}>
                          {r.permitFlags.map((p, i) => (
                            <div key={i} style={{
                              display: "flex", alignItems: "baseline", gap: 8,
                              padding: "6px 10px", marginBottom: 4,
                              background: "#FFF7E6", border: "1px solid #D4A02044",
                              borderLeft: "3px solid #D4A020", borderRadius: 3,
                            }}>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#96700A" }}>
                                IMPORT PERMIT REQUIRED
                              </span>
                              <span style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: "#3D3830" }}>
                                {p.ttbizlinkName}
                              </span>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#96700A", marginLeft: "auto" }}>
                                {p.category} · SEQ {p.sequence} · {p.permitType.toUpperCase()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Extracted certificates */}
                      {!!r.certificates?.length && (
                        <div style={{ marginBottom: 10 }}>
                          {r.certificates.map((c, i) => (
                            <div key={i} style={{
                              display: "flex", alignItems: "baseline", gap: 8,
                              padding: "5px 10px", marginBottom: 3,
                              background: "#F0F5F0", border: "1px solid #1A5E3A22",
                              borderLeft: "3px solid #1A5E3A", borderRadius: 3,
                            }}>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#1A5E3A" }}>
                                {c.type}
                              </span>
                              <span style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: "#3D3830" }}>
                                {c.number || "No cert number"}
                              </span>
                              {c.issuer && (
                                <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 11, color: "#6B6560" }}>
                                  {c.issuer}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {!!r.notes?.length && (
                        <div style={{ padding: "7px 10px", background: C.warn, border: `1px solid ${C.warnBorder}44`, borderRadius: 3, marginBottom: 10, fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: "#7A5000" }}>
                          ⚠ {r.notes.join(" · ")}
                        </div>
                      )}

                      <button
                        onClick={() => navigate(`/stallion/brokerreview4?id=${r.id}`)}
                        style={{
                          padding: "7px 16px", background: "transparent",
                          border: `1px solid ${C.ink}`, borderRadius: 3,
                          cursor: "pointer", fontFamily: "'Fraunces', serif",
                          fontSize: 13, fontWeight: 600, color: C.ink,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = C.ink; e.currentTarget.style.color = C.paper; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.ink; }}
                      >
                        Send to Review →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
