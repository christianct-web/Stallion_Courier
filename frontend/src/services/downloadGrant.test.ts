import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDownloadUrl } from "./stallionApi";

describe("scoped download grants", () => {
  beforeEach(() => {
    sessionStorage.setItem("stallion.session.v1", JSON.stringify({
      access_token: "full-session-token",
      expires_in: 28800,
      user: { username: "broker", name: "Test Broker", role: "broker" },
    }));
    vi.restoreAllMocks();
  });

  it("places only the scoped grant in the download URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ download_grant: "path-scoped-90-second-grant" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = await createDownloadUrl("/api/pack/file/document-1");
    const parsed = new URL(url);

    expect(parsed.searchParams.get("download_grant")).toBe("path-scoped-90-second-grant");
    expect(parsed.searchParams.has("access_token")).toBe(false);

    const request = fetchMock.mock.calls[0];
    expect(request[0]).toContain("/auth/download-grant");
    expect(JSON.parse(request[1].body)).toEqual({ path: "/pack/file/document-1" });
    expect(request[1].headers.Authorization).toBe("Bearer full-session-token");
  });
});
