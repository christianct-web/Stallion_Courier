import { useState } from "react";
import { STALLION_BASE_URL, generateCostingFromWorksheet } from "@/services/stallionApi";

interface PreflightResult {
  status: "pass" | "fail";
  errors: { path: string; message: string }[];
  warnings: { path: string; message: string }[];
  counts: { errors: number; warnings: number };
}

interface WorkbenchActionsProps {
  preflight: PreflightResult | null;
  packResult: any;
  onGenerate: () => Promise<void>;
  onSaveDraft?: () => Promise<void>;
  generating: boolean;
  savingDraft?: boolean;
  calc: any;
  cooldownSeconds?: number;
  // Costing document
  getFormPayload?: () => { header: any; worksheet: any; items: any[] };
}

export function bucketFromPath(
  path: string
): "Header" | "Parties" | "Items" | "Containers" | "Worksheet" | "Other" {
  const partyFields = [
    "consignorName", "consignorAddress", "consignorStreet", "consignorCity",
    "consignorCountry", "consigneeCode", "consigneeName", "consigneeAddress",
    "declarantTIN", "declarantName",
  ];
  if (partyFields.some(f => path.includes(f))) return "Parties";
  if (path.startsWith("items"))      return "Items";
  if (path.startsWith("containers")) return "Containers";
  if (
    path.includes("invoice_value") || path.includes("exchange_rate") ||
    path.includes("freight")       || path.includes("insurance") ||
    path.includes("duty_rate")     || path.includes("vat_rate") ||
    path.includes("surcharge")     || path.includes("extra_fees") ||
    path.includes("global_fee")    || path.includes("deduction")
  ) return "Worksheet";
  return "Header";
}

export function sectionIdFromBucket(bucket: string): string | null {
  if (bucket === "Header")     return "section-header";
  if (bucket === "Parties")    return "section-parties";
  if (bucket === "Items")      return "section-items";
  if (bucket === "Containers") return "section-containers";
  if (bucket === "Worksheet")  return "section-worksheet";
  return null;
}

export function jumpToSection(bucket: string) {
  const id = sectionIdFromBucket(bucket);
  if (!id) return;
  const section = document.getElementById(id);
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => {
    const el = section?.querySelector(
      'input, textarea, [role="combobox"], select, button[role="combobox"]'
    ) as HTMLElement | null;
    el?.focus();
  }, 220);
}

