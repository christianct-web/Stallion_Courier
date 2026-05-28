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

export default function StallionShell() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <TopNav />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
