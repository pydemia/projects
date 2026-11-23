import { useLayoutEffect, useRef } from "react";
import { checkpointAcceptancePath } from "./acceptance-token";

export type AuthenticationMode = "password" | "microsoft";
type Checkpoint = () => boolean | void | Promise<boolean | void>;
export type RecoveryState = {
    phase: "idle" | "required" | "preparing" | "redirecting" | "blocked";
    reason?: "draft" | "loop";
};
type RecoveryEnvironment = {
    location: () => { href: string; origin: string };
    navigate: (url: string) => void;
    storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
    now: () => number;
    canNavigate: () => boolean;
    checkpointTimeout?: number;
};
const ATTEMPT_KEY = "projects:reauthentication-attempt";
const LOOP_WINDOW = 60_000;

/** Only local application destinations can be used after authentication. */
export function safeReturnPath(value: string, origin: string): string {
    if (!value || /[\\\u0000-\u0020\u007f]/.test(value) || value.startsWith("//")) return "/";
    try {
        const url = new URL(value, origin);
        if (url.origin !== origin || !/^https?:$/.test(url.protocol) || url.username || url.password) return "/";
        if (!value.startsWith("/") && !value.startsWith(`${origin}/`)) return "/";
        let path = url.pathname;
        for (let depth = 0; depth < 5; depth++) {
            if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(path)) return "/";
            if (/^\/(?:oauth2|api|assets|health)(?:\/|$)/i.test(path)) return "/";
            const decoded = decodeURIComponent(path);
            if (decoded === path) break;
            if (depth === 4) return "/";
            path = decoded;
        }
        if (url.searchParams.get("view") === "login") return "/";
        return `${url.pathname}${url.search}${url.hash}`;
    } catch { return "/"; }
}

export function authenticationReturnPath(location: {href: string; origin: string}): string {
    const url = new URL(location.href);
    return safeReturnPath(url.searchParams.get("view") === "login"
        ? url.searchParams.get("returnTo") ?? "/" : location.href, location.origin);
}

export function authenticationUrl(mode: AuthenticationMode, returnTo: string, origin: string): string {
    const path = checkpointAcceptancePath(safeReturnPath(returnTo, origin), origin);
    const localLogin = `/?${new URLSearchParams({view: "login", returnTo: path})}`;
    // oauth2-proxy validates its entire rd, including query/hash. A literal URL
    // in a search can contain //, which it rejects. The local return envelope
    // encodes these delimiters; authenticated bootstrap restores the exact URL.
    const proxyRejects = /[/\\](?:[\s\v]*|\.{1,2})[/\\]/.test(path);
    return mode === "microsoft" ? `/oauth2/start?${new URLSearchParams({rd: proxyRejects ? localLogin : path})}` : localLogin;
}

export function createReauthenticationController(environment: RecoveryEnvironment) {
    let state: RecoveryState = {phase: "idle"};
    let context: {mode: AuthenticationMode; userId: string} | null = null;
    let destination = "/";
    let sequence = 0;
    const subscribers = new Set<() => void>();
    const checkpoints = new Set<Checkpoint>();
    function publish(next: RecoveryState) {
        state = next;
        subscribers.forEach(notify => notify());
    }
    function recentAttempt() {
        try {
            const raw = environment.storage().getItem(ATTEMPT_KEY);
            if (!raw) return false;
            const attempt: unknown = JSON.parse(raw);
            if (!attempt || typeof attempt !== "object") return false;
            const previous = attempt as Record<string, unknown>;
            return previous.userId === context?.userId && previous.url === destination && typeof previous.at === "number"
                && environment.now() - previous.at >= 0 && environment.now() - previous.at < LOOP_WINDOW;
        } catch { return false; }
    }
    function required() {
        if (!context || state.phase !== "idle") return;
        destination = checkpointAcceptancePath(authenticationReturnPath(environment.location()), environment.location().origin);
        publish({phase: "required"});
    }
    async function run() {
        if (!context || state.phase !== "required") return;
        const currentSequence = ++sequence;
        const currentContext = context;
        if (recentAttempt()) { publish({phase: "blocked", reason: "loop"}); return; }
        publish({phase: "preparing"});
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const prepared = await Promise.race([
                Promise.all(Array.from(checkpoints, checkpoint => Promise.resolve().then(checkpoint)))
                    .then(results => results.every(result => result !== false)),
                new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), environment.checkpointTimeout ?? 8_000); }),
            ]);
            if (currentSequence !== sequence) return;
            if (!prepared) { publish({phase: "blocked", reason: "draft"}); return; }
            publish({phase: "redirecting"});
            if (!environment.canNavigate()) { publish({phase: "blocked", reason: "draft"}); return; }
            try {
                environment.storage().setItem(ATTEMPT_KEY, JSON.stringify({
                    userId: currentContext.userId, url: destination, at: environment.now(),
                }));
            } catch { /* A tab without storage can still log in if all draft checkpoints succeeded. */ }
            environment.navigate(authenticationUrl(currentContext.mode, destination, environment.location().origin));
        } catch {
            if (currentSequence === sequence) publish({phase: "blocked", reason: "draft"});
        } finally { clearTimeout(timer); }
    }
    return {
        captureDrafts: () => Promise.all(Array.from(checkpoints, checkpoint => Promise.resolve().then(checkpoint))).then(results => results.every(result => result !== false)),
        snapshot: () => state,
        subscribe: (notify: () => void) => { subscribers.add(notify); return () => { subscribers.delete(notify); }; },
        register: (checkpoint: Checkpoint) => { checkpoints.add(checkpoint); return () => { checkpoints.delete(checkpoint); }; },
        configure: (value: {mode: AuthenticationMode; userId: string} | null) => {
            sequence++;
            context = value;
            publish({phase: "idle"});
        },
        required,
        run,
        retry: () => {
            if (!context || state.phase !== "blocked") return;
            try { environment.storage().removeItem(ATTEMPT_KEY); } catch { /* In-memory retry remains available. */ }
            publish({phase: "idle"});
            required();
        },
    };
}

export const reauthentication = createReauthenticationController({
    location: () => window.location,
    navigate: url => window.location.assign(url),
    storage: () => window.sessionStorage,
    now: () => Date.now(),
    canNavigate: () => window.dispatchEvent(new Event("beforeunload", {cancelable: true})),
});

export function useReauthenticationCheckpoint(checkpoint: Checkpoint) {
    const latest = useRef(checkpoint);
    useLayoutEffect(() => { latest.current = checkpoint; });
    useLayoutEffect(() => reauthentication.register(() => latest.current()), []);
}
