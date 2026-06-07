/**
 * ExportSheet.tsx - mobile bottom sheet for exporting courier outputs.
 *
 * Offers Worksheet XLSX (always) and Hazmat XLSX (only after officer
 * examination) with two actions each:
 *   - Download - saves the file via a temporary object URL.
 *   - Share    - uses the Web Share API (navigator.share with files) where
 *                available, so the broker can send the XLSX straight to
 *                WhatsApp / email / Drive from the phone. Falls back to
 *                Download when file-sharing isn't supported.
 *
 * The XLSX bytes come from the same backend endpoints the desktop links use
 * (worksheetDownloadUrl / hazmatDownloadUrl) - no new API surface. Nothing is
 * cached; each tap fetches fresh, so no manifest/PII lands in storage.
 *
 * Desktop keeps its existing inline download links; this sheet is mobile-only.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { C } from "./tokens";
import {
  CourierManifest,
  worksheetDownloadUrl,
  hazmatDownloadUrl,
} from "@/services/courierApi";

type Props = {
  manifest: CourierManifest;
  onClose: () => void;
  /** Opens the full Hazmat form dialog (broker fills package counts etc.). */
  onOpenHazmatForm?: () => void;
};

const canShareFiles = (() => {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      typeof navigator.share === "function"
    );
  } catch {
    return false;
  }
})();

async function fetchBlob(url: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="?([^";]+)"?/i);
  const filename = m ? m[1] : "export.xlsx";
  return { blob, filename };
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function ExportSheet({ manifest, onClose, onOpenHazmatForm }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const examined = !!manifest.officer_examination;

  const doDownload = async (kind: "worksheet" | "hazmat") => {
    setBusy(`${kind}:dl`);
    try {
      const url =
        kind === "worksheet"
          ? worksheetDownloadUrl(manifest.id)
          : hazmatDownloadUrl(manifest.id);
      const { blob, filename } = await fetchBlob(url);
      saveBlob(blob, filename);
      toast.success("Downloaded");
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const doShare = async (kind: "worksheet" | "hazmat") => {
    setBusy(`${kind}:share`);
    try {
      const url =
        kind === "worksheet"
          ? worksheetDownloadUrl(manifest.id)
          : hazmatDownloadUrl(manifest.id);
      const { blob, filename } = await fetchBlob(url);
      const file = new File([blob], filename, { type: blob.type });
      if (canShareFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: `${manifest.manifest_no} - ${kind === "worksheet" ? "worksheet" : "hazmat report"}`,
        });
      } else {
        // Sharing files unsupported - fall back to a plain download.
        saveBlob(blob, filename);
        toast.message("Sharing not supported - file downloaded instead");
      }
    } catch (e: any) {
      // AbortError = user dismissed the share sheet; not an error worth toasting.
      if (e?.name !== "AbortError") toast.error(e.message || "Share failed");
    } finally {
      setBusy(null);
    }
  };

  const rowBtn = (label: string, onClick: () => void, primary?: boolean, disabled?: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled || busy != null}
      style={{
        flex: 1,
        padding: "11px 10px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontWeight: 600,
        borderRadius: 5,
        cursor: disabled || busy != null ? "default" : "pointer",
        background: primary ? C.amber : "transparent",
        color: primary ? "#fff" : C.inkMid,
        border: `1px solid ${primary ? C.amber : C.paperBorder}`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: C.paper,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          boxShadow: "0 -12px 40px rgba(0,0,0,0.25)",
          padding: 16,
          paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
        }}
      >
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: C.paperBorder,
            margin: "0 auto 16px",
          }}
        />

        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: C.inkLight,
            marginBottom: 2,
          }}
        >
          Export / {manifest.manifest_no}
        </div>

        {/* Worksheet */}
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 15,
              color: C.ink,
              marginBottom: 8,
            }}
          >
            {examined ? "Uplifted Worksheet" : "Worksheet"} XLSX
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {rowBtn(
              busy === "worksheet:dl" ? "..." : "Download",
              () => doDownload("worksheet"),
              true,
            )}
            {rowBtn(
              busy === "worksheet:share" ? "..." : "Share",
              () => doShare("worksheet"),
            )}
          </div>
        </div>

        {/* Hazmat - only meaningful after examination */}
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 15,
              color: examined ? C.ink : C.inkLight,
              marginBottom: 8,
            }}
          >
            Hazmat Report XLSX
          </div>
          {examined ? (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {rowBtn(
                  busy === "hazmat:dl" ? "..." : "Download",
                  () => doDownload("hazmat"),
                  true,
                )}
                {rowBtn(
                  busy === "hazmat:share" ? "..." : "Share",
                  () => doShare("hazmat"),
                )}
              </div>
              {onOpenHazmatForm && (
                <button
                  onClick={() => {
                    onOpenHazmatForm();
                    onClose();
                  }}
                  style={{
                    width: "100%",
                    padding: "10px",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    background: "transparent",
                    color: C.amber,
                    border: `1px dashed ${C.amber}66`,
                    borderRadius: 5,
                    cursor: "pointer",
                  }}
                >
                  Fill package counts first
                </button>
              )}
            </>
          ) : (
            <div
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 12.5,
                fontStyle: "italic",
                color: C.inkLight,
                lineHeight: 1.4,
              }}
            >
              Available after officer examination - the hazmat report
              summarises additional taxes assessed at exam.
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 20,
            padding: "11px",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: "transparent",
            color: C.inkLight,
            border: `1px solid ${C.paperBorder}`,
            borderRadius: 5,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}
