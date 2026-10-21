import {
    useEffect, useId, useRef, useState, type ComponentProps,
    type KeyboardEvent, type ReactNode,
} from "react";
import { cn } from "./utils";

type AppShellProps = ComponentProps<"div"> & {
    appearance?: "framed" | "canvas";
};

function AppShell({
    appearance = "framed", className, ...props
}: AppShellProps) {
    if (!["framed", "canvas"].includes(appearance)) {
        throw new RangeError("AppShell appearance is not supported.");
    }

    return (
        <div
            data-ui="app-shell"
            data-appearance={appearance}
            className={cn(
                "@container relative flex min-h-0 w-full flex-col overflow-hidden " +
                "bg-background text-foreground",
                appearance === "framed" && "rounded-sm border border-border",
                appearance === "canvas" && "rounded-none border-0",
                className,
            )}
            {...props}
        />
    );
}

function AppHeader({ className, ...props }: ComponentProps<"header">) {
    return (
        <header
            data-ui="app-header"
            className={cn(
                "flex min-h-12 items-center gap-[var(--space-3)] " +
                "border-b border-border bg-surface px-[var(--space-4)]",
                className,
            )}
            {...props}
        />
    );
}

function AppBody({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            className={cn("flex min-h-0 flex-1 flex-col @3xl:flex-row", className)}
            {...props}
        />
    );
}

type AppSidebarProps = ComponentProps<"aside"> & {
    "aria-label": string;
    side?: "left" | "right";
    appearance?: "attached" | "inset";
};

function AppSidebar({
    side = "left",
    appearance = "attached",
    className,
    ...props
}: AppSidebarProps) {
    if (appearance !== "attached" && appearance !== "inset") {
        throw new RangeError("AppSidebar appearance is not supported.");
    }

    return (
        <aside
            data-ui="app-sidebar"
            data-appearance={appearance}
            className={cn(
                "min-w-0 p-[var(--space-3)] @3xl:w-52 @3xl:shrink-0",
                appearance === "attached" &&
                    "border-b border-border bg-surface-subtle @3xl:border-b-0",
                appearance === "attached" &&
                    (side === "left" ? "@3xl:border-r" : "@3xl:border-l"),
                appearance === "inset" &&
                    "m-[var(--space-3)] rounded-sm border border-border " +
                    "bg-surface shadow-[var(--shadow-float)]",
                className,
            )}
            {...props}
            data-slot={appearance === "inset" ? "surface-panel" : undefined}
        />
    );
}

type AppMainProps = Omit<ComponentProps<"main">, "ref"> & {
    as?: "main" | "div";
};

function AppMain({ as: Element = "main", className, ...props }: AppMainProps) {
    return (
        <Element
            data-ui="app-main"
            className={cn("min-w-0 flex-1 p-[var(--space-4)]", className)}
            {...props}
        />
    );
}

type NamedSectionProps = ComponentProps<"section"> & {
    "aria-label": string;
};

type AppBottomPanelProps = NamedSectionProps & {
    appearance?: "attached" | "inset";
};

function AppBottomPanel({
    appearance = "attached", className, ...props
}: AppBottomPanelProps) {
    if (appearance !== "attached" && appearance !== "inset") {
        throw new RangeError("AppBottomPanel appearance is not supported.");
    }

    return (
        <section
            data-appearance={appearance}
            className={cn(
                "min-w-0 bg-surface p-[var(--space-3)]",
                appearance === "attached" && "border-t border-border",
                appearance === "inset" &&
                    "m-[var(--space-3)] rounded-sm border border-border " +
                    "shadow-[var(--shadow-float)]",
                className,
            )}
            {...props}
            data-slot={appearance === "inset" ? "surface-panel" : undefined}
        />
    );
}

type AppFloatingPanelProps = NamedSectionProps & {
    side?: "left" | "right";
};

function AppFloatingPanel({
    side = "right",
    className,
    ...props
}: AppFloatingPanelProps) {
    return (
        <section
            className={cn(
                "absolute bottom-[var(--space-4)] z-10 max-w-[calc(100%-2rem)] " +
                "rounded-sm border border-border bg-surface " +
                "p-[var(--space-3)] shadow-[var(--shadow-float)]",
                side === "left" ? "left-[var(--space-4)]" : "right-[var(--space-4)]",
                className,
            )}
            {...props}
            data-slot="surface-panel"
        />
    );
}

