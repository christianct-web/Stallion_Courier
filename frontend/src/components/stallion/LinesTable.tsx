/**
 * LinesTable.tsx — the job's line grid (Verify station).
 *
 * Inline edit for value and duty %, HS classification via HsClassifyCell, and
 * an expandable drawer per line for the C82 line fields and the C84
 * concession controls. Every money column is the server's computed value.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { FieldSource, RefData, SheetLine } from "@/services/sheetApi";
import { HsClassifyCell } from "@/pages/HsClassifyCell";
import { useIsMobile } from "@/hooks/use-mobile";
import { money } from "./model";
import { SelectField, SourceNote, TextField } from "./ui";

/** Where a line came from: the document that produced it, or a person. */
function lineOrigin(ln: SheetLine): FieldSource {
  const srcs = Object.values(ln.field_sources || {});
  const doc = srcs.find(x => x.source === "extracted");
  return doc ?? { source: "manual", at: "" };
}

type Props = {
  lines: SheetLine[];
  refData: RefData;
  locked: boolean;
  /** Rejects when the save fails (already reported to the user). */
  onPatch: (lineNo: number, patch: Partial<SheetLine>) => Promise<void>;
  onAdd: () => Promise<void>;
  onDelete: (lineNo: number) => void;
  onReload: () => Promise<void> | void;
};

function InlineNum({ value, onCommit, label, disabled }: {
  value: number | null | undefined; onCommit: (n: number) => void | Promise<unknown>; label: string; disabled?: boolean;
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
          if (!Number.isNaN(n)) Promise.resolve(onCommit(n)).catch(() => {});
        }
        setV(null);
      }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

