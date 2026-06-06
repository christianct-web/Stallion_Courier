/**
 * CourierManifests — landing page for the courier module.
 * Lists all manifests, lets the broker create a new one, shows totals,
 * and links into the workbench / exam screens.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listManifests, createManifest, deleteManifest,
  worksheetDownloadUrl, hazmatDownloadUrl,
  CourierManifest,
} from "@/services/courierApi";
import { C, fmtTtd } from "@/components/courier/tokens";
import { UploadTemplateDialog } from "@/components/courier/UploadTemplateDialog";
import { StatusPill } from "@/components/StatusPill";

function Field({ label, value, onChange, placeholder, type = "text", required = false }: {
  label: string; value: string | number; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  const empty = required && !value;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        letterSpacing: "0.08em", textTransform: "uppercase",
        color: empty ? C.critBorder : C.inkLight,
      }}>
        {label}{required && <span style={{ color: C.critBorder }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
          padding: "8px 10px",
          border: `1px solid ${empty ? C.critBorder : C.paperBorder}`,
          borderRadius: 4, background: empty ? C.critical : C.paper,
          color: C.ink, outline: "none", width: "100%", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function NewManifestDialog({ onCreate, onClose }: {
  onCreate: (m: CourierManifest) => void; onClose: () => void;
}) {
  const [manifestNo, setManifestNo] = useState("");
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().slice(0, 10));
  const [exchRate, setExchRate] = useState("6.78");
  const [cargoReporter, setCargoReporter] = useState("TTPOST");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!manifestNo.trim()) { toast.error("Manifest number is required"); return; }
    const rate = parseFloat(exchRate);
    if (!(rate > 0)) { toast.error("Exchange rate must be > 0"); return; }
    setBusy(true);
    try {
      const m = await createManifest({
        manifest_no: manifestNo.trim(),
        arrival_date: arrivalDate,
        exch_rate: rate,
        cargo_reporter: cargoReporter,
      });
      toast.success(`Manifest ${manifestNo} created`);
      onCreate(m);
    } catch (e: any) {
      toast.error(e.message || "Failed to create manifest");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, background: C.paper, borderRadius: 6,
        border: `1px solid ${C.paperBorder}`, padding: 24,
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
      }}>
        <h2 style={{
          fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 22,
          color: C.ink, margin: 0, marginBottom: 4,
        }}>
          New Courier Manifest
        </h2>
        <p style={{
          fontFamily: "'Fraunces', serif", fontSize: 13, color: C.inkLight,
          margin: 0, marginBottom: 20,
        }}>
          Start a new TTPOST express consignment worksheet.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Manifest Number" value={manifestNo} onChange={setManifestNo}
            placeholder="106-31245034" required />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Arrival Date" value={arrivalDate} onChange={setArrivalDate}
              type="date" required />
            <Field label="Exchange Rate (TTD/USD)" value={exchRate} onChange={setExchRate}
              type="number" required />
          </div>
          <Field label="Cargo Reporter" value={cargoReporter} onChange={setCargoReporter} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onClose} disabled={busy} style={{
            padding: "8px 16px", fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
            background: "transparent", border: `1px solid ${C.paperBorder}`,
            borderRadius: 4, color: C.inkMid, cursor: "pointer",
          }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy} style={{
            padding: "8px 18px", fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
            background: C.ink, border: `1px solid ${C.ink}`, borderRadius: 4,
            color: C.paper, cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1, fontWeight: 600,
          }}>
            {busy ? "Creating…" : "Create Manifest"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CourierManifests() {
  const navigate = useNavigate();
  const [manifests, setManifests] = useState<CourierManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CourierManifest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listManifests();
      const items = (res.items || []).slice().sort(
        (a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")
      );
      setManifests(items);
    } catch (e: any) {
      toast.error(e.message || "Failed to load manifests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => ({
    total: manifests.length,
    draft: manifests.filter(m => m.status === "draft").length,
    examined: manifests.filter(m => m.status === "examined").length,
    finalised: manifests.filter(m => m.status === "finalised").length,
  }), [manifests]);

  return (
    <div style={{ minHeight: "100%", background: C.paperAlt }}>
      {/* Page header band (full-width, matches Clients/Log/Sheets) */}
      <div style={{ padding: "32px 40px 24px", borderBottom: `1px solid ${C.paperBorder}`, background: C.paper }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
              letterSpacing: "0.14em", color: C.amber, textTransform: "uppercase",
              marginBottom: 8,
            }}>
              Stallion · Courier Module
            </div>
            <h1 style={{
              fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 30,
              color: C.ink, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.08,
            }}>
              Non Trade Express Worksheets
            </h1>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
              color: C.inkMid, margin: "8px 0 0 0", maxWidth: 640, lineHeight: 1.5,
            }}>
              Process express consignment worksheets — line classification,
              duty calculation, officer examination, and worksheet/hazmat export.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => navigate("/stallion/courier/tariff")} style={{
              padding: "10px 18px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
              background: "transparent", border: `1px solid ${C.paperMid}`,
              borderRadius: 4, color: C.inkMid, cursor: "pointer", fontWeight: 600,
            }}>
              ⊞ Tariff Database
            </button>
            <button onClick={() => setShowUpload(true)} style={{
              padding: "10px 18px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
              background: C.amber, border: `1px solid ${C.amber}`, borderRadius: 4,
              color: "#fff", cursor: "pointer", fontWeight: 600,
            }}>
              ↑ Upload Manifest
            </button>
            <button onClick={() => setShowNew(true)} style={{
              padding: "10px 18px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
              background: C.ink, border: `1px solid ${C.ink}`, borderRadius: 4,
              color: C.paper, cursor: "pointer", fontWeight: 600,
            }}>
              + Manual Worksheet
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ margin: "24px 40px 48px" }}>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total", value: summary.total, color: C.ink },
            { label: "Draft", value: summary.draft, color: C.ghostDim },
            { label: "Examined", value: summary.examined, color: C.amber },
            { label: "Finalised", value: summary.finalised, color: C.green },
          ].map(card => (
            <div key={card.label} style={{
              background: C.paper, border: `1px solid ${C.paperBorder}`,
              borderRadius: 4, padding: "14px 18px",
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                letterSpacing: "0.1em", color: C.inkLight, textTransform: "uppercase",
                marginBottom: 4,
              }}>
                {card.label}
              </div>
              <div style={{
                fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600,
                color: card.color,
              }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* Manifest table */}
        <div style={{
          background: C.paper, border: `1px solid ${C.paperBorder}`,
          borderRadius: 4, overflow: "hidden",
        }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", fontFamily: "'Fraunces', serif", color: C.inkLight }}>
              Loading…
            </div>
          ) : manifests.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: C.inkLight, marginBottom: 8 }}>
                No manifests yet
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: C.inkLight, fontStyle: "italic" }}>
                Click "Manual Worksheet" to start your first non-trade worksheet.
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.ink, borderBottom: `2px solid ${C.ink}` }}>
                  {["MANIFEST NO.", "ARRIVAL", "REPORTER", "RATE", "LINES", "TOTAL TAXES (TTD)", "STATUS", ""]
                    .map((h, i) => (
                      <th key={h} style={{
                        textAlign: i >= 3 && i <= 5 ? "right" : "left", padding: "11px 14px",
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
                        letterSpacing: "0.1em", color: C.paperMid, fontWeight: 700,
                        textTransform: "uppercase", whiteSpace: "nowrap",
                        position: "sticky", top: 0,
                      }}>
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {manifests.map((m, rowIdx) => {
                  const zebra = rowIdx % 2 === 1 ? C.paperAlt : C.paper;
                  return (
                  <tr key={m.id}
                    style={{
                      background: zebra,
                      borderBottom: `1px solid ${C.paperBorder}`, cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#F2EDE4"}
                    onMouseLeave={e => e.currentTarget.style.background = zebra}
                    onClick={() => navigate(`/stallion/courier/${m.id}`)}
                  >
                    <td style={{ padding: "12px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: C.ink, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {m.manifest_no}
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.inkMid, whiteSpace: "nowrap" }}>
                      {m.arrival_date}
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: "'Fraunces', serif", fontSize: 13, color: C.inkMid, maxWidth: 200 }}>
                      {m.cargo_reporter}
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.inkMid, textAlign: "right" }}>
                      {m.exch_rate.toFixed(5)}
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: C.inkMid, textAlign: "right" }}>
                      {m.lines?.length ?? 0}
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: C.ink, fontWeight: 600, textAlign: "right" }}>
                      {fmtTtd(m.totals?.total_taxes)}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <StatusPill status={m.status} />
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}
                      onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <a href={worksheetDownloadUrl(m.id)} download
                          style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                            letterSpacing: "0.06em", textTransform: "uppercase",
                            color: C.blue, textDecoration: "none",
                            padding: "4px 8px", border: `1px solid ${C.blue}33`,
                            borderRadius: 3, transition: "background 0.1s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = C.blueLight}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          XLSX
                        </a>
                        <a href={hazmatDownloadUrl(m.id)} download
                          style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                            letterSpacing: "0.06em", textTransform: "uppercase",
                            color: C.amber, textDecoration: "none",
                            padding: "4px 8px", border: `1px solid ${C.amber}33`,
                            borderRadius: 3, transition: "background 0.1s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = C.amberLight}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          HAZMAT
                        </a>
                        <button
                          onClick={() => setConfirmDelete(m)}
                          style={{
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                            letterSpacing: "0.06em", textTransform: "uppercase",
                            color: C.critBorder, background: "transparent",
                            padding: "4px 8px", border: `1px solid ${C.critBorder}33`,
                            borderRadius: 3, cursor: "pointer",
                          }}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <NewManifestDialog
          onCreate={(m) => {
            setShowNew(false);
            load();
            navigate(`/stallion/courier/${m.id}`);
          }}
          onClose={() => setShowNew(false)}
        />
      )}

      {showUpload && (
        <UploadTemplateDialog
          onCreated={(result) => {
            setShowUpload(false);
            load();
            navigate(`/stallion/courier/${result.manifest.id}`);
          }}
          onClose={() => setShowUpload(false)}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete manifest?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove manifest <strong>{confirmDelete?.manifest_no}</strong>{" "}
              and all its lines. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await deleteManifest(confirmDelete.id);
                  toast.success(`Manifest ${confirmDelete.manifest_no} deleted`);
                  setConfirmDelete(null);
                  load();
                } catch (e: any) {
                  toast.error(e.message || "Delete failed");
                }
              }}
              style={{ background: C.critBorder, color: "#fff" }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
