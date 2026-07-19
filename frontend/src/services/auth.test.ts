import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, getAccessToken, login, verifySession } from "./auth";

const session = {
  access_token: "signed-session-token",
  expires_in: 28800,
  user: { username: "crystal", name: "Crystal Williams", role: "admin" as const },
};

describe("session authentication client", () => {
  beforeEach(() => {
    clearSession();
    vi.restoreAllMocks();
  });

  it("stores a successful login in session storage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => session,
    }));

    const result = await login("crystal", "secret");

    expect(result.user.name).toBe("Crystal Williams");
    expect(getAccessToken()).toBe("signed-session-token");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("removes an expired session", async () => {
    sessionStorage.setItem("stallion.session.v1", JSON.stringify(session));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(verifySession()).rejects.toThrow("Session expired");
    expect(getAccessToken()).toBe("");
  });
});
