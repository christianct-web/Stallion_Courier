import { useNavigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";

const NAV_LINKS = [
  { label: "Dashboard", path: "/" },
  { label: "Sheets",    path: "/stallion/sheets" },
  { label: "Courier",   path: "/stallion/courier" },
  { label: "Clients",   path: "/stallion/clients" },
  { label: "Log",       path: "/stallion/log" },
];

const void_ = "#111318";
const voidBorder = "#2E3748";
const ghost = "#A0AABB";
const ghostDim = "#6B7585";

export function TopNav({ rightSlot }: { rightSlot?: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div style={{
      height: 52,
      background: void_,
      borderBottom: `1px solid ${voidBorder}`,
      display: "flex",
      alignItems: "center",
      padding: "0 28px",
      gap: 4,
      flexShrink: 0,
      position: "sticky",
      top: 0,
      zIndex: 20,
    }}>
      {/* Logo */}
      <button
        aria-label="Stallion home"
        onClick={() => navigate("/")}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          padding: "0 14px 0 0",
          height: 36,
          display: "flex",
          alignItems: "center",
        }}
      >
        <img
          className="stallion-logo-horizontal"
          src="/brand/stallion-horizontal.svg"
          alt="Stallion"
        />
        <img
          className="stallion-logo-mark"
          src="/brand/stallion-mark.svg"
          alt=""
          aria-hidden="true"
        />
      </button>
      <div style={{ width: 1, height: 14, background: voidBorder, marginRight: 8 }} />

      {NAV_LINKS.map(({ label, path }) => {
        const isActive = path === "/"
          ? pathname === "/"
          : pathname.startsWith(path);
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            style={{
              padding: "6px 12px",
              background: isActive ? "#1F2430" : "transparent",
              border: `1px solid ${isActive ? voidBorder : "transparent"}`,
              borderRadius: 3,
              cursor: "pointer",
              fontFamily: "'Fraunces', serif",
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "#fff" : ghost,
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "#1a1f2b"; } }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = ghost; e.currentTarget.style.background = "transparent"; } }}
          >
            {label}
          </button>
        );
      })}

      {rightSlot != null && (
        <div style={{ marginLeft: "auto" }}>
          {rightSlot}
        </div>
      )}
    </div>
  );
}
