import { describe, expect, it, vi } from "vitest";
import { authenticationReturnPath, authenticationUrl, createReauthenticationController, safeReturnPath } from "./reauthentication";

const origin = "https://projects.pydemia.ai";
const original = "/?project=p&view=tasks&item=i&taskLayout=board&q=%ED%95%A0%20%EC%9D%BC#body";
function fixture(mode: "password" | "microsoft" = "microsoft", checkpointTimeout = 50) {
    const values = new Map<string, string>();
    const navigate = vi.fn();
    const canNavigate = vi.fn(() => true);
    let now = 100_000;
    const environment = {
        location: () => ({href: origin + original, origin}), navigate, canNavigate, checkpointTimeout,
        now: () => now,
        storage: () => ({getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); }}),
    };
    const controller = createReauthenticationController(environment);
    controller.configure({mode, userId: "owner"});
    return {controller, navigate, canNavigate, values, environment, advance: () => { now += 60_001; }};
}

describe("authentication return destinations", () => {
    it("preserves project, item, query encodings and hash through both login mechanisms", () => {
        expect(safeReturnPath(origin + original, origin)).toBe(original);
        expect(new URL(authenticationUrl("microsoft", original, origin), origin).searchParams.get("rd")).toBe(original);
        const password = new URL(authenticationUrl("password", original, origin), origin);
        expect(password.searchParams.get("view")).toBe("login");
        expect(authenticationReturnPath({href: password.href, origin})).toBe(original);
    });
    it.each(["/?view=tasks&q=https://example.invalid/synthetic", "/?view=tasks&q=/../", "/?view=tasks#body//child"])("envelopes proxy-rejected delimiters while restoring the exact destination %s", original => {
        const url = new URL(authenticationUrl("microsoft", original, origin), origin);
        const redirect = url.searchParams.get("rd")!;
        expect(redirect).not.toMatch(/[/\\](?:[\s\v]*|\.{1,2})[/\\]/);
        expect(authenticationReturnPath({href: origin + redirect, origin})).toBe(original);
    });
    it.each([
        "https://evil.example/path", "//evil.example/path", "/\\evil.example", "/%2f%2fevil.example",
        "/%252f%252fevil.example", "/%5c%5cevil.example", "/%0d%0aLocation:evil", "/%250aevil",
        "/%", "/oauth2/callback?code=secret", "/%6fauth2/start", "/api/session", "/assets/chunk.js", "/health",
        "/?view=login&returnTo=%2F", "javascript:alert(1)", "https://name@projects.pydemia.ai/path", "/\nevil",
    ])("rejects unsafe or recursive destination %s", value => {
        expect(safeReturnPath(value, origin)).toBe("/");
    });
});

describe("reauthentication controller", () => {
    it("waits for drafts before a single OAuth redirect under concurrent 401s", async () => {
        const {controller, navigate} = fixture();
        let release: (ready: boolean) => void = () => undefined;
        controller.register(() => new Promise<boolean>(resolve => { release = resolve; }));
        controller.required(); controller.required();
        const pending = controller.run();
        await Promise.resolve();
        await controller.run();
        expect(controller.snapshot().phase).toBe("preparing");
        expect(navigate).not.toHaveBeenCalled();
        release(true); await pending;
        expect(navigate).toHaveBeenCalledOnce();
        expect(new URL(navigate.mock.calls[0]![0] as string, origin).searchParams.get("rd")).toBe(original);
        expect(controller.snapshot().phase).toBe("redirecting");
    });
    it("sends local sessions to the password screen with the original destination", async () => {
        const {controller, navigate} = fixture("password");
        controller.required(); await controller.run();
        const target = new URL(navigate.mock.calls[0]![0] as string, origin);
        expect(target.searchParams.get("view")).toBe("login");
        expect(target.searchParams.get("returnTo")).toBe(original);
    });
    it.each(["false", "throw", "timeout"])("keeps the editor when a checkpoint fails: %s", async failure => {
        const {controller, navigate} = fixture("microsoft", 5);
        controller.register(() => {
            if (failure === "throw") throw new Error("quota");
            if (failure === "timeout") return new Promise<boolean>(() => undefined);
            return false;
        });
        controller.required(); await controller.run();
        expect(controller.snapshot()).toEqual({phase: "blocked", reason: "draft"});
        expect(navigate).not.toHaveBeenCalled();
    });
    it("keeps drafts if another unsaved form prevents navigation, then permits explicit retry", async () => {
        const {controller, canNavigate, navigate} = fixture();
        canNavigate.mockReturnValueOnce(false);
        controller.required(); await controller.run();
        expect(controller.snapshot().phase).toBe("blocked");
        expect(navigate).not.toHaveBeenCalled();
        controller.retry(); await controller.run();
        expect(navigate).toHaveBeenCalledOnce();
    });
    it("retains the 60 second loop guard across successful bootstrap, then allows retry", async () => {
        const {controller, navigate} = fixture();
        controller.required(); await controller.run();
        controller.configure({mode: "microsoft", userId: "owner"});
        controller.required(); await controller.run();
        expect(controller.snapshot()).toEqual({phase: "blocked", reason: "loop"});
        expect(navigate).toHaveBeenCalledOnce();
        controller.retry(); await controller.run();
        expect(navigate).toHaveBeenCalledTimes(2);
    });
    it("expires the loop guard and never uses a different account's attempt", async () => {
        const {controller, navigate, advance} = fixture();
        controller.required(); await controller.run();
        advance(); controller.configure({mode: "microsoft", userId: "owner"});
        controller.required(); await controller.run();
        controller.configure({mode: "microsoft", userId: "another-owner"});
        controller.required(); await controller.run();
        expect(navigate).toHaveBeenCalledTimes(3);
    });
    it("ignores initial unauthenticated bootstrap and cancels recovery after logout", async () => {
        const {controller, navigate} = fixture();
        controller.configure(null); controller.required(); await controller.run();
        expect(controller.snapshot().phase).toBe("idle");
        expect(navigate).not.toHaveBeenCalled();
    });
    it("does not redirect a stale asynchronous checkpoint after an account change", async () => {
        const {controller, navigate} = fixture();
        let release: () => void = () => undefined;
        controller.register(() => new Promise<void>(resolve => { release = resolve; }));
        controller.required(); const pending = controller.run();
        await Promise.resolve();
        controller.configure(null); release(); await pending;
        expect(navigate).not.toHaveBeenCalled();
    });
});
