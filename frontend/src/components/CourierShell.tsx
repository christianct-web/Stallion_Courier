/**
 * CourierShell.tsx - courier-scoped app layout.
 *
 * Gives the Stallion Courier routes a standalone, installable feel:
 *   - Mobile  -> slim top bar (Stallion mark + title) + fixed bottom nav.
 *   - Desktop -> the existing shared <TopNav/> (unchanged Stallion chrome).
 *
 * Used as a layout route in App.tsx wrapping the /stallion/courier/* pages.
 * Pages rendered inside this shell must NOT render their own TopNav.
 *
 * Note: client names are never named in installed/visible copy.
 * The product label here is "Non-Trade Express Worksheets".
 */
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { useIsMobile } from "@/hooks/use-mobile";
import { C } from "@/components/courier/tokens";

/* Bottom-nav destinations */

type NavItem = {
  label: string;
  path: string;
  match: (pathname: string) => boolean;
  icon: (active: boolean) => JSX.Element;
};

const stroke = (active: boolean) => (active ? "#fff" : C.ghostDim);

const NAV: NavItem[] = [
  {
    label: "Home",
    path: "/stallion/courier",
    match: (p) => p === "/stallion/courier",
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" />
      </svg>
    ),
  },
  {
    label: "Manifests",
    path: "/stallion/courier",
    match: (p) => p.startsWith("/stallion/courier/") && !p.endsWith("/tariff"),
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    label: "Tariff",
    path: "/stallion/courier/tariff",
    match: (p) => p === "/stallion/courier/tariff",
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke(a)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
    ),
  },
];

/* Install affordance (beforeinstallprompt) */

function useInstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Already running standalone? Treat as installed.
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  };

  return { canInstall: !!deferred && !installed, promptInstall };
}

/* Shell */

const BOTTOM_NAV_H = 60;

export default function CourierShell() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { canInstall, promptInstall } = useInstallPrompt();

  /* Desktop / tablet: keep the established Stallion chrome untouched. */
  if (!isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <TopNav
          rightSlot={
            canInstall ? (
              <button
                onClick={promptInstall}
                style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  padding: "6px 12px", borderRadius: 3, cursor: "pointer",
                  background: C.amber, color: "#fff", border: "none",
                }}
              >
                Install app
              </button>
            ) : undefined
          }
        />
        <div style={{ flex: 1, minHeight: 0 }}>
          <Outlet />
        </div>
      </div>
    );
  }

  /* Mobile: standalone-feeling shell with slim top bar + bottom nav. */
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: C.paper,
      }}
    >
      {/* Slim top bar */}
      <header
        style={{
          height: 48,
          background: C.void,
          borderBottom: `1px solid ${C.voidBorder}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 14px",
          position: "sticky",
          top: 0,
          zIndex: 20,
          flexShrink: 0,
        }}
      >
        <img
          src="/brand/stallion-mark.svg"
          alt="Stallion"
          style={{ height: 22, width: "auto" }}
        />
        <span
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 15,
            fontWeight: 600,
            color: "#fff",
            letterSpacing: "0.01em",
          }}
        >
          Stallion Courier
        </span>
        {canInstall && (
          <button
            onClick={promptInstall}
            style={{
              marginLeft: "auto",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.06em", textTransform: "uppercase",
              padding: "5px 10px", borderRadius: 3, cursor: "pointer",
              background: C.amber, color: "#fff", border: "none",
            }}
          >
            Install
          </button>
        )}
      </header>

      {/* Page body - pad the bottom so content clears the fixed nav. */}
      <main
        style={{
          flex: 1,
          minHeight: 0,
          // iOS safe-area inset for the home bar.
          paddingBottom: `calc(${BOTTOM_NAV_H + 8}px + env(safe-area-inset-bottom))`,
        }}
      >
        <Outlet />
      </main>

      {/* Fixed bottom nav */}
      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: BOTTOM_NAV_H,
          paddingBottom: "env(safe-area-inset-bottom)",
          background: C.void,
          borderTop: `1px solid ${C.voidBorder}`,
          display: "flex",
          alignItems: "stretch",
          zIndex: 30,
        }}
      >
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "6px 0",
              }}
            >
              {item.icon(active)}
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9.5,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: active ? "#fff" : C.ghostDim,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
