import { CSSProperties, ReactNode, useState } from "react";
import { openAuthenticatedDownload } from "@/services/stallionApi";

export function SecureDownloadLink({
  href,
  children,
  style,
}: {
  href: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await openAuthenticatedDownload(href);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      style={{
        border: "none",
        cursor: busy ? "wait" : "pointer",
        ...style,
        opacity: busy ? 0.65 : style?.opacity,
      }}
    >
      {busy ? "Authorizing…" : children}
    </button>
  );
}
