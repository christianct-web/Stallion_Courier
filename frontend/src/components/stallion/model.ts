/**
 * model.ts — shared vocabulary for the Trade Declarations hub and job workspace.
 *
 * A "job" is a sheet. It moves through four stations (Setup → Documents →
 * Verify → Outputs) and, separately, through the server-enforced lifecycle
 * (draft → pending → approved → submitted → receipted, with correction).
 * Station progress here is a navigation hint only; the authoritative readiness
 * gate is the server's pre-submission check.
 */
import type { Sheet } from "@/services/sheetApi";
import { getSession, type StallionRole } from "@/services/auth";

/* ── declaration types (regime + type pairs as set by the original chooser) ── */
export type DeclChoice = {
  key: string; code: string; title: string; short: string; desc: string;
  regime: string; declaration_type: string;
};
export const DECL_CHOICES: DeclChoice[] = [
  { key: "import", code: "C82", title: "Import", short: "Import",
    desc: "Home-use entry. Invoice extraction, classification, duty, ASYCUDA XML.",
    regime: "C4", declaration_type: "import_c82" },
  { key: "export", code: "C82", title: "Export", short: "Export",
    desc: "Outbound shipment (EX1/EX3) documentation and declaration.",
    regime: "E1", declaration_type: "export_c82" },
  { key: "c84", code: "C84", title: "Duty concession", short: "Concession",
    desc: "Returning nationals, vehicles, diplomats, approved-undertaking waivers.",
    regime: "C4", declaration_type: "c84" },
  { key: "c75", code: "C75", title: "Warehousing", short: "Warehouse",
    desc: "Into a bonded warehouse with duty deferred until removal.",
    regime: "C7", declaration_type: "c75" },
  { key: "c76", code: "C76", title: "Ex-warehouse", short: "Ex-warehouse",
    desc: "Removal from bond. Triggers the duty deferred at C75 entry.",
    regime: "C7", declaration_type: "c76" },
  { key: "c86", code: "C86", title: "Bill of sight", short: "Bill of sight",
    desc: "Provisional clearance under bond while documents are incomplete.",
    regime: "C4", declaration_type: "c86" },
  { key: "manual", code: "WS", title: "Manual worksheet", short: "Worksheet",
    desc: "No documents. Build the worksheet line by line.",
    regime: "C4", declaration_type: "manual" },
];

export function choiceFor(s: Pick<Sheet, "declaration_type">): DeclChoice {
  return DECL_CHOICES.find(c => c.declaration_type === s.declaration_type) ?? DECL_CHOICES[0];
}
export function typeLabel(s: Pick<Sheet, "declaration_type">): string {
  const c = choiceFor(s);
  return c.key === "manual" ? c.short : `${c.code} ${c.short}`;
}

/* ── lifecycle ─────────────────────────────────────────────────────────────── */
export type Status = "draft" | "pending" | "correction" | "approved" | "submitted" | "receipted";

export function normStatus(status?: string): Status {
  const s = String(status || "draft").toLowerCase();
  if (s === "pending_review") return "pending";
  if (s === "needs_correction") return "correction";
  if (s === "exported") return "submitted";
  return (["draft", "pending", "correction", "approved", "submitted", "receipted"].includes(s)
    ? s : "draft") as Status;
}

export const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft", pending: "In review", correction: "Sent back",
  approved: "Approved", submitted: "Submitted", receipted: "Receipted",
};

/** Records past approval are not edited from the workspace. */
export const isLocked = (s: Sheet) => ["approved", "submitted", "receipted"].includes(normStatus(s.status));

export type Transition = { to: Status; label: string; tone: "primary" | "quiet"; needs?: "notes" | "receipt" };

/**
 * Transitions offered from each status. Mirrors the server's _TRANSITIONS map
 * (the server still validates every move); review moves are broker-only.
 */
export function transitionsFor(status: Status, role: StallionRole): Transition[] {
  const reviewer = role === "broker" || role === "admin";
  switch (status) {
    case "draft": return [{ to: "pending", label: "Submit for review", tone: "primary" }];
    case "correction": return [{ to: "pending", label: "Re-submit for review", tone: "primary" }];
    case "pending": return reviewer ? [
      { to: "approved", label: "Approve", tone: "primary" },
      { to: "correction", label: "Send back", tone: "quiet", needs: "notes" },
    ] : [];
    case "approved": return reviewer ? [
      { to: "submitted", label: "Mark submitted", tone: "primary" },
      { to: "correction", label: "Send back", tone: "quiet", needs: "notes" },
    ] : [];
    case "submitted": return reviewer ? [
      { to: "receipted", label: "Record receipt", tone: "primary", needs: "receipt" },
    ] : [];
    default: return [];
  }
}

export function currentUser() {
  const u = getSession()?.user;
  return { username: u?.username || "", name: u?.name || "", role: (u?.role || "clerk") as StallionRole };
}

/* ── stations ──────────────────────────────────────────────────────────────── */
export type StationKey = "setup" | "documents" | "verify" | "outputs";
export const STATIONS: { key: StationKey; label: string }[] = [
  { key: "setup", label: "Setup" },
  { key: "documents", label: "Documents" },
  { key: "verify", label: "Verify" },
  { key: "outputs", label: "Outputs" },
];

const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

export function stationsDone(s: Sheet): Record<StationKey, boolean> {
  const lines = s.lines || [];
  const status = normStatus(s.status);
  return {
    setup: filled(s.reference),
    documents: lines.length > 0,
    verify: lines.length > 0 && filled(s.consignee) && filled(s.invoice_no) && filled(s.currency)
      && lines.every(l => filled(l.hs_code)),
    outputs: ["pending", "approved", "submitted", "receipted"].includes(status),
  };
}

export function currentStation(s: Sheet): StationKey {
  const done = stationsDone(s);
  if (s.declaration_type === "manual" && done.setup && !done.documents) return "verify";
  return STATIONS.find(st => !done[st.key])?.key ?? "outputs";
}

/* ── formatting ────────────────────────────────────────────────────────────── */
export const money = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Parse a YYYY-MM-DD (or ISO) date as a local calendar day. */
export function localDay(iso?: string): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export const dayDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);

export function relTime(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
