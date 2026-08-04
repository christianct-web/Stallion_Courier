/**
 * StallionShell.tsx — shared app layout.
 *
 * Renders TopNav once and an <Outlet/> for the page below. Used as a layout
 * route in App.tsx so every child page gets the nav automatically — no page
 * can ship without it again. Pages rendered inside the shell should NOT render
 * their own <TopNav/>.
 */
import { Outlet } from "react-router-dom";
import { TopNav } from "@/components/TopNav";
import { C } from "@/brand/stallion";

export default function StallionShell() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: C.canvas }}>
      {/* First tab stop: lets keyboard users jump the module nav straight into
          the declaration they are working on. */}
      <a href="#main" className="skip-link">Skip to content</a>
      <TopNav />
      <main id="main" style={{ flex: 1, minHeight: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
