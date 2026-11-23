import { describe, expect, it, vi } from "vitest";
import { api, ApiError, downloadArchive, request, setCsrf } from "./api";
import { itemSchema, runSchema } from "./models";
import { idea, candidateRun } from "./fixtures.test-data";

describe("API I/O", () => {
    it("sends the session cookie and current CSRF for a mutation", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(idea), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        setCsrf("csrf-for-this-session");
        await api.saveItem(idea.id, { expected_revision: 1, body: "내 수정" });
        const [, options] = fetchMock.mock.calls[0] ?? [];
        expect(options.credentials).toBe("same-origin");
        expect(options.headers["X-CSRF-Token"]).toBe("csrf-for-this-session");
        expect(JSON.parse(options.body)).toEqual({ expected_revision: 1, body: "내 수정" });
    });
    it("keeps a 409 distinct from a successful save", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "기준 revision이 달라졌습니다." }), { status: 409 })));
        const failure = await api.saveItem(idea.id, {}).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(ApiError);
        expect(failure).toMatchObject({ status: 409, message: "기준 revision이 달라졌습니다." });
    });
    it("rejects malformed success data instead of displaying a fake empty result", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...idea, revision: "one" }), { status: 200 })));
        await expect(request("/api/items/test", itemSchema)).rejects.toThrow("응답 형식");
    });
    it("retains additional reference metadata but validates generated results", () => {
        const valid = runSchema.parse({ ...candidateRun, reference_manifest: { selected_template: { inspected: false } } });
        expect(valid.reference_manifest.selected_template).toEqual({ inspected: false });
        expect(runSchema.safeParse({ ...candidateRun, result: { ...candidateRun.result, source_ids: ["made-up-id"] } }).success).toBe(false);
    });
    it("signals expired session and ZIP requests once each without retrying failed writes", async () => {
        const unauthorized = vi.fn();
        window.addEventListener("projects:unauthorized", unauthorized);
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("expired", {status: 401})));
        vi.stubGlobal("fetch", fetchMock);
        try {
            await expect(api.saveItem(idea.id, {expected_revision: 1})).rejects.toMatchObject({status: 401});
            await expect(downloadArchive("/api/projects/p/export", "p.zip")).rejects.toMatchObject({status: 401});
            expect(unauthorized).toHaveBeenCalledTimes(2);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally { window.removeEventListener("projects:unauthorized", unauthorized); }
    });
    it("keeps bad credentials, forbidden requests and network failures out of session recovery", async () => {
        const unauthorized = vi.fn();
        window.addEventListener("projects:unauthorized", unauthorized);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response("bad password", {status: 401}))
            .mockResolvedValueOnce(new Response("bad registration", {status: 401}))
            .mockResolvedValueOnce(new Response("forbidden", {status: 403}))
            .mockRejectedValueOnce(new TypeError("network"));
        vi.stubGlobal("fetch", fetchMock);
        try {
            await expect(api.auth("login", {})).rejects.toMatchObject({status: 401});
            await expect(api.auth("register", {})).rejects.toMatchObject({status: 401});
            await expect(api.saveItem(idea.id, {})).rejects.toMatchObject({status: 403});
            await expect(api.items("p")).rejects.toMatchObject({status: 0});
            expect(unauthorized).not.toHaveBeenCalled();
        } finally { window.removeEventListener("projects:unauthorized", unauthorized); }
    });
});
