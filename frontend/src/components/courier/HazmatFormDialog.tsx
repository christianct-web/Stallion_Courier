/**
 * HazmatFormDialog — courier-data form modal.
 *
 * The broker opens this from the "Hazmat XLSX" button on the uplifted
 * (post-officer-exam) workbench view. The fields populate the top of the
 * Swissport Transit Shed Courier Data Form. EVERY field is optional — the
 * broker can click Download with the form completely empty and still get
 * a valid Hazmat XLSX (the blanks just render empty in Excel).
 *
 * Fields here mirror the form layout in the broker's existing template:
 *   - Date, NTDE No, CED Receipt No, VAT No
 *   - Date of Arrival, Rot. No, Carrier
 *   - Skids, Boxes, Bags, Commercial Pcs, Non-Commercial Pcs, Total Pkgs
 *   - Detained, Seized, Bonded
 *
 * AWB/BL # and Name of Courier are NOT here — they come from the manifest
 * automatically.
 */
import { useState } from "react";
import { toast } from "sonner";
import { downloadHazmatWithFields, HazmatFormFields } from "@/services/courierApi";
import { C } from "./tokens";

type Props = {
  manifestId: string;
  manifestNo: string;
  arrivalDate: string;
  declarantVatNo?: string;
  onClose: () => void;
};

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10,
      letterSpacing: "0.1em",
      color: C.amber,
      textTransform: "uppercase",
      fontWeight: 700,
      marginBottom: 10,
      marginTop: 4,
    }}
  >
    {children}
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <label
    style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10,
      letterSpacing: "0.08em",
      color: C.inkLight,
      textTransform: "uppercase",
      fontWeight: 600,
      display: "block",
      marginBottom: 4,
    }}
  >
    {children}
  </label>
);

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 13,
  padding: "8px 10px",
  border: `1px solid ${C.paperBorder}`,
  borderRadius: 4,
  background: "#fff",
  color: C.ink,
  outline: "none",
};

