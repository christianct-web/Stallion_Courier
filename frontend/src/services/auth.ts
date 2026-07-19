export type StallionRole = "clerk" | "broker" | "admin";

export interface StallionUser {
  username: string;
  name: string;
  role: StallionRole;
}

export interface StallionSession {
  access_token: string;
  expires_in: number;
  user: StallionUser;
}

const STORAGE_KEY = "stallion.session.v1";

const envBaseUrl = (import.meta.env.VITE_STALLION_API_URL as string | undefined)?.replace(/\/$/, "");
const isNetlifyHost = window.location.hostname.endsWith(".netlify.app");
export const AUTH_BASE_URL =
  envBaseUrl || (isNetlifyHost ? "/api" : window.location.protocol + "//" + window.location.hostname + ":8022");

export function getSession(): StallionSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StallionSession) : null;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function getAccessToken(): string {
  return getSession()?.access_token || "";
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export async function login(username: string, password: string): Promise<StallionSession> {
  const response = await fetch(AUTH_BASE_URL + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error("The username or password is incorrect.");
  }
  const session = (await response.json()) as StallionSession;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function verifySession(): Promise<StallionUser> {
  const token = getAccessToken();
  if (!token) throw new Error("No active session");
  const response = await fetch(AUTH_BASE_URL + "/auth/me", {
    headers: { Authorization: "Bearer " + token },
  });
  if (!response.ok) {
    clearSession();
    throw new Error("Session expired");
  }
  const body = (await response.json()) as { user: StallionUser };
  return body.user;
}
