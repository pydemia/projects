import { getDesignMode } from "./design-modes";
import {
    resolveThemeSettings, resolveThemeTokens,
    type ThemeResolutionOptions,
} from "./design-mode-settings";

export function applyThemeToElement(
    element: HTMLElement,
    input: unknown,
    options: ThemeResolutionOptions = {},
): () => void {
    const { settings } = resolveThemeSettings(input, options);
    const properties = {
        ...resolveThemeTokens(settings, options),
        "color-scheme": settings.appearance,
        "font-family": "var(--font-ui)",
        // rem geometry belongs to the document, not a mode or its regional scope.
        "font-size": element === element.ownerDocument.documentElement
            ? "var(--type-root-size, 14px)" : "var(--type-body-size)",
        "line-height": "var(--type-body-leading)",
        color: "var(--foreground)",
    };
    const attributes = {
        "data-design": settings.design,
        "data-appearance": settings.appearance,
        "data-colormap": settings.colormap,
        "data-recipe": getDesignMode(settings.design).recipe,
    };
    const previousProperties = Object.keys(properties).map((name) => ({
        name, value: element.style.getPropertyValue(name),
        priority: element.style.getPropertyPriority(name),
    }));
    const previousAttributes = Object.keys(attributes).map((name) => ({
        name, value: element.getAttribute(name),
    }));
    const hadDark = element.classList.contains("dark");
    for (const [name, value] of Object.entries(properties)) {
        element.style.setProperty(name, value);
    }
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
    }
    element.classList.toggle("dark", settings.appearance === "dark");
    return () => {
        for (const { name, value, priority } of previousProperties) {
            if (value) element.style.setProperty(name, value, priority);
            else element.style.removeProperty(name);
        }
        for (const { name, value } of previousAttributes) {
            if (value === null) element.removeAttribute(name);
            else element.setAttribute(name, value);
        }
        element.classList.toggle("dark", hadDark);
    };
}
