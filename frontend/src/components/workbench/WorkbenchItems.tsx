import { useState } from "react";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { HsLookup } from "@/components/HsLookup";

// ─── Types ────────────────────────────────────────────────────────────────
interface Item {
  id: string;
  description: string;
  hsCode: string;
  qty: number;
  packageType: string;
  grossKg: number;
  netKg: number;
  itemValue: number;
  dutyTaxCode: string;
  dutyTaxBase: string;
  cpc: string;
  unitCode: string;
  countryOfOrigin?: string;
  marks1?: string;
  marks2?: string;
  blAwbNumber?: string;
  currency?: string;
  exchangeRate?: number;
  extendedCustomsProcedure?: number;
  nationalCustomsProcedure?: number;
  quotaCode?: string;
  rateOfAdjustment?: number;
  statisticalValue?: number;
  itemValueLocal?: number;
}

interface HsRates {
  dutyPct: number;
  surchargePct: number;
  vatPct: number;
  code: string;
  description: string;
  dutyRate: string;
}

interface WorkbenchItemsProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  packages: Array<{ code: string; label: string }>;
  unitCodes: Array<{ code: string; label: string }>;
  dutyTaxCodes: Array<{ code: string; abbr?: string; label: string }>;
  dutyTaxBases: Array<{ code: string; label: string }>;
  cpcCodes: Array<{ code: string; cpc?: string; label: string }>;
  hsTariffSamples: Array<{ description: string; tariff: string; taxes?: Array<{ code: string; rate: number }> }>;
  sectionErrors: number;
  sectionWarnings: number;
  onHsRatesApplied?: (rates: HsRates) => void;
}

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// ─── Field helpers ─────────────────────────────────────────────────────────
function WbField({
  label, value, onChange, mono = false,
  warn = false, critical = false, placeholder, type = "text",
}: {
  label: string; value: string | number;
  onChange: (v: string) => void;
  mono?: boolean; warn?: boolean; critical?: boolean;
  placeholder?: string; type?: string;
}) {
  const cls = critical ? "critical" : warn ? "warn" : "";
  return (
    <div className={`wb-field ${cls}`}>
      <div className="wb-field-label">{label}</div>
      <input
        type={type}
        className={`wb-field-input${mono ? " mono" : ""}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function WbSelect({
  label, value, onValueChange, options, valueKey, labelKey,
}: {
  label: string; value: string; onValueChange: (v: string) => void;
  options: any[]; valueKey: string; labelKey: string;
}) {
  return (
    <div className="wb-field">
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

function SubHead({ label }: { label: string }) {
  return <div className="wb-subhead">{label}</div>;
}

// ─── Single item editor ─────────────────────────────────────────────────────
function ItemEditor({
  item, idx, total,
  onChange, onRemove, onHsRatesApplied,
  packages, unitCodes, dutyTaxCodes, dutyTaxBases, cpcCodes,
}: {
  item: Item; idx: number; total: number;
  onChange: (id: string, key: keyof Item, value: any) => void;
  onRemove: (id: string) => void;
  onHsRatesApplied?: (rates: HsRates) => void;
  packages: any[]; unitCodes: any[]; dutyTaxCodes: any[];
  dutyTaxBases: any[]; cpcCodes: any[];
}) {
  const [showHsSearch, setShowHsSearch] = useState(false);
  const [appliedRate, setAppliedRate] = useState<string | null>(null);
  const S = (k: keyof Item) => (v: string) => onChange(item.id, k, v);
  const N = (k: keyof Item) => (v: string) => onChange(item.id, k, Number(v || 0));

  return (
    <div className="wb-item-card">
      {/* Item header */}
      <div className="wb-item-card-header">
        <span className="wb-item-card-title">
          ITEM {idx + 1} OF {total}
        </span>
        {total > 1 && (
          <button
            className="wb-btn wb-btn-danger"
            style={{ padding: "3px 10px", fontSize: 11 }}
            onClick={() => onRemove(item.id)}
          >
            Remove
          </button>
        )}
      </div>

      {/* HS Code — most critical field, prominent display */}
      <div className="wb-hs-hero">
        <div style={{ flex: 1 }}>
          <div className="wb-hs-label">HS CODE · VERIFY AGAINST TT TARIFF</div>
          <input
            className="wb-hs-input"
            value={item.hsCode}
            onChange={e => S("hsCode")(e.target.value)}
            placeholder="00000000"
          />
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className="wb-btn wb-btn-ghost"
            onClick={() => setShowHsSearch(v => !v)}
            style={{ fontWeight: showHsSearch ? 700 : 400 }}
          >
            {showHsSearch ? "Hide search" : "Search HS ↓"}
          </button>
          <a
            href="https://customs.gov.tt"
            target="_blank"
            rel="noopener noreferrer"
            className="wb-btn wb-btn-ghost"
            style={{ textDecoration: "none" }}
          >
            TT TARIFF ↗
          </a>
        </div>
      </div>

      {showHsSearch && (
        <HsLookup
          defaultQuery={item.description}
          onSelect={(code, description, dutyRate, result) => {
            onChange(item.id, "hsCode", code);
            setShowHsSearch(false);
            if (result && onHsRatesApplied) {
              const rates: HsRates = {
                code,
                description,
                dutyRate,
                dutyPct:      result.dutyPct      ?? 0,
                surchargePct: result.surchargePct ?? 0,
                vatPct:       result.vatPct       ?? 12.5,
              };
              setAppliedRate(`${dutyRate} · ${rates.vatPct}% VAT`);
              onHsRatesApplied(rates);
            }
          }}
          onClose={() => setShowHsSearch(false)}
          theme="paper"
        />
      )}
      {appliedRate && (
        <div style={{
          fontFamily: "var(--wb-font-mono)", fontSize: 10,
          color: "var(--wb-approved)", letterSpacing: "0.06em",
          padding: "4px 0 2px",
        }}>
          ✓ RATES APPLIED: {appliedRate}
        </div>
      )}

      {/* Core description fields */}
      <SubHead label="Goods" />
      <WbField
        label="Description"
        value={item.description}
        onChange={S("description")}
        placeholder="BONELESS SKINLESS CHICKEN BREAST FILETS"
      />
      <WbField
        label="Origin (Code)"
        value={item.countryOfOrigin ?? "US"}
        onChange={S("countryOfOrigin")}
        mono placeholder="US"
      />

      {/* Package details */}
      <SubHead label="Packages" />
      <WbField
        label="Qty / Packages"
        value={item.qty}
        onChange={N("qty")}
        mono type="number" placeholder="0"
      />
      <WbSelect
        label="Package Type"
        value={item.packageType}
        onValueChange={S("packageType")}
        options={packages} valueKey="code" labelKey="label"
      />
      <WbField
        label="Marks 1"
        value={item.marks1 ?? "AS ADDRESSED"}
        onChange={S("marks1")}
        placeholder="AS ADDRESSED"
      />
      <WbField
        label="Marks 2"
        value={item.marks2 ?? ""}
        onChange={S("marks2")}
        placeholder="Optional"
      />

      {/* Weight and value */}
      <SubHead label="Weight · Value" />
      <WbField
        label="Gross Weight (kg)"
        value={item.grossKg}
        onChange={N("grossKg")}
        mono type="number" placeholder="0.00"
      />
      <WbField
        label="Net Weight (kg)"
        value={item.netKg}
        onChange={N("netKg")}
        mono type="number" placeholder="0.00"
      />
      <WbField
        label="Item Value (Foreign)"
        value={item.itemValue}
        onChange={N("itemValue")}
        mono type="number" placeholder="0.00"
      />
      <WbField
        label="Item Value (Local)"
        value={item.itemValueLocal ?? 0}
        onChange={N("itemValueLocal")}
        mono type="number" placeholder="0.00"
      />
      <WbField
        label="Currency"
        value={item.currency ?? "USD"}
        onChange={S("currency")}
        mono placeholder="USD"
      />
      <WbField
        label="Exchange Rate"
        value={item.exchangeRate ?? 1}
        onChange={N("exchangeRate")}
        mono type="number" placeholder="1.0"
      />

      {/* Tarification */}
      <SubHead label="Tarification · Duty" />
      <WbField
        label="B/L · AWB No."
        value={item.blAwbNumber ?? ""}
        onChange={S("blAwbNumber")}
        mono placeholder="TSCW16401583"
      />
      <WbSelect
        label="Duty Tax Code"
        value={item.dutyTaxCode}
        onValueChange={S("dutyTaxCode")}
        options={dutyTaxCodes} valueKey="code" labelKey="label"
      />
      <WbSelect
        label="Duty Tax Base"
        value={item.dutyTaxBase}
        onValueChange={S("dutyTaxBase")}
        options={dutyTaxBases} valueKey="code" labelKey="label"
      />
      <WbSelect
        label="CPC"
        value={item.cpc}
        onValueChange={S("cpc")}
        options={cpcCodes} valueKey="code" labelKey="label"
      />
      <WbSelect
        label="Unit Code"
        value={item.unitCode}
        onValueChange={S("unitCode")}
        options={unitCodes} valueKey="code" labelKey="label"
      />
      <WbField
        label="Ext. Customs Proc."
        value={item.extendedCustomsProcedure ?? 4000}
        onChange={N("extendedCustomsProcedure")}
        mono type="number" placeholder="4000"
      />
      <WbField
        label="Natl. Customs Proc."
        value={item.nationalCustomsProcedure ?? 0}
        onChange={N("nationalCustomsProcedure")}
        mono type="number" placeholder="0"
      />
      <WbField
        label="Quota Code"
        value={item.quotaCode ?? "NEW"}
        onChange={S("quotaCode")}
        mono placeholder="NEW"
      />
      <WbField
        label="Rate of Adjustment"
        value={item.rateOfAdjustment ?? 1}
        onChange={N("rateOfAdjustment")}
        mono type="number" placeholder="1"
      />
      <WbField
        label="Statistical Value"
        value={item.statisticalValue ?? 0}
        onChange={N("statisticalValue")}
        mono type="number" placeholder="0.00"
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────
export function WorkbenchItems({
  items, setItems,
  packages, unitCodes, dutyTaxCodes, dutyTaxBases, cpcCodes,
  sectionErrors, sectionWarnings,
  onHsRatesApplied,
}: WorkbenchItemsProps) {

  const handleChange = (id: string, key: keyof Item, value: any) => {
    setItems(its => its.map(it => it.id === id ? { ...it, [key]: value } : it));
  };

  const handleRemove = (id: string) => {
    setItems(its => its.filter(it => it.id !== id));
  };

  const handleAdd = () => {
    setItems(its => [...its, {
      id: uid(),
      description: "", hsCode: "", qty: 1,
      packageType: "", grossKg: 0, netKg: 0, itemValue: 0,
      dutyTaxCode: "", dutyTaxBase: "", cpc: "", unitCode: "",
    }]);
  };

  const hasIssue = sectionErrors > 0 || sectionWarnings > 0;
  const titleCls = sectionErrors > 0 ? "has-errors" : sectionWarnings > 0 ? "has-warnings" : "";

  return (
    <div className="wb-card" id="section-items">
      <div className="wb-card-header">
        <span className={`wb-card-title ${titleCls}`}>
          Items · {items.length} {items.length === 1 ? "Entry" : "Entries"}
          {hasIssue && (
            <span style={{ marginLeft: 8 }}>({sectionErrors}E / {sectionWarnings}W)</span>
          )}
        </span>
        <button className="wb-btn wb-btn-ghost" onClick={handleAdd}>
          + Add Item
        </button>
      </div>

      <div className="wb-card-body" style={{ paddingBottom: 4 }}>
        {items.map((item, idx) => (
          <ItemEditor
            key={item.id}
            item={item}
            idx={idx}
            total={items.length}
            onChange={handleChange}
            onRemove={handleRemove}
            onHsRatesApplied={onHsRatesApplied}
            packages={packages}
            unitCodes={unitCodes}
            dutyTaxCodes={dutyTaxCodes}
            dutyTaxBases={dutyTaxBases}
            cpcCodes={cpcCodes}
          />
        ))}

        {items.length === 0 && (
          <div style={{
            padding: "32px 16px", textAlign: "center",
            fontFamily: "var(--wb-font-serif)", fontStyle: "italic",
            color: "var(--wb-ink-light)", fontSize: 13,
          }}>
            No items added yet. Click "Add Item" to begin.
          </div>
        )}
      </div>
    </div>
  );
}