function RowDrawer({ line, refData, onUpdate }: {
  line: SheetLine; refData: RefData; onUpdate: (patch: Partial<SheetLine>) => Promise<void>;
}) {
  const num = (k: keyof SheetLine) => (v: string) => onUpdate({ [k]: Number(v) } as Partial<SheetLine>);
  const src = (k: string) => line.field_sources?.[k];
  const cat = refData.concessions?.find(c => c.code === line.concession_code);
  return (
    <>
      <div className="st-subhead" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span>Line {line.line_no} · declaration fields</span>
        <SourceNote source={lineOrigin(line).at ? lineOrigin(line) : undefined} />
      </div>
      <div className="st-grid">
        <TextField label="Gross kg" type="number" align="right" value={line.gross_kg ?? 0} source={src("gross_kg")} onCommit={num("gross_kg")} />
        <TextField label="Net kg" type="number" align="right" value={line.net_kg ?? 0} source={src("net_kg")} onCommit={num("net_kg")} />
        <SelectField label="Package type" value={line.package_type} options={refData.package_types}
          source={src("package_type")} onCommit={v => onUpdate({ package_type: v })} />
        <TextField label="Package name" value={line.package_type_name || ""} source={src("package_type_name")} onCommit={v => onUpdate({ package_type_name: v })} />
        <TextField label="Package count" type="number" align="right" value={line.package_count} source={src("package_count")} onCommit={num("package_count")} />
        <SelectField label="Supp. unit" value={line.supplementary_unit} options={refData.supplementary_units}
          source={src("supplementary_unit")} onCommit={v => onUpdate({ supplementary_unit: v })} />
        <TextField label="Supp. qty" type="number" align="right" value={line.supplementary_qty} source={src("supplementary_qty")} onCommit={num("supplementary_qty")} />
        <TextField label="Licence no." value={line.licence_no} source={src("licence_no")} onCommit={v => onUpdate({ licence_no: v })} />
        <TextField label="National CPC" value={line.national_customs_procedure || "000"}
          source={src("national_customs_procedure")} onCommit={v => onUpdate({ national_customs_procedure: v })} />
        <TextField label="Quota code" value={line.quota_code || "NEW"} source={src("quota_code")} onCommit={v => onUpdate({ quota_code: v })} />
        <TextField label="Rate adj." type="number" align="right" value={line.rate_of_adjustment ?? 1} source={src("rate_of_adjustment")} onCommit={num("rate_of_adjustment")} />
        <TextField label="Marks 1" value={line.marks1 || ""} source={src("marks1")} onCommit={v => onUpdate({ marks1: v })} />
        <TextField label="Marks 2" value={line.marks2 || ""} source={src("marks2")} onCommit={v => onUpdate({ marks2: v })} />
        <SelectField label="Effects group" value={line.effects_group || "household"}
          options={[{ code: "household", label: "household" }, { code: "personal", label: "personal" }]}
          source={src("effects_group")} onCommit={v => onUpdate({ effects_group: v as SheetLine["effects_group"] })} />
        <SelectField label="Relieved override" value={line.relieved_override ? "yes" : "no"}
          options={[{ code: "no", label: "No" }, { code: "yes", label: "Yes" }]}
          source={src("relieved_override")} onCommit={v => onUpdate({ relieved_override: v === "yes" })} />
      </div>

      {(refData.concessions?.length ?? 0) > 0 && (
        <>
          <div className="st-subhead">C84 concession</div>
          <div className="st-grid">
            <SelectField label="Concession" className="span-2" value={line.concession_code || ""}
              placeholder="None (dutiable)"
              options={(refData.concessions || []).map(c => ({ code: c.code, label: c.label }))}
              source={src("concession_code")} onCommit={v => onUpdate({ concession_code: v })} />
            {cat?.quantum === "capped" && (
              <>
                <TextField label="Engine (cc)" type="number" align="right" value={line.engine_cc ?? 0} source={src("engine_cc")} onCommit={num("engine_cc")} />
                <TextField label="Motor veh. tax TT$" type="number" align="right" value={line.mvt_ttd ?? 0} source={src("mvt_ttd")} onCommit={num("mvt_ttd")} />
                <TextField label="Cap override TT$" hint="0 uses the band" type="number" align="right"
                  value={line.cap_override_ttd ?? 0} source={src("cap_override_ttd")} onCommit={num("cap_override_ttd")} />
              </>
            )}
            {cat?.quantum === "rate" && (
              <>
                <TextField label="Conc. duty %" type="number" align="right" value={line.conc_duty_pct ?? 0} source={src("conc_duty_pct")} onCommit={num("conc_duty_pct")} />
                <TextField label="Conc. VAT %" type="number" align="right" value={line.conc_vat_pct ?? line.vat_pct} source={src("conc_vat_pct")} onCommit={num("conc_vat_pct")} />
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

/** The two codes a person must choose for every line, extracted or not. */
function LineCodes({ line, refData, locked, onPatch }: {
  line: SheetLine; refData: RefData; locked: boolean;
  onPatch: (lineNo: number, patch: Partial<SheetLine>) => Promise<void>;
}) {
  const src = (k: string) => line.field_sources?.[k];
  const flag = (k: "cpc" | "country_of_origin") => (String(line[k] ?? "").trim() ? undefined : "needed" as const);
  return (
    <fieldset className="st-fieldset" disabled={locked}>
      <div className="st-linecodes">
        <SelectField label="CPC" value={line.cpc} options={refData.cpc} placeholder="Choose CPC"
          flag={flag("cpc")} source={src("cpc")}
          onCommit={v => onPatch(line.line_no, { cpc: v })} />
        <SelectField label="Origin" value={line.country_of_origin} options={refData.countries} placeholder="Choose origin"
          flag={flag("country_of_origin")} source={src("country_of_origin")}
          onCommit={v => onPatch(line.line_no, { country_of_origin: v })} />
      </div>
    </fieldset>
  );
}

// Hand-added lines carry no record yet; show them as entered by hand.
const lineOriginOrHand = (ln: SheetLine): FieldSource => {
  const o = lineOrigin(ln);
  return o.at ? o : { source: "manual", at: "" };
};

export function LinesTable(props: Props) {
  const mobile = useIsMobile();
  return mobile ? <LineCards {...props} /> : <LineGrid {...props} />;
}

/** Phones: one card per line, every figure visible without sideways scrolling. */
function LineCards({ lines, refData, locked, onPatch, onAdd, onDelete, onReload }: Props) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (n: number) => setOpen(p => {
    const next = new Set(p);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });
  return (
    <div id="f-lines">
      {lines.length === 0 && (
        <p style={{ padding: "24px 16px", textAlign: "center", color: "var(--ink-3)", margin: 0 }}>
          No lines yet. Upload a document on the Documents station, or add a line by hand.
        </p>
      )}
      <ul className="st-lcards">
        {lines.map(ln => {
          const isOpen = open.has(ln.line_no);
          const o = lineOriginOrHand(ln);
          return (
            <li key={ln.id} className="st-lcard">
              <div className="st-lcard__head">
                <b>Line {ln.line_no}</b>
                <SourceNote source={o.at ? o : { source: "manual", at: "", by: "" }} />
                <span className="spacer" />
                {!locked && (
                  <button type="button" className="st-iconbtn st-iconbtn--danger" onClick={() => onDelete(ln.line_no)}
                    aria-label={`Delete line ${ln.line_no}`} title="Delete line"><Trash2 /></button>
                )}
              </div>
              <HsClassifyCell line={ln} onUpdate={p => onPatch(ln.line_no, p)} onReload={onReload} />
              <LineCodes line={ln} refData={refData} locked={locked} onPatch={onPatch} />
              <div className="st-lcard__nums">
                <label className="st-lcard__num">
                  <span className="st-label">Ex-works USD</span>
                  <InlineNum label={`Ex-works USD, line ${ln.line_no}`} value={ln.exworks_usd} disabled={locked}
                    onCommit={n => onPatch(ln.line_no, { exworks_usd: n })} />
                </label>
                <label className="st-lcard__num">
                  <span className="st-label">Duty %</span>
                  <InlineNum label={`Duty %, line ${ln.line_no}`} value={ln.duty_pct} disabled={locked}
                    onCommit={n => onPatch(ln.line_no, { duty_pct: n })} />
                </label>
                <span className="st-lcard__num"><span className="st-label">CIF TT$</span><b>{money(ln.cif_ttd)}</b></span>
                <span className="st-lcard__num"><span className="st-label">Duty</span><b>{money(ln.duty)}</b></span>
                <span className="st-lcard__num"><span className="st-label">VAT</span><b>{money(ln.vat)}</b></span>
                <span className="st-lcard__num total"><span className="st-label">Total tax</span><b>{money(ln.total_tax)}</b></span>
              </div>
              <button type="button" className="st-btn st-btn--ghost st-btn--sm" style={{ alignSelf: "flex-start" }}
                onClick={() => toggle(ln.line_no)} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                {isOpen ? "Hide declaration fields" : "Packages, weights, concession"}
              </button>
              {isOpen && (
                <div className="st-lcard__drawer">
                  <fieldset className="st-fieldset" disabled={locked}>
                    <RowDrawer line={ln} refData={refData} onUpdate={p => onPatch(ln.line_no, p)} />
                  </fieldset>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!locked && (
        <button type="button" className="st-addline" onClick={() => { onAdd().catch(() => {}); }}><Plus aria-hidden="true" />Add line</button>
      )}
    </div>
  );
}

function LineGrid({ lines, refData, locked, onPatch, onAdd, onDelete, onReload }: Props) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (n: number) => setOpen(p => {
    const next = new Set(p);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });
  const COLS = 11;

  return (
    <div id="f-lines">
      {lines.length > 0 && <p className="st-scroll-hint" aria-hidden="true">Scroll the table sideways for values and taxes</p>}
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
                    <td className="num">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {ln.line_no}<SourceNote source={lineOriginOrHand(ln)} compact />
                      </span>
                    </td>
                    <td>
                      <HsClassifyCell line={ln} onUpdate={p => onPatch(ln.line_no, p)} onReload={onReload} />
                      <LineCodes line={ln} refData={refData} locked={locked} onPatch={onPatch} />
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
        <button type="button" className="st-addline" onClick={() => { onAdd().catch(() => {}); }}><Plus aria-hidden="true" />Add line</button>
      )}
    </div>
  );
}
