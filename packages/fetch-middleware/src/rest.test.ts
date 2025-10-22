import { describe, expect, it, vi } from "vitest";
import { createFetchClient } from "./rest";

describe("rest client", () => {
  it("get adds query", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const rest = createFetchClient({ baseUrl: "https://api", fetcher });
    const resPromise = rest.get<{ ok: boolean }>("/ping", {
      query: { page: 1 },
    });
    expect(resPromise.cancel).toBeTypeOf("function");
    const res = await resPromise;
    expect(res.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api/ping?page=1",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
