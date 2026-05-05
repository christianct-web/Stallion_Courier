import { useState, useEffect, useCallback } from "react";
import { TopNav } from "@/components/TopNav";
import { toast } from "sonner";
import { STALLION_BASE_URL } from "@/services/stallionApi";

// ── Design tokens (matches existing Stallion palette) ──────────────────────
const C = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6",
  paperMid: "#CCC7BE", ink: "#18150F", inkMid: "#3D3830", inkLight: "#6B6560",
  void: "#111318", voidMid: "#191D26", voidSurface: "#1F2430",
  voidBorder: "#2E3748", ghost: "#A0AABB", ghostDim: "#6B7585",
  green: "#1A5C3A", greenMid: "#2E7D52", greenLight: "#EBF5EE",
  warn: "#FEF3DC", warnBorder: "#D4A020", critical: "#FEE8E8", critBorder: "#B02020",
};

// ── Types ──────────────────────────────────────────────────────────────────
interface Client {
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

const EMPTY_FORM: Omit<Client, "id" | "createdAt"> = {
  name: "",
  consigneeCode: "",
  tin: "",
  address: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  defaultBrokerageFee: 0,
  notes: "",
};

// ── API helpers ────────────────────────────────────────────────────────────
async function apiClients<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${STALLION_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

// ── Field component ────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder = "", mono = false, required = false,
  type = "text", hint,
}: {
  label: string; value: string | number; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; required?: boolean;
  type?: string; hint?: string;
}) {
  const empty = required && !value;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em",
        color: empty ? C.critBorder : C.inkLight, textTransform: "uppercase",
      }}>
        {label}{required && <span style={{ color: C.critBorder }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          fontFamily: mono ? "'JetBrains Mono', monospace" : "'Fraunces', serif",
          fontSize: 13, padding: "8px 10px",
          border: `1px solid ${empty ? C.critBorder : C.paperBorder}`,
          borderRadius: 4, background: empty ? C.critical : C.paper,
          color: C.ink, outline: "none",
          boxSizing: "border-box", width: "100%",
        }}
      />
      {hint && <div style={{ fontSize: 11, color: C.inkLight, fontFamily: "'Fraunces', serif", fontStyle: "italic" }}>{hint}</div>}
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: C.inkLight, textTransform: "uppercase" }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          fontFamily: "'Fraunces', serif", fontSize: 13, padding: "8px 10px",
          border: `1px solid ${C.paperBorder}`, borderRadius: 4,
          background: C.paper, color: C.ink, outline: "none",
          resize: "vertical", width: "100%", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

