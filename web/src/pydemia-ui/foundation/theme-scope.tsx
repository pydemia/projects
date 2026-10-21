import {
    useCallback, useInsertionEffect, useLayoutEffect, useRef, useState,
    type ComponentProps,
} from "react";
import { applyThemeToElement } from "./theme-dom";
import { PortalScope } from "./portal-scope";
import type { ThemeSettings } from "./design-modes";
import type { ThemeResolutionOptions } from "./design-mode-settings";

export type ThemeScopeProps = ComponentProps<"div"> & {
    settings?: Partial<ThemeSettings>;
    options?: ThemeResolutionOptions;
};

export function ThemeScope({
    settings, options, children, ref, ...props
}: ThemeScopeProps) {
    const elementRef = useRef<HTMLDivElement>(null);
    const setElementRef = useCallback((element: HTMLDivElement | null) => {
        elementRef.current = element;
        if (typeof ref === "function") return ref(element);
        if (ref) ref.current = element;
    }, [ref]);
    const [host] = useState(() => {
        if (typeof document === "undefined") return null;
        const portalHost = document.createElement("div");
        portalHost.setAttribute("data-theme-portal", "");
        applyThemeToElement(portalHost, settings, options);
        return portalHost;
    });
    useInsertionEffect(() => {
        if (!host) return;
        host.ownerDocument.body.appendChild(host);
        return () => {
            // Remove after React has detached the portal children in this commit.
            queueMicrotask(() => host.remove());
        };
    }, [host]);
    useLayoutEffect(() => {
        const restoreElement = applyThemeToElement(
            elementRef.current!, settings, options,
        );
        const restoreHost = host
            ? applyThemeToElement(host, settings, options) : undefined;
        return () => {
            restoreElement();
            restoreHost?.();
        };
    }, [host, settings, options, props.className, props.style]);
    return (
        <div {...props} ref={setElementRef}>
            <PortalScope container={host ?? undefined}>
                {children}
            </PortalScope>
        </div>
    );
}