function PreflightChecklist({ preflight }: { preflight: PreflightResult }) {
  const errorGroups = preflight.errors.reduce((acc, e) => {
    const key = bucketFromPath(e.path);
    acc[key] = acc[key] || [];
    acc[key].push(e);
    return acc;
  }, {} as Record<string, Array<{ path: string; message: string }>>);

  const warnGroups = preflight.warnings.reduce((acc, w) => {
    const key = bucketFromPath(w.path);
    acc[key] = acc[key] || [];
    acc[key].push(w);
    return acc;
  }, {} as Record<string, Array<{ path: string; message: string }>>);

  return (
    <div style={{ marginBottom: 14 }}>
      {preflight.errors.length > 0 && (
        <div className="wb-preflight-error">
          <div className="wb-preflight-title">
            FIX BEFORE GENERATE · {preflight.counts.errors} ERROR{preflight.counts.errors !== 1 ? "S" : ""}
          </div>
          {Object.entries(errorGroups).map(([section, rows]) => (
            <div key={section} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 11, fontWeight: 700 }}>
                  {section}
                </span>
                {sectionIdFromBucket(section) && (
                  <button className="wb-jump-link" onClick={() => jumpToSection(section)}>
                    Jump to section
                  </button>
                )}
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
                {rows.map((r, i) => (
                  <li key={`${section}-${r.path}-${i}`} style={{ marginBottom: 2 }}>
                    <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 11 }}>{r.path}</span>
                    {" — "}{r.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {preflight.warnings.length > 0 && (
        <div className="wb-preflight-warn">
          <div className="wb-preflight-title">
            WARNINGS · {preflight.counts.warnings}
          </div>
          {Object.entries(warnGroups).map(([section, rows]) => (
            <div key={section} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 11, fontWeight: 700 }}>
                  {section}
                </span>
                {sectionIdFromBucket(section) && (
                  <button className="wb-jump-link" onClick={() => jumpToSection(section)}>
                    Jump to section
                  </button>
                )}
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
                {rows.map((r, i) => (
                  <li key={`${section}-${r.path}-${i}`} style={{ marginBottom: 2 }}>
                    <span style={{ fontFamily: "var(--wb-font-mono)", fontSize: 11 }}>{r.path}</span>
                    {" — "}{r.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {preflight.status === "pass" && (
        <div style={{
          padding: "10px 14px", marginBottom: 10,
          borderRadius: "var(--wb-radius)",
          border: "1px solid var(--wb-approved)",
          background: "#F0FAF4",
          fontFamily: "var(--wb-font-mono)", fontSize: 11,
          letterSpacing: "0.08em", color: "var(--wb-approved)",
        }}>
          ✓ PREFLIGHT PASS · {preflight.counts.warnings > 0
            ? `${preflight.counts.warnings} warning${preflight.counts.warnings !== 1 ? "s" : ""}, no errors`
            : "No issues found"}
        </div>
      )}
    </div>
  );
}

function PackResult({ packResult }: { packResult: any }) {
  if (!packResult) return null;

  const docs = (packResult.documents || []) as Array<{ name: string; url?: string; ref?: string }>;
  const links = docs.filter(d => d.url);

  return (
    <div className="wb-pack-result" style={{ marginTop: 14 }}>
      <div className="wb-pack-result-title">
        ✓ PACK GENERATED
      </div>
      <div style={{ marginBottom: 10, fontFamily: "var(--wb-font-serif)", fontSize: 13, color: "var(--wb-ink-mid)" }}>
        Declaration package ready for ASYCUDA submission.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {links.map(d => (
          <a
            key={d.name}
            href={`${STALLION_BASE_URL}${d.url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="wb-download-link"
          >
            {d.name}
          </a>
        ))}
      </div>
      {packResult.preflight && (
        <div style={{ marginTop: 10 }}>
          <PreflightChecklist preflight={packResult.preflight} />
        </div>
      )}
    </div>
  );
}

export function WorkbenchActions({
  preflight, packResult, onGenerate, onSaveDraft,
  generating, savingDraft, calc, cooldownSeconds = 0,
  getFormPayload,
}: WorkbenchActionsProps) {

  const hasErrors = (preflight?.counts.errors ?? 0) > 0;
  const cooldownActive = cooldownSeconds > 0;
  const [costingLoading, setCostingLoading] = useState(false);
  const [costingDocId, setCostingDocId]     = useState<string | null>(null);

  const handleCosting = async () => {
    if (!getFormPayload || !calc) return;
    setCostingLoading(true);
    try {
      const { header, worksheet, items } = getFormPayload();
      const res = await generateCostingFromWorksheet({ header, worksheet, items });
      setCostingDocId(res.doc_id);
    } catch (e: any) {
      alert(e.message || "Costing generation failed");
    } finally {
      setCostingLoading(false);
    }
  };

  return (
    <div className="wb-card" style={{ position: "sticky", bottom: 0, zIndex: 10 }}
      id="section-actions">
      <div className="wb-card-header">
        <span className="wb-card-title">Generate · Validate · Export</span>
      </div>

      <div style={{ padding: "14px 16px" }}>
        {preflight && <PreflightChecklist preflight={preflight} />}

        {!calc && (
          <div style={{
            padding: "8px 12px", marginBottom: 10,
            background: "var(--wb-warn)", border: "1px solid var(--wb-warn-border)",
            borderRadius: "var(--wb-radius)",
            fontFamily: "var(--wb-font-serif)", fontStyle: "italic",
            fontSize: 12, color: "var(--wb-warn-text)",
          }}>
            Run worksheet calculation first — values needed for XML generation.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {onSaveDraft && (
            <button
              className="wb-btn wb-btn-secondary"
              onClick={onSaveDraft}
              disabled={savingDraft}
            >
              {savingDraft ? "Saving…" : "Save Draft"}
            </button>
          )}

          <button
            className="wb-btn wb-btn-primary"
            onClick={onGenerate}
            disabled={generating || hasErrors || !calc || cooldownActive}
            title={
              hasErrors
                ? `Fix ${preflight?.counts.errors} error${preflight?.counts.errors !== 1 ? "s" : ""} first`
                : !calc
                  ? "Run worksheet calculation first"
                  : cooldownActive
                    ? `Please wait ${cooldownSeconds}s before generating again`
                    : ""
            }
            style={{
              background: hasErrors || !calc || cooldownActive ? "var(--wb-paper-mid)" : "var(--wb-ink)",
              color: hasErrors || !calc || cooldownActive ? "var(--wb-ink-light)" : "var(--wb-paper)",
              cursor: hasErrors || !calc || cooldownActive ? "not-allowed" : "pointer",
            }}
          >
            {generating ? "Generating…" : cooldownActive ? `Wait ${cooldownSeconds}s` : "⚡ Generate Pack"}
          </button>

          {/* ── Costing / Estimate button ── */}
          {getFormPayload && (
            <button
              className="wb-btn wb-btn-secondary"
              onClick={handleCosting}
              disabled={costingLoading || !calc}
              title={!calc ? "Run worksheet calculation first" : "Generate a shareable cost estimate PDF for your client"}
              style={{
                opacity: !calc ? 0.45 : 1,
                cursor: !calc ? "not-allowed" : "pointer",
              }}
            >
              {costingLoading ? "Generating…" : "📄 Costing Estimate"}
            </button>
          )}

          {costingDocId && (
            <a
              href={`${STALLION_BASE_URL}/pack/file/${costingDocId}`}
              target="_blank"
              rel="noreferrer"
              className="wb-download-link"
              style={{ fontFamily: "var(--wb-font-mono)", fontSize: 11 }}
            >
              ↓ Download Costing PDF
            </a>
          )}

          {packResult && (
            <span style={{
              fontFamily: "var(--wb-font-mono)", fontSize: 11,
              color: "var(--wb-approved)", letterSpacing: "0.06em",
            }}>
              ✓ Last pack generated
            </span>
          )}
        </div>

        <PackResult packResult={packResult} />
      </div>
    </div>
  );
}
