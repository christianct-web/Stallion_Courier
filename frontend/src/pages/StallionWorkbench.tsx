import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { TopNav } from "@/components/TopNav";
import { HelpBox, HelpTip, HelpHeading } from "@/components/HelpBox";
import {
  calculateWorksheet,
  createTemplate,
  generatePack,
  getLookup,
  getTemplates,
  upsertDeclaration,
  STALLION_BASE_URL,
} from "@/services/stallionApi";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";

import { WorkbenchHeader }     from "@/components/workbench/WorkbenchHeader";
import { WorkbenchParties }    from "@/components/workbench/WorkbenchParties";
import { WorkbenchItems }      from "@/components/workbench/WorkbenchItems";
import { WorkbenchContainers } from "@/components/workbench/WorkbenchContainers";
import { WorkbenchWorksheet }  from "@/components/workbench/WorkbenchWorksheet";
import { WorkbenchActions, bucketFromPath } from "@/components/workbench/WorkbenchActions";

import "@/styles/workbench.css";

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Stable declaration ID for this workbench session.
// Persisted so Save Draft + Generate Pack always reference the same record.
function useStableId() {
  const ref = useRef<string>(uid());
  return ref.current;
}

function buildHeader(form: any) {
  return {
    declarationRef:          form.declarationRef,
    port:                    form.port,
    term:                    form.term,
    modeOfTransport:         form.modeOfTransport,
    customsRegime:           form.customsRegime,
    consignorName:           form.consignorName,
    consignorAddress:        form.consignorAddress,
    consignorStreet:         form.consignorStreet,
    consignorCity:           form.consignorCity,
    consignorCountry:        form.consignorCountry,
    consigneeCode:           form.consigneeCode,
    consigneeName:           form.consigneeName,
    consigneeAddress:        form.consigneeAddress,
    declarantTIN:            form.declarantTIN,
    declarantName:           form.declarantName,
    vesselName:              form.vesselName,
    blAwbNumber:             form.blAwbNumber,
    blAwbDate:               form.blAwbDate,
    etaDate:                 form.etaDate,
    rotationNumber:          form.rotationNumber || "",
    invoiceNumber:           form.invoiceNumber,
    invoiceDate:             form.invoiceDate,
    currency:                form.currency,
    bankCode:                form.bankCode,
    modeOfPayment:           form.modeOfPayment,
    termsCode:               form.termsCode,
    termsDescription:        form.termsDescription,
    countryFirstDestination: form.countryFirstDestination,
    tradingCountry:          form.tradingCountry,
    exportCountryCode:       form.exportCountryCode,
    exportCountryName:       form.exportCountryName,
    countryOfOriginName:     form.countryOfOriginName,
  };
}

function buildWorksheet(form: any) {
  return {
    invoice_value_foreign: form.invoice_value_foreign,
    inland_foreign:        form.inland_foreign   || 0,
    uplift_pct:            form.uplift_pct        || 0,
    exchange_rate:         form.exchange_rate,
    freight_foreign:       form.freight_foreign,
    insurance_foreign:     form.insurance_foreign,
    other_foreign:         form.other_foreign,
    deduction_foreign:     form.deduction_foreign,
    duty_rate_pct:         form.duty_rate_pct,
    surcharge_rate_pct:    form.surcharge_rate_pct,
    vat_rate_pct:          form.vat_rate_pct,
    extra_fees_local:      form.extra_fees_local,
    ces_fee_1:             form.ces_fee_1         || 0,
    ces_fee_2:             form.ces_fee_2         || 0,
    global_fee:            form.global_fee,
  };
}

// ─── Design tokens (matches paper/ink system) ───────────────────────────────
const CL = {
  paper: "#F6F3EE", paperAlt: "#EFECE6", paperBorder: "#E2DDD6",
  ink: "#18150F", inkMid: "#3D3830", inkLight: "#6B6560",
  approved: "#1A5E3A", correction: "#963A10",
};

