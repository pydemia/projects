import { describe, expect, it, vi } from "vitest";
import { api, ApiError, request, setCsrf } from "./api";
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
});
