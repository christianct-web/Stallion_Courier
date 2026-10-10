/**
 * StallionSheetList.tsx — Trade Declarations hub, laid out as an arrivals docket.
 *
 * Jobs are grouped by when their goods land (landed-but-open first, then today,
 * tomorrow, this week, later, undated, and cleared arrivals last), so the work
 * runs in the order vessels arrive. Each row carries its four-station track and
 * opens the job at its next station. "New job" asks for the reference number
 * and the declaration type, then drops the clerk on Documents.
 *
 * Lives at /stallion/sheets inside StallionShell (which renders TopNav).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight, Plus, Search, Trash2, X } from "lucide-react";
import { createSheet, deleteSheet, listSheets, type Sheet } from "@/services/sheetApi";
import {
  DECL_CHOICES, currentStation, currentUser, dayDiff, localDay, money, normStatus,
  relTime, startOfToday, stationsDone, typeLabel, type Status,
} from "@/components/stallion/model";
import { StationTrack, StatusChip, TypePicker } from "@/components/stallion/ui";
import "@/styles/stallion.css";

/* ── queues ──────────────────────────────────────────────────────────────── */
type QueueKey = "open" | "review" | "correction" | "draft" | "approved" | "submitted" | "receipted" | "all";
const QUEUE_MATCH: Record<QueueKey, (s: Status) => boolean> = {
  open: s => s !== "receipted",
  review: s => s === "pending",
  correction: s => s === "correction",
  draft: s => s === "draft",
  approved: s => s === "approved",
  submitted: s => s === "submitted",
  receipted: s => s === "receipted",
  all: () => true,
};

/* ── docket groups ───────────────────────────────────────────────────────── */
type GroupKey = "landed" | "today" | "tomorrow" | "week" | "later" | "undated" | "cleared";
const GROUP_ORDER: GroupKey[] = ["landed", "today", "tomorrow", "week", "later", "undated", "cleared"];
const GROUP_NAME: Record<GroupKey, string> = {
  landed: "Landed, not yet submitted", today: "Today", tomorrow: "Tomorrow",
  week: "This week", later: "Later", undated: "No arrival date", cleared: "Earlier arrivals",
};

const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const SHORT_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function groupOf(s: Sheet, today: Date): GroupKey {
  const d = localDay(s.arrival_date);
  const st = normStatus(s.status);
  const cleared = st === "submitted" || st === "receipted";
  if (!d) return "undated";
  const diff = dayDiff(d, today);
  if (diff < 0) return cleared ? "cleared" : "landed";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return "week";
  return "later";
}

function groupDate(key: GroupKey, today: Date): string {
  if (key === "today") return DAY_FMT.format(today).toUpperCase();
  if (key === "tomorrow") return DAY_FMT.format(new Date(today.getTime() + 86400000)).toUpperCase();
  return "";
}

function whenCell(s: Sheet, today: Date) {
  const d = localDay(s.arrival_date);
  if (!d) return <span className="st-row__when">—</span>;
  const diff = dayDiff(d, today);
  if (diff === 0) return <span className="st-row__when"><b>Today</b></span>;
  if (diff === 1) return <span className="st-row__when"><b>Tmrw</b></span>;
  if (diff < 0 && diff > -60) {
    return <span className="st-row__when">{SHORT_FMT.format(d)}<br /><small style={{ color: "var(--ink-3)" }}>{-diff}d ago</small></span>;
  }
  return <span className="st-row__when">{SHORT_FMT.format(d)}</span>;
}

const payable = (s: Sheet) => s.totals?.total_payable;

