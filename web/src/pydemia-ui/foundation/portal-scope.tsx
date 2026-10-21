import {
    createContext, useContext, useLayoutEffect, useState, type ReactNode,
} from "react";

export type PortalContainer = Element | DocumentFragment | null;
export type PortalScopeProps = {
    container?: PortalContainer;
    children?: ReactNode;
};
const PortalContext = createContext<PortalContainer | undefined>(undefined);

export function PortalScope({ container, children }: PortalScopeProps) {
    const parent = useContext(PortalContext);
    return (
        <PortalContext.Provider value={container === undefined ? parent : container}>
            {children}
        </PortalContext.Provider>
    );
}

// An explicit null requests Radix's default body, even inside a scope.
export function usePortalContainer(container?: PortalContainer) {
    const scoped = useContext(PortalContext);
    const [mounted, setMounted] = useState(false);
    // Match Radix Portal SSR output before selecting a custom container.
    useLayoutEffect(() => setMounted(true), []);
    if (!mounted) return undefined;
    return container === undefined ? scoped : container;
}
