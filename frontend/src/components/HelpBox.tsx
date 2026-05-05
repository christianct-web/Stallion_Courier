import { useState, ReactNode } from "react";

const C = {
  paperBorder: "#E2DDD6", paperAlt: "#EFECE6", inkLight: "#6B6560",
  inkMid: "#3D3830", ink: "#18150F", warnBorder: "#D4A020",
  voidBorder: "#2E3748", ghostDim: "#6B7585", ghost: "#A0AABB",
};

type HelpBoxProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  dark?: boolean;   // true = dark void theme (for dark-background pages like BrokerReview)
  variant?: "info" | "warn";
};

export function HelpBox({ title, children, defaultOpen = false, dark = false, variant = "info" }: HelpBoxProps) {
  const [open, setOpen] = useState(defaultOpen);

  const borderColor = variant === "warn" ? C.warnBorder + "55" : (dark ? C.voidBorder : C.paperBorder);
  const bg          = variant === "warn" ? "#FEF9EC" : (dark ? "#161d28" : C.paperAlt);
  const titleColor  = dark ? C.ghost : C.inkMid;
  const bodyBg      = variant === "warn" ? "#FEFCF5" : (dark ? "#111823" : "#FDFAF5");
  const iconColor   = variant === "warn" ? "#96700A" : (dark ? C.ghostDim : C.inkLight);

  return (
    <div style={{
      border: `1px solid ${borderColor}`, borderRadius: 3,
      overflow: "hidden", marginBottom: 16,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "10px 16px",
          background: bg, border: "none",
          cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: iconColor }}>
          {variant === "warn" ? "⚠" : "?"}</span>
        <span style={{
          fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 13,
          color: titleColor, flex: 1,
        }}>
          {title}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: iconColor, transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(180deg)" : "none" }}>
          ▾
        </span>
      </button>

      {open && (
        <div style={{
          padding: "14px 16px", background: bodyBg,
          borderTop: `1px solid ${borderColor}`,
          fontFamily: "'Fraunces', serif", fontSize: 13,
          color: dark ? C.ghost : C.inkMid, lineHeight: 1.65,
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Convenience: a styled tip/note line within HelpBox content
export function HelpTip({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid #E2DDD644" }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#96700A", flexShrink: 0 }}>→</span>
      <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 12, color: "#6B6560" }}>{children}</span>
    </div>
  );
}

// Styled sub-heading within HelpBox content
export function HelpHeading({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
      letterSpacing: "0.12em", color: "#96700A", marginTop: 12, marginBottom: 4,
    }}>
      {children}
    </div>
  );
}
