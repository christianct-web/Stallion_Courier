import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────────────
interface WorkbenchHeaderProps {
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  ports: Array<{ code: string; label: string }>;
  terms: Array<{ code: string; label: string }>;
  transportModes: Array<{ code: string; label: string }>;
  customsRegimes: Array<{ regimeCode: string; label: string }>;
  templates: Array<{ id: string; name: string; payload: any }>;
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  onLoadTemplate: (id: string) => void;
  sectionErrors: number;
  sectionWarnings: number;
  sectionComplete?: boolean;
}

// ─── Field components (local, consistent with design system) ─────────────
function WbField({
  label, value, onChange, mono = false,
  warn = false, critical = false, note, placeholder, tooltip,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  mono?: boolean; warn?: boolean; critical?: boolean;
  note?: string; placeholder?: string; tooltip?: string;
}) {
  const cls = critical ? "critical" : warn ? "warn" : "";
  const input = (
    <input
      className={`wb-field-input${mono ? " mono" : ""}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
  return (
    <div className={`wb-field ${cls}`}>
      <div className="wb-field-label">
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span style={{ borderBottom: "1px dotted var(--wb-paper-mid)", cursor: "help" }}>
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" style={{ fontFamily: "var(--wb-font-serif)", fontSize: 12 }}>
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : label}
      </div>
      {input}
      {note && <div className="wb-field-note" style={{ gridColumn: "1 / -1" }}>{note}</div>}
    </div>
  );
}

function WbSelect({
  label, value, onValueChange, options, valueKey, labelKey, warn = false, critical = false,
}: {
  label: string; value: string;
  onValueChange: (v: string) => void;
  options: any[]; valueKey: string; labelKey: string;
  warn?: boolean; critical?: boolean;
}) {
  const cls = critical ? "critical" : warn ? "warn" : "";
  return (
    <div className={`wb-field ${cls}`}>
      <div className="wb-field-label">{label}</div>
      <div className="wb-select" style={{ display: "flex", alignItems: "center" }}>
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger style={{ flex: 1 }}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {options.map(o => (
              <SelectItem key={o[valueKey]} value={o[valueKey]}>
                {o[labelKey]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function SubHead({ label, warn = false }: { label: string; warn?: boolean }) {
  return <div className={`wb-subhead${warn ? " warn" : ""}`}>{label}</div>;
}

// ─── Component ────────────────────────────────────────────────────────────
export function WorkbenchHeader({
  form, setForm, ports, terms, transportModes, customsRegimes,
  templates, selectedTemplateId, setSelectedTemplateId, onLoadTemplate,
  sectionErrors, sectionWarnings, sectionComplete,
}: WorkbenchHeaderProps) {

  const F = (k: string) => (v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const hasIssue = sectionErrors > 0 || sectionWarnings > 0;
  const titleCls = sectionErrors > 0 ? "has-errors" : sectionWarnings > 0 ? "has-warnings" : "";

  // Required fields that are missing — shown as a "complete these first" banner
  const missingRequired = [
    { label: "Ref. Number",   ok: !!form.declarationRef },
    { label: "Port of Entry", ok: !!form.port },
    { label: "Customs Regime",ok: !!form.customsRegime },
    { label: "Invoice No.",   ok: !!form.invoiceNumber },
    { label: "Vessel / Flight",ok:!!form.vesselName },
    { label: "AWB / B/L No.", ok: !!form.blAwbNumber },
    { label: "ETA Date",      ok: !!form.etaDate },
  ].filter(f => !f.ok);

  return (
    <div className="wb-card" id="section-header">
      <div className="wb-card-header">
        <span className={`wb-card-title ${titleCls}`}>
          Header · Reference · Transport
          {hasIssue && (
            <span style={{ marginLeft: 8 }}>
              ({sectionErrors}E / {sectionWarnings}W)
            </span>
          )}
        </span>
        {/* Live completion badge */}
        {sectionComplete !== undefined && (
          <span style={{
            fontFamily: "var(--wb-font-mono)", fontSize: 10, fontWeight: 700,
            padding: "2px 8px", borderRadius: 3,
            background: sectionComplete ? "#EBF7F1" : "var(--wb-critical)",
            color: sectionComplete ? "var(--wb-approved)" : "var(--wb-crit-border)",
            border: `1px solid ${sectionComplete ? "var(--wb-approved)" : "var(--wb-crit-border)"}44`,
          }}>
            {sectionComplete ? "✓ Complete" : `${missingRequired.length} missing`}
          </span>
        )}
        {/* Template loader */}
        {templates.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Select
              value={selectedTemplateId}
              onValueChange={v => { setSelectedTemplateId(v); onLoadTemplate(v); }}
            >
              <SelectTrigger style={{
                fontFamily: "var(--wb-font-mono)", fontSize: 11,
                height: 28, padding: "0 10px", border: "1px solid var(--wb-void-border)",
                background: "var(--wb-void)", color: "var(--wb-ghost)",
                borderRadius: "var(--wb-radius)",
              }}>
                <SelectValue placeholder="Load template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="wb-card-body">
        {/* ── Required fields banner ── */}
        {missingRequired.length > 0 && (
          <div style={{
            padding: "8px 16px",
            background: "#FEF0E8",
            borderBottom: "1px solid #963A1022",
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          }}>
            <span style={{
              fontFamily: "var(--wb-font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.12em", color: "var(--wb-correction)", flexShrink: 0,
            }}>
              COMPLETE FIRST
            </span>
            {missingRequired.map(f => (
              <span key={f.label} style={{
                fontFamily: "var(--wb-font-serif)", fontSize: 11,
                color: "var(--wb-correction)",
                padding: "1px 7px", borderRadius: 2,
                background: "#963A1011", border: "1px solid #963A1022",
              }}>
                {f.label}
              </span>
            ))}
          </div>
        )}
        {/* ── Declaration reference ── */}
        <SubHead label="Declaration" />
        <WbField
          label="Ref. Number"
          value={form.declarationRef}
          onChange={F("declarationRef")}
          mono
          critical={!form.declarationRef}
          placeholder="LB01/23"
          tooltip="Unique declaration reference number assigned by the broker"
        />
        <WbField
          label="Invoice No."
          value={form.invoiceNumber}
          onChange={F("invoiceNumber")}
          mono placeholder="446506"
        />
        <WbField
          label="Invoice Date"
          value={form.invoiceDate}
          onChange={F("invoiceDate")}
          mono placeholder="YYYY-MM-DD"
        />

        {/* ── Location / regime ── */}
        <SubHead label="Port · Regime · Terms" />
        <WbSelect
          label="Port of Entry"
          value={form.port} onValueChange={F("port")}
          options={ports} valueKey="code" labelKey="label"
          critical={!form.port}
        />
        <WbSelect
          label="Delivery Term"
          value={form.term} onValueChange={F("term")}
          options={terms} valueKey="code" labelKey="label"
        />
        <WbSelect
          label="Transport Mode"
          value={form.modeOfTransport} onValueChange={F("modeOfTransport")}
          options={transportModes} valueKey="code" labelKey="label"
        />
        <WbSelect
          label="Customs Regime"
          value={form.customsRegime} onValueChange={F("customsRegime")}
          options={customsRegimes} valueKey="regimeCode" labelKey="label"
          critical={!form.customsRegime}
        />

        {/* ── Transport ── */}
        <SubHead label="Transport · Vessel · AWB" warn={!form.vesselName} />
        <WbField
          label="Vessel / Flight"
          value={form.vesselName}
          onChange={F("vesselName")}
          critical={!form.vesselName}
          note={!form.vesselName ? "Required — check source document for vessel name or flight number" : undefined}
          placeholder="TROPIC ISLAND or flight no."
          tooltip="Name of vessel or flight number from the B/L or AWB"
        />
        <WbField
          label="B/L · AWB No."
          value={form.blAwbNumber}
          onChange={F("blAwbNumber")}
          mono critical={!form.blAwbNumber}
          placeholder="TSCW16401583"
        />
        <WbField
          label="AWB Date (SOB)"
          value={form.blAwbDate}
          onChange={F("blAwbDate")}
          mono placeholder="YYYY-MM-DD"
          tooltip="Shipped on Board date — may appear as 'Laden on Board', 'Voyage Date', or 'Date Shipped' on source document. Used for CBTT rate lookup."
          note={form.blAwbDate ? undefined : "Used for Central Bank TT exchange rate lookup"}
        />
        <WbField
          label="ETA"
          value={form.etaDate}
          onChange={F("etaDate")}
          mono critical={!form.etaDate}
          placeholder="YYYY-MM-DD"
        />
        <WbField
          label="Rotation No."
          value={form.rotationNumber || ""}
          onChange={F("rotationNumber")}
          mono
          placeholder="e.g. 2024-001234"
          tooltip="Port Authority rotation number assigned on vessel arrival. Required for sea freight declarations. Found on the vessel manifest or port entry documents."
          note={form.modeOfTransport && (form.modeOfTransport.startsWith("1") || form.modeOfTransport.startsWith("11") || form.modeOfTransport.startsWith("12") || form.modeOfTransport.startsWith("13")) && !form.rotationNumber
            ? "Rotation number recommended for sea freight — obtain from Port Authority on vessel arrival"
            : undefined}
        />

        {/* ── Financial ── */}
        <SubHead label="Financial · Payment" />
        <WbField
          label="Currency"
          value={form.currency}
          onChange={F("currency")}
          mono placeholder="USD"
        />
        <WbField
          label="Bank Code"
          value={form.bankCode}
          onChange={F("bankCode")}
          mono placeholder="01"
        />
        <WbField
          label="Mode of Payment"
          value={form.modeOfPayment}
          onChange={F("modeOfPayment")}
          mono placeholder="CASH"
        />
        <WbField
          label="Terms Code"
          value={form.termsCode}
          onChange={F("termsCode")}
          mono placeholder="99"
        />
        <WbField
          label="Terms Description"
          value={form.termsDescription}
          onChange={F("termsDescription")}
          placeholder="Basic"
        />

        {/* ── Country ── */}
        <SubHead label="Country Information" />
        <WbField
          label="First Destination"
          value={form.countryFirstDestination}
          onChange={F("countryFirstDestination")}
          mono placeholder="US"
        />
        <WbField
          label="Trading Country"
          value={form.tradingCountry}
          onChange={F("tradingCountry")}
          mono placeholder="US"
        />
        <WbField
          label="Export Country Code"
          value={form.exportCountryCode}
          onChange={F("exportCountryCode")}
          mono placeholder="US"
        />
        <WbField
          label="Export Country Name"
          value={form.exportCountryName}
          onChange={F("exportCountryName")}
          placeholder="United States"
        />
        <WbField
          label="Country of Origin"
          value={form.countryOfOriginName}
          onChange={F("countryOfOriginName")}
          placeholder="United States"
        />
      </div>
    </div>
  );
}
