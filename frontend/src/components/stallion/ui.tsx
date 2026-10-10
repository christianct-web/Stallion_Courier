/**
 * ui.tsx — small shared pieces for the Trade Declarations hub and job workspace.
 * Styling lives in styles/stallion.css (classes prefixed st-).
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import { AlertTriangle, Check, FileText, PenLine, X } from "lucide-react";
import type { ChecklistItem, FieldSource, RefOption } from "@/services/sheetApi";
import {
  DECL_CHOICES, STATIONS, STATUS_LABEL, normStatus,
  type StationKey,
} from "./model";

/* ── station track: the four-pip route a job travels ─────────────────────── */
export function StationTrack({ done, current, label }: {
  done: Record<StationKey, boolean>; current: StationKey; label?: boolean;
}) {
  const idx = STATIONS.findIndex(s => s.key === current);
  const allDone = STATIONS.every(s => done[s.key]);
  const name = allDone ? "Done" : STATIONS[idx]?.label;
  return (
    <span className="st-track" role="img"
      aria-label={allDone ? "All stations done" : `At ${name}, ${STATIONS.filter(s => done[s.key]).length} of 4 done`}>
      {STATIONS.map((s, i) => (
        <span key={s.key} style={{ display: "inline-flex", alignItems: "center" }}>
          {i > 0 && <span className={`st-track__bar${done[STATIONS[i - 1].key] ? " is-done" : ""}`} />}
          <span className={`st-track__pip${done[s.key] ? " is-done" : !allDone && s.key === current ? " is-current" : ""}`} />
        </span>
      ))}
      {label && <span className="st-track-label" aria-hidden="true">{name}</span>}
    </span>
  );
}

export function StatusChip({ status }: { status?: string }) {
  const s = normStatus(status);
  return <span className={`st-status st-status--${s}`}>{STATUS_LABEL[s]}</span>;
}

/* ── declaration type picker (radio cards) ───────────────────────────────── */
export function TypePicker({ value, onChange, name = "decl-type", disabled }: {
  value: string; onChange: (declarationType: string) => void; name?: string; disabled?: boolean;
}) {
  return (
    <div className="st-types" role="radiogroup" aria-label="Declaration type">
      {DECL_CHOICES.map(c => (
        <label key={c.key} className="st-type">
          <input type="radio" name={name} value={c.declaration_type} disabled={disabled}
            checked={value === c.declaration_type} onChange={() => onChange(c.declaration_type)} />
          <span className="st-type__code">{c.code}</span>
          <span className="st-type__title">{c.title}</span>
          <span className="st-type__desc">{c.desc}</span>
        </label>
      ))}
    </div>
  );
}

/* ── form fields that commit on blur / Enter ─────────────────────────────── */
// A commit may be a save; its failure is reported by the caller, never unhandled here.
type Commit = (v: string) => void | Promise<unknown>;
const fire = (fn: Commit, v: string) => { Promise.resolve(fn(v)).catch(() => {}); };

type FieldProps = {
  label: string; fieldKey?: string; className?: string; hint?: string;
  /** From the server report: "needed" = blocking, "check" = worth verifying. */
  flag?: "needed" | "check";
  /** Where the stored value came from (server-recorded). */
  source?: FieldSource;
};

/** "From invoice.pdf" / "Entered by Kevin": what a document said vs what a person typed. */
export function SourceNote({ source, compact }: { source?: FieldSource; compact?: boolean }) {
  if (!source) return null;
  const when = new Date(source.at);
  const stamp = Number.isNaN(when.getTime()) ? "" : when.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const extracted = source.source === "extracted";
  const text = extracted ? `From ${source.doc || "a document"}` : `Entered${source.by ? ` by ${source.by}` : " by hand"}`;
  return (
    <span className={`st-source st-source--${source.source}${compact ? " is-compact" : ""}`} title={`${text}${stamp ? ` · ${stamp}` : ""}`}>
      {extracted ? <FileText aria-hidden="true" /> : <PenLine aria-hidden="true" />}
      {!compact && <span>{text}</span>}
      {compact && <span className="sr-only">{text}</span>}
    </span>
  );
}

