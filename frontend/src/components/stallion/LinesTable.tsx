/**
 * LinesTable.tsx — the job's line grid (Verify station).
 *
 * Inline edit for value and duty %, HS classification via HsClassifyCell, and
 * an expandable drawer per line for the C82 line fields and the C84
 * concession controls. Every money column is the server's computed value.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { RefData, SheetLine } from "@/services/sheetApi";
import { HsClassifyCell } from "@/pages/HsClassifyCell";
import { money } from "./model";
import { SelectField, TextField } from "./ui";

type Props = {
  lines: SheetLine[];
  refData: RefData;
  locked: boolean;
  onPatch: (lineNo: number, patch: Partial<SheetLine>) => void;
  onAdd: () => void;
  onDelete: (lineNo: number) => void;
  onReload: () => Promise<void> | void;
};

function InlineNum({ value, onCommit, label, disabled }: {
  value: number | null | undefined; onCommit: (n: number) => void; label: string; disabled?: boolean;
}) {
  const [v, setV] = useState<string | null>(null);
  const shown = v ?? String(value ?? "");
  return (
    <input className="st-input right" inputMode="decimal" aria-label={label} value={shown} disabled={disabled}
      onFocus={() => setV(String(value ?? ""))}
      onChange={e => setV(e.target.value)}
      onBlur={() => {
        if (v !== null && v !== String(value ?? "")) {
          const n = Number(v);
          if (!Number.isNaN(n)) onCommit(n);
        }
        setV(null);
      }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

function RowDrawer({ line, refData, onUpdate }: {
  line: SheetLine; refData: RefData; onUpdate: (patch: Partial<SheetLine>) => void;
}) {
  const num = (k: keyof SheetLine) => (v: string) => onUpdate({ [k]: Number(v) } as Partial<SheetLine>);
  const cat = refData.concessions?.find(c => c.code === line.concession_code);
  return (
    <>
      <div className="st-subhead">Line {line.line_no} · declaration fields</div>
      <div className="st-grid">
        <SelectField label="CPC" className="span-2" value={line.cpc} options={refData.cpc} onCommit={v => onUpdate({ cpc: v })} />
        <SelectField label="Country of origin" value={line.country_of_origin} options={refData.countries}
          onCommit={v => onUpdate({ country_of_origin: v })} />
        <TextField label="Gross kg" type="number" align="right" value={line.gross_kg ?? 0} onCommit={num("gross_kg")} />
        <TextField label="Net kg" type="number" align="right" value={line.net_kg ?? 0} onCommit={num("net_kg")} />
        <SelectField label="Package type" value={line.package_type} options={refData.package_types}
          onCommit={v => onUpdate({ package_type: v })} />
        <TextField label="Package name" value={line.package_type_name || ""} onCommit={v => onUpdate({ package_type_name: v })} />
        <TextField label="Package count" type="number" align="right" value={line.package_count} onCommit={num("package_count")} />
        <SelectField label="Supp. unit" value={line.supplementary_unit} options={refData.supplementary_units}
          onCommit={v => onUpdate({ supplementary_unit: v })} />
        <TextField label="Supp. qty" type="number" align="right" value={line.supplementary_qty} onCommit={num("supplementary_qty")} />
        <TextField label="Licence no." value={line.licence_no} onCommit={v => onUpdate({ licence_no: v })} />
        <TextField label="National CPC" value={line.national_customs_procedure || "000"}
          onCommit={v => onUpdate({ national_customs_procedure: v })} />
        <TextField label="Quota code" value={line.quota_code || "NEW"} onCommit={v => onUpdate({ quota_code: v })} />
        <TextField label="Rate adj." type="number" align="right" value={line.rate_of_adjustment ?? 1} onCommit={num("rate_of_adjustment")} />
        <TextField label="Marks 1" value={line.marks1 || ""} onCommit={v => onUpdate({ marks1: v })} />
        <TextField label="Marks 2" value={line.marks2 || ""} onCommit={v => onUpdate({ marks2: v })} />
        <SelectField label="Effects group" value={line.effects_group || "household"}
          options={[{ code: "household", label: "household" }, { code: "personal", label: "personal" }]}
          onCommit={v => onUpdate({ effects_group: v as SheetLine["effects_group"] })} />
        <SelectField label="Relieved override" value={line.relieved_override ? "yes" : "no"}
          options={[{ code: "no", label: "No" }, { code: "yes", label: "Yes" }]}
          onCommit={v => onUpdate({ relieved_override: v === "yes" })} />
      </div>

      {(refData.concessions?.length ?? 0) > 0 && (
        <>
          <div className="st-subhead">C84 concession</div>
          <div className="st-grid">
            <SelectField label="Concession" className="span-2" value={line.concession_code || ""}
              placeholder="None (dutiable)"
              options={(refData.concessions || []).map(c => ({ code: c.code, label: c.label }))}
              onCommit={v => onUpdate({ concession_code: v })} />
            {cat?.quantum === "capped" && (
              <>
                <TextField label="Engine (cc)" type="number" align="right" value={line.engine_cc ?? 0} onCommit={num("engine_cc")} />
                <TextField label="Motor veh. tax TT$" type="number" align="right" value={line.mvt_ttd ?? 0} onCommit={num("mvt_ttd")} />
                <TextField label="Cap override TT$" hint="0 uses the band" type="number" align="right"
                  value={line.cap_override_ttd ?? 0} onCommit={num("cap_override_ttd")} />
              </>
            )}
            {cat?.quantum === "rate" && (
              <>
                <TextField label="Conc. duty %" type="number" align="right" value={line.conc_duty_pct ?? 0} onCommit={num("conc_duty_pct")} />
                <TextField label="Conc. VAT %" type="number" align="right" value={line.conc_vat_pct ?? line.vat_pct} onCommit={num("conc_vat_pct")} />
              </>
            )}
          </div>
          {line.concession_code && (
            <p className="st-banner st-banner--ok" style={{ margin: "14px 0 0" }}>
              <span className="mono">
                Relief TT$ {money(line.relief_total ?? 0)}
                {cat?.quantum === "capped" && (line.cap_applied_ttd ?? 0) > 0 && <> · cap applied TT$ {money(line.cap_applied_ttd)}</>}
                {" "}· payable TT$ {money(line.total_tax)}
              </span>
            </p>
          )}
        </>
      )}
    </>
  );
}

export function LinesTable({ lines, refData, locked, onPatch, onAdd, onDelete, onReload }: Props) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (n: number) => setOpen(p => {
    const next = new Set(p);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });
  const COLS = 11;

  return (
    <div id="f-lines">
      {lines.length > 0 && <p className="st-scroll-hint" aria-hidden="true">Swipe the table sideways for HS, values and taxes</p>}
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}><span className="sr-only">Details</span></th>
              <th style={{ width: 36 }}>#</th>
              <th className="st-col-desc">Description &amp; HS code</th>
              <th className="r" style={{ width: 110 }}>Ex-works USD</th>
              <th className="r">Freight</th>
              <th className="r">CIF USD</th>
              <th className="r">CIF TT$</th>
              <th className="r" style={{ width: 76 }}>Duty %</th>
              <th className="r">Duty</th>
              <th className="r">VAT</th>
              <th className="r">Total tax</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={COLS} style={{ padding: "28px 12px", textAlign: "center", color: "var(--ink-3)" }}>
                  No lines yet. Upload a document on the Documents station, or add a line by hand.
                </td>
              </tr>
            )}
            {lines.map(ln => {
              const isOpen = open.has(ln.line_no);
              return (
                <Fragment key={ln.id}>
                  <tr className={isOpen ? "is-open" : undefined}>
                    <td>
                      <button type="button" className="st-iconbtn" onClick={() => toggle(ln.line_no)}
                        aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} fields for line ${ln.line_no}`}>
                        {isOpen ? <ChevronDown /> : <ChevronRight />}
                      </button>
                    </td>
                    <td className="num">{ln.line_no}</td>
                    <td>
                      <HsClassifyCell line={ln} onUpdate={p => onPatch(ln.line_no, p)} onReload={onReload} />
                    </td>
                    <td>
                      <InlineNum label={`Ex-works USD, line ${ln.line_no}`} value={ln.exworks_usd} disabled={locked}
                        onCommit={n => onPatch(ln.line_no, { exworks_usd: n })} />
                    </td>
                    <td className="num r">{money(ln.freight_usd)}</td>
                    <td className="num r">{money(ln.cif_usd)}</td>
                    <td className="num r">{money(ln.cif_ttd)}</td>
                    <td>
                      <InlineNum label={`Duty %, line ${ln.line_no}`} value={ln.duty_pct} disabled={locked}
                        onCommit={n => onPatch(ln.line_no, { duty_pct: n })} />
                    </td>
                    <td className="num r">{money(ln.duty)}</td>
                    <td className="num r">{money(ln.vat)}</td>
                    <td className="num r strong">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {money(ln.total_tax)}
                        {!locked && (
                          <button type="button" className="st-iconbtn st-iconbtn--danger" onClick={() => onDelete(ln.line_no)}
                            aria-label={`Delete line ${ln.line_no}`} title="Delete line"><Trash2 /></button>
                        )}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={COLS} className="st-drawer">
                        <fieldset className="st-fieldset" disabled={locked}>
                          <RowDrawer line={ln} refData={refData} onUpdate={p => onPatch(ln.line_no, p)} />
                        </fieldset>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {!locked && (
        <button type="button" className="st-addline" onClick={onAdd}><Plus aria-hidden="true" />Add line</button>
      )}
    </div>
  );
}
