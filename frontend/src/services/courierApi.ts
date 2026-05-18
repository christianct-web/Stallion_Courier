/**
 * Courier API client — wraps /courier/* endpoints with the same
 * conventions used by stallionApi.ts (timeout, retry, envelope normalization).
 */
import { STALLION_BASE_URL } from "./stallionApi";

const REQUEST_TIMEOUT_MS = 12000;

function extractErrorMessage(err: any, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err.detail === "string") return err.detail;
  if (Array.isArray(err.detail)) {
    const first = err.detail[0];
    if (typeof first === "string") return first;
    if (first?.msg) {
      // Pydantic error shape: { loc: ["body", "thn"], msg: "Field required", ... }
      // Surface the field name so the broker sees WHICH field is wrong.
      const loc = Array.isArray(first.loc) ? first.loc : [];
      const fieldPath = loc.filter((p: any) => p !== "body").join(".");
      const msg = String(first.msg).replace(/^Value error,?\s*/, "");
      return fieldPath ? `${fieldPath}: ${msg}` : msg;
    }
  }
  if (typeof err.message === "string") return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return fallback;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
    promise
      .then((v) => resolve(v))
      .catch((e) => reject(e))
      .finally(() => { if (timer) clearTimeout(timer); });
  });
}

async function courierApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await withTimeout(
    fetch(`${STALLION_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...((init?.headers as Record<string, string>) || {}),
      },
    }),
    REQUEST_TIMEOUT_MS,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(err, `Request failed (${res.status})`));
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────

export interface CourierLine {
  id: string;
  line_no: number;
  hawb: string;
  shipper: string;
  importer: string;
  description: string;
  packages: number;
  weight_kg: number;
  thn: string;
  cost_usd: number;
  freight_usd: number;
  // Computed
  cif_ttd: number;
  duty: number;
  opt: number;
  vat: number;
  total_taxes: number;
  exemption_class: "none" | "duty_free_only" | "full_exempt";
  duty_rate: number;
  classifier_notes: string;
  thn_was_corrected?: boolean;
  thn_original?: string;
  thn_unknown?: boolean;
  // Optional matcher metadata
  thn_suggestions?: ThnSuggestion[];
  thn_match_source?: string;
  thn_confidence?: number | null;
  // Officer overrides
  duty_rate_override?: number | null;
  exemption_override?: string | null;
}

export interface CourierManifest {
  id: string;
  manifest_no: string;
  arrival_date: string;
  exch_rate: number;
  cargo_reporter: string;
  notes: string;
  status: "draft" | "submitted" | "examined" | "finalised";
  declarant_vat_no?: string;
  lines: CourierLine[];
  officer_examination: OfficerExamination | null;
  totals: {
    total_cif_ttd: number;
    total_duty: number;
    total_opt: number;
    total_vat: number;
    total_taxes: number;
  };
  created_at: string;
  updated_at: string;
}

export interface OfficerCorrection {
  line_no: number | null;
  kind: "uplift" | "reclass" | "new_line" | "description" | "seizure";
  officer_thn: string;
  new_description: string;
  add_cost_usd: number;
  adjusted_cif_ttd: number;
  add_duty: number;
  add_opt: number;
  add_vat: number;
  add_total: number;
  detained_seized?: boolean;
  dep_in_tshed?: boolean;
}

export interface OfficerExamination {
  examined_at: string;
  examining_officer: string;
  corrections: OfficerCorrection[];
  recorded_at?: string;
}

export interface ThnSuggestion {
  thn: string;
  code: string;
  description: string;
  duty_rate: number;
  duty_rate_raw: string;
  exemption_class: "none" | "duty_free_only" | "full_exempt";
  confidence: number;
  match_reason: string;
  is_unknown?: boolean;
  /** Set by the matcher when the result is a low-confidence guess /
   *  last-resort fallback the broker should verify before finalising. */
  needs_review?: boolean;
}

export interface ClassifyResponse {
  description: string;
  suggestions: ThnSuggestion[];
  source: "keyword_index" | "full_text" | "hybrid" | "none";
  best_match: ThnSuggestion | null;
}

export interface RuleExemption {
  thn: string;
  class: "full_exempt" | "duty_free_only";
  notes: string;
  added_by?: string;
  added_at?: string;
  updated_at?: string;
  is_user?: boolean;
}

export interface RuleCorrection {
  wrong_thn: string;
  correct_thn: string;
  reason: string;
  added_by?: string;
  added_at?: string;
  is_user?: boolean;
}

export interface AuditEntry {
  at: string;
  by: string;
  action: string;
  target: string;
  before: any;
  after: any;
  comment: string;
}

// ── Manifests ────────────────────────────────────────────────────────────

export async function listManifests(): Promise<{ items: CourierManifest[] }> {
  return courierApi("/courier/manifests");
}

export async function getManifest(id: string): Promise<CourierManifest> {
  return courierApi(`/courier/manifests/${id}`);
}

export async function createManifest(input: {
  manifest_no: string;
  arrival_date: string;
  exch_rate: number;
  cargo_reporter?: string;
  notes?: string;
}): Promise<CourierManifest> {
  return courierApi("/courier/manifests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface UploadTemplateResult {
  manifest: CourierManifest;
  summary: {
    manifest_no: string;
    lines_in_file: number;
    lines_imported: number;
    lines_skipped: number;
    skipped_details: string[];
    warnings: string[];
  };
}

/**
 * Upload a TTPOST express-consignment XLSX template. The system parses it,
 * creates a manifest, and auto-classifies each line.
 */
export async function uploadTemplate(
  file: File,
  arrivalDate: string,
  exchRate: number,
): Promise<UploadTemplateResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("arrival_date", arrivalDate);
  form.append("exch_rate", String(exchRate));

  const res = await fetch(`${STALLION_BASE_URL}/courier/manifests/from-template`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(err, `Upload failed (${res.status})`));
  }
  return res.json();
}

export async function updateManifestHeader(
  id: string,
  patch: Partial<{
    manifest_no: string;
    arrival_date: string;
    exch_rate: number;
    cargo_reporter: string;
    notes: string;
    status: string;
  }>,
): Promise<CourierManifest> {
  return courierApi(`/courier/manifests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteManifest(id: string): Promise<{ ok: boolean }> {
  return courierApi(`/courier/manifests/${id}`, { method: "DELETE" });
}

/**
 * Recompute every line's duty/OPT/VAT against the current tariff/rules.
 * Call after a tariff override is saved.
 */
export async function recomputeManifest(id: string): Promise<CourierManifest> {
  return courierApi(`/courier/manifests/${id}/recompute`, { method: "POST" });
}

// ── Lines ────────────────────────────────────────────────────────────────

export async function addLine(
  manifestId: string,
  payload: Partial<CourierLine> & { auto_classify?: boolean },
): Promise<CourierLine> {
  return courierApi(`/courier/manifests/${manifestId}/lines`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateLine(
  manifestId: string,
  lineNo: number,
  patch: Partial<CourierLine>,
): Promise<CourierLine> {
  return courierApi(`/courier/manifests/${manifestId}/lines/${lineNo}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteLine(
  manifestId: string,
  lineNo: number,
): Promise<{ ok: boolean }> {
  return courierApi(`/courier/manifests/${manifestId}/lines/${lineNo}`, {
    method: "DELETE",
  });
}

// ── Officer examination ──────────────────────────────────────────────────

export async function recordExamination(
  manifestId: string,
  exam: {
    examined_at?: string;
    examining_officer?: string;
    corrections: OfficerCorrection[];
  },
): Promise<CourierManifest> {
  return courierApi(`/courier/manifests/${manifestId}/exam`, {
    method: "POST",
    body: JSON.stringify(exam),
  });
}

// ── Classification & lookup ──────────────────────────────────────────────

export async function classifyDescription(
  description: string,
  limit: number = 5,
): Promise<ClassifyResponse> {
  return courierApi(`/courier/classify`, {
    method: "POST",
    body: JSON.stringify({ description, limit }),
  });
}

export async function lookupThn(thn: string): Promise<{
  thn: string;
  entry: any;
  exemption_class: string;
  duty_rate: number;
  notes: string;
  is_corrected: boolean;
  original_thn: string;
  is_unknown: boolean;
}> {
  return courierApi(`/courier/lookup/${encodeURIComponent(thn)}`);
}

// ── Rules management ─────────────────────────────────────────────────────

export async function getRules(): Promise<{
  exemptions: RuleExemption[];
  thn_corrections: RuleCorrection[];
}> {
  return courierApi("/courier/rules");
}

export async function addExemption(input: {
  thn: string;
  class: "full_exempt" | "duty_free_only";
  notes: string;
  comment?: string;
}, userId: string = "anonymous"): Promise<RuleExemption> {
  return courierApi(`/courier/rules/exemptions`, {
    method: "POST",
    headers: { "X-User-Id": userId },
    body: JSON.stringify(input),
  });
}

export async function removeExemption(
  thn: string,
  comment: string = "",
  userId: string = "anonymous",
): Promise<{ ok: boolean }> {
  const q = comment ? `?comment=${encodeURIComponent(comment)}` : "";
  return courierApi(`/courier/rules/exemptions/${encodeURIComponent(thn)}${q}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
}

export async function addCorrection(input: {
  wrong_thn: string;
  correct_thn: string;
  reason: string;
  comment?: string;
}, userId: string = "anonymous"): Promise<RuleCorrection> {
  return courierApi(`/courier/rules/corrections`, {
    method: "POST",
    headers: { "X-User-Id": userId },
    body: JSON.stringify(input),
  });
}

export async function removeCorrection(
  wrongThn: string,
  comment: string = "",
  userId: string = "anonymous",
): Promise<{ ok: boolean }> {
  const q = comment ? `?comment=${encodeURIComponent(comment)}` : "";
  return courierApi(`/courier/rules/corrections/${encodeURIComponent(wrongThn)}${q}`, {
    method: "DELETE",
    headers: { "X-User-Id": userId },
  });
}

export async function addTariffEntry(input: {
  thn: string;
  description: string;
  duty_pct: number;
  chapter?: number;
  unit?: string;
  is_exempt?: boolean;
  comment?: string;
}, userId: string = "anonymous"): Promise<any> {
  return courierApi(`/courier/tariff`, {
    method: "POST",
    headers: { "X-User-Id": userId },
    body: JSON.stringify(input),
  });
}

export async function browseTariff(params: {
  chapter?: number;
  q?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
  const search = new URLSearchParams();
  if (params.chapter !== undefined) search.set("chapter", String(params.chapter));
  if (params.q) search.set("q", params.q);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  const qs = search.toString();
  return courierApi(`/courier/tariff${qs ? `?${qs}` : ""}`);
}

export async function getAuditLog(
  limit: number = 100,
  offset: number = 0,
): Promise<{ items: AuditEntry[]; total: number; limit: number; offset: number }> {
  return courierApi(`/courier/rules/audit?limit=${limit}&offset=${offset}`);
}

// ── Exports ──────────────────────────────────────────────────────────────

export function worksheetDownloadUrl(manifestId: string): string {
  return `${STALLION_BASE_URL}/courier/manifests/${manifestId}/worksheet`;
}

export function hazmatDownloadUrl(manifestId: string): string {
  return `${STALLION_BASE_URL}/courier/manifests/${manifestId}/hazmat`;
}

/**
 * Fields the broker fills in on the Hazmat form modal. Every field is
 * optional — the broker can leave any blank and the export still
 * generates (the blank cells just render empty in the XLSX).
 */
export interface HazmatFormFields {
  date?: string;
  ntde_no?: string;
  ced_receipt_no?: string;
  vat_no?: string;
  carrier?: string;
  date_of_arrival?: string;
  rot_no?: string;
  no_of_skids?: number | string;
  no_of_boxes?: number | string;
  no_of_bags?: number | string;
  no_of_commercial_pcs?: number | string;
  no_of_non_commercial_pcs?: number | string;
  total_no_of_pkgs?: number | string;
  no_of_pkgs_detained?: number | string;
  no_of_pkgs_seized?: number | string;
  no_of_pkgs_bonded?: number | string;
}

/**
 * Download the Hazmat XLSX with broker-filled form fields. POSTs the
 * fields, reads the binary response, and triggers a browser save dialog.
 *
 * Unlike a regular `<a href download>` link, this lets us POST the form
 * data. The server returns the XLSX bytes, which we wrap in a Blob and
 * hand off to the browser via a temporary object URL.
 */
export async function downloadHazmatWithFields(
  manifestId: string, fields: HazmatFormFields,
): Promise<void> {
  const res = await fetch(
    `${STALLION_BASE_URL}/courier/manifests/${manifestId}/hazmat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    },
  );
  if (!res.ok) {
    let msg = `Hazmat export failed (${res.status})`;
    try {
      const err = await res.json();
      msg = extractErrorMessage(err, msg);
    } catch {
      // response wasn't JSON
    }
    throw new Error(msg);
  }
  const blob = await res.blob();

  // Try to read the filename from Content-Disposition; fall back to a sensible default
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="?([^";]+)"?/i);
  const filename = match ? match[1] : `manifest_${manifestId}_hazmat.xlsx`;

  // Trigger download
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