// ── Client drawer / form ───────────────────────────────────────────────────
function ClientDrawer({
  client, onSave, onClose,
}: {
  client: Client | null; // null = new
  onSave: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<Client, "id" | "createdAt">>(
    client ? { ...client } : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);

  const F = (k: keyof typeof form) => (v: string) =>
    setForm(f => ({ ...f, [k]: k === "defaultBrokerageFee" ? parseFloat(v) || 0 : v }));

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error("Client name is required"); return; }
    setSaving(true);
    try {
      if (client?.id) {
        await apiClients(`/clients/${client.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast.success("Client updated");
      } else {
        await apiClients("/clients", { method: "POST", body: JSON.stringify(form) });
        toast.success("Client created");
      }
      onSave();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      display: "flex", justifyContent: "flex-end",
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />
      {/* Panel */}
      <div style={{
        position: "relative", width: 520, height: "100%",
        background: C.paper, display: "flex", flexDirection: "column",
        borderLeft: `1px solid ${C.paperBorder}`, boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: `1px solid ${C.paperBorder}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: C.green,
        }}>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, color: "#fff" }}>
              {client ? "Edit Client" : "New Client"}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#9DC8AC", marginTop: 2 }}>
              CLIENT DIRECTORY
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "#9DC8AC", fontSize: 20, lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Identity */}
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.ghostDim, borderBottom: `1px solid ${C.paperBorder}`, paddingBottom: 6 }}>
            IDENTITY
          </div>
          <Field label="Company Name" value={form.name} onChange={F("name")} placeholder="Basco Food Distributors Ltd" required />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Consignee Code" value={form.consigneeCode} onChange={F("consigneeCode")} placeholder="BASCO001" mono hint="ASYCUDA consignee code" />
            <Field label="TIN / BIR Number" value={form.tin} onChange={F("tin")} placeholder="123456789" mono />
          </div>
          <TextArea label="Address" value={form.address} onChange={F("address")} placeholder={"101 Henry Street\nPort of Spain\nTrinidad"} />

          {/* Contact */}
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.ghostDim, borderBottom: `1px solid ${C.paperBorder}`, paddingBottom: 6, marginTop: 4 }}>
            CONTACT
          </div>
          <Field label="Contact Person" value={form.contactName} onChange={F("contactName")} placeholder="Jane Smith" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Email" value={form.contactEmail} onChange={F("contactEmail")} placeholder="jane@example.com" type="email" />
            <Field label="Phone" value={form.contactPhone} onChange={F("contactPhone")} placeholder="868-xxx-xxxx" />
          </div>

          {/* Brokerage */}
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: C.ghostDim, borderBottom: `1px solid ${C.paperBorder}`, paddingBottom: 6, marginTop: 4 }}>
            BROKERAGE
          </div>
          <Field
            label="Default Brokerage Fee (TTD)"
            value={form.defaultBrokerageFee}
            onChange={F("defaultBrokerageFee")}
            placeholder="750.00"
            type="number"
            hint="Pre-fills the brokerage invoice — can be overridden per declaration"
          />
          <TextArea label="Internal Notes" value={form.notes} onChange={F("notes")} placeholder="Any special handling, permit requirements, or standing instructions…" />
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: `1px solid ${C.paperBorder}`,
          display: "flex", gap: 10, justifyContent: "flex-end", background: C.paperAlt,
        }}>
          <button onClick={onClose} style={{
            padding: "9px 20px", borderRadius: 4, border: `1px solid ${C.paperBorder}`,
            background: "transparent", cursor: "pointer",
            fontFamily: "'Fraunces', serif", fontSize: 13, color: C.inkMid,
          }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{
            padding: "9px 24px", borderRadius: 4, border: "none",
            background: saving ? C.greenMid : C.green, color: "#fff", cursor: saving ? "default" : "pointer",
            fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 600,
          }}>
            {saving ? "Saving…" : client ? "Save Changes" : "Create Client"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Client row ─────────────────────────────────────────────────────────────
function ClientRow({
  client, onEdit, onDelete,
}: {
  client: Client;
  onEdit: (c: Client) => void;
  onDelete: (c: Client) => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
        gap: 16, alignItems: "center",
        padding: "14px 20px",
        background: hov ? C.greenLight : C.paper,
        borderBottom: `1px solid ${C.paperBorder}`,
        transition: "background 0.12s",
      }}
    >
      {/* Name + code */}
      <div>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 14, color: C.ink }}>
          {client.name}
        </div>
        {client.contactName && (
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkLight, marginTop: 2 }}>
            {client.contactName}
          </div>
        )}
      </div>
      {/* Code */}
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: client.consigneeCode ? C.green : C.ghostDim }}>
        {client.consigneeCode || "—"}
      </div>
      {/* TIN */}
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.inkMid }}>
        {client.tin || "—"}
      </div>
      {/* Default fee */}
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.inkMid }}>
        {client.defaultBrokerageFee ? `TT$ ${client.defaultBrokerageFee.toFixed(2)}` : "—"}
      </div>
      {/* Actions */}
      <div style={{ display: "flex", gap: 8, opacity: hov ? 1 : 0, transition: "opacity 0.12s" }}>
        <button
          onClick={() => onEdit(client)}
          style={{ padding: "5px 12px", borderRadius: 3, border: `1px solid ${C.paperBorder}`, background: C.paper, cursor: "pointer", fontFamily: "'Fraunces', serif", fontSize: 12, color: C.inkMid }}
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(client)}
          style={{ padding: "5px 12px", borderRadius: 3, border: `1px solid ${C.critBorder}40`, background: C.critical, cursor: "pointer", fontFamily: "'Fraunces', serif", fontSize: 12, color: C.critBorder }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<{ open: boolean; client: Client | null }>({ open: false, client: null });
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClients<{ items: Client[] }>("/clients");
      setClients(res.items || []);
    } catch (e: any) {
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = clients.filter(c =>
    !search || [c.name, c.consigneeCode, c.tin, c.contactName]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiClients(`/clients/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`${deleteTarget.name} removed`);
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.paperAlt, display: "flex", flexDirection: "column" }}>
      <TopNav />

      {/* Page header */}
      <div style={{ padding: "32px 40px 24px", borderBottom: `1px solid ${C.paperBorder}`, background: C.paper }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: C.inkLight, marginBottom: 6 }}>
          CLIENT DIRECTORY
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 28, color: C.ink, margin: 0 }}>
              Clients
            </h1>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 14, color: C.inkLight, marginTop: 4 }}>
              {clients.length} registered client{clients.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button
            onClick={() => setDrawer({ open: true, client: null })}
            style={{
              padding: "10px 22px", borderRadius: 4, border: "none",
              background: C.green, color: "#fff", cursor: "pointer",
              fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 600,
            }}
          >
            + New Client
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ padding: "16px 40px", background: C.paper, borderBottom: `1px solid ${C.paperBorder}` }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, code, TIN, or contact…"
          style={{
            width: 340, padding: "8px 12px", borderRadius: 4,
            border: `1px solid ${C.paperBorder}`, background: C.paperAlt,
            fontFamily: "'Fraunces', serif", fontSize: 13, color: C.ink, outline: "none",
          }}
        />
      </div>

      {/* Table */}
      <div style={{ flex: 1, margin: "24px 40px" }}>
        {/* Column headers */}
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
          gap: 16, padding: "8px 20px",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em",
          color: C.ghostDim, textTransform: "uppercase",
        }}>
          <span>Client</span>
          <span>Code</span>
          <span>TIN</span>
          <span>Default Fee</span>
          <span style={{ width: 120 }} />
        </div>

        <div style={{ background: C.paper, border: `1px solid ${C.paperBorder}`, borderRadius: 6, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: "center", fontFamily: "'Fraunces', serif", fontStyle: "italic", color: C.inkLight }}>
              Loading clients…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 64, textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 32, color: C.paperMid, marginBottom: 16 }}>⊘</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, color: C.inkMid, marginBottom: 8 }}>
                {search ? "No clients match your search" : "No clients yet"}
              </div>
              {!search && (
                <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 13, color: C.inkLight }}>
                  Add your first client to pre-fill declarations and generate brokerage invoices.
                </div>
              )}
            </div>
          ) : (
            filtered.map(c => (
              <ClientRow
                key={c.id}
                client={c}
                onEdit={cl => setDrawer({ open: true, client: cl })}
                onDelete={setDeleteTarget}
              />
            ))
          )}
        </div>
      </div>

      {/* Drawer */}
      {drawer.open && (
        <ClientDrawer
          client={drawer.client}
          onSave={() => { setDrawer({ open: false, client: null }); load(); }}
          onClose={() => setDrawer({ open: false, client: null })}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div style={{ position: "relative", background: C.paper, borderRadius: 8, padding: 32, width: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17, color: C.ink, marginBottom: 10 }}>
              Remove client?
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: C.inkMid, marginBottom: 24 }}>
              <strong>{deleteTarget.name}</strong> will be removed from the directory. Existing declarations are not affected.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: "8px 18px", borderRadius: 4, border: `1px solid ${C.paperBorder}`, background: "transparent", cursor: "pointer", fontFamily: "'Fraunces', serif", fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={handleDelete} style={{ padding: "8px 18px", borderRadius: 4, border: "none", background: C.critBorder, color: "#fff", cursor: "pointer", fontFamily: "'Fraunces', serif", fontSize: 13 }}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
