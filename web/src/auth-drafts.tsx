import { createContext, useContext, useRef, type ReactNode } from "react";
import { z } from "zod";
import { useReauthenticationCheckpoint } from "./reauthentication";

const RecoveryOwner = createContext<string | null>(null);
export type AuthenticationDraft<T> = {restored: T | null; clear: () => void};

export function AuthRecoveryProvider({ userId, children }: {userId: string; children: ReactNode}) {
    return <RecoveryOwner.Provider key={userId} value={userId}>{children}</RecoveryOwner.Provider>;
}

function storageKey(owner: string, key: string) {
    return `projects:authentication-draft:${encodeURIComponent(owner)}:${encodeURIComponent(key)}`;
}

// Each caller supplies a strict schema containing only its editable business fields.
// Read once before state initialization; never submit or rebase a recovered draft.
export function useAuthenticationDraft<T>(key: string, schema: z.ZodType<T>, snapshot: () => NoInfer<T> | null): AuthenticationDraft<T> {
    const owner = useContext(RecoveryOwner);
    const envelope = z.object({ owner: z.string(), value: schema }).strict();
    const initial = useRef<{owner: string | null; key: string; value: T | null} | null>(null);
    if (!initial.current || initial.current.owner !== owner || initial.current.key !== key) {
        let value: T | null = null;
        if (owner) {
            try {
                const raw = sessionStorage.getItem(storageKey(owner, key));
                if (raw) {
                    const parsed = envelope.safeParse(JSON.parse(raw));
                    if (parsed.success && parsed.data.owner === owner) value = parsed.data.value;
                }
            } catch { /* Invalid or unavailable recovery storage never triggers a write. */ }
        }
        initial.current = {owner, key, value};
    }
    useReauthenticationCheckpoint(() => {
        if (!owner) return true;
        try {
            const value = snapshot();
            if (value === null) {
                try {sessionStorage.removeItem(storageKey(owner, key));}
                catch { /* No active input needs preservation when recovery storage is disabled. */ }
            } else sessionStorage.setItem(storageKey(owner, key), JSON.stringify(envelope.parse({owner, value})));
            return true;
        } catch { return false; }
    });
    function clear() {
        if (initial.current) initial.current.value = null;
        if (!owner) return;
        try { sessionStorage.removeItem(storageKey(owner, key)); } catch { /* A later checkpoint retries removal. */ }
    }
    return {restored: initial.current.value, clear};
}