export function HazmatFormDialog({
  manifestId,
  manifestNo,
  arrivalDate,
  declarantVatNo,
  onClose,
}: Props) {
  // Pre-fill what we can from the manifest so the broker doesn't retype
  // information that's already known. They can still edit any field.
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [ntdeNo, setNtdeNo] = useState("");
  const [cedReceiptNo, setCedReceiptNo] = useState("");
  const [vatNo, setVatNo] = useState(declarantVatNo || "");
  const [carrier, setCarrier] = useState("");
  const [dateOfArrival, setDateOfArrival] = useState(arrivalDate || "");
  const [rotNo, setRotNo] = useState("");
  const [skids, setSkids] = useState("");
  const [boxes, setBoxes] = useState("");
  const [bags, setBags] = useState("");
  const [commercialPcs, setCommercialPcs] = useState("");
  const [nonCommercialPcs, setNonCommercialPcs] = useState("");
  const [totalPkgs, setTotalPkgs] = useState("");
  const [detained, setDetained] = useState("");
  const [seized, setSeized] = useState("");
  const [bonded, setBonded] = useState("");

  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    // Build the fields object. Empty strings are dropped so the server
    // gets `undefined` (and writes the cell blank) instead of an empty
    // string that would shows as "" in Excel.
    const toNumOrUndef = (s: string): number | undefined => {
      if (!s.trim()) return undefined;
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    };

    const fields: HazmatFormFields = {
      date: date || undefined,
      ntde_no: ntdeNo || undefined,
      ced_receipt_no: cedReceiptNo || undefined,
      vat_no: vatNo || undefined,
      carrier: carrier || undefined,
      date_of_arrival: dateOfArrival || undefined,
      rot_no: rotNo || undefined,
      no_of_skids: toNumOrUndef(skids),
      no_of_boxes: toNumOrUndef(boxes),
      no_of_bags: toNumOrUndef(bags),
      no_of_commercial_pcs: toNumOrUndef(commercialPcs),
      no_of_non_commercial_pcs: toNumOrUndef(nonCommercialPcs),
      total_no_of_pkgs: toNumOrUndef(totalPkgs),
      no_of_pkgs_detained: toNumOrUndef(detained),
      no_of_pkgs_seized: toNumOrUndef(seized),
      no_of_pkgs_bonded: toNumOrUndef(bonded),
    };

    setDownloading(true);
    try {
      await downloadHazmatWithFields(manifestId, fields);
      toast.success("Hazmat XLSX downloaded");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Hazmat download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 120,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720,
          maxHeight: "92vh",
          overflowY: "auto",
          background: C.paper,
          borderRadius: 6,
          border: `1px solid ${C.paperBorder}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header strip */}
        <div
          style={{
            background: C.voidMid,
            color: C.paper,
            padding: "18px 24px",
            borderRadius: "6px 6px 0 0",
            borderBottom: `1px solid ${C.voidBorder}`,
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.12em",
              color: C.amber,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Hazmat Courier Data Form
          </div>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 22,
              fontWeight: 600,
              lineHeight: 1.1,
            }}
          >
            Swissport Transit Shed — {manifestNo}
          </div>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 11,
              color: C.ghost,
              fontStyle: "italic",
              marginTop: 8,
            }}
          >
            All fields are optional. Any field left blank will appear empty in
            the downloaded XLSX — fill in what you have and download.
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {/* Top-of-form identifiers */}
          <SectionHeader>Form identifiers</SectionHeader>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <Label>Date</Label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
                placeholder="15.05.2026"
              />
            </div>
            <div>
              <Label>NTDE No</Label>
              <input
                value={ntdeNo}
                onChange={(e) => setNtdeNo(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>CED Receipt No</Label>
              <input
                value={cedReceiptNo}
                onChange={(e) => setCedReceiptNo(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>VAT No</Label>
              <input
                value={vatNo}
                onChange={(e) => setVatNo(e.target.value)}
                style={inputStyle}
                placeholder="V123990"
              />
            </div>
          </div>

          {/* Carrier / arrival */}
          <SectionHeader>Arrival</SectionHeader>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <Label>Date of Arrival</Label>
              <input
                value={dateOfArrival}
                onChange={(e) => setDateOfArrival(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Rot. No</Label>
              <input
                value={rotNo}
                onChange={(e) => setRotNo(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Carrier</Label>
              <input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Package counts */}
          <SectionHeader>Package counts</SectionHeader>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <Label>No. of Skids</Label>
              <input
                type="number"
                value={skids}
                onChange={(e) => setSkids(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>No. of Boxes</Label>
              <input
                type="number"
                value={boxes}
                onChange={(e) => setBoxes(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>No. of Bags</Label>
              <input
                type="number"
                value={bags}
                onChange={(e) => setBags(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div>
              <Label>Commercial Pcs</Label>
              <input
                type="number"
                value={commercialPcs}
                onChange={(e) => setCommercialPcs(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Non-Commercial Pcs</Label>
              <input
                type="number"
                value={nonCommercialPcs}
                onChange={(e) => setNonCommercialPcs(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Total No. of Pkgs</Label>
              <input
                type="number"
                value={totalPkgs}
                onChange={(e) => setTotalPkgs(e.target.value)}
                style={inputStyle}
                placeholder="Auto-sums if left blank"
              />
            </div>
          </div>

          {/* Detained / Seized / Bonded */}
          <SectionHeader>Disposition</SectionHeader>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <div>
              <Label>Pkgs Detained</Label>
              <input
                type="number"
                value={detained}
                onChange={(e) => setDetained(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Pkgs Seized</Label>
              <input
                type="number"
                value={seized}
                onChange={(e) => setSeized(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Pkgs Bonded</Label>
              <input
                type="number"
                value={bonded}
                onChange={(e) => setBonded(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              borderTop: `1px solid ${C.paperBorder}`,
              paddingTop: 16,
            }}
          >
            <button
              onClick={onClose}
              disabled={downloading}
              style={{
                padding: "8px 16px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: "transparent",
                border: `1px solid ${C.paperBorder}`,
                borderRadius: 4,
                color: C.inkMid,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{
                padding: "8px 20px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: C.amber,
                border: `1px solid ${C.amber}`,
                borderRadius: 4,
                color: "#fff",
                cursor: downloading ? "wait" : "pointer",
                opacity: downloading ? 0.6 : 1,
                fontWeight: 600,
              }}
            >
              {downloading ? "Downloading…" : "↓ Download Hazmat XLSX"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