// ─── Completion checklist sidebar ────────────────────────────────────────────
function ChecklistSidebar({ form, items, calc }: { form: any; items: any[]; calc: any }) {
  const fi = items[0] ?? {};

  const sections = [
    {
      id: "section-header", label: "Header",
      fields: [
        { label: "Declaration Ref",  ok: !!form.declarationRef },
        { label: "Port of Entry",    ok: !!form.port },
        { label: "Customs Regime",   ok: !!form.customsRegime },
        { label: "Delivery Terms",   ok: !!form.term },
        { label: "Invoice Number",   ok: !!form.invoiceNumber },
        { label: "Invoice Date",     ok: !!form.invoiceDate },
      ],
    },
    {
      id: "section-parties", label: "Parties",
      fields: [
        { label: "Consignee Name",   ok: !!form.consigneeName },
        { label: "Consignee Code",   ok: !!form.consigneeCode },
        { label: "Consignor Name",   ok: !!form.consignorName },
        { label: "Declarant TIN",    ok: !!form.declarantTIN },
      ],
    },
    {
      id: "section-header", label: "Transport",
      fields: [
        { label: "Vessel / Flight",  ok: !!form.vesselName },
        { label: "AWB / B/L No.",    ok: !!form.blAwbNumber },
        { label: "Shipped-on-Board", ok: !!form.blAwbDate },
        { label: "ETA Date",         ok: !!form.etaDate },
      ],
    },
    {
      id: "section-items", label: "Items",
      fields: [
        { label: "HS Code",          ok: !!fi.hsCode },
        { label: "Description",      ok: !!fi.description },
        { label: "Quantity",         ok: (fi.qty ?? 0) > 0 },
        { label: "Item Value",       ok: (fi.itemValue ?? 0) > 0 },
      ],
    },
    {
      id: "section-worksheet", label: "Worksheet",
      fields: [
        { label: "Invoice Value",    ok: (form.invoice_value_foreign ?? 0) > 0 },
        { label: "Exchange Rate",    ok: (form.exchange_rate ?? 0) > 0 },
        { label: "Calculation run",  ok: !!calc },
      ],
    },
  ];

  const allFields  = sections.flatMap(s => s.fields);
  const doneCount  = allFields.filter(f => f.ok).length;
  const totalCount = allFields.length;
  const allDone    = doneCount === totalCount;
  const pct        = Math.round((doneCount / totalCount) * 100);

  const jump = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div style={{
      border: `1px solid ${CL.paperBorder}`, borderRadius: 3,
      overflow: "hidden", fontFamily: "'Fraunces', serif",
      background: CL.paper,
    }}>
      {/* Progress header */}
      <div style={{
        padding: "12px 14px",
        background: allDone ? CL.approved : CL.paperAlt,
        borderBottom: `1px solid ${allDone ? CL.approved + "44" : CL.paperBorder}`,
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          letterSpacing: "0.12em", color: allDone ? "#ffffffaa" : CL.inkLight,
          marginBottom: 8,
        }}>
          COMPLETION CHECK
        </div>
        {/* Bar */}
        <div style={{ height: 3, background: allDone ? "#ffffff33" : CL.paperBorder, borderRadius: 2, marginBottom: 8 }}>
          <div style={{
            height: "100%", borderRadius: 2, transition: "width 0.35s",
            width: `${pct}%`,
            background: allDone ? "#fff" : CL.approved,
          }} />
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
          fontWeight: 700, color: allDone ? "#fff" : CL.inkMid,
        }}>
          {allDone
            ? "✓ Ready for review"
            : `${doneCount} / ${totalCount} fields`}
        </div>
      </div>

      {/* Section rows */}
      <div style={{ padding: "6px 0 10px" }}>
        {sections.map((sec, si) => {
          const secDone     = sec.fields.filter(f => f.ok).length;
          const secComplete = secDone === sec.fields.length;
          return (
            <div key={`${sec.label}-${si}`} style={{ marginBottom: 2 }}>
              {/* Section label */}
              <button
                onClick={() => jump(sec.id)}
                style={{
                  width: "100%", padding: "5px 14px", border: "none",
                  background: "transparent", cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = CL.paperAlt)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  letterSpacing: "0.12em", fontWeight: 700,
                  color: secComplete ? CL.approved : CL.inkMid,
                }}>
                  {sec.label.toUpperCase()}
                </span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  color: secComplete ? CL.approved : CL.inkLight,
                }}>
                  {secDone}/{sec.fields.length}
                </span>
              </button>
              {/* Field rows */}
              {sec.fields.map(field => (
                <button
                  key={field.label}
                  onClick={() => jump(sec.id)}
                  style={{
                    width: "100%", padding: "2px 14px 2px 24px",
                    border: "none", background: "transparent", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 7,
                    textAlign: "left",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = CL.paperAlt)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{
                    fontSize: 8, flexShrink: 0, lineHeight: 1,
                    color: field.ok ? CL.approved : CL.correction,
                  }}>
                    {field.ok ? "●" : "○"}
                  </span>
                  <span style={{
                    fontFamily: "'Fraunces', serif", fontSize: 11,
                    color: field.ok ? CL.inkLight : CL.inkMid,
                    textDecoration: field.ok ? "line-through" : "none",
                    opacity: field.ok ? 0.6 : 1,
                  }}>
                    {field.label}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StallionWorkbench() {
  // ── stable declaration ID for this session ──────────────────────────────
  const declarationId = useStableId();

  // ── lookups ──────────────────────────────────────────────────────────────
  const [ports,          setPorts]          = useState<Array<{ code: string; label: string }>>([]);
  const [terms,          setTerms]          = useState<Array<{ code: string; label: string }>>([]);
  const [packages,       setPackages]       = useState<Array<{ code: string; label: string }>>([]);
  const [transportModes, setTransportModes] = useState<Array<{ code: string; label: string }>>([]);
  const [customsRegimes, setCustomsRegimes] = useState<Array<{ regimeCode: string; asycudaSubCode?: string; asycudaCode?: string; label: string }>>([]);
  const [unitCodes,      setUnitCodes]      = useState<Array<{ code: string; asycudaCode?: string; label: string }>>([]);
  const [dutyTaxCodes,   setDutyTaxCodes]   = useState<Array<{ code: string; abbr?: string; label: string }>>([]);
  const [dutyTaxBases,   setDutyTaxBases]   = useState<Array<{ code: string; label: string }>>([]);
  const [cpcCodes,       setCpcCodes]       = useState<Array<{ code: string; cpc?: string; label: string }>>([]);
  const [box23Types,     setBox23Types]     = useState<Array<{ type: string; label: string; amount: number; auto: boolean }>>([]);
  const [hsTariffSamples, setHsTariffSamples] = useState<Array<{ description: string; tariff: string; taxes?: Array<{ code: string; rate: number }> }>>([]);

  // ── templates ─────────────────────────────────────────────────────────────
  const [templates,          setTemplates]          = useState<Array<{ id: string; name: string; payload: any }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // ── form state ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    declarationRef: "",
    port: "",
    term: "",
    modeOfTransport: "",
    customsRegime: "",
    consignorName: "",
    consignorAddress: "",
    consignorStreet: "",
    consignorCity: "",
    consignorCountry: "",
    consigneeCode: "",
    consigneeName: "",
    consigneeAddress: "",
    declarantTIN: "",
    declarantName: "",
    vesselName: "",
    blAwbNumber: "",
    blAwbDate: "",
    etaDate: "",
    invoiceNumber: "",
    invoiceDate: "",
    currency: "USD",
    bankCode: "01",
    modeOfPayment: "CASH",
    termsCode: "99",
    termsDescription: "Basic",
    countryFirstDestination: "US",
    tradingCountry: "US",
    exportCountryCode: "US",
    exportCountryName: "United States",
    countryOfOriginName: "United States",
    invoice_value_foreign: 0,
    exchange_rate: 6.77,
    freight_foreign: 0,
    insurance_foreign: 0,
    other_foreign: 0,
    deduction_foreign: 0,
    duty_rate_pct: 40,
    surcharge_rate_pct: 15,
    vat_rate_pct: 0,
    extra_fees_local: 40,
    global_fee: 40,
  });

  const [items, setItems] = useState([
    {
      id: uid(),
      description: "", hsCode: "", qty: 1,
      packageType: "", grossKg: 0, netKg: 0, itemValue: 0,
      dutyTaxCode: "", dutyTaxBase: "", cpc: "", unitCode: "",
    },
  ]);

  const [containers, setContainers] = useState<Array<{
    id: string; containerNo: string; type: string;
    packageType: string; packages: number; goodsWeight: number;
  }>>([]);

  const [calc,          setCalc]          = useState<any>(null);
  const [selectedBox23, setSelectedBox23] = useState<string[]>([]);
  const [packResult,    setPackResult]    = useState<any>(null);
  const [preflight,     setPreflight]     = useState<any>(null);
  const [generating,    setGenerating]    = useState(false);
  const [savingDraft,   setSavingDraft]   = useState(false);
  const [cooldown,      setCooldown]      = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── cooldown cleanup ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  // ── bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [p, t, pk, tr, cr, uc, dt, db, cpc, b23, hs] = await Promise.all([
          getLookup("ports"),         getLookup("terms"),
          getLookup("packages"),      getLookup("transport_modes"),
          getLookup("customs_regimes"), getLookup("unit_codes"),
          getLookup("duty_tax_codes"), getLookup("duty_tax_bases"),
          getLookup("cpc_codes"),     getLookup("box23_types"),
          getLookup("hs_tariff_samples"),
        ]);
        setPorts(p.items);
        setTerms(t.items);
        setPackages(pk.items);
        setTransportModes(tr.items as any);
        setCustomsRegimes(cr.items as any);
        setUnitCodes(uc.items as any);
        setDutyTaxCodes(dt.items as any);
        setDutyTaxBases(db.items as any);
        setCpcCodes(cpc.items as any);
        setBox23Types(b23.items as any);
        setHsTariffSamples(hs.items as any);
        setSelectedBox23((b23.items as any[]).filter(x => x.auto).map(x => x.type));
      } catch {
        toast.error("Failed to load lookups");
      }
    })();
  }, []);

  useEffect(() => {
    getTemplates().then(r => setTemplates(r as any)).catch(() => {});
  }, []);

  useEffect(() => {
    const dutyCodes = items.map(i => i.dutyTaxCode).filter(Boolean);
    setForm(f => ({ ...f, extra_fees_local: dutyCodes.length * 40 }));
  }, [items]);

  // ── template load ──────────────────────────────────────────────────────────
  const handleLoadTemplate = (id: string) => {
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    setForm(f => ({ ...f, ...(tpl.payload || {}) }));
    toast.success(`Template "${tpl.name}" loaded`);
  };

  // ── worksheet calculate ────────────────────────────────────────────────────
  const handleCalculate = async () => {
    try {
      const r = await calculateWorksheet({
        invoice_value_foreign: Number(form.invoice_value_foreign),
        inland_foreign:        Number(form.inland_foreign   || 0),
        uplift_pct:            Number(form.uplift_pct        || 0),
        exchange_rate:         Number(form.exchange_rate),
        freight_foreign:       Number(form.freight_foreign),
        insurance_foreign:     Number(form.insurance_foreign),
        other_foreign:         Number(form.other_foreign),
        deduction_foreign:     Number(form.deduction_foreign),
        duty_rate_pct:         Number(form.duty_rate_pct),
        surcharge_rate_pct:    Number(form.surcharge_rate_pct),
        vat_rate_pct:          Number(form.vat_rate_pct),
        extra_fees_local:      Number(form.extra_fees_local),
        ces_fee_1:             Number(form.ces_fee_1  || 0),
        ces_fee_2:             Number(form.ces_fee_2  || 0),
      });
      setCalc(r);
      if ((r as any).preflight) setPreflight((r as any).preflight);
      toast.success("Worksheet calculated");
    } catch (err: any) {
      toast.error(err?.message ?? "Calculation failed");
    }
  };

  // ── save draft ─────────────────────────────────────────────────────────────
  // FIX: uses stable declarationId and persists to backend JSON store.
  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const header    = buildHeader(form);
      const worksheet = buildWorksheet(form);

      await upsertDeclaration({
        id:         declarationId,
        status:     "draft",
        updated_at: new Date().toISOString(),
        source:     { type: "WORKBENCH", filename: "manual-entry" },
        confidence: 100,
        header,
        worksheet,
        items,
        containers,
        review_notes: "",
      });

      toast.success("Draft saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSavingDraft(false);
    }
  };

  // ── generate pack ──────────────────────────────────────────────────────────
  // FIX: upserts first (status=pending_review) then passes declaration_id
  // to /pack/generate so export events are logged against the correct record.
  const handleGenerate = async () => {
    if (!calc) {
      toast.error("Run worksheet calculation first.");
      return;
    }
    setGenerating(true);
    try {
      const header    = buildHeader(form);
      const worksheet = buildWorksheet(form);

      // Upsert as pending_review before generating so broker queue sees it
      await upsertDeclaration({
        id:         declarationId,
        status:     "pending_review",
        updated_at: new Date().toISOString(),
        source:     { type: "WORKBENCH", filename: "manual-entry" },
        confidence: 100,
        header,
        worksheet,
        items,
        containers,
        review_notes: "",
      });

      const result = await generatePack({
        declaration_id: declarationId,
        header,
        worksheet: {
          ...worksheet,
          ...(calc ?? {}),
        },
        items,
        containers,
      });

      setPackResult(result);
      if (result.preflight) setPreflight(result.preflight);

      if (result.status === "blocked") {
        toast.error("Pack blocked — fix required fields");
      } else {
        toast.success("Pack generated — declaration queued for broker review");
        // Start 5-second cooldown
        setCooldown(5);
        cooldownRef.current = setInterval(() => {
          setCooldown(c => {
            if (c <= 1) {
              if (cooldownRef.current) clearInterval(cooldownRef.current);
              return 0;
            }
            return c - 1;
          });
        }, 1000);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Pack generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // ── live field completeness (no preflight needed) ─────────────────────────
  const liveComplete = useMemo(() => ({
    Header:    !!(form.declarationRef && form.port && form.customsRegime &&
                  form.invoiceNumber && form.vesselName && form.blAwbNumber && form.etaDate),
    Parties:   !!(form.consigneeName && form.consigneeCode && form.consignorName && form.declarantTIN),
    Items:     items.every(i => i.hsCode && i.description && i.qty > 0 && i.itemValue > 0),
    Worksheet: !!(Number(form.invoice_value_foreign) > 0 && Number(form.exchange_rate) > 0 && calc),
  }), [form, items, calc]);

  // ── section issue counts ───────────────────────────────────────────────────
  const sectionIssueCounts = useMemo(() => {
    const counts = {
      Header:     { e: 0, w: 0 },
      Parties:    { e: 0, w: 0 },
      Items:      { e: 0, w: 0 },
      Containers: { e: 0, w: 0 },
      Worksheet:  { e: 0, w: 0 },
    } as Record<string, { e: number; w: number }>;

    if (!preflight) return counts;
    preflight.errors?.forEach((err: any) => {
      const b = bucketFromPath(err.path);
      if (counts[b]) counts[b].e++;
    });
    preflight.warnings?.forEach((w: any) => {
      const b = bucketFromPath(w.path);
      if (counts[b]) counts[b].w++;
    });
    return counts;
  }, [preflight]);

  return (
    <TooltipProvider>
      <div className="wb-page" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <TopNav rightSlot={
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {preflight && (
              <span style={{
                fontFamily: "var(--wb-font-mono)", fontSize: 11, letterSpacing: "0.06em",
                color: preflight.status === "pass" ? "var(--wb-approved)" : "var(--wb-crit-border)",
              }}>
                {preflight.status === "pass"
                  ? `✓ ${preflight.counts.warnings}W`
                  : `✗ ${preflight.counts.errors}E · ${preflight.counts.warnings}W`}
              </span>
            )}
            <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 11, color: "var(--wb-ghost-dim)", letterSpacing: "0.06em" }}>
              {declarationId.slice(0, 8).toUpperCase()}
            </span>
          </div>
        } />

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 16px 0" }}>
          <HelpBox title="Workbench: manual declaration entry">
            <p style={{ margin: "0 0 10px" }}>
              Use the Workbench to create or edit declarations manually. Fill in the five tabs in order —
              then click Generate Pack to produce the C82 XML and LB01 worksheet.
            </p>
            <HelpHeading>THE FIVE TABS</HelpHeading>
            <div style={{ display: "grid", gap: 5 }}>
              {[
                ["Header", "Declaration reference, port of entry, customs regime (usually IM4), terms of delivery (CIF/FOB/EXW)."],
                ["Parties", "Consignee (the TT importer — name, address, TIN) and consignor (the overseas exporter)."],
                ["Transport", "Vessel or flight name, AWB/BL number, shipped-on-board date, ETA."],
                ["Worksheet", "Invoice value, exchange rate, freight, insurance. Stallion calculates duty, VAT, and surcharge automatically. Click LOOKUP CBTT to fetch the official exchange rate by date."],
                ["Items", "One row per HS code line. Enter the HS code, description, country of origin, quantity, weight, and value."],
              ].map(([tab, desc]) => (
                <div key={tab} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#1A5E3A", minWidth: 90, flexShrink: 0 }}>{tab}</span>
                  <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "#6B6560" }}>{desc}</span>
                </div>
              ))}
            </div>
            <HelpHeading>KEY FIELDS</HelpHeading>
            <div style={{ display: "grid", gap: 5 }}>
              {[
                ["HS Code", "Format: 9021.29.00.00 (dots included). Must be at least 6 digits. Determines the duty rate."],
                ["Exchange Rate", "Click LOOKUP CBTT to auto-fetch the Central Bank TT rate for the shipped-on-board date."],
                ["Customs Regime", "IM4 is the standard import code for commercial shipments into Trinidad."],
                ["CPC", "Customs Procedure Code — usually 4000 for standard import. Leave as default unless advised otherwise."],
              ].map(([field, desc]) => (
                <div key={field} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#96700A", minWidth: 120, flexShrink: 0 }}>{field}</span>
                  <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", color: "#6B6560" }}>{desc}</span>
                </div>
              ))}
            </div>
            <HelpTip>Save Draft at any time — the declaration is stored in the backend and will appear in the broker review queue when you're ready.</HelpTip>
          </HelpBox>
        </div>

        {/* Two-column: form left, sticky checklist right */}
        <div style={{
          flex: 1, maxWidth: 1160, margin: "0 auto", width: "100%",
          padding: "24px 16px 0",
          display: "flex", gap: 24, alignItems: "flex-start",
        }}>
          {/* Main form */}
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 120 }}>
            <WorkbenchHeader
              form={form} setForm={setForm}
              ports={ports} terms={terms}
              transportModes={transportModes} customsRegimes={customsRegimes}
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              setSelectedTemplateId={setSelectedTemplateId}
              onLoadTemplate={handleLoadTemplate}
              sectionErrors={sectionIssueCounts.Header.e}
              sectionWarnings={sectionIssueCounts.Header.w}
              sectionComplete={liveComplete.Header}
            />
            <WorkbenchParties
              form={form} setForm={setForm}
              sectionErrors={sectionIssueCounts.Parties.e}
              sectionWarnings={sectionIssueCounts.Parties.w}
              sectionComplete={liveComplete.Parties}
            />
            <WorkbenchItems
              items={items} setItems={setItems}
              packages={packages} unitCodes={unitCodes}
              dutyTaxCodes={dutyTaxCodes} dutyTaxBases={dutyTaxBases}
              cpcCodes={cpcCodes} hsTariffSamples={hsTariffSamples}
              sectionErrors={sectionIssueCounts.Items.e}
              sectionWarnings={sectionIssueCounts.Items.w}
              onHsRatesApplied={(rates) => {
                setForm(f => ({
                  ...f,
                  duty_rate_pct:      rates.dutyPct,
                  surcharge_rate_pct: rates.surchargePct,
                  vat_rate_pct:       rates.vatPct,
                }));
                toast.success(`Rates applied: ${rates.dutyRate} · ${rates.vatPct}% VAT`);
              }}
            />
            <WorkbenchContainers
              containers={containers} setContainers={setContainers}
              packages={packages}
              sectionErrors={sectionIssueCounts.Containers.e}
              sectionWarnings={sectionIssueCounts.Containers.w}
            />
            <WorkbenchWorksheet
              form={form} setForm={setForm}
              calc={calc} onCalculate={handleCalculate}
              box23Types={box23Types}
              selectedBox23={selectedBox23} setSelectedBox23={setSelectedBox23}
              shippedOnBoardDate={form.blAwbDate}
              sectionErrors={sectionIssueCounts.Worksheet.e}
              sectionWarnings={sectionIssueCounts.Worksheet.w}
            />
            <WorkbenchActions
              preflight={preflight} packResult={packResult}
              onGenerate={handleGenerate} onSaveDraft={handleSaveDraft}
              generating={generating} savingDraft={savingDraft}
              calc={calc}
              cooldownSeconds={cooldown}
              getFormPayload={() => ({
                header:    buildHeader(form),
                worksheet: buildWorksheet(form),
                items,
              })}
            />
          </div>

          {/* Sticky completion checklist */}
          <div style={{
            width: 220, flexShrink: 0,
            position: "sticky", top: 72,
            maxHeight: "calc(100vh - 88px)", overflowY: "auto",
          }}>
            <ChecklistSidebar form={form} items={items} calc={calc} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
