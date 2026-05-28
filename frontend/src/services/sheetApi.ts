/**
 * sheetApi.ts — client for the Stallion Sheet endpoints.
 * Drop into frontend/src/services/sheetApi.ts
 * Reuses STALLION_BASE_URL from the existing stallionApi.ts.
 */
import { STALLION_BASE_URL } from "./stallionApi";

const BASE = `${STALLION_BASE_URL}/sheets`;

export interface RefOption { code: string; label: string; }
export interface RefData {
  countries: RefOption[]; cpc: RefOption[]; nature_of_transaction: RefOption[];
  package_types: RefOption[]; incoterms: RefOption[]; ports: RefOption[];
  customs_regimes: RefOption[]; supplementary_units: RefOption[];
}

export interface SheetLine {
  id: string; line_no: number;
  cpc: string; hs_code: string; description: string;
  exworks_usd: number; insurance_usd: number; other_usd: number;
  freight_usd_override: number | null;
  duty_pct: number; surcharge_pct: number; vat_pct: number;
  country_of_origin: string; supplementary_qty: number; supplementary_unit: string;
  package_count: number; package_type: string; licence_no: string;
  relieved_override?: boolean;
  effects_group?: "household" | "personal";
  relieved?: boolean;
  // computed
  freight_usd: number; cif_usd: number; cif_ttd: number;
  duty: number; surcharge: number; vat: number; total_tax: number;
}

export interface SheetTotals {
  exworks_usd: number; freight_usd: number; cif_usd: number; cif_ttd: number;
  duty: number; surcharge: number; vat: number; customs_user_fee: number; total_payable: number;
}

export interface Sheet {
  id: string; reference: string; status: string;
  client_id?: string;
  reviewed_at?: string; reviewed_by?: string; submitted_at?: string;
  receipt_number?: string;
  status_history?: { from: string; to: string; at: string; actor: string; notes: string }[];
  consignee: string; consignee_tin: string; consignor: string;
  vessel: string; bl_number: string; port: string; arrival_date: string;
  incoterm: string; exchange_rate: number; freight_usd: number;
  insurance_usd: number; other_usd?: number; inland_usd?: number; uplift_pct?: number; customs_user_fee: number;
  customs_regime: string; nature_of_transaction: string;
  entry_mode?: "dutiable" | "relieved";
  rollup_9898?: boolean;
  total_packages: number; gross_weight: number;
  cif_factor?: number; lines: SheetLine[]; totals: SheetTotals;
  broker_notes: string; created_at: string; updated_at: string;
}

export interface Client {
  id: string; name: string; consigneeCode: string; tin: string;
  address?: string; contactName?: string; defaultBrokerageFee?: number;
}

const j = (r: Response) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); };

export const setStatus = (id: string, status: string, extra?: { notes?: string; receipt_number?: string }): Promise<Sheet> =>
  fetch(`${BASE}/${id}/status`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...(extra || {}) }),
  }).then(j);

export const listClients = (): Promise<Client[]> =>
  fetch(`${STALLION_BASE_URL}/clients`).then(j)
    .then((r: any) => (Array.isArray(r) ? r : r.items || []));

export const getReference = (): Promise<RefData> => fetch(`${BASE}/reference`).then(j);
export const listSheets = (): Promise<Sheet[]> => fetch(BASE).then(j);
export const getSheet = (id: string): Promise<Sheet> => fetch(`${BASE}/${id}`).then(j);
export const createSheet = (seed?: Partial<Sheet>): Promise<Sheet> =>
  fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(seed || {}) }).then(j);
export const deleteSheet = (id: string): Promise<any> =>
  fetch(`${BASE}/${id}`, { method: "DELETE" }).then(j);

export const updateHeader = (id: string, patch: Partial<Sheet>): Promise<Sheet> =>
  fetch(`${BASE}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then(j);

export const addLine = (id: string, payload: Partial<SheetLine>): Promise<Sheet> =>
  fetch(`${BASE}/${id}/lines`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(j);
export const updateLine = (id: string, lineNo: number, patch: Partial<SheetLine>): Promise<Sheet> =>
  fetch(`${BASE}/${id}/lines/${lineNo}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then(j);
export const deleteLine = (id: string, lineNo: number): Promise<Sheet> =>
  fetch(`${BASE}/${id}/lines/${lineNo}`, { method: "DELETE" }).then(j);

export const classify = (id: string, description: string): Promise<{ suggestions: any[] }> =>
  fetch(`${BASE}/${id}/classify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description }) }).then(j);

export const worksheetUrl = (id: string) => `${BASE}/${id}/worksheet?fmt=xlsx`;

export const generateXml = async (id: string, patch?: Partial<Sheet>): Promise<void> => {
  const r = await fetch(`${BASE}/${id}/xml`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch || {}),
  });
  if (!r.ok) throw new Error(`XML generation failed: ${r.status}`);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `C82_${id}.xml`; a.click();
  URL.revokeObjectURL(url);
};

// Inline extraction: upload a doc, server extracts + auto-populates lines, returns the sheet.
export const uploadExtract = async (id: string, file: File): Promise<Sheet> => {
  const fd = new FormData(); fd.append("file", file);
  const r = await fetch(`${BASE}/${id}/extract`, { method: "POST", body: fd });
  return j(r);
};
