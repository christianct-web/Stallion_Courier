/**
 * AuthGate.tsx — session gate, login screen, and the signed-in session chip.
 *
 * The login screen is the first thing every user sees, and it used to be in a
 * different brand entirely: a pine-green/black radial gradient, brass CTA,
 * Inter geometric sans, 18px radii and glassmorphism blur — the retired Gallop
 * palette, with no horse mark, no Fraunces and no burnt orange anywhere. It now
 * uses the Stallion chrome: warm near-black canvas, squared editorial card,
 * serif display, mono labels, one burnt-orange CTA.
 */
import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  StallionSession,
  StallionUser,
  clearSession,
  getSession,
  login,
  verifySession,
} from "@/services/auth";
import { C, SERIF, MONO, RADIUS } from "@/brand/stallion";

const fieldStyle: React.CSSProperties = {
  border: `1px solid ${C.voidBorder}`,
  borderRadius: RADIUS.sm,
  padding: "12px 13px",
  background: C.voidMid,
  color: "#fff",
  fontFamily: MONO,
  fontSize: 14,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 7,
  marginBottom: 16,
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: C.ghostDim,
};

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

  const disabled = busy || !username || !password;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: C.void,
        color: C.ghost,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 400,
          border: `1px solid ${C.voidBorder}`,
          borderRadius: RADIUS.md,
          padding: 32,
          background: C.voidMid,
        }}
      >
        <img
          src="/brand/stallion-horizontal.svg"
          alt="Stallion"
          style={{ width: 148, height: "auto", display: "block", marginBottom: 22 }}
        />

        <div
          style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase",
            color: C.amberOnDark,
          }}
        >
          Courier Module
        </div>
        <h1
          style={{
            margin: "8px 0 8px", fontFamily: SERIF, fontSize: 30,
            fontWeight: 700, letterSpacing: "-0.02em", color: "#fff",
          }}
        >
          Sign in
        </h1>
        <p
          style={{
            margin: "0 0 26px", fontFamily: MONO, fontSize: 12,
            lineHeight: 1.5, color: C.ghostDim,
          }}
        >
          Customs declaration and courier workspace.
        </p>

        <label style={labelStyle}>
          Username
          <input
            autoComplete="username" autoFocus value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={fieldStyle}
          />
        </label>
        <label style={{ ...labelStyle, marginBottom: 10 }}>
          Password
          <input
            type="password" autoComplete="current-password" value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={fieldStyle}
          />
        </label>

        {error && (
          <div
            role="alert"
            style={{
              fontFamily: MONO, fontSize: 12, margin: "12px 0",
              padding: "8px 10px", borderRadius: RADIUS.sm,
              color: "#F0B9B4",
              background: "rgba(176,32,32,0.18)",
              border: "1px solid rgba(176,32,32,0.45)",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit" disabled={disabled}
          style={{
            width: "100%", marginTop: 12, padding: "13px 16px", border: 0,
            borderRadius: RADIUS.sm,
            background: disabled ? C.voidSurface : C.amber,
            color: disabled ? C.ghostDim : "#fff",
            fontFamily: MONO, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.1em", textTransform: "uppercase",
            cursor: busy ? "wait" : disabled ? "not-allowed" : "pointer",
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
    return (
      <div
        style={{
          minHeight: "100vh", display: "grid", placeItems: "center",
          background: C.void, color: C.ghostDim,
          fontFamily: MONO, fontSize: 12,
          letterSpacing: "0.12em", textTransform: "uppercase",
        }}
      >
        Checking session…
      </div>
    );
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
      {/*
        Sits above the courier module's fixed bottom nav rather than on top of
        it — at 390px the chip used to cover the third tab outright. The offset
        also clears the iOS home bar.
      */}
      <div
        style={{
          position: "fixed", right: 14, zIndex: 1000, display: "flex",
          alignItems: "center", gap: 9, padding: "6px 6px 6px 12px",
          border: `1px solid ${C.paperMid}`, borderRadius: RADIUS.sm,
          background: C.paper,
          boxShadow: "0 4px 16px rgba(20,16,14,0.16)",
          fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.inkMid,
        }}
        className="stallion-session-chip"
      >
        <span>{user.name} · {user.role}</span>
        <button
          onClick={logout}
          style={{
            border: 0, borderRadius: RADIUS.sm, padding: "6px 10px", cursor: "pointer",
            background: C.void, color: "#fff",
            fontFamily: MONO, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}
        >
          Sign out
        </button>
      </div>
    </>
  );
}
