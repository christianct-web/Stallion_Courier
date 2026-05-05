const BASE_URL =
  (import.meta.env.VITE_STALLION_API_URL as string | undefined)?.replace(/\/$/, "") ||
  `${window.location.protocol}//${window.location.hostname}:8022`;

const REQUEST_TIMEOUT_MS = 12000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const warnedKeys = new Set<string>();

function warnOnce(key: string, message: string, data?: unknown) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[stallionApi] ${message}`, data);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
    promise
      .then((v) => resolve(v))
      .catch((e) => reject(e))
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const request = () =>
    fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      ...init,
    });

  let res: Response;
  try {
    res = await withTimeout(request(), REQUEST_TIMEOUT_MS);
  } catch (e) {
    // one retry for transient network/process churn
    res = await withTimeout(request(), REQUEST_TIMEOUT_MS).catch((retryErr) => {
      throw retryErr ?? e;
    });
  }

  if (!res.ok) {
    if (RETRYABLE_STATUSES.has(res.status)) {
      const retryRes = await withTimeout(request(), REQUEST_TIMEOUT_MS);
      if (!retryRes.ok) throw new Error(`${path} failed (${retryRes.status})`);
      return (await retryRes.json()) as T;
    }
    throw new Error(`${path} failed (${res.status})`);
  }

  return (await res.json()) as T;
}

function normalizeListEnvelope<T = any>(res: unknown, endpoint: string): T[] {
  if (Array.isArray(res)) return res as T[];

  if (res && typeof res === "object") {
    const o = res as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as T[];
    if (Array.isArray(o.declarations)) return o.declarations as T[];

    if (o.data && typeof o.data === "object") {
      const d = o.data as Record<string, unknown>;
      if (Array.isArray(d.items)) return d.items as T[];
      if (Array.isArray(d.declarations)) return d.declarations as T[];
    }

    warnOnce(
      `${endpoint}-envelope`,
      `Unexpected list envelope from ${endpoint}; expected array/items/declarations. Falling back to [].`,
      res
    );
    return [];
  }

  warnOnce(`${endpoint}-nonobject`, `Unexpected non-object response from ${endpoint}. Falling back to [].`, res);
  return [];
}

export type LookupKind = "ports" | "terms" | "packages" | "duty_tax_codes" | "duty_tax_bases" | "cpc_codes" | "transport_modes" | "unit_codes" | "box23_types" | "customs_regimes" | "hs_tariff_samples";

export async function getLookup(kind: LookupKind): Promise<{ kind: string; items: { code: string; label: string }[] }> {
  return api(`/lookups/${kind}`);
}

export async function getCbttRate(date: string): Promise<{ rate: number; source: string } | null> {
  try {
    const q = date ? `?date=${encodeURIComponent(date)}` : "";
    return await api<{ rate: number; source: string }>(`/lookups/cbtt-rate${q}`);
  } catch {
    return null;
  }
}

export async function getTemplates(): Promise<Array<{ id: string; name: string; kind: string; scope: string; payload: any }>> {
  return api("/templates");
}

export async function createTemplate(payload: { name: string; kind: string; scope: string; payload: any }) {
  return api("/templates", { method: "POST", body: JSON.stringify(payload) });
}

export async function calculateWorksheet(payload: {
  invoice_value_foreign: number;
  inland_foreign?: number;
  uplift_pct?: number;
  exchange_rate: number;
  freight_foreign: number;
  insurance_foreign: number;
  other_foreign: number;
  deduction_foreign: number;
  duty_rate_pct: number;
  surcharge_rate_pct: number;
  vat_rate_pct: number;
  extra_fees_local: number;
  ces_fee_1?: number;
  ces_fee_2?: number;
}) {
  return api<{
    invoice_value_foreign: number;
    inland_foreign: number;
    uplift_pct: number;
    fob_foreign: number;
    fob_local: number;
    cif_foreign: number;
    cif_local: number;
    duty: number;
    surcharge: number;
    vat: number;
    extra_fees_local: number;
    customs_user_fee: number;
    ces_fee_1: number;
    ces_fee_2: number;
    total_assessed: number;
  }>("/worksheet/calculate", { method: "POST", body: JSON.stringify(payload) });
}

export async function generatePack(payload: {
  declaration_id?: string;
  header: Record<string, unknown>;
  worksheet: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  containers: Array<Record<string, unknown>>;
}) {
  return api<{
    status: "generated" | "blocked";
    generatedAt: string;
    preflight?: {
      status: "pass" | "fail";
      errors: { path: string; message: string }[];
      warnings: { path: string; message: string }[];
      counts: { errors: number; warnings: number };
    };
    documents: { name: string; status: string; ref: string; url?: string }[];
  }>("/pack/generate", { method: "POST", body: JSON.stringify(payload) });
}

export async function listDeclarations(status?: string): Promise<{ items: any[] }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await api<unknown>(`/declarations${q}`);
  return { items: normalizeListEnvelope(res, "/declarations") };
}

export async function upsertDeclaration(payload: Record<string, unknown>) {
  return api<{ ok: boolean; id: string }>("/declarations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function extractDocuments(files: File[], mode: "batch" | "separate" = "batch") {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("mode", mode);

  const res = await fetch(`${BASE_URL}/extract/documents`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`/extract/documents failed (${res.status})`);
  return (await res.json()) as {
    status: string;
    mode: string;
    items: Array<{
      id: string;
      consigneeName: string;
      consignorName: string;
      hsCode: string;
      invoiceValueForeign: number;
      currency: string;
      confidence: number;
      notes: string[];
      status: string;
      certificates: Array<{ type: string; number: string; issueDate: string | null; issuer: string; country: string }>;
      permitFlags: Array<{ invoiceName: string; ttbizlinkName: string; category: string; sequence: number; permitType: string }>;
      containerNumber: string;
    }>;
  };
}

// TODO(customs-receipt): add idempotency key header/payload once receipt workflow is implemented.
export async function reviewDeclaration(
  declarationId: string,
  payload: Record<string, unknown>
) {
  return api<{ ok: boolean; id: string; status: string }>(`/declarations/${declarationId}/review`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function submitDeclaration(declarationId: string, payload: Record<string, unknown> = {}) {
  return reviewDeclaration(declarationId, { action: "submitted", ...payload });
}

export async function deleteDeclaration(id: string): Promise<void> {
  await api(`/declarations/${id}`, { method: "DELETE" });
}

export interface HsResult {
  code: string;
  description: string;
  dutyRate: string;
  dutyPct?: number;
  surchargePct?: number;
  vatPct?: number;
  notes: string;
}


export async function hsSearch(query: string): Promise<HsResult[]> {
  const res = await fetch(`${BASE_URL}/hs/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`/hs/search failed (${res.status})`);
  const data = await res.json();
  return data.results as HsResult[];
}

