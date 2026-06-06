import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { useIsMobile } from "@/hooks/use-mobile";
import { C } from "@/components/courier/tokens";
import { ClipboardList, Home, Search, type LucideIcon } from "lucide-react";

type NavItem = {
  label: string;
  path: string;
  match: (pathname: string) => boolean;
  icon: LucideIcon;
};

const stroke = (active: boolean) => (active ? "#fff" : C.ghostDim);

const NAV: NavItem[] = [
  {
    label: "Home",
    path: "/stallion/courier",
    match: (p) => p === "/stallion/courier",
    icon: Home,
  },
  {
    label: "Manifests",
    path: "/stallion/courier",
    match: (p) => p.startsWith("/stallion/courier/") && !p.endsWith("/tariff"),
    icon: ClipboardList,
  },
  {
    label: "Tariff",
    path: "/stallion/courier/tariff",
    match: (p) => p === "/stallion/courier/tariff",
    icon: Search,
  },
];

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

const BOTTOM_NAV_H = 60;

export default function CourierShell() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { canInstall, promptInstall } = useInstallPrompt();

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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: C.paper,
      }}
    >
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

      <main
        style={{
          flex: 1,
          minHeight: 0,
          paddingBottom: `calc(${BOTTOM_NAV_H + 8}px + env(safe-area-inset-bottom))`,
        }}
      >
        <Outlet />
      </main>

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
          const Icon = item.icon;
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
              <Icon size={22} color={stroke(active)} strokeWidth={2} />
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
