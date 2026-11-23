import { z } from "zod";

const key = "projects:pending-acceptance";
const ttl = 15 * 60_000;
const pendingSchema = z.object({
    kind: z.enum(["invitation", "ownership"]), id: z.string().min(1), projectId: z.string(),
    revision: z.string().regex(/^(?:[1-9]\d*)?$/), token: z.string().min(1).max(512), at: z.number().int().nonnegative(),
}).strict();
function routeIdentity(url: URL) {
    const kind = url.searchParams.get("view") === "project-invitation" ? "invitation"
        : url.searchParams.get("view") === "ownership-accept" ? "ownership" : null;
    if (!kind) return null;
    const id = url.searchParams.get(kind === "invitation" ? "invitationId" : "ownershipId") ?? "";
    return {kind, id, projectId: kind === "ownership" ? url.searchParams.get("project") ?? "" : "", revision: url.searchParams.get("expectedRevision") ?? ""};
}
export function clearAcceptanceToken() {
    try {sessionStorage.removeItem(key);} catch { /* No pending token can be restored without storage. */ }
}
/** Preserve one explicit acceptance across sign-in; return a token-free HTTP destination. */
export function checkpointAcceptancePath(path: string, origin: string): string {
    const url = new URL(path, origin);
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (!fragment.has("invitationToken") && !fragment.has("ownershipToken")) return path;
    const identity = routeIdentity(url);
    const parsed = pendingSchema.safeParse({...identity, token: fragment.get(identity?.kind === "ownership" ? "ownershipToken" : "invitationToken"), at: Date.now()});
    clearAcceptanceToken();
    if (parsed.success) {
        try {sessionStorage.setItem(key, JSON.stringify(parsed.data));} catch { /* The original link remains the manual recovery path. */ }
    }
    fragment.delete("invitationToken"); fragment.delete("ownershipToken");
    url.hash = fragment.toString();
    return `${url.pathname}${url.search}${url.hash}`;
}
/** Only the matching authenticated acceptance screen can recover the pending token. */
export function restoreAcceptanceToken() {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return;
        const pending = pendingSchema.safeParse(JSON.parse(raw));
        if (!pending.success || Date.now() < pending.data.at || Date.now() - pending.data.at > ttl) {clearAcceptanceToken(); return;}
        const url = new URL(window.location.href);
        const identity = routeIdentity(url);
        if (!identity || identity.kind !== pending.data.kind || identity.id !== pending.data.id || identity.projectId !== pending.data.projectId || identity.revision !== pending.data.revision) return;
        const fragment = new URLSearchParams(url.hash.slice(1));
        const tokenKey = identity.kind === "ownership" ? "ownershipToken" : "invitationToken";
        if (!fragment.has(tokenKey)) {
            fragment.set(tokenKey, pending.data.token); url.hash = fragment.toString();
            window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }
    } catch {clearAcceptanceToken();}
}