export async function receiptDeclaration(declarationId: string, receiptNumber: string, payload: Record<string, unknown> = {}) {
  return reviewDeclaration(declarationId, {
    action: "receipted",
    receipt_number: receiptNumber,
    ...payload,
  });
}

export async function downloadRegisterCsv(period?: string) {
  const q = period ? `?period=${encodeURIComponent(period)}` : "";
  const endpoint = `${BASE_URL}/register/export${q}`;

  const tryFetch = async () => fetch(endpoint);
  const res = await tryFetch();

  // Graceful fallback: if endpoint is not available yet, export current declarations list as CSV client-side.
  if (!res.ok) {
    const { items } = await listDeclarations();
    const header = ["id", "reference", "status", "updated_at", "consignee", "receipt_number"];
    const lines = items.map((d: any) => [
      d.id ?? "",
      d.reference_number ?? d.header?.declarationRef ?? "",
      d.status ?? "",
      d.updated_at ?? "",
      d.header?.consigneeName ?? d.header?.consignee_name ?? "",
      d.receipt_number ?? d.receiptNumber ?? "",
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `register-${period || "all"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `register-${period || "all"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { BASE_URL as STALLION_BASE_URL };

// ─── Client directory ──────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  consigneeCode: string;
  tin: string;
  address: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  defaultBrokerageFee: number;
  notes: string;
  createdAt: string;
}

export async function listClients(): Promise<Client[]> {
  const res = await api<{ items: Client[] }>("/clients");
  return res.items || [];
}

export async function getClient(id: string): Promise<Client> {
  return api<Client>(`/clients/${id}`);
}

export async function createClient(payload: Omit<Client, "id" | "createdAt">): Promise<Client> {
  return api<Client>("/clients", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateClient(id: string, payload: Partial<Client>): Promise<Client> {
  return api<Client>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteClient(id: string): Promise<void> {
  await api(`/clients/${id}`, { method: "DELETE" });
}

// ─── Brokerage invoice ─────────────────────────────────────────────────────

export async function generateBrokerageInvoice(
  declarationId: string,
  payload: {
    brokerage_fee_ttd?: number;
    invoice_number?: string;
    notes?: string;
    client_id?: string;
  }
): Promise<{ ok: boolean; doc_id: string; download_url: string }> {
  return api(`/declarations/${declarationId}/brokerage-invoice`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Costing / estimate document ───────────────────────────────────────────

export async function generateCostingFromDeclaration(
  declarationId: string,
  payload: {
    broker_firm?: string;
    broker_address?: string;
    broker_phone?: string;
    notes?: string;
  } = {}
): Promise<{ ok: boolean; doc_id: string; download_url: string }> {
  return api(`/declarations/${declarationId}/costing`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateCostingFromWorksheet(payload: {
  header: Record<string, unknown>;
  worksheet: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  broker_firm?: string;
  broker_address?: string;
  broker_phone?: string;
  notes?: string;
}): Promise<{ ok: boolean; doc_id: string; download_url: string }> {
  return api("/worksheet/costing", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
