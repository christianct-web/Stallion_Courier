/**
 * StallionSheet.tsx — the job workspace for one declaration (a "sheet").
 *
 *   ┌ Job bar: ‹ Docket · reference · type · client ……… payable · lifecycle ┐
 *   ├ Station rail: 1 Setup · 2 Documents · 3 Verify · 4 Outputs (free jump) ┤
 *   │ Station body                                         │ Duty rail      │
 *   └──────────────────────────────────────────────────────┴────────────────┘
 *
 * Setup      reference, declaration type, client
 * Documents  upload invoice / BL for extraction; per-upload checklist
 * Verify     server pre-submission report on top, header fields grouped,
 *            line grid with HS classification and C84 concession drawer
 * Outputs    readiness, worksheet preview + downloads, C82 XML preview +
 *            download, and the hand-off to review
 *
 * The station is kept in ?step= so a job link can open at a station. All
 * money is the server's computed value; lifecycle moves go through
 * POST /sheets/{id}/status, which enforces the transition map.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Check, ChevronRight, Copy, Download, FileCode2,
  FileSpreadsheet, FileText, Loader2, Lock, UploadCloud, X,
} from "lucide-react";
import {
  addLine, deleteLine, fetchXml, getReference, getSheet, getWarnings, listClients,
  presubmissionCheck, setStatus, updateHeader, updateLine, uploadExtract,
  worksheetUrl, c84WorksheetUrl,
  type ChecklistReport, type Client, type Concession, type RefData, type Sheet, type SheetLine,
} from "@/services/sheetApi";
import { SecureDownloadLink } from "@/components/SecureDownloadLink";
import {
  DECL_CHOICES, STATIONS, STATUS_LABEL, choiceFor, currentStation, currentUser, isLocked,
  money, normStatus, stationsDone, transitionsFor, typeLabel,
  type StationKey, type Transition,
} from "@/components/stallion/model";
import { Checklist, Counts, SelectField, StatusChip, TextField, TypePicker } from "@/components/stallion/ui";
import { LinesTable } from "@/components/stallion/LinesTable";
import "@/styles/stallion.css";

const HEADER_FIELDS = new Set([
  "consignee", "invoice_no", "currency", "freight_usd", "consignor", "bl_number",
  "arrival_date", "port", "incoterm",
]);

const TRANSPORT_MODES = [
  { code: "1", label: "1 - Sea" }, { code: "2", label: "2 - Rail" }, { code: "3", label: "3 - Road" },
  { code: "4", label: "4 - Air" }, { code: "5", label: "5 - Mail" }, { code: "7", label: "7 - Fixed transport" },
  { code: "8", label: "8 - Inland waterway" }, { code: "9", label: "9 - Own propulsion" },
];

// SecureDownloadLink renders its own <button>; strip its chrome so the inner .st-btn shows.
const DL_RESET = { background: "transparent", padding: 0, font: "inherit", color: "inherit" } as const;

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/* ══════════════════════════════════════════════════════════════════════════ */
export default function StallionSheet() {
  const { sheetId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const user = currentUser();

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [refData, setRefData] = useState<RefData | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadError, setLoadError] = useState("");
  const [report, setReport] = useState<ChecklistReport | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  // updated_at of the newest sheet applied, readable before React re-renders.
  const stampRef = useRef("");

  useEffect(() => { getReference().then(setRefData).catch(e => setLoadError(errMsg(e, "Reference data did not load."))); }, []);
  useEffect(() => { listClients().then(setClients).catch(() => {}); }, []);
  useEffect(() => {
    if (!sheetId) return;
    setLoadError("");
    getSheet(sheetId).then(s => { stampRef.current = s.updated_at; setSheet(s); })
      .catch(e => setLoadError(errMsg(e, "The job did not load.")));
  }, [sheetId]);

  // Keep the server's pre-submission report in step with the sheet.
  const stamp = sheet?.updated_at;
  useEffect(() => {
    if (!sheetId || !stamp) return;
    const t = window.setTimeout(() => {
      presubmissionCheck(sheetId).then(r => setReport(r.report)).catch(() => {});
    }, 350);
    return () => window.clearTimeout(t);
  }, [sheetId, stamp]);

  const step: StationKey = useMemo(() => {
    const p = params.get("step") as StationKey | null;
    if (p && STATIONS.some(s => s.key === p)) return p;
    return sheet ? currentStation(sheet) : "setup";
  }, [params, sheet]);
  const goStep = useCallback((k: StationKey) => {
    setParams(p => { const n = new URLSearchParams(p); n.set("step", k); return n; }, { replace: false });
    window.scrollTo({ top: 0 });
  }, [setParams]);

  /* mutations ────────────────────────────────────────────────────────────── */
  // Every write goes through track(): responses are applied in the order the
  // requests were issued (a slow early save never overwrites a later one), and
  // settle() lets an action wait for every in-flight save before it reads the job.
  const issued = useRef(0);
  const applied = useRef(0);
  const inflight = useRef(new Set<Promise<unknown>>());
  const track = useCallback(async (fn: () => Promise<Sheet>): Promise<Sheet> => {
    const seq = ++issued.current;
    const p = fn();
    inflight.current.add(p);
    try {
      const s = await p;
      if (seq > applied.current) { applied.current = seq; stampRef.current = s.updated_at; setSheet(s); }
      return s;
    } finally { inflight.current.delete(p); }
  }, []);
  // Waits for every in-flight save, then returns the stamp of the job as stored.
  const settle = useCallback(async (): Promise<string> => {
    while (inflight.current.size) await Promise.allSettled([...inflight.current]);
    return stampRef.current;
  }, []);
  // Report the failure once, then re-throw so callers never confirm a save that
  // did not happen. Fire-and-forget callers (field blur) swallow the rejection.
  const guard = useCallback(async (fn: () => Promise<Sheet>, failMsg: string): Promise<void> => {
    try { await track(fn); } catch (e) {
      toast.error(`${failMsg}: ${errMsg(e, "error")}`);
      throw Object.assign(e instanceof Error ? e : new Error(String(e)), { reported: true });
    }
  }, [track]);
  const patchHeader = useCallback((patch: Partial<Sheet>) =>
    guard(() => updateHeader(sheetId, patch), "Could not save"), [guard, sheetId]);
  const patchConcession = useCallback((patch: Partial<Concession>) => {
    const merged = { ...(sheet?.concession || {}), ...patch } as Concession;
    return guard(() => updateHeader(sheetId, { concession: merged }), "Could not save");
  }, [guard, sheetId, sheet]);
  const patchLine = useCallback((n: number, patch: Partial<SheetLine>) =>
    guard(() => updateLine(sheetId, n, patch), "Could not save line"), [guard, sheetId]);
  const addRow = useCallback(() => guard(() => addLine(sheetId, {}), "Could not add line"), [guard, sheetId]);
  const removeRow = useCallback((n: number) => {
    if (!window.confirm(`Delete line ${n}?`)) return;
    guard(() => deleteLine(sheetId, n), "Could not delete line").catch(() => {});
  }, [guard, sheetId]);
  const reload = useCallback(async () => { await track(() => getSheet(sheetId)); }, [track, sheetId]);

  const pickClient = useCallback(async (clientId: string) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) { await patchHeader({ client_id: "" }).catch(() => {}); return; }
    try {
      await patchHeader({
      client_id: c.id, consignee: c.name,
      consignee_tin: c.tin || c.consigneeCode || "", consignee_address: c.address || "",
      });
      toast.success(`Loaded ${c.name}`);
    } catch { /* already reported by guard */ }
  }, [clients, patchHeader]);

  const advance = useCallback(async (t: Transition, extra: { notes?: string; receipt_number?: string }) => {
    try {
      const s = await setStatus(sheetId, t.to, { ...extra, actor: user.username || user.role });
      setSheet(s);
      toast.success(`${s.reference || "Job"} is now ${STATUS_LABEL[normStatus(s.status)].toLowerCase()}`);
    } catch (e) {
      toast.error(`Could not change status: ${errMsg(e, "error")}`);
    }
  }, [sheetId, user.username, user.role]);

  const goToField = useCallback((field: string) => {
    setPendingFocus(HEADER_FIELDS.has(field) ? field : "lines");
    if (step !== "verify") goStep("verify");
  }, [goStep, step]);
  useEffect(() => {
    if (!pendingFocus || step !== "verify") return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`f-${pendingFocus}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.focus({ preventScroll: true });
      }
      setPendingFocus(null);
    }, 60);
    return () => window.clearTimeout(t);
  }, [pendingFocus, step]);

  /* render ──────────────────────────────────────────────────────────────── */
  if (loadError) {
    return (
      <div className="st"><div className="st-work st-work--solo">
        <div className="st-banner st-banner--crit" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span><b>This job could not be opened.</b> {loadError}{" "}<Link to="/stallion/sheets">Back to the docket</Link></span>
        </div>
      </div></div>
    );
  }
  if (!sheet || !refData) {
    return <div className="st"><div className="st-work st-work--solo"><p className="st-note"><Loader2 className="st-spin" aria-hidden="true" />Opening job…</p></div></div>;
  }

  const locked = isLocked(sheet);
  const missing = new Map<string, "needed" | "check">(
    (report?.items || []).filter(i => i.status !== "ok" && i.field)
      .map(i => [i.field!, i.severity === "critical" ? "needed" : "check"]));
  const showRail = step !== "setup";

  return (
    <div className="st">
      <JobBar sheet={sheet} role={user.role} blocking={report?.counts.critical ?? 0} onAdvance={advance} />
      <StationRail sheet={sheet} step={step} report={report} onPick={goStep} />

      <div className={`st-work${showRail ? "" : " st-work--solo"}`}>
        <main className="st-main">
          <StatusBanner sheet={sheet} role={user.role} />
          {step === "setup" && (
            <SetupStep sheet={sheet} clients={clients} locked={locked}
              onPatch={patchHeader} onClient={pickClient} onNext={() => goStep("documents")} />
          )}
          {step === "documents" && (
            <DocumentsStep sheet={sheet} locked={locked} track={track}
              onGo={goToField} onNext={() => goStep("verify")} />
          )}
          {step === "verify" && (
            <VerifyStep sheet={sheet} refData={refData} clients={clients} locked={locked}
              report={report} missing={missing} onGo={goToField}
              onPatch={patchHeader} onConcession={patchConcession} onClient={pickClient}
              onPatchLine={patchLine} onAddLine={addRow} onDeleteLine={removeRow} onReload={reload}
              onNext={() => goStep("outputs")} />
          )}
          {step === "outputs" && (
            <OutputsStep sheet={sheet} refData={refData} report={report} role={user.role} locked={locked}
              onGo={goToField} onPatch={patchHeader} settle={settle} onAdvance={advance} />
          )}
        </main>
        {showRail && <DutyRail sheet={sheet} />}
      </div>
    </div>
  );
}

/* ── job bar ─────────────────────────────────────────────────────────────── */
function JobBar({ sheet, role, blocking, onAdvance }: {
  sheet: Sheet; role: ReturnType<typeof currentUser>["role"]; blocking: number;
  onAdvance: (t: Transition, extra: { notes?: string; receipt_number?: string }) => Promise<void>;
}) {
  const status = normStatus(sheet.status);
  const moves = transitionsFor(status, role);
  const [confirm, setConfirm] = useState<Transition | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const start = (t: Transition) => {
    if (t.needs) { setConfirm(t); setText(""); return; }
    setBusy(true);
    onAdvance(t, {}).finally(() => setBusy(false));
  };
  const finish = async () => {
    if (!confirm) return;
    if (confirm.needs === "receipt" && !text.trim()) return;
    setBusy(true);
    await onAdvance(confirm, confirm.needs === "receipt" ? { receipt_number: text.trim() } : { notes: text.trim() });
    setBusy(false);
    setConfirm(null);
  };

  return (
    <>
      <div className="st-jobbar st-on-dark">
        <div className="st-jobbar__in">
          <Link className="st-jobbar__back" to="/stallion/sheets"><ArrowLeft aria-hidden="true" />Docket</Link>
          <div className="st-jobbar__id">
            <h1 className="st-jobbar__ref" style={{ margin: 0 }}>{sheet.reference || "Untitled job"}</h1>
            <span className="st-jobbar__type">{typeLabel(sheet)}</span>
            {sheet.consignee && <span className="st-jobbar__who">{sheet.consignee}</span>}
          </div>
          <div className="st-jobbar__right">
            <div className="st-jobbar__pay">
              <span>Payable TT$</span>
              <b>{money(sheet.totals?.total_payable)}</b>
            </div>
            <StatusChip status={sheet.status} />
            {blocking > 0 && moves.some(t => t.to === "pending") && (
              <span className="st-jobbar__hint" role="note">
                <AlertTriangle aria-hidden="true" />{blocking} blocking item{blocking === 1 ? "" : "s"} open
              </span>
            )}
            {moves.length > 0 && (
              <div className="st-jobbar__actions">
                {moves.map(t => (
                  <button key={t.to} type="button" disabled={busy}
                    className={`st-btn ${t.tone === "primary" ? "st-btn--primary" : "st-btn--on-dark"}`}
                    aria-expanded={t.needs ? confirm?.to === t.to : undefined}
                    onClick={() => start(t)}>{t.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {confirm && (
        <form className="st-confirm st-on-dark" onSubmit={e => { e.preventDefault(); finish(); }}>
          <div className="st-confirm__in">
            <div className="st-field">
              <label htmlFor="confirm-text">
                {confirm.needs === "receipt" ? "Customs receipt number" : "What needs fixing? The clerk sees this note."}
              </label>
              {confirm.needs === "receipt" ? (
                <input id="confirm-text" className="st-input" autoFocus value={text} onChange={e => setText(e.target.value)} />
              ) : (
                <textarea id="confirm-text" className="st-textarea prose" rows={2} autoFocus value={text}
                  onChange={e => setText(e.target.value)} />
              )}
            </div>
            <button type="button" className="st-btn st-btn--on-dark" onClick={() => setConfirm(null)}>Cancel</button>
            <button type="submit" className="st-btn st-btn--primary"
              disabled={busy || (confirm.needs === "receipt" && !text.trim())}>
              {confirm.needs === "receipt" ? "Record receipt" : "Send back"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

function StatusBanner({ sheet, role }: { sheet: Sheet; role: ReturnType<typeof currentUser>["role"] }) {
  const status = normStatus(sheet.status);
  const reviewer = role === "broker" || role === "admin";
  if (status === "correction") {
    const last = [...(sheet.status_history || [])].reverse().find(h => h.to === "correction");
    return (
      <div className="st-banner st-banner--crit" role="status">
        <AlertTriangle aria-hidden="true" />
        <span><b>Sent back{last?.actor ? ` by ${last.actor}` : ""}.</b>{" "}
          {last?.notes ? <>“{last.notes}”</> : "Fix the flagged items and re-submit for review."}</span>
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="st-banner st-banner--warn" role="status">
        <AlertTriangle aria-hidden="true" />
        <span>{reviewer ? <><b>Waiting on your review.</b> Approve it or send it back from the bar above.</>
          : <><b>With the broker for review.</b> You can still correct it while it waits.</>}</span>
      </div>
    );
  }
  if (isLocked(sheet)) {
    return (
      <div className="st-banner st-banner--info" role="status">
        <Lock aria-hidden="true" />
        <span><b>{STATUS_LABEL[status]}. Editing is locked.</b>{" "}
          {status === "approved" ? (reviewer ? "Send it back to make changes." : "Ask the broker to send it back for changes.")
            : status === "submitted" ? "This declaration is with Customs." : `Receipt ${sheet.receipt_number || "recorded"}.`}</span>
      </div>
    );
  }
  return null;
}

/* ── station rail ────────────────────────────────────────────────────────── */
function StationRail({ sheet, step, report, onPick }: {
  sheet: Sheet; step: StationKey; report: ChecklistReport | null; onPick: (k: StationKey) => void;
}) {
  const done = stationsDone(sheet);
  const n = (sheet.lines || []).length;
  const crit = report?.counts.critical ?? 0;
  const warn = report?.counts.warn ?? 0;
  const status = normStatus(sheet.status);
  const rail = useRef<HTMLDivElement>(null);
  // On narrow screens the rail scrolls; keep the active station in view.
  useEffect(() => {
    const el = rail.current?.querySelector<HTMLElement>('[aria-current="step"]');
    const box = rail.current;
    if (el && box && box.scrollWidth > box.clientWidth) {
      box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [step]);
  const sub: Record<StationKey, string> = {
    setup: done.setup ? typeLabel(sheet) : "Reference needed",
    documents: n ? `${n} line${n === 1 ? "" : "s"} on the job` : "Upload invoice / BL",
    verify: !report ? (done.verify ? "Done" : "Fill the gaps") : crit ? `${crit} blocking` : warn ? `${warn} to check` : "Nothing missing",
    outputs: status === "draft" || status === "correction" ? "Worksheet · XML" : STATUS_LABEL[status],
  };
  return (
    <nav className="st-stations" aria-label="Job stations">
      <div className="st-stations__in" ref={rail}>
        {STATIONS.map((s, i) => {
          const isDone = done[s.key] && !(s.key === "verify" && crit > 0);
          return (
            <button key={s.key} type="button" onClick={() => onPick(s.key)}
              className={`st-station${isDone ? " is-done" : ""}${s.key === "verify" && crit > 0 ? " is-attn" : ""}`}
              aria-current={step === s.key ? "step" : undefined}>
              <span className="st-station__pip" aria-hidden="true">{isDone && step !== s.key ? <Check /> : i + 1}</span>
              <span>
                <span className="st-station__name">{s.label}</span>
                <span className="st-station__sub">{sub[s.key]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function StepHead({ title, lede, aside }: { title: string; lede: ReactNode; aside?: ReactNode }) {
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
      <div>
        <h2 className="st-step-title">{title}</h2>
        <p className="st-step-lede">{lede}</p>
      </div>
      {aside}
    </header>
  );
}

/* ── 1 · setup ───────────────────────────────────────────────────────────── */
function SetupStep({ sheet, clients, locked, onPatch, onClient, onNext }: {
  sheet: Sheet; clients: Client[]; locked: boolean;
  onPatch: (p: Partial<Sheet>) => Promise<void>; onClient: (id: string) => Promise<void>; onNext: () => void;
}) {
  const setType = (dt: string) => {
    const c = DECL_CHOICES.find(x => x.declaration_type === dt);
    if (c) onPatch({ declaration_type: c.declaration_type, customs_regime: c.regime }).catch(() => {});
  };
  const manual = choiceFor(sheet).key === "manual";
  return (
    <>
      <StepHead title="Set up the job" lede="The reference number and declaration type decide where this job lives and which outputs it produces." />
      <fieldset className="st-fieldset" disabled={locked}>
        <section className="st-panel">
          <div className="st-panel__body" style={{ paddingTop: 22 }}>
            <div className="st-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              <TextField label="Reference number" fieldKey="reference" value={sheet.reference} source={sheet.field_sources?.reference}
                flag={sheet.reference?.trim() ? undefined : "needed"} onCommit={v => onPatch({ reference: v.trim() })} />
              <SelectField label="Client" value={sheet.client_id || ""} placeholder="No saved client"
                options={clients.map(c => ({ code: c.id, label: c.name }))} onCommit={onClient}
                hint="Picking a client fills the consignee, TIN and address." />
            </div>
            <div className="st-subhead">Declaration type</div>
            <TypePicker value={sheet.declaration_type || "import_c82"} onChange={setType} disabled={locked} />
          </div>
          <div className="st-panel__foot">
            <button type="button" className="st-btn st-btn--primary" onClick={onNext} disabled={!sheet.reference?.trim()}>
              {manual ? "Continue" : "Continue to documents"}<ChevronRight aria-hidden="true" />
            </button>
          </div>
        </section>
      </fieldset>
    </>
  );
}

/* ── 2 · documents ───────────────────────────────────────────────────────── */
type Upload = { id: number; name: string; state: "queued" | "extracting" | "done" | "failed"; note?: string };

function DocumentsStep({ sheet, locked, track, onGo, onNext }: {
  sheet: Sheet; locked: boolean; track: (fn: () => Promise<Sheet>) => Promise<Sheet>;
  onGo: (f: string) => void; onNext: () => void;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [lastReport, setLastReport] = useState<ChecklistReport | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const running = useRef(false);
  const queue = useRef<{ id: number; file: File }[]>([]);
  const n = (sheet.lines || []).length;

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const job = queue.current.shift()!;
      setUploads(u => u.map(x => x.id === job.id ? { ...x, state: "extracting" } : x));
      try {
        let report: ChecklistReport | null = null;
        const s = await track(async () => {
          const out = await uploadExtract(sheet.id, job.file);
          report = out.report;
          return out.sheet;
        });
        const added = (s.lines || []).length;
        setLastReport(report);
        setUploads(u => u.map(x => x.id === job.id ? { ...x, state: "done", note: `${added} line${added === 1 ? "" : "s"} on the job` } : x));
      } catch (e) {
        setUploads(u => u.map(x => x.id === job.id ? { ...x, state: "failed", note: errMsg(e, "Extraction failed") } : x));
      }
    }
    running.current = false;
  }, [sheet.id, track]);

  const add = (files: FileList | File[] | null) => {
    if (!files || locked) return;
    const list = Array.from(files).filter(f => /\.(pdf|png|jpe?g)$/i.test(f.name));
    if (!list.length) { toast.error("Upload a PDF, PNG or JPG."); return; }
    const jobs = list.map(file => ({ id: ++seq.current, file }));
    queue.current.push(...jobs);
    setUploads(u => [...u, ...jobs.map(j => ({ id: j.id, name: j.file.name, state: "queued" as const }))]);
    pump();
  };

  const busy = uploads.some(u => u.state === "queued" || u.state === "extracting");
  const manual = choiceFor(sheet).key === "manual";

  return (
    <>
      <StepHead title="Upload the documents"
        lede={<>Commercial invoice, bill of lading or airway bill. Stallion reads each one, adds its line items to this job and fills the header fields it finds.{manual && " This is a manual worksheet, so documents are optional."}</>}
        aside={<span className="st-panel__aside">{n} line{n === 1 ? "" : "s"} on the job</span>} />

      {!locked && (
        <section className="st-panel">
          <div className="st-panel__body" style={{ paddingTop: 22 }}>
            <label className={`st-drop${over ? " is-over" : ""}`}
              onDragOver={e => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
              <UploadCloud aria-hidden="true" />
              <strong>Drop documents here</strong>
              <span>or click to choose · PDF, PNG, JPG · one or several</span>
              <input ref={input} type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="sr-only"
                onChange={e => { add(e.target.files); e.target.value = ""; }} />
            </label>
            {uploads.length > 0 && (
              <ul className="st-files" aria-live="polite">
                {uploads.map(u => (
                  <li key={u.id} className={`st-file is-${u.state}`}>
                    {u.state === "extracting" ? <Loader2 className="st-spin" aria-hidden="true" />
                      : u.state === "done" ? <Check aria-hidden="true" style={{ color: "var(--ok)" }} />
                      : u.state === "failed" ? <X aria-hidden="true" style={{ color: "var(--crit)" }} />
                      : <FileText aria-hidden="true" style={{ color: "var(--ink-3)" }} />}
                    <span className="st-file__name">{u.name}</span>
                    <span className="st-file__state">
                      {u.state === "queued" ? "Waiting" : u.state === "extracting" ? "Reading…" : u.note}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {lastReport && (
        <section className="st-panel" aria-labelledby="extract-title">
          <div className="st-panel__head">
            <h3 id="extract-title" className="st-panel__title">What the last document gave us</h3>
            <span className="st-counts">
              {lastReport.confidence !== null && lastReport.confidence !== undefined && (
                <span className="st-count"><b>{Math.round(lastReport.confidence * 100)}%</b> confidence</span>
              )}
              <Counts critical={lastReport.counts.critical} warn={lastReport.counts.warn} ok={lastReport.counts.ok} />
            </span>
          </div>
          <div className="st-panel__body">
            <Checklist items={lastReport.items} onGo={onGo} />
          </div>
        </section>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
        {n === 0 && !busy && (
          <button type="button" className="st-btn st-btn--ghost" onClick={onNext}>No documents? Enter lines by hand</button>
        )}
        <button type="button" className="st-btn st-btn--primary" onClick={onNext} disabled={busy || (n === 0 && !manual)}>
          {busy ? "Reading documents…" : "Continue to verify"}<ChevronRight aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

/* ── 3 · verify ──────────────────────────────────────────────────────────── */
function VerifyStep(p: {
  sheet: Sheet; refData: RefData; clients: Client[]; locked: boolean;
  report: ChecklistReport | null; missing: Map<string, "needed" | "check">; onGo: (f: string) => void;
  onPatch: (x: Partial<Sheet>) => Promise<void>; onConcession: (x: Partial<Concession>) => Promise<void>;
  onClient: (id: string) => Promise<void>;
  onPatchLine: (n: number, x: Partial<SheetLine>) => Promise<void>; onAddLine: () => Promise<void>; onDeleteLine: (n: number) => void;
  onReload: () => Promise<void>; onNext: () => void;
}) {
  const { sheet: s, refData: r, missing: m, onPatch } = p;
  const num = (k: keyof Sheet) => (v: string) => onPatch({ [k]: Number(v) } as Partial<Sheet>);
  const txt = (k: keyof Sheet) => (v: string) => onPatch({ [k]: v } as Partial<Sheet>);
  const src = (k: string) => s.field_sources?.[k];
  const countryName = (code: string) => r.countries.find(c => c.code === code)?.label || code;
  const open = (p.report?.items || []).filter(i => i.status !== "ok");
  const showConcession = (s.declaration_type === "c84" || s.concession?.active) && (r.concessions?.length ?? 0) > 0;

  return (
    <>
      <StepHead title="Fill the gaps and verify"
        lede="Anything extraction missed is flagged. Every figure on the right is recalculated by the server as you save." />

      {p.report && (
        <section className="st-panel" aria-labelledby="attn-title">
          <div className="st-panel__head">
            <h3 id="attn-title" className="st-panel__title">
              {open.length === 0 ? "Nothing missing" : p.report.counts.critical ? "Needs your attention" : "Worth a second look"}
            </h3>
            <Counts critical={p.report.counts.critical} warn={p.report.counts.warn} />
          </div>
          <div className="st-panel__body">
            {open.length ? <Checklist items={p.report.items} hideOk onGo={p.onGo} />
              : <p className="st-note" style={{ margin: 0 }}><Check aria-hidden="true" style={{ color: "var(--ok)" }} />The pre-submission check found nothing blocking. Head to Outputs when you're ready.</p>}
          </div>
        </section>
      )}

      <fieldset className="st-fieldset" disabled={p.locked}>
        <section className="st-panel">
          <div className="st-panel__body" style={{ paddingTop: 22 }}>
            <div className="st-subhead">Parties</div>
            <div className="st-grid">
              <SelectField label="Client" value={s.client_id || ""} placeholder="No saved client"
                options={p.clients.map(c => ({ code: c.id, label: c.name }))} source={src("client_id")} onCommit={p.onClient} />
              <TextField label="Consignee" fieldKey="consignee" prose flag={m.get("consignee")} value={s.consignee} source={src("consignee")} onCommit={txt("consignee")} />
              <TextField label="Consignee TIN / code" fieldKey="consignee_tin" value={s.consignee_tin} source={src("consignee_tin")} onCommit={txt("consignee_tin")} />
              <TextField label="Consignee address" className="span-2" prose value={s.consignee_address || ""} source={src("consignee_address")} onCommit={txt("consignee_address")} />
              <TextField label="Consignor / supplier" fieldKey="consignor" prose flag={m.get("consignor")} value={s.consignor} source={src("consignor")} onCommit={txt("consignor")} />
              <TextField label="Consignor address" className="span-2" prose value={s.consignor_address || ""} source={src("consignor_address")} onCommit={txt("consignor_address")} />
              <TextField label="Declarant name" prose value={s.declarant_name || ""} source={src("declarant_name")} onCommit={txt("declarant_name")} />
              <TextField label="Declarant TIN" value={s.declarant_tin || ""} source={src("declarant_tin")} onCommit={txt("declarant_tin")} />
            </div>

            <div className="st-subhead">Shipment</div>
            <div className="st-grid">
              <TextField label="Vessel / flight" value={s.vessel} source={src("vessel")} onCommit={txt("vessel")} />
              <TextField label="Bill of lading / AWB" fieldKey="bl_number" flag={m.get("bl_number")} value={s.bl_number} source={src("bl_number")} onCommit={txt("bl_number")} />
              <TextField label="B/L date" type="date" value={s.bl_date || ""} source={src("bl_date")} onCommit={txt("bl_date")} />
              <TextField label="Rotation no." value={s.rotation_no || ""} source={src("rotation_no")} onCommit={txt("rotation_no")} />
              <SelectField label="Port" fieldKey="port" flag={m.get("port")} value={s.port} options={r.ports}
                placeholder="Select port" source={src("port")} onCommit={txt("port")} />
              <TextField label="Arrival date" fieldKey="arrival_date" type="date" flag={m.get("arrival_date")} value={s.arrival_date} source={src("arrival_date")} onCommit={txt("arrival_date")} />
              <SelectField label="Transport mode" value={s.mode_of_transport ?? ""} options={TRANSPORT_MODES}
                placeholder="Select mode" source={src("mode_of_transport")} onCommit={v => onPatch({ mode_of_transport: Number(v) })} />
            </div>

            <div className="st-subhead">Invoice &amp; valuation</div>
            <div className="st-grid">
              <TextField label="Invoice no." fieldKey="invoice_no" flag={m.get("invoice_no")} value={s.invoice_no || ""} source={src("invoice_no")} onCommit={txt("invoice_no")} />
              <TextField label="Invoice date" type="date" value={s.invoice_date || ""} source={src("invoice_date")} onCommit={txt("invoice_date")} />
              <TextField label="Currency" fieldKey="currency" flag={m.get("currency")} value={s.currency || ""} source={src("currency")} onCommit={v => onPatch({ currency: v.toUpperCase() })} />
              <SelectField label="Incoterm" fieldKey="incoterm" flag={m.get("incoterm")} value={s.incoterm} options={r.incoterms}
                placeholder="Select incoterm" source={src("incoterm")} onCommit={txt("incoterm")} />
              <TextField label="Exchange rate" type="number" align="right" value={s.exchange_rate} source={src("exchange_rate")} onCommit={num("exchange_rate")} />
              <TextField label="Freight USD" fieldKey="freight_usd" type="number" align="right" flag={m.get("freight_usd")} value={s.freight_usd} source={src("freight_usd")} onCommit={num("freight_usd")} />
              <TextField label="Insurance USD" type="number" align="right" value={s.insurance_usd} source={src("insurance_usd")} onCommit={num("insurance_usd")} />
              <TextField label="Gross weight kg" type="number" align="right" value={s.gross_weight} source={src("gross_weight")} onCommit={num("gross_weight")} />
              <TextField label="Total packages" type="number" align="right" value={s.total_packages} source={src("total_packages")} onCommit={num("total_packages")} />
              <TextField label="Customs user fee" type="number" align="right" value={s.customs_user_fee} source={src("customs_user_fee")} onCommit={num("customs_user_fee")} />
              <SelectField label="Entry mode" value={s.entry_mode || "dutiable"}
                options={[{ code: "dutiable", label: "Dutiable" }, { code: "relieved", label: "Relieved" }]}
                source={src("entry_mode")} onCommit={v => onPatch({ entry_mode: v as Sheet["entry_mode"] })} />
              <div className="st-readout">
                <span className="st-label">CIF factor</span>
                <b>{(s.cif_factor ?? 0).toFixed(12)}</b>
              </div>
            </div>

            <div className="st-subhead">Countries &amp; payment</div>
            <div className="st-grid">
              <SelectField label="Export country" value={s.export_country_code || ""} options={r.countries} placeholder="Select country"
                source={src("export_country_code")} onCommit={v => onPatch({ export_country_code: v, export_country_name: countryName(v) })} />
              <SelectField label="Trading country" value={s.trading_country || ""} options={r.countries} placeholder="Select country"
                source={src("trading_country")} onCommit={txt("trading_country")} />
              <SelectField label="First destination" value={s.country_first_destination || ""} options={r.countries} placeholder="Select country"
                source={src("country_first_destination")} onCommit={txt("country_first_destination")} />
              <TextField label="Origin name" prose value={s.country_of_origin_name || ""} source={src("country_of_origin_name")} onCommit={txt("country_of_origin_name")} />
              <TextField label="Bank code" type="number" align="right" value={s.bank_code ?? ""} source={src("bank_code")} onCommit={num("bank_code")} />
              <SelectField label="Payment" value={s.mode_of_payment || ""} placeholder="Select"
                options={[{ code: "CASH", label: "CASH" }, { code: "CREDIT", label: "CREDIT" }, { code: "OTHER", label: "OTHER" }]}
                source={src("mode_of_payment")} onCommit={txt("mode_of_payment")} />
              <TextField label="Terms code" type="number" align="right" value={s.terms_code ?? ""} source={src("terms_code")} onCommit={num("terms_code")} />
              <TextField label="Terms description" value={s.terms_description || ""} source={src("terms_description")} onCommit={txt("terms_description")} />
            </div>
          </div>
        </section>

        {showConcession && <ConcessionPanel sheet={s} refData={r} onPatch={p.onConcession} />}

        <section className="st-panel" aria-labelledby="lines-title">
          <div className="st-panel__head">
            <h3 id="lines-title" className="st-panel__title">Line items</h3>
            <span className="st-panel__aside">Every line needs a CPC and origin; open a line for packages, weights and concession</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <LinesTable lines={s.lines || []} refData={r} locked={p.locked}
              onPatch={p.onPatchLine} onAdd={p.onAddLine} onDelete={p.onDeleteLine} onReload={p.onReload} />
          </div>
        </section>
      </fieldset>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="st-btn st-btn--primary" onClick={p.onNext}>
          Continue to outputs<ChevronRight aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

function ConcessionPanel({ sheet, refData, onPatch }: {
  sheet: Sheet; refData: RefData; onPatch: (p: Partial<Concession>) => Promise<void>;
}) {
  const c = sheet.concession || ({} as Concession);
  const relief = sheet.totals?.relief_total ?? 0;
  return (
    <section className="st-panel" aria-labelledby="c84-title">
      <div className="st-panel__head">
        <h3 id="c84-title" className="st-panel__title">C84 concession</h3>
        {relief > 0 && <span className="mono" style={{ color: "var(--ok)", fontWeight: 700 }}>Total relief TT$ {money(relief)}</span>}
        <p className="st-panel__lede">Set the concession per line in each line's drawer. Vehicle relief caps are defaults; confirm them against the current Customs notice before filing.</p>
      </div>
      <div className="st-panel__body">
        <div className="st-grid">
          <SelectField label="Primary concession" className="span-2" value={c.code || ""} placeholder="Select concession"
            options={(refData.concessions || []).map(x => ({ code: x.code, label: x.label }))}
            onCommit={v => onPatch({ code: v, active: !!v })} />
          <TextField label="Beneficiary name" prose value={c.beneficiary_name || ""} onCommit={v => onPatch({ beneficiary_name: v })} />
          <TextField label="ID / passport" value={c.beneficiary_id || ""} onCommit={v => onPatch({ beneficiary_id: v })} />
          <TextField label="C84 no." value={c.declaration_no || ""} onCommit={v => onPatch({ declaration_no: v })} />
          <TextField label="Approval ref" value={c.approval_ref || ""} onCommit={v => onPatch({ approval_ref: v })} />
          <TextField label="Return date" type="date" value={c.return_date || ""} onCommit={v => onPatch({ return_date: v })} />
          <TextField label="Abroad from" value={c.residence_abroad_from || ""} onCommit={v => onPatch({ residence_abroad_from: v })} />
          <TextField label="Abroad to" value={c.residence_abroad_to || ""} onCommit={v => onPatch({ residence_abroad_to: v })} />
        </div>
      </div>
    </section>
  );
}

/* ── 4 · outputs ─────────────────────────────────────────────────────────── */
function OutputsStep({ sheet, refData, report, role, locked, onGo, onPatch, settle, onAdvance }: {
  sheet: Sheet; refData: RefData; report: ChecklistReport | null; role: ReturnType<typeof currentUser>["role"];
  locked: boolean; onGo: (f: string) => void;
  onPatch: (p: Partial<Sheet>) => Promise<void>; settle: () => Promise<string>;
  onAdvance: (t: Transition, extra: { notes?: string; receipt_number?: string }) => Promise<void>;
}) {
  const t = sheet.totals || ({} as Sheet["totals"]);
  const lines = sheet.lines || [];
  const hasC84 = sheet.declaration_type === "c84" || !!sheet.concession?.active || lines.some(l => l.concession_code);
  const crit = report?.counts.critical ?? 0;
  const handoff = transitionsFor(normStatus(sheet.status), role).find(x => x.to === "pending");

  return (
    <>
      <StepHead title="Worksheet and XML"
        lede="Preview what goes to Customs, download the worksheet, and generate the C82 XML." />

      {report && (crit > 0 ? (
        <section className="st-panel" aria-labelledby="ready-title">
          <div className="st-panel__head">
            <h3 id="ready-title" className="st-panel__title">Not ready yet</h3>
            <Counts critical={crit} warn={report.counts.warn} />
          </div>
          <div className="st-panel__body"><Checklist items={report.items.filter(i => i.severity === "critical")} hideOk onGo={onGo} /></div>
        </section>
      ) : (
        <div className="st-banner st-banner--ok" role="status">
          <Check aria-hidden="true" />
          <span><b>Pre-submission check passed.</b>{report.counts.warn > 0 && <> {report.counts.warn} item{report.counts.warn === 1 ? "" : "s"} worth a second look on <button type="button" className="st-linkbtn" onClick={() => onGo("lines")}>Verify</button>.</>}</span>
        </div>
      ))}

      <section className="st-panel" aria-labelledby="ws-title">
        <div className="st-panel__head">
          <h3 id="ws-title" className="st-panel__title">Worksheet preview</h3>
          <span className="st-panel__aside">Rate of exchange {sheet.exchange_rate ? sheet.exchange_rate.toFixed(4) : "not set"}</span>
        </div>
        <div className="st-panel__body">
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th>#</th><th>Description</th><th>HS code</th><th className="r">CIF TT$</th>
                  <th className="r">Duty</th><th className="r">Surcharge</th><th className="r">VAT</th><th className="r">Total tax</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "var(--ink-3)" }}>No lines on this job yet.</td></tr>
                )}
                {lines.map(l => (
                  <tr key={l.id}>
                    <td className="num">{l.line_no}</td>
                    <td style={{ maxWidth: 320 }}>{l.description || <span style={{ color: "var(--ink-3)" }}>No description</span>}</td>
                    <td className="num">{l.hs_code || <span style={{ color: "var(--accent-ink)" }}>missing</span>}</td>
                    <td className="num r">{money(l.cif_ttd)}</td>
                    <td className="num r">{money(l.duty)}</td>
                    <td className="num r">{money(l.surcharge)}</td>
                    <td className="num r">{money(l.vat)}</td>
                    <td className="num r strong">{money(l.total_tax)}</td>
                  </tr>
                ))}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3}>Totals</td>
                    <td className="r">{money(t.cif_ttd)}</td><td className="r">{money(t.duty)}</td>
                    <td className="r">{money(t.surcharge)}</td><td className="r">{money(t.vat)}</td>
                    <td className="r">{money(t.payable_taxes)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
        <div className="st-panel__foot" style={{ justifyContent: "space-between" }}>
          <span className="st-note">Payable incl. user fee: <b className="mono">TT$ {money(t.total_payable)}</b></span>
          <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {hasC84 && (
              <SecureDownloadLink href={c84WorksheetUrl(sheet.id)} style={DL_RESET}>
                <span className="st-btn"><FileText aria-hidden="true" />C84 claim</span>
              </SecureDownloadLink>
            )}
            <SecureDownloadLink href={worksheetUrl(sheet.id)} style={DL_RESET}>
              <span className="st-btn st-btn--ink"><FileSpreadsheet aria-hidden="true" />Download worksheet</span>
            </SecureDownloadLink>
          </span>
        </div>
      </section>

      <XmlPanel sheet={sheet} refData={refData} locked={locked} onPatch={onPatch} settle={settle} />

      {handoff && (
        <section className="st-panel">
          <div className="st-panel__head" style={{ paddingBottom: 18 }}>
            <div>
              <h3 className="st-panel__title">Hand it to the broker</h3>
              <p className="st-panel__lede">{crit > 0 ? "You can submit with blocking items, but the broker will likely send it back." : "The broker reviews the worksheet and XML, then approves or sends it back."}</p>
            </div>
            <button type="button" className="st-btn st-btn--primary" onClick={() => onAdvance(handoff, {})}>
              {handoff.label}<ChevronRight aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function XmlPanel({ sheet, refData, locked, onPatch, settle }: {
  sheet: Sheet; refData: RefData; locked: boolean;
  onPatch: (p: Partial<Sheet>) => Promise<void>; settle: () => Promise<string>;
}) {
  // The declaration-level fields are ordinary saved fields read from the sheet,
  // so they always show what is stored and can never write back an old value.
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ xml: string; filename: string; stamp: string } | null>(null);
  const stamp = sheet.updated_at;
  // XML is built from the whole job: any saved change after generation makes it stale.
  const stale = !!result && result.stamp !== stamp;
  const current = result && !stale ? result : null;
  const save = (patch: Partial<Sheet>) => { onPatch(patch).catch(() => {}); };

  useEffect(() => {
    getWarnings(sheet.id).then(r => setWarnings(r.warnings)).catch(() => setWarnings(null));
  }, [sheet.id, stamp]);

  const generate = async () => {
    setBusy(true); setError("");
    try {
      // Let any save still in flight (a field just blurred, on this station or
      // the last) land first, then generate from what is stored. No overrides
      // are sent, so generating never mutates the job.
      const before = await settle();
      const out = await fetchXml(sheet.id, {});
      setResult({ ...out, stamp: before });
      toast.success("C82 XML generated");
    } catch (e) {
      setError(errMsg(e, "XML generation failed"));
      setResult(null);
    } finally { setBusy(false); }
  };
  const download = () => {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([current.xml], { type: "application/xml" }));
    const a = document.createElement("a");
    a.href = url; a.download = current.filename; a.click();
    URL.revokeObjectURL(url);
  };
  const copy = () => {
    if (!current) return;
    navigator.clipboard?.writeText(current.xml).then(() => toast.success("XML copied")).catch(() => toast.error("Copy failed"));
  };

  return (
    <section className="st-panel" aria-labelledby="xml-title">
      <div className="st-panel__head">
        <h3 id="xml-title" className="st-panel__title">C82 XML</h3>
        <span className="st-panel__aside">ASYCUDA SAD</span>
        <p className="st-panel__lede">{locked
          ? "This job is locked, so these fields are read-only. Generating reads the stored declaration and changes nothing."
          : "Confirm the declaration-level fields (they save like any other field), then generate. The XML is previewed here before you download it."}</p>
      </div>
      <div className="st-panel__body">
        {warnings && warnings.length > 0 && (
          <div className="st-banner st-banner--warn">
            <AlertTriangle aria-hidden="true" />
            <span>
              <b>{warnings.length} issue{warnings.length === 1 ? "" : "s"} could make the declaration wrong.</b> The XML still generates.
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </span>
          </div>
        )}
        <fieldset className="st-fieldset" disabled={locked || busy}>
          <div className="st-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            <SelectField label="Customs regime" value={sheet.customs_regime} options={refData.customs_regimes}
              placeholder="Select regime" onCommit={v => save({ customs_regime: v })} />
            <SelectField label="Nature of transaction (box 24)" value={sheet.nature_of_transaction}
              options={refData.nature_of_transaction} placeholder="Select" onCommit={v => save({ nature_of_transaction: v })} />
            <TextField label="Consignee TIN / code" value={sheet.consignee_tin} onCommit={v => save({ consignee_tin: v.trim() })} />
          </div>
        </fieldset>
        {error && (
          <div className="st-banner st-banner--crit" role="alert" style={{ marginTop: 16, marginBottom: 0 }}>
            <AlertTriangle aria-hidden="true" /><span><b>The XML was not generated.</b> {error}</span>
          </div>
        )}
        {stale && (
          <div className="st-banner st-banner--warn" role="status" style={{ marginTop: 16, marginBottom: 0 }}>
            <AlertTriangle aria-hidden="true" />
            <span><b>The job changed after this XML was generated.</b> Regenerate it before you download or copy.</span>
          </div>
        )}
        {current && (
          <div style={{ marginTop: 18 }}>
            <XmlPreview xml={current.xml} />
          </div>
        )}
      </div>
      <div className="st-panel__foot">
        {current && <span className="st-note mono" style={{ marginRight: "auto" }}>{current.filename}</span>}
        {current && <button type="button" className="st-btn" onClick={copy}><Copy aria-hidden="true" />Copy</button>}
        {current && <button type="button" className="st-btn st-btn--ink" onClick={download}><Download aria-hidden="true" />Download XML</button>}
        <button type="button" className={`st-btn ${current ? "" : "st-btn--primary"}`} onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="st-spin" aria-hidden="true" /> : <FileCode2 aria-hidden="true" />}
          {busy ? "Generating…" : result ? "Regenerate" : "Generate XML"}
        </button>
      </div>
    </section>
  );
}

/** Minimal XML colouring: tags, attribute names, quoted values. */
function XmlPreview({ xml }: { xml: string }) {
  const pretty = useMemo(() => {
    if (xml.includes("\n")) return xml;
    // Single-line XML: break between tags so it is readable.
    let depth = 0;
    return xml.replace(/>\s*</g, ">\n<").split("\n").map(line => {
      if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
      const out = "  ".repeat(depth) + line;
      if (/^<[^!?/][^>]*[^/]>$/.test(line) && !/<\/[^>]+>$/.test(line)) depth += 1;
      return out;
    }).join("\n");
  }, [xml]);
  const lines = pretty.split("\n");
  const shown = lines.slice(0, 2000);
  return (
    <>
      <pre className="st-code" aria-label="XML preview">
        {shown.map((ln, i) => (
          <span key={i} className="ln">
            {ln.split(/(<\/?[\w:.-]+|\/?>|\s[\w:.-]+=|"[^"]*")/g).map((tok, j) => {
              if (!tok) return null;
              if (/^<\/?[\w:.-]+$/.test(tok) || /^\/?>$/.test(tok)) return <span key={j} className="t">{tok}</span>;
              if (/^\s[\w:.-]+=$/.test(tok)) return <span key={j} className="a">{tok}</span>;
              if (/^"[^"]*"$/.test(tok)) return <span key={j} className="v">{tok}</span>;
              return tok;
            })}
          </span>
        ))}
      </pre>
      {lines.length > shown.length && <p className="st-footnote">Showing the first {shown.length} of {lines.length} lines. Download for the full file.</p>}
    </>
  );
}

/* ── duty rail ───────────────────────────────────────────────────────────── */
function DutyRail({ sheet }: { sheet: Sheet }) {
  const t = sheet.totals || ({} as Sheet["totals"]);
  const rows: [string, number | undefined][] = [
    ["Total CIF", t.cif_ttd], ["Import duty", t.duty], ["Surcharge", t.surcharge],
    ...((t.mvt ?? 0) > 0 ? [["Motor vehicle tax", t.mvt] as [string, number]] : []),
    ["VAT", t.vat], ["Customs user fee", t.customs_user_fee],
  ];
  return (
    <aside className="st-rail" aria-label="Duties and totals">
      <h2 className="st-rail__title">Duties &amp; totals</h2>
      <dl>
        {rows.map(([l, v]) => (
          <div key={l} style={{ display: "contents" }}><dt>{l}</dt><dd>{money(v)}</dd></div>
        ))}
        {(t.relief_total ?? 0) > 0 && (
          <div style={{ display: "contents" }}><dt className="relief">C84 relief</dt><dd className="relief">− {money(t.relief_total)}</dd></div>
        )}
      </dl>
      <div className="st-rail__total"><span>Payable TT$</span><b>{money(t.total_payable)}</b></div>
      <p className="st-rail__factor">CIF factor <b>{(sheet.cif_factor ?? 0).toFixed(6)}</b></p>
      <p className="st-rail__note">Calculated by the server from the tariff database. Figures update when you save a field.</p>
    </aside>
  );
}
