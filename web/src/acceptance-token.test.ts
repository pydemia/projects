import { beforeEach, expect, it, vi } from "vitest";
import { checkpointAcceptancePath, clearAcceptanceToken, restoreAcceptanceToken } from "./acceptance-token";
import { authenticationUrl } from "./reauthentication";

beforeEach(() => {sessionStorage.clear(); vi.restoreAllMocks();});
const path = "/?view=project-invitation&invitationId=invite&expectedRevision=4";
it("keeps acceptance tokens out of authentication queries and restores only the matching route", () => {
    const login = authenticationUrl("microsoft", `${path}#invitationToken=one-use-token`, window.location.origin);
    expect(decodeURIComponent(login)).not.toContain("one-use-token");
    expect(sessionStorage.getItem("projects:pending-acceptance")).toContain("one-use-token");
    window.history.replaceState(null, "", path.replace("invite&", "different&"));
    restoreAcceptanceToken();
    expect(window.location.hash).toBe("");
    window.history.replaceState(null, "", path);
    restoreAcceptanceToken();
    expect(new URLSearchParams(window.location.hash.slice(1)).get("invitationToken")).toBe("one-use-token");
    clearAcceptanceToken();
    expect(sessionStorage.getItem("projects:pending-acceptance")).toBeNull();
});
it("expires pending tokens after fifteen minutes without restoring them", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect(checkpointAcceptancePath(`${path}#invitationToken=one-use`, window.location.origin)).toBe(path);
    clock.mockReturnValue(1_000_000 + 15 * 60_000 + 1);
    window.history.replaceState(null, "", path);
    restoreAcceptanceToken();
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem("projects:pending-acceptance")).toBeNull();
});
it("does not change unrelated return hashes or retain malformed acceptance state", () => {
    expect(checkpointAcceptancePath("/?view=tasks#row-5", window.location.origin)).toBe("/?view=tasks#row-5");
    sessionStorage.setItem("projects:pending-acceptance", JSON.stringify({token: "invalid", extra: "unexpected"}));
    restoreAcceptanceToken();
    expect(sessionStorage.getItem("projects:pending-acceptance")).toBeNull();
});