type AppFloatingBubbleProps = ComponentProps<"button"> & {
    "aria-label": string;
    appearance?: "circle" | "pill";
    side?: "left" | "right";
};

function AppFloatingBubble({
    appearance = "circle",
    side = "right",
    type = "button",
    className,
    ...props
}: AppFloatingBubbleProps) {
    if (!["circle", "pill"].includes(appearance)) {
        throw new RangeError("AppFloatingBubble appearance is not supported.");
    }

    return (
        <button
            type={type}
            data-appearance={appearance}
            className={cn(
                "absolute bottom-[var(--space-4)] z-10 grid h-10 " +
                "place-items-center rounded-full border border-border " +
                "bg-accent text-accent-foreground " +
                "shadow-[var(--shadow-float)]",
                appearance === "circle" && "w-10",
                appearance === "pill" && "min-w-10 px-4",
                side === "left" ? "left-[var(--space-4)]" : "right-[var(--space-4)]",
                className,
            )}
            {...props}
            data-slot="app-help-trigger"
        />
    );
}

type AppFloatingDisclosureProps = {
    label: string;
    children: ReactNode;
    triggerContent?: ReactNode;
    side?: "left" | "right";
    appearance?: "circle" | "pill";
    closeLabel?: string;
    bubbleClassName?: string;
    panelClassName?: string;
};

function AppFloatingDisclosure({
    label,
    children,
    triggerContent,
    side = "right",
    appearance = "circle",
    closeLabel = "닫기",
    bubbleClassName,
    panelClassName,
}: AppFloatingDisclosureProps) {
    const panelId = useId();
    const bubble = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLElement>(null);
    const [open, setOpen] = useState(false);

    if (!label.trim() || !closeLabel.trim()) {
        throw new Error("AppFloatingDisclosure needs button labels.");
    }

    useEffect(() => {
        if (!open) return;
        function outside(event: Event) {
            const target = event.target as Node;
            if (!bubble.current?.contains(target) &&
                !panel.current?.contains(target)) {
                setOpen(false);
            }
        }
        document.addEventListener("pointerdown", outside);
        document.addEventListener("focusin", outside);
        return () => {
            document.removeEventListener("pointerdown", outside);
            document.removeEventListener("focusin", outside);
        };
    }, [open]);

    function closePanel() {
        setOpen(false);
        bubble.current?.focus({ preventScroll: true });
    }

    function handleEscape(event: KeyboardEvent) {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        closePanel();
    }

    return <>
        <AppFloatingBubble ref={bubble} side={side}
            appearance={appearance} aria-label={label}
            aria-expanded={open} aria-controls={panelId}
            className={bubbleClassName}
            onClick={() => setOpen((value) => !value)}
            onKeyDown={handleEscape}>
            {triggerContent ?? (appearance === "pill" ? label : "?")}
        </AppFloatingBubble>
        <AppFloatingPanel ref={panel} id={panelId} side={side}
            aria-label={label} hidden={!open}
            onKeyDown={handleEscape}
            className={cn(
                "bottom-[calc(var(--space-4)+2.5rem+var(--space-2))] " +
                "max-h-[calc(100%-6rem)] w-72 overflow-y-auto text-sm",
                panelClassName,
            )}>
            {children}
            <button type="button" data-slot="surface-action"
                onClick={closePanel}
                className={
                    "mt-3 rounded-sm border border-border bg-surface " +
                    "px-3 py-1.5 text-sm hover:bg-surface-subtle " +
                    "focus-visible:outline-2 focus-visible:outline-focus"
                }>
                {closeLabel}
            </button>
        </AppFloatingPanel>
    </>;
}

export {
    AppShell, AppHeader, AppBody, AppSidebar, AppMain, AppBottomPanel,
    AppFloatingPanel, AppFloatingBubble, AppFloatingDisclosure,
};
export type {
    AppShellProps, AppMainProps, AppSidebarProps, AppBottomPanelProps,
    AppFloatingPanelProps, AppFloatingBubbleProps,
    AppFloatingDisclosureProps,
};
