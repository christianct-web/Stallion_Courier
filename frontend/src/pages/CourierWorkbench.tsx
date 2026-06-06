/**
 * CourierWorkbench — line entry & classification page.
 *
 * Top: manifest header (editable: arrival_date, exch_rate, cargo_reporter)
 * Middle: line table with inline edit. Each line shows description, THN,
 *         rate (FREE/EXEMPT/20%), cost, computed CIF/duty/OPT/VAT/total.
 * Bottom: add-line form with auto-classify from description.
 * Side: totals panel + actions (download worksheet, download hazmat, go to exam).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getManifest, updateManifestHeader, addLine, updateLine, deleteLine,
  classifyDescription, recomputeManifest,
  worksheetDownloadUrl, hazmatDownloadUrl,
  CourierManifest, CourierLine, ThnSuggestion,
} from "@/services/courierApi";
import { C, fmtTtd, fmtUsd, ratePillStyle } from "@/components/courier/tokens";
import { ThnClassifyCell } from "@/components/courier/ThnClassifyCell";
import { HazmatFormDialog } from "@/components/courier/HazmatFormDialog";

// ── Helpers ──────────────────────────────────────────────────────────────

function RatePill({ line }: { line: CourierLine }) {
  const s = ratePillStyle(line.exemption_class, line.duty_rate);
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.08em", color: s.color, background: s.bg,
      padding: "2px 6px", borderRadius: 3,
    }}>
      {s.label}
    </span>
  );
}

function HeaderField({
  label, value, onChange, type = "text", width = 140,
}: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; width?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
        letterSpacing: "0.1em", color: C.ghost, textTransform: "uppercase",
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
          padding: "6px 8px", width,
          border: `1px solid ${C.voidBorder}`, borderRadius: 3,
          background: C.voidMid, color: C.paper, outline: "none",
        }}
      />
    </div>
  );
}

// ── Add-line form with classify ──────────────────────────────────────────

function ClassifySuggestions({ suggestions, onPick }: {
  suggestions: ThnSuggestion[]; onPick: (s: ThnSuggestion) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <div style={{
      position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
      background: C.paper, border: `1px solid ${C.paperBorder}`, borderRadius: 4,
      boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 50,
      maxHeight: 280, overflowY: "auto",
    }}>
      {suggestions.map(s => {
        const pill = ratePillStyle(s.exemption_class, s.duty_rate);
        return (
          <button
            key={s.thn}
            onClick={() => onPick(s)}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "10px 12px",
              background: "transparent", border: "none",
              borderBottom: `1px solid ${C.paperBorder}`,
              cursor: "pointer", transition: "background 0.1s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.paperAlt}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700,
                color: C.ink,
              }}>
                {s.code}
              </span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.08em", color: pill.color, background: pill.bg,
                padding: "1px 5px", borderRadius: 2,
              }}>
                {pill.label}
              </span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                color: C.inkLight, marginLeft: "auto",
              }}>
                {Math.round(s.confidence * 100)}% conf.
              </span>
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkMid, marginBottom: 2 }}>
              {s.description}
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 11, color: C.inkLight, fontStyle: "italic" }}>
              {s.match_reason}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AddLineRow({ manifestId, onAdded }: {
  manifestId: string; onAdded: () => void;
}) {
  const [hawb, setHawb] = useState("");
  const [shipper, setShipper] = useState("");
  const [importer, setImporter] = useState("");
  const [description, setDescription] = useState("");
  const [thn, setThn] = useState("");
  const [costUsd, setCostUsd] = useState("");
  const [packages, setPackages] = useState("1");
  const [weight, setWeight] = useState("1");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<ThnSuggestion[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced classify on description change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (description.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    if (thn) return; // don't override an explicit THN
    debounceRef.current = setTimeout(async () => {
      setClassifying(true);
      try {
        const res = await classifyDescription(description, 5);
        setSuggestions(res.suggestions || []);
        setShowSugg(true);
      } catch {
        // silent — suggestions are an aid
      } finally {
        setClassifying(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [description, thn]);

  const reset = () => {
    setHawb(""); setShipper(""); setImporter("");
    setDescription(""); setThn(""); setCostUsd("");
    setPackages("1"); setWeight("1");
    setSuggestions([]); setShowSugg(false);
  };

  const submit = async () => {
    if (!description.trim()) { toast.error("Description is required"); return; }
    const cost = parseFloat(costUsd);
    if (!(cost > 0)) { toast.error("Cost USD must be > 0"); return; }
    setBusy(true);
    try {
      await addLine(manifestId, {
        hawb: hawb.trim(),
        shipper: shipper.trim(),
        importer: importer.trim(),
        description: description.trim(),
        thn: thn.trim(),
        cost_usd: cost,
        packages: parseInt(packages, 10) || 1,
        weight_kg: parseFloat(weight) || 0,
        auto_classify: !thn.trim(),
      });
      toast.success("Line added");
      reset();
      onAdded();
    } catch (e: any) {
      toast.error(e.message || "Failed to add line");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
    padding: "7px 9px",
    border: `1px solid ${C.paperBorder}`, borderRadius: 3,
    background: C.paper, color: C.ink, outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{
      background: C.paperAlt, border: `1px solid ${C.paperBorder}`,
      borderRadius: 4, padding: 16, marginTop: 16,
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        letterSpacing: "0.1em", color: C.amber, textTransform: "uppercase",
        marginBottom: 10, fontWeight: 700,
      }}>
        + Add Line
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "100px 140px 140px 1fr 100px 75px 75px 80px auto", gap: 8, alignItems: "end" }}>
        <input style={inputStyle} placeholder="HAWB" value={hawb} onChange={e => setHawb(e.target.value)} />
        <input style={inputStyle} placeholder="Shipper" value={shipper} onChange={e => setShipper(e.target.value)} />
        <input style={inputStyle} placeholder="Importer" value={importer} onChange={e => setImporter(e.target.value)} />
        <div style={{ position: "relative" }}>
          <input style={inputStyle} placeholder="Description (auto-classifies)…"
            value={description}
            onChange={e => setDescription(e.target.value)}
            onFocus={() => suggestions.length && setShowSugg(true)}
            onBlur={() => setTimeout(() => setShowSugg(false), 200)} />
          {classifying && (
            <span style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              fontSize: 10, color: C.inkLight, fontStyle: "italic", fontFamily: "'Fraunces', serif",
            }}>
              classifying…
            </span>
          )}
          {showSugg && suggestions.length > 0 && (
            <ClassifySuggestions
              suggestions={suggestions}
              onPick={s => {
                setThn(s.thn);
                setShowSugg(false);
              }}
            />
          )}
        </div>
        <input style={{ ...inputStyle, fontWeight: thn ? 700 : 400 }}
          placeholder="THN (auto)" value={thn} onChange={e => setThn(e.target.value)} />
        <input style={inputStyle} type="number" placeholder="Cost USD" value={costUsd}
          onChange={e => setCostUsd(e.target.value)} />
        <input style={inputStyle} type="number" placeholder="Pkgs" value={packages}
          onChange={e => setPackages(e.target.value)} />
        <input style={inputStyle} type="number" placeholder="Wt" value={weight}
          onChange={e => setWeight(e.target.value)} />
        <button
          onClick={submit}
          disabled={busy}
          style={{
            padding: "7px 14px", fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
            background: C.ink, color: C.paper, border: `1px solid ${C.ink}`,
            borderRadius: 3, cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1, fontWeight: 600, whiteSpace: "nowrap",
          }}
        >
          {busy ? "…" : "Add"}
        </button>
      </div>

      {thn && (
        <div style={{
          fontFamily: "'Fraunces', serif", fontSize: 11, color: C.inkLight,
          marginTop: 8, fontStyle: "italic",
        }}>
          THN <strong>{thn}</strong> selected. Clear it to re-trigger auto-classification from description.
          {" "}
          <button onClick={() => setThn("")} style={{
            background: "transparent", border: "none", color: C.amber,
            textDecoration: "underline", cursor: "pointer", fontFamily: "inherit",
            fontSize: "inherit",
          }}>clear</button>
        </div>
      )}
    </div>
  );
}

// ── Editable line row ────────────────────────────────────────────────────

function LineRow({ manifestId, line, onChanged, onDelete }: {
  manifestId: string; line: CourierLine;
  onChanged: () => void; onDelete: (line: CourierLine) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    description: line.description,
    thn: line.thn,
    cost_usd: line.cost_usd,
    packages: line.packages,
    weight_kg: line.weight_kg,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updateLine(manifestId, line.line_no, {
        description: draft.description,
        thn: draft.thn,
        cost_usd: typeof draft.cost_usd === "string" ? parseFloat(draft.cost_usd as any) : draft.cost_usd,
        packages: typeof draft.packages === "string" ? parseInt(draft.packages as any, 10) : draft.packages,
        weight_kg: typeof draft.weight_kg === "string" ? parseFloat(draft.weight_kg as any) : draft.weight_kg,
      });
      toast.success(`Line ${line.line_no} updated`);
      setEditing(false);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to update line");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setDraft({
      description: line.description, thn: line.thn, cost_usd: line.cost_usd,
      packages: line.packages, weight_kg: line.weight_kg,
    });
    setEditing(false);
  };

  const cellStyle: React.CSSProperties = {
    padding: "8px 8px",
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
    color: C.inkMid, verticalAlign: "middle",
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
    padding: "5px 7px",
    border: `1px solid ${C.paperBorder}`, borderRadius: 3,
    background: "#fff", color: C.ink, outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  return (
    <tr style={{
      borderBottom: `1px solid ${C.paperBorder}`,
      background: editing ? "#FFFAEC" : "transparent",
    }}>
      <td style={{ ...cellStyle, color: C.inkLight, fontWeight: 600, textAlign: "center", width: 32 }}>
        {line.line_no}
      </td>
      <td style={{ ...cellStyle, fontSize: 11, color: C.inkLight, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {line.hawb || "—"}
      </td>
      <td style={{ ...cellStyle, fontFamily: "'Fraunces', serif", fontSize: 12 }}>
        {editing ? (
          <input style={inputStyle} value={draft.description}
            onChange={e => setDraft({ ...draft, description: e.target.value })} />
        ) : line.description}
      </td>
      <td style={cellStyle}>
        {editing ? (
          <input style={{ ...inputStyle, width: 100 }} value={draft.thn}
            onChange={e => setDraft({ ...draft, thn: e.target.value })} />
        ) : (
          <ThnClassifyCell
            line={line}
            onUpdate={async (patch) => {
              await updateLine(manifestId, line.line_no, patch);
              onChanged();
            }}
            onReload={async () => {
              // Called after the Maintain Tariff dialog saves a new tariff
              // override. Recompute every line in the manifest so the new
              // duty rate takes effect across the whole manifest, then
              // refresh the page state.
              await recomputeManifest(manifestId);
              onChanged();
            }}
          />
        )}
      </td>
      <td style={cellStyle}>
        <RatePill line={line} />
      </td>
      <td style={{ ...cellStyle, textAlign: "right" }}>
        {editing ? (
          <input style={{ ...inputStyle, width: 80, textAlign: "right" }} type="number"
            value={draft.cost_usd as any}
            onChange={e => setDraft({ ...draft, cost_usd: e.target.value as any })} />
        ) : `$${fmtUsd(line.cost_usd)}`}
      </td>
      <td style={{ ...cellStyle, textAlign: "right", color: C.ink, fontWeight: 600 }}>
        {fmtTtd(line.cif_ttd)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtTtd(line.duty)}</td>
      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtTtd(line.opt)}</td>
      <td style={{ ...cellStyle, textAlign: "right" }}>{fmtTtd(line.vat)}</td>
      <td style={{ ...cellStyle, textAlign: "right", color: C.ink, fontWeight: 700 }}>
        {fmtTtd(line.total_taxes)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right" }}>
        {editing ? (
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
            <button onClick={save} disabled={busy} style={{
              padding: "4px 10px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
              background: C.green, color: "#fff", border: "none", borderRadius: 3,
              cursor: "pointer", fontWeight: 600,
            }}>
              {busy ? "…" : "Save"}
            </button>
            <button onClick={cancel} disabled={busy} style={{
              padding: "4px 10px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
              background: "transparent", color: C.inkMid, border: `1px solid ${C.paperBorder}`,
              borderRadius: 3, cursor: "pointer",
            }}>
              ✕
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
            <button onClick={() => setEditing(true)} style={{
              padding: "4px 10px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
              background: "transparent", color: C.amber,
              border: `1px solid ${C.amber}33`, borderRadius: 3, cursor: "pointer",
            }}>
              Edit
            </button>
            <button onClick={() => onDelete(line)} style={{
              padding: "4px 8px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, color: C.critBorder, background: "transparent",
              border: `1px solid ${C.critBorder}33`, borderRadius: 3, cursor: "pointer",
            }}>
              ✕
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

export default function CourierWorkbench() {
  const isMobile = useIsMobile();
  const { manifestId } = useParams<{ manifestId: string }>();
  const navigate = useNavigate();
  const [manifest, setManifest] = useState<CourierManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<CourierLine | null>(null);
  // Hazmat form modal (opens when user clicks "Hazmat XLSX" on the uplifted
  // workbench view). The modal collects courier-data fields then triggers a
  // server-side hazmat XLSX generation with those fields filled in.
  const [hazmatModalOpen, setHazmatModalOpen] = useState(false);

  // Header edit state
  const [arrivalDate, setArrivalDate] = useState("");
  const [exchRate, setExchRate] = useState("");
  const [cargoReporter, setCargoReporter] = useState("");

  const load = useCallback(async () => {
    if (!manifestId) return;
    setLoading(true);
    try {
      const m = await getManifest(manifestId);
      setManifest(m);
      setArrivalDate(m.arrival_date);
      setExchRate(String(m.exch_rate));
      setCargoReporter(m.cargo_reporter);
    } catch (e: any) {
      toast.error(e.message || "Failed to load manifest");
      navigate("/stallion/courier");
    } finally {
      setLoading(false);
    }
  }, [manifestId, navigate]);

  useEffect(() => { load(); }, [load]);

  const headerDirty = useMemo(() => {
    if (!manifest) return false;
    return arrivalDate !== manifest.arrival_date ||
      parseFloat(exchRate) !== manifest.exch_rate ||
      cargoReporter !== manifest.cargo_reporter;
  }, [manifest, arrivalDate, exchRate, cargoReporter]);

  const saveHeader = async () => {
    if (!manifestId) return;
    try {
      const rate = parseFloat(exchRate);
      if (!(rate > 0)) { toast.error("Exchange rate must be > 0"); return; }
      await updateManifestHeader(manifestId, {
        arrival_date: arrivalDate,
        exch_rate: rate,
        cargo_reporter: cargoReporter,
      });
      toast.success("Header saved — lines recomputed");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save header");
    }
  };

  const onDeleteLine = async (line: CourierLine) => {
    if (!manifestId) return;
    try {
      await deleteLine(manifestId, line.line_no);
      toast.success(`Line ${line.line_no} deleted`);
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  if (loading || !manifest) {
    return (
      <div style={{ minHeight: "100vh", background: C.paperAlt }}>
        {!isMobile && <TopNav />}
        <div style={{ padding: 60, textAlign: "center", fontFamily: "'Fraunces', serif", color: C.inkLight }}>
          Loading manifest…
        </div>
      </div>
    );
  }

  const t = manifest.totals || {} as any;

  return (
    <div style={{ minHeight: "100vh", background: C.paperAlt }}>
      {!isMobile && <TopNav rightSlot={
        <button onClick={() => navigate("/stallion/courier")} style={{
          background: "transparent", border: `1px solid ${C.voidBorder}`,
          color: C.ghost, padding: "5px 12px", borderRadius: 4,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
        }}>
          ← Manifests
        </button>
      } />}

      {/* Manifest header strip — dark band like the navigation */}
      <div style={{
        background: C.voidMid, borderBottom: `1px solid ${C.voidBorder}`,
        padding: "16px 28px",
      }}>
        <div style={{ maxWidth: 1480, margin: "0 auto", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.12em",
              color: manifest.officer_examination ? "#7CE38B" : C.amber,
              textTransform: "uppercase",
              marginBottom: 4,
            }}>
              {manifest.officer_examination
                ? "Uplifted Worksheet · Section 2 + 3"
                : "Non Trade Worksheet · Section 2"}
            </div>
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600,
              color: C.paper, lineHeight: 1,
            }}>
              {manifest.manifest_no}
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: C.voidBorder }} />
          <HeaderField label="Arrival" value={arrivalDate} onChange={setArrivalDate} type="date" width={150} />
          <HeaderField label="Rate (TTD/USD)" value={exchRate} onChange={setExchRate} type="number" width={130} />
          <HeaderField label="Cargo Reporter" value={cargoReporter} onChange={setCargoReporter} width={150} />
          <button
            onClick={saveHeader}
            disabled={!headerDirty}
            style={{
              padding: "8px 16px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
              background: headerDirty ? C.amber : "transparent",
              border: `1px solid ${headerDirty ? C.amber : C.voidBorder}`,
              borderRadius: 3, color: headerDirty ? "#fff" : C.ghostDim,
              cursor: headerDirty ? "pointer" : "default", fontWeight: 600,
              alignSelf: "end", marginBottom: 0,
            }}
          >
            Save Header
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <a href={worksheetDownloadUrl(manifest.id)} download style={{
              padding: "8px 14px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
              color: C.paper, textDecoration: "none",
              background: "transparent", border: `1px solid ${C.ghost}`, borderRadius: 3,
            }}>
              {manifest.officer_examination ? "⬇ Uplifted Worksheet" : "⬇ Worksheet XLSX"}
            </a>
            {/*
              Hazmat is only generated AFTER officer examination — it summarises
              additional taxes assessed at exam vs. originals declared on the
              worksheet. Before exam there's nothing additional to report, so
              the button is hidden on the pre-exam workbench.
            */}
            {manifest.officer_examination && (
              <button
                onClick={() => setHazmatModalOpen(true)}
                style={{
                  padding: "8px 14px", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
                  color: C.paper, textDecoration: "none",
                  background: "transparent", border: `1px solid ${C.ghost}`, borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                ⬇ Hazmat XLSX
              </button>
            )}
            <button
              onClick={() => navigate(`/stallion/courier/${manifest.id}/exam`)}
              style={{
                padding: "8px 16px", fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
                background: C.amber, border: `1px solid ${C.amber}`, borderRadius: 3,
                color: "#fff", cursor: "pointer", fontWeight: 600,
              }}
            >
              {manifest.officer_examination ? "Edit Examination" : "Officer Exam →"}
            </button>
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: 1600, margin: "0 auto", padding: "24px 28px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 260px",
        gap: 20,
      }}>
        {/* Lines table + add form */}
        <div>
          <div style={{
            background: C.paper, border: `1px solid ${C.paperBorder}`,
            borderRadius: 4, overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 14px", background: C.paperAlt,
              borderBottom: `1px solid ${C.paperBorder}`,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.1em", color: C.inkLight, textTransform: "uppercase",
              fontWeight: 700,
            }}>
              Section 2 — Declared Lines ({manifest.lines.length})
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: C.paperAlt, borderBottom: `1px solid ${C.paperBorder}` }}>
                    {["#", "HAWB", "Description", "THN", "Rate", "Cost", "CIF", "Duty", "OPT", "VAT", "Total", ""]
                      .map((h, i) => (
                        <th key={i} style={{
                          textAlign: ["Cost", "CIF", "Duty", "OPT", "VAT", "Total"].includes(h) ? "right" : "left",
                          padding: "8px 8px",
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                          letterSpacing: "0.08em", color: C.inkLight, fontWeight: 600,
                          textTransform: "uppercase",
                        }}>
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {manifest.lines.length === 0 ? (
                    <tr><td colSpan={12} style={{ padding: 32, textAlign: "center", fontFamily: "'Fraunces', serif", color: C.inkLight, fontStyle: "italic" }}>
                      No lines yet — add your first line below.
                    </td></tr>
                  ) : manifest.lines.map(line => (
                    <LineRow
                      key={line.id}
                      manifestId={manifest.id}
                      line={line}
                      onChanged={load}
                      onDelete={(l) => setConfirmDelete(l)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3 — Officer corrections, only shown after examination */}
          {manifest.officer_examination
            && manifest.officer_examination.corrections.length > 0 && (() => {
            // Cell style for Section 3 rows. Same Calibri/monospace look as
            // Section 2 cells but with the pale-yellow background used in
            // the worksheet XLSX, so the broker recognises this on screen
            // as the same Section 3 region they'll see in the file.
            const cellStyleS3: React.CSSProperties = {
              padding: "8px 8px",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
              color: C.inkMid, verticalAlign: "middle",
            };
            return (
            <div style={{
              background: C.paper, border: `1px solid ${C.paperBorder}`,
              borderRadius: 4, overflow: "hidden", marginTop: 16,
            }}>
              <div style={{
                padding: "10px 14px", background: "#FCE4D6",
                borderBottom: `1px solid ${C.paperBorder}`,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                letterSpacing: "0.1em", color: "#3D3830", textTransform: "uppercase",
                fontWeight: 700,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span>
                  Section 3 — Officer Corrections ({manifest.officer_examination.corrections.length})
                </span>
                <span style={{
                  fontFamily: "'Fraunces', serif", fontStyle: "italic",
                  fontSize: 11, color: "#6B6560", letterSpacing: "normal",
                  textTransform: "none", fontWeight: 400,
                }}>
                  Examined by {manifest.officer_examination.examining_officer || "—"}
                  {manifest.officer_examination.examined_at
                    ? ` · ${manifest.officer_examination.examined_at}` : ""}
                </span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: "#FADBD8", borderBottom: `1px solid ${C.paperBorder}` }}>
                      {[
                        "Line", "Description", "Officer THN", "Kind",
                        "Add Cost USD", "Adj. CIF TTD", "Add Duty", "Add OPT",
                        "Add VAT", "Add Total", "Flags",
                      ].map((h, i) => (
                        <th key={i} style={{
                          textAlign: ["Add Cost USD", "Adj. CIF TTD", "Add Duty",
                                      "Add OPT", "Add VAT", "Add Total"].includes(h)
                            ? "right" : "left",
                          padding: "8px 8px",
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                          letterSpacing: "0.08em", color: C.inkMid, fontWeight: 700,
                          textTransform: "uppercase",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {manifest.officer_examination.corrections.map((corr, idx) => {
                      // Look up the original line for context (description shown
                      // in the row so the officer can see what was uplifted).
                      const originalLine = corr.line_no != null
                        ? manifest.lines.find(l => l.line_no === corr.line_no)
                        : null;
                      const isNewLine = corr.line_no == null || corr.kind === "new_line";
                      const flags: string[] = [];
                      if (corr.detained_seized) flags.push("Detained/Seized");
                      if (corr.dep_in_tshed) flags.push("Dep. in T/Shed");
                      const fillS3 = "#FFF2CC";  // pale yellow, matches XLSX Section 3
                      return (
                        <tr key={idx} style={{
                          background: fillS3,
                          borderBottom: `1px solid ${C.paperBorder}`,
                        }}>
                          <td style={{
                            ...cellStyleS3, fontWeight: 600,
                            color: isNewLine ? "#C65911" : C.ink,
                          }}>
                            {corr.line_no != null ? `#${corr.line_no}` : "NEW"}
                          </td>
                          <td style={{ ...cellStyleS3, fontFamily: "'Fraunces', serif", fontSize: 12 }}>
                            {(() => {
                              const orig = originalLine ? originalLine.description : "";
                              const nu = (corr.new_description || "").trim();
                              // Description was genuinely changed by the officer
                              // when a new_description is present AND differs
                              // from the original line's description.
                              const changed = nu && nu !== orig;
                              if (changed) {
                                return (
                                  <span>
                                    <span style={{
                                      textDecoration: "line-through",
                                      color: C.inkLight, fontSize: 11,
                                    }}>
                                      {orig || "—"}
                                    </span>
                                    <span style={{
                                      display: "block", fontWeight: 600,
                                      color: "#C65911",
                                    }}>
                                      → {nu}
                                    </span>
                                  </span>
                                );
                              }
                              return nu || orig
                                || (isNewLine ? "(officer-discovered)" : "—");
                            })()}
                          </td>
                          <td style={cellStyleS3}>
                            {corr.officer_thn || "—"}
                          </td>
                          <td style={{
                            ...cellStyleS3, fontSize: 10,
                            color: C.inkLight, textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}>
                            {corr.kind}
                          </td>
                          <td style={{ ...cellStyleS3, textAlign: "right" }}>
                            {fmtUsd(corr.add_cost_usd || 0)}
                          </td>
                          <td style={{ ...cellStyleS3, textAlign: "right" }}>
                            {fmtTtd(corr.adjusted_cif_ttd || 0)}
                          </td>
                          <td style={{ ...cellStyleS3, textAlign: "right" }}>
                            {fmtTtd(corr.add_duty || 0)}
                          </td>
                          <td style={{ ...cellStyleS3, textAlign: "right" }}>
                            {fmtTtd(corr.add_opt || 0)}
                          </td>
                          <td style={{ ...cellStyleS3, textAlign: "right" }}>
                            {fmtTtd(corr.add_vat || 0)}
                          </td>
                          <td style={{
                            ...cellStyleS3, textAlign: "right",
                            fontWeight: 700, color: C.ink,
                          }}>
                            {fmtTtd(corr.add_total
                              || ((corr.add_duty || 0)
                                  + (corr.add_opt || 0)
                                  + (corr.add_vat || 0)))}
                          </td>
                          <td style={{ ...cellStyleS3, fontSize: 10 }}>
                            {flags.length ? flags.join(" · ") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}

          <AddLineRow manifestId={manifest.id} onAdded={load} />
        </div>

        {/* Totals panel */}
        <div style={{
          background: C.paper, border: `1px solid ${C.paperBorder}`,
          borderRadius: 4, padding: 18, height: "fit-content", position: "sticky", top: 80,
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            letterSpacing: "0.1em", color: C.amber, textTransform: "uppercase",
            fontWeight: 700, marginBottom: 12,
          }}>
            Non Trade Worksheet Totals
          </div>
          {[
            ["Total CIF", t.total_cif_ttd],
            ["Duty", t.total_duty],
            ["OPT (7%)", t.total_opt],
            ["VAT (12.5%)", t.total_vat],
          ].map(([label, val]) => (
            <div key={label as string} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${C.paperBorder}` }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.inkLight, letterSpacing: "0.04em" }}>
                {label as string}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: C.inkMid, fontWeight: 600 }}>
                {fmtTtd(val as number)}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 0 4px 0" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.ink, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
              Total Taxes
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: C.ink, fontWeight: 700 }}>
              {fmtTtd(t.total_taxes)}
            </div>
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 11, color: C.inkLight, fontStyle: "italic", marginTop: 6 }}>
            All amounts in TTD. Exchange rate {manifest.exch_rate.toFixed(5)} TTD/USD.
          </div>

          {manifest.officer_examination && (() => {
            // Aggregate the additional taxes from officer corrections so the
            // broker sees the uplifted totals at a glance.
            const corrs = manifest.officer_examination.corrections;
            const addDuty = corrs.reduce((s, c) => s + (c.add_duty || 0), 0);
            const addOpt = corrs.reduce((s, c) => s + (c.add_opt || 0), 0);
            const addVat = corrs.reduce((s, c) => s + (c.add_vat || 0), 0);
            const addTotal = addDuty + addOpt + addVat;
            const grandTotal = t.total_taxes + addTotal;
            return (
              <div style={{
                marginTop: 18, paddingTop: 14,
                borderTop: `1px dashed ${C.paperBorder}`,
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  letterSpacing: "0.1em", color: "#7CE38B",
                  textTransform: "uppercase", fontWeight: 700, marginBottom: 8,
                }}>
                  Section 3 · Additional Taxes
                </div>
                {[
                  ["Add. Duty", addDuty],
                  ["Add. OPT", addOpt],
                  ["Add. VAT", addVat],
                ].map(([label, val]) => (
                  <div key={label as string} style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", padding: "6px 0",
                    borderBottom: `1px solid ${C.paperBorder}`,
                  }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: C.inkLight, letterSpacing: "0.04em",
                    }}>
                      {label as string}
                    </div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                      color: C.inkMid, fontWeight: 600,
                    }}>
                      {fmtTtd(val as number)}
                    </div>
                  </div>
                ))}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "baseline", padding: "10px 0 4px 0",
                }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    color: C.ink, letterSpacing: "0.06em",
                    textTransform: "uppercase", fontWeight: 700,
                  }}>
                    Uplifted Total
                  </div>
                  <div style={{
                    fontFamily: "'Fraunces', serif", fontSize: 22,
                    color: C.ink, fontWeight: 700,
                  }}>
                    {fmtTtd(grandTotal)}
                  </div>
                </div>
                <div style={{
                  fontFamily: "'Fraunces', serif", fontSize: 11,
                  color: C.inkLight, fontStyle: "italic", marginTop: 4,
                }}>
                  Section 2 ({fmtTtd(t.total_taxes)}) + Section 3 ({fmtTtd(addTotal)})
                  across {corrs.length} correction{corrs.length === 1 ? "" : "s"}.
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete line?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove line {confirmDelete?.line_no} ({confirmDelete?.description}) and renumber the remaining lines.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && onDeleteLine(confirmDelete)}
              style={{ background: C.critBorder, color: "#fff" }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {hazmatModalOpen && (
        <HazmatFormDialog
          manifestId={manifest.id}
          manifestNo={manifest.manifest_no}
          arrivalDate={manifest.arrival_date}
          declarantVatNo={manifest.declarant_vat_no}
          onClose={() => setHazmatModalOpen(false)}
        />
      )}
    </div>
  );
}