function FieldShell({ label, flag, source, className, hint, htmlFor, children }: FieldProps & {
  htmlFor: string; children: ReactNode;
}) {
  return (
    <div className={`st-field${flag ? ` is-${flag}` : ""}${className ? " " + className : ""}`}>
      <label htmlFor={htmlFor}>
        {label}{flag && <span className="st-flag">· {flag}</span>}
      </label>
      {children}
      <SourceNote source={source} />
      {hint && <span className="st-hint">{hint}</span>}
    </div>
  );
}

export function TextField({ value, onCommit, type = "text", align, prose, placeholder, ...shell }: FieldProps & {
  value: string | number | null | undefined; onCommit: Commit;
  type?: string; align?: "right"; prose?: boolean; placeholder?: string;
}) {
  const autoId = useId();
  const id = shell.fieldKey ? `f-${shell.fieldKey}` : autoId;
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  return (
    <FieldShell {...shell} htmlFor={id}>
      <input id={id} type={type} value={v} placeholder={placeholder}
        className={`st-input${prose ? " prose" : ""}${align === "right" ? " right" : ""}`}
        aria-invalid={shell.flag === "needed" || undefined}
        data-flag={shell.flag}
        inputMode={type === "number" ? "decimal" : undefined}
        onChange={e => setV(e.target.value)}
        onBlur={() => { if (v !== String(value ?? "")) fire(onCommit, v); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </FieldShell>
  );
}

export function SelectField({ value, options, onCommit, placeholder, ...shell }: FieldProps & {
  value: string | number | null | undefined; options: RefOption[]; onCommit: Commit; placeholder?: string;
}) {
  const autoId = useId();
  const id = shell.fieldKey ? `f-${shell.fieldKey}` : autoId;
  const val = String(value ?? "");
  const known = options.some(o => o.code === val);
  return (
    <FieldShell {...shell} htmlFor={id}>
      <select id={id} className="st-select" value={val} aria-invalid={shell.flag === "needed" || undefined} data-flag={shell.flag}
        onChange={e => fire(onCommit, e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {!known && val !== "" && <option value={val}>{val}</option>}
        {options.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}

/* ── checklist (extraction report / pre-submission report) ───────────────── */
// Icon and order follow severity, so the list agrees with the blocking / to-check counts.
const tone = (i: ChecklistItem) => (i.status === "ok" ? "ok" : i.severity === "critical" ? "missing" : "review");
const ORDER = (i: ChecklistItem) => ({ missing: 0, review: 1, ok: 2 })[tone(i)];

export function Checklist({ items, onGo, hideOk }: {
  items: ChecklistItem[]; onGo?: (field: string) => void; hideOk?: boolean;
}) {
  const sorted = [...items].filter(i => !hideOk || i.status !== "ok").sort((a, b) => ORDER(a) - ORDER(b));
  if (sorted.length === 0) return null;
  return (
    <ul className="st-check">
      {sorted.map((it, i) => (
        <li key={`${it.field}-${i}`}>
          <span className={`st-check__icon st-check__icon--${tone(it)}`} aria-hidden="true">
            {tone(it) === "ok" ? <Check /> : tone(it) === "missing" ? <X /> : <AlertTriangle />}
          </span>
          <span>
            <span className="st-check__label">{it.label}</span>
            {it.detail && <span className="st-check__detail">{it.detail}</span>}
          </span>
          {onGo && it.status !== "ok" && it.field && it.field !== "risk" ? (
            <button type="button" className="st-linkbtn" onClick={() => onGo(it.field!)}>Go to field</button>
          ) : (
            <span className="st-check__sev">{it.status === "ok" ? "" : it.severity === "critical" ? "Blocking" : "Check"}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Counts({ critical, warn, ok }: { critical: number; warn: number; ok?: number }) {
  return (
    <span className="st-counts">
      <span className={`st-count${critical ? " st-count--crit" : ""}`}><b>{critical}</b> blocking</span>
      <span className={`st-count${warn ? " st-count--warn" : ""}`}><b>{warn}</b> to check</span>
      {ok !== undefined && <span className="st-count st-count--ok"><b>{ok}</b> ok</span>}
    </span>
  );
}
