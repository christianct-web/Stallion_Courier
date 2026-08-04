/**
 * TopNav.tsx — the Stallion chrome.
 *
 * Warm near-black bar carrying the horse mark and the module destinations.
 * Colours come from @/brand/stallion; this component previously carried its own
 * cool blue-grey copies (#111318 / #6B7585), which both drifted from the brand
 * and failed contrast — the inactive link colour measured 3.99:1.
 */
import { useNavigate, useLocation } from "react-router-dom";
import { ReactNode, CSSProperties } from "react";
import { C, SERIF, MONO, RADIUS } from "@/brand/stallion";

const NAV_LINKS = [
  { label: "Dashboard", path: "/" },
  { label: "Sheets",    path: "/stallion/sheets" },
  { label: "Courier",   path: "/stallion/courier" },
  { label: "Clients",   path: "/stallion/clients" },
  { label: "Log",       path: "/stallion/log" },
];

export function TopNav({ rightSlot }: { rightSlot?: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Stallion modules"
      style={{
        height: 52,
        background: C.void,
        borderBottom: `1px solid ${C.voidBorder}`,
        display: "flex",
        alignItems: "center",
        padding: "0 28px",
        gap: 4,
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
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
      <div style={{ width: 1, height: 14, background: C.voidBorder, marginRight: 8 }} />

      {NAV_LINKS.map(({ label, path }) => {
        const isActive = path === "/"
          ? pathname === "/"
          : pathname.startsWith(path);
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            /* Communicates the current module to screen readers — the colour
               and weight shift alone carried no semantics. */
            aria-current={isActive ? "page" : undefined}
            style={{
              padding: "8px 12px",
              minHeight: 34,
              background: isActive ? C.voidSurface : "transparent",
              border: `1px solid ${isActive ? C.voidBorder : "transparent"}`,
              /* The active module also gets an accent underline, so the current
                 location survives greyscale and colour-blind viewing rather
                 than resting on a subtle background shift alone. */
              borderBottom: `2px solid ${isActive ? C.amberOnDark : "transparent"}`,
              borderRadius: RADIUS.sm,
              cursor: "pointer",
              fontFamily: SERIF,
              fontSize: 14,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "#fff" : C.ghost,
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.color = "#fff";
                e.currentTarget.style.background = C.voidMid;
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.color = C.ghost;
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            {label}
          </button>
        );
      })}

      {rightSlot != null && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {rightSlot}
        </div>
      )}
    </nav>
  );
}

/**
 * Shared style for the chrome's right-hand action button (e.g. "Install app").
 * Uses the deep accent so the white label clears 4.5:1 — the brand hex reaches
 * only 4.49:1 under white text.
 */
export const chromeActionStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "8px 14px",
  borderRadius: RADIUS.sm,
  cursor: "pointer",
  background: C.amberDeep,
  color: "#fff",
  border: "none",
};
