import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  StallionSession,
  StallionUser,
  clearSession,
  getSession,
  login,
  verifySession,
} from "@/services/auth";

function LoginScreen({ onLogin }: { onLogin: (session: StallionSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await login(username, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{
      minHeight: "100vh", display: "grid", placeItems: "center", padding: 24,
      background: "radial-gradient(circle at 20% 0%, #243a36 0, #111b19 38%, #080d0c 100%)",
      color: "#f5f1e8", fontFamily: "Inter, system-ui, sans-serif",
    }}>
      <form onSubmit={submit} style={{
        width: "100%", maxWidth: 390, border: "1px solid rgba(255,255,255,.14)",
        borderRadius: 18, padding: 30, background: "rgba(18,29,27,.88)",
        boxShadow: "0 28px 80px rgba(0,0,0,.38)", backdropFilter: "blur(18px)",
      }}>
        <div style={{ color: "#d6a84f", fontSize: 12, fontWeight: 800, letterSpacing: ".18em" }}>
          MANA LABS 8
        </div>
        <h1 style={{ margin: "10px 0 8px", fontSize: 30, letterSpacing: "-.04em" }}>Stallion Courier</h1>
        <p style={{ margin: "0 0 26px", color: "#aab7b3", lineHeight: 1.5 }}>
          Sign in to your secure courier workspace.
        </p>
        <label style={{ display: "grid", gap: 7, marginBottom: 16, fontSize: 13, color: "#c9d2cf" }}>
          Username
          <input
            autoComplete="username" autoFocus value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={{
              border: "1px solid #3c4b47", borderRadius: 9, padding: "12px 13px",
              background: "#0d1513", color: "#fff", fontSize: 15, outline: "none",
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 7, marginBottom: 10, fontSize: 13, color: "#c9d2cf" }}>
          Password
          <input
            type="password" autoComplete="current-password" value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{
              border: "1px solid #3c4b47", borderRadius: 9, padding: "12px 13px",
              background: "#0d1513", color: "#fff", fontSize: 15, outline: "none",
            }}
          />
        </label>
        {error && <div role="alert" style={{ color: "#ffb4a9", fontSize: 13, margin: "12px 0" }}>{error}</div>}
        <button
          type="submit" disabled={busy || !username || !password}
          style={{
            width: "100%", marginTop: 12, padding: "13px 16px", border: 0,
            borderRadius: 9, background: "#d6a84f", color: "#111713",
            fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? .7 : 1,
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [initialSession] = useState(() => getSession());
  const [user, setUser] = useState<StallionUser | null>(initialSession?.user || null);
  const [checking, setChecking] = useState(Boolean(initialSession));

  useEffect(() => {
    if (!initialSession) return;
    verifySession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, [initialSession]);

  if (checking) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Checking session…</div>;
  }
  if (!user) {
    return <LoginScreen onLogin={(session) => setUser(session.user)} />;
  }

  const logout = () => {
    clearSession();
    window.location.reload();
  };

  return (
    <>
      {children}
      <div style={{
        position: "fixed", right: 14, bottom: 14, zIndex: 1000, display: "flex",
        alignItems: "center", gap: 9, padding: "7px 8px 7px 11px",
        border: "1px solid rgba(0,0,0,.12)", borderRadius: 999,
        background: "rgba(255,255,255,.94)", boxShadow: "0 8px 28px rgba(0,0,0,.14)",
        font: "12px Inter, system-ui, sans-serif", color: "#303734",
      }}>
        <span>{user.name} · {user.role}</span>
        <button onClick={logout} style={{
          border: 0, borderRadius: 999, padding: "6px 9px", cursor: "pointer",
          background: "#18211f", color: "#fff", fontSize: 11,
        }}>Sign out</button>
      </div>
    </>
  );
}