export default function StallionSheetList() {
  const nav = useNavigate();
  const user = currentUser();
  const reviewer = user.role === "broker" || user.role === "admin";

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [queue, setQueue] = useState<QueueKey | null>(null);
  const [q, setQ] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [ref, setRef] = useState("");
  const [dtype, setDtype] = useState(DECL_CHOICES[0].declaration_type);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const refInput = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    setLoadError("");
    listSheets()
      .then(setSheets)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not load jobs."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => { if (showNew) refInput.current?.focus(); }, [showNew]);

  const counts = useMemo(() => {
    const c = {} as Record<QueueKey, number>;
    (Object.keys(QUEUE_MATCH) as QueueKey[]).forEach(k => {
      c[k] = sheets.filter(s => QUEUE_MATCH[k](normStatus(s.status))).length;
    });
    return c;
  }, [sheets]);

  // Brokers land on their review queue when something is waiting for them.
  const activeQueue: QueueKey = queue ?? (reviewer && counts.review > 0 ? "review" : "open");

  const today = startOfToday();
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = sheets
      .filter(s => QUEUE_MATCH[activeQueue](normStatus(s.status)))
      .filter(s => !needle || [s.reference, s.consignee, s.consignor, s.vessel, s.bl_number, s.invoice_no, typeLabel(s)]
        .filter(Boolean).join(" ").toLowerCase().includes(needle));
    const byGroup = new Map<GroupKey, Sheet[]>();
    rows.forEach(s => {
      const g = groupOf(s, today);
      byGroup.set(g, [...(byGroup.get(g) || []), s]);
    });
    return GROUP_ORDER.filter(g => byGroup.has(g)).map(g => {
      const items = byGroup.get(g)!.sort((a, b) => {
        const da = a.arrival_date || "", db = b.arrival_date || "";
        if (da !== db) return g === "cleared" || g === "landed" ? db.localeCompare(da) : da.localeCompare(db);
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      });
      const total = items.reduce((sum, s) => sum + (payable(s) ?? 0), 0);
      return { key: g, items, total };
    });
    // `today` is derived per render; the day only changes at midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, activeQueue, q]);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  const trimmedRef = ref.trim();
  const duplicate = trimmedRef
    ? sheets.find(s => (s.reference || "").trim().toLowerCase() === trimmedRef.toLowerCase())
    : undefined;

  const openNew = () => { setShowNew(true); setCreateError(""); };
  const closeNew = () => { setShowNew(false); setRef(""); setCreateError(""); };

  const create = async () => {
    if (!trimmedRef || creating) return;
    const choice = DECL_CHOICES.find(c => c.declaration_type === dtype) ?? DECL_CHOICES[0];
    setCreating(true);
    setCreateError("");
    try {
      const s = await createSheet({
        reference: trimmedRef, customs_regime: choice.regime, declaration_type: choice.declaration_type,
      });
      nav(`/stallion/sheet/${s.id}?step=${choice.key === "manual" ? "verify" : "documents"}`);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "The server did not accept the new job.");
      setCreating(false);
    }
  };

  const remove = async (s: Sheet) => {
    if (!window.confirm(`Delete job ${s.reference || s.id}? This cannot be undone.`)) return;
    try {
      await deleteSheet(s.id);
      setSheets(prev => prev.filter(x => x.id !== s.id));
    } catch (e: unknown) {
      window.alert(`Could not delete the job. ${e instanceof Error ? e.message : ""}`);
    }
  };

  const queueDefs: { key: QueueKey; label: string; hot?: boolean }[] = [
    ...(reviewer ? [{ key: "review" as QueueKey, label: "Waiting on your review", hot: true }] : []),
    { key: "open", label: "Open jobs" },
    { key: "correction", label: "Sent back", hot: true },
    { key: "draft", label: "Drafts" },
    ...(!reviewer ? [{ key: "review" as QueueKey, label: "With the broker" }] : []),
    { key: "approved", label: "Approved" },
    { key: "submitted", label: "Submitted" },
    { key: "receipted", label: "Receipted" },
    { key: "all", label: "All" },
  ];

  const landedOpen = sheets.filter(s => groupOf(s, today) === "landed").length;
  const todayCount = sheets.filter(s => groupOf(s, today) === "today").length;

  return (
    <div className="st">
      <div className="st-hub">
        <header className="st-hub__head">
          <div>
            <h1 className="st-h1">Trade Declarations</h1>
            <p className="st-hub__sub">
              <span className="mono">{DAY_FMT.format(today)}</span>
              {" · "}
              {loading ? "Loading the docket…" : (
                <>
                  {todayCount === 0 ? "Nothing lands today" : `${todayCount} job${todayCount === 1 ? "" : "s"} land today`}
                  {landedOpen > 0 && <>, {landedOpen} landed and not yet submitted</>}
                  {reviewer && counts.review > 0 && <>, {counts.review} waiting on your review</>}
                  .
                </>
              )}
            </p>
          </div>
          <div className="st-hub__actions">
            <div className="st-search">
              <Search aria-hidden="true" />
              <input className="st-input prose" type="search" value={q} onChange={e => setQ(e.target.value)}
                placeholder="Reference, client, vessel, BL…" aria-label="Search jobs" />
            </div>
            <button type="button" className="st-btn st-btn--primary" onClick={showNew ? closeNew : openNew}
              aria-expanded={showNew}>
              {showNew ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {showNew ? "Cancel" : "New job"}
            </button>
          </div>
        </header>

        {showNew && (
          <form className="st-newjob" onSubmit={e => { e.preventDefault(); create(); }} aria-label="New job">
            <div className="st-newjob__body">
              <div className="st-newjob__ref">
                <h2 className="st-newjob__title">Open a job</h2>
                <p className="st-newjob__lede">Give it your reference number and pick the declaration. Next you'll upload the documents.</p>
                <div className="st-field">
                  <label htmlFor="new-ref">Reference number</label>
                  <input id="new-ref" ref={refInput} className="st-input" value={ref} autoComplete="off"
                    onChange={e => setRef(e.target.value)} placeholder="e.g. JOB-2026-0412"
                    onKeyDown={e => { if (e.key === "Escape") closeNew(); }} />
                </div>
                {duplicate && (
                  <p className="st-note st-note--warn" style={{ marginTop: 10 }}>
                    <AlertTriangle aria-hidden="true" />
                    <span><b>{duplicate.reference}</b> already exists. <Link to={`/stallion/sheet/${duplicate.id}?step=${currentStation(duplicate)}`}>Open it</Link> instead?</span>
                  </p>
                )}
              </div>
              <div className="st-field">
                <span className="st-label" id="new-type-label">Declaration type</span>
                <TypePicker value={dtype} onChange={setDtype} name="new-type" />
              </div>
            </div>
            <div className="st-newjob__foot">
              <span className={`st-note${createError ? " st-note--crit" : ""}`}>
                {createError ? <>Could not open the job: {createError}</> : trimmedRef
                  ? <>Opens <b className="mono">{trimmedRef}</b> as {typeLabel({ declaration_type: dtype })}.</>
                  : "A reference number is required."}
              </span>
              <button type="submit" className="st-btn st-btn--primary" disabled={!trimmedRef || creating}>
                {creating ? "Opening…" : duplicate ? "Open a second job" : "Open job"}
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </form>
        )}

        <nav className="st-queues" aria-label="Queues">
          {queueDefs.map(d => (
            <button key={d.key} type="button" className={`st-queue${d.hot && counts[d.key] > 0 ? " is-hot" : ""}`}
              aria-pressed={activeQueue === d.key} onClick={() => setQueue(d.key)}>
              {d.label}<span className="count">{counts[d.key] ?? 0}</span>
            </button>
          ))}
        </nav>

        {loadError ? (
          <div className="st-banner st-banner--crit" role="alert">
            <AlertTriangle aria-hidden="true" />
            <span><b>The docket did not load.</b> {loadError}{" "}
              <button type="button" className="st-linkbtn" onClick={load}>Try again</button></span>
          </div>
        ) : loading ? (
          <div className="st-docket" aria-busy="true">
            <section>
              <div className="st-day__rule"><span className="st-day__name">Loading</span></div>
              <div className="st-rows">{[0, 1, 2].map(i => <div key={i} className="st-skeleton" />)}</div>
            </section>
          </div>
        ) : shown === 0 ? (
          <div className="st-empty">
            <h2>{sheets.length === 0 ? "No jobs yet" : q ? "No job matches that search" : "This queue is clear"}</h2>
            <p>{sheets.length === 0
              ? "Open a job with its reference number, upload the invoice and bill of lading, and Stallion fills in the declaration."
              : q ? "Check the reference or try the client's name." : "Nothing is waiting here. Pick another queue above."}</p>
            {sheets.length === 0 ? (
              <button type="button" className="st-btn st-btn--primary" onClick={openNew}><Plus aria-hidden="true" />New job</button>
            ) : (
              <button type="button" className="st-btn" onClick={() => { setQ(""); setQueue("all"); }}>Show all jobs</button>
            )}
          </div>
        ) : (
          <>
            <div className="st-docket__head" aria-hidden="true">
              <span>Arrives</span><span className="c-vessel">Vessel</span><span>Reference</span><span>Client</span>
              <span>Type</span><span>Progress</span><span>Status</span><span className="r">Payable TT$</span><span />
            </div>
            <div className="st-docket">
              {groups.map(g => {
                const dateText = groupDate(g.key, today);
                const tone = g.key === "landed" ? " st-day--alert" : g.key === "undated" || g.key === "cleared" ? " st-day--quiet" : "";
                return (
                  <section key={g.key} className={`st-day${tone}`} aria-labelledby={`grp-${g.key}`}>
                    <div className="st-day__rule">
                      <h2 id={`grp-${g.key}`} className="st-day__name" style={{ margin: 0 }}>{GROUP_NAME[g.key]}</h2>
                      {dateText && <span className="st-day__date">{dateText}</span>}
                      <span className="st-day__meta">
                        <b>{g.items.length}</b> job{g.items.length === 1 ? "" : "s"} · TT$ <b>{money(g.total)}</b>
                      </span>
                    </div>
                    <ul className="st-rows">
                      {g.items.map(s => {
                        const done = stationsDone(s);
                        const cur = currentStation(s);
                        const st = normStatus(s.status);
                        const deletable = st === "draft" || st === "correction";
                        return (
                          <li key={s.id} className={`st-row${deletable ? " has-del" : ""}`}>
                            <Link className="st-row__link" to={`/stallion/sheet/${s.id}?step=${cur}`}
                              aria-label={`${s.reference || "Untitled job"}${s.consignee ? `, ${s.consignee}` : ""}`}>
                              {whenCell(s, today)}
                              <span className="st-row__vessel">
                                {s.vessel || "—"}
                                {s.bl_number && <small>BL {s.bl_number}</small>}
                              </span>
                              <span className="st-row__ref">{s.reference || "Untitled"}</span>
                              <span className={`st-row__client${s.consignee ? "" : " is-empty"}`}>
                                {s.consignee || "Client not set"}
                              </span>
                              <span className="st-row__type"><span className="st-tag">{typeLabel(s)}</span></span>
                              <span className="st-row__track"><StationTrack done={done} current={cur} label /></span>
                              <span className="st-row__status"><StatusChip status={s.status} /></span>
                              <span className="st-row__money">
                                {(s.lines || []).length ? money(payable(s)) : "—"}
                                <small>{(s.lines || []).length} line{(s.lines || []).length === 1 ? "" : "s"} · {relTime(s.updated_at)}</small>
                              </span>
                              <span className="st-row__go" aria-hidden="true"><ChevronRight /></span>
                            </Link>
                            {deletable && (
                              <button type="button" className="st-iconbtn st-iconbtn--danger st-row__del"
                                onClick={() => remove(s)} aria-label={`Delete job ${s.reference || s.id}`} title="Delete job">
                                <Trash2 />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
            <p className="st-footnote">
              {shown} of {sheets.length} job{sheets.length === 1 ? "" : "s"}{q ? ` matching “${q.trim()}”` : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
